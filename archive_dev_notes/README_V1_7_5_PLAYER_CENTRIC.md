# LocalVision CMS v1.7.6 Player-Centric

역할 분리:
- APP: Player URL을 실행하는 Android TV Minimal Shell
- Player: 재생/공지/명령/상태/오류복구 담당
- CMS: 관리/업로드/모니터링 담당

주요 API:
- GET /api/app-config?id=lv001
- GET /api/player-state?store=...&id=lv001
- POST /api/player-state
- POST /api/screenshots

기존 API(/api/devices, /api/player-config, /api/screenshots)는 하위호환을 위해 유지합니다.
