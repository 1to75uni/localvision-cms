# LocalVision APP lv001 구조 적용 가이드

이번 ZIP에는 Android TV APP 소스가 포함되어 있지 않아서 APK 자체는 수정하지 않았습니다. APP 쪽에는 아래 구조를 반영하면 됩니다.

## APP 저장값

```text
appId = lv001
configApi = https://localvision-cms.pages.dev/api/app-config
```

## APP 실행 흐름

```text
1. 앱 실행
2. SharedPreferences에 저장된 appId 확인: lv001
3. GET https://localvision-cms.pages.dev/api/app-config?id=lv001 요청
4. 응답의 playerUrl 추출
5. WebView.loadUrl(playerUrl)
6. 5분마다 app-config 재확인
7. 현재 WebView URL과 playerUrl이 다르면 WebView.loadUrl(playerUrl)
8. CMS 연결 실패 시 마지막 정상 playerUrl 유지
```

## app-config 응답 예시

```json
{
  "ok": true,
  "id": "lv001",
  "appId": "lv001",
  "store": "banzzak",
  "storeName": "반짝이는 바다",
  "active": true,
  "playerUrl": "https://localvision-player.pages.dev/?store=banzzak&id=lv001&apiBase=https%3A%2F%2Flocalvision-cms.pages.dev&heartbeat=300000&commandPoll=300000&noticePollMs=60000&cacheMax=20",
  "defaults": {
    "heartbeat": 300000,
    "commandPoll": 300000,
    "noticePollMs": 60000,
    "onlineTtlSec": 600,
    "d1HeartbeatWriteSec": 600,
    "defaultDurationSec": 20
  }
}
```

## 임시 운영 대안

APP 수정 전에는 앱 기본 URL 또는 buly.kr 목적지를 아래 형태로 잡아도 됩니다.

```text
https://localvision-cms.pages.dev/boot.html?id=lv001
```

이 페이지가 CMS의 app-config를 조회한 뒤 최신 Player URL로 이동합니다.
