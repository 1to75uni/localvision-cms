# LocalVision CMS v2.3

## v2.3 핵심

TV 설치용 URL에 Player v1.4.1의 API 미디어 캐시 옵션을 자동 포함합니다.

## 자동 포함 옵션

- refresh=3600000
- heartbeat=30000
- bundleMode=cache
- cacheAll=1
- videoMode=cache
- cacheVia=api
- activateWhenCached=1
- cacheMax=60
- fit=cover

## 왜 필요한가

R2 public URL은 화면 표시에는 문제가 없어도, Player가 `fetch()`로 다운로드해서 캐시에 넣을 때 CORS로 실패할 수 있습니다.
그래서 Player가 CMS의 `/api/media?key=...`를 통해 미디어를 받아 캐시하도록 변경했습니다.
