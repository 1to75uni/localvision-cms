import { json, DEFAULT_CONTENT_DURATION, LV_CORE_VERSION, ensureCoreSchema, scanR2Media, mapDevice, dedupeContentsRows, cleanupSyntheticR2Duplicates, cleanupDuplicateContents, cleanupDuplicateDevices, dedupeDeviceRows, nowUtcIso, nowKstString, toKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

function normalizeContent(row) {
  return {
    id: row.id,
    store: row.store,
    side: row.side,
    type: row.type,
    title: row.title,
    duration: Number(row.duration || DEFAULT_CONTENT_DURATION),
    status: row.status,
    fileName: row.fileName,
    url: row.url || '',
    sortOrder: Number(row.sortOrder || 0),
    updatedAt: row.updatedAt,
    r2Key: row.r2Key || row.r2_key || '',
    updatedAtKst: row.updatedAt ? toKstString(row.updatedAt) : '',
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const storeSlug = url.searchParams.get('store') || ''

  if (!storeSlug) {
    return json({ ok: false, error: 'store is required' }, 400)
  }

  let store = null
  let leftItems = []
  let rightItems = []
  let devices = []
  let source = 'd1'

  if (env.DB) {
    try {
      await ensureCoreSchema(env)
      await cleanupSyntheticR2Duplicates(env)
      await cleanupDuplicateContents(env)
      await cleanupDuplicateDevices(env)
      store = await env.DB.prepare(`
        SELECT
          id,
          name,
          slug,
          category,
          address,
          contact,
          status,
          plan,
          created_at AS createdAt
        FROM stores
        WHERE slug = ?
      `).bind(storeSlug).first()

      const left = await env.DB.prepare(`
        SELECT
          id,
          store,
          side,
          type,
          title,
          duration,
          status,
          file_name AS fileName,
          url,
          sort_order AS sortOrder,
          updated_at AS updatedAt,
          r2_key AS r2Key
        FROM contents
        WHERE store = ?
          AND side = 'left'
          AND status = '사용중'
        ORDER BY sort_order ASC, updated_at DESC
      `).bind(storeSlug).all()

      const right = await env.DB.prepare(`
        SELECT
          id,
          store,
          side,
          type,
          title,
          duration,
          status,
          file_name AS fileName,
          url,
          sort_order AS sortOrder,
          updated_at AS updatedAt,
          r2_key AS r2Key
        FROM contents
        WHERE store = '_common'
          AND side = 'right'
          AND status = '사용중'
        ORDER BY sort_order ASC, updated_at DESC
      `).all()

      const deviceRows = await env.DB.prepare(`
        SELECT
          id,
          store,
          name,
          role,
          online,
          last_seen AS lastSeen,
          app,
          device_code AS deviceCode,
          last_command AS lastCommand,
          command_at AS commandAt,
          updated_at AS updatedAt
        FROM devices
        WHERE store = ?
        ORDER BY created_at DESC
      `).bind(storeSlug).all()

      leftItems = dedupeContentsRows(left.results || []).map(normalizeContent)
      rightItems = dedupeContentsRows(right.results || []).map(normalizeContent)
      devices = dedupeDeviceRows(deviceRows.results || [], env).map((device) => mapDevice(device, env))
    } catch (error) {
      source = `d1-error: ${String(error?.message || error)}`
    }
  }

  if ((!store || !leftItems.length || !rightItems.length) && env.MEDIA) {
    const scan = await scanR2Media(request, env)
    const foundStore = scan.stores.find((item) => item.slug === storeSlug)
    if (!store && foundStore) store = foundStore
    if (!leftItems.length) {
      leftItems = dedupeContentsRows(scan.contents).filter((item) => item.store === storeSlug && item.side === 'left').map(normalizeContent)
    }
    if (!rightItems.length) {
      rightItems = dedupeContentsRows(scan.contents).filter((item) => item.store === '_common' && item.side === 'right').map(normalizeContent)
    }
    source = source === 'd1' ? 'd1+r2-fallback' : `${source}+r2-fallback`
  }

  if (!store) {
    return json({ ok: false, error: 'store not found', source }, 404)
  }

  return json({
    ok: true,
    version: LV_CORE_VERSION,
    source,
    store,
    layout: {
      leftRatio: 70,
      rightRatio: 30,
    },
    playlists: {
      left: leftItems,
      right: rightItems,
    },
    devices,
    updatedAt: nowUtcIso(),
    updatedAtKst: nowKstString(),
  })
}
