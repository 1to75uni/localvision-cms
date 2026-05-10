import { json, parseLastSeenMs, toKstString, nowUtcIso, nowKstString, safeErrorMessage, tryRun, cleanSlug } from '../_lib/localvision-core.js'

const ENDPOINT = '/api/player-errors'

export async function onRequestOptions() { return json({ ok: true }) }

async function readBody(request) {
  try { return await request.json() } catch { return {} }
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
    extra: {
      ...extra,
      count,
      firstSeenUtc: createdMs ? new Date(createdMs).toISOString() : row.createdAt || '',
      firstSeenKst: createdAtKst,
      lastSeenUtc: updatedMs ? new Date(updatedMs).toISOString() : (createdMs ? new Date(createdMs).toISOString() : row.updatedAt || row.createdAt || ''),
      lastSeenKst: updatedAtKst,
    },
    count,
    createdAt: updatedAtKst || createdAtKst || row.createdAt || '',
    createdAtUtc: createdMs ? new Date(createdMs).toISOString() : row.createdAt || '',
    createdAtKst,
    updatedAt: updatedAtKst,
    updatedAtUtc: updatedMs ? new Date(updatedMs).toISOString() : '',
    updatedAtKst,
  }
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

  // 운영 실수 방지: sinhanja처럼 오타가 들어와도 가까운 slug 1개는 같이 조회합니다.
  const candidates = exact ? [requested] : [requested, ...suggestions.slice(0, 1)]
  return { requested, candidates: [...new Set(candidates.filter(Boolean))], suggestions, storeExists: exact }
}

async function trySelectErrors(env, storeCandidates, deviceId, limit, diagnostics = []) {
  const params = []
  const where = []
  if (deviceId) { where.push('device_id = ?'); params.push(deviceId) }
  if (storeCandidates.length) {
    where.push(`store IN (${storeCandidates.map(() => '?').join(',')})`)
    params.push(...storeCandidates)
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  const queries = [
    {
      mode: 'full',
      sql: `
        SELECT id, store, device_id AS deviceId, error_code AS errorCode, level, message, href,
               user_agent AS userAgent, extra_json AS extraJson, created_at AS createdAt,
               updated_at AS updatedAt, count, fingerprint
        FROM player_errors
        ${whereSql}
        ORDER BY COALESCE(NULLIF(updated_at, ''), created_at) DESC
        LIMIT ?
      `,
    },
    {
      mode: 'legacy',
      sql: `
        SELECT id, store, device_id AS deviceId, error_code AS errorCode, level, message, href,
               user_agent AS userAgent, extra_json AS extraJson, created_at AS createdAt,
               '' AS updatedAt, 1 AS count, '' AS fingerprint
        FROM player_errors
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ?
      `,
    },
  ]

  for (const q of queries) {
    try {
      const { results } = await env.DB.prepare(q.sql).bind(...params, limit).all()
      return { ok: true, mode: q.mode, results: results || [] }
    } catch (error) {
      diagnostics.push(`${q.mode}Select: ${safeErrorMessage(error)}`)
    }
  }
  return { ok: false, mode: 'safe-empty', results: [] }
}

async function lightweightEnsureErrorTable(env, diagnostics = []) {
  if (!env.DB) return false
  const create = await tryRun(env, `
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
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      count INTEGER DEFAULT 1,
      fingerprint TEXT DEFAULT ''
    )
  `)
  if (create?.ok === false) diagnostics.push(`createTable: ${create.error}`)
  const migrations = [
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
  for (const [column, definition] of migrations) {
    const res = await tryRun(env, `ALTER TABLE player_errors ADD COLUMN ${column} ${definition}`)
    // duplicate column은 정상 운영 중에는 흔한 상황이므로 진단 노이즈로만 낮게 취급합니다.
    if (res?.ok === false && !String(res.error || '').toLowerCase().includes('duplicate column')) diagnostics.push(`addColumn ${column}: ${res.error}`)
  }
  for (const sql of [
    `CREATE INDEX IF NOT EXISTS idx_player_errors_device_created ON player_errors(device_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_player_errors_store_created ON player_errors(store, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_player_errors_fingerprint ON player_errors(fingerprint)`,
  ]) {
    const res = await tryRun(env, sql)
    if (res?.ok === false) diagnostics.push(`index: ${res.error}`)
  }
  return true
}

export async function onRequestGet({ request, env }) {
  const diagnostics = []
  if (!env.DB) return json({ ok: true, degraded: true, endpoint: ENDPOINT, errors: [], diagnostics: ['D1 binding DB is missing'] })

  const url = new URL(request.url)
  const deviceId = String(url.searchParams.get('deviceId') || '').trim()
  const requestedStore = cleanSlug(url.searchParams.get('store') || '')
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30)))

  try {
    // GET은 절대 스키마 보강/인덱스 생성/R2 스캔을 하지 않습니다. 실패해도 200 + degraded로 반환합니다.
    const storeResolution = await resolveStoreCandidates(env, requestedStore, diagnostics)
    const selected = await trySelectErrors(env, storeResolution.candidates, deviceId, limit, diagnostics)
    const errors = (selected.results || []).map(normalizeError)
    return json({
      ok: true,
      degraded: !selected.ok,
      endpoint: ENDPOINT,
      mode: selected.mode,
      requestedStore,
      storeCandidates: storeResolution.candidates,
      storeSuggestions: storeResolution.suggestions,
      storeExists: storeResolution.storeExists,
      serverNowUtc: nowUtcIso(),
      serverNowKst: nowKstString(),
      errors,
      diagnostics,
    })
  } catch (error) {
    return json({ ok: true, degraded: true, endpoint: ENDPOINT, errors: [], diagnostics: [...diagnostics, safeErrorMessage(error)] })
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
    store: cleanSlug(body.store || ''),
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
  } catch (_) {}

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
    await lightweightEnsureErrorTable(env, diagnostics)
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
    await lightweightEnsureErrorTable(env, diagnostics)
    const url = new URL(request.url)
    const deviceId = String(url.searchParams.get('deviceId') || '').trim()
    const store = cleanSlug(url.searchParams.get('store') || '')
    if (deviceId) { await tryRun(env, 'DELETE FROM player_errors WHERE device_id = ?', [deviceId]); return json({ ok: true, diagnostics }) }
    if (store) { await tryRun(env, 'DELETE FROM player_errors WHERE store = ?', [store]); return json({ ok: true, diagnostics }) }
    return json({ ok: false, error: 'deviceId or store is required' }, 400)
  } catch (error) {
    return json({ ok: true, degraded: true, diagnostics: [...diagnostics, safeErrorMessage(error)] })
  }
}
