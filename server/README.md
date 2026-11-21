# 서버 레퍼런스 (운영 전환용)

우리두리사회적협동조합 문서관리시스템 MVP(정적 SPA)를 실제 서버 환경으로 옮길 때의 API 골격입니다.
핵심 보안 규칙(매 요청 세션 재검증, CEO 전용 반출 게이트, 감사 로그, 퇴사 트랜잭션)을 코드로 보여주는 레퍼런스이며, `docs/schema.sql`과 함께 사용합니다.

## 스택
- Node.js 20, Express 4, `pg`, `argon2`, `@aws-sdk/client-s3` + `s3-request-presigner` (S3 호환 스토리지: AWS S3, NCP Object Storage, MinIO, Supabase Storage)
- PostgreSQL 15 (`app`, `vault`, `audit` 스키마 + RLS)

## 실행
```bash
cd server
cp .env.example .env   # DATABASE_URL, S3_*, VAULT_KEY, SESSION_SECRET
npm install
psql "$DATABASE_URL" -f ../docs/schema.sql
npm start
```

## 구조
```
src/
├─ app.js                 # 보안 헤더, 쿠키, 라우트 등록
├─ db.js                  # 요청 단위 트랜잭션 + SET LOCAL app.user_id / app.role (RLS)
├─ middleware/
│  ├─ auth.js             # 세션 쿠키 → 해시 조회 → revoked/expired/status/RESIGNED 재검증
│  ├─ rbac.js             # requireRole('CEO')
│  └─ audit.js            # audit.logs INSERT (append-only)
├─ routes/
│  ├─ files.js            # 직원: 렌더 스트림만 / 대표: 60초 서명 URL (반출 게이트)
│  ├─ documents.js        # 버전 저장, 상태 전이, 원클릭 발송
│  └─ users.js            # 퇴사 확정 → confirm_resignation 프로시저 + 실시간 강제 로그아웃
└─ jobs/expiryAlerts.js   # 매일 07:00 D-30/D-14/D-7 만료 알림
```

## 프론트엔드 연결
MVP의 `WD.tx()`·`WD.wf.*`·`WD.sec.exportDoc()` 호출부를 아래 REST 엔드포인트 호출로 바꾸면 됩니다.

| MVP 함수 | API |
|---|---|
| `WD.auth.login` | `POST /auth/login` |
| `WD.wf.saveVersion` | `POST /documents/:id/versions` |
| `WD.wf.transition` | `POST /documents/:id/transition` |
| `WD.wf.dispatch` | `POST /documents/:id/dispatch` |
| `WD.sec.exportDoc` | `GET /files/:id/download` (CEO만 200) |
| 퇴사 위저드 확정 | `POST /users/:id/resign` |
