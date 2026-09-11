import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './d1.mjs';
import {saveHealth,saveEvents,readHealth} from '../functions/_lib/playback-health.js';
import {onRequestPost as heartbeat} from '../functions/api/heartbeat.js';
import {onRequestPatch as nativeHeartbeat} from '../functions/api/devices.js';
import {json,onlineTtlSec} from '../functions/_lib/localvision-core.js';
import {onRequest as middleware} from '../functions/_middleware.js';
const RealDate=Date;
function clock(t){let now=t;globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}};return {set:t=>now=t,restore:()=>globalThis.Date=RealDate};}
function env(){const e=database();e.DB.sqlite.exec(`CREATE TABLE devices (id TEXT PRIMARY KEY,store TEXT,name TEXT,role TEXT,online INTEGER,last_seen TEXT,app TEXT,device_code TEXT,last_command TEXT,command_at TEXT,created_at TEXT,updated_at TEXT);CREATE INDEX idx_devices_store ON devices(store)`);return e;}
const health=(i,sequence=1)=>({store:`s${i}`,deviceId:`device${i}`,sessionId:'boot1',bootSequence:1,sequence,heartbeatMs:300000,left:{status:'playing'},right:{status:'playing'}});
const req=(body,path='heartbeat')=>new Request(`https://test/api/${path}`,{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}});
test('200 TVs / 24 hours: bounded presence, health and error writes under an error storm',async()=>{
 const time=clock(RealDate.parse('2026-09-12T00:00:00Z'));const e=env();const counts={presence:0,health:0,events:0};
 const prepare=e.DB.prepare.bind(e.DB);e.DB.prepare=sql=>{const s=prepare(sql),run=s.run;s.run=async()=>{const r=await run();if(/^\s*(INSERT|UPDATE)/.test(sql)){const key=/player_status/.test(sql)?'health':/player_events/.test(sql)?'events':/devices/.test(sql)?'presence':null;if(key)counts[key]+=r.meta.changes;}return r;};return s;};
 try{
  for(let slot=0;slot<96;slot++){
   time.set(RealDate.parse('2026-09-12T00:00:00Z')+slot*900000);
   for(let i=0;i<200;i++){
    const response=await heartbeat({env:e,request:req({store:`s${i}`,playerVersion:`test-${slot%2}`,playStatus:slot%2?'playing':'degraded',health:health(i,slot+1)})});assert.equal(response.status,200);
   }
  }
  for(let i=0;i<200;i++)for(let batch=0;batch<2;batch++){
   const result=await saveEvents(e,Array.from({length:40},(_,j)=>({id:`e${i}-${batch}-${j}`,store:`s${i}`,deviceId:`device${i}`,message:'repeated decoder fault'})));
   assert.equal(result.acknowledged.length,40);
  }
  assert.deepEqual(counts,{presence:19200,health:9600,events:4800});
  // Conservative model, NOT Cloudflare billing measurement: allow 2/3/4 row writes respectively.
  const estimated=counts.presence*2+counts.health*3+counts.events*4;
  assert.equal(estimated,86400);assert.ok(estimated<100000);
  console.log('CAPACITY_MODEL',JSON.stringify({TVs:200,hours:24,actualSQLiteRowChanges:counts,conservativeEstimatedD1Writes:estimated,freeDailyLimit:100000,remainingForOtherWork:100000-estimated}));
 }finally{time.restore();e.DB.sqlite.close();}
});
test('app/phase changes and native shell heartbeats cannot bypass the time guard or run schema repair',async()=>{
 const e=env();await heartbeat({env:e,request:req({store:'s0',health:health(0)})});
 const before=e.DB.sqlite.prepare('SELECT total_changes() AS n').get().n;e.DB.history.length=0;
 for(let i=0;i<60;i++){
  await heartbeat({env:e,request:req({store:'s0',playerVersion:`v${i}`,health:{...health(0,i+2),bootSequence:i+2}})});
  await nativeHeartbeat({env:e,request:req({store:'s0',online:true,app:`shell${i}`},'devices')});
 }
 assert.equal(e.DB.sqlite.prepare('SELECT total_changes() AS n').get().n,before);
 assert.equal(e.DB.history.some(s=>/CREATE|ALTER|DELETE/.test(s)),false);
});
test('parallel heartbeats update one canonical device once, preserving duplicate rows and commands',async()=>{
 const e=env();await heartbeat({env:e,request:req({store:'s0'})});
 e.DB.sqlite.exec("UPDATE devices SET last_seen='2000-01-01T00:00:00Z',last_command='refresh';INSERT INTO devices SELECT 'old_s0',store,name,role,online,last_seen,app,device_code,last_command,command_at,created_at,updated_at FROM devices");
 const before=e.DB.sqlite.prepare('SELECT total_changes() AS n').get().n;
 await Promise.all(Array.from({length:20},()=>heartbeat({env:e,request:req({store:'s0',playerVersion:'new'})})));
 assert.equal(e.DB.sqlite.prepare('SELECT total_changes() AS n').get().n-before,1);
 assert.equal(e.DB.sqlite.prepare("SELECT last_seen FROM devices WHERE id='old_s0'").get().last_seen,'2000-01-01T00:00:00Z');
 assert.equal(e.DB.sqlite.prepare("SELECT last_command FROM devices WHERE id='tv_s0'").get().last_command,'refresh');
});
test('health boot changes are deferred within the window and applied after it; no immediate write loophole',async()=>{
 const time=clock(RealDate.parse('2026-09-12T00:00:00Z')),e=env();
 try{await saveHealth(e,health(0));await saveHealth(e,{...health(0),bootSequence:2,sessionId:'boot2'});assert.equal((await readHealth(e)).devices[0].sessionId,'boot1');
 time.set(Date.now()+1800000);await saveHealth(e,{...health(0),bootSequence:2,sessionId:'boot2'});await saveHealth(e,health(0,500));assert.equal((await readHealth(e)).devices[0].sessionId,'boot2');}finally{time.restore();}
});
test('quota errors are machine readable; historical quota logs do not trigger false alarms',async()=>{
 const error="D1_ERROR: Your account has exceeded D1's free tier daily row write limit";
 const a=json({ok:false,error});assert.equal(a.status,503);assert.equal(a.headers.get('retry-after'),'900');assert.equal((await a.json()).errorCode,'LV-D1-QUOTA');
 assert.equal(json({ok:true,errors:[{message:error}]}).status,200);
 assert.equal(json({ok:true,degraded:true,diagnostics:[error]}).status,503);
 const b=await middleware({request:new Request('https://test/api/devices'),next:async()=>{throw new Error(error)}});assert.equal((await b.json()).errorCode,'LV-D1-QUOTA');
 assert.ok(onlineTtlSec({ONLINE_TTL_SEC:60})>=2400);
});
