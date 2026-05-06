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
  // v1.6: Player heartbeat 기본 3분 기준. 현장 네트워크 흔들림을 고려해 10분 이내는 ONLINE으로 봅니다.
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
    return Date.UTC(Number(ko[1]), Number(ko[2]) - 1, Number(ko[3]), hour - 9, Number(ko[6]), Number(ko[7] || 0))
  }

  const sql = raw.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (sql) return Date.UTC(Number(sql[1]), Number(sql[2]) - 1, Number(sql[3]), Number(sql[4]), Number(sql[5]), Number(sql[6] || 0))

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

async function findDevice(env, { id = '', store = '' } = {}) {
  if (id) {
    const row = await env.DB.prepare(`
      SELECT
        id, store, name, role, online,
        last_seen AS lastSeen,
        app,
        device_code AS deviceCode,
        last_command AS lastCommand,
        command_at AS commandAt,
        updated_at AS updatedAt
      FROM devices
      WHERE id = ?
    `).bind(id).first()
    if (row) return row
  }

  if (store) {
    return await env.DB.prepare(`
      SELECT
        id, store, name, role, online,
        last_seen AS lastSeen,
        app,
        device_code AS deviceCode,
        last_command AS lastCommand,
        command_at AS commandAt,
        updated_at AS updatedAt
      FROM devices
      WHERE store = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(store).first()
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

  return json({ ok: true, devices: (results || []).map((row) => mapDevice(row, env)) })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const body = await readBody(request)
  if (!body.name || !body.store) return json({ ok: false, error: 'name and store are required' }, 400)

  const device = {
    id: body.id || `dv_${Date.now()}`,
    store: String(body.store || '').trim(),
    name: body.name,
    role: body.role || 'tv',
    online: body.online ? 1 : 0,
    lastSeen: body.lastSeen || '아직 접속 없음',
    app: body.app || 'Android TV App',
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
  const id = String(body.id || '').trim()
  const store = String(body.store || '').trim()
  if (!id && !store) return json({ ok: false, error: 'id or store is required' }, 400)

  let current = await findDevice(env, { id, store })

  // v1.6: URL 하나 = 매장 TV 한 대 운영을 기준으로, 처음 보는 store heartbeat도 자동 등록합니다.
  if (!current && store) {
    const autoDevice = {
      id: id || `store_${store}`,
      store,
      name: body.name || `${store} TV 1`,
      role: body.role || 'tv',
      online: 0,
      lastSeen: '아직 접속 없음',
      app: body.app || 'Player Web v1.6',
      deviceCode: body.deviceCode || `LV-${store.toUpperCase()}-01`,
      lastCommand: '',
      commandAt: '',
    }

    await env.DB.prepare(`
      INSERT OR IGNORE INTO devices
      (id, store, name, role, online, last_seen, app, device_code, last_command, command_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      autoDevice.id,
      autoDevice.store,
      autoDevice.name,
      autoDevice.role,
      autoDevice.online,
      autoDevice.lastSeen,
      autoDevice.app,
      autoDevice.deviceCode,
      autoDevice.lastCommand,
      autoDevice.commandAt
    ).run()

    current = await findDevice(env, { id: autoDevice.id, store })
  }

  if (!current) return json({ ok: false, error: 'device not found' }, 404)

  const online = typeof body.online === 'boolean' ? (body.online ? 1 : 0) : current.online
  const lastSeen = body.lastSeen ?? (body.online === true ? new Date().toISOString() : current.lastSeen)
  const lastCommand = body.lastCommand ?? current.lastCommand
  const commandAt = body.commandAt ?? current.commandAt
  const app = body.app || current.app

  await env.DB.prepare(`
    UPDATE devices
    SET online = ?, last_seen = ?, app = ?, last_command = ?, command_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(online, lastSeen, app, lastCommand, commandAt, current.id).run()

  return json({
    ok: true,
    matchMode: id ? 'id' : 'store',
    device: mapDevice({
      id: current.id,
      store: current.store,
      name: current.name,
      role: current.role,
      online,
      lastSeen,
      app,
      deviceCode: current.deviceCode,
      lastCommand,
      commandAt,
      updatedAt: new Date().toISOString(),
    }, env),
  })
}
