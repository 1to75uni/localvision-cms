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

  const { results } = await env.DB.prepare(`
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

  return json({ ok: true, devices: (results || []).map(mapDevice) })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const body = await readBody(request)
  if (!body.name || !body.store) return json({ ok: false, error: 'name and store are required' }, 400)

  const device = {
    id: body.id || `dv_${Date.now()}`,
    store: body.store,
    name: body.name,
    role: body.role || 'tv',
    online: body.online ? 1 : 0,
    lastSeen: body.lastSeen || '아직 접속 없음',
    app: body.app || 'Player Web',
    deviceCode: body.deviceCode || '',
    lastCommand: body.lastCommand || '',
    commandAt: body.commandAt || '',
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO devices
    (id, store, name, role, online, last_seen, app, device_code, last_command, command_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    device.id,
    device.store,
    device.name,
    device.role,
    device.online,
    device.lastSeen,
    device.app,
    device.deviceCode,
    device.lastCommand,
    device.commandAt
  ).run()

  return json({ ok: true, device: { ...device, online: device.online === 1 } })
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const body = await readBody(request)
  if (!body.id) return json({ ok: false, error: 'id is required' }, 400)

  const current = await env.DB.prepare(`SELECT * FROM devices WHERE id = ?`).bind(body.id).first()
  if (!current) return json({ ok: false, error: 'device not found' }, 404)

  const online = typeof body.online === 'boolean' ? (body.online ? 1 : 0) : current.online
  const lastSeen = body.lastSeen ?? current.last_seen
  const lastCommand = body.lastCommand ?? current.last_command
  const commandAt = body.commandAt ?? current.command_at

  await env.DB.prepare(`
    UPDATE devices
    SET online = ?, last_seen = ?, last_command = ?, command_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(online, lastSeen, lastCommand, commandAt, body.id).run()

  return json({
    ok: true,
    device: {
      id: body.id,
      online: online === 1,
      lastSeen,
      lastCommand,
      commandAt,
    },
  })
}
