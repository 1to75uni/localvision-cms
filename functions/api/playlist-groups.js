import {
  json,
  ensureCoreSchema,
  cleanSlug,
  defaultPlaylistGroupId,
  ensureDefaultPlaylistGroup,
  readPlaylistGroups,
  writePlaylistSnapshots,
  DEFAULT_PLAYER_STATE_POLL_MS,
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

async function readBody(request) {
  try { return await request.json() } catch { return {} }
}

function groupId(store, slug) {
  return `pg_${cleanSlug(store)}_${cleanSlug(slug) || Date.now()}`
}

async function withCounts(env, groups = []) {
  const output = []
  for (const group of groups) {
    let count = 0
    try {
      const row = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM contents
        WHERE store = ? AND side = 'left' AND playlist_group_id = ?
      `).bind(group.store, group.id).first()
      count = Number(row?.count || 0)
    } catch {}
    output.push({ ...group, contentCount: count })
  }
  return output
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const url = new URL(request.url)
  const store = cleanSlug(url.searchParams.get('store') || '')
  if (!store) return json({ ok: false, error: 'store is required' }, 400)
  await ensureDefaultPlaylistGroup(env, store)
  const groups = await withCounts(env, await readPlaylistGroups(env, store))
  return json({ ok: true, endpoint: '/api/playlist-groups', store, groups })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const body = await readBody(request)
  const store = cleanSlug(body.store || '')
  if (!store) return json({ ok: false, error: 'store is required' }, 400)
  await ensureDefaultPlaylistGroup(env, store)

  const name = String(body.name || '').trim()
  if (!name) return json({ ok: false, error: 'name is required' }, 400)
  const slug = cleanSlug(body.slug || name) || `group-${Date.now()}`
  const id = String(body.id || groupId(store, slug)).trim()
  const sortOrder = Number(body.sortOrder ?? body.sort_order ?? Date.now()) || Date.now()

  const duplicateFromId = String(body.duplicateFromId || body.duplicate_from_id || '').trim()
  await env.DB.prepare(`
    INSERT OR REPLACE INTO playlist_groups
    (id, store, name, slug, is_default, status, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(id, store, name, slug, String(body.status || '사용중'), sortOrder).run()

  let duplicated = 0
  if (duplicateFromId) {
    const rows = await env.DB.prepare(`
      SELECT store, side, type, title, duration, status, file_name, url, sort_order, r2_key, target_mode, target_stores_json
      FROM contents
      WHERE store = ? AND side = 'left' AND playlist_group_id = ?
      ORDER BY sort_order ASC, updated_at DESC
    `).bind(store, duplicateFromId).all()
    for (const row of rows.results || []) {
      const newId = `ct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await env.DB.prepare(`
        INSERT INTO contents
        (id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at, r2_key, target_mode, target_stores_json, playlist_group_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
      `).bind(
        newId,
        row.store,
        row.side,
        row.type,
        row.title,
        Number(row.duration || 20),
        row.status || '사용중',
        row.file_name || '',
        row.url || '',
        Number(row.sort_order || 0),
        row.r2_key || '',
        row.target_mode || 'all',
        row.target_stores_json || '[]',
        id
      ).run()
      duplicated += 1
    }
  }

  let snapshot = null
  try { snapshot = await writePlaylistSnapshots(request, env, store) } catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }
  const groups = await withCounts(env, await readPlaylistGroups(env, store))
  return json({
    ok: true,
    store,
    group: groups.find((g) => g.id === id) || null,
    duplicated,
    groups,
    snapshot,
    contentReflect: {
      tvExpectedMs: DEFAULT_PLAYER_STATE_POLL_MS,
      tvExpectedText: `최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`,
      message: duplicated ? `플레이리스트 그룹 생성 및 ${duplicated}개 콘텐츠 복제 완료` : '플레이리스트 그룹 생성 완료',
    },
  })
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const body = await readBody(request)
  const id = String(body.id || '').trim()
  if (!id) return json({ ok: false, error: 'id is required' }, 400)
  const current = await env.DB.prepare(`SELECT * FROM playlist_groups WHERE id = ? LIMIT 1`).bind(id).first()
  if (!current) return json({ ok: false, error: 'playlist group not found' }, 404)
  if (Number(current.is_default || 0) && body.status && String(body.status) !== '사용중') {
    return json({ ok: false, error: '기본 플레이리스트는 비활성화할 수 없습니다.' }, 400)
  }

  const name = body.name !== undefined ? String(body.name || '').trim() : current.name
  const slug = body.slug !== undefined ? cleanSlug(body.slug || current.slug) : current.slug
  const status = body.status !== undefined ? String(body.status || '사용중').trim() : current.status
  const sortOrder = body.sortOrder !== undefined || body.sort_order !== undefined ? Number(body.sortOrder ?? body.sort_order) || 0 : Number(current.sort_order || 0)
  await env.DB.prepare(`
    UPDATE playlist_groups
    SET name = ?, slug = ?, status = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(name, slug, status, sortOrder, id).run()
  let snapshot = null
  try { snapshot = await writePlaylistSnapshots(request, env, current.store) } catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }
  const groups = await withCounts(env, await readPlaylistGroups(env, current.store))
  return json({ ok: true, store: current.store, group: groups.find((g) => g.id === id) || null, groups, snapshot })
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const url = new URL(request.url)
  const id = String(url.searchParams.get('id') || '').trim()
  if (!id) return json({ ok: false, error: 'id is required' }, 400)
  const group = await env.DB.prepare(`SELECT * FROM playlist_groups WHERE id = ? LIMIT 1`).bind(id).first()
  if (!group) return json({ ok: false, error: 'playlist group not found' }, 404)
  if (Number(group.is_default || 0)) return json({ ok: false, error: '기본 플레이리스트는 삭제할 수 없습니다.' }, 400)

  const fallbackId = defaultPlaylistGroupId(group.store)
  await ensureDefaultPlaylistGroup(env, group.store)
  await env.DB.prepare(`UPDATE contents SET playlist_group_id = ? WHERE playlist_group_id = ?`).bind(fallbackId, id).run()
  await env.DB.prepare(`DELETE FROM playlist_schedules WHERE playlist_group_id = ?`).bind(id).run()
  await env.DB.prepare(`DELETE FROM playlist_groups WHERE id = ?`).bind(id).run()
  let snapshot = null
  try { snapshot = await writePlaylistSnapshots(request, env, group.store) } catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }
  const groups = await withCounts(env, await readPlaylistGroups(env, group.store))
  return json({ ok: true, store: group.store, deleted: id, movedContentsTo: fallbackId, groups, snapshot })
}
