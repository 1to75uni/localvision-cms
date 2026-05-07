import {
  json,
  ensureCoreSchema,
  normalizeLvId,
  findStoreForAppConfig,
  buildPlayerUrl,
  playerBaseUrl,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_COMMAND_POLL_MS,
  DEFAULT_NOTICE_POLL_MS,
  DEFAULT_CONTENT_CHECK_MS,
  DEFAULT_D1_HEARTBEAT_WRITE_SEC,
  LV_CORE_VERSION,
} from '../_lib/localvision-core.js'

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

function configResponse(request, env, store) {
  const appId = normalizeLvId(store.appId || store.app_id || '')
  const overrideUrl = String(store.playerUrl || store.player_url || '').trim()
  const generatedPlayerUrl = buildPlayerUrl(request, env, store.slug, '', appId)
  const playerUrl = buildPlayerUrl(request, env, store.slug, overrideUrl, appId)
  const isActive = !['중지', '비활성', '사용안함', 'inactive', 'disabled'].includes(String(store.status || '').toLowerCase())

  return {
    ok: true,
    version: LV_CORE_VERSION,
    id: appId,
    appId,
    store: store.slug,
    storeName: store.name,
    status: store.status || '운영중',
    active: isActive,
    playerUrl,
    generatedPlayerUrl,
    playerBaseUrl: playerBaseUrl(request, env),
    hasCustomPlayerUrl: Boolean(overrideUrl),
    playerUrlUpdatedAt: store.playerUrlUpdatedAt || store.player_url_updated_at || '',
    defaults: {
      heartbeat: DEFAULT_HEARTBEAT_MS,
      commandPoll: DEFAULT_COMMAND_POLL_MS,
      noticePollMs: DEFAULT_NOTICE_POLL_MS,
      contentCheck: DEFAULT_CONTENT_CHECK_MS,
      onlineTtlSec: Number(env.ONLINE_TTL_SEC || 600),
      d1HeartbeatWriteSec: Number(env.D1_HEARTBEAT_WRITE_SEC || DEFAULT_D1_HEARTBEAT_WRITE_SEC),
      defaultDurationSec: 20,
    },
    updatedAt: new Date().toISOString(),
  }
}

async function resolveStore(request, env) {
  const url = new URL(request.url)
  const lookup = url.searchParams.get('id') || url.searchParams.get('appId') || url.searchParams.get('app_id') || url.searchParams.get('store') || ''
  if (!lookup) return { error: json({ ok: false, error: 'id is required. example: /api/app-config?id=lv001' }, 400) }
  const store = await findStoreForAppConfig(env, lookup)
  if (!store) return { error: json({ ok: false, error: 'app id not found', id: normalizeLvId(lookup) || lookup }, 404) }
  return { store }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const { store, error } = await resolveStore(request, env)
  if (error) return error

  return json(configResponse(request, env, store))
}

export async function onRequestPost({ request, env }) {
  return onRequestPatch({ request, env })
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const body = await readBody(request)
  const lookup = body.id || body.appId || body.app_id || body.store || body.slug || ''
  if (!lookup) return json({ ok: false, error: 'id/appId/store is required' }, 400)

  let current = await findStoreForAppConfig(env, lookup)
  const appId = normalizeLvId(body.appId || body.app_id || body.id || current?.appId || '')
  const slug = cleanSlug(body.slug || body.store || current?.slug || '')

  if (!current) {
    if (!body.name || !slug) return json({ ok: false, error: 'store not found. To create one, provide name and slug/store.' }, 404)
    await env.DB.prepare(`
      INSERT INTO stores
      (id, app_id, name, slug, category, address, contact, status, plan, player_url, player_url_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      `st_${Date.now()}`,
      appId,
      String(body.name || '').trim(),
      slug,
      String(body.category || '미분류').trim(),
      String(body.address || '').trim(),
      String(body.contact || '').trim(),
      String(body.status || '운영중').trim(),
      String(body.plan || 'Local Basic').trim(),
      String(body.playerUrl || body.player_url || '').trim(),
      body.playerUrl || body.player_url ? new Date().toISOString() : ''
    ).run()
    current = await findStoreForAppConfig(env, appId || slug)
  } else {
    const nextPlayerUrl = body.playerUrl !== undefined || body.player_url !== undefined
      ? String(body.playerUrl ?? body.player_url ?? '').trim()
      : current.playerUrl || ''
    const changed = nextPlayerUrl !== String(current.playerUrl || '')
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
      appId || current.appId,
      String(body.name ?? current.name ?? '').trim(),
      slug || current.slug,
      String(body.category ?? current.category ?? '').trim(),
      String(body.address ?? current.address ?? '').trim(),
      String(body.contact ?? current.contact ?? '').trim(),
      String(body.status ?? current.status ?? '운영중').trim(),
      String(body.plan ?? current.plan ?? 'Local Basic').trim(),
      nextPlayerUrl,
      changed ? 1 : 0,
      new Date().toISOString(),
      current.id
    ).run()
    current = await findStoreForAppConfig(env, appId || slug || current.appId || current.slug)
  }

  return json(configResponse(request, env, current))
}
