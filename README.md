# LocalVision CMS

LocalVision CMS v1.4 입니다.

## v1.4 추가 기능
- Player가 읽을 수 있는 playlist API 추가
- `/api/playlist?store=goobne&side=left`
- `/api/playlist?store=goobne&side=right`
- `/api/player-config?store=goobne`
- CMS 플레이리스트 화면에서 API 링크 복사/열기 기능
- 현재 선택 업체 기준 Player 연동 상태 확인
- 좌측 70% / 우측 30% API를 분리해 TV Player가 바로 읽을 수 있는 구조 준비

## Cloudflare Pages 설정
- Framework preset: Vite
- Build command: npm run build
- Build output directory: dist

## D1 바인딩 설정
Cloudflare Pages 프로젝트 설정에서 D1 바인딩이 필요합니다.

- Variable name: DB
- D1 database: localvision-cms-db

## 현재 단계
CMS 데이터가 D1에 저장되고, Player가 읽을 수 있는 playlist API가 생성됩니다.
다음 단계는 Cloudflare R2 업로드 기능입니다.
