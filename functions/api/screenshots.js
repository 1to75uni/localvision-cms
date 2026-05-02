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
      device_id TEXT NOT NULL,
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
}

function makePublicUrl(request, env, key) {
  const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/$/, '')
  if (publicBase) return `${publicBase}/${key}`

  const url = new URL(request.url)
  return `${url.origin}/api/media?key=${encodeURIComponent(key)}`
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  await ensureTable(env)

  const url = new URL(request.url)
  const deviceId = url.searchParams.get('deviceId') || ''
  const store = url.searchParams.get('store') || ''

  if (!deviceId && !store) {
    return json({ ok: false, error: 'deviceId or store is required' }, 400)
  }

  let row
  if (deviceId) {
    row = await env.DB.prepare(`
      SELECT id, device_id AS deviceId, store, url, r2_key AS r2Key, created_at AS createdAt
      FROM device_screenshots
      WHERE device_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(deviceId).first()
  } else {
    row = await env.DB.prepare(`
      SELECT id, device_id AS deviceId, store, url, r2_key AS r2Key, created_at AS createdAt
      FROM device_screenshots
      WHERE store = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(store).first()
  }

  return json({ ok: true, screenshot: row || null })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  if (!env.MEDIA) return json({ ok: false, error: 'R2 binding MEDIA is missing' }, 500)

  await ensureTable(env)

  const form = await request.formData()
  const file = form.get('file')
  const deviceId = String(form.get('deviceId') || '').trim()
  const store = String(form.get('store') || '').trim()

  if (!deviceId) return json({ ok: false, error: 'deviceId is required' }, 400)
  if (!file || typeof file === 'string') return json({ ok: false, error: 'file is required' }, 400)

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const safeStore = store || 'unknown'
  const key = `system/screenshots/${safeStore}/${deviceId}/${stamp}.png`

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    },
    customMetadata: {
      deviceId,
      store: safeStore,
      type: 'screenshot',
    },
  })

  const screenshot = {
    id: `ss_${Date.now()}`,
    deviceId,
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
    WHERE id = ?
  `).bind('screenshot_done', screenshot.createdAt, deviceId).run()

  return json({ ok: true, screenshot })
}
