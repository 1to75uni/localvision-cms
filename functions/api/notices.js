import { ensureCoreSchema, normalizeNoticeTime, toKstString, nowUtcIso, r2KeyFromUrl } from '../_lib/localvision-core.js'
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD',
      'access-control-allow-headers': 'content-type,range,cache-control,pragma,authorization,x-lv-admin-token',
      'cache-control': 'no-store',
    },
  })
}

export async function onRequestOptions() { return json({ ok: true }) }
async function readBody(request) { try { return await request.json() } catch { return {} } }

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
  const startAt = row.startAt || ''
  const endAt = row.endAt || ''
  return {
    id: row.id,
    store: row.store,
    title: row.title,
    type: row.type,
    message: row.message || '',
    mediaUrl: row.mediaUrl || '',
    linkUrl: row.linkUrl || '',
    fileName: row.fileName || '',
    r2Key: row.r2Key || r2KeyFromUrl(row.mediaUrl || ''),
    startAt,
    endAt,
    startAtUtc: startAt,
    endAtUtc: endAt,
    startAtKst: startAt ? toKstString(startAt) : '',
    endAtKst: endAt ? toKstString(endAt) : '',
    timezone: row.timezone || 'Asia/Seoul',
    displayMode: row.displayMode || 'fullscreen',
    priority: row.priority || 'normal',
    durationSec: Number(row.durationSec || 15),
    repeatMode: row.repeatMode || 'once',
    repeatIntervalMin: Number(row.repeatIntervalMin ?? row.repeat_interval_min ?? 0),
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt || '',
    createdAtKst: row.createdAt ? toKstString(row.createdAt) : '',
    updatedAt: row.updatedAt || '',
    updatedAtKst: row.updatedAt ? toKstString(row.updatedAt) : '',
  }
}

async function ensureTable(env) {
  await ensureCoreSchema(env)
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
  const now = nowUtcIso()

  const where = []
  const params = []
  if (store) { where.push('(store = ? OR store = "_all")'); params.push(store) }
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
      r2_key AS r2Key,
      start_at AS startAt,
      end_at AS endAt,
      timezone,
      display_mode AS displayMode,
      priority, duration_sec AS durationSec, repeat_mode AS repeatMode, repeat_interval_min AS repeatIntervalMin,
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
  return json({ ok: true, serverNowUtc: now, serverNowKst: toKstString(now), notices, active: activeOnly ? notices[0] || null : undefined })
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

  const timezone = String(body.timezone || 'Asia/Seoul').trim() || 'Asia/Seoul'
  const mediaUrl = String(body.mediaUrl || body.url || '').trim()
  const notice = {
    id: body.id || `nt_${Date.now()}`,
    store,
    title,
    type,
    message: String(body.message || '').trim(),
    mediaUrl,
    linkUrl: String(body.linkUrl || '').trim(),
    fileName: String(body.fileName || '').trim(),
    r2Key: String(body.r2Key || body.r2_key || r2KeyFromUrl(mediaUrl)).trim(),
    startAt: normalizeNoticeTime(body.startAtLocal ?? body.startAt ?? '', timezone),
    endAt: normalizeNoticeTime(body.endAtLocal ?? body.endAt ?? '', timezone),
    timezone,
    displayMode: String(body.displayMode || 'fullscreen'),
    priority: String(body.priority || 'normal'),
    durationSec: Number(body.durationSec || 15),
    repeatMode: String(body.repeatMode || 'once'),
    repeatIntervalMin: Number(body.repeatIntervalMin || body.repeat_interval_min || 0),
    isActive: toBool(body.isActive, true) ? 1 : 0,
    updatedAt: nowUtcIso(),
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO notices
    (id, store, title, type, message, media_url, link_url, file_name, r2_key, start_at, end_at, timezone, display_mode, priority, duration_sec, repeat_mode, repeat_interval_min, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    notice.id, notice.store, notice.title, notice.type, notice.message,
    notice.mediaUrl, notice.linkUrl, notice.fileName, notice.r2Key,
    notice.startAt, notice.endAt, notice.timezone, notice.displayMode, notice.priority,
    notice.durationSec, notice.repeatMode, notice.repeatIntervalMin, notice.isActive, notice.updatedAt
  ).run()

  return json({ ok: true, notice: mapNotice({ ...notice, isActive: Boolean(notice.isActive), createdAt: '', updatedAt: notice.updatedAt }) })
}

export async function onRequestPatch({ request, env }) { return onRequestPost({ request, env }) }

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureTable(env)

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const deleteFile = ['1', 'true', 'yes'].includes(String(url.searchParams.get('deleteFile') || '').toLowerCase())
  if (!id) return json({ ok: false, error: 'id is required' }, 400)

  const row = await env.DB.prepare(`
    SELECT id, media_url AS mediaUrl, r2_key AS r2Key
    FROM notices
    WHERE id = ?
    LIMIT 1
  `).bind(id).first()
  if (!row) return json({ ok: false, error: 'notice not found', id }, 404)

  const r2Key = String(row.r2Key || r2KeyFromUrl(row.mediaUrl || '') || '').trim()
  let r2Deleted = false
  let r2DeleteSkipped = ''
  if (deleteFile) {
    if (!r2Key) r2DeleteSkipped = 'r2_key not found'
    else if (!env.MEDIA) r2DeleteSkipped = 'R2 binding MEDIA is missing'
    else {
      const ref = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM notices
        WHERE id <> ?
          AND (r2_key = ? OR media_url LIKE ?)
      `).bind(id, r2Key, `%${r2Key}%`).first()
      if (Number(ref?.count || 0) > 0) r2DeleteSkipped = `same r2_key is used by ${Number(ref?.count || 0)} other notice row(s)`
      else { await env.MEDIA.delete(r2Key); r2Deleted = true }
    }
  }

  await env.DB.prepare(`DELETE FROM notices WHERE id = ?`).bind(id).run()
  return json({ ok: true, deleted: id, dbDeleted: true, deleteFile, r2Deleted, r2DeleteSkipped, r2Key })
}
