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
    ...row,
    online: isFresh,
    onlineTtlSec: ttlSec,
    lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : '',
  }
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
      command_at AS commandAt,
      updated_at AS updatedAt
    FROM devices
    WHERE store = ?
    ORDER BY created_at DESC
  `).bind(storeSlug).all()

  return json({
    ok: true,
    version: 'v1.6-store-heartbeat',
    store,
    layout: {
      leftRatio: 70,
      rightRatio: 30,
    },
    playlists: {
      left: (left.results || []).map(normalizeContent),
      right: (right.results || []).map(normalizeContent),
    },
    devices: (devices.results || []).map((device) => mapDevice(device, env)),
    updatedAt: new Date().toISOString(),
  })
}
