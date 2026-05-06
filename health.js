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

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      store TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('image', 'video', 'link', 'text')),
      message TEXT DEFAULT '',
      media_url TEXT DEFAULT '',
      link_url TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      start_at TEXT DEFAULT '',
      end_at TEXT DEFAULT '',
      display_mode TEXT DEFAULT 'fullscreen',
      priority TEXT DEFAULT 'normal',
      duration_sec INTEGER DEFAULT 15,
      repeat_mode TEXT DEFAULT 'always',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

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


  const notices = await env.DB.prepare(`
    SELECT
      id, store, title, type, message,
      media_url AS mediaUrl,
      link_url AS linkUrl,
      file_name AS fileName,
      start_at AS startAt,
      end_at AS endAt,
      display_mode AS displayMode,
      priority,
      duration_sec AS durationSec,
      repeat_mode AS repeatMode,
      is_active AS isActive,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM notices
    ORDER BY updated_at DESC
  `).all()

  const devices = await env.DB.prepare(`
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

  return json({
    ok: true,
    stores: stores.results || [],
    contents: contents.results || [],
    notices: (notices.results || []).map((row) => ({
      ...row,
      isActive: Boolean(row.isActive),
      durationSec: Number(row.durationSec || 15),
    })),
    devices: (devices.results || []).map((row) => mapDevice(row, env)),
  })
}
