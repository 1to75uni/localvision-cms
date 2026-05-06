# LocalVision CMS v1.6 · store 기준 하트비트

이 CMS는 LocalVision Player v1.6 / APP v8.2 운영 구조를 기준으로 합니다.

## 핵심 변경사항

1. deviceId 의존 제거
   - TV 설치용 URL에는 `deviceId`를 붙이지 않습니다.
   - 상태, 하트비트, 오류 로그, 스크린샷 조회는 `store` 기준으로 동작합니다.

2. 하트비트 기준 변경
   - Player URL 기본값: `heartbeat=180000` = 3분
   - CMS ONLINE 판정 기본값: 마지막 접속 10분 이내
   - Cloudflare 환경변수로 조정 가능: `ONLINE_TTL_SEC=600`

3. 자동 등록/업데이트
   - `/api/devices` PATCH 요청이 `store`만 가지고 와도 해당 매장의 TV 상태를 업데이트합니다.
   - DB에 단말기가 없으면 `store_<store>` 형태로 자동 등록합니다.

4. 버전
   - CMS: `v1.6`
   - Player 연동 기준: `v1.6`
   - APP 연동 기준: `v8.2`

## 배포

Cloudflare Pages에 이 폴더를 그대로 업로드/배포하면 됩니다.
D1 바인딩 이름은 `DB`, R2 바인딩 이름은 `MEDIA` 기준입니다.

## 주요 API

- `/api/backup`
- `/api/devices`
- `/api/player-config?store=palpal`
- `/api/screenshots?store=palpal`
- `/api/player-errors?store=palpal`
- `/api/notices?active=1&store=palpal`
