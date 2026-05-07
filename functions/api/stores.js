import { ensureCoreSchema, json, normalizeLvId, buildPlayerUrl, findStoreForAppConfig, nextLvIdFromRows, LV_CORE_VERSION, toKstString, nowUtcIso } from '../_lib/localvision-core.js'

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

function pickFirst(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

async function nextAvailableAppId(env) {
  const { results } = await env.DB.prepare(`
    SELECT app_id
    FROM stores
    ORDER BY created_at ASC, slug ASC
  `).all()
  return nextLvIdFromRows(results || [])
}

async function isAppIdAvailable(env, appId) {
  const normalized = normalizeLvId(appId)
  if (!normalized) return false
  const existing = await env.DB.prepare(`
    SELECT id
    FROM stores
    WHERE lower(app_id) = lower(?)
    LIMIT 1
  `).bind(normalized).first()
  return !existing
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const { results } = await env.DB.prepare(`
    SELECT
      id,
      app_id AS appId,
      name,
      slug,
      category,
      address,
      contact,
      status,
      plan,
      player_url AS playerUrl,
      player_url_updated_at AS playerUrlUpdatedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM stores
    ORDER BY app_id ASC, created_at DESC
  `).all()

  const stores = (results || []).map((store) => ({
    ...store,
    createdAtKst: store.createdAt ? toKstString(store.createdAt) : '',
    updatedAtKst: store.updatedAt ? toKstString(store.updatedAt) : '',
    playerUrlUpdatedAtKst: store.playerUrlUpdatedAt ? toKstString(store.playerUrlUpdatedAt) : '',
    appId: normalizeLvId(store.appId),
    generatedPlayerUrl: buildPlayerUrl(request, env, store.slug, '', store.appId),
    effectivePlayerUrl: buildPlayerUrl(request, env, store.slug, store.playerUrl, store.appId),
  }))

  return json({ ok: true, version: LV_CORE_VERSION, stores })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const body = await readBody(request)
  const slug = cleanSlug(body.slug || body.store || '')
  if (!body.name || !slug) return json({ ok: false, error: 'name and slug are required' }, 400)

  // v1.7.2 운영 기준: 업체를 등록하면 APP ID가 자동 발급됩니다.
  // 프론트에서 appId가 오더라도 중복/누락을 막기 위해 서버가 최종 검증합니다.
  const requestedAppId = normalizeLvId(body.appId || body.app_id || '')
  const autoAppId = await nextAvailableAppId(env)
  const finalAppId = requestedAppId && await isAppIdAvailable(env, requestedAppId)
    ? requestedAppId
    : autoAppId

  const store = {
    id: body.id || `st_${Date.now()}`,
    appId: finalAppId,
    name: body.name,
    slug,
    category: body.category || '미분류',
    address: body.address || '주소 미입력',
    contact: body.contact || '연락처 미입력',
    status: body.status || '준비중',
    plan: body.plan || 'Local Basic',
    playerUrl: String(body.playerUrl || body.player_url || '').trim(),
    playerUrlUpdatedAt: body.playerUrl || body.player_url ? nowUtcIso() : '',
    createdAt: body.createdAt || nowUtcIso(),
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO stores
    (id, app_id, name, slug, category, address, contact, status, plan, player_url, player_url_updated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    store.id,
    store.appId,
    store.name,
    store.slug,
    store.category,
    store.address,
    store.contact,
    store.status,
    store.plan,
    store.playerUrl,
    store.playerUrlUpdatedAt,
    store.createdAt
  ).run()

  await ensureCoreSchema(env)
  const saved = await findStoreForAppConfig(env, store.appId || store.slug)

  return json({
    ok: true,
    store: saved,
    appConfig: saved ? {
      id: saved.appId,
      appId: saved.appId,
      store: saved.slug,
      playerUrl: buildPlayerUrl(request, env, saved.slug, saved.playerUrl, saved.appId),
    } : null,
  })
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const body = await readBody(request)
  const lookup = pickFirst(body.appId, body.app_id, body.id, body.slug, body.store)
  if (!lookup) return json({ ok: false, error: 'appId, id, slug or store is required' }, 400)

  const current = await findStoreForAppConfig(env, lookup)
  if (!current) return json({ ok: false, error: 'store not found' }, 404)

  const nextAppId = normalizeLvId(body.appId || body.app_id || current.appId)
  const nextSlug = cleanSlug(body.slug || body.store || current.slug)
  const nextPlayerUrl = body.playerUrl !== undefined || body.player_url !== undefined
    ? String(body.playerUrl ?? body.player_url ?? '').trim()
    : current.playerUrl || ''
  const playerUrlChanged = nextPlayerUrl !== String(current.playerUrl || '')

  await env.DB.prepare(`
    UPDATE stores
    SET app_id = ?,
        name = ?,
        slug = ?,
        category = ?,
        address = ?,
        contact = ?,
        status = ?,
        plan = ?,
        player_url = ?,
        player_url_updated_at = CASE WHEN ? THEN ? ELSE player_url_updated_at END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    nextAppId,
    String(body.name || current.name || '').trim(),
    nextSlug,
    String(body.category ?? current.category ?? '').trim(),
    String(body.address ?? current.address ?? '').trim(),
    String(body.contact ?? current.contact ?? '').trim(),
    String(body.status ?? current.status ?? '준비중').trim(),
    String(body.plan ?? current.plan ?? 'Local Basic').trim(),
    nextPlayerUrl,
    playerUrlChanged ? 1 : 0,
    nowUtcIso(),
    current.id
  ).run()

  const saved = await findStoreForAppConfig(env, nextAppId || nextSlug)
  return json({
    ok: true,
    store: saved,
    appConfig: saved ? {
      id: saved.appId,
      appId: saved.appId,
      store: saved.slug,
      playerUrl: buildPlayerUrl(request, env, saved.slug, saved.playerUrl, saved.appId),
      generatedPlayerUrl: buildPlayerUrl(request, env, saved.slug, '', saved.appId),
    } : null,
  })
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const url = new URL(request.url)
  const slug = cleanSlug(url.searchParams.get('slug') || url.searchParams.get('store') || '')
  if (!slug) return json({ ok: false, error: 'slug is required' }, 400)

  await env.DB.prepare(`DELETE FROM contents WHERE store = ?`).bind(slug).run()
  await env.DB.prepare(`DELETE FROM devices WHERE store = ?`).bind(slug).run()
  await env.DB.prepare(`DELETE FROM stores WHERE slug = ?`).bind(slug).run()

  return json({ ok: true, deleted: slug })
}
