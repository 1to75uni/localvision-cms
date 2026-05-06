import { json, ensureCoreSchema, listR2Objects } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestGet({ env }) {
  const result = {
    ok: true,
    service: 'LocalVision CMS API',
    version: 'v1.6.1-r2-autosync',
    now: new Date().toISOString(),
    bindings: {
      DB: Boolean(env.DB),
      MEDIA: Boolean(env.MEDIA),
      R2_PUBLIC_BASE: Boolean(env.R2_PUBLIC_BASE),
      ONLINE_TTL_SEC: Number(env.ONLINE_TTL_SEC || 600),
    },
    db: 'not-bound',
    r2: 'not-bound',
  }

  if (env.DB) {
    try {
      await ensureCoreSchema(env)
      const row = await env.DB.prepare('SELECT 1 AS ok').first()
      result.db = row?.ok === 1 ? 'connected' : 'unknown'
    } catch (error) {
      result.ok = false
      result.db = `error: ${String(error?.message || error)}`
    }
  }

  if (env.MEDIA) {
    try {
      const objects = await listR2Objects(env, 'stores/', 20)
      result.r2 = 'connected'
      result.r2SampleCount = objects.length
      result.r2SampleKeys = objects.slice(0, 10).map((item) => item.key)
    } catch (error) {
      result.ok = false
      result.r2 = `error: ${String(error?.message || error)}`
    }
  }

  return json(result, result.ok ? 200 : 500)
}
