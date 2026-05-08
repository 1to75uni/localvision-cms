// LocalVision CMS v1.7.6-api-stable-player-centric
// 운영 방침: 첫 화면 로그인은 프론트/CMS 진입용으로만 사용합니다.
// API는 TV 앱/Player/현장 운영 안정성을 위해 서버단에서 막지 않습니다.
// 즉, /api/login은 비밀번호 확인용이고, 나머지 API는 인증 쿠키 없이도 접근 가능합니다.
export async function onRequest(context) {
  return context.next()
}
