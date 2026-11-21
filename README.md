# 우리두리사회적협동조합 문서관리시스템

협동조합 및 연계 기관·교육 현장을 위한 **통합 문서 · 계약 · 근태 · 보안 · 경영 관리 시스템** (MVP)

**라이브 데모** → https://jake12733.github.io/wooridoori-dms/

데모 계정(비밀번호 `1234`): `ceo`(대표) · `teacher1`·`teacher2`·`teacher3`·`teacher4`(선생님) · `admin1`(행정) · `former`(퇴사자, 로그인 차단)

## 주요 기능
- **권한·보안**: CEO / STAFF / RESIGNED, 폴더형 통합 문서함(인사·문서·회계·보안), 직원 반출 차단(다운로드 잠금·우클릭/복사/인쇄 차단·워터마크), 대표만 반출
- **퇴사자 통제**: 미결 문서 인수인계 점검 → 확정 즉시 로그인 차단·세션/권한 회수 → 계약서·근태·정산 기록을 대표 전용 보관 DB로 분리
- **감사 로그**: 열람 시각, 수정 버전(v1, v2…), 원클릭 발송, 승인/반려, 반출·차단, 퇴사 권한 회수 자동 기록
- **무료 웹 오피스**: 엑셀형(x-spreadsheet + SheetJS, xlsx/csv), 워드형(Quill 2, docx 가져오기·PDF 출력), 한글(rhwp WASM, HWP/HWPX), 양식 템플릿 보관함
- **원클릭 발송 · 보완 워크플로우**: 프리셋 발송, PENDING → REVISION_REQUIRED → RESUBMITTED → APPROVED(잠금), 타임라인
- **필수 서류 체크리스트**: 정규직/위촉강사 세트, 미제출·보완 대기·완료 자동 집계
- **계약서**: 근로·위촉계약서, 캔버스 전자서명, 대표 전자 직인, 잠금, D-30/14/7 만료 알림, 갱신 초안
- **근태**: 출퇴근, 근무·지각·조퇴·병가·휴가·대강, 월별 집계
- **대표 대시보드**: 매출·지출·순수익, 전 직원 근태/계약/서류 현황, 원클릭 런처

## 문서
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 아키텍처 · 폴더 구조 · 핵심 흐름 · 샘플 데이터
- [docs/schema.sql](docs/schema.sql) — PostgreSQL 스키마 · RLS · 트리거 · 퇴사 프로시저
- [docs/security-rules.md](docs/security-rules.md) — 다운로드 차단 · 감사 로그 · 퇴사자 통제 규칙
- [server/](server/) — 운영 전환용 API 레퍼런스 (Node/Express)

> MVP는 서버 없이 브라우저 저장소로 동작하는 시연판입니다. 실제 반출 차단의 최종 방어선은 서버 권한 검증이며, 운영 시 `server/` + `docs/schema.sql` 구성을 사용하세요.
