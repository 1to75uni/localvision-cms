# LocalVision CMS v3.0.0

기존 CMS 전체 소스를 기반으로 만든 100대 목표 업데이트입니다. **APP은 수정하지 않습니다.**
Player v3.0.0과 함께 사용하며 **CMS 배포·초기 준비를 먼저** 끝내세요.

- 5분 통합 player-sync, 정상 상태는 20분 D1 저장.
- 오류 첫 장애·일시 제외·같은 파일 복구를 구분하고 반복 오류는 합산.
- 업체별 RIGHT 선정, 공지·휴무·블랙·예약·명령·기존 CMS 기능 유지.
- 원본 공유, R2 용량 예약 보호, 삭제 원장, 완전 메타데이터 백업.
- /operations.html 운영 점검: 60초 갱신, 마지막 저장 시점 표시.

## GitHub·Pages

압축을 풀어 이 폴더 안 파일 전체를 기존 CMS 저장소 루트에 반영합니다.
Pages 빌드: node build-static.js / 출력: dist.
functions 폴더는 저장소 루트에 두고 기존 DB(D1), MEDIA(R2), 도메인, 환경 설정을 유지합니다.
배포 후 CMS 로그인 → /operations.html → 처음 준비 / 게시 복구 → 게시 대기 0 확인.
그 뒤 Player를 배포합니다. Android APP 재설치나 TV 캐시 삭제는 하지 않습니다.

## 확인 자료

- DEPLOY_AND_OPERATIONS_KO.md: 실제 적용 순서와 주의점.
- TEST_REPORT.md: 이번 구현·사용량·시험·남은 위험.
- docs/FINAL_DESIGN.md: 원 설계안. 차이가 있으면 이번 TEST_REPORT의 실제 구현 기준을 확인.
- verification/current-tests.tap: CMS 자동시험 58개 통과 원문.
- tests/: Node 24에서 npm test로 재실행.

실제 Cloudflare CPU/과금량·실제 TV 시험은 아직 하지 않았습니다.
159개 전체 자동시험 통과를 현장 무장애 보증으로 해석하지 마세요.

