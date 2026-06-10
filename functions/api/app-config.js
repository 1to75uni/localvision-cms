import {
  json,
  ensureCoreSchema,
  normalizeLvId,
  cleanSlug,
  findStoreForAppConfig,
  buildPlayerUrl,
  playerBaseUrl,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_COMMAND_POLL_MS,
  DEFAULT_NOTICE_POLL_MS,
  DEFAULT_CONTENT_CHECK_MS,
  DEFAULT_D1_HEARTBEAT_WRITE_SEC,
  DEFAULT_APP_CONFIG_POLL_MS,
  DEFAULT_PLAYER_STATE_POLL_MS,
  DEFAULT_BLACK_MODE_POLL_MS,
  LV_CORE_VERSION,
  nowUtcIso,
  nowKstString,
  toKstString,
  safeErrorMessage,
  tryRun,
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

async function readBody(request) { try { return await request.json() } catch { return {} } }

function cleanStoreSlug(value = '') { return cleanSlug(value) }

function configResponse(request, env, store, diagnostics = []) {
  const appId = normalizeLvId(store.appId || store.app_id || '')
  const slug = cleanStoreSlug(store.slug || store.store || '')
  const overrideUrl = String(store.playerUrl || store.player_url || '').trim()
  const generatedPlayerUrl = buildPlayerUrl(request, env, slug, '', appId)
  const playerUrl = buildPlayerUrl(request, env, slug, overrideUrl, appId)
  const isActive = !['중지', '비활성', '사용안함', 'inactive', 'disabled'].includes(String(store.status || '').toLowerCase())
  return {
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/app-config',
    id: appId,
    appId,
    store: slug,
    storeName: store.name || slug,
    status: store.status || '운영중',
    active: isActive,
    playerUrl,
    generatedPlayerUrl,
    playerBaseUrl: playerBaseUrl(request, env),
    hasCustomPlayerUrl: Boolean(overrideUrl),
    playerUrlUpdatedAt: store.playerUrlUpdatedAt || store.player_url_updated_at || '',
    defaults: {
      heartbeat: DEFAULT_HEARTBEAT_MS,
      commandPoll: DEFAULT_COMMAND_POLL_MS,
      noticePollMs: DEFAULT_NOTICE_POLL_MS,
      playerStatePollMs: DEFAULT_PLAYER_STATE_POLL_MS,
      blackModePollMs: DEFAULT_BLACK_MODE_POLL_MS,
      appConfigPollMs: DEFAULT_APP_CONFIG_POLL_MS,
      contentCheck: DEFAULT_CONTENT_CHECK_MS,
      onlineTtlSec: Number(env.ONLINE_TTL_SEC || 1800),
      d1HeartbeatWriteSec: Number(env.D1_HEARTBEAT_WRITE_SEC || DEFAULT_D1_HEARTBEAT_WRITE_SEC),
      heartbeatWritePolicy: 'd1-write-every-10-min-or-status-change',
      defaultDurationSec: 20,
    },
    updatedAt: nowUtcIso(),
    updatedAtKst: nowKstString(),
    playerUrlUpdatedAtKst: store.playerUrlUpdatedAt || store.player_url_updated_at ? toKstString(store.playerUrlUpdatedAt || store.player_url_updated_at) : '',
    diagnostics,
  }
}

async function safeFindStore(env, lookup, diagnostics = []) {
  try {
    const store = await findStoreForAppConfig(env, lookup)
    if (store) return store
  } catch (error) { diagnostics.push(`findStoreForAppConfig: ${safeErrorMessage(error)}`) }
  // 오래된 D1 스키마와 섞였을 때 app_id/player_url 컬럼 문제로 정식 쿼리가 실패할 수 있어 최소 컬럼 fallback을 사용합니다.
  const raw = String(lookup || '').trim()
  const appId = normalizeLvId(raw)
  const slug = cleanStoreSlug(raw)
  const attempts = [
    { sql: `SELECT id, app_id AS appId, name, slug, status, player_url AS playerUrl, player_url_updated_at AS playerUrlUpdatedAt FROM stores WHERE lower(app_id) = lower(?) OR slug = ? OR id = ? LIMIT 1`, binds: [appId || raw, slug || raw, raw] },
    { sql: `SELECT id, name, slug, status FROM stores WHERE slug = ? OR id = ? LIMIT 1`, binds: [slug || raw, raw] },
  ]
  for (const attempt of attempts) {
    try {
      const row = await env.DB.prepare(attempt.sql).bind(...attempt.binds).first()
      if (row) return row
    } catch (error) { diagnostics.push(`fallbackFind: ${safeErrorMessage(error)}`) }
  }
  return null
}

async function ensureAppConfigSchema(env, diagnostics = []) {
  try { await ensureCoreSchema(env) } catch (error) { diagnostics.push(`ensureCoreSchema: ${safeErrorMessage(error)}`) }
  // APP ID 관련 컬럼은 없으면 안전하게 보강하되, 실패해도 전체 API를 죽이지 않습니다.
  const patches = [
    `ALTER TABLE stores ADD COLUMN app_id TEXT DEFAULT ''`,
    `ALTER TABLE stores ADD COLUMN player_url TEXT DEFAULT ''`,
    `ALTER TABLE stores ADD COLUMN player_url_updated_at TEXT DEFAULT ''`,
  ]
  for (const sql of patches) {
    const res = await tryRun(env, sql)
    if (res?.ok === false && !String(res.error || '').includes('duplicate column')) diagnostics.push(`schemaPatch: ${res.error}`)
  }
}

function lookupFromRequest(request) {
  const url = new URL(request.url)
  return url.searchParams.get('id') || url.searchParams.get('appId') || url.searchParams.get('app_id') || url.searchParams.get('store') || ''
}

export async function onRequestGet({ request, env }) {
  const diagnostics = []
  const lookup = lookupFromRequest(request)
  if (!lookup) return json({ ok: false, error: 'id is required. example: /api/app-config?id=lv001', endpoint: '/api/app-config' }, 400)
  if (!env.DB) return json({ ok: true, degraded: true, status: 'DB_MISSING', id: normalizeLvId(lookup) || lookup, active: false, playerUrl: '', diagnostics: ['D1 binding DB is missing'] })
  try {
    // v2.0.4: APP/Player가 자주 호출하는 GET에서는 schema repair/PRAGMA를 실행하지 않습니다.
    // 스키마 보강은 POST/PATCH, /api/repair, /api/health?deep=1에서만 수행합니다.
    const store = await safeFindStore(env, lookup, diagnostics)
    if (!store) {
      return json({ ok: false, status: 'APP_ID_NOT_FOUND', endpoint: '/api/app-config', id: normalizeLvId(lookup) || lookup, message: '등록된 APP ID 또는 store가 없습니다.', diagnostics }, 404)
    }
    return json(configResponse(request, env, store, diagnostics))
  } catch (error) {
    return json({ ok: true, degraded: true, status: 'APP_CONFIG_SAFE_FALLBACK', endpoint: '/api/app-config', id: normalizeLvId(lookup) || lookup, active: false, playerUrl: '', diagnostics: [...diagnostics, safeErrorMessage(error)] })
  }
}

export async function onRequestPost({ request, env }) { return onRequestPatch({ request, env }) }

export async function onRequestPatch({ request, env }) {
  const diagnostics = []
  if (!env.DB) return json({ ok: true, degraded: true, saved: false, diagnostics: ['D1 binding DB is missing'] })
  try {
    await ensureAppConfigSchema(env, diagnostics)
    const body = await readBody(request)
    const lookup = body.id || body.appId || body.app_id || body.store || body.slug || ''
    if (!lookup) return json({ ok: false, error: 'id/appId/store is required' }, 400)
    let current = await safeFindStore(env, lookup, diagnostics)
    const appId = normalizeLvId(body.appId || body.app_id || body.id || current?.appId || '')
    const slug = cleanStoreSlug(body.slug || body.store || current?.slug || '')
    if (!current) {
      if (!body.name || !slug) return json({ ok: false, error: 'store not found. To create one, provide name and slug/store.', diagnostics }, 404)
      await env.DB.prepare(`
        INSERT INTO stores
        (id, app_id, name, slug, category, address, contact, status, plan, player_url, player_url_updated_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(`st_${Date.now()}`, appId, String(body.name || '').trim(), slug, String(body.category || '미분류').trim(), String(body.address || '').trim(), String(body.contact || '').trim(), String(body.status || '운영중').trim(), String(body.plan || 'Local Basic').trim(), String(body.playerUrl || body.player_url || '').trim(), body.playerUrl || body.player_url ? nowUtcIso() : '').run()
      current = await safeFindStore(env, appId || slug, diagnostics)
    } else {
      const nextPlayerUrl = body.playerUrl !== undefined || body.player_url !== undefined ? String(body.playerUrl ?? body.player_url ?? '').trim() : current.playerUrl || ''
      const changed = nextPlayerUrl !== String(current.playerUrl || '')
      await env.DB.prepare(`
        UPDATE stores
        SET app_id = ?, name = ?, slug = ?, category = ?, address = ?, contact = ?, status = ?, plan = ?,
            player_url = ?, player_url_updated_at = CASE WHEN ? THEN ? ELSE player_url_updated_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(appId || current.appId, String(body.name ?? current.name ?? '').trim(), slug || current.slug, String(body.category ?? current.category ?? '').trim(), String(body.address ?? current.address ?? '').trim(), String(body.contact ?? current.contact ?? '').trim(), String(body.status ?? current.status ?? '운영중').trim(), String(body.plan ?? current.plan ?? 'Local Basic').trim(), nextPlayerUrl, changed ? 1 : 0, nowUtcIso(), current.id).run()
      current = await safeFindStore(env, appId || slug || current.appId || current.slug, diagnostics)
    }
    return json(configResponse(request, env, current, diagnostics))
  } catch (error) {
    return json({ ok: true, degraded: true, saved: false, endpoint: '/api/app-config', diagnostics: [...diagnostics, safeErrorMessage(error)] })
  }
}
