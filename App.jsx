function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  })
}

export async function onRequestOptions() {
  return json({ ok: true })
}

async function readBody(request) {
  try { return await request.json() } catch { return {} }
}

function toBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1 || value === '1' || value === 'true' || value === '사용중') return true
  if (value === false || value === 0 || value === '0' || value === 'false' || value === '중지') return false
  return fallback
}

function cleanStore(value = '') {
  return String(value).toLowerCase().trim().replaceAll(' ', '-').replace(/[^a-z0-9-_]/g, '')
}

function mapNotice(row) {
  return {
    id: row.id,
    store: row.store,
    title: row.title,
    type: row.type,
    message: row.message || '',
    mediaUrl: row.mediaUrl || '',
    linkUrl: row.linkUrl || '',
    fileName: row.fileName || '',
    startAt: row.startAt || '',
    endAt: row.endAt || '',
    displayMode: row.displayMode || 'fullscreen',
    priority: row.priority || 'normal',
    durationSec: Number(row.durationSec || 15),
    repeatMode: row.repeatMode || 'always',
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
  }
}

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      store TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('image', 'video', 'link', 'text')),
      message TEXT DEFAULT '',
      media_url TEXT DEFAULT '',
      link_url TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      start_at TEXT DEFAULT '',
      end_at TEXT DEFAULT '',
      display_mode TEXT DEFAULT 'fullscreen',
      priority TEXT DEFAULT 'normal',
      duration_sec INTEGER DEFAULT 15,
      repeat_mode TEXT DEFAULT 'always',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_notices_store_active ON notices(store, is_active)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_notices_time ON notices(start_at, end_at)`).run()
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureTable(env)

  const url = new URL(request.url)
  const store = cleanStore(url.searchParams.get('store') || '')
  const activeOnly = url.searchParams.get('active') === '1' || url.searchParams.get('active') === 'true'
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)))
  const now = new Date().toISOString()

  const where = []
  const params = []
  if (store) {
    where.push('(store = ? OR store = "_all")')
    params.push(store)
  }
  if (activeOnly) {
    where.push('is_active = 1')
    where.push('(start_at = "" OR start_at <= ?)')
    where.push('(end_at = "" OR end_at >= ?)')
    params.push(now, now)
  }

  let sql = `
    SELECT
      id, store, title, type, message,
      media_url AS mediaUrl,
      link_url AS linkUrl,
      file_name AS fileName,
      start_at AS startAt,
      end_at AS endAt,
      display_mode AS displayMode,
      priority, duration_sec AS durationSec, repeat_mode AS repeatMode,
      is_active AS isActive,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM notices
  `
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ` ORDER BY CASE priority WHEN 'urgent' THEN 0 ELSE 1 END, updated_at DESC LIMIT ?`
  params.push(limit)

  const { results } = await env.DB.prepare(sql).bind(...params).all()
  const notices = (results || []).map(mapNotice)
  return json({ ok: true, notices, active: activeOnly ? notices[0] || null : undefined })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureTable(env)

  const body = await readBody(request)
  const type = String(body.type || 'image').trim()
  if (!['image', 'video', 'link', 'text'].includes(type)) return json({ ok: false, error: 'type must be image, video, link, or text' }, 400)

  const store = cleanStore(body.store || '')
  if (!store) return json({ ok: false, error: 'store is required' }, 400)
  const title = String(body.title || '').trim()
  if (!title) return json({ ok: false, error: 'title is required' }, 400)

  const notice = {
    id: body.id || `nt_${Date.now()}`,
    store,
    title,
    type,
    message: String(body.message || '').trim(),
    mediaUrl: String(body.mediaUrl || body.url || '').trim(),
    linkUrl: String(body.linkUrl || '').trim(),
    fileName: String(body.fileName || '').trim(),
    startAt: String(body.startAt || '').trim(),
    endAt: String(body.endAt || '').trim(),
    displayMode: String(body.displayMode || 'fullscreen'),
    priority: String(body.priority || 'normal'),
    durationSec: Number(body.durationSec || 15),
    repeatMode: String(body.repeatMode || 'always'),
    isActive: toBool(body.isActive, true) ? 1 : 0,
    updatedAt: new Date().toISOString(),
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO notices
    (id, store, title, type, message, media_url, link_url, file_name, start_at, end_at, display_mode, priority, duration_sec, repeat_mode, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    notice.id, notice.store, notice.title, notice.type, notice.message,
    notice.mediaUrl, notice.linkUrl, notice.fileName,
    notice.startAt, notice.endAt, notice.displayMode, notice.priority,
    notice.durationSec, notice.repeatMode, notice.isActive, notice.updatedAt
  ).run()

  return json({ ok: true, notice: { ...notice, isActive: Boolean(notice.isActive) } })
}

export async function onRequestPatch({ request, env }) {
  return onRequestPost({ request, env })
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureTable(env)

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return json({ ok: false, error: 'id is required' }, 400)
  await env.DB.prepare(`DELETE FROM notices WHERE id = ?`).bind(id).run()
  return json({ ok: true, deleted: id })
}
