import test from 'node:test';import assert from 'node:assert/strict';
import {database} from './d1.mjs';import {inspect,saveIntegrity,attachIntegrity} from '../functions/_lib/asset-integrity.js';
import * as api from '../functions/api/content-integrity.js';import {sanitizeHealth} from '../functions/_lib/playback-health.js';
import {isScheduleActiveAt} from '../functions/_lib/localvision-core.js';
function env(){const e=database();e.DB.sqlite.exec("CREATE TABLE contents(id TEXT PRIMARY KEY,url TEXT,r2_key TEXT,file_name TEXT,store TEXT,side TEXT,status TEXT)");e.DB.sqlite.exec("INSERT INTO contents VALUES('a','https://cdn/a','a.mp4','a.mp4','qa','left','사용중'),('b','https://cdn/b','b.mp4','b.mp4','other','left','사용중'),('c','https://cdn/c','c.mp4','c.mp4','_common','right','사용중')");e.MEDIA={get:async()=>({body:new Blob(['media']).stream(),size:5})};return e;}
const req=body=>new Request('https://cms.test/api/content-integrity',{method:'POST',body:JSON.stringify(body)});
test('old schema read stays read-only; write migrates and manifest survives lookup',async()=>{
 const e=env();const items=[{id:'a',url:'https://cdn/a'}];await attachIntegrity(e,items);assert.equal(e.DB.history.some(x=>x.includes('CREATE')),false);
 const m=await inspect(new Blob(['media']).stream());await saveIntegrity(e,'a',items[0].url,m);await attachIntegrity(e,items);assert.equal(items[0].integrity.revision,m.revision);
});
test('metadata is bound to content ID and exact URL',async()=>{
 const e=env(),m=await inspect(new Blob(['media']).stream());await saveIntegrity(e,'a','https://cdn/a',m);const items=[{id:'a',url:'https://cdn/replaced'},{id:'b',url:'https://cdn/a'}];await attachIntegrity(e,items);assert.ok(items.every(x=>!x.integrity));
});
test('backfill is idempotent, scoped, and does not modify original media',async()=>{
 const e=env();let reads=0;e.MEDIA.get=async()=>{reads++;return {body:new Blob(['media']).stream(),size:5}};
 let res=await api.onRequestPost({env:e,request:req({store:'qa',id:'a'})});assert.equal(res.status,200);
 res=await api.onRequestPost({env:e,request:req({store:'qa',id:'a'})});assert.equal((await res.json()).alreadyVerified,true);assert.equal(reads,1);
 res=await api.onRequestPost({env:e,request:req({store:'qa',id:'b'})});assert.equal(res.status,404);
 const list=await (await api.onRequestGet({env:e,request:new Request('https://cms.test/api/content-integrity?store=qa')})).json();assert.equal(list.total,2);assert.equal(list.verified,1);assert.equal(list.items[0].id,'c');
});
test('R2 missing source is never marked verified',async()=>{
 const e=env();e.MEDIA.get=async()=>null;const res=await api.onRequestPost({env:e,request:req({store:'qa',id:'a'})});assert.equal(res.status,404);const items=[{id:'a',url:'https://cdn/a'}];await attachIntegrity(e,items);assert.equal(items[0].integrity,undefined);
});
test('database error is propagated rather than treated as legacy metadata',async()=>{
 const e={DB:{prepare(){return {bind(){return this},all(){throw new Error('D1 overload')}}}}};await assert.rejects(attachIntegrity(e,[{id:'a'}]),/overload/);
});
test('delivery health preserves stages and distinguishes verified from legacy',()=>{
 const value=sanitizeHealth({delivery:{phase:'blocked',verified:2,legacy:3,completed:5,total:6,error:'hash mismatch',prefetch:{phase:'ready',group:'점심',at:'2026-09-10T02:00:00Z',total:7,completed:7}}});
 assert.equal(value.delivery.legacy,3);assert.equal(value.delivery.error,'hash mismatch');assert.equal(value.delivery.prefetch.phase,'ready');
});
test('overnight schedules use the weekday on which the interval starts',()=>{
 const schedule={days:[1],startTime:'22:00',endTime:'02:00',enabled:true};
 assert.equal(isScheduleActiveAt(schedule,new Date('2026-09-07T16:00:00Z')),true); // Tue 01:00 KST, Monday interval
 assert.equal(isScheduleActiveAt(schedule,new Date('2026-09-06T16:00:00Z')),false); // Mon 01:00, Sunday is not enabled
});
test('upload publishes a content row only with persisted integrity; snapshot carries it',async()=>{
 const {onRequestPost}=await import('../functions/api/upload.js');const {makePlaylistSnapshot}=await import('../functions/_lib/localvision-core.js');
 const e=database();const objects=new Map();e.MEDIA={put:async(key,body)=>{const bytes=typeof body==='string'?body:await new Response(body).text();objects.set(key,bytes);return {key}},get:async()=>null};
 const form=new FormData();form.set('file',new File(['media'],'image.png',{type:'image/png'}));form.set('title','test');form.set('store','qa');form.set('side','left');
 const request=new Request('https://cms.test/api/upload',{method:'POST',body:form});
 const response=await onRequestPost({request,env:e});assert.equal(response.status,200);const data=await response.json();assert.ok(data.content.integrity.revision);
 const snap=await makePlaylistSnapshot(new Request('https://cms.test'),e,'qa');assert.equal(snap.playlists.left[0].integrity.revision,data.content.integrity.revision);
 assert.ok(e.DB.history.findIndex(x=>x.includes('INSERT INTO asset_integrity'))<e.DB.history.findIndex(x=>/INSERT INTO contents/.test(x)));
});
