function error(message, status = 400) {
  return new Response(message, {
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,HEAD,OPTIONS',
      'access-control-allow-headers': 'range,content-type',
    },
  })
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,HEAD,OPTIONS',
      'access-control-allow-headers': 'range,content-type',
    },
  })
}

export async function onRequestGet({ request, env }) {
  if (!env.MEDIA) return error('R2 binding MEDIA is missing', 500)

  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  if (!key) return error('key is required', 400)

  const range = request.headers.get('range')
  const object = await env.MEDIA.get(key, range ? { range } : undefined)

  if (!object) return error('Not found', 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('access-control-allow-origin', '*')
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'public, max-age=31536000')

  if (range && object.range) {
    const { offset, length } = object.range
    const total = object.size
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${total}`)
    headers.set('content-length', String(length))
    return new Response(object.body, { status: 206, headers })
  }

  headers.set('content-length', String(object.size))
  return new Response(object.body, { headers })
}
