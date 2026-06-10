import {
  json,
  LV_CORE_VERSION,
  readStoreBySlugOrId,
  makePlaylistSnapshot,
  playlistSnapshotUrl,
  mapDevice,
  dedupeDeviceRows,
  nowUtcIso,
  nowKstString,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_COMMAND_POLL_MS,
  DEFAULT_NOTICE_POLL_MS,
  DEFAULT_CONTENT_CHECK_MS,
  DEFAULT_APP_CONFIG_POLL_MS,
  DEFAULT_PLAYER_STATE_POLL_MS,
  DEFAULT_BLACK_MODE_POLL_MS,
  DEFAULT_D1_HEARTBEAT_WRITE_SEC,
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

async function readDevices(env, store) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, store, name, role, online, last_seen AS lastSeen, app, device_code AS deviceCode,
             last_command AS lastCommand, command_at AS commandAt, updated_at AS updatedAt
      FROM devices
      WHERE store = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 5
    `).bind(store).all()
    return dedupeDeviceRows(results || [], env).map((row) => mapDevice(row, env))
  } catch { return [] }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const storeParam = url.searchParams.get('store') || url.searchParams.get('id') || url.searchParams.get('appId') || ''
  // rebuild 파라미터는 기존 URL 호환용으로 허용하지만, v2.0.4 GET에서는 snapshot write를 하지 않습니다.
  if (!storeParam) return json({ ok: false, errorCode: 'LV-STORE-MISSING', error: 'store or id is required' }, 400)
  if (!env.DB) return json({ ok: false, errorCode: 'LV-DB-MISSING', error: 'D1 binding DB is missing' }, 500)

  let diagnostics = []
  // v2.0.4: player-config GET에서는 schema repair/PRAGMA를 실행하지 않습니다.

  const store = await readStoreBySlugOrId(env, storeParam)
  const resolvedStore = store?.slug || String(storeParam || '').trim().toLowerCase()
  if (!resolvedStore) return json({ ok: false, errorCode: 'LV-STORE-NOT-FOUND', error: 'store not found' }, 404)

  let snapshot = null
  let source = 'd1-live-content-sync'

  try {
    snapshot = await makePlaylistSnapshot(request, env, resolvedStore)
    if (snapshot?.playlists) snapshot = { ...snapshot, mode: 'playlist-snapshot-live-readonly' }
  } catch (error) {
    diagnostics.push(`liveContentSync: ${String(error?.message || error).slice(0, 500)}`)
    return json({ ok: false, errorCode: 'LV-PLAYLIST-BUILD-FAILED', error: String(error?.message || error).slice(0, 500), diagnostics }, 200)
  }

  const devices = await readDevices(env, resolvedStore)
  return json({
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/player-config',
    mode: 'd1-live-readonly',
    source,
    store: store || { slug: resolvedStore, name: resolvedStore, status: '운영중' },
    playlistVersion: snapshot.playlistVersion || snapshot.version || '',
    playlistUrl: playlistSnapshotUrl(request, env, resolvedStore, 'bundle'),
    playlistUrls: {
      bundle: playlistSnapshotUrl(request, env, resolvedStore, 'bundle'),
      left: playlistSnapshotUrl(request, env, resolvedStore, 'left'),
      right: playlistSnapshotUrl(request, env, resolvedStore, 'right'),
    },
    playlists: snapshot.playlists || { left: [], right: [] },
    counts: snapshot.counts || {
      left: Array.isArray(snapshot.playlists?.left) ? snapshot.playlists.left.length : 0,
      right: Array.isArray(snapshot.playlists?.right) ? snapshot.playlists.right.length : 0,
    },
    devices,
    defaults: {
      heartbeat: DEFAULT_HEARTBEAT_MS,
      playerStatePollMs: DEFAULT_PLAYER_STATE_POLL_MS,
      commandPoll: DEFAULT_COMMAND_POLL_MS,
      noticePollMs: DEFAULT_NOTICE_POLL_MS,
      blackModePollMs: DEFAULT_BLACK_MODE_POLL_MS,
      contentCheck: DEFAULT_CONTENT_CHECK_MS,
      appConfigPollMs: DEFAULT_APP_CONFIG_POLL_MS,
      onlineTtlSec: Number(env.ONLINE_TTL_SEC || 1800),
      d1HeartbeatWriteSec: Number(env.D1_HEARTBEAT_WRITE_SEC || DEFAULT_D1_HEARTBEAT_WRITE_SEC),
    },
    diagnostics,
    updatedAt: nowUtcIso(),
    updatedAtKst: nowKstString(),
  })
}
