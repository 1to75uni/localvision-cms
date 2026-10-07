import {isAuthorized} from '../_lib/auth.js'
import {ensureCoreSchema} from '../_lib/localvision-core.js'
import {installSync,flushPublications,reply,RELEASE} from '../_lib/sync-v3.js'
import {inventoryStep,releaseReservation} from '../_lib/storage-v3.js'
export async function onRequestPost({request,env}){
 if(!await isAuthorized(request,env))return reply({ok:false,error:'CMS 로그인 후 실행하세요.'},401)
 try{
 const body=await request.json()
 if(body.action==='install') {
   await ensureCoreSchema(env)
   await env.DB.prepare(`CREATE TABLE IF NOT EXISTS black_modes(store TEXT PRIMARY KEY,immediate_active INTEGER DEFAULT 0,immediate_until TEXT DEFAULT '',schedule_enabled INTEGER DEFAULT 0,schedule_days_json TEXT DEFAULT '[]',schedule_start TEXT DEFAULT '00:00',schedule_end TEXT DEFAULT '23:59',message TEXT DEFAULT '',updated_at TEXT DEFAULT '')`).run()
   await installSync(env)
   const current=await env.DB.prepare('SELECT measured_at FROM lv_storage WHERE id=1').first()
   if(!current.measured_at||Date.now()-current.measured_at>86400000)return reply({ok:true,release:RELEASE,needsInventory:true,results:[],pending:1})
 }
 if(body.action==='inventory')return reply({ok:true,...await inventoryStep(env,!!body.restart)})
 if(body.action==='resume-publication'){
   await env.DB.prepare('UPDATE lv_control SET publishing_paused=0 WHERE id=1').run()
   return reply({ok:true})
 }
 if(body.action==='maintenance'){
   const old=await env.DB.prepare("SELECT * FROM lv_uploads WHERE expires_at<? AND state='reserved' LIMIT 20").bind(Date.now()).all()
   for(const row of old.results||[]){
     const completed=await env.MEDIA.head(row.object_key)
     if(completed?.size===row.byte_size){const {finishReservation}=await import('../_lib/storage-v3.js');await finishReservation(env,row.id,row.byte_size,row.object_key);continue}
     if(row.upload_id)await env.MEDIA.resumeMultipartUpload(row.object_key,row.upload_id).abort();await releaseReservation(env,row.id)
   }
   await env.DB.prepare("DELETE FROM lv_uploads WHERE id IN(SELECT id FROM lv_uploads WHERE state<>'reserved' AND expires_at<? LIMIT 1000)").bind(Date.now()-7*86400000).run()
   // Seven-day samples are expendable; current fault summaries and tombstones are never purged.
   await env.DB.prepare('DELETE FROM lv_error_samples WHERE id IN(SELECT id FROM lv_error_samples WHERE created_at<? LIMIT 1000)').bind(Date.now()-7*86400000).run()
   const obsolete=await env.DB.prepare(`SELECT s.* FROM device_screenshots s WHERE s.created_at<? AND EXISTS(SELECT 1 FROM device_screenshots n WHERE n.device_id=s.device_id AND n.created_at>s.created_at) LIMIT 20`).bind(new Date(Date.now()-86400000).toISOString()).all()
   let removed=0
   for(const photo of obsolete.results||[]){
     if(!photo.r2_key?.startsWith('system/screenshots/'))continue
     const object=await env.MEDIA.head(photo.r2_key)
     await env.MEDIA.delete(photo.r2_key)
     await env.DB.batch([env.DB.prepare('DELETE FROM device_screenshots WHERE id=?').bind(photo.id),env.DB.prepare('DELETE FROM lv_objects WHERE object_key=?').bind(photo.r2_key),env.DB.prepare('UPDATE lv_storage SET bytes=MAX(0,bytes-?) WHERE id=1').bind(object?.size||0)])
     removed++
   }
   return reply({ok:true,expiredUploads:old.results?.length||0,oldScreenshotsRemoved:removed})
 }
 if(!['install','publish'].includes(body.action))return reply({ok:false,error:'Unknown action'},400)
 const results=await flushPublications(request,env,1)
 const pending=await env.DB.prepare('SELECT COUNT(*) AS n FROM lv_publications WHERE revision<>published').first()
 return reply({ok:results.every(r=>!r.error),paused:results.some(r=>r.paused),release:RELEASE,results,pending:pending.n})
 }catch(e){return reply({ok:false,error:e.message},503)}
}
