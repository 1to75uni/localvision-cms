import {
  json,
  DEFAULT_CONTENT_DURATION,
  LV_CORE_VERSION,
  ensureCoreSchema,
  scanR2Media,
  mapDevice,
  dedupeContentsRows,
  cleanupSyntheticR2Duplicates,
  cleanupDuplicateContents,
  cleanupDuplicateDevices,
  dedupeDeviceRows,
  nowUtcIso,
  nowKstString,
  toKstString,
  normalizeLvId,
  findStoreForAppConfig,
  buildPlayerUrl,
  playerBaseUrl,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_COMMAND_POLL_MS,
  DEFAULT_NOTICE_POLL_MS,
  DEFAULT_CONTENT_CHECK_MS,
  DEFAULT_APP_CONFIG_POLL_MS,
  DEFAULT_PLAYER_STATE_POLL_MS,
  DEFAULT_D1_HEARTBEAT_WRITE_SEC,
  parseLastSeenMs,
  onlineTtlSec,
  cleanSlug,
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

function normalizeContent(row) {
  return {
    id: row.id,
    store: row.store,
    side: row.side,
    type: row.type,
    title: row.title,
    duration: Number(row.duration || DEFAULT_CONTENT_DURATION),
    status: row.status,
    fileName: row.fileName ?? row.file_name ?? '',
    url: row.url || '',
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    updatedAt: row.updatedAt ?? row.updated_at ?? '',
    updatedAtKst: (row.updatedAt ?? row.updated_at) ? toKstString(row.updatedAt ?? row.updated_at) : '',
    r2Key: row.r2Key ?? row.r2_key ?? '',
  }
}

function mapNotice(row) {
  if (!row) return null
  return {
    id: row.id,
    store: row.store,
    title: row.title,
    type: row.type,
    message: row.message || '',
    mediaUrl: row.mediaUrl || '',
    linkUrl: row.linkUrl || '',
    fileName: row.fileName || '',
    r2Key: row.r2Key || '',
    startAt: row.startAt || '',
    endAt: row.endAt || '',
    startAtUtc: row.startAt || '',
    endAtUtc: row.endAt || '',
    startAtKst: row.startAt ? toKstString(row.startAt) : '',
    endAtKst: row.endAt ? toKstString(row.endAt) : '',
    displayMode: row.displayMode || 'fullscreen',
    priority: row.priority || 'normal',
    durationSec: Number(row.durationSec || 15),
    repeatMode: row.repeatMode || 'once',
    repeatIntervalMin: Number(row.repeatIntervalMin ?? row.repeat_interval_min ?? 0),
    isActive: Boolean(row.isActive),
    updatedAt: row.updatedAt || '',
    updatedAtKst: row.updatedAt ? toKstString(row.updatedAt) : '',
  }
}

async function readBody(request) {
  try { return await request.json() } catch { return {} }
}

function safeStoreDeviceId(store = '') {
  const clean = cleanSlug(store) || String(store || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return `tv_${clean}`
}

function makePlayerAppLabel(body = {}) {
  const version = String(body.playerVersion || 'v1.6.8-url-operation-core').trim()
  const appShell = body.appShell ? ` · APP Shell${body.appVersion ? ` ${body.appVersion}` : ''}` : ''
  const play = body.playStatus ? ` · ${body.playStatus}` : ''
  return `Player ${version}${appShell}${play}`.slice(0, 240)
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const body = await readBody(request)
  const store = cleanSlug(body.store || '')
  const appId = normalizeLvId(body.appId || body.id || '')
  if (!store && !appId) return json({ ok: false, error: 'store or id is required' }, 400)

  let resolvedStore = store
  if (!resolvedStore && appId) {
    const storeRow = await findStoreForAppConfig(env, appId)
    resolvedStore = cleanSlug(storeRow?.slug || '')
  }
  if (!resolvedStore) return json({ ok: false, error: 'store not found' }, 404)

  const canonicalId = safeStoreDeviceId(resolvedStore)
  const now = nowUtcIso()
  const lastSeen = body.lastSeen || now
  const name = `${resolvedStore} TV`
  const app = makePlayerAppLabel(body)
  const role = 'player'

  let current = await env.DB.prepare(`SELECT * FROM devices WHERE id = ? LIMIT 1`).bind(canonicalId).first()
  if (!current) {
    current = await env.DB.prepare(`
      SELECT * FROM devices
      WHERE store = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `).bind(resolvedStore).first()
  }

  if (!current) {
    await env.DB.prepare(`
      INSERT INTO devices
      (id, store, name, role, online, last_seen, app, device_code, last_command, command_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(canonicalId, resolvedStore, name, role, lastSeen, app, `LV-${resolvedStore.toUpperCase()}-01`).run()
  } else {
    const nowMs = Date.now()
    const lastWrittenMs = parseLastSeenMs(current.last_seen || current.lastSeen || '', nowMs)
    const writeSec = Math.max(0, Number(env.D1_HEARTBEAT_WRITE_SEC || DEFAULT_D1_HEARTBEAT_WRITE_SEC || 600))
    const wasFresh = lastWrittenMs > 0 && nowMs - lastWrittenMs <= onlineTtlSec(env) * 1000
    const appChanged = String(current.app || '') !== app
    const shouldWrite = !lastWrittenMs || !wasFresh || appChanged || writeSec <= 0 || nowMs - lastWrittenMs >= writeSec * 1000

    if (shouldWrite) {
      await env.DB.prepare(`
        UPDATE devices
        SET store = ?, name = ?, role = ?, online = 1, last_seen = ?, app = ?,
            device_code = COALESCE(NULLIF(device_code, ''), ?), updated_at = CURRENT_TIMESTAMP
        WHERE id = ? OR store = ?
      `).bind(resolvedStore, name, role, lastSeen, app, `LV-${resolvedStore.toUpperCase()}-01`, current.id || canonicalId, resolvedStore).run()
    } else {
      return json({
        ok: true,
        endpoint: '/api/player-state',
        mode: 'player-heartbeat-accepted-d1-skipped',
        d1Written: false,
        d1WritePolicySec: writeSec,
        updatedAt: now,
        updatedAtKst: nowKstString(),
        device: mapDevice({ ...current, store: resolvedStore, last_seen: lastSeen, lastSeen, online: 1, app, role, updatedAt: now }, env),
      })
    }
  }

  await cleanupDuplicateDevices(env)
  const row = await env.DB.prepare(`SELECT * FROM devices WHERE store = ? ORDER BY updated_at DESC LIMIT 1`).bind(resolvedStore).first()
  return json({
    ok: true,
    endpoint: '/api/player-state',
    mode: 'player-heartbeat-written',
    d1Written: true,
    updatedAt: now,
    updatedAtKst: nowKstString(),
    device: mapDevice(row || { id: canonicalId, store: resolvedStore, name, role, online: 1, last_seen: lastSeen, app }, env),
  })
}

export async function onRequestPatch(ctx) {
  return onRequestPost(ctx)
}

function appConfigResponse(request, env, store) {
  if (!store) return null
  const appId = normalizeLvId(store.appId || store.app_id || '')
  const overrideUrl = String(store.playerUrl || store.player_url || '').trim()
  const playerUrl = buildPlayerUrl(request, env, store.slug, overrideUrl, appId)
  const generatedPlayerUrl = buildPlayerUrl(request, env, store.slug, '', appId)
  const isActive = !['중지', '비활성', '사용안함', 'inactive', 'disabled'].includes(String(store.status || '').toLowerCase())
  return {
    ok: true,
    id: appId,
    appId,
    store: store.slug,
    storeName: store.name,
    status: store.status || '운영중',
    active: isActive,
    playerUrl,
    generatedPlayerUrl,
    playerBaseUrl: playerBaseUrl(request, env),
    hasCustomPlayerUrl: Boolean(overrideUrl),
    playerUrlUpdatedAt: store.playerUrlUpdatedAt || store.player_url_updated_at || '',
  }
}

function versionOf(items = [], notice = null, devices = [], appConfig = null) {
  const light = {
    left: items.left?.map((x) => [x.id, x.url, x.updatedAt, x.sortOrder, x.status]) || [],
    right: items.right?.map((x) => [x.id, x.url, x.updatedAt, x.sortOrder, x.status]) || [],
    notice: notice ? [notice.id, notice.updatedAt, notice.startAt, notice.endAt, notice.repeatMode] : null,
    command: devices?.map((d) => [d.store, d.lastCommand, d.commandAt]) || [],
    app: appConfig ? [appConfig.appId, appConfig.playerUrl, appConfig.active, appConfig.playerUrlUpdatedAt] : null,
  }
  let hash = 0
  const text = JSON.stringify(light)
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  return `lvstate_${Math.abs(hash)}`
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const storeSlug = url.searchParams.get('store') || ''
  const appId = url.searchParams.get('id') || url.searchParams.get('appId') || ''
  if (!storeSlug && !appId) return json({ ok: false, error: 'store or id is required' }, 400)
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  await ensureCoreSchema(env)
  await cleanupSyntheticR2Duplicates(env)
  await cleanupDuplicateContents(env)
  await cleanupDuplicateDevices(env)

  let store = null
  if (appId) store = await findStoreForAppConfig(env, appId)
  if (!store && storeSlug) {
    store = await env.DB.prepare(`
      SELECT id, app_id AS appId, name, slug, category, address, contact, status, plan,
             player_url AS playerUrl, player_url_updated_at AS playerUrlUpdatedAt, created_at AS createdAt
      FROM stores
      WHERE slug = ?
      LIMIT 1
    `).bind(storeSlug).first()
  }
  const resolvedStore = store?.slug || storeSlug
  if (!resolvedStore) return json({ ok: false, error: 'store not found' }, 404)

  let source = 'd1'
  let leftItems = []
  let rightItems = []

  const left = await env.DB.prepare(`
    SELECT id, store, side, type, title, duration, status, file_name AS fileName, url,
           sort_order AS sortOrder, updated_at AS updatedAt, r2_key AS r2Key
    FROM contents
    WHERE store = ? AND side = 'left' AND status = '사용중'
    ORDER BY sort_order ASC, updated_at DESC
  `).bind(resolvedStore).all()

  const right = await env.DB.prepare(`
    SELECT id, store, side, type, title, duration, status, file_name AS fileName, url,
           sort_order AS sortOrder, updated_at AS updatedAt, r2_key AS r2Key
    FROM contents
    WHERE store = '_common' AND side = 'right' AND status = '사용중'
    ORDER BY sort_order ASC, updated_at DESC
  `).all()

  leftItems = dedupeContentsRows(left.results || []).map(normalizeContent)
  rightItems = dedupeContentsRows(right.results || []).map(normalizeContent)

  if ((!store || !leftItems.length || !rightItems.length) && env.MEDIA) {
    const scan = await scanR2Media(request, env)
    const foundStore = scan.stores.find((item) => item.slug === resolvedStore)
    if (!store && foundStore) store = foundStore
    if (!leftItems.length) leftItems = dedupeContentsRows(scan.contents).filter((item) => item.store === resolvedStore && item.side === 'left').map(normalizeContent)
    if (!rightItems.length) rightItems = dedupeContentsRows(scan.contents).filter((item) => item.store === '_common' && item.side === 'right').map(normalizeContent)
    source = 'd1+r2-fallback'
  }

  if (!store) return json({ ok: false, error: 'store not found', source }, 404)

  const deviceRows = await env.DB.prepare(`
    SELECT id, store, name, role, online, last_seen AS lastSeen, app, device_code AS deviceCode,
           last_command AS lastCommand, command_at AS commandAt, updated_at AS updatedAt
    FROM devices
    WHERE store = ?
    ORDER BY created_at DESC
  `).bind(resolvedStore).all()
  const devices = dedupeDeviceRows(deviceRows.results || [], env).map((device) => mapDevice(device, env))
  const myDevice = devices.find((d) => d.store === resolvedStore) || devices[0] || null
  const command = myDevice?.lastCommand ? {
    command: myDevice.lastCommand,
    commandAt: myDevice.commandAt,
    commandAtUtc: myDevice.commandAtUtc,
    deviceId: myDevice.id,
    store: myDevice.store,
  } : null

  const now = nowUtcIso()
  const noticeRow = await env.DB.prepare(`
    SELECT id, store, title, type, message, media_url AS mediaUrl, link_url AS linkUrl,
           file_name AS fileName, r2_key AS r2Key, start_at AS startAt, end_at AS endAt,
           display_mode AS displayMode, priority, duration_sec AS durationSec,
           repeat_mode AS repeatMode, repeat_interval_min AS repeatIntervalMin, is_active AS isActive, updated_at AS updatedAt
    FROM notices
    WHERE (store = ? OR store = '_all')
      AND is_active = 1
      AND (start_at = '' OR start_at <= ?)
      AND (end_at = '' OR end_at >= ?)
    ORDER BY CASE priority WHEN 'urgent' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).bind(resolvedStore, now, now).first()
  const notice = mapNotice(noticeRow)
  const appConfig = appConfigResponse(request, env, store)

  const playlists = { left: leftItems, right: rightItems }
  const version = versionOf(playlists, notice, devices, appConfig)

  return json({
    ok: true,
    version: LV_CORE_VERSION,
    source,
    endpoint: '/api/player-state',
    store,
    appConfig,
    playlistVersion: version,
    noticeVersion: notice ? `${notice.id}:${notice.updatedAt || ''}` : '',
    commandVersion: command ? `${command.command}:${command.commandAt || ''}` : '',
    serverNowUtc: now,
    serverNowKst: nowKstString(),
    defaults: {
      heartbeat: DEFAULT_HEARTBEAT_MS,
      playerStatePollMs: DEFAULT_PLAYER_STATE_POLL_MS,
      commandPoll: DEFAULT_COMMAND_POLL_MS,
      noticePollMs: DEFAULT_NOTICE_POLL_MS,
      contentCheck: DEFAULT_CONTENT_CHECK_MS,
      appConfigPollMs: DEFAULT_APP_CONFIG_POLL_MS,
      onlineTtlSec: Number(env.ONLINE_TTL_SEC || 600),
      d1HeartbeatWriteSec: Number(env.D1_HEARTBEAT_WRITE_SEC || DEFAULT_D1_HEARTBEAT_WRITE_SEC),
    },
    layout: { leftRatio: 70, rightRatio: 30 },
    playlists,
    notice,
    activeNotice: notice,
    command,
    devices,
    updatedAt: now,
    updatedAtKst: nowKstString(),
  })
}
