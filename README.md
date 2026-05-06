# LocalVision CMS v1.6 · Store Heartbeat Final

이 CMS는 `LocalVision Player v1.6` / `LocalVision APP v8.2-store-based-final`과 함께 사용하는 실전 배포 기준 파일입니다.

## v1.6 핵심 기준

- 운영 기준: `store`
- TV 설치 URL에는 `deviceId`를 붙이지 않습니다.
- Player heartbeat 기본값: `180000ms` = 3분
- APP heartbeat 기본값: `180000ms` = 3분
- CMS ONLINE 판정 기본값: `600초` = 마지막 접속 10분 이내
- `/api/devices` PATCH는 `store`만 있어도 업데이트됩니다.
- 해당 store의 device row가 없으면 `tv_<store>` 형식으로 자동 생성됩니다.
- 스크린샷 조회와 Player 오류 로그 조회는 store 기준을 우선합니다.
- 첫 화면 관리자 비밀번호: `0213`

## Cloudflare 환경변수

```txt
ONLINE_TTL_SEC=600
R2_PUBLIC_BASE=https://pub-xxxx.r2.dev
```

## 주요 API

- `GET /api/health` → version `v1.6`
- `GET /api/player-config?store=<store>` → version `v1.6-store-heartbeat`
- `PATCH /api/devices` → `{ store, online, lastSeen, app }` 또는 `{ store, lastCommand, commandAt }`
- `GET /api/screenshots?store=<store>`
- `GET /api/player-errors?store=<store>`

## 배포 주의

이미 운영 중인 D1/R2는 삭제하지 마세요.
`schema.sql` 전체 재실행도 권장하지 않습니다. 필요한 migration만 개별 적용하세요.

GitHub 저장소 루트에는 아래 파일/폴더가 바로 보여야 합니다.

```txt
index.html
package.json
vite.config.js
src/
functions/
database/
```

ZIP 파일 자체를 GitHub에 올리면 Cloudflare Pages가 빌드하지 못합니다. 압축을 풀고 내부 파일들을 저장소 루트에 올리세요.
