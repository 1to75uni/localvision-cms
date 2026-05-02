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

function normalizeContent(row) {
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
  const storeSlug = url.searchParams.get('store') || ''

  if (!storeSlug) {
    return json({ ok: false, error: 'store is required' }, 400)
  }

  const store = await env.DB.prepare(`
    SELECT
      id,
      name,
      slug,
      category,
      address,
      contact,
      status,
      plan,
      created_at AS createdAt
    FROM stores
    WHERE slug = ?
  `).bind(storeSlug).first()

  if (!store) {
    return json({ ok: false, error: 'store not found' }, 404)
  }

  const left = await env.DB.prepare(`
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
      AND side = 'left'
      AND status = '사용중'
    ORDER BY sort_order ASC, updated_at DESC
  `).bind(storeSlug).all()

  const right = await env.DB.prepare(`
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
    WHERE store = '_common'
      AND side = 'right'
      AND status = '사용중'
    ORDER BY sort_order ASC, updated_at DESC
  `).all()

  const devices = await env.DB.prepare(`
    SELECT
      id,
      store,
      name,
      role,
      online,
      last_seen AS lastSeen,
      app,
      device_code AS deviceCode,
      last_command AS lastCommand,
      command_at AS commandAt
    FROM devices
    WHERE store = ?
    ORDER BY created_at DESC
  `).bind(storeSlug).all()

  return json({
    ok: true,
    version: 'v1.4',
    store,
    layout: {
      leftRatio: 70,
      rightRatio: 30,
    },
    playlists: {
      left: (left.results || []).map(normalizeContent),
      right: (right.results || []).map(normalizeContent),
    },
    devices: (devices.results || []).map((device) => ({
      ...device,
      online: device.online === 1,
    })),
    updatedAt: new Date().toISOString(),
  })
}
