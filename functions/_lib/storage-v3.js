export const GB=1_000_000_000
export async function putAccounted(env,key,body,options={},kind='metadata'){
 const size=typeof body==='string'?new TextEncoder().encode(body).byteLength:body.size
 const id=crypto.randomUUID();await reserve(env,id,size,{key},kind)
 await env.MEDIA.put(key,body,options);await finishReservation(env,id,size,key,kind)
}
export async function deleteAccounted(env,key){
 const row=await env.DB.prepare('SELECT byte_size FROM lv_objects WHERE object_key=?').bind(key).first()
 await env.MEDIA.delete(key)
 if(row)await env.DB.batch([env.DB.prepare('DELETE FROM lv_objects WHERE object_key=?').bind(key),env.DB.prepare('UPDATE lv_storage SET bytes=MAX(0,bytes-?) WHERE id=1').bind(row.byte_size)])
}
export async function reserve(env,id,size,payload={},kind='media',now=Date.now()) {
 if(!Number.isSafeInteger(size)||size<1)throw new Error('Invalid upload size')
 const row=await env.DB.prepare('SELECT * FROM lv_storage WHERE id=1').first()
 if(!row?.measured_at || now-row.measured_at>86400000)throw new Error('R2 용량 확인이 필요합니다. 운영 점검에서 용량을 확인하세요.')
 const limit=kind==='media'?7*GB:8*GB
 const results=await env.DB.batch([
  env.DB.prepare('UPDATE lv_storage SET reserved=reserved+? WHERE id=1 AND measured_at>? AND bytes+reserved+?<=?').bind(size,now-86400000,size,limit),
  env.DB.prepare(`INSERT INTO lv_uploads(id,object_key,byte_size,expires_at,payload_json,state) SELECT ?,?,?,?,?, 'reserved' WHERE changes()=1`).bind(id,payload.key||'',size,now+3600000,JSON.stringify(payload)),
 ])
 if(!results[0].meta?.changes)throw new Error('R2 안전선 초과: 새 업로드를 제한합니다. 사용 중인 콘텐츠는 삭제하지 않습니다.')
 return id
}
export async function finishReservation(env,id,size,key,kind='media') {
 const row=await env.DB.prepare("SELECT * FROM lv_uploads WHERE id=? AND state='reserved'").bind(id).first()
 if(!row)throw new Error('Missing or expired reservation')
 if(size!==row.byte_size)throw new Error('Uploaded size differs from reservation')
 // An existing shared original consumes no second allocation.
 const existing=await env.DB.prepare('SELECT byte_size FROM lv_objects WHERE object_key=?').bind(key).first()
 const delta=size-(existing?.byte_size||0)
 await env.DB.batch([
  env.DB.prepare("UPDATE lv_uploads SET state='completed' WHERE id=? AND state='reserved'").bind(id),
  env.DB.prepare('UPDATE lv_storage SET bytes=bytes+?,reserved=MAX(0,reserved-?) WHERE id=1 AND changes()=1').bind(delta,row.byte_size),
  env.DB.prepare('INSERT INTO lv_objects(object_key,byte_size,kind) SELECT ?,?,? WHERE changes()=1 ON CONFLICT(object_key) DO UPDATE SET byte_size=excluded.byte_size,kind=excluded.kind').bind(key,size,kind),
 ])
}
export async function releaseReservation(env,id) {
 const row=await env.DB.prepare("SELECT byte_size FROM lv_uploads WHERE id=? AND state='reserved'").bind(id).first()
 if(!row)return
 await env.DB.batch([env.DB.prepare("UPDATE lv_uploads SET state='aborted' WHERE id=? AND state='reserved'").bind(id),env.DB.prepare('UPDATE lv_storage SET reserved=MAX(0,reserved-?) WHERE id=1 AND changes()=1').bind(row.byte_size)])
}
export async function inventoryStep(env,restart=false) {
 const row=await env.DB.prepare('SELECT * FROM lv_storage WHERE id=1').first()
 if(row.reserved>0)throw new Error('업로드 중에는 전체 용량 재측정을 시작하지 않습니다.')
 if(restart || !row.cursor){
  const guard=await env.DB.prepare('UPDATE lv_storage SET measured_at=0 WHERE id=1 AND reserved=0').run()
  if(!guard.meta?.changes)throw new Error('업로드가 시작되어 용량 재측정을 보류합니다.')
 }
 const cursor=restart?'':row.cursor,base=restart?0:row.scan_bytes
 const page=await env.MEDIA.list({limit:1000,...(cursor?{cursor}:{})})
 const bytes=base+(page.objects||[]).reduce((s,o)=>s+o.size,0)
 await env.DB.prepare('UPDATE lv_storage SET cursor=?,scan_bytes=?,bytes=CASE WHEN ? THEN ? ELSE bytes END,measured_at=CASE WHEN ? THEN ? ELSE measured_at END WHERE id=1').bind(page.truncated?page.cursor:'',page.truncated?bytes:0,page.truncated?0:1,bytes,page.truncated?0:1,Date.now()).run()
 return {complete:!page.truncated,bytes,warning:bytes>=5*GB,cleanupNeeded:bytes>=6*GB,uploadLimited:bytes>=7*GB,emergency:bytes>=8*GB}
}
