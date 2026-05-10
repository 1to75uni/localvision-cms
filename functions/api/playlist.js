import {
  json,
  LV_CORE_VERSION,
  ensureCoreSchema,
  readContentsForPlaylist,
  readPlaylistSnapshotFromR2,
  writePlaylistSnapshots,
  playlistSnapshotUrl,
  nowUtcIso,
  nowKstString,
  safeErrorMessage,
  DEFAULT_CONTENT_DURATION,
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

function sanitizeItems(items = []) {
  return (items || [])
    .filter((item) => item && String(item.url || '').trim())
    .map((item, index) => ({
      ...item,
      type: item.type || (String(item.url || item.fileName || '').match(/\.(mp4|webm|mov|m4v)(\?|$)/i) ? 'video' : 'image'),
      duration: Number(item.duration || DEFAULT_CONTENT_DURATION) > 0 ? Number(item.duration || DEFAULT_CONTENT_DURATION) : DEFAULT_CONTENT_DURATION,
      sortOrder: Number(item.sortOrder ?? item.sort_order ?? index),
    }))
}

async function safeReadItems(env, store, side, diagnostics = []) {
  try { return sanitizeItems(await readContentsForPlaylist(env, store, side)) }
  catch (error) { diagnostics.push(`readContents ${store}/${side}: ${safeErrorMessage(error)}`); return [] }
}

function responsePayload(request, env, { store, side, source, left, right, diagnostics, snapshot = null }) {
  const playlists = side === 'right' ? { right } : { left, right }
  const items = side === 'bundle' ? undefined : (side === 'right' ? right : left)
  return {
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/playlist',
    source,
    store,
    side,
    count: items ? items.length : undefined,
    items,
    playlists,
    counts: { left: left.length, right: right.length },
    playlistVersion: snapshot?.playlistVersion || `live_${left.length}_${right.length}_${Date.now()}`,
    playlistUrl: side === 'right' ? playlistSnapshotUrl(request, env, '_common', 'right') : playlistSnapshotUrl(request, env, store, side),
    diagnostics,
    updatedAt: snapshot?.updatedAt || nowUtcIso(),
    updatedAtKst: snapshot?.updatedAtKst || nowKstString(),
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const store = url.searchParams.get('store') || ''
  const side = url.searchParams.get('side') || 'left'
  const forceRebuild = ['1', 'true', 'yes'].includes(String(url.searchParams.get('rebuild') || '').toLowerCase())
  const diagnostics = []

  if (!['left', 'right', 'bundle'].includes(side)) return json({ ok: false, error: 'side must be left, right, or bundle', endpoint: '/api/playlist' }, 400)
  if (side !== 'right' && !store) return json({ ok: false, error: 'store is required', endpoint: '/api/playlist' }, 400)
  if (!env.DB) return json({ ok: true, degraded: true, endpoint: '/api/playlist', source: 'safe-empty-no-db', store, side, items: side === 'bundle' ? undefined : [], playlists: side === 'right' ? { right: [] } : { left: [], right: [] }, counts: { left: 0, right: 0 }, diagnostics: ['D1 binding DB is missing'] })

  try { await ensureCoreSchema(env) } catch (error) { diagnostics.push(`ensureCoreSchema: ${safeErrorMessage(error)}`) }

  if (!forceRebuild && side !== 'right') {
    try {
      const snapshot = await readPlaylistSnapshotFromR2(request, env, store)
      if (snapshot?.playlists) {
        const left = sanitizeItems(snapshot.playlists.left || [])
        const right = sanitizeItems(snapshot.playlists.right || [])
        return json(responsePayload(request, env, { store, side, source: 'r2-playlist-snapshot', left, right, diagnostics, snapshot }))
      }
    } catch (error) { diagnostics.push(`readSnapshot: ${safeErrorMessage(error)}`) }
  }

  const left = side === 'right' ? [] : await safeReadItems(env, store, 'left', diagnostics)
  const right = await safeReadItems(env, '_common', 'right', diagnostics)

  // R2 snapshot 쓰기는 운영 편의 기능입니다. 실패해도 Player/CMS API는 live payload를 반환합니다.
  if (side !== 'right') {
    try {
      const result = await writePlaylistSnapshots(request, env, store)
      if (!result?.ok) diagnostics.push(`writeSnapshot: ${safeErrorMessage(result?.reason || 'not ok')}`)
    } catch (error) { diagnostics.push(`writeSnapshot: ${safeErrorMessage(error)}`) }
  }

  try {
    return json(responsePayload(request, env, { store, side, source: diagnostics.length ? 'd1-live-fallback-with-diagnostics' : 'd1-live-fallback', left, right, diagnostics }))
  } catch (error) {
    return json({ ok: true, degraded: true, endpoint: '/api/playlist', source: 'safe-empty-final-fallback', store, side, items: side === 'bundle' ? undefined : [], playlists: side === 'right' ? { right: [] } : { left: [], right: [] }, counts: { left: 0, right: 0 }, diagnostics: [...diagnostics, safeErrorMessage(error)], updatedAt: nowUtcIso(), updatedAtKst: nowKstString() })
  }
}
