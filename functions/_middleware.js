// LocalVision CMS v1.8.9 Right Target Visibility
// 모든 /api/* 요청에서 CORS preflight와 예외 응답을 안전하게 처리합니다.
import { corsHeaders, json } from './_lib/localvision-core.js'

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  try {
    const response = await context.next()
    const headers = new Headers(response.headers)
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
