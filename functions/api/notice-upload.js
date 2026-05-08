import { ensureCoreSchema } from '../_lib/localvision-core.js'
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  })
}

export async function onRequestOptions() { return json({ ok: true }) }

function cleanStore(value = '') {
  return String(value).toLowerCase().trim().replaceAll(' ', '-').replace(/[^a-z0-9-_]/g, '')
}

function safeFileName(fileName = '') {
  const name = String(fileName).split('/').pop().split('\\').pop()
  const dotIndex = name.lastIndexOf('.')
  const base = dotIndex > -1 ? name.slice(0, dotIndex) : name
  const ext = dotIndex > -1 ? name.slice(dotIndex + 1).toLowerCase() : ''
  const safeBase = base.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9가-힣-_]/g, '').slice(0, 60) || 'notice'
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
  if (!env.MEDIA) return json({ ok: false, error: 'R2 binding MEDIA is missing' }, 500)

  const form = await request.formData()
  const file = form.get('file')
  const rawStore = String(form.get('store') || '').trim()
  if (!file || typeof file === 'string') return json({ ok: false, error: 'file is required' }, 400)
  const store = cleanStore(rawStore)
  if (!store) return json({ ok: false, error: 'store is required' }, 400)

  const type = detectType(file)
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const fileName = `${stamp}-${safeFileName(file.name)}`
  const key = `stores/${store}/notices/${fileName}`

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: {
      contentType: type === 'video' ? 'video/mp4' : (file.type || 'application/octet-stream'),
      cacheControl: 'public, max-age=31536000',
    },
    customMetadata: { store, type, originalName: file.name, purpose: 'notice' },
  })

  return json({ ok: true, key, r2Key: key, type, fileName, url: makePublicUrl(request, env, key) })
}
