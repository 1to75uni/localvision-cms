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

function mapDevice(row) {
  return {
    id: row.id,
    store: row.store,
    name: row.name,
    role: row.role,
    online: row.online === 1,
    lastSeen: row.lastSeen,
    app: row.app,
    deviceCode: row.deviceCode,
    lastCommand: row.lastCommand,
    commandAt: row.commandAt,
  }
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const stores = await env.DB.prepare(`
    SELECT
      id, name, slug, category, address, contact, status, plan,
      created_at AS createdAt
    FROM stores
    ORDER BY created_at DESC
  `).all()

  const contents = await env.DB.prepare(`
    SELECT
      id, store, side, type, title, duration, status,
      file_name AS fileName,
      url,
      sort_order AS sortOrder,
      updated_at AS updatedAt
    FROM contents
    ORDER BY side ASC, sort_order ASC, updated_at DESC
  `).all()

  const devices = await env.DB.prepare(`
    SELECT
      id, store, name, role, online,
      last_seen AS lastSeen,
      app,
      device_code AS deviceCode,
      last_command AS lastCommand,
      command_at AS commandAt
    FROM devices
    ORDER BY created_at DESC
  `).all()

  return json({
    ok: true,
    stores: stores.results || [],
    contents: contents.results || [],
    devices: (devices.results || []).map(mapDevice),
  })
}
