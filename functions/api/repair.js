import { json, ensureCoreSchema, upsertR2ScanIntoD1, cleanupSyntheticR2Duplicates, cleanupDuplicateContents, cleanupDuplicateDevices, safeAll, dedupeContentsRows, dedupeDeviceRows, mapDevice } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing. Pages Functions binding name must be DB.' }, 500)
  await ensureCoreSchema(env)

  let r2Sync = { ok: false, reason: 'MEDIA binding missing or not run' }
  if (env.MEDIA) {
    r2Sync = await upsertR2ScanIntoD1(request, env)
  }

  const syntheticCleanup = await cleanupSyntheticR2Duplicates(env)
  const contentCleanup = await cleanupDuplicateContents(env)
  const deviceCleanup = await cleanupDuplicateDevices(env)

  const contents = await safeAll(env, `
    SELECT id, store, side, type, title, duration, status, file_name AS fileName, url, sort_order AS sortOrder, updated_at AS updatedAt
    FROM contents
    ORDER BY side ASC, sort_order ASC, updated_at DESC
  `)
  const devices = await safeAll(env, `
    SELECT id, store, name, role, online, last_seen AS lastSeen, app, device_code AS deviceCode, last_command AS lastCommand, command_at AS commandAt, updated_at AS updatedAt
    FROM devices
    ORDER BY store ASC, updated_at DESC
  `)

  return json({
    ok: true,
    version: 'v1.8.3-content-sync-field-log',
    message: 'D1/R2 repair completed. Contents and devices are now store-canonicalized.',
    r2Sync,
    syntheticCleanup,
    contentCleanup,
    deviceCleanup,
    counts: {
      contents: dedupeContentsRows(contents.results || []).length,
      devices: dedupeDeviceRows(devices.results || [], env).length,
    },
    contents: dedupeContentsRows(contents.results || []),
    devices: dedupeDeviceRows(devices.results || [], env).map((row) => mapDevice(row, env)),
  })
}
