import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './d1.mjs';
import * as errors from '../functions/api/player-errors.js';
import * as status from '../functions/api/player-status.js';
import {saveHealth,readHealth,mappedHealth} from '../functions/_lib/playback-health.js';
const request=(body,path='player-errors')=>new Request(`https://test.invalid/api/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const event=(id,side='left')=>({id,store:'store-a',deviceId:'device-a',errorCode:'LV-MEDIA-SESSION-SKIP',message:'failed',level:'warning',extra:{side,fileName:'same.mp4'}});
const health=(sequence=1,deviceId='device-a',bootSequence=1,sessionId='session-a')=>({store:'store-a',deviceId,sessionId,bootSequence,sequence,heartbeatMs:300000,left:{status:'playing'},right:{status:'playing'}});
test('missing database returns explicit failure',async()=>{const res=await errors.onRequestPost({request:request(event('a')),env:{}});assert.equal(res.status,503);assert.equal((await res.json()).ok,false)});
test('new schema is created once on write; never during normal GET',async()=>{
  const env=database();const get=()=>errors.onRequestGet({request:new Request('https://test.invalid/api/player-errors?store=store-a'),env});
  await get();assert.equal(env.DB.history.filter(x=>/CREATE|ALTER/.test(x)).length,0);
  await errors.onRequestPost({request:request(event('a')),env});const count=env.DB.history.filter(x=>/CREATE|ALTER/.test(x)).length;
  await errors.onRequestPost({request:request(event('b')),env});await get();assert.equal(env.DB.history.filter(x=>/CREATE|ALTER/.test(x)).length,count);
});
test('retransmission is idempotent and left/right occurrences remain distinct',async()=>{
  const env=database();await errors.onRequestPost({request:request({errors:[event('a'),event('b','right')]}),env});await errors.onRequestPost({request:request(event('a')),env});
  const res=await errors.onRequestGet({request:new Request('https://test.invalid/api/player-errors?store=store-a'),env});const data=await res.json();assert.equal(data.errors.length,2);assert.deepEqual(new Set(data.errors.map(e=>e.extra.side)),new Set(['left','right']));
});
test('per-entry acknowledgement reports partial validity exactly',async()=>{
  const env=database();const res=await errors.onRequestPost({request:request({errors:[event('a'),{...event('b'),store:''}]}),env});const data=await res.json();assert.deepEqual(data.acknowledged,['a']);assert.equal(data.rejected.length,1);
});
test('database failure is not acknowledged as a saved log',async()=>{
  const env={DB:{batch:async()=>{throw new Error('database unavailable')},prepare:()=>({bind(){return this}})}};
  const res=await errors.onRequestPost({request:request(event('a')),env});assert.equal(res.status,503);assert.equal((await res.json()).ok,false);
});
test('event lookup isolates stores and devices',async()=>{
  const env=database();await errors.onRequestPost({request:request({errors:[event('a'),{...event('b'),deviceId:'device-b'},{...event('c'),store:'store-b'}]}),env});
  const res=await errors.onRequestGet({request:new Request('https://test.invalid/api/player-errors?store=store-a&deviceId=device-a'),env});assert.equal((await res.json()).errors.length,1);
});
test('out-of-order health never replaces a newer report',async()=>{
  const env=database();await saveHealth(env,health(3));await saveHealth(env,{...health(2),left:{status:'fallback'}});const result=await readHealth(env,'store-a');assert.equal(result.devices[0].sequence,3);assert.equal(result.devices[0].status,'healthy');
});
test('new boot supersedes old session, old pending reports cannot overwrite it',async()=>{
  const env=database();await saveHealth(env,health(10));env.DB.sqlite.exec("UPDATE player_status SET received_at='2000-01-01T00:00:00.000Z'");await saveHealth(env,health(1,'device-a',2,'session-b'));await saveHealth(env,health(20));assert.equal((await readHealth(env)).devices[0].sessionId,'session-b');
});
test('two physical devices in one store retain independent lane states',async()=>{
  const env=database();await saveHealth(env,health(1,'device-a'));await saveHealth(env,{...health(1,'device-b'),right:{status:'fallback'}});const result=await readHealth(env,'store-a');assert.equal(result.devices.length,2);assert.deepEqual(new Set(result.devices.map(d=>d.status)),new Set(['healthy','degraded']));
});
test('deliberate black mode is not reported as a playback fault',async()=>{
  const env=database();await saveHealth(env,{...health(),blackMode:true,left:{status:'paused'},right:{status:'paused'}});assert.equal((await readHealth(env)).devices[0].status,'black-mode');
});
test('stale previously healthy status is shown as unknown freshness',()=>{
  const now=Date.now();const row={device_id:'d',store:'s',received_at:new Date(now-2500000).toISOString(),payload_json:JSON.stringify(health())};assert.equal(mappedHealth(row,now).status,'stale');
});
test('invalid JSON gets a client error',async()=>{
  const env=database();const res=await status.onRequestPost({env,request:new Request('https://test.invalid',{method:'POST',body:'not json'})});assert.equal(res.status,400);
});
