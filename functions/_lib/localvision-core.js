export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,range',
      'cache-control': 'no-store, no-cache, must-revalidate',
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
    return { ok: false, error: String(error?.message || error), sql }
  }
}

async function tableColumns(env, table) {
  try {
    const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
    return new Set((res.results || []).map((row) => String(row.name)))
  } catch {
    return new Set()
  }
}

async function addColumnIfMissing(env, table, column, definition) {
  const cols = await tableColumns(env, table)
  if (!cols.has(column)) {
    // D1/SQLite는 ALTER ADD COLUMN에서 CURRENT_TIMESTAMP 같은 non-constant default가 실패할 수 있습니다.
    // 그래서 migration 보강 컬럼은 모두 안전한 상수 기본값만 사용합니다.
    await tryRun(env, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
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

  // 기존 Core01/예전 D1 스키마와 섞여 있어도 API가 죽지 않도록 모든 필수 컬럼을 보강합니다.
  await addColumnIfMissing(env, 'stores', 'category', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'stores', 'address', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'stores', 'contact', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'stores', 'status', `TEXT DEFAULT '준비중'`)
  await addColumnIfMissing(env, 'stores', 'plan', `TEXT DEFAULT 'Local Basic'`)
  await addColumnIfMissing(env, 'stores', 'created_at', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'stores', 'updated_at', `TEXT DEFAULT ''`)

  await addColumnIfMissing(env, 'contents', 'duration', `INTEGER DEFAULT 10`)
  await addColumnIfMissing(env, 'contents', 'status', `TEXT DEFAULT '사용중'`)
  await addColumnIfMissing(env, 'contents', 'file_name', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'contents', 'url', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'contents', 'sort_order', `INTEGER DEFAULT 0`)
  await addColumnIfMissing(env, 'contents', 'updated_at', `TEXT DEFAULT ''`)

  await addColumnIfMissing(env, 'devices', 'role', `TEXT DEFAULT 'tv'`)
  await addColumnIfMissing(env, 'devices', 'online', `INTEGER DEFAULT 0`)
  await addColumnIfMissing(env, 'devices', 'last_seen', `TEXT DEFAULT '아직 접속 없음'`)
  await addColumnIfMissing(env, 'devices', 'app', `TEXT DEFAULT 'Player Web v1.6'`)
  await addColumnIfMissing(env, 'devices', 'device_code', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'devices', 'last_command', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'devices', 'command_at', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'devices', 'created_at', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'devices', 'updated_at', `TEXT DEFAULT ''`)

  await addColumnIfMissing(env, 'notices', 'message', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'media_url', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'link_url', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'file_name', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'start_at', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'end_at', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'display_mode', `TEXT DEFAULT 'fullscreen'`)
  await addColumnIfMissing(env, 'notices', 'priority', `TEXT DEFAULT 'normal'`)
  await addColumnIfMissing(env, 'notices', 'duration_sec', `INTEGER DEFAULT 15`)
  await addColumnIfMissing(env, 'notices', 'repeat_mode', `TEXT DEFAULT 'always'`)
  await addColumnIfMissing(env, 'notices', 'is_active', `INTEGER DEFAULT 1`)
  await addColumnIfMissing(env, 'notices', 'created_at', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'updated_at', `TEXT DEFAULT ''`)

  await addColumnIfMissing(env, 'player_errors', 'store', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'player_errors', 'device_id', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'player_errors', 'level', `TEXT DEFAULT 'error'`)
  await addColumnIfMissing(env, 'player_errors', 'href', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'player_errors', 'user_agent', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'player_errors', 'extra_json', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'player_errors', 'created_at', `TEXT DEFAULT ''`)

  await addColumnIfMissing(env, 'device_screenshots', 'store', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'device_screenshots', 'r2_key', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'device_screenshots', 'created_at', `TEXT DEFAULT ''`)

  await tryRun(env, `UPDATE stores SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''`)
  await tryRun(env, `UPDATE stores SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL OR updated_at = ''`)
  await tryRun(env, `UPDATE contents SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL OR updated_at = ''`)
  await tryRun(env, `UPDATE devices SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''`)
  await tryRun(env, `UPDATE devices SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL OR updated_at = ''`)
  await tryRun(env, `UPDATE notices SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''`)
  await tryRun(env, `UPDATE notices SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL OR updated_at = ''`)

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

    const rawStore = parts[1]
    const store = rawStore === '_common' ? '_common' : (cleanSlug(rawStore) || rawStore)
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

  return { stores: [...storeMap.values()], contents, storeSlugs: [...storeMap.keys()], count: contents.length, mode: 'r2-scan' }
}

export async function upsertR2ScanIntoD1(request, env) {
  if (!env.DB) throw new Error('D1 binding DB is missing')
  if (!env.MEDIA) return { ok: false, reason: 'R2 binding MEDIA is missing', insertedStores: 0, insertedContents: 0, insertedDevices: 0 }

  await ensureCoreSchema(env)
  const scan = await scanR2Media(request, env)
  let insertedStores = 0
  let insertedContents = 0
  let insertedDevices = 0
  const errors = []

  for (const store of scan.stores) {
    const storeResult = await tryRun(env, `
      INSERT OR IGNORE INTO stores
      (id, name, slug, category, address, contact, status, plan, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [store.id, store.name, store.slug, store.category, store.address, store.contact, store.status, store.plan, store.createdAt])
    if (storeResult?.success || storeResult?.meta) insertedStores++
    if (storeResult?.ok === false) errors.push(storeResult.error)

    const deviceResult = await tryRun(env, `
      INSERT OR IGNORE INTO devices
      (id, store, name, role, online, last_seen, app, device_code, created_at, updated_at)
      VALUES (?, ?, ?, 'tv', 0, '아직 접속 없음', 'Player Web v1.6', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [`tv_${store.slug}`, store.slug, `${store.name} TV 1`, `LV-${store.slug.toUpperCase()}-01`])
    if (deviceResult?.success || deviceResult?.meta) insertedDevices++
    if (deviceResult?.ok === false) errors.push(deviceResult.error)
  }

  for (const content of scan.contents) {
    const result = await tryRun(env, `
      INSERT OR REPLACE INTO contents
      (id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [content.id, content.store, content.side, content.type, content.title, content.duration, content.status, content.fileName, content.url, content.sortOrder, content.updatedAt])
    if (result?.success || result?.meta) insertedContents++
    if (result?.ok === false) errors.push(result.error)
  }

  return { ok: errors.length === 0, ...scan, insertedStores, insertedContents, insertedDevices, errors }
}

export async function safeAll(env, sql, binds = []) {
  try {
    const res = await env.DB.prepare(sql).bind(...binds).all()
    return { ok: true, results: res.results || [] }
  } catch (error) {
    return { ok: false, results: [], error: String(error?.message || error) }
  }
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
