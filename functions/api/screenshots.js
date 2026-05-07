import { ensureCoreSchema } from '../_lib/localvision-core.js'
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  })
}

export async function onRequestOptions() {
  return json({ ok: true })
}

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS device_screenshots (
      id TEXT PRIMARY KEY,
      device_id TEXT DEFAULT '',
      store TEXT DEFAULT '',
      url TEXT NOT NULL,
      r2_key TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_device_screenshots_device_created
    ON device_screenshots(device_id, created_at)
  `).run()

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_device_screenshots_store_created
    ON device_screenshots(store, created_at)
  `).run()
}

function makePublicUrl(request, env, key) {
  const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/$/, '')
  if (publicBase) return `${publicBase}/${key}`

  const url = new URL(request.url)
  return `${url.origin}/api/media?key=${encodeURIComponent(key)}`
}

async function latestR2Screenshot(request, env, store) {
  if (!env.MEDIA || !store) return null
  const objects = []
  let cursor = undefined
  do {
    const page = await env.MEDIA.list({ prefix: `system/screenshots/${store}/`, cursor, limit: 1000 })
    objects.push(...(page.objects || []))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  const latest = objects
    .filter((obj) => String(obj.key || '').toLowerCase().endsWith('.png'))
    .sort((a, b) => {
      const au = a.uploaded ? new Date(a.uploaded).getTime() : 0
      const bu = b.uploaded ? new Date(b.uploaded).getTime() : 0
      if (au !== bu) return bu - au
      return String(b.key || '').localeCompare(String(a.key || ''))
    })[0]

  if (!latest) return null
  const parts = latest.key.split('/')
  const deviceId = parts[3] || `tv_${store}`
  return {
    id: `r2_${latest.key.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    deviceId,
    store,
    url: makePublicUrl(request, env, latest.key),
    r2Key: latest.key,
    createdAt: latest.uploaded ? new Date(latest.uploaded).toISOString() : new Date().toISOString(),
    source: 'r2-fallback',
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  await ensureTable(env)

  const url = new URL(request.url)
  const store = String(url.searchParams.get('store') || '').trim()
  const deviceId = String(url.searchParams.get('deviceId') || '').trim()

  if (!store && !deviceId) {
    return json({ ok: false, error: 'store or deviceId is required' }, 400)
  }

  let row
  if (store) {
    row = await env.DB.prepare(`
      SELECT id, device_id AS deviceId, store, url, r2_key AS r2Key, created_at AS createdAt
      FROM device_screenshots
      WHERE store = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(store).first()
  }

  if (!row && deviceId) {
    row = await env.DB.prepare(`
      SELECT id, device_id AS deviceId, store, url, r2_key AS r2Key, created_at AS createdAt
      FROM device_screenshots
      WHERE device_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(deviceId).first()
  }

  if (!row && store) {
    row = await latestR2Screenshot(request, env, store)
    if (row) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO device_screenshots
        (id, device_id, store, url, r2_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(row.id, row.deviceId, row.store, row.url, row.r2Key, row.createdAt).run()
    }
  }

  return json({ ok: true, mode: store ? 'store-based' : 'deviceId-fallback', screenshot: row || null })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  if (!env.MEDIA) return json({ ok: false, error: 'R2 binding MEDIA is missing' }, 500)

  await ensureTable(env)

  const form = await request.formData()
  const file = form.get('file')
  const store = String(form.get('store') || '').trim()
  const deviceId = String(form.get('deviceId') || '').trim()

  if (!store && !deviceId) return json({ ok: false, error: 'store or deviceId is required' }, 400)
  if (!file || typeof file === 'string') return json({ ok: false, error: 'file is required' }, 400)

  const safeStore = store || 'unknown'
  const safeDeviceId = deviceId || `tv_${safeStore}`
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const key = `system/screenshots/${safeStore}/${safeDeviceId}/${stamp}.png`

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    },
    customMetadata: {
      deviceId: safeDeviceId,
      store: safeStore,
      type: 'screenshot',
    },
  })

  const screenshot = {
    id: `ss_${Date.now()}`,
    deviceId: safeDeviceId,
    store: safeStore,
    r2Key: key,
    url: makePublicUrl(request, env, key),
    createdAt: new Date().toISOString(),
  }

  await env.DB.prepare(`
    INSERT INTO device_screenshots
    (id, device_id, store, url, r2_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    screenshot.id,
    screenshot.deviceId,
    screenshot.store,
    screenshot.url,
    screenshot.r2Key,
    screenshot.createdAt
  ).run()

  await env.DB.prepare(`
    UPDATE devices
    SET last_command = ?, command_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE store = ? OR id = ?
  `).bind('screenshot_done', screenshot.createdAt, safeStore, safeDeviceId).run()

  return json({ ok: true, screenshot })
}
