# LocalVision CMS

LocalVision CMS v1.3 입니다.

## v1.3 추가 기능
- Cloudflare Pages Functions API 추가
- Cloudflare D1 DB 연결 준비
- `/api/health` 서버 상태 확인
- `/api/backup` 전체 데이터 조회
- `/api/stores` 업체 목록/생성/삭제
- `/api/contents` 콘텐츠 목록/생성/삭제
- `/api/devices` 단말기 목록/생성/상태/명령 업데이트
- CMS에서 API 연결 성공 시 D1 서버 데이터 불러오기
- API 연결 실패 시 기존 localStorage 저장 방식 유지

## Cloudflare Pages 설정
- Framework preset: Vite
- Build command: npm run build
- Build output directory: dist

## D1 바인딩 설정
Cloudflare Pages 프로젝트 설정에서 D1 바인딩을 추가해야 합니다.

- Variable name: DB
- D1 database: localvision-cms-db

## DB 스키마
`database/schema.sql` 내용을 Cloudflare D1 SQL Console에 붙여넣고 실행하세요.
