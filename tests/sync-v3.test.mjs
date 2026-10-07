import test from 'node:test'
import assert from 'node:assert/strict'
import {database} from './d1.mjs'
import {installSync,sync,NORMAL_MS,statements,triggers,publishOne} from '../functions/_lib/sync-v3.js'
import {ensureCoreSchema,normalizeTargetMode,isContentAllowedForStore} from '../functions/_lib/localvision-core.js'
import {reserve,finishReservation,releaseReservation} from '../functions/_lib/storage-v3.js'
import * as screenshot from '../functions/api/screenshots.js'
import * as fullBackup from '../functions/api/full-backup.js'
import {createAdminSession} from '../functions/_lib/auth.js'
const T=Date.parse('2026-10-07T00:00:00Z')
const req=b=>new Request('https://cms.test/api/player-sync',{method:'POST',body:JSON.stringify(b)})
const packet=(seq=1,extra={})=>({store:'s',installation:'installation_01',boot:'boot-one',previousGeneration:0,generation:1,seq,stateRevision:0,version:'1:1',summary:{playerVersion:'v3.0.0',version:'1:1',left:{status:'playing'},right:{status:'playing'},faults:[]},...extra})
async function fixture(){
 const env=database();await ensureCoreSchema(env)
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS black_modes(store TEXT PRIMARY KEY,immediate_active INTEGER DEFAULT 0,immediate_until TEXT DEFAULT '',schedule_enabled INTEGER DEFAULT 0,schedule_days_json TEXT DEFAULT '[]',schedule_start TEXT DEFAULT '00:00',schedule_end TEXT DEFAULT '23:59',message TEXT DEFAULT '',updated_at TEXT DEFAULT '')`).run()
 await env.DB.prepare("INSERT INTO stores(id,slug,name) VALUES('s','s','S')").run();await installSync(env)
 env.DB.sqlite.exec("UPDATE lv_publications SET published=revision,object_key='sealed'")
 env.MEDIA=new Proxy({}, {get:(_,key)=>{throw new Error(`Regular sync touched R2.${key}`)}})
 return env
}
async function send(env,b,now=T){const r=await sync(req(b),env,now);return {status:r.status,...await r.json()}}
const changes=env=>Number(env.DB.sqlite.prepare('SELECT total_changes() AS n').get().n)
test('5/10/15 minute unchanged sync: zero writes, zero R2, three indexed small reads; 20 minute saves',async()=>{
 const env=await fixture();assert.equal((await send(env,packet())).written,true)
 for(let i=1;i<=3;i++){const before=changes(env),sql=env.DB.history.length;const r=await send(env,packet(i+1),T+i*300000);assert.equal(r.reason,'read-only');assert.equal(changes(env),before);assert.equal(env.DB.history.length-sql,3);assert.equal(r.manifests,null)}
 const r=await send(env,packet(5),T+NORMAL_MS);assert.equal(r.reason,'normal-20min');assert.equal(r.written,true)
})
test('first/quarantine/recovery are immediate, repeated counts wait for normal save; duplicate is idempotent',async()=>{
 const env=await fixture();await send(env,packet())
 const f={assetId:'left2',assetVersion:'v1',side:'left',fileName:'left_2.mp4',episode:'e',firstAt:'19:03:12',lastAt:'19:03:12',status:'fault',count:1}
 let b=packet(2,{stateRevision:1,summary:{...packet().summary,faults:[f]}});assert.equal((await send(env,b,T+1000)).reason,'important')
 const before=changes(env);assert.equal((await send(env,b,T+2000)).written,false);assert.equal(changes(env),before)
 b=packet(3,{stateRevision:2,summary:{...b.summary,faults:[{...f,status:'excluded',count:2}]}});assert.equal((await send(env,b,T+3000)).written,true)
 b=packet(4,{stateRevision:3,summary:{...b.summary,faults:[{...f,status:'excluded',count:20}]}});assert.equal((await send(env,b,T+300000)).written,false)
 b=packet(5,{stateRevision:4,summary:{...b.summary,faults:[{...f,status:'recovered',count:20,recoveredAt:'19:07:24'}]}});assert.equal((await send(env,b,T+400000)).written,true)
 await send(env,packet(4,{stateRevision:3,summary:{...b.summary,faults:[f]}}),T+500000)
 const row=env.DB.sqlite.prepare('SELECT * FROM lv_runtime').get();assert.equal(JSON.parse(row.summary_json).faults[0].status,'recovered');assert.equal(row.normal_at,T)
})
test('new boot gets server generation; duplicate boot is safe; delayed old boot cannot replace it',async()=>{
 const env=await fixture();await send(env,packet())
 const b=packet(1,{boot:'boot-two',previousGeneration:1,generation:0});const r=await send(env,b,T+1000);assert.equal(r.generation,2)
 assert.equal((await send(env,{...b,generation:2},T+2000)).written,false)
 assert.equal((await send(env,packet(99),T+3000)).status,409)
 assert.equal(env.DB.sqlite.prepare('SELECT generation FROM lv_runtime').get().generation,2)
})
test('bounded important reserve does not hide active faults; 20 minute normal snapshot includes latest',async()=>{
 const env=await fixture();await send(env,packet());let pending=0
 for(let i=1;i<=50;i++){const r=await send(env,packet(i+1,{stateRevision:i,summary:{...packet().summary,faults:[{assetId:'bad',episode:'e',side:'left',status:i%2?'fault':'excluded',count:i}]}}),T+i*1000);pending+=r.pendingBudget?1:0}
 assert.ok(pending>0);assert.equal(env.DB.sqlite.prepare('SELECT important_count FROM lv_runtime').get().important_count,30)
 const r=await send(env,packet(52,{stateRevision:51,summary:{...packet().summary,faults:[{assetId:'bad',episode:'e',status:'excluded',count:51}]}}),T+NORMAL_MS)
 assert.equal(r.written,true);assert.equal(JSON.parse(env.DB.sqlite.prepare('SELECT summary_json FROM lv_runtime').get().summary_json).faults[0].count,51)
})
test('fault overflow and oversize packet fail explicitly; prior state survives',async()=>{
 const env=await fixture();await send(env,packet());const before=changes(env)
 assert.equal((await send(env,packet(2,{summary:{faults:Array.from({length:101},(_,i)=>({assetId:String(i)}))}}))).status,422)
 assert.equal((await send(env,packet(3,{junk:'x'.repeat(65537)}))).status,413);assert.equal(changes(env),before)
})
test('right selected-empty and unknown viewer never become global permission',()=>{assert.equal(normalizeTargetMode('selected',[]),'selected');assert.equal(isContentAllowedForStore({side:'right',targetMode:'selected',targetStores:['s']},''),false);assert.equal(isContentAllowedForStore({side:'right',targetMode:'selected',targetStores:[]},'s'),false)})
test('deletion is durable; original id cannot be restored; unrelated content can share bytes',async()=>{
 const env=await fixture();env.DB.sqlite.exec("INSERT INTO contents(id,store,side,type,title,url,r2_key) VALUES('a','s','left','image','A','u','shared'),('b','s','left','image','B','u','shared')")
 env.DB.sqlite.exec("DELETE FROM contents WHERE id='a'");assert.ok(env.DB.sqlite.prepare("SELECT * FROM lv_tombstones WHERE asset_id='a'").get());assert.throws(()=>env.DB.sqlite.exec("INSERT INTO contents(id,store,side,type,title) VALUES('a','s','left','image','A')"),/LV_DELETED_ASSET/);assert.ok(env.DB.sqlite.prepare("SELECT * FROM contents WHERE id='b'").get())
})
test('concurrent capacity reservations cannot cross the 7 GB media line; duplicate completion/release safe',async()=>{
 const env=await fixture();env.DB.sqlite.exec('UPDATE lv_storage SET bytes=6999999000,measured_at='+Date.now())
 const results=await Promise.allSettled([reserve(env,'one',900,{key:'k1'}),reserve(env,'two',900,{key:'k2'})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
 const id=results[0].status==='fulfilled'?'one':'two';await finishReservation(env,id,900,'k1');const row=env.DB.sqlite.prepare('SELECT * FROM lv_storage').get();assert.equal(row.reserved,0);assert.equal(row.bytes,6999999900);await assert.rejects(finishReservation(env,id,900,'k1'));await releaseReservation(env,id);assert.equal(env.DB.sqlite.prepare('SELECT bytes FROM lv_storage').get().bytes,row.bytes)
})
test('failed native screenshot storage responds non-2xx instead of acknowledging capture',async()=>{
 const form=new FormData();form.set('file',new Blob([Buffer.from([137,80,78,71,13,10,26,10,0])],{type:'image/png'}),'a.png');form.set('store','s');form.set('deviceId','tv_s')
 const env=await fixture();const r=await screenshot.onRequestPost({request:new Request('https://cms.test/api/screenshots',{method:'POST',body:form}),env});assert.equal(r.status,503);assert.equal((await r.json()).saved,false)
})
test('100 TVs, 24 hours regular plus 30 priority writes and 10 samples per TV stay within conservative 50k budget',async()=>{
 const env=await fixture();const start=changes(env);let requests=0
 for(let tv=0;tv<100;tv++){
  const installation=`installation_${String(tv).padStart(4,'0')}`;let seq=1
  for(let minute=0;minute<1440;minute+=5){const r=await send(env,packet(seq++,{installation}),T+minute*60000);requests++;assert.equal(r.status,200)}
 }
 const normalChanges=changes(env)-start;assert.equal(normalChanges,7200);assert.equal(requests,28800)
 // Normal jobs, full important reserve, worst-case detailed sample insert+counter and 10,000 admin rows.
 const conservative=normalChanges*3+100*30*3+100*10*3+10000
 assert.equal(conservative,43600);assert.ok(conservative<50000)
})
test('paged fault summaries retain omitted current faults; complete pages and same-file recovery merge safely',async()=>{
 const env=await fixture();const faults=Array.from({length:120},(_,i)=>({assetId:'f'+i,assetVersion:'v',side:'left',episode:'e'+i,status:'excluded',count:2}));
 const summary=page=>({...packet().summary,faultCount:120,criticalRevision:120,faultPaging:{total:120},faults:page});
 let r=await send(env,packet(1,{stateRevision:120,summary:summary(faults.slice(0,50))}));assert.equal(r.pendingFaultPages,true)
 await send(env,packet(2,{stateRevision:120,summary:summary(faults.slice(50,100))}),T+1000)
 r=await send(env,packet(3,{stateRevision:120,summary:summary(faults.slice(100))}),T+2000);assert.equal(r.pendingFaultPages,false)
 const before=changes(env);r=await send(env,packet(4,{stateRevision:120,summary:summary(faults.slice(0,50))}),T+300000);assert.equal(r.written,false);assert.equal(changes(env),before)
 const row=JSON.parse(env.DB.sqlite.prepare('SELECT summary_json FROM lv_runtime').get().summary_json);assert.equal(row.faults.length,120);assert.equal(row.faultCount,120)
 faults[7]={...faults[7],status:'recovered',recoveredAt:'now'};await send(env,packet(5,{stateRevision:121,summary:{...summary(faults.slice(0,50)),criticalRevision:121,faultCount:119}}),T+301000)
 const after=JSON.parse(env.DB.sqlite.prepare('SELECT summary_json FROM lv_runtime').get().summary_json);assert.equal(after.faults.find(f=>f.assetId==='f7').status,'recovered');assert.equal(after.faults.find(f=>f.assetId==='f8').status,'excluded')
})
test('publication seals bytes before pointer and a superseded builder cannot activate an older version',async()=>{
 // Publication writes must be covered by a measured capacity reservation.
 const env=await fixture();env.DB.sqlite.exec('UPDATE lv_storage SET measured_at='+Date.now());const puts=[],deletes=[];env.DB.sqlite.exec("UPDATE lv_publications SET revision=revision+1 WHERE store='s'")
 env.MEDIA={put:async(key,value)=>{puts.push({key,value});env.DB.sqlite.exec("UPDATE lv_publications SET revision=revision+1 WHERE store='s'")},delete:async key=>deletes.push(key)}
 const result=await publishOne(new Request('https://cms.test'),env,'s');assert.equal(result.superseded,true);assert.equal(puts.length,1);assert.equal(deletes.length,1);assert.equal(env.DB.sqlite.prepare("SELECT object_key FROM lv_publications WHERE store='s'").get().object_key,'sealed')
})
test('native screenshot success records one exact device without changing store-wide remote commands',async()=>{
 const env=await fixture();env.DB.sqlite.exec('UPDATE lv_storage SET measured_at='+Date.now());const objects=new Map();env.MEDIA={put:async(key,body)=>{objects.set(key,await new Response(body).arrayBuffer())}}
 env.DB.sqlite.exec("INSERT INTO devices(id,store,name,last_command) VALUES('tv_s','s','TV','screenshot'),('another','s','TV2','refresh')")
 const form=new FormData();form.set('file',new Blob([Buffer.from([137,80,78,71,13,10,26,10,0])],{type:'image/png'}),'a.png');form.set('store','s');form.set('deviceId','native_device')
 const r=await screenshot.onRequestPost({request:new Request('https://cms.test/api/screenshots',{method:'POST',body:form}),env});assert.equal(r.status,200);assert.equal((await r.json()).correlation,'unconfirmed-native-upload');assert.deepEqual(env.DB.sqlite.prepare('SELECT last_command FROM devices ORDER BY id').all().map(x=>x.last_command),['refresh','screenshot'])
})
test('complete backup refuses a partial DB read; restore cannot resurrect a deleted asset id',async()=>{
 const env=await fixture(),token=await createAdminSession(env);await env.DB.prepare("CREATE TABLE IF NOT EXISTS asset_integrity(content_id TEXT PRIMARY KEY,url TEXT,manifest_json TEXT,updated_at TEXT)").run()
 env.DB.sqlite.exec("INSERT INTO contents(id,store,side,type,title) VALUES('gone','s','left','image','Gone');DELETE FROM contents WHERE id='gone'")
 const headers={'x-lv-admin-token':token};let r=await fullBackup.onRequestGet({request:new Request('https://cms.test/api/full-backup',{headers}),env});assert.equal(r.status,200);const backup=await r.json();assert.equal(backup.complete,true);assert.ok(backup.tables.lv_tombstones.length)
 r=await fullBackup.onRequestPost({request:new Request('https://cms.test/api/full-backup',{method:'POST',headers,body:JSON.stringify({schema:3,complete:true,tables:{contents:[{id:'gone',store:'s',side:'left',type:'image',title:'Old backup'}]}})}),env});assert.equal((await r.json()).skippedDeleted[0],'gone');assert.equal(env.DB.sqlite.prepare("SELECT id FROM contents WHERE id='gone'").get(),undefined)
 const broken={...env,DB:{prepare:()=>({all:async()=>{throw new Error('DB unavailable')}})}};r=await fullBackup.onRequestGet({request:new Request('https://cms.test/api/full-backup',{headers}),env:broken});assert.equal(r.status,503);assert.equal((await r.json()).complete,false)
})
