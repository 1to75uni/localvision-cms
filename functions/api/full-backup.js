import {isAuthorized} from '../_lib/auth.js'
import {reply,RELEASE} from '../_lib/sync-v3.js'
const tables=['stores','contents','notices','devices','playlist_groups','playlist_schedules','black_modes','asset_integrity','lv_tombstones']
export async function onRequestGet({request,env}){
 if(!await isAuthorized(request,env))return reply({ok:false,error:'CMS 로그인 필요'},401)
 try{
 const data={};for(const table of tables)data[table]=(await env.DB.prepare(`SELECT * FROM ${table}`).all()).results||[]
 return reply({ok:true,schema:3,release:RELEASE,createdAt:new Date().toISOString(),complete:true,tables:data},200,{'content-disposition':'attachment; filename="localvision-complete-backup.json"'})
 }catch(e){return reply({ok:false,complete:false,error:e.message},503)}
}
export async function onRequestPost({request,env}){
 if(!await isAuthorized(request,env))return reply({ok:false,error:'CMS 로그인 필요'},401)
 try{
 const raw=await request.text();if(raw.length>2*1024*1024)return reply({ok:false,error:'Restore batch too large'},413)
 const b=JSON.parse(raw)
 if(b.action==='begin-restore'||b.action==='end-restore'){
   await env.DB.prepare('UPDATE lv_control SET publishing_paused=? WHERE id=1').bind(b.action==='begin-restore'?1:0).run()
   return reply({ok:true,paused:b.action==='begin-restore'})
 }
 if(b.schema!==3 || b.complete!==true || !b.tables)return reply({ok:false,error:'A complete v3 backup is required'},400)
 const jobs=[],skipped=[]
 // Merge restore: deleted IDs remain deleted. No table wipe, sequence rollback or old remote command replay.
 for(const table of ['lv_tombstones',...tables.filter(t=>t!=='lv_tombstones')]){
  const rows=b.tables[table]||[];if(rows.length>20)return reply({ok:false,error:'Restore in batches of 20 rows per table'},413)
  const columns=(await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results.map(c=>c.name)
  const keys=(await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results.filter(c=>c.pk).map(c=>c.name)
  for(const input of rows){
   const row={...input}
   if(table==='contents'){
    const deleted=await env.DB.prepare('SELECT asset_id FROM lv_tombstones WHERE asset_id=?').bind(row.id).first()
    if(deleted){skipped.push(row.id);continue}
   }
   if(table==='devices'){row.last_command='';row.command_at=''}
   const names=Object.keys(row).filter(k=>columns.includes(k)),updates=names.filter(k=>!keys.includes(k)).map(k=>`${k}=excluded.${k}`)
   if(!names.length)continue
   jobs.push(env.DB.prepare(`INSERT INTO ${table}(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')}) ON CONFLICT(${keys.join(',')}) ${table==='lv_tombstones'||!updates.length?'DO NOTHING':'DO UPDATE SET '+updates.join(',')}`).bind(...names.map(k=>row[k])))
  }
 }
 if(jobs.length>30)return reply({ok:false,error:'At most 30 rows per restore request'},413)
 if(jobs.length)await env.DB.batch(jobs)
 await env.DB.prepare('DELETE FROM contents WHERE id IN(SELECT asset_id FROM lv_tombstones)').run()
 return reply({ok:true,restored:jobs.length,skippedDeleted:skipped,mode:'merge-preserving-deletions'})
 }catch(e){return reply({ok:false,error:e.message},503)}
}
