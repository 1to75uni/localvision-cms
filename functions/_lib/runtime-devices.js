// Project persisted v3 status onto the legacy CMS cards without another heartbeat write.
export async function projectRuntimeDevices(env,devices){
 let rows
 try{rows=(await env.DB.prepare(`SELECT installation,store,received_at,json_extract(summary_json,'$.playerVersion') AS player_version FROM lv_runtime ORDER BY received_at DESC LIMIT 500`).all()).results||[]}
 catch(e){if(/no such table/.test(e.message))return devices;throw e}
 const byStore=new Map(),byId=new Map()
 for(const r of rows){byId.set(r.installation,r);if(!byStore.has(r.store))byStore.set(r.store,r)}
 return devices.map(d=>{
   const r=byId.get(d.id)||byStore.get(d.store);if(!r)return d
   const age=Math.max(0,Date.now()-r.received_at),time=new Date(r.received_at).toISOString(),connectionStatus=age>=1800000?'연결 확인 필요':age>1200000?'상태 오래됨':'최근 저장 정상'
   return {...d,lastSeen:time,lastSeenAt:time,lastSeenSecondsAgo:Math.floor(age/1000),lastSeenAgo:Math.floor(age/60000)+'분 전 저장',online:age<1800000,connectionStatus,offlineReason:age>=1800000?'TV 전원 상태는 알 수 없습니다. 마지막 저장 상태 확인 필요':'',app:`Player ${r.player_version||'v3.0.0'} · ${connectionStatus}`,statusSource:'D1-20min-save',installation:r.installation}
 })
}
