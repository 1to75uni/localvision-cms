import { ensureCoreSchema, json, cleanSlug, LV_CORE_VERSION, nowUtcIso, nowKstString, toKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

async function readBody(request) { try { return await request.json() } catch { return {} } }

function truthy(value) {
  if (typeof value === 'boolean') return value
  const text = String(value ?? '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'on', 'y', '휴무', 'black', 'blackmode'].includes(text)
}

function todayEndKstUtcIso() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth()
  const d = kst.getUTCDate()
  return new Date(Date.UTC(y, m, d, 23 - 9, 59, 0, 0)).toISOString()
}

function normalizeUntil(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return todayEndKstUtcIso()
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? todayEndKstUtcIso() : d.toISOString()
  }
  const m = raw.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 23) - 9, Number(m[5] || 59), Number(m[6] || 0))).toISOString()
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? todayEndKstUtcIso() : d.toISOString()
}

function isActive(row = {}) {
  const enabled = Number(row.blackMode ?? row.black_mode ?? 0) === 1
  const until = String(row.blackModeUntil ?? row.black_mode_until ?? '').trim()
  if (!enabled) return false
  if (!until) return true
  const ms = Date.parse(until)
  if (!ms) return true
  return ms >= Date.now()
}

function mapStore(row = {}) {
  const active = isActive(row)
  const until = String(row.blackModeUntil ?? row.black_mode_until ?? '').trim()
  return {
    id: row.id || '',
    appId: row.appId || row.app_id || '',
    store: row.slug || row.store || '',
    slug: row.slug || row.store || '',
    name: row.name || row.slug || '',
    blackMode: active,
    blackModeRaw: Boolean(Number(row.blackMode ?? row.black_mode ?? 0)),
    blackModeUntil: until,
    blackModeUntilUtc: until,
    blackModeUntilKst: until ? toKstString(until) : '',
    blackModeReason: row.blackModeReason ?? row.black_mode_reason ?? '',
    blackModeUpdatedAt: row.blackModeUpdatedAt ?? row.black_mode_updated_at ?? '',
    blackModeUpdatedAtKst: (row.blackModeUpdatedAt ?? row.black_mode_updated_at) ? toKstString(row.blackModeUpdatedAt ?? row.black_mode_updated_at) : '',
  }
}

async function readRows(env, store = '') {
  if (store) {
    const row = await env.DB.prepare(`
      SELECT id, app_id AS appId, name, slug,
             black_mode AS blackMode, black_mode_until AS blackModeUntil,
             black_mode_reason AS blackModeReason, black_mode_updated_at AS blackModeUpdatedAt
      FROM stores
      WHERE slug = ? OR lower(app_id) = lower(?) OR id = ?
      LIMIT 1
    `).bind(store, store, store).first()
    return row ? [row] : []
  }
  const { results } = await env.DB.prepare(`
    SELECT id, app_id AS appId, name, slug,
           black_mode AS blackMode, black_mode_until AS blackModeUntil,
           black_mode_reason AS blackModeReason, black_mode_updated_at AS blackModeUpdatedAt
    FROM stores
    ORDER BY app_id ASC, created_at DESC
  `).all()
  return results || []
}

async function clearExpired(env, rows = []) {
  const expired = rows.filter((r) => Number(r.blackMode ?? 0) === 1 && r.blackModeUntil && Date.parse(r.blackModeUntil) && Date.parse(r.blackModeUntil) < Date.now())
  for (const row of expired) {
    await env.DB.prepare(`
      UPDATE stores
      SET black_mode = 0, black_mode_reason = '', black_mode_updated_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(nowUtcIso(), row.id).run()
    row.blackMode = 0
    row.blackModeReason = ''
    row.blackModeUpdatedAt = nowUtcIso()
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const url = new URL(request.url)
  const store = cleanSlug(url.searchParams.get('store') || url.searchParams.get('slug') || url.searchParams.get('id') || url.searchParams.get('appId') || '')
  const rows = await readRows(env, store)
  await clearExpired(env, rows)
  const stores = rows.map(mapStore)
  return json({
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/black-mode',
    store: stores[0] || null,
    stores,
    blackMode: Boolean(stores[0]?.blackMode),
    serverNowUtc: nowUtcIso(),
    serverNowKst: nowKstString(),
  })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const body = await readBody(request)
  const store = cleanSlug(body.store || body.slug || body.id || body.appId || '')
  if (!store) return json({ ok: false, error: 'store is required' }, 400)
  const enable = truthy(body.blackMode ?? body.enabled ?? body.on)
  const until = enable ? normalizeUntil(body.until || body.blackModeUntil || body.untilKst || '') : ''
  const reason = enable ? String(body.reason || body.blackModeReason || '휴무모드').trim() : ''
  const updatedAt = nowUtcIso()

  const result = await env.DB.prepare(`
    UPDATE stores
    SET black_mode = ?, black_mode_until = ?, black_mode_reason = ?, black_mode_updated_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE slug = ? OR lower(app_id) = lower(?) OR id = ?
  `).bind(enable ? 1 : 0, until, reason, updatedAt, store, store, store).run()

  if (!result.meta || result.meta.changes === 0) return json({ ok: false, error: 'store not found' }, 404)
  const rows = await readRows(env, store)
  return json({
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/black-mode',
    action: enable ? 'on' : 'off',
    store: rows[0] ? mapStore(rows[0]) : null,
    blackMode: enable,
    blackModeUntil: until,
    blackModeUntilKst: until ? toKstString(until) : '',
    serverNowUtc: updatedAt,
    serverNowKst: nowKstString(),
  })
}

export async function onRequestPatch(ctx) { return onRequestPost(ctx) }
