function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  })
}

export async function onRequestOptions() {
  return json({ ok: true })
}

function hasDb(env) {
  return !!env.DB
}

export async function onRequestGet({ env }) {
  if (!hasDb(env)) {
    return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  }

  const row = await env.DB.prepare('SELECT 1 AS ok').first()
  return json({
    ok: true,
    service: 'LocalVision CMS API',
    db: row?.ok === 1 ? 'connected' : 'unknown',
    version: 'v1.3',
    now: new Date().toISOString(),
  })
}
