import { json, ensureCoreSchema, writePlaylistSnapshots, safeErrorMessage, LV_CORE_VERSION, nowUtcIso, nowKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const store = url.searchParams.get('store') || ''
  if (!store) return json({ ok: false, error: 'store is required' }, 400)
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  try {
    await ensureCoreSchema(env)
    const result = await writePlaylistSnapshots(request, env, store)
    return json({ ok: true, version: LV_CORE_VERSION, endpoint: '/api/snapshot-rebuild', ...result, updatedAt: nowUtcIso(), updatedAtKst: nowKstString() })
  } catch (error) {
    return json({ ok: false, errorCode: 'LV-SNAPSHOT-REBUILD-FAILED', error: safeErrorMessage(error) }, 200)
  }
}
