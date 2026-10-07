import {meterDatabase} from '../_lib/d1-meter.js'
import {sync,reply} from '../_lib/sync-v3.js'
export const onRequestPost=async({request,env})=>{try{if(!env.DB)return reply({ok:false,error:'DB missing'},503);const meter=meterDatabase(env.DB);const response=await sync(request,{...env,DB:meter.DB});const h=new Headers(response.headers);h.set('x-lv-d1-rows-read',String(meter.stats.rowsRead));h.set('x-lv-d1-rows-written',String(meter.stats.rowsWritten));h.set('x-lv-d1-queries',String(meter.stats.queries));return new Response(response.body,{status:response.status,headers:h})}catch(e){return reply({ok:false,error:e.message,code:'LV_SYNC_UNAVAILABLE'},503,{'retry-after':'60'})}}
export const onRequestOptions=()=>reply({ok:true})
