# LocalVision CMS v1.9

## v1.9 핵심 수정
- TV 설치용 URL 기본 주소를 새 Player로 변경
- 기본 TV 화면 주소: https://localvision-player.pages.dev
- 기본 API 주소: https://localvision-cms.pages.dev
- 기존 테스트 Player 주소가 localStorage에 남아 있어도 자동 보정
- 업체 관리 / 대시보드 / 단말기 상세의 TV 설치용 URL 복사 버튼이 새 Player 기준으로 생성됨

## 최종 TV URL 예시
https://localvision-player.pages.dev/?store=goobne&apiBase=https://localvision-cms.pages.dev&restart=09:30&restartMode=reload&restartJitterSec=0&cacheMax=20

## 단말기 연결 URL 예시
https://localvision-player.pages.dev/?store=goobne&deviceId=dv_001&apiBase=https://localvision-cms.pages.dev&restart=09:30&restartMode=reload&restartJitterSec=0&cacheMax=20

## 필요한 바인딩
- D1: DB
- R2: MEDIA

## 선택 환경변수
- R2_PUBLIC_BASE
