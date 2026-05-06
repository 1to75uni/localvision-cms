import { json, ensureCoreSchema, scanR2Media, upsertR2ScanIntoD1, dedupeContentsRows, cleanupDuplicateContents, cleanupDuplicateDevices } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestGet({ request, env }) {
  if (!env.MEDIA) return json({ ok: false, error: 'R2 binding MEDIA is missing. Pages Functions binding name must be MEDIA.' }, 500)
  if (env.DB) await ensureCoreSchema(env)

  const url = new URL(request.url)
  const sync = url.searchParams.get('sync') !== '0'

  if (sync && env.DB) {
    const result = await upsertR2ScanIntoD1(request, env)
    const contentCleanup = await cleanupDuplicateContents(env)
    const deviceCleanup = await cleanupDuplicateDevices(env)
    return json({ ok: true, endpoint: '/api/r2-sync', syncedToD1: true, ...result, contentCleanup, deviceCleanup, contents: dedupeContentsRows(result.contents || []) })
  }

  const scan = await scanR2Media(request, env)
  return json({ ok: true, endpoint: '/api/r2-sync', syncedToD1: false, ...scan, contents: dedupeContentsRows(scan.contents || []) })
}
