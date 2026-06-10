import { json, cleanSlug, nowUtcIso, nowKstString, toKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

async function readBody(request) { try { return await request.json() } catch { return {} } }

async function ensureBlackModeSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is missing')
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS black_modes (
      store TEXT PRIMARY KEY,
      immediate_active INTEGER DEFAULT 0,
      immediate_until TEXT DEFAULT '',
      schedule_enabled INTEGER DEFAULT 0,
      schedule_days_json TEXT DEFAULT '[]',
      schedule_start TEXT DEFAULT '00:00',
      schedule_end TEXT DEFAULT '23:59',
      message TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_black_modes_updated ON black_modes(updated_at)`).run()
}

function pad2(n) { return String(n).padStart(2, '0') }

function kstParts(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return {
    day: kst.getUTCDay(),
    hhmm: `${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`,
    ymd: `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`,
  }
}

function endOfTodayKstUtcIso() {
  const p = kstParts(new Date())
  // KST YYYY-MM-DD 23:59:59 -> UTC ISO
  const [yyyy, mm, dd] = p.ymd.split('-').map(Number)
  return new Date(Date.UTC(yyyy, mm - 1, dd, 14, 59, 59)).toISOString()
}

function localKstToUtcIso(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString()
  }
  const m = raw.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString()
  }
  const yyyy = Number(m[1])
  const mo = Number(m[2]) - 1
  const dd = Number(m[3])
  const hh = Number(m[4] || 0)
  const mi = Number(m[5] || 0)
  const ss = Number(m[6] || 0)
  return new Date(Date.UTC(yyyy, mo, dd, hh - 9, mi, ss)).toISOString()
}

function parseDays(value) {
  if (Array.isArray(value)) return [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
  try { return parseDays(JSON.parse(String(value || '[]'))) } catch { return [] }
}

function inTimeRange(nowHHMM, start, end) {
  const s = String(start || '00:00').slice(0, 5)
  const e = String(end || '23:59').slice(0, 5)
  if (s <= e) return nowHHMM >= s && nowHHMM <= e
  // 자정을 넘기는 스케줄: 22:00~02:00
  return nowHHMM >= s || nowHHMM <= e
}

function evaluate(row = {}, now = new Date()) {
  const p = kstParts(now)
  const nowIso = now.toISOString()
  const immediateUntil = String(row.immediate_until || row.immediateUntil || '')
  const immediateActive = Number(row.immediate_active ?? row.immediateActive ?? 0) === 1
  const immediateOn = immediateActive && (!immediateUntil || immediateUntil >= nowIso)

  const scheduleEnabled = Number(row.schedule_enabled ?? row.scheduleEnabled ?? 0) === 1
  const days = parseDays(row.schedule_days_json ?? row.scheduleDaysJson ?? row.scheduleDays ?? [])
  const scheduleOn = scheduleEnabled && days.includes(p.day) && inTimeRange(p.hhmm, row.schedule_start || row.scheduleStart, row.schedule_end || row.scheduleEnd)

  const active = Boolean(immediateOn || scheduleOn)
  const reason = immediateOn ? 'immediate' : scheduleOn ? 'schedule' : 'off'
  return { active, reason, nowKst: nowKstString(), nowUtc: nowIso }
}

function mapRow(row = null) {
  if (!row) {
    const ev = evaluate({})
    return {
      store: '', blackMode: false, active: false, reason: 'off', message: '',
      immediateActive: false, immediateUntil: '', immediateUntilKst: '',
      scheduleEnabled: false, scheduleDays: [], scheduleStart: '00:00', scheduleEnd: '23:59',
      updatedAt: '', updatedAtKst: '', ...ev,
    }
  }
  const ev = evaluate(row)
  const immediateUntil = row.immediate_until || ''
  return {
    store: row.store || '',
    blackMode: ev.active,
    active: ev.active,
    reason: ev.reason,
    message: row.message || '',
    immediateActive: Number(row.immediate_active || 0) === 1,
    immediateUntil,
    immediateUntilKst: immediateUntil ? toKstString(immediateUntil) : '',
    scheduleEnabled: Number(row.schedule_enabled || 0) === 1,
    scheduleDays: parseDays(row.schedule_days_json || '[]'),
    scheduleStart: row.schedule_start || '00:00',
    scheduleEnd: row.schedule_end || '23:59',
    updatedAt: row.updated_at || '',
    updatedAtKst: row.updated_at ? toKstString(row.updated_at) : '',
    ...ev,
  }
}

async function readMode(env, store, options = {}) {
  // v2.0.4: GET에서는 black_modes 테이블/인덱스 보정을 하지 않습니다.
  // 테이블이 아직 없으면 휴무모드 OFF로 안전하게 응답합니다.
  if (options.ensureSchema === true) await ensureBlackModeSchema(env)
  try {
    const row = await env.DB.prepare(`SELECT * FROM black_modes WHERE store = ? LIMIT 1`).bind(store).first()
    return mapRow(row ? { ...row, store } : { store })
  } catch {
    return mapRow({ store })
  }
}

async function upsertMode(env, store, patch = {}) {
  await ensureBlackModeSchema(env)
  const now = nowUtcIso()
  const current = await env.DB.prepare(`SELECT * FROM black_modes WHERE store = ? LIMIT 1`).bind(store).first()
  const next = {
    immediateActive: patch.immediateActive ?? (current ? Number(current.immediate_active || 0) === 1 : false),
    immediateUntil: patch.immediateUntil ?? (current?.immediate_until || ''),
    scheduleEnabled: patch.scheduleEnabled ?? (current ? Number(current.schedule_enabled || 0) === 1 : false),
    scheduleDays: patch.scheduleDays ?? parseDays(current?.schedule_days_json || '[]'),
    scheduleStart: patch.scheduleStart ?? (current?.schedule_start || '00:00'),
    scheduleEnd: patch.scheduleEnd ?? (current?.schedule_end || '23:59'),
    message: patch.message ?? (current?.message || ''),
  }

  await env.DB.prepare(`
    INSERT INTO black_modes
    (store, immediate_active, immediate_until, schedule_enabled, schedule_days_json, schedule_start, schedule_end, message, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(store) DO UPDATE SET
      immediate_active = excluded.immediate_active,
      immediate_until = excluded.immediate_until,
      schedule_enabled = excluded.schedule_enabled,
      schedule_days_json = excluded.schedule_days_json,
      schedule_start = excluded.schedule_start,
      schedule_end = excluded.schedule_end,
      message = excluded.message,
      updated_at = excluded.updated_at
  `).bind(
    store,
    next.immediateActive ? 1 : 0,
    next.immediateUntil || '',
    next.scheduleEnabled ? 1 : 0,
    JSON.stringify(parseDays(next.scheduleDays)),
    String(next.scheduleStart || '00:00').slice(0, 5),
    String(next.scheduleEnd || '23:59').slice(0, 5),
    String(next.message || ''),
    now
  ).run()

  return readMode(env, store)
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  const url = new URL(request.url)
  const store = cleanSlug(url.searchParams.get('store') || '')
  if (!store) return json({ ok: false, error: 'store is required' }, 400)
  try {
    const mode = await readMode(env, store)
    return json({ ok: true, endpoint: '/api/black-mode', mode })
  } catch (error) {
    return json({ ok: false, error: error?.message || 'black mode read failed' }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  const body = await readBody(request)
  const store = cleanSlug(body.store || '')
  if (!store) return json({ ok: false, error: 'store is required' }, 400)
  const action = String(body.action || body.mode || '').toLowerCase()
  try {
    let saved
    if (action === 'off' || action === 'disable' || action === 'clear') {
      saved = await upsertMode(env, store, { immediateActive: false, immediateUntil: '', message: body.message || '' })
    } else if (action === 'immediate' || action === 'on' || action === 'today') {
      const until = localKstToUtcIso(body.until || body.immediateUntil || '') || endOfTodayKstUtcIso()
      saved = await upsertMode(env, store, { immediateActive: true, immediateUntil: until, message: body.message || '휴무모드' })
    } else if (action === 'schedule') {
      saved = await upsertMode(env, store, {
        scheduleEnabled: body.enabled !== false,
        scheduleDays: parseDays(body.days || body.scheduleDays || []),
        scheduleStart: body.start || body.scheduleStart || '00:00',
        scheduleEnd: body.end || body.scheduleEnd || '23:59',
        message: body.message || '정기 휴무모드',
      })
    } else if (action === 'schedule-off') {
      saved = await upsertMode(env, store, { scheduleEnabled: false })
    } else {
      return json({ ok: false, error: 'invalid action' }, 400)
    }
    return json({ ok: true, endpoint: '/api/black-mode', mode: saved })
  } catch (error) {
    return json({ ok: false, error: error?.message || 'black mode update failed' }, 500)
  }
}

export async function onRequestPatch(ctx) { return onRequestPost(ctx) }
