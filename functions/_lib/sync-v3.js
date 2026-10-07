// LocalVision 3.0: the regular path has no migrations, R2 calls or per-request writes.
import { cleanSlug, makePlaylistSnapshot, normalizeContentForPlayer } from './localvision-core.js'
import { attachIntegrity } from './asset-integrity.js'
import {putAccounted,deleteAccounted} from './storage-v3.js'

export const RELEASE = '3.0.0'
export const NORMAL_MS = 20 * 60 * 1000
export function reply(body, status=200, extra={}) {
  return new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*',...extra}})
}
export const statements = [
 `CREATE TABLE IF NOT EXISTS asset_integrity (content_id TEXT PRIMARY KEY, url TEXT NOT NULL, manifest_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS lv_publications (store TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, published INTEGER NOT NULL DEFAULT 0, object_key TEXT NOT NULL DEFAULT '', command_json TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')`,
 `CREATE TABLE IF NOT EXISTS lv_tombstones (asset_id TEXT PRIMARY KEY, asset_version TEXT NOT NULL DEFAULT '*', store TEXT NOT NULL DEFAULT '', side TEXT NOT NULL DEFAULT '', r2_key TEXT NOT NULL DEFAULT '', deleted_at TEXT NOT NULL DEFAULT '')`,
 `CREATE TABLE IF NOT EXISTS lv_runtime (installation TEXT PRIMARY KEY, store TEXT NOT NULL, generation INTEGER NOT NULL, boot TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0, state_revision INTEGER NOT NULL DEFAULT 0, normal_at INTEGER NOT NULL DEFAULT 0, received_at INTEGER NOT NULL DEFAULT 0, signature TEXT NOT NULL DEFAULT '', summary_json TEXT NOT NULL DEFAULT '{}', budget_day TEXT NOT NULL DEFAULT '', important_count INTEGER NOT NULL DEFAULT 0, sample_count INTEGER NOT NULL DEFAULT 0, fault_seen INTEGER NOT NULL DEFAULT 0, fault_total INTEGER NOT NULL DEFAULT 0)`,
 `CREATE INDEX IF NOT EXISTS idx_lv_runtime_store ON lv_runtime(store)`,
 `CREATE TABLE IF NOT EXISTS lv_error_samples (id TEXT PRIMARY KEY, installation TEXT NOT NULL, created_at INTEGER NOT NULL, payload_json TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS idx_lv_samples_time ON lv_error_samples(created_at)`,
 `CREATE TABLE IF NOT EXISTS lv_storage (id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0, measured_at INTEGER NOT NULL DEFAULT 0, cursor TEXT NOT NULL DEFAULT '', scan_bytes INTEGER NOT NULL DEFAULT 0)`,
 `INSERT OR IGNORE INTO lv_storage(id) VALUES(1)`,
 `CREATE TABLE IF NOT EXISTS lv_uploads (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, upload_id TEXT NOT NULL DEFAULT '', byte_size INTEGER NOT NULL, expires_at INTEGER NOT NULL, payload_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'reserved')`,
 `CREATE TABLE IF NOT EXISTS lv_objects (object_key TEXT PRIMARY KEY, byte_size INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'media')`,
 `CREATE UNIQUE INDEX IF NOT EXISTS idx_lv_upload_reserved_key ON lv_uploads(object_key) WHERE state='reserved'`,
 `CREATE TABLE IF NOT EXISTS lv_control(id INTEGER PRIMARY KEY CHECK(id=1), publishing_paused INTEGER NOT NULL DEFAULT 0)`,
 `INSERT OR IGNORE INTO lv_control(id) VALUES(1)`,
 `INSERT OR IGNORE INTO lv_publications(store) VALUES('_common')`,
 `INSERT OR IGNORE INTO lv_publications(store) SELECT slug FROM stores WHERE slug<>''`,
]
const dirty = expression => `INSERT INTO lv_publications(store,revision) VALUES(${expression},1) ON CONFLICT(store) DO UPDATE SET revision=revision+1;`
export const triggers = [
 ...['INSERT','UPDATE','DELETE'].map(op=>`CREATE TRIGGER IF NOT EXISTS lv_content_${op.toLowerCase()} AFTER ${op} ON contents BEGIN ${dirty(op==='DELETE'?"CASE WHEN OLD.side='right' THEN '_common' ELSE OLD.store END":"CASE WHEN NEW.side='right' THEN '_common' ELSE NEW.store END")}${op==='UPDATE'?dirty("CASE WHEN OLD.side='right' THEN '_common' ELSE OLD.store END"):''} END`),
 `CREATE TRIGGER IF NOT EXISTS lv_content_tombstone BEFORE DELETE ON contents BEGIN INSERT OR IGNORE INTO lv_tombstones(asset_id,store,side,r2_key,deleted_at) VALUES(OLD.id,OLD.store,OLD.side,OLD.r2_key,strftime('%Y-%m-%dT%H:%M:%fZ','now')); ${dirty("'_common'")} END`,
 `CREATE TRIGGER IF NOT EXISTS lv_content_no_resurrection BEFORE INSERT ON contents WHEN EXISTS(SELECT 1 FROM lv_tombstones WHERE asset_id=NEW.id) BEGIN SELECT RAISE(ABORT,'LV_DELETED_ASSET: use a new content id'); END`,
 ...['playlist_groups','playlist_schedules','black_modes','stores','notices'].flatMap(table=>['INSERT','UPDATE','DELETE'].map(op=>{
   const row=op==='DELETE'?'OLD':'NEW',key=table==='notices'?"'_common'":`${row}.${table==='stores'?'slug':'store'}`
   return `CREATE TRIGGER IF NOT EXISTS lv_${table}_${op.toLowerCase()} AFTER ${op} ON ${table} BEGIN ${dirty(key)} END`
 })),
 `CREATE TRIGGER IF NOT EXISTS lv_device_command AFTER UPDATE OF last_command,command_at ON devices WHEN NEW.last_command<>COALESCE(OLD.last_command,'') OR NEW.command_at<>COALESCE(OLD.command_at,'') BEGIN INSERT INTO lv_publications(store,command_json) VALUES(NEW.store,json_object('command',NEW.last_command,'commandAt',NEW.command_at,'deviceId',NEW.id)) ON CONFLICT(store) DO UPDATE SET command_json=json_object('command',NEW.last_command,'commandAt',NEW.command_at,'deviceId',NEW.id); END`,
]
export async function installSync(env) {
 for (const sql of [...statements,...triggers]) await env.DB.prepare(sql).run()
}
function versionItems(items) {
 return items.map(x=>({...x,assetId:x.id,assetVersion:x.integrity?.revision || x.r2Key || x.url}))
}
export async function publishOne(request, env, store) {
 const pointer=await env.DB.prepare('SELECT * FROM lv_publications WHERE store=?').bind(store).first()
 if (!pointer || pointer.revision===pointer.published) return {store,unchanged:true}
 let body
 if(store==='_common') {
   const rows=await env.DB.prepare("SELECT * FROM contents WHERE side='right' AND status='사용중' ORDER BY sort_order,created_at").all()
   const right=versionItems(await attachIntegrity(env,(rows.results||[]).map(normalizeContentForPlayer)))
   const notices=await env.DB.prepare('SELECT * FROM notices WHERE is_active=1 ORDER BY updated_at DESC').all()
   const deletions=await env.DB.prepare('SELECT * FROM lv_tombstones ORDER BY asset_id').all()
   body={schema:3,store,revision:pointer.revision,right,notices:notices.results||[],tombstones:deletions.results||[],release:String(env.PLAYER_RELEASE || RELEASE)}
 } else {
   const snapshot=await makePlaylistSnapshot(request,env,store)
   // A missing section must not be published as an intentionally empty playlist.
   if(!snapshot?.playlists || !snapshot.playlistGroups) throw new Error('Incomplete playlist publication')
   const black=await env.DB.prepare('SELECT * FROM black_modes WHERE store=?').bind(store).first()
   const config=await env.DB.prepare('SELECT status,name FROM stores WHERE slug=?').bind(store).first()
   const groups={}
   for(const [id,group] of Object.entries(snapshot.playlistGroups)) groups[id]={...group,left:versionItems(group.left||[]),right:[]}
   body={...snapshot,schema:3,store,revision:pointer.revision,playlists:{left:versionItems(snapshot.playlists.left||[]),right:[]},playlistGroups:groups,black: black || {},active:!['중지','비활성','사용안함','inactive','disabled'].includes(String(config?.status||'').toLowerCase())}
 }
 const serialized=JSON.stringify(body)
 if(new TextEncoder().encode(serialized).length>4*1024*1024) throw new Error('Manifest exceeds 4 MiB; split the publication before expanding')
 // A unique object is sealed first; a stale builder cannot move the current pointer backwards.
 const key=`system/v3/manifests/${store}/${pointer.revision}-${crypto.randomUUID()}.json`
 await putAccounted(env,key,serialized,{httpMetadata:{contentType:'application/json',cacheControl:'no-store'}})
 const result=await env.DB.prepare('UPDATE lv_publications SET published=?,object_key=?,updated_at=? WHERE store=? AND revision=?').bind(pointer.revision,key,new Date().toISOString(),store,pointer.revision).run()
 if(!result.meta?.changes){await deleteAccounted(env,key);return {store,superseded:true}}
 if(pointer.object_key) await deleteAccounted(env,pointer.object_key).catch(()=>{})
 return {store,published:pointer.revision}
}
export async function flushPublications(request,env,limit=1) {
 const control=await env.DB.prepare('SELECT publishing_paused FROM lv_control WHERE id=1').first()
 if(control?.publishing_paused)return [{paused:true}]
 const rows=await env.DB.prepare('SELECT store FROM lv_publications WHERE revision<>published ORDER BY store LIMIT ?').bind(limit).all()
 const results=[]
 for(const row of rows.results||[]) {try{results.push(await publishOne(request,env,row.store))}catch(e){results.push({store:row.store,error:e.message})}}
 return results
}
function bounded(value,max=160){return String(value??'').slice(0,max)}
export function sanitizeSummary(input={}) {
 const faults=Array.isArray(input.faults)?input.faults:[]
 // Never truncate an active fault silently. Reject and retain the previous server state.
 if(faults.length>100) throw new Error('Too many active faults; summary paging is required')
 return {playerVersion:bounded(input.playerVersion,64),version:bounded(input.version),pendingVersion:bounded(input.pendingVersion),blackMode:!!input.blackMode,noticeActive:!!input.noticeActive,
   left:input.left || {},right:input.right || {},delivery:input.delivery || {},commandResult:input.commandResult || null,
   faultCount:Math.max(0,Number(input.faultCount)||0),criticalRevision:Math.max(0,Number(input.criticalRevision)||0),faultPaging:input.faultPaging?{total:Math.max(0,Number(input.faultPaging.total)||0),page:true}:null,storageUnhealthy:!!input.storageUnhealthy,faults:faults.map(f=>({assetId:bounded(f.assetId),assetVersion:bounded(f.assetVersion),side:f.side==='right'?'right':'left',fileName:bounded(f.fileName),episode:bounded(f.episode),status:['fault','excluded','recovered'].includes(f.status)?f.status:'fault',firstAt:bounded(f.firstAt,40),lastAt:bounded(f.lastAt,40),recoveredAt:bounded(f.recoveredAt,40),count:Math.max(0,Math.min(1e9,Number(f.count)||0))}))}
}
export function criticalSignature(s) {
 // Normal playback position and repeat counts do not create writes.
 return JSON.stringify([s.version,s.blackMode,s.commandResult?.id||'',s.commandResult?.status||'',(s.faultPaging?[['critical',s.criticalRevision]]:s.faults.map(f=>[f.assetId,f.assetVersion,f.side,f.episode,f.status])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])
}
async function mergeFaultPages(env,id,summary,revision){
 if(!summary.faultPaging)return summary;
 const previous=await env.DB.prepare('SELECT summary_json FROM lv_runtime WHERE installation=?').bind(id).first();
 const old=previous?JSON.parse(previous.summary_json):{faults:[]};
 const key=f=>JSON.stringify([f.side,f.assetId,f.assetVersion]);
 const map=new Map((old.faults||[]).map(f=>[key(f),f]));
 for(const f of summary.faults)map.set(key(f),{...f,_reportRevision:revision});
 const all=[...map.values()],seen=all.filter(f=>f._reportRevision===revision).length,total=summary.faultPaging.total;
 summary.faults=seen>=total?all.filter(f=>f._reportRevision===revision):all;
 summary.faultPaging.seen=Math.min(seen,total);
 if(summary.faults.length>5000)throw new Error('Fault summary exceeds 5,000 records; keep local records and split installation workload');
 return summary;
}
export async function sync(request,env,now=Date.now()) {
 if(!env.DB) return reply({ok:false,error:'DB binding missing'},503)
 if(Number(request.headers.get('content-length'))>65536) return reply({ok:false,error:'Sync body too large'},413)
 const raw=await request.text()
 if(new TextEncoder().encode(raw).length>65536) return reply({ok:false,error:'Sync body too large'},413)
 let b;try{b=JSON.parse(raw)}catch{return reply({ok:false,error:'Invalid JSON'},400)}
 const store=cleanSlug(b.store),id=bounded(b.installation,120),boot=bounded(b.boot,100)
 if(!store || !/^[a-zA-Z0-9_-]{8,120}$/.test(id) || !boot) return reply({ok:false,error:'store, persistent installation and boot required'},400)
 const [runtime,pub,common]=await Promise.all([
   env.DB.prepare('SELECT installation,store,generation,boot,seq,state_revision,normal_at,received_at,signature,budget_day,important_count,sample_count,fault_seen,fault_total FROM lv_runtime WHERE installation=?').bind(id).first(),
   env.DB.prepare('SELECT * FROM lv_publications WHERE store=?').bind(store).first(),
   env.DB.prepare("SELECT * FROM lv_publications WHERE store='_common'").first(),
 ])
 if(!pub?.published || !common?.published) return reply({ok:false,error:'Publication not ready; keep cached playback',code:'LV_PUBLICATION_PENDING'},503,{'retry-after':'60'})
 if(runtime && runtime.store!==store) return reply({ok:false,error:'Installation belongs to another store'},409)
 let summary;try{summary=sanitizeSummary(b.summary)}catch(e){return reply({ok:false,error:e.message},422)}
 const signature=criticalSignature(summary),seq=Number(b.seq),revision=Number(b.stateRevision)||0,day=new Date(now).toISOString().slice(0,10)
 if(!Number.isSafeInteger(seq)||seq<1||!Number.isSafeInteger(revision)||revision<0) return reply({ok:false,error:'Invalid sequence'},400)
 const bootstrap=!runtime || runtime.boot!==boot
 let generation=runtime?.generation||0,written=false,persisted=false,reason='read-only',pendingBudget=false
 if(bootstrap) {
   if(runtime && Number(b.previousGeneration)!==runtime.generation) return reply({ok:false,code:'LV_SESSION_CONFLICT',generation:runtime.generation,error:'Late or concurrent boot rejected'},409)
   generation+=1
   summary=await mergeFaultPages(env,id,summary,revision)
   const args=[id,store,generation,boot,seq,revision,now,now,signature,JSON.stringify(summary),day]
   const stmt=runtime?
    env.DB.prepare(`UPDATE lv_runtime SET generation=?,boot=?,seq=?,state_revision=?,normal_at=?,received_at=?,signature=?,summary_json=?,budget_day=?,important_count=0,sample_count=0 WHERE installation=? AND generation=? AND boot=?`).bind(generation,boot,seq,revision,now,now,signature,JSON.stringify(summary),day,id,runtime.generation,runtime.boot):
    env.DB.prepare(`INSERT INTO lv_runtime(installation,store,generation,boot,seq,state_revision,normal_at,received_at,signature,summary_json,budget_day) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(installation) DO NOTHING`).bind(...args)
   const result=await stmt.run()
   if(!result.meta?.changes)return reply({ok:false,code:'LV_SESSION_CONFLICT',error:'Concurrent boot; retain playback'},409)
   written=persisted=true;reason='boot'
   if(summary.faultPaging)await env.DB.prepare('UPDATE lv_runtime SET fault_seen=?,fault_total=? WHERE installation=?').bind(summary.faultPaging.seen,summary.faultPaging.total,id).run()
 } else {
   if(Number(b.generation)!==generation)return reply({ok:false,code:'LV_SESSION_CONFLICT',generation,error:'Obsolete session'},409)
   const fresh=seq>runtime.seq && revision>=runtime.state_revision
   const due=now-runtime.normal_at>=NORMAL_MS
   const critical=fresh && (signature!==runtime.signature || (summary.faultPaging && runtime.fault_seen<runtime.fault_total))
   const used=runtime.budget_day===day?runtime.important_count:0
   // Ten priority writes per day; bounded extra safety reserve for quarantine/recovery.
   const maxImportant=30
   pendingBudget=critical && used>=maxImportant && !due
   if(fresh && (due || (critical && used<maxImportant))) {
     summary=await mergeFaultPages(env,id,summary,revision)
     const result=await env.DB.prepare(`UPDATE lv_runtime SET seq=?,state_revision=?,normal_at=?,received_at=?,signature=?,summary_json=?,budget_day=?,important_count=?,sample_count=?,fault_seen=?,fault_total=? WHERE installation=? AND generation=? AND boot=? AND seq<? AND state_revision<=?`).bind(seq,revision,due?now:runtime.normal_at,now,signature,JSON.stringify(summary),day,used+(critical&&!due?1:0),runtime.budget_day===day?runtime.sample_count:0,summary.faultPaging?.seen||0,summary.faultPaging?.total||0,id,generation,boot,seq,revision).run()
     written=persisted=!!result.meta?.changes;reason=written?(due?'normal-20min':'important'):'duplicate'
   }
 }
 // Detailed samples are optional. Current fault state above has a separate lifetime.
 const samples=Array.isArray(b.samples)?b.samples.slice(0,10):[]
 let acknowledged=[]
 if(written && (runtime?.budget_day===day?runtime.sample_count:0)>=10)acknowledged=samples.map(s=>bounded(s.id,180))
 if(written && samples.length) {
   const used=runtime?.budget_day===day?runtime.sample_count:0,room=Math.max(0,10-used)
   for(const sample of samples.slice(0,room)){
     const eventId=bounded(sample.id,180)
     if(!eventId)continue
     const result=await env.DB.prepare('INSERT OR IGNORE INTO lv_error_samples(id,installation,created_at,payload_json) VALUES(?,?,?,?)').bind(`${id}:${eventId}`,id,now,JSON.stringify(sample).slice(0,2048)).run()
     acknowledged.push(eventId)
     if(result.meta?.changes) await env.DB.prepare('UPDATE lv_runtime SET sample_count=sample_count+1 WHERE installation=? AND generation=? AND boot=?').bind(id,generation,boot).run()
   }
 }
 const version=`${pub.published}:${common.published}`,changed=b.version!==version,owned=String(b.version||'').split(':')
 let command=null;try{command=JSON.parse(pub.command_json||'null')}catch{}
 const at=String(command?.commandAt||'').replace(' ','T'); const commandTime=Date.parse(at+(/(?:Z|[+-]\d{2}:?\d{2})$/.test(at)?'':'Z'))
 if(!command?.command || !Number.isFinite(commandTime) || now-commandTime>20*60000)command=null
 return reply({ok:true,schema:3,generation,boot,version,changed,release:String(env.PLAYER_RELEASE||RELEASE),serverNow:now,syncAfterMs:300000,normalAfterMs:NORMAL_MS,written,persisted,reason,pendingBudget,acknowledged,
   manifests:changed?{store:owned[0]===String(pub.published)?null:`/api/player-manifest?store=${encodeURIComponent(store)}&revision=${pub.published}`,common:owned[1]===String(common.published)?null:`/api/player-manifest?store=_common&revision=${common.published}`} :null,
   pendingFaultPages:summary.faultPaging?summary.faultPaging.seen<summary.faultPaging.total:false,publicationPending:pub.revision!==pub.published || common.revision!==common.published,command},200,{'x-lv-d1-written':written?'1':'0'})
}
