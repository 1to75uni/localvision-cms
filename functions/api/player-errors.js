function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  })
}

export async function onRequestOptions() {
  return json({ ok: true })
}

async function readBody(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS player_errors (
      id TEXT PRIMARY KEY,
      store TEXT DEFAULT '',
      device_id TEXT DEFAULT '',
      error_code TEXT NOT NULL,
      level TEXT DEFAULT 'error',
      message TEXT NOT NULL,
      href TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      extra_json TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_player_errors_device_created
    ON player_errors(device_id, created_at)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_player_errors_store_created
    ON player_errors(store, created_at)
  `).run()
}

function normalizeError(row) {
  let extra = {}
  try { extra = row.extraJson ? JSON.parse(row.extraJson) : {} } catch {}
  return {
    id: row.id,
    store: row.store || '',
    deviceId: row.deviceId || '',
    errorCode: row.errorCode,
    level: row.level || 'error',
    message: row.message,
    href: row.href || '',
    userAgent: row.userAgent || '',
    extra,
    createdAt: row.createdAt,
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureTable(env)

  const url = new URL(request.url)
  const deviceId = url.searchParams.get('deviceId') || ''
  const store = url.searchParams.get('store') || ''
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30)))

  let sql = `
    SELECT
      id,
      store,
      device_id AS deviceId,
      error_code AS errorCode,
      level,
      message,
      href,
      user_agent AS userAgent,
      extra_json AS extraJson,
      created_at AS createdAt
    FROM player_errors
  `
  const params = []
  const where = []

  if (deviceId) {
    where.push('device_id = ?')
    params.push(deviceId)
  }
  if (store) {
    where.push('store = ?')
    params.push(store)
  }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ` ORDER BY created_at DESC LIMIT ?`
  params.push(limit)

  const { results } = await env.DB.prepare(sql).bind(...params).all()
  return json({ ok: true, errors: (results || []).map(normalizeError) })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureTable(env)

  const body = await readBody(request)
  const errorCode = String(body.errorCode || '').trim()
  const message = String(body.message || '').trim()
  if (!errorCode || !message) {
    return json({ ok: false, error: 'errorCode and message are required' }, 400)
  }

  const now = new Date().toISOString()
  const item = {
    id: body.id || `pe_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    store: String(body.store || '').trim(),
    deviceId: String(body.deviceId || '').trim(),
    errorCode,
    level: String(body.level || 'error').trim(),
    message,
    href: String(body.href || '').slice(0, 1000),
    userAgent: String(body.userAgent || '').slice(0, 1000),
    extraJson: JSON.stringify(body.extra || {}),
    createdAt: body.time || now,
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO player_errors
    (id, store, device_id, error_code, level, message, href, user_agent, extra_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    item.id,
    item.store,
    item.deviceId,
    item.errorCode,
    item.level,
    item.message,
    item.href,
    item.userAgent,
    item.extraJson,
    item.createdAt
  ).run()

  return json({ ok: true, error: item })
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureTable(env)
  const url = new URL(request.url)
  const deviceId = url.searchParams.get('deviceId') || ''
  const store = url.searchParams.get('store') || ''

  if (deviceId) {
    await env.DB.prepare('DELETE FROM player_errors WHERE device_id = ?').bind(deviceId).run()
    return json({ ok: true })
  }
  if (store) {
    await env.DB.prepare('DELETE FROM player_errors WHERE store = ?').bind(store).run()
    return json({ ok: true })
  }

  return json({ ok: false, error: 'deviceId or store is required' }, 400)
}
