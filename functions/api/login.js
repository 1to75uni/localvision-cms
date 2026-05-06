import { adminPassword, createAdminSession, adminCookie, authJson } from '../_lib/auth.js'

export async function onRequestOptions() {
  return authJson({ ok: true })
}

export async function onRequestPost({ request, env }) {
  let body = {}
  try { body = await request.json() } catch {}

  const password = String(body.password || '').trim()
  if (!password || password !== adminPassword(env)) {
    return authJson({ ok: false, error: '비밀번호가 맞지 않습니다.' }, 401)
  }

  const token = await createAdminSession(env)
  return authJson(
    { ok: true, message: '로그인되었습니다.' },
    200,
    { 'set-cookie': adminCookie(token) }
  )
}
