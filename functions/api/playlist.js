import { json, ensureCoreSchema, scanR2Media, dedupeContentsRows, cleanupSyntheticR2Duplicates, cleanupDuplicateContents } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

function normalizeItem(row) {
  return {
    id: row.id,
    store: row.store,
    side: row.side,
    type: row.type,
    title: row.title,
    duration: Number(row.duration || 10),
    status: row.status,
    fileName: row.fileName,
    url: row.url || '',
    sortOrder: Number(row.sortOrder || 0),
    updatedAt: row.updatedAt,
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const store = url.searchParams.get('store') || ''
  const side = url.searchParams.get('side') || 'left'

  if (!['left', 'right'].includes(side)) {
    return json({ ok: false, error: 'side must be left or right' }, 400)
  }

  if (side === 'left' && !store) {
    return json({ ok: false, error: 'store is required for left playlist' }, 400)
  }

  const targetStore = side === 'right' ? '_common' : store
  let items = []
  let source = 'd1'

  if (env.DB) {
    try {
      await ensureCoreSchema(env)
      await cleanupSyntheticR2Duplicates(env)
      await cleanupDuplicateContents(env)
      const { results } = await env.DB.prepare(`
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
          updated_at AS updatedAt
        FROM contents
        WHERE store = ?
          AND side = ?
          AND status = '사용중'
        ORDER BY sort_order ASC, updated_at DESC
      `).bind(targetStore, side).all()

      items = dedupeContentsRows(results || []).map(normalizeItem)
    } catch (error) {
      source = `d1-error: ${String(error?.message || error)}`
    }
  }

  // D1에 아직 인덱싱되지 않았거나, 기존 R2 자료만 있는 경우 Player가 빈 화면이 되지 않도록 R2 직접 fallback.
  if (!items.length && env.MEDIA) {
    const scan = await scanR2Media(request, env)
    items = dedupeContentsRows(scan.contents)
      .filter((item) => item.store === targetStore && item.side === side && item.status === '사용중')
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map(normalizeItem)
    source = 'r2-fallback'
  }

  return json({
    ok: true,
    version: 'v1.6.4-store-canonical-capture-fixed',
    source,
    store,
    side,
    targetStore,
    count: items.length,
    updatedAt: new Date().toISOString(),
    items,
  })
}
