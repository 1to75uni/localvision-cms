import { json, ensureCoreSchema, upsertR2ScanIntoD1, mapDevice, safeAll, dedupeContentsRows, cleanupSyntheticR2Duplicates, cleanupDuplicateContents, cleanupDuplicateDevices, dedupeDeviceRows, safeErrorMessage, nowUtcIso, nowKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

function boolParam(url, name) {
  return ['1', 'true', 'yes'].includes(String(url.searchParams.get(name) || '').toLowerCase())
}

async function optionalTask(label, diagnostics, fn) {
  try {
    return await fn()
  } catch (error) {
    const message = safeErrorMessage(error)
    diagnostics.push(`${label}: ${message}`)
    return { ok: false, reason: message }
  }
}

export async function onRequestGet({ request, env }) {
  const diagnostics = []
  const url = new URL(request.url)
  const deep = boolParam(url, 'deep') || boolParam(url, 'sync') || boolParam(url, 'repair')

  if (!env.DB) {
    return json({
      ok: true,
      degraded: true,
      version: 'v1.8.7-right-target-ui-fixed',
      endpoint: '/api/backup',
      mode: 'no-db-safe-empty',
      diagnostics: ['D1 binding DB is missing. Pages Functions binding name must be DB.'],
      stores: [],
      contents: [],
      notices: [],
      devices: [],
    })
  }

  // 기본 /api/backup은 화면 로딩용 안전 백업입니다. 무거운 R2 scan/cleanup/schema repair는 deep=1일 때만 실행합니다.
  let schemaRepair = { ok: false, skipped: !deep, reason: deep ? '' : 'skipped: use /api/backup?deep=1 or /api/repair for schema repair' }
  let r2Sync = { ok: false, skipped: !deep, reason: deep ? 'not-run' : 'skipped: deep mode only' }
  let duplicateCleanup = { ok: false, skipped: !deep, deleted: 0, reason: deep ? 'not-run' : 'skipped: deep mode only' }
  let contentCleanup = { ok: false, skipped: !deep, deleted: 0, reason: deep ? 'not-run' : 'skipped: deep mode only' }
  let deviceCleanup = { ok: false, skipped: !deep, deleted: 0, merged: 0, reason: deep ? 'not-run' : 'skipped: deep mode only' }

  if (deep) {
    schemaRepair = await optionalTask('ensureCoreSchema', diagnostics, async () => { await ensureCoreSchema(env); return { ok: true } })
    r2Sync = await optionalTask('r2Sync', diagnostics, async () => upsertR2ScanIntoD1(request, env))
    duplicateCleanup = await optionalTask('duplicateCleanup', diagnostics, async () => cleanupSyntheticR2Duplicates(env))
    contentCleanup = await optionalTask('contentCleanup', diagnostics, async () => cleanupDuplicateContents(env))
    deviceCleanup = await optionalTask('deviceCleanup', diagnostics, async () => cleanupDuplicateDevices(env))
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
      updated_at AS updatedAt,
      r2_key AS r2Key
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
      r2_key AS r2Key,
      start_at AS startAt,
      end_at AS endAt,
      timezone,
      display_mode AS displayMode,
      priority,
      duration_sec AS durationSec,
      repeat_mode AS repeatMode,
      repeat_interval_min AS repeatIntervalMin,
      is_active AS enabled,
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

  const now = nowUtcIso()
  const nowKst = nowKstString()
  const noticeRows = (notices.results || []).map((row) => {
    const enabled = Boolean(row.enabled)
    const startAt = String(row.startAt || '')
    const endAt = String(row.endAt || '')
    const currentlyActive = enabled && (!startAt || startAt <= now) && (!endAt || endAt >= now)
    return {
      ...row,
      enabled,
      isActive: currentlyActive,
      currentlyActive,
      scheduleState: !enabled ? 'disabled' : (currentlyActive ? 'active-now' : (startAt && startAt > now ? 'scheduled' : 'expired')),
      durationSec: Number(row.durationSec || 15),
    }
  })

  return json({
    ok: true,
    degraded: diagnostics.length > 0,
    version: 'v1.8.7-right-target-ui-fixed',
    endpoint: '/api/backup',
    mode: deep ? 'deep-manual-repair-sync' : 'lite-safe-readonly',
    note: deep ? 'Schema/R2/cleanup tasks were requested manually.' : 'Default backup is readonly. Use ?deep=1 only for manual repair/sync.',
    bindings: {
      DB: Boolean(env.DB),
      MEDIA: Boolean(env.MEDIA),
      R2_PUBLIC_BASE: Boolean(env.R2_PUBLIC_BASE),
      ONLINE_TTL_SEC: Number(env.ONLINE_TTL_SEC || 600),
    },
    serverNowUtc: now,
    serverNowKst: nowKst,
    diagnostics,
    schemaRepair,
    r2Sync,
    duplicateCleanup,
    contentCleanup,
    deviceCleanup,
    stores: stores.results || [],
    contents: dedupeContentsRows(contents.results || []),
    notices: noticeRows,
    devices: dedupeDeviceRows(devices.results || [], env).map((row) => mapDevice(row, env)),
  })
}
