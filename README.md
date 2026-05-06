# LocalVision CMS v1.6.6 Secure MVP

## 확정 운영 도메인
- CMS/API: https://localvision-cms.pages.dev
- Player: https://localvision-player.pages.dev
- APP 기본 URL: https://buly.kr/

## Cloudflare Pages 필수 바인딩
- D1 binding name: `DB`
- R2 binding name: `MEDIA`
- 환경변수 `R2_PUBLIC_BASE`: R2 공개 URL
- 환경변수 `ONLINE_TTL_SEC`: `120` 권장
- 환경변수 `CMS_ADMIN_PASSWORD`: 운영 비밀번호
- 환경변수 `CMS_AUTH_SECRET`: 긴 임의 문자열 권장

## 중요
Cloudflare Pages 환경변수에서 `CMS_ADMIN_PASSWORD`를 직접 설정해야 로그인됩니다.

## 변경점
- 관리자 API는 서버 쿠키 인증을 통과해야 접근됩니다.
- TV heartbeat, player-config, playlist, notices GET, screenshots POST, player-errors POST는 TV 운영을 위해 공개 유지됩니다.
- 단말기 추가 화면에서 앱 선택 드롭다운을 제거하고 Android TV App v8.2 기준으로 고정했습니다.
- CMS가 생성하는 TV URL은 heartbeat 60초, commandPoll 10초 기준입니다.
- ONLINE/OFFLINE은 저장된 online 값이 아니라 last_seen 최신성 기준으로 판단합니다.


## v1.6.7 변경
- CMS 단말기 온라인/오프라인 기준 시간 표시를 `2025-05-06 오전 09시 30분 15초` 형식으로 통일했습니다.
- 마지막 접속, 최근 명령 시간, 캡처 시간 표시를 동일한 한국식 형식으로 보정합니다.
