export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,range',
      'cache-control': 'no-store',
    },
  })
}

export function cleanSlug(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replaceAll(' ', '-')
    .replace(/[^a-z0-9-_]/g, '')
}

export function safeSqlId(value = '') {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function makePublicUrl(request, env, key) {
  const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/$/, '')
  if (publicBase) return `${publicBase}/${key}`

  const url = new URL(request.url)
  return `${url.origin}/api/media?key=${encodeURIComponent(key)}`
}

export function detectTypeFromName(name = '') {
  const lower = String(name).toLowerCase()
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.m4v')) return 'video'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.avif')) return 'image'
  return ''
}

export function isMediaKey(key = '') {
  const lower = String(key).toLowerCase()
  if (!lower || lower.endsWith('/') || lower.endsWith('/playlist.json')) return false
  return Boolean(detectTypeFromName(lower))
}

export async function tryRun(env, sql, binds = []) {
  try {
    return await env.DB.prepare(sql).bind(...binds).run()
  } catch (error) {
    return { ok: false, error: String(error?.message || error) }
  }
}

export async function ensureCoreSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is missing')

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT '',
      address TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      status TEXT DEFAULT '준비중',
      plan TEXT DEFAULT 'Local Basic',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      store TEXT NOT NULL,
      side TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      duration INTEGER DEFAULT 10,
      status TEXT DEFAULT '사용중',
      file_name TEXT DEFAULT '',
      url TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      store TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'tv',
      online INTEGER DEFAULT 0,
      last_seen TEXT DEFAULT '아직 접속 없음',
      app TEXT DEFAULT 'Player Web v1.6',
      device_code TEXT DEFAULT '',
      last_command TEXT DEFAULT '',
      command_at TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      store TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
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

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS player_errors (
      id TEXT PRIMARY KEY,
      store TEXT DEFAULT '',
      device_id TEXT DEFAULT '',
      error_code TEXT NOT NULL,
      level TEXT DEFAULT 'error',
      message TEXT NOT NULL,
      href TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      extra_json TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS device_screenshots (
      id TEXT PRIMARY KEY,
      device_id TEXT DEFAULT '',
      store TEXT DEFAULT '',
      url TEXT NOT NULL,
      r2_key TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  const alters = [
    `ALTER TABLE contents ADD COLUMN url TEXT DEFAULT ''`,
    `ALTER TABLE contents ADD COLUMN sort_order INTEGER DEFAULT 0`,
    `ALTER TABLE contents ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE devices ADD COLUMN last_command TEXT DEFAULT ''`,
    `ALTER TABLE devices ADD COLUMN command_at TEXT DEFAULT ''`,
    `ALTER TABLE devices ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE stores ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP`,
  ]

  for (const sql of alters) await tryRun(env, sql)

  await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_contents_store_side ON contents(store, side)`)
  await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_devices_store ON devices(store)`)
  await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_player_errors_store_created ON player_errors(store, created_at)`)
  await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_device_screenshots_store_created ON device_screenshots(store, created_at)`)
}

export async function listR2Objects(env, prefix = '', limit = 1000) {
  if (!env.MEDIA) return []
  const objects = []
  let cursor = undefined

  do {
    const page = await env.MEDIA.list({ prefix, cursor, limit })
    objects.push(...(page.objects || []))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return objects
}

function sortMediaObjects(objects) {
  return [...objects].sort((a, b) => {
    const ak = String(a.key || '')
    const bk = String(b.key || '')
    const an = ak.match(/(\d+)/g)?.map(Number).pop() ?? 0
    const bn = bk.match(/(\d+)/g)?.map(Number).pop() ?? 0
    if (an !== bn) return an - bn
    return ak.localeCompare(bk)
  })
}

export async function scanR2Media(request, env) {
  if (!env.MEDIA) return { stores: [], contents: [], storeSlugs: [], count: 0, mode: 'no-media-binding' }

  const objects = await listR2Objects(env, 'stores/')
  const storeMap = new Map()
  const mediaObjects = sortMediaObjects(objects.filter((obj) => isMediaKey(obj.key)))
  const contents = []

  mediaObjects.forEach((obj, index) => {
    const key = obj.key
    const parts = key.split('/')
    if (parts.length < 4 || parts[0] !== 'stores') return

    const store = cleanSlug(parts[1]) || parts[1]
    const side = parts[2]
    const fileName = parts.slice(3).join('/')
    if (!['left', 'right'].includes(side)) return
    if (side === 'left' && store === '_common') return
    if (side === 'right' && store !== '_common') return

    const type = detectTypeFromName(fileName)
    if (!type) return

    if (store !== '_common' && !storeMap.has(store)) {
      storeMap.set(store, {
        id: `st_${safeSqlId(store)}`,
        name: store,
        slug: store,
        category: 'R2 동기화',
        address: '',
        contact: '',
        status: '운영중',
        plan: 'Local Basic',
        createdAt: obj.uploaded ? new Date(obj.uploaded).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      })
    }

    contents.push({
      id: `r2_${safeSqlId(key)}`,
      store,
      side,
      type,
      title: fileName.replace(/\.[^.]+$/, ''),
      duration: type === 'video' ? 0 : 10,
      status: '사용중',
      fileName,
      url: makePublicUrl(request, env, key),
      sortOrder: index + 1,
      updatedAt: obj.uploaded ? new Date(obj.uploaded).toISOString() : new Date().toISOString(),
      r2Key: key,
      source: 'r2',
    })
  })

  return {
    stores: [...storeMap.values()],
    contents,
    storeSlugs: [...storeMap.keys()],
    count: contents.length,
    mode: 'r2-scan',
  }
}

export async function upsertR2ScanIntoD1(request, env) {
  if (!env.DB) throw new Error('D1 binding DB is missing')
  if (!env.MEDIA) return { ok: false, reason: 'R2 binding MEDIA is missing', insertedStores: 0, insertedContents: 0 }

  await ensureCoreSchema(env)
  const scan = await scanR2Media(request, env)
  let insertedStores = 0
  let insertedContents = 0
  let insertedDevices = 0

  for (const store of scan.stores) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO stores
      (id, name, slug, category, address, contact, status, plan, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      store.id,
      store.name,
      store.slug,
      store.category,
      store.address,
      store.contact,
      store.status,
      store.plan,
      store.createdAt
    ).run()
    insertedStores++

    await env.DB.prepare(`
      INSERT OR IGNORE INTO devices
      (id, store, name, role, online, last_seen, app, device_code, created_at, updated_at)
      VALUES (?, ?, ?, 'tv', 0, '아직 접속 없음', 'Player Web v1.6', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(`tv_${store.slug}`, store.slug, `${store.name} TV 1`, `LV-${store.slug.toUpperCase()}-01`).run()
    insertedDevices++
  }

  for (const content of scan.contents) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO contents
      (id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      content.id,
      content.store,
      content.side,
      content.type,
      content.title,
      content.duration,
      content.status,
      content.fileName,
      content.url,
      content.sortOrder,
      content.updatedAt
    ).run()
    insertedContents++
  }

  return { ok: true, ...scan, insertedStores, insertedContents, insertedDevices }
}

export function onlineTtlSec(env) {
  const value = Number(env.ONLINE_TTL_SEC || 600)
  return Number.isFinite(value) && value > 0 ? value : 600
}

export function parseLastSeenMs(value, nowMs = Date.now()) {
  const raw = String(value || '').trim()
  if (!raw || raw.includes('아직') || raw.includes('오프라인')) return 0
  if (raw.includes('방금')) return nowMs

  const secondAgo = raw.match(/(\d+)\s*초\s*전/)
  if (secondAgo) return nowMs - Number(secondAgo[1]) * 1000

  const minuteAgo = raw.match(/(\d+)\s*분\s*전/)
  if (minuteAgo) return nowMs - Number(minuteAgo[1]) * 60 * 1000

  const hourAgo = raw.match(/(\d+)\s*시간\s*전/)
  if (hourAgo) return nowMs - Number(hourAgo[1]) * 60 * 60 * 1000

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

export function mapDevice(row, env, nowMs = Date.now()) {
  const lastSeenValue = row.lastSeen ?? row.last_seen
  const lastSeenMs = parseLastSeenMs(lastSeenValue, nowMs)
  const ttlSec = onlineTtlSec(env)
  const isFresh = lastSeenMs > 0 && nowMs - lastSeenMs <= ttlSec * 1000

  return {
    id: row.id,
    store: row.store,
    name: row.name,
    role: row.role,
    online: isFresh,
    onlineTtlSec: ttlSec,
    lastSeen: lastSeenValue,
    lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : '',
    app: row.app,
    deviceCode: row.deviceCode ?? row.device_code,
    lastCommand: row.lastCommand ?? row.last_command,
    commandAt: row.commandAt ?? row.command_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  }
}
