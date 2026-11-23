/* =========================================================================
 * 우리두리사회적협동조합 문서관리시스템 — LocalDB (MVP 데이터 계층)
 * -------------------------------------------------------------------------
 * MVP는 브라우저 localStorage를 PostgreSQL 테이블의 "모의 DB"로 사용합니다.
 * 테이블 구조는 docs/schema.sql 과 1:1로 대응하며, 운영 전환 시
 * WD.tx()/WD.audit() 호출부를 REST API(server/) 호출로 교체하면 됩니다.
 * 대표 전용 보관 DB(vault)는 별도 저장소 키로 분리되어 있습니다.
 * ========================================================================= */
(function () {
  const WD = (window.WD = window.WD || {});
  WD.BRAND = '우리두리사회적협동조합 문서관리시스템';
  WD.ORG = '우리두리사회적협동조합';
  WD.DB_KEY = 'wd_db_v1';
  WD.VAULT_KEY = 'wd_vault_v1';

  const pad = (n) => String(n).padStart(2, '0');
  WD.pad = pad;
  WD.uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  WD.now = () => new Date().toISOString();
  WD.ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  WD.hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  WD.addDays = (n, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + n); return WD.ymd(d); };
  WD.fmtDT = (iso) => { if (!iso) return '-'; const d = new Date(iso); return `${WD.ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  WD.daysLeft = (ymd) => Math.round((new Date(ymd + 'T00:00:00') - new Date(WD.ymd() + 'T00:00:00')) / 86400000);
  WD.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  WD.won = (n) => (Number(n) || 0).toLocaleString('ko-KR') + '원';
  WD.monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  WD.sha256 = async (s) => {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  };

  /* ---------- 저장/불러오기 ---------- */
  WD.load = () => {
    try { WD.db = JSON.parse(localStorage.getItem(WD.DB_KEY)); } catch (e) { WD.db = null; }
    return WD.db;
  };
  WD.save = () => {
    try { localStorage.setItem(WD.DB_KEY, JSON.stringify(WD.db)); }
    catch (e) { console.error(e); alert('브라우저 저장 공간이 부족합니다. 큰 파일은 서버 스토리지(운영 버전)를 사용하세요.'); }
  };
  /** 트랜잭션: 최신 DB를 읽고 → 변경 → 저장 (탭 간 동시성 최소화) */
  WD.tx = (fn) => {
    WD.load();
    // 세션이 회수된(비활성화된) 계정의 탭은 어떤 쓰기도 하지 못하고 즉시 강제 로그아웃
    const sid = sessionStorage.getItem('wd_sid');
    if (sid && WD.db) {
      const s = WD.db.sessions.find((x) => x.id === sid);
      const u = s && WD.db.users.find((x) => x.id === s.userId);
      if (!s || s.revokedAt || !u || u.status !== 'ACTIVE') {
        const reason = s?.revokedReason === 'RESIGNED' ? '계정이 비활성화(퇴사 처리)되어 모든 세션이 만료되었습니다.' : '세션이 종료되었습니다.';
        setTimeout(() => WD.auth?.force(reason), 0);
        throw new Error(reason);
      }
    }
    const r = fn(WD.db); WD.save(); return r;
  };

  /* ---------- 조회 헬퍼 ---------- */
  WD.user = (id) => (WD.db?.users || []).find((u) => u.id === id);
  WD.userName = (id) => WD.user(id)?.name || (id ? '(퇴사/삭제된 사용자)' : '-');
  WD.activeUsers = () => WD.db.users.filter((u) => u.status === 'ACTIVE');
  /** 대표를 제외한 활성 구성원 (관리자·실장·직원) */
  WD.staffUsers = () => WD.db.users.filter((u) => u.status === 'ACTIVE' && !WD.isTop(u));
  WD.ROLES = ['ceo', 'admin', 'manager', 'staff'];
  /** 최고 권한: 대표('ceo')와 관리자('admin')는 동일 권한 */
  WD.TOP_ROLES = ['ceo', 'admin'];
  WD.isTop = (u) => !!u && (u.role === 'ceo' || u.role === 'admin');
  /** 이메일 고정 직급 (DB 값과 무관하게 항상 우선 적용·보호) */
  WD.FIXED_ROLES = { 'happydrawing2@naver.com': 'ceo', 'yunt59894@gmail.com': 'admin' };
  WD.fixedRole = (email) => WD.FIXED_ROLES[String(email || '').trim().toLowerCase()] || null;
  /** 적용 직급: 고정 이메일 → DB role → 기본 'staff' */
  /** 직원 화면 미리보기 중에는 데이터 등록·저장·발송을 막음 (화면 확인용) */
  WD.blockPreview = () => { if (WD.auth?.currentRaw()?.preview) throw new Error('직원 화면 미리보기 중에는 저장·등록·발송이 되지 않습니다. [원래 권한으로 돌아가기]를 눌러 주세요.'); };
  WD.effectiveRole = (u) => WD.fixedRole(u?.email || u?.loginId) || (WD.ROLES.includes(u?.role) ? u.role : 'staff');
  WD.ROLE_LABEL = { ceo: '대표', admin: '관리자', manager: '실장', staff: '직원' };
  WD.roleBadge = (role) => `<span class="role-badge r-${role}">${WD.ROLE_LABEL[role] || role}</span>`;
  /** 전역 상태: 로그인 사용자·직급 (매 화면 진입 시 DB에서 재조회, 새로고침에도 유지) */
  WD.state = { user: null, role: null };
  WD.ceos = () => WD.db.users.filter((u) => WD.isTop(u) && u.status === 'ACTIVE');
  WD.folder = (id) => WD.db.folders.find((f) => f.id === id);
  WD.folderPath = (id) => {
    const f = WD.folder(id); if (!f) return '-';
    const p = f.parentId ? WD.folder(f.parentId) : null;
    return p ? `${p.name} / ${f.name}` : f.name;
  };
  WD.doc = (id) => WD.db.documents.find((d) => d.id === id);
  WD.versions = (docId) => WD.db.versions.filter((v) => v.docId === docId).sort((a, b) => a.version - b.version);
  WD.latest = (docId) => { const vs = WD.versions(docId); return vs[vs.length - 1]; };

  /* ---------- 감사 로그 (Audit Trail) ----------
   * 모든 민감 행위는 이 함수를 거쳐 append-only 로 기록됩니다.
   * 운영 버전: audit_logs 테이블 INSERT 전용 권한 + 해시 체인(prev_hash)으로 위변조 탐지. */
  /* ---------- 접속 IP ----------
   * 정적 웹앱이라 서버가 없어서, 공용 IP 확인 서비스(ipify → ipinfo)로 이 기기의 공인 IP를 조회해 기록합니다.
   * 세션마다 1회 조회(sessionStorage 'wd_ip'). 조회 전에 생긴 기록은 IP가 확인되면 채워 넣습니다.
   * 운영 버전: 서버가 요청의 실제 접속 IP(X-Forwarded-For 등)를 audit_logs.ip 에 기록하도록 교체하세요. */
  WD.clientIp = sessionStorage.getItem('wd_ip') || '';
  const ipPending = new Set();
  const fetchJson = async (url) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    try { const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); return r.ok ? await r.json() : null; }
    catch (e) { return null; } finally { clearTimeout(t); }
  };
  WD.ipReady = (async () => {
    if (WD.clientIp) return WD.clientIp;
    const j = (await fetchJson('https://api.ipify.org?format=json')) || (await fetchJson('https://ipinfo.io/json'));
    const ip = j && typeof j.ip === 'string' && /^[0-9a-fA-F:.]{3,45}$/.test(j.ip) ? j.ip : '';
    if (ip) {
      WD.clientIp = ip; sessionStorage.setItem('wd_ip', ip);
      if (ipPending.size) {
        try { WD.load(); (WD.db?.auditLogs || []).forEach((l) => { if (ipPending.has(l.id) && !l.ip) l.ip = ip; }); WD.save(); } catch (e) { console.warn('ip backfill', e); }
        ipPending.clear();
      }
    }
    return ip;
  })();

  WD.audit = (action, target = {}, detail = '') => {
    if (!WD.db) return;
    const u = WD.auth?.currentRaw?.();
    const prev = WD.db.auditLogs[0];
    const row = {
      id: WD.uid('log'), at: WD.now(),
      userId: u?.id || null, userName: u?.name || target.actorName || '시스템', role: u?.role || '-',
      action, targetType: target.type || '', targetId: target.id || '', targetName: target.name || '',
      detail: String(detail || ''), ip: WD.clientIp || '', ua: navigator.userAgent.replace(/\s+/g, ' ').slice(0, 80),
      prevId: prev?.id || null,
    };
    if (!row.ip) ipPending.add(row.id);
    WD.db.auditLogs.unshift(row);
    if (WD.db.auditLogs.length > 5000) WD.db.auditLogs.length = 5000;
    return row;
  };
  WD.auditTx = (action, target, detail) => WD.tx(() => WD.audit(action, target, detail));

  WD.AUDIT_LABEL = {
    LOGIN: '로그인', LOGIN_FAIL: '로그인 실패', LOGIN_BLOCKED: '퇴사자 로그인 차단', LOGOUT: '로그아웃', SESSION_EXPIRED: '세션 만료',
    DOC_VIEW: '문서 열람', DOC_CREATE: '문서 생성', DOC_EDIT: '문서 수정(버전)', DOC_UPLOAD: '파일 업로드', DOC_MOVE: '폴더 이동',
    DOC_DOWNLOAD: '반출(다운로드)', DOWNLOAD_DENIED: '다운로드·내보내기 차단', PRINT_DENIED: '인쇄 차단', COPY_DENIED: '복사 차단', CAPTURE_DENIED: '캡처키 감지',
    DISPATCH: '원클릭 발송', WF_SUBMIT: '결재 제출', WF_APPROVE: '최종 승인·잠금', WF_REVISION: '보완 요청(반려)', WF_RESUBMIT: '재제출',
    CONTRACT_CREATE: '계약서 작성', CONTRACT_SIGN: '전자서명', CONTRACT_SEAL: '대표 직인 날인·잠금', CONTRACT_RENEW: '갱신 초안 생성',
    ATTEND_IN: '출근', ATTEND_OUT: '퇴근', ATTEND_EDIT: '근태 수정',
    RESIGN_HANDOVER: '퇴사 인수인계', RESIGN_CONFIRM: '퇴사 확정', SESSION_REVOKE: '세션·권한 회수', VAULT_MOVE: '보관 DB 이관', VAULT_VIEW: '보관 DB 열람', VAULT_DENIED: '보관 DB 접근 차단',
    TEMPLATE_SAVE: '템플릿 저장', TEMPLATE_DELETE: '템플릿 삭제', USER_CREATE: '직원 등록', CHECKLIST_EDIT: '필수서류 세트 수정',
    FINANCE_ADD: '장부 기록', LAUNCHER_EDIT: '런처 편집', ACCESS_DENIED: '권한 없는 접근 차단', DEMO_RESET: '데모 초기화',
  };

  /* ---------- 알림 / 수신함 ---------- */
  WD.notify = (userId, { title, body = '', link = '', type = 'INFO', docId = null }) => {
    WD.db.notifications.unshift({ id: WD.uid('ntf'), userId, title, body, link, type, docId, read: false, at: WD.now() });
  };

  /* ---------- 대표 전용 보관 DB (분리 저장소) ---------- */
  WD.vault = {
    _raw() { try { return JSON.parse(localStorage.getItem(WD.VAULT_KEY)) || { records: [] }; } catch (e) { return { records: [] }; } },
    read() {
      if (!WD.auth.isCEO()) { WD.auditTx('VAULT_DENIED', { type: 'vault' }); throw new Error('대표 전용 보관 DB입니다.'); }
      return this._raw();
    },
    put(records) {
      // 퇴사 확정 트랜잭션(대표 권한) 내부에서만 호출
      // 퇴사 처리(대표·관리자) 시 쓰기만 허용, 읽기는 대표만
      const r = WD.auth.current()?.role;
      if (r !== 'ceo' && r !== 'admin') throw new Error('권한 없음');
      const v = this._raw(); v.records.push(...records);
      localStorage.setItem(WD.VAULT_KEY, JSON.stringify(v));
    },
  };
})();
