import { json, ensureCoreSchema, scanR2Media, upsertR2ScanIntoD1, dedupeContentsRows, cleanupDuplicateContents, cleanupDuplicateDevices } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestGet({ request, env }) {
  if (!env.MEDIA) return json({ ok: false, error: 'R2 binding MEDIA is missing. Pages Functions binding name must be MEDIA.' }, 500)

  const url = new URL(request.url)
  // v2.0.4: GET 기본값은 R2 목록 조회만 수행합니다.
  // D1 보정/동기화는 수동 관리 시 /api/r2-sync?sync=1 로 명시했을 때만 실행합니다.
  const syncParam = String(url.searchParams.get('sync') || '').toLowerCase()
  const sync = syncParam === '1' || syncParam === 'true' || syncParam === 'yes'

  if (sync && env.DB) {
    await ensureCoreSchema(env)
    const result = await upsertR2ScanIntoD1(request, env)
    const contentCleanup = await cleanupDuplicateContents(env)
    const deviceCleanup = await cleanupDuplicateDevices(env)
    return json({ ok: true, endpoint: '/api/r2-sync', mode: 'manual-d1-sync', syncedToD1: true, ...result, contentCleanup, deviceCleanup, contents: dedupeContentsRows(result.contents || []) })
  }

  const scan = await scanR2Media(request, env)
  return json({ ok: true, endpoint: '/api/r2-sync', mode: 'r2-readonly-scan', syncedToD1: false, note: 'Use /api/r2-sync?sync=1 for manual D1 sync.', ...scan, contents: dedupeContentsRows(scan.contents || []) })
}
