import {
  json,
  LV_CORE_VERSION,
  findStoreForAppConfig,
  cleanSlug,
  dedupeDeviceRows,
  mapDevice,
  nowUtcIso,
  nowKstString,
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

const NATIVE_COMMANDS = new Set([
  'screenshot',
  'capture',
  'hard_refresh',
  'clear_cache',
  'clear_cache_refresh',
  'cache_refresh',
  'refresh',
  'reload_app',
  'reload_player',
])

function normalizeCommand(value) {
  return String(value || '').trim().toLowerCase()
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  // v2.0.4: APP Shell 명령 조회 GET에서는 schema repair/PRAGMA를 실행하지 않습니다.

  const url = new URL(request.url)
  const appId = String(url.searchParams.get('id') || url.searchParams.get('appId') || '').trim()
  const requestedStore = cleanSlug(url.searchParams.get('store') || '')
  const deviceId = String(url.searchParams.get('deviceId') || '').trim()

  let storeSlug = requestedStore
  let store = null
  if (!storeSlug && appId) {
    store = await findStoreForAppConfig(env, appId)
    storeSlug = cleanSlug(store?.slug || '')
  }

  if (!storeSlug) {
    return json({
      ok: true,
      version: LV_CORE_VERSION,
      endpoint: '/api/native-command',
      command: null,
      message: 'store or id is required; no command returned',
      serverNowUtc: nowUtcIso(),
      serverNowKst: nowKstString(),
    })
  }

  const rows = await env.DB.prepare(`
    SELECT id, store, name, role, online, last_seen AS lastSeen, app, device_code AS deviceCode,
           last_command AS lastCommand, command_at AS commandAt, updated_at AS updatedAt
    FROM devices
    WHERE store = ? OR id = ?
    ORDER BY updated_at DESC, created_at DESC
  `).bind(storeSlug, deviceId || `tv_${storeSlug}`).all()

  const devices = dedupeDeviceRows(rows.results || [], env).map((device) => mapDevice(device, env))
  const target = devices.find((d) => deviceId && d.id === deviceId)
    || devices.find((d) => d.store === storeSlug)
    || devices[0]
    || null

  const commandName = normalizeCommand(target?.lastCommand)
  const commandAt = target?.commandAt || target?.commandAtUtc || ''
  const command = commandName && NATIVE_COMMANDS.has(commandName) ? {
    command: commandName,
    commandAt,
    commandAtUtc: target?.commandAtUtc || commandAt,
    deviceId: target?.id || deviceId || `tv_${storeSlug}`,
    store: storeSlug,
    handledBy: 'android-native-app',
  } : null

  return json({
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/native-command',
    appId,
    store: storeSlug,
    deviceId: deviceId || '',
    command,
    devices,
    r2ScreenshotPrefix: `system/screenshots/${storeSlug}/`,
    screenshotUploadApi: '/api/screenshots',
    note: 'R2 폴더를 수동으로 만들 필요는 없습니다. APP이 /api/screenshots로 PNG를 올리면 CMS가 R2 system/screenshots/<store>/<deviceId>/ 아래에 자동 저장합니다.',
    serverNowUtc: nowUtcIso(),
    serverNowKst: nowKstString(),
  })
}
