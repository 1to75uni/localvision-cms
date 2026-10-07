import {begin,record} from '../_lib/media-upload-v3.js'
import {finishReservation,releaseReservation} from '../_lib/storage-v3.js'
import {reply} from '../_lib/sync-v3.js'
import {isAuthorized} from '../_lib/auth.js'
export async function onRequestPost({request,env}){
 if(!await isAuthorized(request,env))return reply({ok:false,error:'CMS 로그인 필요'},401)
 try{
 const b=await request.json(),action=b.action
 if(action==='begin'){
  const {id,reused,p}=await begin(env,b)
  if(reused)return reply({ok:true,reused:true,result:await record(request,env,p,id,true)})
  const upload=await env.MEDIA.createMultipartUpload(p.key,{httpMetadata:{contentType:p.contentType,cacheControl:'public,max-age=31536000,immutable'}})
  await env.DB.prepare('UPDATE lv_uploads SET upload_id=? WHERE id=?').bind(upload.uploadId,id).run()
  return reply({ok:true,id,partBytes:16*1024*1024})
 }
 const row=await env.DB.prepare('SELECT * FROM lv_uploads WHERE id=?').bind(b.id).first()
 if(!row)return reply({ok:false,error:'Upload not found'},404)
 const p=JSON.parse(row.payload_json)
 if(action==='complete'){
  if(row.state!=='completed'){
   if(row.expires_at<Date.now())return reply({ok:false,error:'Upload expired'},409)
   const n=Math.ceil(row.byte_size/(16*1024*1024))
   if(!Array.isArray(b.parts)||b.parts.length!==n||b.parts.some((p,i)=>p.partNumber!==i+1||!p.etag))return reply({ok:false,error:'Incomplete part list'},400)
   let obj
   try{obj=await env.MEDIA.resumeMultipartUpload(row.object_key,row.upload_id).complete(b.parts)}
   catch(e){obj=await env.MEDIA.head(row.object_key);if(obj?.size!==row.byte_size)throw e}
   if(obj.size!==row.byte_size)return reply({ok:false,error:'Incomplete object size'},422)
   await finishReservation(env,row.id,obj.size,row.object_key,p.side==='notice'?'notice':'media')
  }
  return reply(await record(request,env,p,row.id))
 }
 if(action==='abort'){
  if(row.state==='reserved'){await env.MEDIA.resumeMultipartUpload(row.object_key,row.upload_id).abort();await releaseReservation(env,row.id)}
  return reply({ok:true})
 }
 return reply({ok:false,error:'Unknown action'},400)
 }catch(e){return reply({ok:false,error:e.message},503)}
}
export async function onRequestPut({request,env}){
 if(!await isAuthorized(request,env))return reply({ok:false,error:'CMS 로그인 필요'},401)
 try{
 const u=new URL(request.url),id=u.searchParams.get('id'),number=Number(u.searchParams.get('part'))
 const row=await env.DB.prepare("SELECT * FROM lv_uploads WHERE id=? AND state='reserved'").bind(id).first()
 if(!row||row.expires_at<Date.now())return reply({ok:false,error:'Upload expired'},409)
 const n=Math.ceil(row.byte_size/(16*1024*1024)),expected=number===n?row.byte_size-(n-1)*16*1024*1024:16*1024*1024
 if(!Number.isInteger(number)||number<1||number>n||Number(request.headers.get('content-length'))!==expected)return reply({ok:false,error:'Wrong part length or number'},400)
 const part=await env.MEDIA.resumeMultipartUpload(row.object_key,row.upload_id).uploadPart(number,request.body)
 return reply({ok:true,part})
 }catch(e){return reply({ok:false,error:e.message},503)}
}
