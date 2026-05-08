import { json, LV_CORE_VERSION, cleanSlug, normalizeLvId, findStoreForAppConfig, toKstString, nowUtcIso, nowKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

function mapNotice(row) {
  if (!row) return null
  return {
    id: row.id,
    store: row.store,
    title: row.title,
    type: row.type,
    message: row.message || '',
    mediaUrl: row.mediaUrl || '',
    linkUrl: row.linkUrl || '',
    fileName: row.fileName || '',
    r2Key: row.r2Key || '',
    startAt: row.startAt || '',
    endAt: row.endAt || '',
    startAtUtc: row.startAt || '',
    endAtUtc: row.endAt || '',
    startAtKst: row.startAt ? toKstString(row.startAt) : '',
    endAtKst: row.endAt ? toKstString(row.endAt) : '',
    displayMode: row.displayMode || 'fullscreen',
    priority: row.priority || 'normal',
    durationSec: Number(row.durationSec || 15),
    repeatMode: row.repeatMode || 'once',
    repeatIntervalMin: Number(row.repeatIntervalMin ?? 0),
    isActive: Boolean(row.isActive),
    updatedAt: row.updatedAt || '',
    updatedAtKst: row.updatedAt ? toKstString(row.updatedAt) : '',
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  const url = new URL(request.url)
  let store = cleanSlug(url.searchParams.get('store') || '')
  const appId = normalizeLvId(url.searchParams.get('id') || url.searchParams.get('appId') || '')
  if (!store && appId) {
    const row = await findStoreForAppConfig(env, appId)
    store = cleanSlug(row?.slug || '')
  }
  if (!store) return json({ ok: false, error: 'store or id is required' }, 400)

  const now = nowUtcIso()
  const row = await env.DB.prepare(`
    SELECT id, store, title, type, message, media_url AS mediaUrl, link_url AS linkUrl,
           file_name AS fileName, r2_key AS r2Key, start_at AS startAt, end_at AS endAt,
           display_mode AS displayMode, priority, duration_sec AS durationSec,
           repeat_mode AS repeatMode, repeat_interval_min AS repeatIntervalMin, is_active AS isActive, updated_at AS updatedAt
    FROM notices
    WHERE (store = ? OR store = '_all')
      AND is_active = 1
      AND (start_at = '' OR start_at <= ?)
      AND (end_at = '' OR end_at >= ?)
    ORDER BY CASE priority WHEN 'urgent' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).bind(store, now, now).first()
  const notice = mapNotice(row)
  return json({
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/notice-active',
    store,
    notice,
    activeNotice: notice,
    noticeVersion: notice ? `${notice.id}:${notice.updatedAt || ''}` : '',
    serverNowUtc: now,
    serverNowKst: nowKstString(),
  })
}
