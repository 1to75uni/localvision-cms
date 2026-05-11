import { ensureCoreSchema, DEFAULT_CONTENT_DURATION, DEFAULT_PLAYER_STATE_POLL_MS, writePlaylistSnapshots, writeCommonRightSnapshot, contentTargetFromForm } from '../_lib/localvision-core.js'
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD',
      'access-control-allow-headers': 'content-type,range,cache-control,pragma,authorization,x-lv-admin-token',
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

function getExtension(fileName = '') {
  const name = String(fileName || '').toLowerCase().split('?')[0]
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1) : ''
}

function detectType(file) {
  const ext = getExtension(file.name)
  if (ext === 'mp4') return 'video'
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image'
  return ''
}

function contentTypeFor(file) {
  const ext = getExtension(file.name)
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return file.type || 'application/octet-stream'
}

function makePublicUrl(request, env, key) {
  const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/$/, '')
  if (publicBase) return `${publicBase}/${key}`

  const url = new URL(request.url)
  return `${url.origin}/api/media?key=${encodeURIComponent(key)}`
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  if (!env.MEDIA) return json({ ok: false, error: 'R2 binding MEDIA is missing' }, 500)

  const form = await request.formData()
  const file = form.get('file')
  const title = String(form.get('title') || '').trim()
  const side = String(form.get('side') || 'left')
  const rawStore = String(form.get('store') || '').trim()
  const duration = Number(form.get('duration') || DEFAULT_CONTENT_DURATION)

  if (!file || typeof file === 'string') {
    return json({ ok: false, error: 'file is required' }, 400)
  }

  if (!file.size || Number(file.size) <= 0) {
    return json({ ok: false, error: '빈 파일은 업로드할 수 없습니다. 파일 크기를 확인해 주세요.' }, 400)
  }

  const ext = getExtension(file.name)
  const allowed = ['mp4', 'jpg', 'jpeg', 'png', 'webp']
  if (!allowed.includes(ext)) {
    return json({ ok: false, error: '허용 파일 형식은 mp4, jpg, jpeg, png, webp 입니다.' }, 400)
  }

  if (file.type?.startsWith('video/') && ext !== 'mp4') {
    return json({ ok: false, error: '영상은 MP4 파일만 업로드할 수 있습니다.' }, 400)
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
  const target = contentTargetFromForm(form, side)
  const folder = side === 'right' ? 'stores/_common/right' : `stores/${store}/left`
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const fileName = `${stamp}-${safeFileName(file.name)}`
  const key = `${folder}/${fileName}`

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: {
      contentType: contentTypeFor(file),
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
    duration: Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_CONTENT_DURATION,
    status: '사용중',
    fileName,
    url: makePublicUrl(request, env, key),
    sortOrder: Date.now(),
    updatedAt: new Date().toISOString(),
    r2Key: key,
    targetMode: target.targetMode,
    targetStores: target.targetStores,
    targetStoresJson: target.targetStoresJson,
  }

  await env.DB.prepare(`
    INSERT INTO contents
    (id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at, r2_key, target_mode, target_stores_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    content.updatedAt,
    content.r2Key,
    content.targetMode,
    content.targetStoresJson
  ).run()

  let snapshot = null
  try {
    snapshot = store === '_common' ? await writeCommonRightSnapshot(request, env) : await writePlaylistSnapshots(request, env, store)
  } catch (error) {
    snapshot = { ok: false, reason: String(error?.message || error) }
  }

  const snapDoc = snapshot?.snapshot || snapshot || {}
  return json({
    ok: true,
    key,
    content,
    snapshot,
    contentReflect: {
      side,
      store,
      playlistVersion: snapDoc.playlistVersion || '',
      counts: snapDoc.counts || {},
      tvExpectedMs: DEFAULT_PLAYER_STATE_POLL_MS,
      tvExpectedText: `최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`,
      message: `업로드 완료. TV 반영 예상: 최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`,
      rightSource: side === 'right' ? '_common/right' : undefined,
      targetMode: content.targetMode,
      targetStores: content.targetStores,
      targetCount: content.targetStores.length,
    },
  })
}
