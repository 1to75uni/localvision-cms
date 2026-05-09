export function corsHeaders(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD',
    'access-control-allow-headers': 'content-type,range,cache-control,pragma,authorization,x-lv-admin-token',
    'access-control-expose-headers': 'content-length,content-range,accept-ranges,etag,content-type',
    'cache-control': 'no-store, no-cache, must-revalidate',
    ...extra,
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(extraHeaders),
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


export const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function toUtcIso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

export function toKstString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const kst = new Date(date.getTime() + KST_OFFSET_MS)
  const yyyy = String(kst.getUTCFullYear()).padStart(4, '0')
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(kst.getUTCDate()).padStart(2, '0')
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mi = String(kst.getUTCMinutes()).padStart(2, '0')
  const ss = String(kst.getUTCSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

export function nowUtcIso() {
  return new Date().toISOString()
}

export function nowKstString() {
  return toKstString(new Date())
}

export function secondsAgoText(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds || 0)))
  if (sec < 5) return '방금 전'
  if (sec < 60) return `${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  return `${day}일 전`
}

export function addTimeFields(row = {}, fields = []) {
  const output = { ...row }
  for (const field of fields) {
    const value = row[field]
    const ms = parseLastSeenMs(value)
    const prefix = field.replace(/At$/, '').replace(/_at$/, '')
    output[`${prefix}Utc`] = ms ? new Date(ms).toISOString() : ''
    output[`${prefix}Kst`] = ms ? toKstString(ms) : ''
  }
  return output
}

export function makePublicUrl(request, env, key) {
  const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/$/, '')
  if (publicBase) return `${publicBase}/${key}`
  const url = new URL(request.url)
  return `${url.origin}/api/media?key=${encodeURIComponent(key)}`
}

export function r2KeyFromUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const mediaKey = url.searchParams.get('key')
    if (url.pathname.includes('/api/media') && mediaKey) return decodeURIComponent(mediaKey)
    const path = decodeURIComponent(url.pathname || '').replace(/^\/+/, '')
    const markers = ['stores/', 'system/']
    for (const marker of markers) {
      const idx = path.indexOf(marker)
      if (idx >= 0) return path.slice(idx)
    }
    return ''
  } catch {
    const clean = decodeURIComponent(raw).replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '').split('?')[0]
    if (clean.startsWith('stores/') || clean.startsWith('system/')) return clean
    return ''
  }
}

export function localKstToUtcIso(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  // 이미 Z 또는 +09:00 같은 타임존 정보가 붙은 ISO 값이면 그대로 UTC 변환합니다.
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString()
  }
  const m = raw.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString()
  }
  const yyyy = Number(m[1])
  const mo = Number(m[2]) - 1
  const dd = Number(m[3])
  const hh = Number(m[4] || 0)
  const mi = Number(m[5] || 0)
  const ss = Number(m[6] || 0)
  return new Date(Date.UTC(yyyy, mo, dd, hh - 9, mi, ss)).toISOString()
}

export function normalizeNoticeTime(value = '', timezone = 'Asia/Seoul') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return timezone === 'Asia/Seoul' ? localKstToUtcIso(raw) : toUtcIso(raw)
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


export const LV_CORE_VERSION = 'v1.8.3-content-sync-field-log'
export const DEFAULT_CONTENT_DURATION = 20
export const DEFAULT_HEARTBEAT_MS = 300000
export const DEFAULT_COMMAND_POLL_MS = 300000
export const DEFAULT_NOTICE_POLL_MS = 60000
export const DEFAULT_CONTENT_CHECK_MS = 480000
export const DEFAULT_D1_HEARTBEAT_WRITE_SEC = 300
export const DEFAULT_APP_CONFIG_POLL_MS = 1800000
export const DEFAULT_PLAYER_STATE_POLL_MS = 480000

export function normalizeLvId(value = '') {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  if (/^lv\d{3,}$/.test(raw)) return raw
  if (/^\d+$/.test(raw)) return `lv${raw.padStart(3, '0')}`
  return raw.replace(/[^a-z0-9_-]/g, '')
}

export function nextLvIdFromRows(rows = []) {
  let max = 0
  const used = new Set()
  for (const row of rows || []) {
    const appId = normalizeLvId(row.app_id ?? row.appId ?? '')
    if (!appId) continue
    used.add(appId)
    const match = appId.match(/^lv(\d+)$/)
    if (match) max = Math.max(max, Number(match[1]))
  }
  let next = max + 1
  let candidate = `lv${String(next).padStart(3, '0')}`
  while (used.has(candidate)) {
    next += 1
    candidate = `lv${String(next).padStart(3, '0')}`
  }
  return candidate
}

export async function assignMissingAppIds(env) {
  if (!env.DB) return { ok: false, assigned: 0 }
  const { results } = await env.DB.prepare(`
    SELECT id, slug, app_id
    FROM stores
    ORDER BY created_at ASC, slug ASC
  `).all()

  const rows = results || []
  const assignedRows = rows.filter((row) => normalizeLvId(row.app_id))
  let assigned = 0
  for (const row of rows) {
    if (normalizeLvId(row.app_id)) continue
    const appId = nextLvIdFromRows(assignedRows)
    assignedRows.push({ app_id: appId })
    await env.DB.prepare(`
      UPDATE stores
      SET app_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(appId, row.id).run()
    assigned += 1
  }
  return { ok: true, assigned }
}

export async function findStoreForAppConfig(env, idOrStore = '') {
  if (!env.DB) return null
  const id = normalizeLvId(idOrStore)
  const raw = String(idOrStore || '').trim()
  if (!raw) return null
  return await env.DB.prepare(`
    SELECT
      id,
      app_id AS appId,
      name,
      slug,
      category,
      address,
      contact,
      status,
      plan,
      player_url AS playerUrl,
      player_url_updated_at AS playerUrlUpdatedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM stores
    WHERE lower(app_id) = lower(?)
       OR slug = ?
       OR id = ?
    LIMIT 1
  `).bind(id || raw, cleanSlug(raw) || raw, raw).first()
}

export function playerBaseUrl(request, env) {
  const explicit = String(env.PLAYER_BASE || env.PLAYER_BASE_URL || '').trim().replace(/\/$/, '')
  if (explicit) return explicit
  const url = new URL(request.url)
  if (url.hostname.includes('cms')) return `${url.protocol}//${url.hostname.replace('cms', 'player')}`
  return 'https://localvision-player.pages.dev'
}

function applyPlayerUrlDefaults(request, env, url, storeSlug = '', appId = '') {
  const cmsOrigin = new URL(request.url).origin
  const normalizedAppId = normalizeLvId(appId)
  if (storeSlug && !url.searchParams.has('store')) url.searchParams.set('store', storeSlug)
  if (normalizedAppId && !url.searchParams.has('id')) url.searchParams.set('id', normalizedAppId)
  if (!url.searchParams.has('apiBase')) url.searchParams.set('apiBase', cmsOrigin)
  if (!url.searchParams.has('refresh')) url.searchParams.set('refresh', String(DEFAULT_CONTENT_CHECK_MS))
  if (!url.searchParams.has('heartbeat')) url.searchParams.set('heartbeat', String(DEFAULT_HEARTBEAT_MS))
  if (!url.searchParams.has('commandPoll')) url.searchParams.set('commandPoll', String(DEFAULT_COMMAND_POLL_MS))
  if (!url.searchParams.has('statePoll')) url.searchParams.set('statePoll', String(DEFAULT_PLAYER_STATE_POLL_MS))
  if (!url.searchParams.has('appConfigPoll')) url.searchParams.set('appConfigPoll', String(DEFAULT_APP_CONFIG_POLL_MS))
  if (!url.searchParams.has('noticePollMs')) url.searchParams.set('noticePollMs', String(DEFAULT_NOTICE_POLL_MS))
  if (!url.searchParams.has('cacheMax')) url.searchParams.set('cacheMax', '20')
  if (!url.searchParams.has('bundleMode')) url.searchParams.set('bundleMode', 'cache')
  if (!url.searchParams.has('cacheAll')) url.searchParams.set('cacheAll', '1')
  if (!url.searchParams.has('videoMode')) url.searchParams.set('videoMode', 'cache')
  if (!url.searchParams.has('cacheVia')) url.searchParams.set('cacheVia', 'api')
  if (!url.searchParams.has('activateWhenCached')) url.searchParams.set('activateWhenCached', '1')
  // Player v1.7.3 기본 운영값: public R2 playlist.json 직접 fetch를 끄고 API payload playlists를 우선 사용합니다.
  if (!url.searchParams.has('snapshotFetch')) url.searchParams.set('snapshotFetch', '0')
  if (!url.searchParams.has('restart')) url.searchParams.set('restart', '09:30')
  if (!url.searchParams.has('restartMode')) url.searchParams.set('restartMode', 'reload')
  if (!url.searchParams.has('restartJitterSec')) url.searchParams.set('restartJitterSec', '0')
  if (!url.searchParams.has('fit')) url.searchParams.set('fit', 'cover')
  return url
}

export function buildPlayerUrl(request, env, storeSlug, overrideUrl = '', appId = '') {
  const override = String(overrideUrl || '').trim()
  if (override) {
    try {
      const url = new URL(override)
      return applyPlayerUrlDefaults(request, env, url, storeSlug, appId).toString()
    } catch {
      return override
    }
  }
  const base = playerBaseUrl(request, env)
  const url = new URL(base)
  applyPlayerUrlDefaults(request, env, url, storeSlug, appId)
  return url.toString()
}


function canonicalUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return decodeURIComponent(url.pathname).replace(/^\/+/, '').split('?')[0]
  } catch {
    return decodeURIComponent(raw).replace(/^https?:\/\/[^/]+\//, '').split('?')[0]
  }
}

function basename(value = '') {
  return String(value || '').split('/').pop().split('\\').pop().trim()
}

function normalizeMediaToken(value = '') {
  let name = basename(value)
  if (!name) return ''
  name = decodeURIComponent(name).split('?')[0].trim().toLowerCase()
  // CMS 업로드 파일명은 20260506103328-left_1.jpg처럼 timestamp가 앞에 붙습니다.
  // R2 자동스캔/수동 등록 행과 비교할 때는 이 timestamp를 제거해야 같은 콘텐츠를 2개로 보지 않습니다.
  name = name.replace(/^\d{8,14}[-_]+/, '')
  name = name.replace(/^\d{4}[-_]?\d{2}[-_]?\d{2}[-_]?\d{6}[-_]+/, '')
  name = name.replace(/^copy[-_]+/, '')
  return name
}

function contentKey(row = {}) {
  const store = String(row.store || '').trim()
  const side = String(row.side || '').trim()
  const fileName = String(row.fileName ?? row.file_name ?? '').trim()
  const urlPath = canonicalUrl(row.url || '')
  const byFile = normalizeMediaToken(fileName)
  const byUrl = normalizeMediaToken(urlPath)
  const byTitle = normalizeMediaToken(row.title || '')
  const token = byFile || byUrl || byTitle
  if (!store || !side || !token) return ''
  return `${store}::${side}::${token}`
}

function contentScore(row = {}) {
  const id = String(row.id || '')
  let score = 0
  // TV 재생에는 URL이 있는 행이 가장 중요합니다. 기존에는 r2_가 낮은 점수를 받아
  // URL 없는 수동 행이 살아남아 중복/빈 재생목록이 생길 수 있었습니다.
  if (String(row.url || '').trim()) score += 200
  if (id.startsWith('ct_')) score += 60
  if (!id.startsWith('r2_')) score += 30
  if (String(row.status || '') === '사용중') score += 20
  if (Number(row.duration || 0) > 0) score += 5
  if (String(row.title || '').trim()) score += 5
  score += Number(row.sortOrder ?? row.sort_order ?? 0) ? 1 : 0
  return score
}

export function dedupeContentsRows(rows = []) {
  const map = new Map()
  for (const row of rows || []) {
    const key = contentKey(row)
    if (!key) continue
    const prev = map.get(key)
    if (!prev || contentScore(row) >= contentScore(prev)) {
      map.set(key, row)
    }
  }
  return [...map.values()]
}


export async function cleanupDuplicateContents(env) {
  if (!env.DB) return { ok: false, reason: 'D1 binding DB is missing', deleted: 0 }
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at, r2_key
      FROM contents
      ORDER BY store ASC, side ASC, sort_order ASC, updated_at DESC
    `).all()
    const keep = new Set(dedupeContentsRows(results || []).map((row) => row.id))
    const remove = (results || []).filter((row) => row.id && !keep.has(row.id)).map((row) => row.id)
    let deleted = 0
    if (remove.length) {
      for (let i = 0; i < remove.length; i += 50) {
        const chunk = remove.slice(i, i + 50)
        const placeholders = chunk.map(() => '?').join(',')
        const res = await env.DB.prepare(`DELETE FROM contents WHERE id IN (${placeholders})`).bind(...chunk).run()
        deleted += res?.meta?.changes || chunk.length
      }
    }
    return { ok: true, deleted, kept: keep.size }
  } catch (error) {
    return { ok: false, reason: String(error?.message || error), deleted: 0 }
  }
}

export async function cleanupSyntheticR2Duplicates(env) {
  if (!env.DB) return { ok: false, reason: 'D1 binding DB is missing', deleted: 0 }
  try {
    // R2 자동스캔으로 만들어진 r2_ 행이 같은 store/side/file_name을 가진 CMS 행(ct_ 등)과 겹치면
    // r2_ 행만 삭제합니다. R2 실제 파일은 건드리지 않습니다.
    const result = await env.DB.prepare(`
      DELETE FROM contents
      WHERE id LIKE 'r2_%'
        AND COALESCE(file_name, '') <> ''
        AND EXISTS (
          SELECT 1
          FROM contents c2
          WHERE c2.id NOT LIKE 'r2_%'
            AND c2.store = contents.store
            AND c2.side = contents.side
            AND COALESCE(c2.file_name, '') = COALESCE(contents.file_name, '')
        )
    `).run()
    return { ok: true, deleted: result?.meta?.changes || 0 }
  } catch (error) {
    return { ok: false, reason: String(error?.message || error), deleted: 0 }
  }
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
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      app_id TEXT DEFAULT '',
      player_url TEXT DEFAULT '',
      player_url_updated_at TEXT DEFAULT ''
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      store TEXT NOT NULL,
      side TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      duration INTEGER DEFAULT 20,
      status TEXT DEFAULT '사용중',
      file_name TEXT DEFAULT '',
      url TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      r2_key TEXT DEFAULT ''
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
      app TEXT DEFAULT 'APP v9.2 Minimal Shell',
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
      repeat_mode TEXT DEFAULT 'once',
      repeat_interval_min INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      r2_key TEXT DEFAULT '',
      timezone TEXT DEFAULT 'Asia/Seoul'
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
  await addColumnIfMissing(env, 'stores', 'app_id', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'stores', 'player_url', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'stores', 'player_url_updated_at', `TEXT DEFAULT ''`)

  await addColumnIfMissing(env, 'contents', 'duration', `INTEGER DEFAULT 20`)
  await addColumnIfMissing(env, 'contents', 'status', `TEXT DEFAULT '사용중'`)
  await addColumnIfMissing(env, 'contents', 'file_name', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'contents', 'url', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'contents', 'sort_order', `INTEGER DEFAULT 0`)
  await addColumnIfMissing(env, 'contents', 'updated_at', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'contents', 'r2_key', `TEXT DEFAULT ''`)

  await addColumnIfMissing(env, 'devices', 'role', `TEXT DEFAULT 'tv'`)
  await addColumnIfMissing(env, 'devices', 'online', `INTEGER DEFAULT 0`)
  await addColumnIfMissing(env, 'devices', 'last_seen', `TEXT DEFAULT '아직 접속 없음'`)
  await addColumnIfMissing(env, 'devices', 'app', `TEXT DEFAULT 'APP v9.2 Minimal Shell'`)
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
  await addColumnIfMissing(env, 'notices', 'repeat_mode', `TEXT DEFAULT 'once'`)
  await addColumnIfMissing(env, 'notices', 'repeat_interval_min', `INTEGER DEFAULT 0`)
  await addColumnIfMissing(env, 'notices', 'is_active', `INTEGER DEFAULT 1`)
  await addColumnIfMissing(env, 'notices', 'created_at', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'updated_at', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'r2_key', `TEXT DEFAULT ''`)
  await addColumnIfMissing(env, 'notices', 'timezone', `TEXT DEFAULT 'Asia/Seoul'`)

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
  await tryRun(env, `UPDATE contents SET duration = 20 WHERE duration IS NULL OR duration = '' OR duration <= 0`)
  await tryRun(env, `UPDATE devices SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''`)
  await tryRun(env, `UPDATE devices SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL OR updated_at = ''`)
  await tryRun(env, `UPDATE notices SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''`)
  await tryRun(env, `UPDATE notices SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL OR updated_at = ''`)

  await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_contents_store_side ON contents(store, side)`)
  await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_devices_store ON devices(store)`)
  await tryRun(env, `CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_app_id_unique ON stores(app_id) WHERE app_id IS NOT NULL AND app_id <> ''`)
  await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_player_errors_store_created ON player_errors(store, created_at)`)
  await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_device_screenshots_store_created ON device_screenshots(store, created_at)`)
  await assignMissingAppIds(env)
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
      duration: DEFAULT_CONTENT_DURATION,
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
      VALUES (?, ?, ?, 'tv', 0, '아직 접속 없음', 'APP v9.2 Minimal Shell', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [`tv_${store.slug}`, store.slug, `${store.name} TV 1`, `LV-${store.slug.toUpperCase()}-01`])
    if (deviceResult?.success || deviceResult?.meta) insertedDevices++
    if (deviceResult?.ok === false) errors.push(deviceResult.error)
  }

  for (const content of scan.contents) {
    try {
      const existing = await env.DB.prepare(`
        SELECT id, url
        FROM contents
        WHERE store = ?
          AND side = ?
          AND file_name = ?
        ORDER BY CASE WHEN id LIKE 'r2_%' THEN 1 ELSE 0 END ASC, updated_at DESC
        LIMIT 1
      `).bind(content.store, content.side, content.fileName).first()

      if (existing && !String(existing.id || '').startsWith('r2_')) {
        // 같은 R2 파일을 이미 CMS 업로드 행(ct_)이 관리 중이면 r2_ 중복 행은 만들지 않습니다.
        // URL이 비어 있는 오래된 행만 보강합니다.
        await tryRun(env, `
          UPDATE contents
          SET url = CASE WHEN COALESCE(url, '') = '' THEN ? ELSE url END,
              r2_key = CASE WHEN COALESCE(r2_key, '') = '' THEN ? ELSE r2_key END,
              updated_at = CASE WHEN COALESCE(updated_at, '') = '' THEN ? ELSE updated_at END
          WHERE id = ?
        `, [content.url, content.r2Key, content.updatedAt, existing.id])
        await tryRun(env, `
          DELETE FROM contents
          WHERE id LIKE 'r2_%'
            AND store = ?
            AND side = ?
            AND file_name = ?
        `, [content.store, content.side, content.fileName])
        continue
      }

      const result = await tryRun(env, `
        INSERT OR REPLACE INTO contents
        (id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at, r2_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [content.id, content.store, content.side, content.type, content.title, content.duration, content.status, content.fileName, content.url, content.sortOrder, content.updatedAt, content.r2Key])
      if (result?.success || result?.meta) insertedContents++
      if (result?.ok === false) errors.push(result.error)
    } catch (error) {
      errors.push(String(error?.message || error))
    }
  }

  const cleanup = await cleanupSyntheticR2Duplicates(env)

  return { ok: errors.length === 0, ...scan, insertedStores, insertedContents, insertedDevices, cleanup, errors }
}



// ===== LocalVision v1.8.2 API Diet + Heartbeat Lite helpers =====
// TV 재생 시점마다 R2 list/scan을 하지 않고, CMS에서 미리 만들어 둔 playlist snapshot JSON을 읽게 하기 위한 공통 함수입니다.
export function playlistSnapshotKey(store = '', side = 'bundle') {
  const cleanStore = cleanSlug(store || '')
  if (side === 'right') return 'stores/_common/right/playlist.json'
  if (side === 'left') return `stores/${cleanStore}/left/playlist.json`
  return `stores/${cleanStore}/playlist.json`
}

export function playlistSnapshotUrl(request, env, store = '', side = 'bundle') {
  return makePublicUrl(request, env, playlistSnapshotKey(store, side))
}

export function normalizeContentForPlayer(row = {}) {
  return {
    id: row.id,
    store: row.store,
    side: row.side,
    type: row.type || detectTypeFromName(row.fileName || row.file_name || row.url || ''),
    title: row.title || row.fileName || row.file_name || '',
    duration: Number(row.duration || DEFAULT_CONTENT_DURATION),
    status: row.status || '사용중',
    fileName: row.fileName ?? row.file_name ?? '',
    url: row.url || '',
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    updatedAt: row.updatedAt ?? row.updated_at ?? '',
    updatedAtKst: (row.updatedAt ?? row.updated_at) ? toKstString(row.updatedAt ?? row.updated_at) : '',
    r2Key: row.r2Key ?? row.r2_key ?? r2KeyFromUrl(row.url || ''),
  }
}

export async function readContentsForPlaylist(env, store = '', side = 'left') {
  if (!env.DB) return []
  const targetStore = side === 'right' ? '_common' : cleanSlug(store || '')
  if (!targetStore) return []
  const { results } = await env.DB.prepare(`
    SELECT id, store, side, type, title, duration, status,
           file_name AS fileName, url, sort_order AS sortOrder,
           updated_at AS updatedAt, r2_key AS r2Key
    FROM contents
    WHERE store = ? AND side = ? AND status = '사용중'
    ORDER BY sort_order ASC, updated_at DESC
  `).bind(targetStore, side).all()
  return dedupeContentsRows(results || []).map(normalizeContentForPlayer).filter((item) => item.url)
}

export async function readStoreBySlugOrId(env, storeOrId = '') {
  if (!env.DB) return null
  const raw = String(storeOrId || '').trim()
  if (!raw) return null
  const appId = normalizeLvId(raw)
  const slug = cleanSlug(raw)
  return await env.DB.prepare(`
    SELECT id, app_id AS appId, name, slug, category, address, contact, status, plan,
           player_url AS playerUrl, player_url_updated_at AS playerUrlUpdatedAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM stores
    WHERE slug = ? OR lower(app_id) = lower(?) OR id = ?
    LIMIT 1
  `).bind(slug, appId || raw, raw).first()
}

function snapshotVersionOf(left = [], right = []) {
  const light = { left: left.map((x) => [x.id, x.url, x.updatedAt, x.sortOrder]), right: right.map((x) => [x.id, x.url, x.updatedAt, x.sortOrder]) }
  const text = JSON.stringify(light)
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  return `pl_${Math.abs(hash)}_${left.length}_${right.length}`
}

export async function makePlaylistSnapshot(request, env, store = '') {
  const cleanStore = cleanSlug(store || '')
  const left = await readContentsForPlaylist(env, cleanStore, 'left')
  const right = await readContentsForPlaylist(env, '_common', 'right')
  const now = nowUtcIso()
  const playlistVersion = snapshotVersionOf(left, right)
  return {
    ok: true,
    version: LV_CORE_VERSION,
    mode: 'playlist-snapshot',
    store: cleanStore,
    playlistVersion,
    layout: { leftRatio: 70, rightRatio: 30 },
    playlists: { left, right },
    playlistUrls: {
      bundle: playlistSnapshotUrl(request, env, cleanStore, 'bundle'),
      left: playlistSnapshotUrl(request, env, cleanStore, 'left'),
      right: playlistSnapshotUrl(request, env, '_common', 'right'),
    },
    counts: { left: left.length, right: right.length },
    updatedAt: now,
    updatedAtKst: nowKstString(),
  }
}

export async function writeJsonToR2(env, key, data) {
  if (!env.MEDIA) return { ok: false, skipped: true, reason: 'R2 binding MEDIA is missing', key }
  const body = JSON.stringify(data, null, 2)
  await env.MEDIA.put(key, body, {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'public, max-age=30, s-maxage=30',
    },
    customMetadata: {
      kind: 'localvision-playlist-snapshot',
      version: LV_CORE_VERSION,
      updatedAt: data.updatedAt || nowUtcIso(),
    },
  })
  return { ok: true, key, bytes: body.length }
}


export async function writeCommonRightSnapshot(request, env) {
  const right = await readContentsForPlaylist(env, '_common', 'right')
  const now = nowUtcIso()
  const doc = {
    ok: true,
    version: LV_CORE_VERSION,
    mode: 'playlist-snapshot',
    store: '_common',
    side: 'right',
    playlistVersion: snapshotVersionOf([], right),
    items: right,
    playlists: { right },
    playlistUrls: { right: playlistSnapshotUrl(request, env, '_common', 'right') },
    counts: { right: right.length },
    updatedAt: now,
    updatedAtKst: nowKstString(),
  }
  const result = await writeJsonToR2(env, playlistSnapshotKey('_common', 'right'), doc)
  return { ok: result.ok || result.skipped, snapshot: doc, result }
}

export async function writePlaylistSnapshots(request, env, store = '') {
  const cleanStore = cleanSlug(store || '')
  if (!cleanStore) return { ok: false, reason: 'store is required' }
  const snapshot = await makePlaylistSnapshot(request, env, cleanStore)
  const leftDoc = { ...snapshot, side: 'left', items: snapshot.playlists.left, playlists: { left: snapshot.playlists.left } }
  const rightDoc = { ...snapshot, store: '_common', side: 'right', items: snapshot.playlists.right, playlists: { right: snapshot.playlists.right } }
  const results = []
  results.push(await writeJsonToR2(env, playlistSnapshotKey(cleanStore, 'bundle'), snapshot))
  results.push(await writeJsonToR2(env, playlistSnapshotKey(cleanStore, 'left'), leftDoc))
  results.push(await writeJsonToR2(env, playlistSnapshotKey('_common', 'right'), rightDoc))
  return { ok: results.every((r) => r.ok || r.skipped), store: cleanStore, snapshot, results }
}

export async function readPlaylistSnapshotFromR2(request, env, store = '') {
  if (!env.MEDIA) return null
  const cleanStore = cleanSlug(store || '')
  const key = playlistSnapshotKey(cleanStore, 'bundle')
  const object = await env.MEDIA.get(key)
  if (!object) return null
  try {
    const data = JSON.parse(await object.text())
    return { ...data, source: 'r2-playlist-snapshot', snapshotKey: key, snapshotUrl: playlistSnapshotUrl(request, env, cleanStore, 'bundle') }
  } catch {
    return null
  }
}

export function safeErrorMessage(error) {
  return String(error?.message || error || 'unknown error').slice(0, 500)
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


function deviceFreshnessScore(row = {}, env, nowMs = Date.now()) {
  const lastSeenValue = row.lastSeen ?? row.last_seen
  const lastSeenMs = parseLastSeenMs(lastSeenValue, nowMs)
  const updatedMs = parseLastSeenMs(row.updatedAt ?? row.updated_at, nowMs)
  const createdMs = parseLastSeenMs(row.createdAt ?? row.created_at, nowMs)
  let score = 0
  if (lastSeenMs) score += lastSeenMs
  else if (updatedMs) score += updatedMs / 10
  else if (createdMs) score += createdMs / 100
  const id = String(row.id || '')
  const store = String(row.store || '')
  if (id === `tv_${store}`) score += 10 ** 15
  if (String(row.lastCommand ?? row.last_command ?? '').trim()) score += 10 ** 8
  return score
}

function latestCommandRow(rows = []) {
  let best = null
  let bestTime = 0
  for (const row of rows) {
    const command = String(row.lastCommand ?? row.last_command ?? '').trim()
    const commandAt = String(row.commandAt ?? row.command_at ?? '').trim()
    if (!command || !commandAt) continue
    const ms = parseLastSeenMs(commandAt) || Date.parse(commandAt) || 0
    if (!best || ms >= bestTime) {
      best = row
      bestTime = ms
    }
  }
  return best
}

export function dedupeDeviceRows(rows = [], env) {
  const grouped = new Map()
  for (const row of rows || []) {
    const store = cleanSlug(row.store || '') || String(row.store || '').trim()
    if (!store) continue
    if (!grouped.has(store)) grouped.set(store, [])
    grouped.get(store).push({ ...row, store })
  }

  const result = []
  const nowMs = Date.now()
  for (const [store, group] of grouped.entries()) {
    const best = [...group].sort((a, b) => deviceFreshnessScore(b, env, nowMs) - deviceFreshnessScore(a, env, nowMs))[0]
    const freshest = [...group].sort((a, b) => (parseLastSeenMs(b.lastSeen ?? b.last_seen, nowMs) || 0) - (parseLastSeenMs(a.lastSeen ?? a.last_seen, nowMs) || 0))[0]
    const commandRow = latestCommandRow(group)
    result.push({
      ...best,
      id: best.id || `tv_${store}`,
      store,
      name: best.name || `${store} TV 1`,
      lastSeen: freshest?.lastSeen ?? freshest?.last_seen ?? best.lastSeen ?? best.last_seen,
      last_seen: freshest?.last_seen ?? freshest?.lastSeen ?? best.last_seen ?? best.lastSeen,
      app: freshest?.app || best.app || 'APP v9.2 Minimal Shell',
      deviceCode: best.deviceCode ?? best.device_code ?? `LV-${store.toUpperCase()}-01`,
      device_code: best.device_code ?? best.deviceCode ?? `LV-${store.toUpperCase()}-01`,
      lastCommand: commandRow?.lastCommand ?? commandRow?.last_command ?? best.lastCommand ?? best.last_command ?? '',
      last_command: commandRow?.last_command ?? commandRow?.lastCommand ?? best.last_command ?? best.lastCommand ?? '',
      commandAt: commandRow?.commandAt ?? commandRow?.command_at ?? best.commandAt ?? best.command_at ?? '',
      command_at: commandRow?.command_at ?? commandRow?.commandAt ?? best.command_at ?? best.commandAt ?? '',
    })
  }
  return result
}

export async function cleanupDuplicateDevices(env) {
  if (!env.DB) return { ok: false, reason: 'D1 binding DB is missing', deleted: 0, merged: 0 }
  try {
    const { results } = await env.DB.prepare(`SELECT * FROM devices ORDER BY store ASC, created_at DESC`).all()
    const groups = new Map()
    for (const row of results || []) {
      const store = cleanSlug(row.store || '') || String(row.store || '').trim()
      if (!store) continue
      if (!groups.has(store)) groups.set(store, [])
      groups.get(store).push({ ...row, store })
    }

    let deleted = 0
    let merged = 0
    for (const [store, rows] of groups.entries()) {
      if (rows.length <= 1) continue
      const canonical = rows.find((row) => row.id === `tv_${store}`) || [...rows].sort((a, b) => deviceFreshnessScore(b, env) - deviceFreshnessScore(a, env))[0]
      const freshest = [...rows].sort((a, b) => (parseLastSeenMs(b.last_seen) || 0) - (parseLastSeenMs(a.last_seen) || 0))[0]
      const commandRow = latestCommandRow(rows)
      await env.DB.prepare(`
        UPDATE devices
        SET store = ?,
            name = COALESCE(NULLIF(name, ''), ?),
            role = COALESCE(NULLIF(role, ''), 'tv'),
            online = 0,
            last_seen = ?,
            app = ?,
            device_code = ?,
            last_command = ?,
            command_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        store,
        `${store} TV 1`,
        freshest?.last_seen || freshest?.lastSeen || canonical.last_seen || '아직 접속 없음',
        freshest?.app || canonical.app || 'APP v9.2 Minimal Shell',
        canonical.device_code || canonical.deviceCode || `LV-${store.toUpperCase()}-01`,
        commandRow?.last_command || commandRow?.lastCommand || canonical.last_command || '',
        commandRow?.command_at || commandRow?.commandAt || canonical.command_at || '',
        canonical.id
      ).run()
      const idsToDelete = rows.filter((row) => row.id !== canonical.id).map((row) => row.id)
      if (idsToDelete.length) {
        const placeholders = idsToDelete.map(() => '?').join(',')
        const res = await env.DB.prepare(`DELETE FROM devices WHERE id IN (${placeholders})`).bind(...idsToDelete).run()
        deleted += res?.meta?.changes || idsToDelete.length
      }
      merged += 1
    }
    return { ok: true, deleted, merged }
  } catch (error) {
    return { ok: false, reason: String(error?.message || error), deleted: 0, merged: 0 }
  }
}

export function mapDevice(row, env, nowMs = Date.now()) {
  const lastSeenValue = row.lastSeen ?? row.last_seen
  const lastSeenMs = parseLastSeenMs(lastSeenValue, nowMs)
  const ttlSec = onlineTtlSec(env)
  const secondsAgo = lastSeenMs ? Math.max(0, Math.floor((nowMs - lastSeenMs) / 1000)) : null
  const isFresh = lastSeenMs > 0 && nowMs - lastSeenMs <= ttlSec * 1000
  const lastSeenUtc = lastSeenMs ? new Date(lastSeenMs).toISOString() : ''
  const lastSeenKst = lastSeenMs ? toKstString(lastSeenMs) : ''
  const updatedMs = parseLastSeenMs(row.updatedAt ?? row.updated_at, nowMs)
  const commandMs = parseLastSeenMs(row.commandAt ?? row.command_at, nowMs)
  const offlineReason = isFresh
    ? ''
    : lastSeenMs
      ? `heartbeat 미수신: 마지막 신호 이후 ${secondsAgoText(secondsAgo)} 경과`
      : 'heartbeat 기록 없음'

  return {
    id: row.id,
    store: row.store,
    name: row.name,
    role: row.role,
    online: isFresh,
    onlineTtlSec: ttlSec,
    lastSeen: lastSeenKst || lastSeenValue || '아직 접속 없음',
    lastSeenRaw: lastSeenValue,
    lastSeenAt: lastSeenUtc,
    lastSeenUtc,
    lastSeenKst,
    lastSeenSecondsAgo: secondsAgo,
    lastSeenAgo: secondsAgo === null ? '기록 없음' : secondsAgoText(secondsAgo),
    offlineReason,
    serverNowUtc: new Date(nowMs).toISOString(),
    serverNowKst: toKstString(nowMs),
    app: row.app,
    deviceCode: row.deviceCode ?? row.device_code,
    lastCommand: row.lastCommand ?? row.last_command,
    commandAt: commandMs ? toKstString(commandMs) : (row.commandAt ?? row.command_at ?? ''),
    commandAtRaw: row.commandAt ?? row.command_at ?? '',
    commandAtUtc: commandMs ? new Date(commandMs).toISOString() : '',
    commandAtKst: commandMs ? toKstString(commandMs) : '',
    updatedAt: updatedMs ? toKstString(updatedMs) : (row.updatedAt ?? row.updated_at ?? ''),
    updatedAtRaw: row.updatedAt ?? row.updated_at ?? '',
    updatedAtUtc: updatedMs ? new Date(updatedMs).toISOString() : '',
    updatedAtKst: updatedMs ? toKstString(updatedMs) : '',
  }
}
