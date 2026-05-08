import { json, LV_CORE_VERSION, ensureCoreSchema, listR2Objects, DEFAULT_HEARTBEAT_MS, DEFAULT_COMMAND_POLL_MS, DEFAULT_NOTICE_POLL_MS, nowUtcIso, nowKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const deep = ['1', 'true', 'yes'].includes(String(url.searchParams.get('deep') || '').toLowerCase())
  const checks = []
  let dbOk = Boolean(env.DB)
  let mediaOk = Boolean(env.MEDIA)
  let r2SampleCount = 0

  if (env.DB) {
    try {
      // v1.8.1: 기본 health는 가벼운 SELECT 1만 실행합니다.
      // 스키마 보정/마이그레이션은 /api/health?deep=1 또는 /api/repair에서만 실행합니다.
      if (deep) await ensureCoreSchema(env)
      const probe = await env.DB.prepare('SELECT 1 AS ok').first()
      dbOk = Boolean(probe?.ok)
    } catch (error) {
      dbOk = false
      checks.push(`DB: ${String(error?.message || error)}`)
    }
  } else {
    checks.push('DB binding missing')
  }

  if (env.MEDIA) {
    try {
      if (deep) {
        const objects = await listR2Objects(env, 'stores/', 20)
        r2SampleCount = objects.length
      }
      mediaOk = true
    } catch (error) {
      mediaOk = false
      checks.push(`MEDIA: ${String(error?.message || error)}`)
    }
  } else {
    checks.push('MEDIA binding missing')
  }

  return json({
    ok: dbOk,
    version: LV_CORE_VERSION,
    mode: deep ? 'deep' : 'lite',
    DB: dbOk,
    MEDIA: mediaOk,
    R2_PUBLIC_BASE: Boolean(env.R2_PUBLIC_BASE),
    ONLINE_TTL_SEC: Number(env.ONLINE_TTL_SEC || 600),
    heartbeatMs: DEFAULT_HEARTBEAT_MS,
    commandPollMs: DEFAULT_COMMAND_POLL_MS,
    noticePollMs: DEFAULT_NOTICE_POLL_MS,
    serverNowUtc: nowUtcIso(),
    serverNowKst: nowKstString(),
    heartbeatWritePolicy: 'heartbeat-d1-write-every-10-min-or-status-change',
    r2SampleCount,
    checks,
  }, dbOk ? 200 : 500)
}
