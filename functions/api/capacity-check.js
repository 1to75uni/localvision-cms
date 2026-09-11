import {meterDatabase} from '../_lib/d1-meter.js';
import {json,cleanSlug} from '../_lib/localvision-core.js';
import {onRequestGet as state} from './player-state.js';
import {onRequestGet as control} from './player-control.js';
import {onRequestGet as notice} from './notice-active.js';
import {onRequestGet as black} from './black-mode.js';
// Manual read-only probe. Never poll this endpoint from TVs or the dashboard.
export async function onRequestGet({request,env}) {
 const url=new URL(request.url),store=cleanSlug(url.searchParams.get('store')||'');
 if(!store)return json({ok:false,error:'store가 필요합니다.'},400);
 if(!env.DB)return json({ok:false,error:'D1 binding DB is missing'},503);
 const routes=[['player-state',state],['player-control',control]],measurements=[];
 for(const [path,handler] of routes){
  const metered=meterDatabase(env.DB),probe=new URL(`/api/${path}`,url.origin);probe.searchParams.set('store',store);
  const response=await handler({request:new Request(probe),env:{...env,DB:metered.DB}});
  const body=await response.json();if(!response.ok||body.ok===false||body.degraded)return json({ok:false,error:body.error||'측정 중 API 실패',endpoint:path},503);
  measurements.push({endpoint:path,...metered.stats});
 }
 return json({ok:true,store,measurements,scope:'이 매장의 현재 편성으로 각 API를 한 번 조회한 실제 D1 meta 값입니다. 100대 전체 보장 값이 아닙니다.',writesMustBeZero:measurements.every(x=>x.rowsWritten===0),dailyReadFormula:'각 경로 rowsRead × (86400000 / 해당 TV의 실제 폴링 간격 ms)를 모든 TV에 대해 합산하고 CMS/상태/로그 조회량을 더합니다.',serverNowUtc:new Date().toISOString()});
}
