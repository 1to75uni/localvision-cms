# LocalVision CMS v1.6.4 Static Upload

이 버전은 GitHub에 업로드하면 Cloudflare Pages에서 Vite 설치 없이 배포되도록 만든 정적 빌드 포함 버전입니다.

## Cloudflare Pages 권장 설정

- Build command: `npm run build` 또는 비워둠
- Build output directory: `dist`
- Node version: `20`

## 바인딩

- D1: `DB` → `localvision-cms-db`
- R2: `MEDIA` → `localvision-media-prod`

## 환경변수

- `R2_PUBLIC_BASE` = R2 공개 URL
- `ONLINE_TTL_SEC` = `600`

## 배포 후 확인

- `/api/health`
- `/api/repair`
