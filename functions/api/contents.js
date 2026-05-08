import { ensureCoreSchema, dedupeContentsRows, cleanupSyntheticR2Duplicates, cleanupDuplicateContents, DEFAULT_CONTENT_DURATION, r2KeyFromUrl, writePlaylistSnapshots, writeCommonRightSnapshot } from '../_lib/localvision-core.js'
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

export async function onRequestOptions() {
  return json({ ok: true })
}

async function readBody(request) {
  try { return await request.json() } catch { return {} }
}

function mapContent(row = {}) {
  return {
    id: row.id,
    store: row.store,
    side: row.side,
    type: row.type,
    title: row.title,
    duration: Number(row.duration || DEFAULT_CONTENT_DURATION),
    status: row.status || '사용중',
    fileName: row.fileName ?? row.file_name ?? '',
    url: row.url || '',
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    updatedAt: row.updatedAt ?? row.updated_at ?? '',
    r2Key: row.r2Key ?? row.r2_key ?? r2KeyFromUrl(row.url || ''),
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  await cleanupSyntheticR2Duplicates(env)
  await cleanupDuplicateContents(env)

  const url = new URL(request.url)
  const store = url.searchParams.get('store')
  const side = url.searchParams.get('side')

  let sql = `
    SELECT
      id, store, side, type, title, duration, status,
      file_name AS fileName,
      url,
      sort_order AS sortOrder,
      updated_at AS updatedAt,
      r2_key AS r2Key
    FROM contents
  `
  const params = []
  const where = []

  if (store) { where.push('store = ?'); params.push(store) }
  if (side) { where.push('side = ?'); params.push(side) }

  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ` ORDER BY side ASC, sort_order ASC, updated_at DESC`

  const { results } = await env.DB.prepare(sql).bind(...params).all()
  return json({ ok: true, contents: dedupeContentsRows(results || []).map(mapContent) })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const body = await readBody(request)
  if (!body.title || !body.side || !body.type) {
    return json({ ok: false, error: 'title, side, type are required' }, 400)
  }

  const content = {
    id: body.id || `ct_${Date.now()}`,
    store: body.side === 'right' ? '_common' : (body.store || ''),
    side: body.side,
    type: body.type,
    title: body.title,
    duration: Number(body.duration) || DEFAULT_CONTENT_DURATION,
    status: body.status || '사용중',
    fileName: body.fileName || '',
    url: body.url || '',
    sortOrder: Number(body.sortOrder) || 0,
    updatedAt: body.updatedAt || new Date().toISOString(),
    r2Key: String(body.r2Key || body.r2_key || r2KeyFromUrl(body.url || '')).trim(),
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO contents
    (id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at, r2_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    content.id, content.store, content.side, content.type, content.title,
    content.duration, content.status, content.fileName, content.url,
    content.sortOrder, content.updatedAt, content.r2Key
  ).run()

  let snapshot = null
  try { snapshot = content.store === '_common' ? await writeCommonRightSnapshot(request, env) : await writePlaylistSnapshots(request, env, content.store) }
  catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }

  return json({ ok: true, content, snapshot })
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  await cleanupSyntheticR2Duplicates(env)
  await cleanupDuplicateContents(env)

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const deleteFile = ['1', 'true', 'yes'].includes(String(url.searchParams.get('deleteFile') || '').toLowerCase())
  if (!id) return json({ ok: false, error: 'id is required' }, 400)

  const row = await env.DB.prepare(`
    SELECT id, store, side, title, file_name AS fileName, url, r2_key AS r2Key
    FROM contents
    WHERE id = ?
    LIMIT 1
  `).bind(id).first()
  if (!row) return json({ ok: false, error: 'content not found', id }, 404)

  const r2Key = String(row.r2Key || r2KeyFromUrl(row.url || '') || '').trim()
  let r2Deleted = false
  let r2DeleteSkipped = ''

  if (deleteFile) {
    if (!r2Key) {
      r2DeleteSkipped = 'r2_key not found'
    } else if (!env.MEDIA) {
      r2DeleteSkipped = 'R2 binding MEDIA is missing'
    } else {
      const ref = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM contents
        WHERE id <> ?
          AND (r2_key = ? OR url LIKE ?)
      `).bind(id, r2Key, `%${r2Key}%`).first()
      const count = Number(ref?.count || 0)
      if (count > 0) {
        r2DeleteSkipped = `same r2_key is used by ${count} other content row(s)`
      } else {
        await env.MEDIA.delete(r2Key)
        r2Deleted = true
      }
    }
  }

  const result = await env.DB.prepare(`DELETE FROM contents WHERE id = ?`).bind(id).run()

  let snapshot = null
  try { snapshot = row.store === '_common' ? await writeCommonRightSnapshot(request, env) : await writePlaylistSnapshots(request, env, row.store) }
  catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }

  return json({
    ok: true,
    snapshot,
    deleted: id,
    dbDeleted: Boolean(result?.success ?? true),
    r2Deleted,
    r2DeleteSkipped,
    deleteFile,
    r2Key,
  })
}
