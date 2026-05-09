import { json, ensureCoreSchema, upsertR2ScanIntoD1, mapDevice, safeAll, dedupeContentsRows, cleanupSyntheticR2Duplicates, cleanupDuplicateContents, cleanupDuplicateDevices, dedupeDeviceRows } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestGet({ request, env }) {
  const diagnostics = []

  if (!env.DB) {
    return json({ ok: false, error: 'D1 binding DB is missing. Pages Functions binding name must be DB.' }, 500)
  }

  try {
    await ensureCoreSchema(env)
  } catch (error) {
    // schema 보강 실패가 화면 전체 로딩 실패로 이어지지 않도록 오류를 담아서 반환합니다.
    diagnostics.push(`ensureCoreSchema: ${String(error?.message || error)}`)
  }

  let r2Sync = { ok: false, reason: 'not-run' }
  try {
    r2Sync = await upsertR2ScanIntoD1(request, env)
  } catch (error) {
    r2Sync = { ok: false, reason: String(error?.message || error) }
    diagnostics.push(`r2Sync: ${r2Sync.reason}`)
  }

  const duplicateCleanup = await cleanupSyntheticR2Duplicates(env)
  if (duplicateCleanup.ok && duplicateCleanup.deleted > 0) {
    diagnostics.push(`duplicateCleanup: removed ${duplicateCleanup.deleted} synthetic r2 rows`)
  }

  const contentCleanup = await cleanupDuplicateContents(env)
  if (contentCleanup.ok && contentCleanup.deleted > 0) {
    diagnostics.push(`contentCleanup: removed ${contentCleanup.deleted} duplicate contents`)
  }

  const deviceCleanup = await cleanupDuplicateDevices(env)
  if (deviceCleanup.ok && (deviceCleanup.deleted > 0 || deviceCleanup.merged > 0)) {
    diagnostics.push(`deviceCleanup: merged ${deviceCleanup.merged} stores / removed ${deviceCleanup.deleted} duplicate devices`)
  }

  const stores = await safeAll(env, `
    SELECT
      id,
      app_id AS appId,
      name, slug, category, address, contact, status, plan,
      player_url AS playerUrl,
      player_url_updated_at AS playerUrlUpdatedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM stores
    ORDER BY created_at DESC
  `)
  if (!stores.ok) diagnostics.push(`stores: ${stores.error}`)

  const contents = await safeAll(env, `
    SELECT
      id, store, side, type, title, duration, status,
      file_name AS fileName,
      url,
      sort_order AS sortOrder,
      updated_at AS updatedAt
    FROM contents
    ORDER BY side ASC, sort_order ASC, updated_at DESC
  `)
  if (!contents.ok) diagnostics.push(`contents: ${contents.error}`)

  const notices = await safeAll(env, `
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
  `)
  if (!notices.ok) diagnostics.push(`notices: ${notices.error}`)

  const devices = await safeAll(env, `
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
  `)
  if (!devices.ok) diagnostics.push(`devices: ${devices.error}`)

  return json({
    ok: true,
    version: 'v1.8.3-content-sync-field-log',
    mode: env.MEDIA ? 'D1 + R2 auto sync' : 'D1 only - MEDIA binding missing',
    bindings: {
      DB: Boolean(env.DB),
      MEDIA: Boolean(env.MEDIA),
      R2_PUBLIC_BASE: Boolean(env.R2_PUBLIC_BASE),
      ONLINE_TTL_SEC: Number(env.ONLINE_TTL_SEC || 600),
    },
    diagnostics,
    r2Sync,
    duplicateCleanup,
    contentCleanup,
    deviceCleanup,
    stores: stores.results || [],
    contents: dedupeContentsRows(contents.results || []),
    notices: (notices.results || []).map((row) => ({
      ...row,
      isActive: Boolean(row.isActive),
      durationSec: Number(row.durationSec || 15),
    })),
    devices: dedupeDeviceRows(devices.results || [], env).map((row) => mapDevice(row, env)),
  })
}
