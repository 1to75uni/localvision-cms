import { clearAdminCookie, authJson } from '../_lib/auth.js'

export async function onRequestPost() {
  return authJson({ ok: true }, 200, { 'set-cookie': clearAdminCookie() })
}
