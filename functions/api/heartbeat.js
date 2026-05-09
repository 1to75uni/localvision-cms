import {
  json,
  LV_CORE_VERSION,
  cleanSlug,
  normalizeLvId,
  findStoreForAppConfig,
  mapDevice,
  nowUtcIso,
  nowKstString,
  parseLastSeenMs,
  onlineTtlSec,
  DEFAULT_D1_HEARTBEAT_WRITE_SEC,
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

async function readBody(request) { try { return await request.json() } catch { return {} } }

function safeStoreDeviceId(store = '') {
  const clean = cleanSlug(store) || String(store || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return `tv_${clean}`
}

function makePlayerAppLabel(body = {}) {
  const version = String(body.playerVersion || body.source || 'v1.7.3-content-sync-field-log').trim()
  const appShell = body.appShell ? ` · APP Shell${body.appVersion ? ` ${body.appVersion}` : ''}` : ''
  const play = body.playStatus ? ` · ${body.playStatus}` : ''
  return `Player ${version}${appShell}${play}`.slice(0, 240)
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const body = await readBody(request)
  let store = cleanSlug(body.store || '')
  const appId = normalizeLvId(body.appId || body.id || '')
  if (!store && appId) {
    const row = await findStoreForAppConfig(env, appId)
    store = cleanSlug(row?.slug || '')
  }
  if (!store) return json({ ok: false, error: 'store or id is required' }, 400)

  const canonicalId = safeStoreDeviceId(store)
  const now = nowUtcIso()
  const lastSeen = body.lastSeen || now
  const app = makePlayerAppLabel(body)
  const name = String(body.name || `${store} TV`).slice(0, 120)
  const role = String(body.role || 'player').slice(0, 40)
  const deviceCode = String(body.deviceCode || `LV-${store.toUpperCase()}-01`).slice(0, 120)

  let current = await env.DB.prepare(`SELECT * FROM devices WHERE id = ? LIMIT 1`).bind(canonicalId).first()
  if (!current) {
    current = await env.DB.prepare(`
      SELECT * FROM devices
      WHERE store = ?
      ORDER BY
        CASE WHEN last_seen IS NULL OR last_seen = '' OR last_seen = '아직 접속 없음' THEN 1 ELSE 0 END ASC,
        last_seen DESC,
        updated_at DESC,
        created_at DESC
      LIMIT 1
    `).bind(store).first()
  }

  if (!current) {
    await env.DB.prepare(`
      INSERT INTO devices
      (id, store, name, role, online, last_seen, app, device_code, last_command, command_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(canonicalId, store, name, role, lastSeen, app, deviceCode).run()
    const inserted = await env.DB.prepare(`SELECT * FROM devices WHERE id = ? LIMIT 1`).bind(canonicalId).first()
    return json({
      ok: true,
      version: LV_CORE_VERSION,
      endpoint: '/api/heartbeat',
      mode: 'inserted',
      d1Written: true,
      d1WritePolicySec: Number(env.D1_HEARTBEAT_WRITE_SEC || DEFAULT_D1_HEARTBEAT_WRITE_SEC),
      updatedAt: now,
      updatedAtKst: nowKstString(),
      device: mapDevice(inserted || { id: canonicalId, store, name, role, online: 1, last_seen: lastSeen, app, device_code: deviceCode }, env),
    })
  }

  const nowMs = Date.now()
  const lastWrittenMs = parseLastSeenMs(current.last_seen || current.lastSeen || '', nowMs)
  const writeSec = Math.max(0, Number(env.D1_HEARTBEAT_WRITE_SEC || DEFAULT_D1_HEARTBEAT_WRITE_SEC || 600))
  const wasFresh = lastWrittenMs > 0 && nowMs - lastWrittenMs <= onlineTtlSec(env) * 1000
  const appChanged = String(current.app || '') !== app
  const commandCarry = {
    last_command: current.last_command || '',
    command_at: current.command_at || '',
  }
  const shouldWrite = !lastWrittenMs || !wasFresh || appChanged || writeSec <= 0 || nowMs - lastWrittenMs >= writeSec * 1000

  if (!shouldWrite) {
    return json({
      ok: true,
      version: LV_CORE_VERSION,
      endpoint: '/api/heartbeat',
      mode: 'accepted-d1-skipped',
      d1Written: false,
      d1WritePolicySec: writeSec,
      updatedAt: now,
      updatedAtKst: nowKstString(),
      device: mapDevice({ ...current, store, last_seen: lastSeen, lastSeen, online: 1, app, role, updatedAt: now, ...commandCarry }, env),
    })
  }

  await env.DB.prepare(`
    UPDATE devices
    SET store = ?, name = ?, role = ?, online = 1, last_seen = ?, app = ?,
        device_code = COALESCE(NULLIF(device_code, ''), ?), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? OR store = ?
  `).bind(store, name, role, lastSeen, app, deviceCode, current.id || canonicalId, store).run()

  const row = await env.DB.prepare(`SELECT * FROM devices WHERE store = ? ORDER BY last_seen DESC, updated_at DESC LIMIT 1`).bind(store).first()
  return json({
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/heartbeat',
    mode: 'written',
    d1Written: true,
    d1WritePolicySec: writeSec,
    updatedAt: now,
    updatedAtKst: nowKstString(),
    device: mapDevice(row || { id: canonicalId, store, name, role, online: 1, last_seen: lastSeen, app, device_code: deviceCode }, env),
  })
}

export async function onRequestPatch(ctx) { return onRequestPost(ctx) }
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  return onRequestPost({ request: new Request(request.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ store: url.searchParams.get('store') || '', id: url.searchParams.get('id') || '', source: 'heartbeat-get' }) }), env })
}
