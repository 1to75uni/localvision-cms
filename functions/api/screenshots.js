import { ensureCoreSchema, json as coreJson, safeErrorMessage, tryRun } from '../_lib/localvision-core.js'

function json(data, status = 200) { return coreJson(data, status) }
export async function onRequestOptions() { return json({ ok: true }) }

async function safeEnsureTable(env, diagnostics = []) {
  try { await ensureCoreSchema(env) } catch (error) { diagnostics.push(`ensureCoreSchema: ${safeErrorMessage(error)}`) }
  await tryRun(env, `
    CREATE TABLE IF NOT EXISTS device_screenshots (
      id TEXT PRIMARY KEY,
      device_id TEXT DEFAULT '',
      store TEXT DEFAULT '',
      url TEXT DEFAULT '',
      r2_key TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
  const idx1 = await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_device_screenshots_device_created ON device_screenshots(device_id, created_at)`)
  const idx2 = await tryRun(env, `CREATE INDEX IF NOT EXISTS idx_device_screenshots_store_created ON device_screenshots(store, created_at)`)
  if (idx1?.ok === false) diagnostics.push(`index device: ${idx1.error}`)
  if (idx2?.ok === false) diagnostics.push(`index store: ${idx2.error}`)
}

function makePublicUrl(request, env, key) {
  const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/$/, '')
  if (publicBase) return `${publicBase}/${key}`
  const url = new URL(request.url)
  return `${url.origin}/api/media?key=${encodeURIComponent(key)}`
}

async function latestR2Screenshot(request, env, store, diagnostics = []) {
  if (!env.MEDIA || !store) return null
  try {
    const objects = []
    let cursor = undefined
    do {
      const page = await env.MEDIA.list({ prefix: `system/screenshots/${store}/`, cursor, limit: 1000 })
      objects.push(...(page.objects || []))
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
    const latest = objects.filter((obj) => String(obj.key || '').toLowerCase().endsWith('.png')).sort((a, b) => {
      const au = a.uploaded ? new Date(a.uploaded).getTime() : 0
      const bu = b.uploaded ? new Date(b.uploaded).getTime() : 0
      if (au !== bu) return bu - au
      return String(b.key || '').localeCompare(String(a.key || ''))
    })[0]
    if (!latest) return null
    const parts = latest.key.split('/')
    const deviceId = parts[3] || `tv_${store}`
    return { id: `r2_${latest.key.replace(/[^a-zA-Z0-9_-]/g, '_')}`, deviceId, store, url: makePublicUrl(request, env, latest.key), r2Key: latest.key, createdAt: latest.uploaded ? new Date(latest.uploaded).toISOString() : new Date().toISOString(), source: 'r2-fallback' }
  } catch (error) {
    diagnostics.push(`r2Screenshot: ${safeErrorMessage(error)}`)
    return null
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const store = String(url.searchParams.get('store') || '').trim()
  const deviceId = String(url.searchParams.get('deviceId') || '').trim()
  if (!store && !deviceId) return json({ ok: false, error: 'store or deviceId is required', endpoint: '/api/screenshots' }, 400)

  const diagnostics = []
  if (!env.DB) return json({ ok: true, degraded: true, mode: 'no-db', screenshot: null, diagnostics: ['D1 binding DB is missing'] })
  try {
    await safeEnsureTable(env, diagnostics)
    let row = null
    if (store) {
      try {
        row = await env.DB.prepare(`
          SELECT id, device_id AS deviceId, store, url, r2_key AS r2Key, created_at AS createdAt
          FROM device_screenshots
          WHERE store = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).bind(store).first()
      } catch (error) { diagnostics.push(`dbStore: ${safeErrorMessage(error)}`) }
    }
    if (!row && deviceId) {
      try {
        row = await env.DB.prepare(`
          SELECT id, device_id AS deviceId, store, url, r2_key AS r2Key, created_at AS createdAt
          FROM device_screenshots
          WHERE device_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).bind(deviceId).first()
      } catch (error) { diagnostics.push(`dbDevice: ${safeErrorMessage(error)}`) }
    }
    if (!row && store) {
      row = await latestR2Screenshot(request, env, store, diagnostics)
      if (row) {
        const res = await tryRun(env, `
          INSERT OR IGNORE INTO device_screenshots
          (id, device_id, store, url, r2_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [row.id, row.deviceId, row.store, row.url, row.r2Key, row.createdAt])
        if (res?.ok === false) diagnostics.push(`dbCacheR2: ${res.error}`)
      }
    }
    return json({ ok: true, mode: store ? 'store-based' : 'deviceId-fallback', screenshot: row || null, diagnostics })
  } catch (error) {
    return json({ ok: true, degraded: true, mode: 'safe-empty', screenshot: null, diagnostics: [...diagnostics, safeErrorMessage(error)] })
  }
}

export async function onRequestPost({ request, env }) {
  const diagnostics = []
  try {
    if (!env.DB) return json({ ok: true, degraded: true, saved: false, error: 'D1 binding DB is missing' })
    if (!env.MEDIA) return json({ ok: true, degraded: true, saved: false, error: 'R2 binding MEDIA is missing' })
    const form = await request.formData()
    const file = form.get('file')
    const store = String(form.get('store') || '').trim()
    const deviceId = String(form.get('deviceId') || '').trim()
    if (!store && !deviceId) return json({ ok: false, error: 'store or deviceId is required' }, 400)
    if (!file || typeof file === 'string') return json({ ok: false, error: 'file is required' }, 400)
    await safeEnsureTable(env, diagnostics)
    const safeStore = store || 'unknown'
    const safeDeviceId = deviceId || `tv_${safeStore}`
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const key = `system/screenshots/${safeStore}/${safeDeviceId}/${stamp}.png`
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' }, customMetadata: { deviceId: safeDeviceId, store: safeStore, type: 'screenshot' } })
    const screenshot = { id: `ss_${Date.now()}`, deviceId: safeDeviceId, store: safeStore, r2Key: key, url: makePublicUrl(request, env, key), createdAt: new Date().toISOString() }
    const insert = await tryRun(env, `
      INSERT INTO device_screenshots (id, device_id, store, url, r2_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [screenshot.id, screenshot.deviceId, screenshot.store, screenshot.url, screenshot.r2Key, screenshot.createdAt])
    if (insert?.ok === false) diagnostics.push(`insert: ${insert.error}`)
    const update = await tryRun(env, `UPDATE devices SET last_command = ?, command_at = ?, updated_at = CURRENT_TIMESTAMP WHERE store = ? OR id = ?`, ['screenshot_done', screenshot.createdAt, safeStore, safeDeviceId])
    if (update?.ok === false) diagnostics.push(`deviceUpdate: ${update.error}`)
    return json({ ok: true, screenshot, diagnostics })
  } catch (error) {
    return json({ ok: true, degraded: true, saved: false, diagnostics: [...diagnostics, safeErrorMessage(error)] })
  }
}
