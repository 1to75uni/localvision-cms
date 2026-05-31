import {
  json,
  LV_CORE_VERSION,
  ensureCoreSchema,
  mapDevice,
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
  readStoreBySlugOrId,
  readPlaylistSnapshotFromR2,
  makePlaylistSnapshot,
  writePlaylistSnapshots,
  playlistSnapshotUrl,
  safeErrorMessage,
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

async function readBody(request) { try { return await request.json() } catch { return {} } }

function safeStoreDeviceId(store = '') {
  const clean = cleanSlug(store) || String(store || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return `tv_${clean}`
}

function makePlayerAppLabel(body = {}) {
  const version = String(body.playerVersion || 'v1.7.3-content-sync-field-log').trim()
  const appShell = body.appShell ? ` · APP Shell${body.appVersion ? ` ${body.appVersion}` : ''}` : ''
  const play = body.playStatus ? ` · ${body.playStatus}` : ''
  return `Player ${version}${appShell}${play}`.slice(0, 240)
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


function computeBlackMode(row = {}) {
  const enabled = Number(row.blackMode ?? row.black_mode ?? 0) === 1
  const until = String(row.blackModeUntil ?? row.black_mode_until ?? '').trim()
  let active = enabled
  if (enabled && until) {
    const ms = Date.parse(until)
    if (ms && ms < Date.now()) active = false
  }
  return {
    enabled: active,
    rawEnabled: enabled,
    until,
    untilUtc: until,
    untilKst: until ? toKstString(until) : '',
    reason: row.blackModeReason ?? row.black_mode_reason ?? '',
    updatedAt: row.blackModeUpdatedAt ?? row.black_mode_updated_at ?? '',
    updatedAtKst: (row.blackModeUpdatedAt ?? row.black_mode_updated_at) ? toKstString(row.blackModeUpdatedAt ?? row.black_mode_updated_at) : '',
  }
}

async function readBlackModeState(env, store = '') {
  try {
    const row = await env.DB.prepare(`
      SELECT id, slug, black_mode AS blackMode, black_mode_until AS blackModeUntil,
             black_mode_reason AS blackModeReason, black_mode_updated_at AS blackModeUpdatedAt
      FROM stores
      WHERE slug = ? OR lower(app_id) = lower(?) OR id = ?
      LIMIT 1
    `).bind(store, store, store).first()
    if (!row) return computeBlackMode({})
    const state = computeBlackMode(row)
    if (state.rawEnabled && !state.enabled) {
      try {
        await env.DB.prepare(`
          UPDATE stores
          SET black_mode = 0, black_mode_reason = '', black_mode_updated_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(nowUtcIso(), row.id).run()
      } catch {}
    }
    return state
  } catch (error) {
    return { enabled: false, rawEnabled: false, until: '', untilUtc: '', untilKst: '', reason: '', updatedAt: '', updatedAtKst: '', unavailable: true }
  }
}

function versionOf(snapshot = {}, notice = null, devices = [], appConfig = null, blackMode = null) {
  const light = {
    playlistVersion: snapshot.playlistVersion || '',
    counts: snapshot.counts || {},
    blackMode,
    displayMode: blackMode.enabled ? 'black' : 'normal',
    contentReflect: {
      expectedMs: DEFAULT_PLAYER_STATE_POLL_MS,
      expectedText: `최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`,
      leftCount: Number(snapshot?.counts?.left || 0),
      rightCount: Number(snapshot?.counts?.right || 0),
      rightSource: '_common/right',
      note: 'Player는 다음 statePoll 확인 때 최신 재생목록을 적용합니다.',
    },
    notice: notice ? [notice.id, notice.updatedAt, notice.startAt, notice.endAt, notice.repeatMode] : null,
    command: devices?.map((d) => [d.store, d.lastCommand, d.commandAt]) || [],
    app: appConfig ? [appConfig.appId, appConfig.playerUrl, appConfig.active, appConfig.playerUrlUpdatedAt] : null,
    blackMode: blackMode ? [blackMode.enabled, blackMode.until, blackMode.updatedAt] : null,
  }
  let hash = 0
  const text = JSON.stringify(light)
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  return `lvstate_${Math.abs(hash)}`
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  // v1.8.2: heartbeat 경로에서는 매번 schema repair를 돌리지 않습니다.
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

export async function onRequestPatch(ctx) { return onRequestPost(ctx) }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const storeSlug = url.searchParams.get('store') || ''
  const appId = url.searchParams.get('id') || url.searchParams.get('appId') || ''
  const forceRebuild = ['1', 'true', 'yes'].includes(String(url.searchParams.get('rebuild') || '').toLowerCase())
  if (!storeSlug && !appId) return json({ ok: false, errorCode: 'LV-STORE-MISSING', error: 'store or id is required' }, 400)
  if (!env.DB) return json({ ok: false, errorCode: 'LV-DB-MISSING', error: 'D1 binding DB is missing' }, 500)

  const diagnostics = []
  // v1.8.2: player-state GET은 재생목록 확인용입니다. schema repair는 /api/repair 또는 /api/health?deep=1에서만 실행합니다.

  let store = null
  if (appId) store = await findStoreForAppConfig(env, appId)
  if (!store && storeSlug) store = await readStoreBySlugOrId(env, storeSlug)
  const resolvedStore = store?.slug || cleanSlug(storeSlug)
  if (!resolvedStore) return json({ ok: false, errorCode: 'LV-STORE-NOT-FOUND', error: 'store not found' }, 404)

  let snapshot = null
  let source = 'r2-playlist-snapshot'
  if (!forceRebuild) {
    try { snapshot = await readPlaylistSnapshotFromR2(request, env, resolvedStore) } catch (error) { diagnostics.push(`readSnapshot: ${safeErrorMessage(error)}`) }
  }
  if (!snapshot) {
    try {
      const written = await writePlaylistSnapshots(request, env, resolvedStore)
      snapshot = written.snapshot
      source = 'd1-built-and-snapshotted'
    } catch (error) {
      diagnostics.push(`writeSnapshot: ${safeErrorMessage(error)}`)
      snapshot = await makePlaylistSnapshot(request, env, resolvedStore)
      source = 'd1-live-fallback'
    }
  }

  // v1.8.3 핵심 보완:
  // TV가 꺼졌다 켜지거나 8분 주기로 /api/player-state를 확인할 때
  // R2에 저장된 예전 bundle snapshot만 믿지 않고, D1의 최신 left + 최신 _common/right를 다시 합쳐서 내려줍니다.
  // 특히 오른쪽 공통 콘텐츠는 모든 매장이 공유하므로, 매장별 bundle이 낡아도 항상 최신 _common/right가 반영됩니다.
  try {
    const liveSnapshot = await makePlaylistSnapshot(request, env, resolvedStore)
    if (liveSnapshot?.playlists) {
      snapshot = {
        ...snapshot,
        ...liveSnapshot,
        sourceSnapshot: source,
        mode: 'playlist-snapshot-live-merged',
      }
      source = `${source}+d1-live-content-sync`
    }
  } catch (error) {
    diagnostics.push(`liveContentSync: ${safeErrorMessage(error)}`)
  }

  const deviceRows = await env.DB.prepare(`
    SELECT id, store, name, role, online, last_seen AS lastSeen, app, device_code AS deviceCode,
           last_command AS lastCommand, command_at AS commandAt, updated_at AS updatedAt
    FROM devices
    WHERE store = ?
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 5
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

  let notice = null
  try {
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
    notice = mapNotice(noticeRow)
  } catch (error) { diagnostics.push(`notice: ${safeErrorMessage(error)}`) }

  const appConfig = appConfigResponse(request, env, store || { slug: resolvedStore, name: resolvedStore, status: '운영중' })
  const blackMode = await readBlackModeState(env, resolvedStore)
  const version = versionOf(snapshot, notice, devices, appConfig, blackMode)
  const now = nowUtcIso()

  return json({
    ok: true,
    version: LV_CORE_VERSION,
    source,
    endpoint: '/api/player-state',
    mode: 'snapshot-first',
    store: store || { slug: resolvedStore, name: resolvedStore, status: '운영중' },
    appConfig,
    playlistVersion: snapshot.playlistVersion || version,
    stateVersion: version,
    playlistUrl: playlistSnapshotUrl(request, env, resolvedStore, 'bundle'),
    playlistUrls: {
      bundle: playlistSnapshotUrl(request, env, resolvedStore, 'bundle'),
      left: playlistSnapshotUrl(request, env, resolvedStore, 'left'),
      right: playlistSnapshotUrl(request, env, '_common', 'right'),
    },
    playlists: snapshot.playlists || { left: [], right: [] },
    counts: snapshot.counts || {},
    blackMode,
    displayMode: blackMode.enabled ? 'black' : 'normal',
    contentReflect: {
      expectedMs: DEFAULT_PLAYER_STATE_POLL_MS,
      expectedText: `최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`,
      leftCount: Number(snapshot?.counts?.left || 0),
      rightCount: Number(snapshot?.counts?.right || 0),
      rightSource: '_common/right',
      note: 'Player는 다음 statePoll 확인 때 최신 재생목록을 적용합니다.',
    },
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
    notice,
    activeNotice: notice,
    command,
    devices,
    diagnostics,
    updatedAt: now,
    updatedAtKst: nowKstString(),
  })
}
