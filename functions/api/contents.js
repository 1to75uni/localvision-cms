import { ensureCoreSchema, dedupeContentsRows, cleanupSyntheticR2Duplicates, cleanupDuplicateContents, DEFAULT_CONTENT_DURATION, DEFAULT_PLAYER_STATE_POLL_MS, r2KeyFromUrl, writePlaylistSnapshots, writeCommonRightSnapshot, contentTargetFromBody, parseTargetStores, normalizeTargetMode } from '../_lib/localvision-core.js'
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD',
      'access-control-allow-headers': 'content-type,range,cache-control,pragma,authorization,x-lv-admin-token',
      'cache-control': 'no-store',
    },
  })
}

export async function onRequestOptions() {
  return json({ ok: true })
}

async function readBody(request) {
  try { return await request.json() } catch { return {} }
}

function mapContent(row = {}) {
  return {
    id: row.id,
    store: row.store,
    side: row.side,
    type: row.type,
    title: row.title,
    duration: Number(row.duration || DEFAULT_CONTENT_DURATION),
    status: row.status || '사용중',
    fileName: row.fileName ?? row.file_name ?? '',
    url: row.url || '',
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    updatedAt: row.updatedAt ?? row.updated_at ?? '',
    r2Key: row.r2Key ?? row.r2_key ?? r2KeyFromUrl(row.url || ''),
    targetMode: normalizeTargetMode(row.targetMode ?? row.target_mode, row.targetStoresJson ?? row.target_stores_json ?? ''),
    targetStores: parseTargetStores(row.targetStoresJson ?? row.target_stores_json ?? row.targetStores ?? row.target_stores ?? ''),
    targetCount: parseTargetStores(row.targetStoresJson ?? row.target_stores_json ?? row.targetStores ?? row.target_stores ?? '').length,
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  // v1.8.6: right 콘텐츠 노출대상 컬럼이 없던 기존 D1도 깨지지 않도록 1회 보강합니다.
  await ensureCoreSchema(env)
  const url = new URL(request.url)
  const store = url.searchParams.get('store')
  const side = url.searchParams.get('side')

  let sql = `
    SELECT
      id, store, side, type, title, duration, status,
      file_name AS fileName,
      url,
      sort_order AS sortOrder,
      updated_at AS updatedAt,
      r2_key AS r2Key,
      target_mode AS targetMode,
      target_stores_json AS targetStoresJson
    FROM contents
  `
  const params = []
  const where = []

  if (store) { where.push('store = ?'); params.push(store) }
  if (side) { where.push('side = ?'); params.push(side) }

  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ` ORDER BY side ASC, sort_order ASC, updated_at DESC`

  const { results } = await env.DB.prepare(sql).bind(...params).all()
  return json({ ok: true, contents: dedupeContentsRows(results || []).map(mapContent) })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)

  const body = await readBody(request)
  if (!body.title || !body.side || !body.type) {
    return json({ ok: false, error: 'title, side, type are required' }, 400)
  }

  const content = {
    id: body.id || `ct_${Date.now()}`,
    store: body.side === 'right' ? '_common' : (body.store || ''),
    side: body.side,
    type: body.type,
    title: body.title,
    duration: Number(body.duration) || DEFAULT_CONTENT_DURATION,
    status: body.status || '사용중',
    fileName: body.fileName || '',
    url: body.url || '',
    sortOrder: Number(body.sortOrder) || 0,
    updatedAt: body.updatedAt || new Date().toISOString(),
    r2Key: String(body.r2Key || body.r2_key || r2KeyFromUrl(body.url || '')).trim(),
  }
  const target = contentTargetFromBody(body, content.side)
  content.targetMode = target.targetMode
  content.targetStores = target.targetStores
  content.targetStoresJson = target.targetStoresJson

  await env.DB.prepare(`
    INSERT OR REPLACE INTO contents
    (id, store, side, type, title, duration, status, file_name, url, sort_order, updated_at, r2_key, target_mode, target_stores_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    content.id, content.store, content.side, content.type, content.title,
    content.duration, content.status, content.fileName, content.url,
    content.sortOrder, content.updatedAt, content.r2Key, content.targetMode, content.targetStoresJson
  ).run()

  let snapshot = null
  try { snapshot = content.store === '_common' ? await writeCommonRightSnapshot(request, env) : await writePlaylistSnapshots(request, env, content.store) }
  catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }

  const snapDoc = snapshot?.snapshot || snapshot || {}
  return json({
    ok: true,
    content,
    snapshot,
    contentReflect: {
      side: content.side,
      store: content.store,
      playlistVersion: snapDoc.playlistVersion || '',
      counts: snapDoc.counts || {},
      tvExpectedMs: DEFAULT_PLAYER_STATE_POLL_MS,
      tvExpectedText: `최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`,
      message: `콘텐츠 저장 완료. TV 반영 예상: 최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`,
      rightSource: content.store === '_common' ? '_common/right' : undefined,
    },
  })
}


export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  const url = new URL(request.url)
  const body = await readBody(request)
  const id = String(body.id || url.searchParams.get('id') || '').trim()
  if (!id) return json({ ok: false, error: 'id is required' }, 400)

  const current = await env.DB.prepare(`
    SELECT id, store, side, type, title, duration, status, file_name AS fileName, url,
           sort_order AS sortOrder, updated_at AS updatedAt, r2_key AS r2Key,
           target_mode AS targetMode, target_stores_json AS targetStoresJson
    FROM contents
    WHERE id = ?
    LIMIT 1
  `).bind(id).first()
  if (!current) return json({ ok: false, error: 'content not found', id }, 404)

  const side = String(body.side || current.side || '').trim()
  const target = contentTargetFromBody(body, side)
  const next = {
    title: body.title !== undefined ? String(body.title || '').trim() : current.title,
    duration: body.duration !== undefined ? Number(body.duration) || DEFAULT_CONTENT_DURATION : Number(current.duration || DEFAULT_CONTENT_DURATION),
    status: body.status !== undefined ? String(body.status || '사용중').trim() : current.status,
    sortOrder: body.sortOrder !== undefined || body.sort_order !== undefined ? Number(body.sortOrder ?? body.sort_order) || 0 : Number(current.sortOrder || 0),
    targetMode: target.targetMode,
    targetStoresJson: target.targetStoresJson,
    updatedAt: new Date().toISOString(),
  }

  await env.DB.prepare(`
    UPDATE contents
    SET title = ?, duration = ?, status = ?, sort_order = ?, target_mode = ?, target_stores_json = ?, updated_at = ?
    WHERE id = ?
  `).bind(next.title, next.duration, next.status, next.sortOrder, next.targetMode, next.targetStoresJson, next.updatedAt, id).run()

  let snapshot = null
  try { snapshot = current.store === '_common' ? await writeCommonRightSnapshot(request, env) : await writePlaylistSnapshots(request, env, current.store) }
  catch (error) { snapshot = { ok: false, reason: String(error?.message || error) } }

  return json({
    ok: true,
    content: mapContent({ ...current, ...next, targetStoresJson: next.targetStoresJson }),
    snapshot,
    contentReflect: {
      side: current.side,
      store: current.store,
      targetMode: next.targetMode,
      targetStores: parseTargetStores(next.targetStoresJson),
      targetCount: parseTargetStores(next.targetStoresJson).length,
      message: next.targetMode === 'selected'
        ? `노출 매장 ${parseTargetStores(next.targetStoresJson).length}곳으로 저장되었습니다.`
        : '전체 매장 노출로 저장되었습니다.',
    },
  })
}

export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  await ensureCoreSchema(env)
  await cleanupSyntheticR2Duplicates(env)
  await cleanupDuplicateContents(env)

  const url = new URL(request.url)
  const id = String(url.searchParams.get('id') || '').trim()
  const deleteFile = ['1', 'true', 'yes'].includes(String(url.searchParams.get('deleteFile') || '').toLowerCase())
  if (!id) return json({ ok: false, error: 'id is required' }, 400)

  const row = await env.DB.prepare(`
    SELECT id, store, side, title, file_name AS fileName, url, r2_key AS r2Key
    FROM contents
    WHERE id = ?
    LIMIT 1
  `).bind(id).first()
  if (!row) return json({ ok: false, error: 'content not found', id }, 404)

  const r2Key = String(row.r2Key || r2KeyFromUrl(row.url || '') || '').trim()
  let r2Deleted = false
  let r2DeleteSkipped = ''
  let d1MirrorRowsDeleted = 0
  let r2RefRows = []
  let realRefRows = []
  let syntheticRefRows = []

  if (r2Key) {
    try {
      const refRows = await env.DB.prepare(`
        SELECT id, store, side, file_name AS fileName, r2_key AS r2Key, url
        FROM contents
        WHERE id <> ?
          AND (
            r2_key = ?
            OR url LIKE ?
            OR file_name = ?
          )
      `).bind(id, r2Key, `%${r2Key}%`, String(row.fileName || '').trim()).all()
      r2RefRows = refRows?.results || []
      syntheticRefRows = r2RefRows.filter((r) => String(r.id || '').startsWith('r2_'))
      realRefRows = r2RefRows.filter((r) => !String(r.id || '').startsWith('r2_'))
    } catch (error) {
      r2DeleteSkipped = `reference check failed: ${String(error?.message || error)}`
    }
  }

  if (deleteFile) {
    if (!r2Key) {
      r2DeleteSkipped = 'r2_key not found'
    } else if (!env.MEDIA) {
      r2DeleteSkipped = 'R2 binding MEDIA is missing'
    } else if (realRefRows.length > 0) {
      // 실제 CMS 업로드 행(ct_ 등)이 같은 R2 파일을 공유하는 경우에는 안전하게 R2 파일 삭제를 보류합니다.
      // 단, R2 자동 스캔으로 생긴 r2_ 미러 행은 실제 참조가 아니므로 파일 삭제를 막지 않습니다.
      r2DeleteSkipped = `same r2_key is used by ${realRefRows.length} other real content row(s)`
    } else {
      try {
        await env.MEDIA.delete(r2Key)
        r2Deleted = true
      } catch (error) {
        r2DeleteSkipped = `R2 delete failed: ${String(error?.message || error)}`
      }
    }
  }

  // deleteFile=1로 R2 실제 파일까지 지웠다면, 같은 파일을 가리키는 r2_ 자동스캔 미러 행도 함께 제거합니다.
  // 그렇지 않으면 R2에는 없어도 CMS 목록/스냅샷에 남거나, 반대로 기존에는 r2_ 행 때문에 R2 삭제가 스킵되는 문제가 생겼습니다.
  if (deleteFile && r2Deleted && r2Key) {
    try {
      const mirrorDelete = await env.DB.prepare(`
        DELETE FROM contents
        WHERE id <> ?
          AND id LIKE 'r2_%'
          AND (
            r2_key = ?
            OR url LIKE ?
            OR file_name = ?
          )
      `).bind(id, r2Key, `%${r2Key}%`, String(row.fileName || '').trim()).run()
      d1MirrorRowsDeleted = Number(mirrorDelete?.meta?.changes || 0)
    } catch (_) {}
  }

  const result = await env.DB.prepare(`DELETE FROM contents WHERE id = ?`).bind(id).run()

  let snapshot = null
  try {
    snapshot = row.store === '_common' || row.side === 'right'
      ? await writeCommonRightSnapshot(request, env)
      : await writePlaylistSnapshots(request, env, row.store)
  } catch (error) {
    snapshot = { ok: false, reason: String(error?.message || error) }
  }

  const snapDoc = snapshot?.snapshot || snapshot || {}
  return json({
    ok: true,
    version: 'v1.9.2-visibility-button-modal-fix',
    snapshot,
    contentReflect: {
      side: row.side,
      store: row.store,
      playlistVersion: snapDoc.playlistVersion || '',
      counts: snapDoc.counts || {},
      tvExpectedMs: DEFAULT_PLAYER_STATE_POLL_MS,
      tvExpectedText: `최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`,
      message: r2Deleted
        ? `콘텐츠와 R2 실제 파일 삭제 완료. TV 반영 예상: 최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`
        : `콘텐츠 DB 삭제 완료. R2 파일 삭제 상태를 확인하세요. TV 반영 예상: 최대 ${Math.ceil(DEFAULT_PLAYER_STATE_POLL_MS / 60000)}분`,
      rightSource: row.store === '_common' || row.side === 'right' ? '_common/right' : undefined,
    },
    deleted: id,
    dbDeleted: Boolean(result?.success ?? true),
    d1MirrorRowsDeleted,
    r2Deleted,
    r2DeleteSkipped,
    deleteFile,
    r2Key,
    refCheck: {
      totalOtherRefs: r2RefRows.length,
      realOtherRefs: realRefRows.map((r) => r.id),
      syntheticOtherRefs: syntheticRefRows.map((r) => r.id),
    },
  })
}
