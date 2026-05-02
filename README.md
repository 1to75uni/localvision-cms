# LocalVision CMS v2.4 Auto Offline

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
