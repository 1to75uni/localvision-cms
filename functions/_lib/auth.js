const COOKIE_NAME = 'lv_admin_session'
const SESSION_TTL_SEC = 60 * 60 * 24 * 7

function textEncoder() { return new TextEncoder() }

function base64urlFromBytes(bytes) {
  let binary = ''
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64urlJson(data) {
  return base64urlFromBytes(textEncoder().encode(JSON.stringify(data)))
}

function decodeBase64url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  return atob(padded)
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder().encode(message))
  return base64urlFromBytes(sig)
}

function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || ''
  const parts = cookie.split(';').map((item) => item.trim())
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1))
  }
  return ''
}

function authSecret(env) {
  return String(env.CMS_AUTH_SECRET || env.CMS_ADMIN_PASSWORD || 'localvision-admin-secret')
}

export function adminPassword(env) {
  return String(env.CMS_ADMIN_PASSWORD || '0213')
}

export async function createAdminSession(env) {
  const now = Math.floor(Date.now() / 1000)
  const payload = base64urlJson({ role: 'admin', iat: now, exp: now + SESSION_TTL_SEC })
  const sig = await hmac(authSecret(env), payload)
  return `${payload}.${sig}`
}

export async function isAuthorized(request, env) {
  const token = getCookie(request, COOKIE_NAME) || request.headers.get('x-lv-admin-token') || ''
  const [payload, sig] = String(token).split('.')
  if (!payload || !sig) return false
  const expected = await hmac(authSecret(env), payload)
  if (sig !== expected) return false
  try {
    const json = JSON.parse(decodeBase64url(payload))
    return json.role === 'admin' && Number(json.exp || 0) > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

export function adminCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SEC}`
}

export function clearAdminCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

export function authJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,range,x-lv-admin-token',
      'cache-control': 'no-store, no-cache, must-revalidate',
      ...extraHeaders,
    },
  })
}
