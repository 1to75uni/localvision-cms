import {json,cleanSlug,nowUtcIso} from '../_lib/localvision-core.js'
import {limitedBody,saveEvents,normalizedEvent,missingTable,healthError,HEALTH_VERSION} from '../_lib/playback-health.js'
export async function onRequestOptions(){return json({ok:true})}
export async function onRequestPost({request,env}) {
  try {
    if(!env.DB) throw new Error('D1 binding DB is missing')
    const body=await limitedBody(request)
    const entries=Array.isArray(body.errors)?body.errors:Array.isArray(body.items)?body.items:[body]
    if(!entries.length || entries.length>50)return json({ok:false,error:'로그는 요청당 1~50개가 필요합니다.',acknowledged:[]},400)
    const saved=await saveEvents(env,entries,{store:body.store,deviceId:body.deviceId})
    return json(saved,saved.ok?200:400)
  }catch(error){return healthError(error)}
}
export async function onRequestGet({request,env}) {
  if(!env.DB)return healthError(new Error('D1 binding DB is missing'))
  const url=new URL(request.url),store=cleanSlug(url.searchParams.get('store') || ''),deviceId=String(url.searchParams.get('deviceId') || '').slice(0,160)
  const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')) || 50)),conditions=[],params=[]
  if(store){conditions.push('store=?');params.push(store)}
  if(deviceId){conditions.push('device_id=?');params.push(deviceId)}
  const where=conditions.length?'WHERE '+conditions.join(' AND '):''
  const errors=[],diagnostics=[];let initialized=false
  try {
    try {
      const rows=await env.DB.prepare(`SELECT * FROM player_events ${where} ORDER BY received_at DESC LIMIT ?`).bind(...params,limit).all()
      errors.push(...(rows.results || []).map(normalizedEvent));initialized=true
    }catch(error){if(!missingTable(error))throw error}
    try {
      const rows=await env.DB.prepare(`SELECT * FROM player_errors ${where} ORDER BY created_at DESC LIMIT ?`).bind(...params,limit).all()
      for(const row of rows.results || []) {
        const value=normalizedEvent({...row,event_at:row.updated_at || row.created_at})
        value.legacy=true;value.count=Number(row.count || 1)
        if(value.count>1)value.message+=` · 과거 집계 ${value.count}회`
        errors.push(value)
      }
    }catch(error){if(!missingTable(error))diagnostics.push('과거 로그 조회 실패: '+error.message)}
    errors.sort((a,b)=>Date.parse(b.createdAtUtc)-Date.parse(a.createdAtUtc))
    return json({ok:true,degraded:diagnostics.length>0,initialized,errors:errors.slice(0,limit),diagnostics,serverNowUtc:nowUtcIso(),version:HEALTH_VERSION})
  }catch(error){return healthError(error)}
}
export async function onRequestDelete({request,env}) {
  const url=new URL(request.url),store=cleanSlug(url.searchParams.get('store') || ''),deviceId=String(url.searchParams.get('deviceId') || '').slice(0,160)
  if(!store && !deviceId)return json({ok:false,error:'store 또는 deviceId가 필요합니다.'},400)
  if(!env.DB)return healthError(new Error('D1 binding DB is missing'))
  const where=[],params=[];if(store){where.push('store=?');params.push(store)}if(deviceId){where.push('device_id=?');params.push(deviceId)}
  try {
    for(const table of ['player_events','player_errors']) {
      try{await env.DB.prepare(`DELETE FROM ${table} WHERE ${where.join(' AND ')}`).bind(...params).run()}catch(error){if(!missingTable(error))throw error}
    }
    return json({ok:true})
  }catch(error){return healthError(error)}
}
