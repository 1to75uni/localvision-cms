function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  })
}

export async function onRequestOptions() {
  return json({ ok: true })
}

function normalizeItem(row) {
  return {
    id: row.id,
    store: row.store,
    side: row.side,
    type: row.type,
    title: row.title,
    duration: Number(row.duration || 10),
    status: row.status,
    fileName: row.fileName,
    url: row.url || '',
    sortOrder: Number(row.sortOrder || 0),
    updatedAt: row.updatedAt,
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) {
    return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  }

  const url = new URL(request.url)
  const store = url.searchParams.get('store') || ''
  const side = url.searchParams.get('side') || 'left'

  if (!['left', 'right'].includes(side)) {
    return json({ ok: false, error: 'side must be left or right' }, 400)
  }

  if (side === 'left' && !store) {
    return json({ ok: false, error: 'store is required for left playlist' }, 400)
  }

  const targetStore = side === 'right' ? '_common' : store

  const { results } = await env.DB.prepare(`
    SELECT
      id,
      store,
      side,
      type,
      title,
      duration,
      status,
      file_name AS fileName,
      url,
      sort_order AS sortOrder,
      updated_at AS updatedAt
    FROM contents
    WHERE store = ?
      AND side = ?
      AND status = '사용중'
    ORDER BY sort_order ASC, updated_at DESC
  `).bind(targetStore, side).all()

  const items = (results || []).map(normalizeItem)

  return json({
    ok: true,
    version: 'v1.4',
    store,
    side,
    targetStore,
    count: items.length,
    updatedAt: new Date().toISOString(),
    items,
  })
}
