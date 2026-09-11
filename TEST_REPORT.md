# 자동 시험 결과 — 2026-09-11

- CMS: 37개 통과 / 0개 실패. 200대 × 24시간 상태 전송과 오류 폭주, 버전/부팅 변경으로 제한 우회 방지, 동시 하트비트 경쟁, 구형 APP PATCH 경로, D1 한도 응답, CMS degraded 응답 처리 포함.
- Player: 72개 통과 / 0개 실패. 좌우 재생 분리, 영상별 복구, 검증 캐시/저널 보존, 대기 이미지, 서비스워커, CMS 한도 시 재시도 대기와 캐시 재생 지속, 수동 로그 전송의 재시도 제한 준수 포함.
- 모의시험 쓰기: 접속 19,200 + 상세 상태 9,600 + 로그 4,800 = SQLite 변경 33,600행. 보수적 인덱스 배수 적용 추정 86,400 D1행/일. 실제 Cloudflare 과금 또는 실제 TV 부하 측정이 아닙니다.
- 실행 환경: Node 24.19.0, node:sqlite, 가상 시계/DOM/미디어 및 응답 주입. 실제 Android WebView/TV 디코더는 시험하지 않았습니다.
- 원문 결과: verification/current-tests.tap. 200대 모의시험은 CMS tests/write-guard.test.mjs에 포함됩니다.
- 재현: CMS `node --test --test-concurrency=1 tests/*.test.*`, Player `node --test --test-concurrency=1 tests/*.test.cjs`.
- 실제 계정 전체 읽기/쓰기 한도는 관리자 작업 및 다른 DB까지 합산하므로 별도 확인이 필요합니다. 200대 현장 배포 완료 또는 무장애를 주장하는 결과가 아닙니다.
