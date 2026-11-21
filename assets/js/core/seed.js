/* =========================================================================
 * 초기 구성 · 데이터 마이그레이션 (샘플 데이터 없음)
 * - 4단계 직급: 'ceo'(대표) · 'admin'(관리자) · 'manager'(실장) · 'staff'(직원)
 * - 문서 분류(단일 카테고리): 인사·직원 / 수업·운영 / 회계·정산 / 🔒 대표 전용
 * - v5(이전 버전) 데이터는 자동 변환 — 문서·계정·근태 유지
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const SCHEMA_VERSION = 6;

  // 분류별 직급 권한 (ceo는 항상 전체)
  WD.CATEGORIES = [
    { id: 'c_hr', name: '인사·직원', color: '#2f7d62', access: { admin: 'edit', manager: 'edit', staff: 'none' }, legal: true },
    { id: 'c_ops', name: '수업·운영', color: '#3c6fb4', access: { admin: 'edit', manager: 'edit', staff: 'edit' } },
    { id: 'c_acc', name: '회계·정산', color: '#c98a1e', access: { admin: 'edit', manager: 'edit', staff: 'view' }, legal: true },
    { id: 'c_ceo', name: '대표 전용', color: '#b2453a', access: { admin: 'none', manager: 'none', staff: 'none' }, ceoOnly: true },
  ];
  const folders = () => WD.CATEGORIES.map((c) => ({ ...c, parentId: null }));

  const checklistSets = () => [
    { id: 'cs_reg', empType: '정규직', items: [
      { code: 'emp_contract', name: '근로계약서', source: 'contract' }, { code: 'resident', name: '주민등록등본' }, { code: 'bank', name: '통장 사본' },
      { code: 'insurance', name: '4대보험 취득 신고 서류' }, { code: 'privacy', name: '개인정보 수집·이용 동의서' }, { code: 'security', name: '보안서약서' },
      { code: 'health', name: '건강진단결과서(보건증)', expiry: true }] },
    { id: 'cs_inst', empType: '위촉강사', items: [
      { code: 'inst_contract', name: '위촉계약서', source: 'contract' }, { code: 'resume', name: '강사 이력서' }, { code: 'license', name: '자격증 사본' },
      { code: 'crime', name: '성범죄 경력 조회 동의서', expiry: true }, { code: 'abuse', name: '아동학대 범죄전력 조회 동의서' }, { code: 'bank', name: '통장 사본' },
      { code: 'privacy', name: '개인정보 수집·이용 동의서' }, { code: 'security', name: '보안서약서' }] },
  ];

  function emptyDb() {
    return {
      schemaVersion: SCHEMA_VERSION, createdAt: WD.now(), orgName: WD.ORG,
      users: [], sessions: [], folders: folders(), documents: [], versions: [], wfEvents: [], dispatches: [],
      presets: [
        { id: 'p_ceo', name: '대표에게 결재·제출', action: 'SUBMIT_CEO', icon: 'stamp' },
        { id: 'p_all', name: '전체 직원 공지 발송', action: 'BROADCAST', icon: 'megaphone' },
      ],
      notifications: [], templates: [], contractTemplates: [], messages: [], notices: [], rooms: [], checklistSets: checklistSets(), submissions: [], contracts: [], attendance: [], finance: [], launchers: [], auditLogs: [], alertSent: [],
    };
  }

  /** v5 → v6 변환: 직급 코드, 2단계 폴더 → 단일 분류, 근태 형식 */
  function migrate5(db) {
    const ROLE = { ADMIN: 'ceo', ceo: 'ceo', MANAGER: 'manager', STAFF: 'staff', RESIGNED: 'staff' };
    db.users.forEach((u) => {
      const base = u.role === 'RESIGNED' ? (u.prevRole || 'STAFF') : u.role;
      u.role = ROLE[base] || 'staff';
      if (u.status !== 'ACTIVE') u.status = 'RESIGNED';
    });
    const FMAP = (fid) => {
      if (!fid) return 'c_ops';
      if (fid === 'f_acc_sales' || fid === 'f_sec' || fid === 'f_sec_privacy') return 'c_ceo';
      if (fid.startsWith('f_hr') || fid === 'f_sec_pledge') return 'c_hr';
      if (fid.startsWith('f_acc')) return 'c_acc';
      return 'c_ops';
    };
    db.documents.forEach((d) => { d.folderId = FMAP(d.folderId); });
    db.contracts.forEach((c) => { c.folderId = 'c_hr'; });
    db.presets.forEach((p) => { if (p.folderId) p.folderId = FMAP(p.folderId); if (p.action === 'SUBMIT_CEO') p.name = '대표에게 결재·제출'; });
    db.dispatches.forEach((x) => { if (x.folderId) x.folderId = FMAP(x.folderId); });
    db.folders = folders();
    db.attendance = (db.attendance || []).map((a) => ({
      id: a.id, userId: a.userId, date: a.date, time: a.in || a.time || '', status: a.status === '근무' ? '출석' : (a.status === '조퇴' ? '출석' : a.status),
      note: [a.note, a.status === '조퇴' ? '조퇴' : '', a.subFor ? `${WD.userName(a.subFor)} 대강` : ''].filter(Boolean).join(' · '),
      approved: true, approvedBy: null, createdAt: a.createdAt || WD.now(), locked: true,
    }));
    db.schemaVersion = SCHEMA_VERSION;
    return db;
  }

  /** 새 기능 테이블 보강 (기존 데이터 유지) */
  // 원클릭 런처 기본 바로가기 (우리두리 공식 채널)
  const DEFAULT_LAUNCHERS = [
    { name: '우리두리 블로그', url: 'https://blog.naver.com/wooriduri1004', category: '홍보', color: '#03c75a' },
    { name: '우리두리 인스타그램', url: 'https://www.instagram.com/wooriduri.center/', category: '홍보', color: '#d6249f' },
  ];
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  const ensure = (db) => {
    let ch = false;
    ['contractTemplates', 'messages', 'notices', 'rooms', 'launchers'].forEach((k) => { if (!Array.isArray(db[k])) { db[k] = []; ch = true; } });
    if (!db.launcherDefaults1) { // 한 번만 추가 (나중에 지우면 다시 생기지 않음)
      DEFAULT_LAUNCHERS.slice().reverse().forEach((l) => { if (!db.launchers.some((x) => norm(x.url) === norm(l.url))) db.launchers.unshift({ id: WD.uid('l'), ...l }); });
      db.launcherDefaults1 = true; ch = true;
    }
    return ch;
  };

  WD.seedIfEmpty = async () => {
    WD.load();
    if (WD.db && WD.db.schemaVersion === SCHEMA_VERSION) { if (ensure(WD.db)) WD.save(); return false; }
    if (WD.db && WD.db.schemaVersion === 5) { WD.db = migrate5(WD.db); ensure(WD.db); WD.save(); return true; }
    const hadOld = !!WD.db;
    WD.db = emptyDb(); ensure(WD.db); WD.save();
    localStorage.setItem(WD.VAULT_KEY, JSON.stringify({ records: [] }));
    if (hadOld) { try { await WD.files.clear(); } catch (e) { /* noop */ } sessionStorage.removeItem('wd_sid'); }
    return true;
  };
  WD.needsSetup = () => { WD.load(); return !WD.db || !WD.db.users.some((u) => WD.isTop({ role: WD.effectiveRole(u) }) && u.status === 'ACTIVE'); };

  /** 최초 대표 계정 생성 (대표가 하나도 없을 때만) */
  WD.createFirstAdmin = async ({ name, email, password, title }) => {
    if (!WD.needsSetup()) throw new Error('이미 대표/관리자 계정이 있습니다.');
    const pwHash = await WD.sha256('wooridoori::' + password);
    return WD.tx((db) => {
      const role = WD.fixedRole(email) || 'ceo';
      const u = { id: WD.uid('u'), loginId: email, email, name, role, title: title || (role === 'admin' ? '관리자' : '원장'), empType: '정규직', dept: '경영', joinedAt: WD.ymd(), phone: '', workStart: '09:00', workEnd: '18:00', pwHash, status: 'ACTIVE', createdAt: WD.now() };
      db.users.push(u);
      WD.audit('USER_CREATE', { type: 'user', id: u.id, name: u.name, actorName: u.name }, `최초 ${WD.ROLE_LABEL[role]} 계정 생성`);
      return u;
    });
  };
})();
