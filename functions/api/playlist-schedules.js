import {
  json,
  ensureCoreSchema,
  cleanSlug,
  ensureDefaultPlaylistGroup,
  readPlaylistGroups,
  readPlaylistSchedules,
  pickActivePlaylistSchedule,
  writePlaylistSnapshots,
  nowKstString,
  DEFAULT_PLAYER_STATE_POLL_MS,
} from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

async function readBody(request) {
  try { return await request.json() } catch { return {} }
}

function normalizeDays(value) {
  const raw = Array.isArray(value) ? value : (() => {
    try { return JSON.parse(String(value || '[]')) } catch { return [] }
  })()
  return [...new Set((raw || []).map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0 && v <= 6))]
}

function validTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ''))
}

function scheduleId(store) {
  return `sch_${cleanSlug(store)}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

async function activeInfo(env, store) {
  const groups = await readPlaylistGroups(env, store)
  const schedules = await readPlaylistSchedules(env, store)
  const activeSchedule = pickActivePlaylistSchedule(schedules)
  const activeGroup = activeSchedule
    ? groups.find((g) => g.id === activeSchedule.playlistGroupId) || null
    : groups.find((g) => g.isDefault) || groups[0] || null
  return { groups, schedules, activeSchedule, activeGroup, nowKst: nowKstString() }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const url = new URL(request.url)
  const store = cleanSlug(url.searchParams.get('store') || '')
  if (!store) return json({ ok: false, error: 'store is required' }, 400)
  await ensureDefaultPlaylistGroup(env, store)
  const info = await activeInfo(env, store)
  return json({ ok: true, endpoint: '/api/playlist-schedules', store, ...info })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const body = await readBody(request)
  const store = cleanSlug(body.store || '')
  if (!store) return json({ ok: false, error: 'store is required' }, 400)
  await ensureDefaultPlaylistGroup(env, store)

  const name = String(body.name || '').trim()
  const days = normalizeDays(body.days ?? body.daysJson ?? body.days_json)
  const startTime = String(body.startTime || body.start_time || '').trim()
  const endTime = String(body.endTime || body.end_time || '').trim()
  const playlistGroupId = String(body.playlistGroupId || body.playlist_group_id || '').trim()
  if (!name) return json({ ok: false, error: 'name is required' }, 400)
  if (!days.length) return json({ ok: false, error: 'at least one day is required' }, 400)
  if (!validTime(startTime) || !validTime(endTime)) return json({ ok: false, error: 'startTime and endTime must be HH:mm' }, 400)
  if (!playlistGroupId) return json({ ok: false, error: 'playlistGroupId is required' }, 400)
  const group = await env.DB.prepare(`SELECT id FROM playlist_groups WHERE id = ? AND store = ? LIMIT 1`).bind(playlistGroupId, store).first()
  if (!group) return json({ ok: false, error: 'playlist group not found' }, 404)

  const id = String(body.id || scheduleId(store)).trim()
  await env.DB.prepare(`
    INSERT OR REPLACE INTO playlist_schedules
    (id, store, name, days_json, start_time, end_time, playlist_group_id, enabled, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    id,
    store,
    name,
    JSON.stringify(days),
    startTime,
    endTime,
    playlistGroupId,
    body.enabled === false ? 0 : 1,
    Number(body.priority ?? 100) || 100
  ).run()
  let snapshot = null
  try { snapshot = await writePlaylistSnapshots(request, env, store) } catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }
  const info = await activeInfo(env, store)
  return json({ ok: true, store, schedule: info.schedules.find((s) => s.id === id) || null, snapshot, ...info, contentReflect: { tvExpectedMs: DEFAULT_PLAYER_STATE_POLL_MS, tvExpectedText: `최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`, message: '송출 스케줄 저장 완료' } })
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const body = await readBody(request)
  const id = String(body.id || '').trim()
  if (!id) return json({ ok: false, error: 'id is required' }, 400)
  const current = await env.DB.prepare(`SELECT * FROM playlist_schedules WHERE id = ? LIMIT 1`).bind(id).first()
  if (!current) return json({ ok: false, error: 'schedule not found' }, 404)

  const store = current.store
  const name = body.name !== undefined ? String(body.name || '').trim() : current.name
  const days = body.days !== undefined || body.daysJson !== undefined || body.days_json !== undefined
    ? normalizeDays(body.days ?? body.daysJson ?? body.days_json)
    : normalizeDays(current.days_json)
  const startTime = body.startTime !== undefined || body.start_time !== undefined ? String(body.startTime ?? body.start_time).trim() : current.start_time
  const endTime = body.endTime !== undefined || body.end_time !== undefined ? String(body.endTime ?? body.end_time).trim() : current.end_time
  const playlistGroupId = body.playlistGroupId !== undefined || body.playlist_group_id !== undefined ? String(body.playlistGroupId ?? body.playlist_group_id).trim() : current.playlist_group_id
  const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : Number(current.enabled ?? 1)
  const priority = body.priority !== undefined ? Number(body.priority) || 100 : Number(current.priority || 100)
  if (!name) return json({ ok: false, error: 'name is required' }, 400)
  if (!days.length) return json({ ok: false, error: 'at least one day is required' }, 400)
  if (!validTime(startTime) || !validTime(endTime)) return json({ ok: false, error: 'startTime and endTime must be HH:mm' }, 400)
  const group = await env.DB.prepare(`SELECT id FROM playlist_groups WHERE id = ? AND store = ? LIMIT 1`).bind(playlistGroupId, store).first()
  if (!group) return json({ ok: false, error: 'playlist group not found' }, 404)

  await env.DB.prepare(`
    UPDATE playlist_schedules
    SET name = ?, days_json = ?, start_time = ?, end_time = ?, playlist_group_id = ?, enabled = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(name, JSON.stringify(days), startTime, endTime, playlistGroupId, enabled, priority, id).run()
  let snapshot = null
  try { snapshot = await writePlaylistSnapshots(request, env, store) } catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }
  const info = await activeInfo(env, store)
  return json({ ok: true, store, schedule: info.schedules.find((s) => s.id === id) || null, snapshot, ...info })
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const url = new URL(request.url)
  const id = String(url.searchParams.get('id') || '').trim()
  if (!id) return json({ ok: false, error: 'id is required' }, 400)
  const current = await env.DB.prepare(`SELECT * FROM playlist_schedules WHERE id = ? LIMIT 1`).bind(id).first()
  if (!current) return json({ ok: false, error: 'schedule not found' }, 404)
  await env.DB.prepare(`DELETE FROM playlist_schedules WHERE id = ?`).bind(id).run()
  let snapshot = null
  try { snapshot = await writePlaylistSnapshots(request, env, current.store) } catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }
  const info = await activeInfo(env, current.store)
  return json({ ok: true, store: current.store, deleted: id, snapshot, ...info })
}
