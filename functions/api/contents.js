function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
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

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const url = new URL(request.url)
  const store = url.searchParams.get('store')
  const side = url.searchParams.get('side')

  let sql = `
    SELECT
      id, store, side, type, title, duration, status,
      file_name AS fileName,
      url,
      sort_order AS sortOrder,
      updated_at AS updatedAt
    FROM contents
  `
  const params = []
  const where = []

  if (store) {
    where.push('store = ?')
    params.push(store)
  }

  if (side) {
    where.push('side = ?')
    params.push(side)
  }

  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ` ORDER BY side ASC, sort_order ASC, updated_at DESC`

  const stmt = env.DB.prepare(sql).bind(...params)
  const { results } = await stmt.all()

  return json({ ok: true, contents: results || [] })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

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
    duration: Number(body.duration) || 10,
    status: body.status || '사용중',
    fileName: body.fileName || '',
    url: body.url || '',
    sortOrder: Number(body.sortOrder) || 0,
    updatedAt: body.updatedAt || new Date().toISOString().slice(0, 10),
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO contents
    (id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    content.id,
    content.store,
    content.side,
    content.type,
    content.title,
    content.duration,
    content.status,
    content.fileName,
    content.url,
    content.sortOrder,
    content.updatedAt
  ).run()

  return json({ ok: true, content })
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return json({ ok: false, error: 'id is required' }, 400)

  await env.DB.prepare(`DELETE FROM contents WHERE id = ?`).bind(id).run()

  return json({ ok: true, deleted: id })
}
