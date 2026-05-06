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
  const value = Number(env.ONLINE_TTL_SEC || 180)
  return Number.isFinite(value) && value > 0 ? value : 180
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

    // Player가 ko-KR 문자열을 보내면 KST 기준 시간이므로 UTC로 환산합니다.
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

  return json({ ok: true, devices: (results || []).map((row) => mapDevice(row, env)) })
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

  return json({ ok: true, device: mapDevice({ ...device, updatedAt: new Date().toISOString() }, env) })
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const body = await readBody(request)
  if (!body.id) return json({ ok: false, error: 'id is required' }, 400)

  const current = await env.DB.prepare(`SELECT * FROM devices WHERE id = ?`).bind(body.id).first()
  if (!current) return json({ ok: false, error: 'device not found' }, 404)

  const online = typeof body.online === 'boolean' ? (body.online ? 1 : 0) : current.online
  const lastSeen = body.lastSeen ?? (body.online === true ? new Date().toISOString() : current.last_seen)
  const lastCommand = body.lastCommand ?? current.last_command
  const commandAt = body.commandAt ?? current.command_at

  await env.DB.prepare(`
    UPDATE devices
    SET online = ?, last_seen = ?, last_command = ?, command_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(online, lastSeen, lastCommand, commandAt, body.id).run()

  return json({
    ok: true,
    device: mapDevice({
      id: body.id,
      store: current.store,
      name: current.name,
      role: current.role,
      online,
      lastSeen,
      app: current.app,
      deviceCode: current.device_code,
      lastCommand,
      commandAt,
      updatedAt: new Date().toISOString(),
    }, env),
  })
}
