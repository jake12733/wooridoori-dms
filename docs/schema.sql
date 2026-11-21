-- =============================================================================
-- 우리두리사회적협동조합 문서관리시스템 — PostgreSQL 15+ 스키마 (운영용)
-- -----------------------------------------------------------------------------
-- 스키마 분리
--   app   : 일반 업무 데이터 (직원 열람 영역, RLS 적용)
--   vault : 대표 전용 법정 보관 DB (퇴사자 계약서·근태·정산) — 별도 롤만 접근
--   audit : 감사 로그 (append-only, 해시 체인)
-- 롤
--   wd_api     : API 서버 접속 롤 (RLS 대상, BYPASSRLS 없음)
--   wd_vault   : 보관 DB 전용 롤 (대표 세션 요청에서만 SET ROLE)
--   wd_auditor : 감사 로그 SELECT 전용 (대표 조회 화면)
-- 요청마다 API가 `SET LOCAL app.user_id = '<uuid>'; SET LOCAL app.role = 'CEO|STAFF';`
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS audit;

-- ---------- 열거형 ----------
CREATE TYPE app.user_role     AS ENUM ('CEO', 'STAFF', 'RESIGNED');
CREATE TYPE app.user_status   AS ENUM ('ACTIVE', 'RESIGNED', 'SUSPENDED');
CREATE TYPE app.emp_type      AS ENUM ('정규직', '위촉강사', '계약직', '프리랜서');
CREATE TYPE app.folder_access AS ENUM ('none', 'view', 'edit');
CREATE TYPE app.doc_kind      AS ENUM ('sheet', 'doc', 'hwp', 'file');
CREATE TYPE app.doc_status    AS ENUM ('DRAFT', 'PENDING', 'REVISION_REQUIRED', 'RESUBMITTED', 'APPROVED');
CREATE TYPE app.contract_kind AS ENUM ('근로', '위촉');
CREATE TYPE app.contract_status AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'SEALED', 'VOID');
CREATE TYPE app.attend_status AS ENUM ('근무', '지각', '조퇴', '병가', '휴가', '대강');
CREATE TYPE app.dispatch_action AS ENUM ('SUBMIT_CEO', 'REQUEST_USER', 'SAVE_FOLDER', 'BROADCAST', 'DEPT', 'CUSTOM');

-- ---------- 헬퍼: 현재 요청 사용자 ----------
CREATE OR REPLACE FUNCTION app.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app.is_ceo() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('app.role', true) = 'CEO' $$;

-- ---------- 사용자 / 세션 ----------
CREATE TABLE app.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id      text UNIQUE NOT NULL,
  password_hash text NOT NULL,                        -- argon2id
  totp_secret   bytea,                                -- 2단계 인증 (pgp_sym_encrypt)
  name          text NOT NULL,
  role          app.user_role NOT NULL DEFAULT 'STAFF',
  status        app.user_status NOT NULL DEFAULT 'ACTIVE',
  emp_type      app.emp_type NOT NULL,
  dept          text NOT NULL,
  title         text,
  phone         text,
  work_start    time DEFAULT '09:00', work_end time DEFAULT '18:00',
  joined_at     date NOT NULL,
  resigned_at   timestamptz,
  resign_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resigned_consistency CHECK ((role = 'RESIGNED') = (status = 'RESIGNED'))
);

CREATE TABLE app.sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app.users(id),
  token_hash    bytea NOT NULL UNIQUE,                -- 쿠키 토큰의 SHA-256 (원문 저장 금지)
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  revoked_reason text,                                -- LOGOUT | RESIGNED | ADMIN | EXPIRED
  ip inet, user_agent text
);
CREATE INDEX ON app.sessions (user_id) WHERE revoked_at IS NULL;

-- ---------- 폴더 / 권한 ----------
CREATE TABLE app.folders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     uuid REFERENCES app.folders(id),
  name          text NOT NULL,                        -- 인사 / 문서 / 회계 / 보안 및 하위
  staff_access  app.folder_access NOT NULL DEFAULT 'none',
  legal_hold    boolean NOT NULL DEFAULT false,       -- 법정 보관 대상 폴더
  sort_order    int DEFAULT 0
);
-- 개인/부서 단위 예외 권한 (선택)
CREATE TABLE app.folder_grants (
  folder_id uuid REFERENCES app.folders(id) ON DELETE CASCADE,
  user_id   uuid REFERENCES app.users(id) ON DELETE CASCADE,
  access    app.folder_access NOT NULL,
  PRIMARY KEY (folder_id, user_id)
);

-- ---------- 문서 / 버전 ----------
CREATE TABLE app.documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id     uuid NOT NULL REFERENCES app.folders(id),
  title         text NOT NULL,
  kind          app.doc_kind NOT NULL,
  owner_id      uuid NOT NULL REFERENCES app.users(id),
  assignee_id   uuid REFERENCES app.users(id),
  status        app.doc_status NOT NULL DEFAULT 'DRAFT',
  current_version int NOT NULL DEFAULT 1,
  revision_at_version int,                            -- 보완 요청 당시 버전 (재제출 검증)
  locked        boolean NOT NULL DEFAULT false,
  locked_at     timestamptz, approved_by uuid REFERENCES app.users(id),
  legal_hold    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approved_is_locked CHECK (status <> 'APPROVED' OR locked)
);
CREATE INDEX ON app.documents (folder_id, updated_at DESC);
CREATE INDEX ON app.documents (owner_id); CREATE INDEX ON app.documents (status);

CREATE TABLE app.document_recipients (                -- 원클릭 발송으로 공유된 대상 (열람 권한)
  document_id uuid REFERENCES app.documents(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES app.users(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);

CREATE TABLE app.document_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES app.documents(id) ON DELETE CASCADE,
  version       int NOT NULL,                         -- v1, v2 …
  author_id     uuid NOT NULL REFERENCES app.users(id),
  note          text,
  content_json  jsonb,                                -- sheet: 셀 데이터 / doc: {html}
  storage_key   text,                                 -- hwp/file: 비공개 버킷 객체 키
  sha256        bytea,                                -- 무결성
  size_bytes    bigint,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

-- 승인·잠금 문서는 새 버전 추가 금지
CREATE OR REPLACE FUNCTION app.block_locked_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT locked FROM app.documents WHERE id = NEW.document_id) THEN
    RAISE EXCEPTION '승인·잠금된 문서는 수정할 수 없습니다';
  END IF;
  UPDATE app.documents SET current_version = NEW.version, updated_at = now() WHERE id = NEW.document_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_block_locked BEFORE INSERT ON app.document_versions FOR EACH ROW EXECUTE FUNCTION app.block_locked_version();

-- ---------- 워크플로우 (보완 이력) ----------
CREATE TABLE app.workflow_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES app.documents(id) ON DELETE CASCADE,
  from_status app.doc_status NOT NULL,
  to_status   app.doc_status NOT NULL,
  actor_id    uuid NOT NULL REFERENCES app.users(id),
  reason      text,                                   -- 보완 요청(반려) 사유
  version     int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reason_required CHECK (to_status <> 'REVISION_REQUIRED' OR coalesce(length(trim(reason)), 0) > 0)
);

-- 허용 전이 검증 (서버 로직과 동일한 규칙)
CREATE OR REPLACE FUNCTION app.check_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok boolean; d app.documents%ROWTYPE;
BEGIN
  SELECT * INTO d FROM app.documents WHERE id = NEW.document_id FOR UPDATE;
  ok := (NEW.from_status, NEW.to_status) IN (
    ('DRAFT','PENDING'), ('PENDING','REVISION_REQUIRED'), ('PENDING','APPROVED'),
    ('REVISION_REQUIRED','RESUBMITTED'), ('RESUBMITTED','REVISION_REQUIRED'), ('RESUBMITTED','APPROVED'), ('DRAFT','APPROVED'));
  IF NOT ok OR d.status <> NEW.from_status THEN RAISE EXCEPTION '허용되지 않은 상태 전이: % → %', NEW.from_status, NEW.to_status; END IF;
  IF NEW.to_status IN ('REVISION_REQUIRED','APPROVED') AND NOT app.is_ceo() THEN RAISE EXCEPTION '대표만 승인/보완 요청할 수 있습니다'; END IF;
  IF NEW.to_status = 'RESUBMITTED' AND d.current_version <= coalesce(d.revision_at_version, 0) THEN RAISE EXCEPTION '보완 요청 이후 수정된 버전이 없습니다'; END IF;
  UPDATE app.documents SET status = NEW.to_status,
         revision_at_version = CASE WHEN NEW.to_status = 'REVISION_REQUIRED' THEN d.current_version ELSE revision_at_version END,
         locked = (NEW.to_status = 'APPROVED') OR locked,
         locked_at = CASE WHEN NEW.to_status = 'APPROVED' THEN now() ELSE locked_at END,
         approved_by = CASE WHEN NEW.to_status = 'APPROVED' THEN NEW.actor_id ELSE approved_by END,
         updated_at = now()
   WHERE id = NEW.document_id;
  NEW.version := d.current_version;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_check_transition BEFORE INSERT ON app.workflow_events FOR EACH ROW EXECUTE FUNCTION app.check_transition();

-- ---------- 원클릭 발송 / 알림 ----------
CREATE TABLE app.dispatch_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, action app.dispatch_action NOT NULL,
  target_user_id uuid REFERENCES app.users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES app.folders(id), dept text,
  created_by uuid REFERENCES app.users(id), created_at timestamptz DEFAULT now()
);
CREATE TABLE app.dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES app.documents(id) ON DELETE CASCADE,
  preset_name text NOT NULL, action app.dispatch_action NOT NULL,
  target_user_ids uuid[] NOT NULL DEFAULT '{}', folder_id uuid REFERENCES app.folders(id),
  message text, version int NOT NULL,
  sender_id uuid NOT NULL REFERENCES app.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  type text NOT NULL,                                  -- APPROVAL | REVISION | SIGN | APPROVED | EXPIRY | INFO
  title text NOT NULL, body text, link text, document_id uuid,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON app.notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- ---------- 템플릿 ----------
CREATE TABLE app.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,                              -- 보고서 / 출석부 / 안내문 / 확인서 / 회계 / 계약서
  title text NOT NULL, kind app.doc_kind NOT NULL,
  content_json jsonb, storage_key text,
  owner_id uuid REFERENCES app.users(id), created_at timestamptz DEFAULT now()
);

-- ---------- 필수 서류 체크리스트 ----------
CREATE TABLE app.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_type app.emp_type NOT NULL,
  code text NOT NULL, name text NOT NULL,
  source text,                                         -- 'contract' 이면 계약서 관리와 연동
  has_expiry boolean NOT NULL DEFAULT false,
  sort_order int DEFAULT 0,
  UNIQUE (emp_type, code)
);
CREATE TABLE app.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id),
  item_code text NOT NULL,
  document_id uuid REFERENCES app.documents(id),
  expires_at date,
  created_at timestamptz DEFAULT now()
);
-- 집계 뷰: 미제출 / 검토 중 / 보완 대기 / 완료
CREATE VIEW app.v_checklist_status AS
SELECT u.id AS user_id, u.name, ci.code, ci.name AS item_name,
       CASE WHEN s.id IS NULL THEN 'MISSING'
            WHEN s.expires_at < current_date THEN 'EXPIRED'
            WHEN d.status = 'APPROVED' THEN 'DONE'
            WHEN d.status = 'REVISION_REQUIRED' THEN 'REVISION'
            WHEN d.status IN ('PENDING','RESUBMITTED') THEN 'REVIEW'
            ELSE 'MISSING' END AS state,
       s.expires_at
FROM app.users u
JOIN app.checklist_items ci ON ci.emp_type = u.emp_type AND ci.source IS NULL
LEFT JOIN LATERAL (SELECT * FROM app.submissions s WHERE s.user_id = u.id AND s.item_code = ci.code ORDER BY created_at DESC LIMIT 1) s ON true
LEFT JOIN app.documents d ON d.id = s.document_id
WHERE u.status = 'ACTIVE' AND u.role = 'STAFF';

-- ---------- 계약서 ----------
CREATE TABLE app.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind app.contract_kind NOT NULL,
  user_id uuid NOT NULL REFERENCES app.users(id),
  title text NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL CHECK (end_date > start_date),
  place text, duties text, work_days text, work_hours text,
  pay_type text, pay_amount numeric(12,0), pay_day text,
  status app.contract_status NOT NULL DEFAULT 'DRAFT',
  employee_sign_png bytea, employee_signed_at timestamptz, sign_ip inet,
  sealed_at timestamptz, sealed_by uuid REFERENCES app.users(id),
  locked boolean NOT NULL DEFAULT false,
  pdf_storage_key text, pdf_sha256 bytea,             -- 날인 완료본 PDF (무결성 해시)
  renewed_from uuid REFERENCES app.contracts(id),
  folder_id uuid REFERENCES app.folders(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT sealed_locked CHECK (status <> 'SEALED' OR (locked AND employee_signed_at IS NOT NULL AND sealed_at IS NOT NULL))
);
CREATE INDEX ON app.contracts (end_date) WHERE status = 'SEALED';
-- 만료 알림 발송 기록 (D-30/D-14/D-7 중복 방지)
CREATE TABLE app.expiry_alerts_sent (ref_type text, ref_id uuid, bucket text, sent_at timestamptz DEFAULT now(), PRIMARY KEY (ref_type, ref_id, bucket));
CREATE VIEW app.v_expiring AS
SELECT 'contract' AS ref_type, c.id AS ref_id, c.user_id, c.title, c.end_date,
       (c.end_date - current_date) AS days_left,
       CASE WHEN c.end_date - current_date <= 7 THEN 'D-7' WHEN c.end_date - current_date <= 14 THEN 'D-14' ELSE 'D-30' END AS bucket
FROM app.contracts c WHERE c.status = 'SEALED' AND c.end_date - current_date BETWEEN 0 AND 30
UNION ALL
SELECT 'submission', s.id, s.user_id, ci.name, s.expires_at, (s.expires_at - current_date),
       CASE WHEN s.expires_at - current_date <= 7 THEN 'D-7' WHEN s.expires_at - current_date <= 14 THEN 'D-14' ELSE 'D-30' END
FROM app.submissions s JOIN app.users u ON u.id = s.user_id JOIN app.checklist_items ci ON ci.code = s.item_code AND ci.emp_type = u.emp_type
WHERE s.expires_at - current_date BETWEEN 0 AND 30;

-- ---------- 근태 ----------
CREATE TABLE app.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id),
  work_date date NOT NULL,
  clock_in time, clock_out time,
  status app.attend_status NOT NULL,
  substitute_for uuid REFERENCES app.users(id),       -- 대강: 누구 수업을 대신했는지
  note text,
  updated_by uuid REFERENCES app.users(id), updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, work_date)
);
CREATE VIEW app.v_attendance_monthly AS
SELECT user_id, date_trunc('month', work_date)::date AS month,
       count(*) FILTER (WHERE status = '근무') AS 근무, count(*) FILTER (WHERE status = '지각') AS 지각,
       count(*) FILTER (WHERE status = '조퇴') AS 조퇴, count(*) FILTER (WHERE status = '병가') AS 병가,
       count(*) FILTER (WHERE status = '휴가') AS 휴가, count(*) FILTER (WHERE status = '대강') AS 대강,
       round(sum(extract(epoch FROM (clock_out - clock_in)) / 3600.0)::numeric, 1) AS hours
FROM app.attendance GROUP BY 1, 2;

-- ---------- 경영 (대표 전용) ----------
CREATE TABLE app.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL, type text NOT NULL CHECK (type IN ('매출','지출')),
  category text NOT NULL, amount numeric(14,0) NOT NULL CHECK (amount >= 0), memo text,
  created_by uuid REFERENCES app.users(id), created_at timestamptz DEFAULT now()
);
CREATE TABLE app.launchers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, url text NOT NULL CHECK (url ~ '^https?://'), category text, color text, sort_order int DEFAULT 0);

-- =============================================================================
-- 대표 전용 법정 보관 DB (vault 스키마) — 일반 영역과 물리적으로 분리
-- =============================================================================
CREATE TABLE vault.records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                               -- FK 없음: 원본 사용자 삭제와 무관하게 보존
  user_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('contract','attendance','document')),
  title text NOT NULL,
  payload_enc bytea NOT NULL,                          -- pgp_sym_encrypt(jsonb::text, vault_key)
  storage_keys text[] DEFAULT '{}',                    -- 원본 파일은 vault 전용 버킷으로 복사
  retain_until date NOT NULL,                          -- 보존 기한 (계약·근태 3년, 회계 5년)
  legal_basis text NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now(),
  moved_by uuid NOT NULL,
  destroyed_at timestamptz                             -- 보존 기한 경과 후 파기 처리
);
REVOKE ALL ON SCHEMA vault FROM PUBLIC, wd_api;
GRANT USAGE ON SCHEMA vault TO wd_vault;
GRANT SELECT, INSERT ON vault.records TO wd_vault;     -- UPDATE는 destroyed_at 전용 함수로만

-- =============================================================================
-- 감사 로그 (append-only + 해시 체인)
-- =============================================================================
CREATE TABLE audit.logs (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  user_id uuid, user_name text, role text,
  action text NOT NULL,                                -- DOC_VIEW, DOC_EDIT, DISPATCH, WF_APPROVE, WF_REVISION, DOWNLOAD_DENIED, RESIGN_CONFIRM, SESSION_REVOKE, VAULT_MOVE …
  target_type text, target_id text, target_name text,
  detail text, ip inet, user_agent text,
  prev_hash bytea, row_hash bytea NOT NULL
);
CREATE INDEX ON audit.logs (at DESC); CREATE INDEX ON audit.logs (user_id, at DESC); CREATE INDEX ON audit.logs (action, at DESC);

CREATE OR REPLACE FUNCTION audit.chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT row_hash INTO NEW.prev_hash FROM audit.logs ORDER BY id DESC LIMIT 1;
  NEW.row_hash := digest(coalesce(encode(NEW.prev_hash,'hex'),'') || NEW.at::text || coalesce(NEW.user_id::text,'') || NEW.action || coalesce(NEW.target_id,'') || coalesce(NEW.detail,''), 'sha256');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_chain BEFORE INSERT ON audit.logs FOR EACH ROW EXECUTE FUNCTION audit.chain();
CREATE OR REPLACE FUNCTION audit.deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '감사 로그는 수정·삭제할 수 없습니다'; END $$;
CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON audit.logs FOR EACH ROW EXECUTE FUNCTION audit.deny_mutation();
REVOKE ALL ON audit.logs FROM PUBLIC;
GRANT INSERT ON audit.logs TO wd_api; GRANT USAGE ON SEQUENCE audit.logs_id_seq TO wd_api;
GRANT SELECT ON audit.logs TO wd_auditor;

-- =============================================================================
-- Row Level Security (직원 열람 범위)
-- =============================================================================
ALTER TABLE app.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.finance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;

-- 활성 사용자만 (퇴사자는 어떤 행도 볼 수 없음)
CREATE OR REPLACE FUNCTION app.active() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM app.users WHERE id = app.uid() AND status = 'ACTIVE' AND role <> 'RESIGNED') $$;

CREATE OR REPLACE FUNCTION app.doc_access(d app.documents) RETURNS app.folder_access LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN NOT app.active() THEN 'none'::app.folder_access
    WHEN app.is_ceo() THEN (CASE WHEN d.locked THEN 'view' ELSE 'edit' END)::app.folder_access
    WHEN d.owner_id = app.uid() OR d.assignee_id = app.uid() THEN (CASE WHEN d.locked THEN 'view' ELSE 'edit' END)::app.folder_access
    ELSE greatest(
      coalesce((SELECT access FROM app.folder_grants g WHERE g.folder_id = d.folder_id AND g.user_id = app.uid()), (SELECT staff_access FROM app.folders f WHERE f.id = d.folder_id)),
      CASE WHEN EXISTS (SELECT 1 FROM app.document_recipients r WHERE r.document_id = d.id AND r.user_id = app.uid()) THEN 'view'::app.folder_access ELSE 'none'::app.folder_access END)
  END $$;

CREATE POLICY doc_select ON app.documents FOR SELECT USING (app.doc_access(documents) <> 'none');
CREATE POLICY doc_update ON app.documents FOR UPDATE USING (app.doc_access(documents) = 'edit');
CREATE POLICY doc_insert ON app.documents FOR INSERT WITH CHECK (app.active() AND owner_id = app.uid());
CREATE POLICY ver_select ON app.document_versions FOR SELECT USING (EXISTS (SELECT 1 FROM app.documents d WHERE d.id = document_id));
CREATE POLICY ver_insert ON app.document_versions FOR INSERT WITH CHECK (author_id = app.uid() AND EXISTS (SELECT 1 FROM app.documents d WHERE d.id = document_id AND app.doc_access(d) = 'edit'));
CREATE POLICY contract_select ON app.contracts FOR SELECT USING (app.active() AND (app.is_ceo() OR user_id = app.uid()));
CREATE POLICY contract_ceo ON app.contracts FOR ALL USING (app.active() AND app.is_ceo());
CREATE POLICY attend_select ON app.attendance FOR SELECT USING (app.active() AND (app.is_ceo() OR user_id = app.uid()));
CREATE POLICY attend_self ON app.attendance FOR INSERT WITH CHECK (app.active() AND user_id = app.uid());
CREATE POLICY attend_ceo ON app.attendance FOR ALL USING (app.active() AND app.is_ceo());
CREATE POLICY finance_ceo ON app.finance_entries FOR ALL USING (app.active() AND app.is_ceo());
CREATE POLICY ntf_self ON app.notifications FOR ALL USING (user_id = app.uid());

-- =============================================================================
-- 퇴사 확정 프로시저 (단일 트랜잭션)
-- =============================================================================
CREATE OR REPLACE PROCEDURE app.confirm_resignation(p_user uuid, p_date date, p_reason text, p_vault_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, vault, audit, public AS $$
DECLARE n_sessions int; n_open int;
BEGIN
  IF NOT app.is_ceo() THEN RAISE EXCEPTION '대표만 퇴사 처리할 수 있습니다'; END IF;
  -- 1) 미결 문서가 남아 있으면 거부 (인수인계 선행 필수)
  SELECT count(*) INTO n_open FROM app.documents
   WHERE (owner_id = p_user OR assignee_id = p_user) AND status <> 'APPROVED'
     AND folder_id NOT IN (SELECT id FROM app.folders WHERE name = '인사기록·제출서류');
  IF n_open > 0 THEN RAISE EXCEPTION '인계되지 않은 미결 문서 %건이 있습니다', n_open; END IF;
  -- 2) 계정 비활성 + 세션 즉시 회수
  UPDATE app.users SET role = 'RESIGNED', status = 'RESIGNED', resigned_at = p_date::timestamptz, resign_reason = p_reason WHERE id = p_user;
  UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'RESIGNED' WHERE user_id = p_user AND revoked_at IS NULL;
  GET DIAGNOSTICS n_sessions = ROW_COUNT;
  -- 3) 권한 회수
  DELETE FROM app.document_recipients WHERE user_id = p_user;
  DELETE FROM app.folder_grants WHERE user_id = p_user;
  DELETE FROM app.dispatch_presets WHERE target_user_id = p_user;
  -- 4) 법정 보관 DB 이관 (계약 3년 · 근태 3년 · 회계 5년)
  INSERT INTO vault.records (user_id, user_name, kind, title, payload_enc, retain_until, legal_basis, moved_by)
  SELECT p_user, u.name, 'contract', c.title, pgp_sym_encrypt(to_jsonb(c)::text, p_vault_key), p_date + interval '3 years', '근로기준법 제42조', app.uid()
    FROM app.contracts c JOIN app.users u ON u.id = c.user_id WHERE c.user_id = p_user;
  INSERT INTO vault.records (user_id, user_name, kind, title, payload_enc, retain_until, legal_basis, moved_by)
  SELECT p_user, u.name, 'attendance', '근태 기록', pgp_sym_encrypt(jsonb_agg(to_jsonb(a))::text, p_vault_key), p_date + interval '3 years', '근로기준법 제42조·시행령 제22조', app.uid()
    FROM app.attendance a JOIN app.users u ON u.id = a.user_id WHERE a.user_id = p_user GROUP BY u.name HAVING count(*) > 0;
  INSERT INTO vault.records (user_id, user_name, kind, title, payload_enc, retain_until, legal_basis, moved_by)
  SELECT p_user, u.name, 'document', d.title,
         pgp_sym_encrypt(jsonb_build_object('doc', to_jsonb(d), 'versions', (SELECT jsonb_agg(to_jsonb(v)) FROM app.document_versions v WHERE v.document_id = d.id))::text, p_vault_key),
         p_date + CASE WHEN f.parent_id = (SELECT id FROM app.folders WHERE name = '회계' AND parent_id IS NULL) THEN interval '5 years' ELSE interval '3 years' END,
         CASE WHEN f.name IN ('정산','지출·증빙') THEN '국세기본법 제85조의3' ELSE '근로기준법 제42조 준용' END, app.uid()
    FROM app.documents d JOIN app.folders f ON f.id = d.folder_id JOIN app.users u ON u.id = d.owner_id
   WHERE d.owner_id = p_user AND (f.name = '인사기록·제출서류' OR (d.status = 'APPROVED' AND f.parent_id = (SELECT id FROM app.folders WHERE name = '회계' AND parent_id IS NULL)));
  -- 일반 영역에서 제거
  DELETE FROM app.attendance WHERE user_id = p_user;
  DELETE FROM app.contracts WHERE user_id = p_user;
  DELETE FROM app.submissions WHERE user_id = p_user;
  DELETE FROM app.documents d USING app.folders f WHERE f.id = d.folder_id AND d.owner_id = p_user
     AND (f.name = '인사기록·제출서류' OR (d.status = 'APPROVED' AND f.parent_id = (SELECT id FROM app.folders WHERE name = '회계' AND parent_id IS NULL)));
  INSERT INTO audit.logs (user_id, role, action, target_type, target_id, detail) VALUES
    (app.uid(), 'CEO', 'RESIGN_CONFIRM', 'user', p_user::text, '퇴사일 ' || p_date || ' · ' || p_reason),
    (app.uid(), 'CEO', 'SESSION_REVOKE', 'user', p_user::text, '활성 세션 ' || n_sessions || '개 즉시 만료'),
    (app.uid(), 'CEO', 'VAULT_MOVE', 'user', p_user::text, '법정 보관 DB 이관');
END $$;
