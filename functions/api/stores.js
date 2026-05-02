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

async function readBody(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

function cleanSlug(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replaceAll(' ', '-')
    .replace(/[^a-z0-9-_]/g, '')
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const { results } = await env.DB.prepare(`
    SELECT
      id, name, slug, category, address, contact, status, plan,
      created_at AS createdAt
    FROM stores
    ORDER BY created_at DESC
  `).all()

  return json({ ok: true, stores: results || [] })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const body = await readBody(request)
  const slug = cleanSlug(body.slug)
  if (!body.name || !slug) return json({ ok: false, error: 'name and slug are required' }, 400)

  const store = {
    id: body.id || `st_${Date.now()}`,
    name: body.name,
    slug,
    category: body.category || '미분류',
    address: body.address || '주소 미입력',
    contact: body.contact || '연락처 미입력',
    status: body.status || '준비중',
    plan: body.plan || 'Local Basic',
    createdAt: body.createdAt || new Date().toISOString().slice(0, 10),
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO stores
    (id, name, slug, category, address, contact, status, plan, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    store.id,
    store.name,
    store.slug,
    store.category,
    store.address,
    store.contact,
    store.status,
    store.plan,
    store.createdAt
  ).run()

  return json({ ok: true, store })
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  const url = new URL(request.url)
  const slug = cleanSlug(url.searchParams.get('slug') || '')
  if (!slug) return json({ ok: false, error: 'slug is required' }, 400)

  await env.DB.prepare(`DELETE FROM contents WHERE store = ?`).bind(slug).run()
  await env.DB.prepare(`DELETE FROM devices WHERE store = ?`).bind(slug).run()
  await env.DB.prepare(`DELETE FROM stores WHERE slug = ?`).bind(slug).run()

  return json({ ok: true, deleted: slug })
}
