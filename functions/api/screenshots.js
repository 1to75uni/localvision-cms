import {reserve,finishReservation} from '../_lib/storage-v3.js'
import { json as coreJson, safeErrorMessage, tryRun, cleanSlug } from '../_lib/localvision-core.js'

const ENDPOINT = '/api/screenshots'
function json(data, status = 200) { return coreJson(data, status) }
export async function onRequestOptions() { return json({ ok: true }) }

function makePublicUrl(request, env, key) {
  const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/$/, '')
  if (publicBase) return `${publicBase}/${key}`
  const url = new URL(request.url)
  return `${url.origin}/api/media?key=${encodeURIComponent(key)}`
}

function levenshtein(a = '', b = '') {
  a = String(a || '')
  b = String(b || '')
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

async function resolveStoreCandidates(env, requestedStore = '', diagnostics = []) {
  const requested = cleanSlug(requestedStore || '')
  if (!requested || !env.DB) return { requested, candidates: requested ? [requested] : [], suggestions: [] }
  const slugs = new Set([requested])
  try {
    const storeRows = await env.DB.prepare(`SELECT slug FROM stores WHERE COALESCE(slug, '') <> '' LIMIT 300`).all()
    for (const row of storeRows.results || []) if (row.slug) slugs.add(cleanSlug(row.slug))
  } catch (error) { diagnostics.push(`storeSlugScan: ${safeErrorMessage(error)}`) }
  try {
    const deviceRows = await env.DB.prepare(`SELECT store FROM devices WHERE COALESCE(store, '') <> '' LIMIT 300`).all()
    for (const row of deviceRows.results || []) if (row.store) slugs.add(cleanSlug(row.store))
  } catch (error) { diagnostics.push(`deviceStoreScan: ${safeErrorMessage(error)}`) }
  const known = [...slugs].filter(Boolean)
  const exact = known.includes(requested)
  const suggestions = known
    .filter((slug) => slug && slug !== requested)
    .map((slug) => ({ slug, distance: levenshtein(requested, slug) }))
    .filter((x) => x.distance <= Math.max(2, Math.ceil(Math.max(requested.length, x.slug.length) * 0.35)))
    .sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug))
    .slice(0, 3)
    .map((x) => x.slug)
  const candidates = [requested]
  return { requested, candidates: [...new Set(candidates.filter(Boolean))], suggestions, storeExists: exact }
}

async function lightweightEnsureScreenshotTable(env, diagnostics = []) {
  if (!env.DB) return false
  const create = await tryRun(env, `
    CREATE TABLE IF NOT EXISTS device_screenshots (
      id TEXT PRIMARY KEY,
      device_id TEXT DEFAULT '',
      store TEXT DEFAULT '',
      url TEXT DEFAULT '',
      r2_key TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    )
  `)
  if (create?.ok === false) diagnostics.push(`createTable: ${create.error}`)
  for (const [column, definition] of [
    ['device_id', `TEXT DEFAULT ''`],
    ['store', `TEXT DEFAULT ''`],
    ['url', `TEXT DEFAULT ''`],
    ['r2_key', `TEXT DEFAULT ''`],
    ['created_at', `TEXT DEFAULT ''`],
  ]) {
    const res = await tryRun(env, `ALTER TABLE device_screenshots ADD COLUMN ${column} ${definition}`)
    if (res?.ok === false && !String(res.error || '').toLowerCase().includes('duplicate column')) diagnostics.push(`addColumn ${column}: ${res.error}`)
  }
  for (const sql of [
    `CREATE INDEX IF NOT EXISTS idx_device_screenshots_device_created ON device_screenshots(device_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_device_screenshots_store_created ON device_screenshots(store, created_at)`,
  ]) {
    const res = await tryRun(env, sql)
    if (res?.ok === false) diagnostics.push(`index: ${res.error}`)
  }
  return true
}

async function latestR2Screenshot(request, env, store, diagnostics = []) {
  if (!env.MEDIA || !store) return null
  try {
    const page = await env.MEDIA.list({ prefix: `system/screenshots/${store}/`, limit: 200 })
    const latest = (page.objects || [])
      .filter((obj) => String(obj.key || '').toLowerCase().endsWith('.png'))
      .sort((a, b) => {
        const au = a.uploaded ? new Date(a.uploaded).getTime() : 0
        const bu = b.uploaded ? new Date(b.uploaded).getTime() : 0
        if (au !== bu) return bu - au
        return String(b.key || '').localeCompare(String(a.key || ''))
      })[0]
    if (!latest) return null
    const parts = latest.key.split('/')
    const deviceId = parts[3] || `tv_${store}`
    return { id: `r2_${latest.key.replace(/[^a-zA-Z0-9_-]/g, '_')}`, deviceId, store, url: makePublicUrl(request, env, latest.key), r2Key: latest.key, createdAt: latest.uploaded ? new Date(latest.uploaded).toISOString() : new Date().toISOString(), source: 'r2-fallback' }
  } catch (error) {
    diagnostics.push(`r2Screenshot: ${safeErrorMessage(error)}`)
    return null
  }
}

async function readLatestFromD1(env, storeCandidates, deviceId, diagnostics = []) {
  const tryQueries = []
  if (storeCandidates.length && !deviceId) {
    tryQueries.push({
      mode: 'store-based',
      sql: `
        SELECT id, device_id AS deviceId, store, url, r2_key AS r2Key, created_at AS createdAt
        FROM device_screenshots
        WHERE store IN (${storeCandidates.map(() => '?').join(',')})
        ORDER BY created_at DESC
        LIMIT 1
      `,
      params: storeCandidates,
    })
  }
  if (deviceId) {
    tryQueries.push({
      mode: 'deviceId-fallback',
      sql: `
        SELECT id, device_id AS deviceId, store, url, r2_key AS r2Key, created_at AS createdAt
        FROM device_screenshots
        WHERE device_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      params: [deviceId],
    })
  }
  for (const q of tryQueries) {
    try {
      const row = await env.DB.prepare(q.sql).bind(...q.params).first()
      if (row) return { ok: true, mode: q.mode, row }
    } catch (error) {
      diagnostics.push(`${q.mode}: ${safeErrorMessage(error)}`)
    }
  }
  return { ok: true, mode: 'empty', row: null }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const requestedStore = cleanSlug(url.searchParams.get('store') || '')
  const deviceId = String(url.searchParams.get('deviceId') || '').trim()
  const fallback = ['1', 'true', 'yes'].includes(String(url.searchParams.get('fallback') || '').toLowerCase())
  if (!requestedStore && !deviceId) return json({ ok: false, error: 'store or deviceId is required', endpoint: ENDPOINT }, 400)

  const diagnostics = []
  if (!env.DB) return json({ ok: true, degraded: true, endpoint: ENDPOINT, mode: 'no-db', screenshot: null, diagnostics: ['D1 binding DB is missing'] })
  try {
    // 기본 조회는 D1만 봅니다. R2 탐색은 fallback=1일 때만 실행해서 503/타임아웃을 막습니다.
    const storeResolution = await resolveStoreCandidates(env, requestedStore, diagnostics)
    const selected = await readLatestFromD1(env, storeResolution.candidates, deviceId, diagnostics)
    let row = selected.row
    let mode = selected.mode
    if (!row && fallback && storeResolution.candidates.length) {
      row = await latestR2Screenshot(request, env, storeResolution.candidates[0], diagnostics)
      mode = row ? 'r2-fallback' : mode
    }
    return json({
      ok: true,
      degraded: diagnostics.length > 0,
      endpoint: ENDPOINT,
      mode,
      requestedStore,
      storeCandidates: storeResolution.candidates,
      storeSuggestions: storeResolution.suggestions,
      storeExists: storeResolution.storeExists,
      fallbackUsed: Boolean(fallback),
      screenshot: row || null,
      diagnostics,
    })
  } catch (error) {
    return json({ ok: true, degraded: true, endpoint: ENDPOINT, mode: 'safe-empty', screenshot: null, diagnostics: [...diagnostics, safeErrorMessage(error)] })
  }
}

export async function onRequestPost({ request, env }) {
 let reservation=''
 try {
  if(!env.DB || !env.MEDIA)return json({ok:false,saved:false,error:'D1/R2 unavailable'},503)
  const form=await request.formData(),file=form.get('file'),store=cleanSlug(form.get('store')||''),deviceId=String(form.get('deviceId')||'').trim()
  if(!store||!deviceId||!file||typeof file==='string')return json({ok:false,saved:false,error:'file,store,deviceId required'},400)
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(deviceId)||file.size>4*1024*1024)return json({ok:false,saved:false,error:'Invalid screenshot size or device'},400)
  const signature=new Uint8Array(await file.slice(0,8).arrayBuffer())
  if(signature.join(',')!=='137,80,78,71,13,10,26,10')return json({ok:false,saved:false,error:'PNG required'},422)
  const registered=await env.DB.prepare('SELECT slug FROM stores WHERE slug=?').bind(store).first();if(!registered)return json({ok:false,saved:false,error:'Unknown store'},404)
  const now=new Date().toISOString(),id=crypto.randomUUID(),key=`system/screenshots/${store}/${deviceId}/${id}.png`
  reservation=id;await reserve(env,id,file.size,{key},'screenshot')
  await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:'image/png',cacheControl:'public,max-age=3600'}})
  await finishReservation(env,id,file.size,key,'screenshot')
  const shot={id,deviceId,store,r2Key:key,url:makePublicUrl(request,env,key),createdAt:now}
  await env.DB.prepare('INSERT INTO device_screenshots(id,device_id,store,url,r2_key,created_at) VALUES(?,?,?,?,?,?)').bind(id,deviceId,store,shot.url,key,now).run()
  // The installed APP omits commandId. Never mark all store TVs or a newer command as complete.
  return json({ok:true,saved:true,screenshot:shot,correlation:'unconfirmed-native-upload'})
 }catch(error){return json({ok:false,saved:false,error:safeErrorMessage(error)},503)}
}
