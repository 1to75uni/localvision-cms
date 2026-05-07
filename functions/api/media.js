function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,HEAD,OPTIONS',
    'access-control-allow-headers': 'range,content-type',
    'access-control-expose-headers': 'content-length,content-range,accept-ranges,etag,content-type',
  }
}

function error(message, status = 400) {
  return new Response(message, { status, headers: corsHeaders() })
}

function contentTypeFromKey(key = '', fallback = '') {
  const lower = String(key || '').toLowerCase().split('?')[0]
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return fallback || 'application/octet-stream'
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

async function handleMedia({ request, env, headOnly = false }) {
  if (!env.MEDIA) return error('R2 binding MEDIA is missing', 500)

  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  if (!key) return error('key is required', 400)

  const range = request.headers.get('range')
  const object = await env.MEDIA.get(key, range ? { range: request.headers } : undefined)

  if (!object) return error('Not found', 404)

  const headers = new Headers(corsHeaders())
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'public, max-age=31536000')
  headers.set('content-type', contentTypeFromKey(key, headers.get('content-type') || ''))

  if (range && object.range) {
    const { offset, length } = object.range
    const total = object.size
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${total}`)
    headers.set('content-length', String(length))
    return new Response(headOnly ? null : object.body, { status: 206, headers })
  }

  headers.set('content-length', String(object.size))
  return new Response(headOnly ? null : object.body, { status: 200, headers })
}

export async function onRequestGet(context) {
  return handleMedia({ ...context, headOnly: false })
}

export async function onRequestHead(context) {
  return handleMedia({ ...context, headOnly: true })
}
