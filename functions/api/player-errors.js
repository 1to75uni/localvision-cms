import { ensureCoreSchema, json, parseLastSeenMs, toKstString, nowUtcIso, nowKstString, safeErrorMessage, tryRun } from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

async function readBody(request) {
  try { return await request.json() } catch { return {} }
}

async function safeColumns(env, table) {
  try {
    const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
    return new Set((info.results || []).map((row) => String(row.name)))
  } catch { return new Set() }
}

async function safeEnsureTable(env, diagnostics = []) {
  if (!env.DB) return false
  try { await ensureCoreSchema(env) } catch (error) { diagnostics.push(`ensureCoreSchema: ${safeErrorMessage(error)}`) }
  await tryRun(env, `
    CREATE TABLE IF NOT EXISTS player_errors (
      id TEXT PRIMARY KEY,
      store TEXT DEFAULT '',
      device_id TEXT DEFAULT '',
      error_code TEXT DEFAULT 'UNKNOWN',
      level TEXT DEFAULT 'error',
      message TEXT DEFAULT '',
      href TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      extra_json TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT '',
      count INTEGER DEFAULT 1,
      fingerprint TEXT DEFAULT ''
    )
  `)

  const wanted = [
    ['store', `TEXT DEFAULT ''`],
    ['device_id', `TEXT DEFAULT ''`],
    ['error_code', `TEXT DEFAULT 'UNKNOWN'`],
    ['level', `TEXT DEFAULT 'error'`],
    ['message', `TEXT DEFAULT ''`],
    ['href', `TEXT DEFAULT ''`],
    ['user_agent', `TEXT DEFAULT ''`],
    ['extra_json', `TEXT DEFAULT ''`],
    ['created_at', `TEXT DEFAULT ''`],
    ['updated_at', `TEXT DEFAULT ''`],
    ['count', `INTEGER DEFAULT 1`],
    ['fingerprint', `TEXT DEFAULT ''`],
  ]
  const cols = await safeColumns(env, 'player_errors')
  for (const [column, definition] of wanted) {
    if (!cols.has(column)) {
      const res = await tryRun(env, `ALTER TABLE player_errors ADD COLUMN ${column} ${definition}`)
      if (res?.ok === false) diagnostics.push(`addColumn ${column}: ${res.error}`)
    }
  }

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_player_errors_device_created ON player_errors(device_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_player_errors_store_created ON player_errors(store, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_player_errors_fingerprint ON player_errors(fingerprint)`,
  ]
  for (const sql of indexes) {
    const res = await tryRun(env, sql)
    if (res?.ok === false) diagnostics.push(`index: ${res.error}`)
  }
  return true
}

function stableToken(value = '') {
  return String(value || '').trim().replace(/\?.*$/, '').split('/').pop().slice(0, 180)
}

function makeFingerprint({ store, deviceId, errorCode, message, href, extra }) {
  const file = stableToken(extra?.fileName || extra?.cacheUrl || extra?.sourceUrl || extra?.url || href)
  return [store || '', deviceId || '', errorCode || '', message || '', file].join('|').slice(0, 700)
}

function normalizeError(row = {}) {
  let extra = {}
  try { extra = row.extraJson ? JSON.parse(row.extraJson) : {} } catch {}
  const createdMs = parseLastSeenMs(row.createdAt)
  const updatedMs = parseLastSeenMs(row.updatedAt)
  const createdAtKst = createdMs ? toKstString(createdMs) : (extra.timeKst || row.createdAt || '')
  const updatedAtKst = updatedMs ? toKstString(updatedMs) : createdAtKst
  const count = Number(row.count || 1)
  return {
    id: row.id || '',
    store: row.store || '',
    deviceId: row.deviceId || '',
    errorCode: row.errorCode || 'UNKNOWN',
    level: row.level || 'error',
    message: count > 1 ? `${row.message || ''} · ${count}회 반복` : (row.message || ''),
    rawMessage: row.message || '',
    href: row.href || '',
    userAgent: row.userAgent || '',
    extra: { ...extra, count, firstSeenUtc: createdMs ? new Date(createdMs).toISOString() : row.createdAt || '', firstSeenKst: createdAtKst, lastSeenUtc: updatedMs ? new Date(updatedMs).toISOString() : (createdMs ? new Date(createdMs).toISOString() : row.updatedAt || row.createdAt || ''), lastSeenKst: updatedAtKst },
    count,
    createdAt: updatedAtKst || createdAtKst || row.createdAt || '',
    createdAtUtc: createdMs ? new Date(createdMs).toISOString() : row.createdAt || '',
    createdAtKst,
    updatedAt: updatedAtKst,
    updatedAtUtc: updatedMs ? new Date(updatedMs).toISOString() : '',
    updatedAtKst,
  }
}

export async function onRequestGet({ request, env }) {
  const diagnostics = []
  if (!env.DB) return json({ ok: true, degraded: true, endpoint: '/api/player-errors', errors: [], diagnostics: ['D1 binding DB is missing'] })
  try {
    await safeEnsureTable(env, diagnostics)
    const url = new URL(request.url)
    const deviceId = url.searchParams.get('deviceId') || ''
    const store = url.searchParams.get('store') || ''
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30)))

    let sql = `
      SELECT id, store, device_id AS deviceId, error_code AS errorCode, level, message, href,
             user_agent AS userAgent, extra_json AS extraJson, created_at AS createdAt,
             updated_at AS updatedAt, count, fingerprint
      FROM player_errors
    `
    const params = []
    const where = []
    if (deviceId) { where.push('device_id = ?'); params.push(deviceId) }
    if (store) { where.push('store = ?'); params.push(store) }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ` ORDER BY COALESCE(NULLIF(updated_at, ''), created_at) DESC LIMIT ?`
    params.push(limit)
    const { results } = await env.DB.prepare(sql).bind(...params).all()
    return json({ ok: true, endpoint: '/api/player-errors', serverNowUtc: nowUtcIso(), serverNowKst: nowKstString(), errors: (results || []).map(normalizeError), diagnostics })
  } catch (error) {
    return json({ ok: true, degraded: true, endpoint: '/api/player-errors', errors: [], diagnostics: [...diagnostics, safeErrorMessage(error)] })
  }
}

async function saveOneError(env, raw = {}, inherited = {}) {
  const body = { ...inherited, ...raw }
  const errorCode = String(body.errorCode || 'UNKNOWN').trim()
  const message = String(body.message || body.error || 'Unknown player error').trim()
  const now = nowUtcIso()
  const extra = { ...(body.extra || {}), timeUtc: body.timeUtc || body.time || now, timeKst: body.timeKst || nowKstString() }
  const item = {
    id: body.id || `pe_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    store: String(body.store || '').trim(),
    deviceId: String(body.deviceId || '').trim(),
    errorCode,
    level: String(body.level || 'error').trim(),
    message,
    href: String(body.href || '').slice(0, 1000),
    userAgent: String(body.userAgent || '').slice(0, 1000),
    extraJson: JSON.stringify(extra),
    createdAt: body.timeUtc || body.time || now,
    updatedAt: now,
  }
  const fingerprint = makeFingerprint({ ...item, extra })

  try {
    const existing = await env.DB.prepare(`
      SELECT id, count FROM player_errors
      WHERE fingerprint = ?
      ORDER BY COALESCE(NULLIF(updated_at, ''), created_at) DESC
      LIMIT 1
    `).bind(fingerprint).first()
    if (existing) {
      await env.DB.prepare(`
        UPDATE player_errors
        SET level = ?, message = ?, href = ?, user_agent = ?, extra_json = ?, updated_at = ?, count = COALESCE(count, 1) + 1
        WHERE id = ?
      `).bind(item.level, item.message, item.href, item.userAgent, item.extraJson, item.updatedAt, existing.id).run()
      return { ok: true, mode: 'merged', error: { ...item, id: existing.id, count: Number(existing.count || 1) + 1, fingerprint } }
    }
  } catch (_) {
    // fingerprint 조회가 실패하면 병합을 포기하고 단순 insert로 fallback합니다.
  }

  await env.DB.prepare(`
    INSERT INTO player_errors
    (id, store, device_id, error_code, level, message, href, user_agent, extra_json, created_at, updated_at, count, fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).bind(item.id, item.store, item.deviceId, item.errorCode, item.level, item.message, item.href, item.userAgent, item.extraJson, item.createdAt, item.updatedAt, fingerprint).run()
  return { ok: true, mode: 'inserted', error: { ...item, count: 1, fingerprint } }
}

export async function onRequestPost({ request, env }) {
  const diagnostics = []
  if (!env.DB) return json({ ok: true, degraded: true, saved: 0, diagnostics: ['D1 binding DB is missing'] })
  try {
    await safeEnsureTable(env, diagnostics)
    const body = await readBody(request)
    const batch = Array.isArray(body.errors) ? body.errors : (Array.isArray(body.items) ? body.items : null)
    if (batch) {
      const inherited = { store: body.store, deviceId: body.deviceId, href: body.href, userAgent: body.userAgent }
      const limited = batch.slice(0, 50)
      const results = []
      for (const entry of limited) {
        try { results.push(await saveOneError(env, entry, inherited)) } catch (error) { results.push({ ok: false, error: safeErrorMessage(error) }) }
      }
      return json({ ok: true, mode: 'batch', received: batch.length, saved: results.filter((r) => r.ok).length, skipped: results.filter((r) => !r.ok).length, results, diagnostics, serverNowUtc: nowUtcIso(), serverNowKst: nowKstString() })
    }
    const result = await saveOneError(env, body)
    return json({ ok: true, mode: result.mode, error: result.error, diagnostics })
  } catch (error) {
    return json({ ok: true, degraded: true, saved: 0, diagnostics: [...diagnostics, safeErrorMessage(error)] })
  }
}

export async function onRequestDelete({ request, env }) {
  const diagnostics = []
  if (!env.DB) return json({ ok: true, degraded: true, diagnostics: ['D1 binding DB is missing'] })
  try {
    await safeEnsureTable(env, diagnostics)
    const url = new URL(request.url)
    const deviceId = url.searchParams.get('deviceId') || ''
    const store = url.searchParams.get('store') || ''
    if (deviceId) { await tryRun(env, 'DELETE FROM player_errors WHERE device_id = ?', [deviceId]); return json({ ok: true, diagnostics }) }
    if (store) { await tryRun(env, 'DELETE FROM player_errors WHERE store = ?', [store]); return json({ ok: true, diagnostics }) }
    return json({ ok: false, error: 'deviceId or store is required' }, 400)
  } catch (error) {
    return json({ ok: true, degraded: true, diagnostics: [...diagnostics, safeErrorMessage(error)] })
  }
}
