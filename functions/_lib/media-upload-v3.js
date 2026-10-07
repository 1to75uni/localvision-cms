import {validate} from './integrity.js'
import {saveIntegrity} from './asset-integrity.js'
import {makePublicUrl,contentTargetFromBody,defaultPlaylistGroupId,ensureDefaultPlaylistGroup,cleanSlug,writePlaylistSnapshots,writeCommonRightSnapshot} from './localvision-core.js'
import {reserve,finishReservation,releaseReservation} from './storage-v3.js'
import {validateProfile} from './media-inspection.js'
export function payload(body){
 const m=validate(body.integrity),ext=String(body.fileName||'').split('.').pop().toLowerCase()
 if(!(body.side==='notice'?['mp4','mov','webm','gif','jpg','jpeg','png','webp']:['mp4','jpg','jpeg','png','webp']).includes(ext))throw new Error('MP4, JPG, PNG, WEBP 파일을 사용하세요.')
 const type=['mp4','webm','mov'].includes(ext)?'video':'image'
 if(ext==='mp4')validateProfile(body.mediaInspection||{},{})
 if(!body.title || !['left','right','notice'].includes(body.side))throw new Error('title and side required')
 const store=body.side==='right'?'_common':cleanSlug(body.store)
 if(!store)throw new Error('store required')
 return {...body,store,type,integrity:m,key:`assets/originals/${m.revision}.${ext}`,contentType:type==='video'?(ext==='webm'?'video/webm':ext==='mov'?'video/quicktime':'video/mp4'):ext==='jpg'||ext==='jpeg'?'image/jpeg':`image/${ext}`,fileName:String(body.fileName).split(/[\\/]/).pop().slice(0,180),duration:Number(body.duration)||20}
}
export async function begin(env,body){
 const p=payload(body),id=crypto.randomUUID()
 const old=await env.DB.prepare('SELECT byte_size FROM lv_objects WHERE object_key=?').bind(p.key).first()
 if(old?.byte_size===p.integrity.byteSize){
  const object=await env.MEDIA.head(p.key)
  if(object?.size===old.byte_size)return {id,reused:true,p}
  // The provider's console or an old cleanup may have removed it. Never reuse a missing original.
  await env.DB.prepare('DELETE FROM lv_objects WHERE object_key=?').bind(p.key).run()
 }
 await reserve(env,id,p.integrity.byteSize,p,p.side==='notice'?'notice':'media')
 return {id,reused:false,p}
}
export async function record(request,env,p,id,reused=false){
 const contentId=`ct_${id}`,url=makePublicUrl(request,env,p.key)
 if(p.side==='notice')return {ok:true,key:p.key,r2Key:p.key,type:p.type,fileName:p.fileName,url,integrity:p.integrity,reused}
 const target=contentTargetFromBody(p,p.side),group=p.side==='left'?(p.playlistGroupId||defaultPlaylistGroupId(p.store)):''
 if(p.side==='left')await ensureDefaultPlaylistGroup(env,p.store)
 await saveIntegrity(env,contentId,url,p.integrity)
 await env.DB.prepare(`INSERT INTO contents(id,store,side,type,title,duration,status,file_name,url,sort_order,updated_at,r2_key,target_mode,target_stores_json,playlist_group_id) VALUES(?,?,?,?,?,?,'사용중',?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(contentId,p.store,p.side,p.type,p.title,p.duration,p.fileName,url,Date.now(),new Date().toISOString(),p.key,target.targetMode,target.targetStoresJson,group).run()
 // Keep the legacy APP/old-Player playlist endpoints during staged deployment.
 let snapshot;try{snapshot=p.side==='right'?await writeCommonRightSnapshot(request,env):await writePlaylistSnapshots(request,env,p.store)}catch(e){snapshot={ok:false,error:e.message}}
 return {ok:true,key:p.key,content:{id:contentId,store:p.store,side:p.side,type:p.type,title:p.title,url,r2Key:p.key,fileName:p.fileName,integrity:p.integrity,...target,playlistGroupId:group,status:'사용중',duration:p.duration},mediaInspection:p.mediaInspection,snapshot,reused}
}
export async function smallUpload(request,env,form){
 const file=form.get('file');if(!file || typeof file==='string'||!file.size)throw new Error('빈 파일은 업로드할 수 없습니다.')
 if(file.size>16*1024*1024)throw new Error('큰 파일은 CMS 분할 업로드를 이용하세요.')
 let integrity,mediaInspection;try{integrity=JSON.parse(form.get('integrity'));mediaInspection=JSON.parse(form.get('mediaInspection')||'null')}catch{throw new Error('CMS에서 원본 검사 후 다시 업로드하세요.')}
 const body=Object.fromEntries([...form].filter(([k])=>k!=='file'));body.integrity=integrity;body.mediaInspection=mediaInspection;body.fileName=file.name;body.title ||= file.name;
 const {id,reused,p}=await begin(env,body)
 if(file.size!==p.integrity.byteSize){if(!reused)await releaseReservation(env,id);throw new Error('원본 크기 불일치')}
 if(!reused){
  try{await env.MEDIA.put(p.key,file.stream(),{httpMetadata:{contentType:p.contentType,cacheControl:'public,max-age=31536000,immutable'}});await finishReservation(env,id,file.size,p.key,p.side==='notice'?'notice':'media')}
  catch(e){/* A completed R2 PUT with a failed DB commit stays reserved until reconciliation. */throw e}
 }
 return record(request,env,p,id,reused)
}
