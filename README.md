# LocalVision CMS

LocalVision CMS v1.5.1 입니다.

## v1.5 추가 기능
- CMS에서 이미지/영상 파일 업로드
- Cloudflare R2 저장소 업로드 API 추가
- 업로드 성공 시 D1 contents 테이블에 자동 저장
- `/api/upload` 파일 업로드
- `/api/media?key=...` R2 비공개 버킷 미디어 프록시
- R2 Public Base URL이 있으면 공개 URL 자동 생성
- 콘텐츠 관리 화면에서 파일 선택 UI 추가
- Player playlist API에서 실제 미디어 URL 반환

## Cloudflare Pages 설정
- Framework preset: Vite
- Build command: npm run build
- Build output directory: dist

## 필요한 바인딩
Cloudflare Pages 프로젝트 Settings > Bindings에 아래를 추가해야 합니다.

### D1
- Variable name: DB
- D1 database: localvision-cms-db

### R2
- Variable name: MEDIA
- R2 bucket: localvision-media-ujb 또는 안준님이 사용하는 미디어 버킷

## 선택 환경변수
Cloudflare Pages 프로젝트 Settings > Variables and Secrets에 아래를 추가할 수 있습니다.

- R2_PUBLIC_BASE = R2 공개 주소 예: https://pub-xxxxx.r2.dev

R2_PUBLIC_BASE가 없으면 `/api/media?key=...` 프록시 URL을 사용합니다.
