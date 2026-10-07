import {json} from '../_lib/localvision-core.js'
import {limitedBody,saveHealth,readHealth,healthError} from '../_lib/playback-health.js'
export async function onRequestOptions(){return json({ok:true})}
export async function onRequestPost({request,env}) {
  try{return json(await saveHealth(env,await limitedBody(request)))}catch(error){return healthError(error)}
}
export async function onRequestGet({request,env}) {
  const url=new URL(request.url)
  try{
    const store=url.searchParams.get('store')||'',id=url.searchParams.get('deviceId')||'';
    const legacy=await readHealth(env,store,id);
    let rows=[];
    try{
      const result=await env.DB.prepare(`SELECT * FROM lv_runtime WHERE (?='' OR store=?) AND (?='' OR installation=?) LIMIT 500`).bind(store,store,id,id).all();rows=result.results||[];
    }catch(e){if(!/no such table/.test(e.message))throw e}
    const ids=new Set(rows.map(r=>r.installation));
    const modern=rows.map(r=>{
      const s=JSON.parse(r.summary_json),stale=Date.now()-r.received_at>=1800000;
      const exclusions=side=>s.faults.filter(f=>f.side===side&&f.status==='excluded').map(f=>({...f,itemId:f.assetId,failCount:f.count,excludedAt:f.firstAt,retryAt:'Player 내부 재검사 대기'}));
      return {...s,deviceId:r.installation,store:r.store,sessionId:r.boot,receivedAtUtc:new Date(r.received_at).toISOString(),receivedAt:new Date(r.received_at).toISOString(),ageSeconds:Math.max(0,Math.floor((Date.now()-r.received_at)/1000)),status:stale?'stale':s.blackMode?'black-mode':s.faultCount>0||s.faults.some(f=>f.status!=='recovered')?'degraded':'healthy',stale,left:{...s.left,exclusions:exclusions('left')},right:{...s.right,exclusions:exclusions('right')},delivery:s.delivery,lastCommand:s.commandResult,faults:s.faults,syncPolicy:'5min-check/20min-save'};
    });
    return json({...legacy,initialized:true,devices:[...modern,...(legacy.devices||[]).filter(d=>!ids.has(d.deviceId))]});
  }catch(error){return healthError(error)}
}
