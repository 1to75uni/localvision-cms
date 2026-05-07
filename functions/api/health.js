import { json, LV_CORE_VERSION, ensureCoreSchema, listR2Objects, DEFAULT_HEARTBEAT_MS, DEFAULT_COMMAND_POLL_MS, DEFAULT_NOTICE_POLL_MS, nowUtcIso, nowKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestGet({ env }) {
  const checks = []
  let dbOk = Boolean(env.DB)
  let mediaOk = Boolean(env.MEDIA)
  let r2SampleCount = 0

  if (env.DB) {
    try {
      await ensureCoreSchema(env)
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
      const objects = await listR2Objects(env, 'stores/', 20)
      r2SampleCount = objects.length
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
    DB: dbOk,
    MEDIA: mediaOk,
    R2_PUBLIC_BASE: Boolean(env.R2_PUBLIC_BASE),
    ONLINE_TTL_SEC: Number(env.ONLINE_TTL_SEC || 600),
    heartbeatMs: DEFAULT_HEARTBEAT_MS,
    commandPollMs: DEFAULT_COMMAND_POLL_MS,
    noticePollMs: DEFAULT_NOTICE_POLL_MS,
    serverNowUtc: nowUtcIso(),
    serverNowKst: nowKstString(),
    heartbeatWritePolicy: 'every-heartbeat-during-mvp-stabilization',
    r2SampleCount,
    checks,
  }, dbOk ? 200 : 500)
}
