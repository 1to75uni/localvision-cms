# LocalVision CMS

LocalVision CMS v1.2 입니다.

## v1.2 추가 기능
- 단말기 상태 화면에서 TV/업체 클릭 시 상세 관제 패널 표시
- 선택 단말기의 업체 정보 확인
- 선택 업체의 좌측 70% 콘텐츠 확인
- 공통 우측 30% 콘텐츠 확인
- 70:30 현재 화면 미리보기
- Player URL 복사 / 열기
- TV 새로고침 요청 버튼 UI
- 현재화면 스크린샷 다운로드 기능
  - 현재 단계에서는 CMS 미리보기 화면을 PNG로 다운로드합니다.
  - 실제 TV 화면 캡처는 다음 단계에서 Player/Android TV 앱과 Worker/R2 연동이 필요합니다.

## Cloudflare Pages 설정
- Framework preset: Vite
- Build command: npm run build
- Build output directory: dist

## 현재 단계
브라우저 localStorage에 저장하는 프론트 MVP입니다.
다음 단계에서 Cloudflare Worker API, D1 DB, R2 저장소와 연결합니다.
