// LocalVision CMS v1.8.9 Right Target Visibility
// 모든 /api/* 요청에서 CORS preflight와 예외 응답을 안전하게 처리합니다.
import {isAuthorized} from './_lib/auth.js'
import { corsHeaders, json } from './_lib/localvision-core.js'

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  try {
    const endpoint=new URL(context.request.url).pathname
    const admin=['/api/contents','/api/upload','/api/media-upload','/api/notices','/api/notice-upload','/api/stores','/api/playlist-groups','/api/playlist-schedules','/api/black-mode','/api/r2-sync','/api/repair','/api/content-integrity','/api/sync-admin','/api/full-backup']
    const adminMutation=/^(POST|PUT|PATCH|DELETE)$/.test(context.request.method)&&admin.includes(endpoint)
    const adminMaintenance=context.request.method==='GET'&&['/api/snapshot-rebuild','/api/r2-sync','/api/repair'].includes(endpoint)
    if((adminMutation||adminMaintenance)&&!await isAuthorized(context.request,context.env))return json({ok:false,error:'CMS 로그인 필요'},401)
    const response = await context.next()
    const headers = new Headers(response.headers)
    const path = new URL(context.request.url).pathname
    if(response.ok && /^(POST|PATCH|DELETE)$/.test(context.request.method) && ['/api/contents','/api/upload','/api/notices','/api/notice-upload','/api/stores','/api/playlist-groups','/api/playlist-schedules','/api/black-mode','/api/devices','/api/full-backup'].includes(path)) {
      try {
        // Publication runs in its own bounded request to protect the Free CPU allowance.
        const pending=await context.env.DB.prepare('SELECT store FROM lv_publications WHERE revision<>published LIMIT 1').first()
        if(pending)headers.set('x-lv-publication-pending','1')
      } catch (_) { headers.set('x-lv-publication-pending','1') }
    }
    const cors = corsHeaders()
    for (const [key, value] of Object.entries(cors)) headers.set(key, value)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } catch (error) {
    return json({ok:false,error:error?.message || 'Unhandled CMS API error',endpoint:new URL(context.request.url).pathname},503)
  }
}
