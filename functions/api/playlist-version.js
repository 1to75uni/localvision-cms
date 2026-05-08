import { json, LV_CORE_VERSION, cleanSlug, normalizeLvId, findStoreForAppConfig, readPlaylistSnapshotFromR2, playlistSnapshotUrl, nowUtcIso, nowKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  let store = cleanSlug(url.searchParams.get('store') || '')
  const appId = normalizeLvId(url.searchParams.get('id') || url.searchParams.get('appId') || '')
  if (!store && appId && env.DB) {
    const row = await findStoreForAppConfig(env, appId)
    store = cleanSlug(row?.slug || '')
  }
  if (!store) return json({ ok: false, error: 'store or id is required' }, 400)
  let snapshot = null
  try { snapshot = await readPlaylistSnapshotFromR2(request, env, store) } catch {}
  return json({
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/playlist-version',
    store,
    playlistVersion: snapshot?.playlistVersion || '',
    counts: snapshot?.counts || {},
    playlistUrl: playlistSnapshotUrl(request, env, store, 'bundle'),
    playlistUrls: {
      bundle: playlistSnapshotUrl(request, env, store, 'bundle'),
      left: playlistSnapshotUrl(request, env, store, 'left'),
      right: playlistSnapshotUrl(request, env, store, 'right'),
    },
    serverNowUtc: nowUtcIso(),
    serverNowKst: nowKstString(),
  })
}
