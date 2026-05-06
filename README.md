# LocalVision CMS v1.5

이 CMS는 `LocalVision TV App V8.1` 운영 구조를 기준으로 합니다.
앱은 한 번 설치한 뒤 거의 수정하지 않고, 이후 기능 업데이트는 CMS와 Player 웹 배포로 처리합니다.

- build: `LocalVision-CMS-v1.5`
- CMS 기능: 업체/콘텐츠 관리, 전체화면 공지, 오류 로그, 강제 새로고침, 스크린샷, Player URL 생성
- Player/App 연동: TV 앱은 WebView 껍데기 역할을 하고, 실제 기능은 Player와 CMS에서 관리합니다.

---

# LocalVision CMS v1.5 Auto Offline

## 핵심 수정

단말기 상태가 `online` DB 값에 고정되어 오래 켜져 보이던 문제를 수정했습니다.

- Player heartbeat가 30초마다 들어옵니다.
- 마지막 접속 시간이 3분 이상 갱신되지 않으면 CMS에서 자동으로 OFFLINE 처리합니다.
- `/api/devices`, `/api/backup`, `/api/player-config` 모두 동일한 온라인 판정 로직을 사용합니다.
- CMS 화면도 30초마다 서버 데이터를 다시 불러와 상태를 갱신합니다.

## 온라인 판정 기준

기본값: 180초

Cloudflare Pages/Workers 환경변수로 아래 값을 주면 조정할 수 있습니다.

```txt
ONLINE_TTL_SEC=180
```

## 교체할 주요 파일

- `src/App.jsx`
- `functions/api/devices.js`
- `functions/api/backup.js`
- `functions/api/player-config.js`

나머지 파일은 기존 구조 유지를 위해 함께 포함했습니다.

## vSafety-01 추가 기능

이번 빌드에는 Player 오류 보고 기능이 추가되었습니다.

- 새 API: `/api/player-errors`
- Player가 보고하는 오류코드 예시:
  - `LV-STORE-MISSING`
  - `LV-API-MISSING`
  - `LV-PLAYLIST-EMPTY`
  - `LV-MEDIA-MISSING`
  - `LV-MEDIA-PLAY-FAIL`
  - `LV-CACHE-CORRUPT`
- CMS의 단말기 상세 화면에서 TV별 Player 오류 로그를 확인할 수 있습니다.
- 오류 로그는 D1의 `player_errors` 테이블에 저장됩니다.

Cloudflare D1에 직접 마이그레이션을 적용하려면 `database/migration-v2-1-player-errors.sql` 파일을 사용하세요.

## Notice Safety01 - 전체화면 공지 기능

CMS에 업체별 `전체화면 공지` 탭을 추가했습니다.
공지 유형은 이미지, 영상, 링크, 텍스트를 지원합니다.

신규 API:
- `GET /api/notices?store=<store>`: 업체별 공지 목록
- `GET /api/notices?store=<store>&active=1`: 현재 송출 가능한 활성 공지
- `POST /api/notices`: 공지 생성/수정
- `DELETE /api/notices?id=<id>`: 공지 삭제
- `POST /api/notice-upload`: 공지 이미지/영상 R2 업로드

신규 D1 테이블:
- `notices`

배포 후 해야 할 일:
1. `database/migration-v2-2-notices.sql`을 D1에 적용합니다.
2. CMS에서 업체 선택 후 전체화면 공지를 등록합니다.
3. Player URL에 `noticePollMs=15000`이 포함되어 있는지 확인합니다.
4. TV에서 기존 70:30 화면 위로 전체화면 공지가 뜨는지 확인합니다.
