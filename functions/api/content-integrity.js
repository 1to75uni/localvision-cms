import {validate} from '../_lib/integrity.js'
import {json,writePlaylistSnapshots,writeCommonRightSnapshot} from '../_lib/localvision-core.js';
import {inspect,saveIntegrity,attachIntegrity} from '../_lib/asset-integrity.js';
export async function onRequestOptions(){return json({ok:true});}
export async function onRequestGet({request,env}){
 try{
  if(!env.DB)return json({ok:false,error:'D1 unavailable'},503);
  const store=new URL(request.url).searchParams.get('store');if(!store)return json({ok:false,error:'store required'},400);
  const rows=await env.DB.prepare(`SELECT id,url,r2_key AS r2Key,file_name AS fileName FROM contents WHERE (store=? OR (store='_common' AND side='right')) AND status='사용중' ORDER BY id`).bind(store).all();
  await attachIntegrity(env,rows.results);const missing=rows.results.filter(x=>!x.integrity && x.r2Key);
  return json({ok:true,total:rows.results.length,verified:rows.results.filter(x=>x.integrity).length,remaining:missing.length,items:missing.slice(0,20).map(({id,fileName,url,r2Key})=>({id,fileName,url,r2Key}))});
 }catch(e){return json({ok:false,error:e.message},503);}
}
export async function onRequestPost({request,env}){
 try{
  if(!env.DB || !env.MEDIA)return json({ok:false,error:'D1/R2 unavailable'},503);
  if(Number(request.headers.get('content-length'))>131072)return json({ok:false,error:'request too large'},413);
  const raw=await request.text();if(raw.length>131072)return json({ok:false,error:'request too large'},413);
  const body=JSON.parse(raw);if(!body?.id || !body?.store)return json({ok:false,error:'id, store required'},400);
  const item=await env.DB.prepare(`SELECT id,url,store,side,r2_key AS r2Key FROM contents WHERE id=? AND (store=? OR (store='_common' AND side='right'))`).bind(body.id,body.store).first();
  if(!item?.r2Key)return json({ok:false,error:'content not found'},404);
  await attachIntegrity(env,[item]);if(item.integrity)return json({ok:true,alreadyVerified:true});
  const object=await env.MEDIA.get(item.r2Key);if(!object)return json({ok:false,error:'R2 원본 파일 없음'},404);
  if(object.size>1024*1024*1024){await object.body.cancel();return json({ok:false,error:'1GB 초과: 파일 경량화 후 재업로드 필요'},422);}
  let manifest
  if(body.integrity){manifest=validate(body.integrity);await object.body?.cancel();if(manifest.byteSize!==object.size)return json({ok:false,error:'원본 크기 불일치'},422)}
  else if(object.size<=65536){manifest=await inspect(object.body)}
  else {await object.body?.cancel();return json({ok:false,error:'큰 파일 검사는 CMS 브라우저에서 실행하세요. 무료 Worker에서 전체 파일 해시를 계산하지 않습니다.'},422)}
  await saveIntegrity(env,item.id,item.url,manifest);
  let snapshotWarning='';
  try{if(item.side==='right')await writeCommonRightSnapshot(request,env);else await writePlaylistSnapshots(request,env,item.store);}catch(e){snapshotWarning=e.message;}
  return json({ok:true,id:item.id,byteSize:manifest.byteSize,revision:manifest.revision,snapshotWarning});
 }catch(e){return json({ok:false,error:e.message},e instanceof SyntaxError?400:503);}
}
