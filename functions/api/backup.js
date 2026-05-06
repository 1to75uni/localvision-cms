import { json, ensureCoreSchema, upsertR2ScanIntoD1, mapDevice } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)

  await ensureCoreSchema(env)

  // v1.6.1 핵심 보완:
  // 기존 R2에 이미 올라가 있는 stores/<store>/left, stores/_common/right 구조를 CMS가 자동 인덱싱합니다.
  // D1이 비어 있거나 예전 데이터만 있어도 R2를 기준으로 stores/contents/devices를 보강합니다.
  let r2Sync = { ok: false, reason: 'not-run' }
  try {
    r2Sync = await upsertR2ScanIntoD1(request, env)
  } catch (error) {
    r2Sync = { ok: false, reason: String(error?.message || error) }
  }

  const stores = await env.DB.prepare(`
    SELECT
      id, name, slug, category, address, contact, status, plan,
      created_at AS createdAt
    FROM stores
    ORDER BY created_at DESC
  `).all()

  const contents = await env.DB.prepare(`
    SELECT
      id, store, side, type, title, duration, status,
      file_name AS fileName,
      url,
      sort_order AS sortOrder,
      updated_at AS updatedAt
    FROM contents
    ORDER BY side ASC, sort_order ASC, updated_at DESC
  `).all()

  const notices = await env.DB.prepare(`
    SELECT
      id, store, title, type, message,
      media_url AS mediaUrl,
      link_url AS linkUrl,
      file_name AS fileName,
      start_at AS startAt,
      end_at AS endAt,
      display_mode AS displayMode,
      priority,
      duration_sec AS durationSec,
      repeat_mode AS repeatMode,
      is_active AS isActive,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM notices
    ORDER BY updated_at DESC
  `).all()

  const devices = await env.DB.prepare(`
    SELECT
      id, store, name, role, online,
      last_seen AS lastSeen,
      app,
      device_code AS deviceCode,
      last_command AS lastCommand,
      command_at AS commandAt,
      updated_at AS updatedAt
    FROM devices
    ORDER BY created_at DESC
  `).all()

  return json({
    ok: true,
    version: 'v1.6.1-r2-autosync',
    mode: env.MEDIA ? 'D1 + R2 auto sync' : 'D1 only - MEDIA binding missing',
    r2Sync,
    stores: stores.results || [],
    contents: contents.results || [],
    notices: (notices.results || []).map((row) => ({
      ...row,
      isActive: Boolean(row.isActive),
      durationSec: Number(row.durationSec || 15),
    })),
    devices: (devices.results || []).map((row) => mapDevice(row, env)),
  })
}
