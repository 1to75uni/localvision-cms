import {reply} from '../_lib/sync-v3.js'
import {cleanSlug} from '../_lib/localvision-core.js'
export async function onRequestGet({request,env}) {
 try {
 const u=new URL(request.url),store=cleanSlug(u.searchParams.get('store'))
 const row=await env.DB.prepare('SELECT published,object_key FROM lv_publications WHERE store=?').bind(store).first()
 if(!row || String(row.published)!==u.searchParams.get('revision'))return reply({ok:false,code:'LV_MANIFEST_SUPERSEDED'},409)
 const obj=await env.MEDIA.get(row.object_key)
 if(!obj?.body)return reply({ok:false,error:'Manifest unavailable; keep cached playback'},503)
 return new Response(obj.body,{headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'}})
 }catch(e){return reply({ok:false,error:e.message},503)}
}
