import {json, cleanSlug, nowUtcIso, toKstString} from './localvision-core.js'
export const HEALTH_VERSION = 'v2.1.0-stable-playback'
const migrations = [
  `CREATE TABLE IF NOT EXISTS player_events (id TEXT PRIMARY KEY, store TEXT NOT NULL, device_id TEXT NOT NULL DEFAULT '', error_code TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'error', message TEXT NOT NULL DEFAULT '', event_at TEXT NOT NULL, received_at TEXT NOT NULL, extra_json TEXT NOT NULL DEFAULT '{}')`,
  `CREATE INDEX IF NOT EXISTS idx_player_events_store_time ON player_events(store, received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_player_events_device_time ON player_events(device_id, received_at DESC)`,
  `CREATE TABLE IF NOT EXISTS player_status (device_id TEXT PRIMARY KEY, store TEXT NOT NULL, session_id TEXT NOT NULL, boot_sequence INTEGER NOT NULL DEFAULT 0, sequence INTEGER NOT NULL DEFAULT 0, received_at TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}')`,
  `CREATE INDEX IF NOT EXISTS idx_player_status_store ON player_status(store, received_at DESC)`,
]
const pendingSchemas = new WeakMap()
export const missingTable = error => /no such table|does not exist/i.test(String(error?.message || error))
export async function withPlaybackSchema(env, action) {
  if (!env.DB) throw new Error('D1 binding DB is missing')
  try {return await action()} catch(error) {
    if (!missingTable(error)) throw error
    let job=pendingSchemas.get(env.DB)
    if(!job) {job=env.DB.batch(migrations.map(sql=>env.DB.prepare(sql)));pendingSchemas.set(env.DB,job)}
    try {await job} finally {pendingSchemas.delete(env.DB)}
    return action()
  }
}
export async function limitedBody(request, maxBytes=1024*1024) {
  if(Number(request.headers.get('content-length') || 0)>maxBytes) throw Object.assign(new Error('요청 데이터가 너무 큽니다.'),{status:413})
  const text=await request.text()
  if(new TextEncoder().encode(text).byteLength>maxBytes) throw Object.assign(new Error('요청 데이터가 너무 큽니다.'),{status:413})
  try {const value=JSON.parse(text);if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('shape');return value} catch (_) {throw Object.assign(new Error('올바른 JSON 객체 요청이 필요합니다.'),{status:400})}
}
const str=(value,max=200)=>String(value ?? '').slice(0,max)
const num=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):0
function validTime(value,fallback) {const n=Date.parse(value);return Number.isFinite(n)?new Date(n).toISOString():fallback}
function safeExtra(extra={}) {
  let result=extra && typeof extra==='object'&&!Array.isArray(extra)?extra:{}
  if(JSON.stringify(result).length>16000) {
    result=Object.fromEntries(['side','itemId','fileName','title','sourceUrl','attemptId','phase','currentTime','duration','playedMs','category','failCount','name','mediaCode','readyState','networkState','reasonCode','retryAt','playerVersion','sessionId','timeUtc','timeKst'].map(k=>[k,result[k]]))
    result.truncated=true
  }
  return JSON.stringify(result)
}
export async function saveEvents(env, entries, inherited={}) {
  const now=nowUtcIso(), valid=[], rejected=[]
  for (let i=0;i<entries.length;i++) {
    const raw={...inherited,...entries[i]},store=cleanSlug(raw.store || ''),deviceId=str(raw.deviceId,160)
    const id=str(raw.id || raw.eventId || `pe_${crypto.randomUUID()}`,200)
    if(!store || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(id)) {rejected.push({index:i,id,error:'유효한 매장 코드와 로그 ID가 필요합니다.'});continue}
    const extra={...(raw.extra || {}),href:str(raw.href,1000),userAgent:str(raw.userAgent,500)}
    valid.push({id,index:i,store,deviceId,code:str(raw.errorCode || 'LV-UNKNOWN',100),level:['debug','info','warning','error','fatal'].includes(raw.level)?raw.level:'error',message:str(raw.message || raw.error || 'Player event',1000),eventAt:validTime(raw.timeUtc || raw.time,now),extra:safeExtra(extra)})
  }
  if(!valid.length) return {ok:false,acknowledged:[],saved:0,rejected,error:'저장할 유효한 로그가 없습니다.'}
  const results=await withPlaybackSchema(env,()=>env.DB.batch(valid.map(e=>env.DB.prepare(`INSERT INTO player_events (id,store,device_id,error_code,level,message,event_at,received_at,extra_json) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(e.id,e.store,e.deviceId,e.code,e.level,e.message,e.eventAt,now,e.extra))))
  const acknowledged=valid.filter((_,i)=>results[i]?.success===true).map(e=>e.id)
  return {ok:acknowledged.length>0,acknowledged,saved:acknowledged.length,received:entries.length,rejected,serverNowUtc:now,version:HEALTH_VERSION}
}
export function normalizedEvent(row) {
  let extra={};try{extra=JSON.parse(row.extra_json || '{}')}catch(_){}
  const at=row.event_at || row.created_at || row.received_at
  return {id:row.id,store:row.store,deviceId:row.device_id || '',errorCode:row.error_code,level:row.level,message:row.message,rawMessage:row.message,createdAt:toKstString(at),createdAtUtc:at,receivedAt:row.received_at || '',count:1,extra,href:extra.href || '',userAgent:extra.userAgent || ''}
}
function lane(raw={}) {
  const states=['empty','loading','starting','playing','image','retrying','quarantined','fallback','paused','stopped']
  return {side:str(raw.side,10),status:states.includes(raw.status)?raw.status:'unknown',reason:str(raw.reason,300),itemId:str(raw.itemId),fileName:str(raw.fileName,300),title:str(raw.title,300),type:str(raw.type,20),currentTime:num(raw.currentTime,0,86400),duration:num(raw.duration,0,86400),frameCount:num(raw.frameCount),firstFrameAt:str(raw.firstFrameAt,40),lastProgressAt:str(raw.lastProgressAt,40),lastCompletedAt:str(raw.lastCompletedAt,40),playlistCount:num(raw.playlistCount,0,5000),index:num(raw.index,0,5000),lastError:raw.lastError?{code:str(raw.lastError.code,100),message:str(raw.lastError.message,500),at:str(raw.lastError.at,40),count:num(raw.lastError.count)}:null,
    exclusions:(Array.isArray(raw.exclusions)?raw.exclusions:[]).slice(0,300).map(x=>({itemId:str(x.itemId),fileName:str(x.fileName,300),title:str(x.title,300),side:str(x.side,10),code:str(x.code,100),reason:str(x.reason,300),failCount:num(x.failCount),retryAt:num(x.retryAt),excludedAt:num(x.excludedAt)}))}
}
function deliveryState(raw={}) {
 const phases=['idle','preparing','downloading','verifying','ready','applied','restored','blocked'];
 const value={phase:phases.includes(raw.phase)?raw.phase:'unknown',target:str(raw.target,200),completed:num(raw.completed,0,10000),total:num(raw.total,0,10000),verified:num(raw.verified,0,10000),legacy:num(raw.legacy,0,10000),fileName:str(raw.fileName,300),error:str(raw.error,500),appliedAt:str(raw.appliedAt,40)};
 if(raw.prefetch)value.prefetch={...deliveryState({...raw.prefetch,prefetch:null}),group:str(raw.prefetch.group,200),at:str(raw.prefetch.at,40)};
 return value;
}
export function sanitizeHealth(raw={}) {
  return {store:cleanSlug(raw.store || ''),deviceId:str(raw.deviceId,160),appId:str(raw.appId,100),sessionId:str(raw.sessionId,160),bootSequence:num(raw.bootSequence),sequence:num(raw.sequence),playerVersion:str(raw.playerVersion,120),appVersion:str(raw.appVersion,120),sentAt:str(raw.sentAt,40),heartbeatMs:num(raw.heartbeatMs,1000,3600000),userAgent:str(raw.userAgent,500),visibility:str(raw.visibility,20),blackMode:raw.blackMode===true,notice:raw.notice===true,
    left:lane(raw.left),right:lane(raw.right),outbox:{pending:num(raw.outbox?.pending),durable:raw.outbox?.durable!==false,dropped:num(raw.outbox?.dropped),lastSuccess:str(raw.outbox?.lastSuccess,40),lastError:str(raw.outbox?.lastError,300),volatileStorage:raw.outbox?.volatileStorage===true},
    delivery:deliveryState(raw.delivery),
    cache:{status:str(raw.cache?.status,100),budgetMB:num(raw.cache?.budgetMB,0,16384)},schedule:{activeKey:str(raw.schedule?.activeKey),status:str(raw.schedule?.status,300)},
    metrics:{started:num(raw.metrics?.started),completed:num(raw.metrics?.completed),interrupted:num(raw.metrics?.interrupted),failed:num(raw.metrics?.failed),skipped:num(raw.metrics?.skipped)},
    lastCommand:raw.lastCommand?{command:str(raw.lastCommand.command,100),commandAt:str(raw.lastCommand.commandAt,100),status:str(raw.lastCommand.status,100),reportedAt:str(raw.lastCommand.reportedAt,40)}:null}
}
export async function saveHealth(env, raw) {
  const value=sanitizeHealth(raw)
  if(!value.store || !value.deviceId || !value.sessionId) throw Object.assign(new Error('store, deviceId, sessionId가 필요합니다.'),{status:400})
  const now=nowUtcIso()
  const result=await withPlaybackSchema(env,()=>env.DB.prepare(`INSERT INTO player_status (device_id,store,session_id,boot_sequence,sequence,received_at,payload_json) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(device_id) DO UPDATE SET store=excluded.store,session_id=excluded.session_id,boot_sequence=excluded.boot_sequence,sequence=excluded.sequence,received_at=excluded.received_at,payload_json=excluded.payload_json
    WHERE excluded.boot_sequence > player_status.boot_sequence OR (excluded.boot_sequence = player_status.boot_sequence AND excluded.session_id = player_status.session_id AND excluded.sequence > player_status.sequence)`)
    .bind(value.deviceId,value.store,value.sessionId,value.bootSequence,value.sequence,now,JSON.stringify(value)).run())
  return {ok:true,healthAccepted:true,updated:Boolean(result?.meta?.changes),receivedAt:now}
}
export function mappedHealth(row, now=Date.now()) {
  let payload={};try{payload=JSON.parse(row.payload_json)}catch(_){}
  const age=Math.max(0,Math.floor((now-Date.parse(row.received_at))/1000))
  const ttl=Math.max(120,Math.min(7200,Math.ceil((payload.heartbeatMs || 300000)*2/1000)+30))
  const stale=!Number.isFinite(age) || age>ttl
  const problem=[payload.left,payload.right].some(x=>['retrying','quarantined','fallback','stopped','unknown'].includes(x?.status) || x?.exclusions?.length)
  const operational=payload.blackMode?'black-mode':payload.notice?'notice':payload.visibility==='hidden'?'hidden':problem?'degraded':
    [payload.left,payload.right].some(x=>['loading','starting'].includes(x?.status))?'preparing':
    [payload.left,payload.right].some(x=>['playing','image'].includes(x?.status))?'healthy':'unknown'
  return {...payload,deviceId:row.device_id,store:row.store,receivedAt:row.received_at,receivedAtKst:toKstString(row.received_at),ageSeconds:age,ttlSeconds:ttl,stale,status:stale?'stale':operational}
}
export async function readHealth(env, store='', deviceId='') {
  if(!env.DB) throw new Error('D1 binding DB is missing')
  const where=[],params=[]
  if(store){where.push('store=?');params.push(cleanSlug(store))}
  if(deviceId){where.push('device_id=?');params.push(deviceId)}
  try {
    const rows=await env.DB.prepare(`SELECT * FROM player_status ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY received_at DESC LIMIT 1000`).bind(...params).all()
    return {ok:true,initialized:true,devices:(rows.results || []).map(row=>mappedHealth(row)),serverNowUtc:nowUtcIso(),version:HEALTH_VERSION}
  } catch(error) {if(missingTable(error))return {ok:true,initialized:false,devices:[],serverNowUtc:nowUtcIso(),version:HEALTH_VERSION};throw error}
}
export function healthError(error) {return json({ok:false,error:String(error?.message || error).slice(0,500),version:HEALTH_VERSION},error.status || 503)}
