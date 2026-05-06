import { json, ensureCoreSchema, mapDevice, cleanSlug } from '../_lib/localvision-core.js'

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

function safeStoreId(store) {
  const clean = cleanSlug(store)
  return clean ? `tv_${clean}` : `tv_${Date.now()}`
}

function normalizeIncoming(body) {
  const store = cleanSlug(body.store || '')
  const id = String(body.id || body.deviceId || '').trim()
  return {
    id: id || (store ? safeStoreId(store) : ''),
    store,
    name: String(body.name || '').trim(),
    role: String(body.role || 'tv').trim() || 'tv',
    online: typeof body.online === 'boolean' ? (body.online ? 1 : 0) : typeof body.online === 'number' ? body.online : undefined,
    lastSeen: body.lastSeen,
    app: String(body.app || '').trim(),
    deviceCode: String(body.deviceCode || body.device_code || '').trim(),
    lastCommand: body.lastCommand,
    commandAt: body.commandAt,
  }
}

async function findDevice(env, { id, store }) {
  if (id) {
    const byId = await env.DB.prepare(`SELECT * FROM devices WHERE id = ?`).bind(id).first()
    if (byId) return byId
  }
  if (store) {
    const byStore = await env.DB.prepare(`SELECT * FROM devices WHERE store = ? ORDER BY created_at DESC LIMIT 1`).bind(store).first()
    if (byStore) return byStore
  }
  return null
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const { results } = await env.DB.prepare(`
    SELECT
      id, store, name, role, online,
      last_seen AS lastSeen,
      app,
      device_code AS deviceCode,
      last_command AS lastCommand,
      command_at AS commandAt,
      updated_at AS updatedAt
    FROM devices
    ORDER BY created_at DESC
  `).all()

  return json({ ok: true, version: 'v1.6.1-r2-autosync', devices: (results || []).map((row) => mapDevice(row, env)) })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const body = await readBody(request)
  if (!body.name || !body.store) return json({ ok: false, error: 'name and store are required' }, 400)

  const incoming = normalizeIncoming(body)
  const device = {
    id: incoming.id || safeStoreId(incoming.store),
    store: incoming.store,
    name: incoming.name,
    role: incoming.role || 'tv',
    online: incoming.online ?? 0,
    lastSeen: incoming.lastSeen || '아직 접속 없음',
    app: incoming.app || 'Player Web v1.6',
    deviceCode: incoming.deviceCode || '',
    lastCommand: incoming.lastCommand || '',
    commandAt: incoming.commandAt || '',
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO devices
    (id, store, name, role, online, last_seen, app, device_code, last_command, command_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM devices WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
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
    device.commandAt,
    device.id
  ).run()

  return json({ ok: true, device: mapDevice({ ...device, updatedAt: new Date().toISOString() }, env) })
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const body = await readBody(request)
  const incoming = normalizeIncoming(body)

  if (!incoming.id && !incoming.store) {
    return json({ ok: false, error: 'id or store is required' }, 400)
  }

  let current = await findDevice(env, incoming)

  if (!current && incoming.store) {
    const auto = {
      id: incoming.id || safeStoreId(incoming.store),
      store: incoming.store,
      name: incoming.name || `${incoming.store} TV`,
      role: incoming.role || 'tv',
      online: incoming.online ?? 1,
      lastSeen: incoming.lastSeen ?? new Date().toISOString(),
      app: incoming.app || 'Player Web v1.6',
      deviceCode: incoming.deviceCode || `LV-${incoming.store.toUpperCase()}-01`,
      lastCommand: incoming.lastCommand || '',
      commandAt: incoming.commandAt || '',
    }

    await env.DB.prepare(`
      INSERT INTO devices
      (id, store, name, role, online, last_seen, app, device_code, last_command, command_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      auto.id,
      auto.store,
      auto.name,
      auto.role,
      auto.online,
      auto.lastSeen,
      auto.app,
      auto.deviceCode,
      auto.lastCommand,
      auto.commandAt
    ).run()

    current = await env.DB.prepare(`SELECT * FROM devices WHERE id = ?`).bind(auto.id).first()
  }

  if (!current) return json({ ok: false, error: 'device not found' }, 404)

  const online = incoming.online !== undefined ? incoming.online : current.online
  const lastSeen = incoming.lastSeen ?? (body.online === true ? new Date().toISOString() : current.last_seen)
  const lastCommand = incoming.lastCommand ?? current.last_command
  const commandAt = incoming.commandAt ?? current.command_at
  const app = incoming.app || current.app || 'Player Web v1.6'
  const deviceCode = incoming.deviceCode || current.device_code || ''
  const name = incoming.name || current.name || `${current.store} TV`
  const role = incoming.role || current.role || 'tv'

  await env.DB.prepare(`
    UPDATE devices
    SET name = ?, role = ?, online = ?, last_seen = ?, app = ?, device_code = ?, last_command = ?, command_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(name, role, online, lastSeen, app, deviceCode, lastCommand, commandAt, current.id).run()

  return json({
    ok: true,
    mode: incoming.store ? 'store-based' : 'id-based',
    device: mapDevice({
      id: current.id,
      store: current.store,
      name,
      role,
      online,
      lastSeen,
      app,
      deviceCode,
      lastCommand,
      commandAt,
      updatedAt: new Date().toISOString(),
    }, env),
  })
}
