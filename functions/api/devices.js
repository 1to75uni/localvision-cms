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
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function onlineTtlSec(env) {
  const value = Number(env.ONLINE_TTL_SEC || 600)
  return Number.isFinite(value) && value > 0 ? value : 600
}

function parseLastSeenMs(value, nowMs = Date.now()) {
  const raw = String(value || '').trim()
  if (!raw || raw.includes('아직') || raw.includes('오프라인')) return 0
  if (raw.includes('방금')) return nowMs

  const minuteAgo = raw.match(/(\d+)\s*분\s*전/)
  if (minuteAgo) return nowMs - Number(minuteAgo[1]) * 60 * 1000

  const hourAgo = raw.match(/(\d+)\s*시간\s*전/)
  if (hourAgo) return nowMs - Number(hourAgo[1]) * 60 * 60 * 1000

  const secondAgo = raw.match(/(\d+)\s*초\s*전/)
  if (secondAgo) return nowMs - Number(secondAgo[1]) * 1000

  const ko = raw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (ko) {
    let hour = Number(ko[5])
    const ampm = ko[4]
    if (ampm === '오후' && hour < 12) hour += 12
    if (ampm === '오전' && hour === 12) hour = 0

    // Player/APP가 ko-KR 문자열을 보내면 KST 기준 시간이므로 UTC로 환산합니다.
    return Date.UTC(
      Number(ko[1]),
      Number(ko[2]) - 1,
      Number(ko[3]),
      hour - 9,
      Number(ko[6]),
      Number(ko[7] || 0)
    )
  }

  const sql = raw.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (sql) {
    return Date.UTC(
      Number(sql[1]),
      Number(sql[2]) - 1,
      Number(sql[3]),
      Number(sql[4]),
      Number(sql[5]),
      Number(sql[6] || 0)
    )
  }

  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? 0 : parsed
}

function mapDevice(row, env, nowMs = Date.now()) {
  const lastSeenMs = parseLastSeenMs(row.lastSeen, nowMs)
  const ttlSec = onlineTtlSec(env)
  const isFresh = lastSeenMs > 0 && nowMs - lastSeenMs <= ttlSec * 1000

  return {
    id: row.id,
    store: row.store,
    name: row.name,
    role: row.role,
    online: isFresh,
    onlineTtlSec: ttlSec,
    lastSeen: row.lastSeen,
    lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : '',
    app: row.app,
    deviceCode: row.deviceCode,
    lastCommand: row.lastCommand,
    commandAt: row.commandAt,
    updatedAt: row.updatedAt,
  }
}

function safeStoreId(store) {
  const clean = String(store || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
  return clean ? `tv_${clean}` : `tv_${Date.now()}`
}

function normalizeIncoming(body) {
  const store = String(body.store || '').trim()
  const id = String(body.id || body.deviceId || '').trim()
  return {
    id: id || (store ? safeStoreId(store) : ''),
    store,
    name: String(body.name || '').trim(),
    role: String(body.role || 'tv').trim() || 'tv',
    online: typeof body.online === 'boolean' ? (body.online ? 1 : 0) : undefined,
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

  return json({ ok: true, version: 'v1.6-store-heartbeat', devices: (results || []).map((row) => mapDevice(row, env)) })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

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

  const body = await readBody(request)
  const incoming = normalizeIncoming(body)

  if (!incoming.id && !incoming.store) {
    return json({ ok: false, error: 'id or store is required' }, 400)
  }

  let current = await findDevice(env, incoming)

  // v1.6 MVP 기준: store만 들어와도 TV row를 자동 생성합니다.
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
