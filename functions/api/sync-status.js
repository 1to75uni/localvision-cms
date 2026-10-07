import {reply} from '../_lib/sync-v3.js'
export async function onRequestGet({env}){
 try{
 const now=Date.now(),rows=await env.DB.prepare('SELECT * FROM lv_runtime ORDER BY store,installation LIMIT 501').all()
 const pubs=await env.DB.prepare('SELECT store,published,revision FROM lv_publications').all()
 const byStore=new Map((pubs.results||[]).map(x=>[x.store,x])),common=byStore.get('_common')
 const devices=(rows.results||[]).slice(0,500).map(r=>{
  const summary=JSON.parse(r.summary_json),age=now-r.received_at,pub=byStore.get(r.store),expected=`${pub?.published||0}:${common?.published||0}`
  return {installation:r.installation,store:r.store,generation:r.generation,savedAt:r.received_at,freshness:age>=1800000?'연결 확인 필요':age>1200000?'상태 오래됨':'최근 저장 정상',...summary,changePending:summary.version!==expected,importantUsed:r.important_count,samplesUsed:r.sample_count}
 })
 const storage=await env.DB.prepare('SELECT bytes,reserved,measured_at FROM lv_storage WHERE id=1').first()
 const control=await env.DB.prepare('SELECT publishing_paused FROM lv_control WHERE id=1').first()
 return reply({ok:true,devices,total:rows.results?.length||0,truncated:rows.results?.length>500,storage,publishingPaused:!!control?.publishing_paused,publicationPending:(pubs.results||[]).filter(x=>x.revision!==x.published).length,contactPolicy:'마지막 D1 저장 기준입니다. 실시간 온라인 표시가 아닙니다.'})
 }catch(e){return reply({ok:false,error:e.message,setupRequired:/no such table/.test(e.message)},503)}
}
