# LocalVision CMS v1.7.4 LV-ID Integrated CMS

- CMS 메인 화면 안에서 업체별 `lv001` APP ID 등록/확인/수정 가능
- `/api/app-config?id=lv001`로 APP이 최신 Player URL을 받아갈 수 있음
- `/boot.html?id=lv001` 임시 부팅 URL 지원
- Player URL 변경은 CMS에서 처리
- 운영값: heartbeat=300000, commandPoll=300000, noticePollMs=60000, 기본 재생시간 20초

# LocalVision CMS v1.7.4 LV-ID App Config

## 핵심 구조

```text
APP = lv001 같은 업체 ID만 저장하는 껍데기
CMS = lv001별 최신 Player URL을 관리하는 커맨드센터
Player = CMS가 내려준 URL로 실행되는 실제 재생기
```

## 이번 버전 반영사항

- 업체 ID를 `lv001`, `lv002`, `lv003` 방식으로 관리합니다.
- `/api/app-config?id=lv001` 엔드포인트를 추가했습니다.
- CMS stores 테이블에 `app_id`, `player_url`, `player_url_updated_at` 컬럼을 추가했습니다.
- `/lv-id-url-manager.html` 관리 화면을 추가했습니다.
- `/boot.html?id=lv001` 부팅/런처 페이지를 추가했습니다.
- 기본 운영값은 `heartbeat=300000`, `commandPoll=300000`, `noticePollMs=60000`입니다.
- ONLINE 기준은 마지막 heartbeat 10분 이내입니다. `ONLINE_TTL_SEC=600` 권장.
- 콘텐츠 기본 재생시간은 20초입니다.
- heartbeat PATCH의 D1 기록을 10분마다 또는 상태 변경 시만 수행하도록 throttle을 추가했습니다.

## Cloudflare Pages 필수 바인딩

- D1 binding name: `DB`
- R2 binding name: `MEDIA`
- 환경변수 `R2_PUBLIC_BASE`: R2 공개 URL
- 환경변수 `PLAYER_BASE`: Player Pages URL, 예: `https://localvision-player.pages.dev`
- 환경변수 `ONLINE_TTL_SEC`: `600` 권장
- 환경변수 `D1_HEARTBEAT_WRITE_SEC`: `600` 권장
- 환경변수 `CMS_ADMIN_PASSWORD`: 운영 비밀번호
- 환경변수 `CMS_AUTH_SECRET`: 긴 임의 문자열 권장

## 확인 URL

```text
/api/health
/api/stores
/api/app-config?id=lv001
/lv-id-url-manager.html
/boot.html?id=lv001
```

## APP 연동

APP에는 `APP_LV001_IMPLEMENTATION_GUIDE.md` 내용을 반영하면 됩니다. APP 소스는 이번 업로드 파일에 포함되어 있지 않아 APK 자체는 수정하지 않았습니다.
