import { json, LV_CORE_VERSION, nowUtcIso, nowKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() {
  return json({ ok: true })
}

export async function onRequestGet({ env }) {
  // D1/R2를 건드리지 않는 초경량 연결 확인 API입니다.
  // CMS 첫 화면은 /api/ping으로 서버 자체 연결을 먼저 확인하고,
  // /api/health는 DB/R2 상세 점검용으로 별도 사용합니다.
  return json({
    ok: true,
    endpoint: '/api/ping',
    version: LV_CORE_VERSION,
    serverNowUtc: nowUtcIso(),
    serverNowKst: nowKstString(),
    DB_BINDING_PRESENT: Boolean(env.DB),
    MEDIA_BINDING_PRESENT: Boolean(env.MEDIA),
    mode: 'lightweight-no-d1-no-r2',
  })
}
