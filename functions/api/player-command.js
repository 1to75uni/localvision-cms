import { json, LV_CORE_VERSION, cleanSlug, normalizeLvId, findStoreForAppConfig, mapDevice, nowUtcIso, nowKstString } from '../_lib/localvision-core.js'

export async function onRequestOptions() { return json({ ok: true }) }

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is missing' }, 500)
  const url = new URL(request.url)
  let store = cleanSlug(url.searchParams.get('store') || '')
  const appId = normalizeLvId(url.searchParams.get('id') || url.searchParams.get('appId') || '')
  if (!store && appId) {
    const row = await findStoreForAppConfig(env, appId)
    store = cleanSlug(row?.slug || '')
  }
  if (!store) return json({ ok: false, error: 'store or id is required' }, 400)

  const row = await env.DB.prepare(`
    SELECT id, store, name, role, online, last_seen AS lastSeen, app, device_code AS deviceCode,
           last_command AS lastCommand, command_at AS commandAt, updated_at AS updatedAt
    FROM devices
    WHERE store = ?
    ORDER BY updated_at DESC, last_seen DESC, created_at DESC
    LIMIT 1
  `).bind(store).first()
  const device = row ? mapDevice(row, env) : null
  const command = row?.lastCommand ? {
    command: row.lastCommand,
    commandAt: row.commandAt || '',
    commandAtUtc: device?.commandAtUtc || '',
    deviceId: row.id,
    store,
  } : null

  return json({
    ok: true,
    version: LV_CORE_VERSION,
    endpoint: '/api/player-command',
    store,
    command,
    commandVersion: command ? `${command.command}:${command.commandAt || ''}` : '',
    device,
    serverNowUtc: nowUtcIso(),
    serverNowKst: nowKstString(),
  })
}
