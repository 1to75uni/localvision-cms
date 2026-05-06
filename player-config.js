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

function cleanSlug(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replaceAll(' ', '-')
    .replace(/[^a-z0-9-_]/g, '')
}

function safeFileName(fileName = '') {
  const name = String(fileName).split('/').pop().split('\\').pop()
  const dotIndex = name.lastIndexOf('.')
  const base = dotIndex > -1 ? name.slice(0, dotIndex) : name
  const ext = dotIndex > -1 ? name.slice(dotIndex + 1).toLowerCase() : ''
  const safeBase = base
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-_]/g, '')
    .slice(0, 60) || 'media'

  return ext ? `${safeBase}.${ext}` : safeBase
}

function detectType(file) {
  if (file.type?.startsWith('video/')) return 'video'
  if (file.type?.startsWith('image/')) return 'image'

  const name = file.name.toLowerCase()
  if (name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov')) return 'video'
  return 'image'
}

function makePublicUrl(request, env, key) {
  const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/$/, '')
  if (publicBase) return `${publicBase}/${key}`

  const url = new URL(request.url)
  return `${url.origin}/api/media?key=${encodeURIComponent(key)}`
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  if (!env.MEDIA) return json({ ok: false, error: 'R2 binding MEDIA is missing' }, 500)

  const form = await request.formData()
  const file = form.get('file')
  const title = String(form.get('title') || '').trim()
  const side = String(form.get('side') || 'left')
  const rawStore = String(form.get('store') || '').trim()
  const duration = Number(form.get('duration') || 10)

  if (!file || typeof file === 'string') {
    return json({ ok: false, error: 'file is required' }, 400)
  }

  if (!title) {
    return json({ ok: false, error: 'title is required' }, 400)
  }

  if (!['left', 'right'].includes(side)) {
    return json({ ok: false, error: 'side must be left or right' }, 400)
  }

  const store = side === 'right' ? '_common' : cleanSlug(rawStore)
  if (side === 'left' && !store) {
    return json({ ok: false, error: 'store is required for left content' }, 400)
  }

  const type = detectType(file)
  const folder = side === 'right' ? 'stores/_common/right' : `stores/${store}/left`
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const fileName = `${stamp}-${safeFileName(file.name)}`
  const key = `${folder}/${fileName}`

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000',
    },
    customMetadata: {
      title,
      store,
      side,
      type,
      originalName: file.name,
    },
  })

  const content = {
    id: `ct_${Date.now()}`,
    store,
    side,
    type,
    title,
    duration: duration || 10,
    status: '사용중',
    fileName,
    url: makePublicUrl(request, env, key),
    sortOrder: Date.now(),
    updatedAt: new Date().toISOString().slice(0, 10),
    r2Key: key,
  }

  await env.DB.prepare(`
    INSERT INTO contents
    (id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    content.id,
    content.store,
    content.side,
    content.type,
    content.title,
    content.duration,
    content.status,
    content.fileName,
    content.url,
    content.sortOrder,
    content.updatedAt
  ).run()

  return json({
    ok: true,
    key,
    content,
  })
}
