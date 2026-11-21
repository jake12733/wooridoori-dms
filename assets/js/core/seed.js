/* =========================================================================
 * 초기 구성 (샘플 데이터 없음)
 * - 첫 실행 시 빈 DB + 기본 폴더 구조(인사·문서·회계·보안) + 기본 필수 서류 세트만 생성
 * - 사용자·문서·계약·근태·장부·템플릿은 최고 관리자/실장이 직접 등록·작성
 * - 이전 데모 버전(schemaVersion < 5) 데이터는 자동 삭제
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const SCHEMA_VERSION = 5;

  function emptyDb() {
    const folders = [
      { id: 'f_hr', name: '인사', parentId: null, staffAccess: 'none', color: '#2f7d62' },
      { id: 'f_hr_emp', name: '근로계약', parentId: 'f_hr', staffAccess: 'none', legal: true },
      { id: 'f_hr_inst', name: '위촉계약', parentId: 'f_hr', staffAccess: 'none', legal: true },
      { id: 'f_hr_rec', name: '인사기록·제출서류', parentId: 'f_hr', staffAccess: 'none', legal: true },
      { id: 'f_hr_cert', name: '증명서·확인서', parentId: 'f_hr', staffAccess: 'view' },
      { id: 'f_doc', name: '문서', parentId: null, staffAccess: 'edit', color: '#3c6fb4' },
      { id: 'f_doc_notice', name: '공문·안내문', parentId: 'f_doc', staffAccess: 'edit' },
      { id: 'f_doc_report', name: '보고서', parentId: 'f_doc', staffAccess: 'edit' },
      { id: 'f_doc_attend', name: '출석부', parentId: 'f_doc', staffAccess: 'edit' },
      { id: 'f_doc_minutes', name: '회의록', parentId: 'f_doc', staffAccess: 'view' },
      { id: 'f_acc', name: '회계', parentId: null, staffAccess: 'view', color: '#c98a1e' },
      { id: 'f_acc_sales', name: '매출', parentId: 'f_acc', staffAccess: 'none' },
      { id: 'f_acc_exp', name: '지출·증빙', parentId: 'f_acc', staffAccess: 'edit', legal: true },
      { id: 'f_acc_settle', name: '정산', parentId: 'f_acc', staffAccess: 'edit', legal: true },
      { id: 'f_sec', name: '보안', parentId: null, staffAccess: 'none', color: '#b2453a' },
      { id: 'f_sec_pledge', name: '보안서약', parentId: 'f_sec', staffAccess: 'view' },
      { id: 'f_sec_privacy', name: '개인정보', parentId: 'f_sec', staffAccess: 'none' },
    ];
    // 기본 필수 서류 세트 (필수 서류 체크리스트 > 세트 설정에서 수정 가능)
    const checklistSets = [
      { id: 'cs_reg', empType: '정규직', items: [
        { code: 'emp_contract', name: '근로계약서', source: 'contract' }, { code: 'resident', name: '주민등록등본' }, { code: 'bank', name: '통장 사본' },
        { code: 'insurance', name: '4대보험 취득 신고 서류' }, { code: 'privacy', name: '개인정보 수집·이용 동의서' }, { code: 'security', name: '보안서약서' },
        { code: 'health', name: '건강진단결과서(보건증)', expiry: true }] },
      { id: 'cs_inst', empType: '위촉강사', items: [
        { code: 'inst_contract', name: '위촉계약서', source: 'contract' }, { code: 'resume', name: '강사 이력서' }, { code: 'license', name: '자격증 사본' },
        { code: 'crime', name: '성범죄 경력 조회 동의서', expiry: true }, { code: 'abuse', name: '아동학대 범죄전력 조회 동의서' }, { code: 'bank', name: '통장 사본' },
        { code: 'privacy', name: '개인정보 수집·이용 동의서' }, { code: 'security', name: '보안서약서' }] },
    ];
    const presets = [
      { id: 'p_admin', name: '최고 관리자에게 결재·제출', action: 'SUBMIT_CEO', icon: 'stamp' },
      { id: 'p_all', name: '전체 직원 공지 발송', action: 'BROADCAST', icon: 'megaphone' },
    ];
    return {
      schemaVersion: SCHEMA_VERSION, createdAt: WD.now(), orgName: WD.ORG,
      users: [], sessions: [], folders, documents: [], versions: [], wfEvents: [], dispatches: [], presets, notifications: [],
      templates: [], checklistSets, submissions: [], contracts: [], attendance: [], finance: [], launchers: [], auditLogs: [], alertSent: [],
    };
  }

  /** 첫 실행 또는 이전 데모 데이터 → 빈 초기 구성 */
  WD.seedIfEmpty = async () => {
    WD.load();
    if (WD.db && WD.db.schemaVersion === SCHEMA_VERSION) return false;
    const hadOld = !!WD.db;
    WD.db = emptyDb(); WD.save();
    localStorage.setItem(WD.VAULT_KEY, JSON.stringify({ records: [] }));
    if (hadOld) { try { await WD.files.clear(); } catch (e) { /* noop */ } sessionStorage.removeItem('wd_sid'); }
    return true;
  };
  WD.needsSetup = () => { WD.load(); return !WD.db || !WD.db.users.some((u) => u.role === 'ADMIN' && u.status === 'ACTIVE'); };

  /** 최초 최고 관리자 계정 생성 (관리자가 하나도 없을 때만) */
  WD.createFirstAdmin = async ({ name, email, password, title }) => {
    if (!WD.needsSetup()) throw new Error('이미 최고 관리자 계정이 있습니다.');
    const pwHash = await WD.sha256('wooridoori::' + password);
    return WD.tx((db) => {
      const u = { id: WD.uid('u'), loginId: email, email, name, role: 'ADMIN', title: title || '대표', empType: '정규직', dept: '경영지원', joinedAt: WD.ymd(), phone: '', workStart: '09:00', workEnd: '18:00', pwHash, status: 'ACTIVE', createdAt: WD.now() };
      db.users.push(u);
      WD.audit('USER_CREATE', { type: 'user', id: u.id, name: u.name, actorName: u.name }, '최초 최고 관리자 계정 생성');
      return u;
    });
  };
})();
