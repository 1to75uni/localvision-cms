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
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const store = url.searchParams.get('store') || ''
  const side = url.searchParams.get('side') || 'left'
  const forceRebuild = ['1', 'true', 'yes'].includes(String(url.searchParams.get('rebuild') || '').toLowerCase())
  if (!['left', 'right', 'bundle'].includes(side)) return json({ ok: false, error: 'side must be left, right, or bundle' }, 400)
  if (side !== 'right' && !store) return json({ ok: false, error: 'store is required' }, 400)
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const diagnostics = []
  try { await ensureCoreSchema(env) } catch (error) { diagnostics.push(`ensureCoreSchema: ${safeErrorMessage(error)}`) }

  if (!forceRebuild && side !== 'right') {
    try {
      const snapshot = await readPlaylistSnapshotFromR2(request, env, store)
      if (snapshot?.playlists) {
        const items = side === 'bundle' ? undefined : (snapshot.playlists[side] || [])
        return json({
          ok: true,
          version: LV_CORE_VERSION,
          source: 'r2-playlist-snapshot',
          store,
          side,
          count: items ? items.length : undefined,
          items,
          playlists: snapshot.playlists,
          playlistVersion: snapshot.playlistVersion,
          playlistUrl: playlistSnapshotUrl(request, env, store, side),
          updatedAt: snapshot.updatedAt || nowUtcIso(),
          updatedAtKst: snapshot.updatedAtKst || nowKstString(),
        })
      }
    } catch (error) { diagnostics.push(`readSnapshot: ${safeErrorMessage(error)}`) }
  }

  try {
    if (side !== 'right') await writePlaylistSnapshots(request, env, store)
    const items = side === 'right'
      ? await readContentsForPlaylist(env, '_common', 'right')
      : await readContentsForPlaylist(env, store, side === 'bundle' ? 'left' : side)
    return json({
      ok: true,
      version: LV_CORE_VERSION,
      source: 'd1-live-fallback',
      store,
      side,
      count: items.length,
      items,
      diagnostics,
      updatedAt: nowUtcIso(),
      updatedAtKst: nowKstString(),
    })
  } catch (error) {
    return json({ ok: false, errorCode: 'LV-PLAYLIST-FAILED', error: safeErrorMessage(error), diagnostics }, 200)
  }
}
