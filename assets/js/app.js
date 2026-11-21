/* =========================================================================
 * 앱 셸 · 해시 라우터 · 로그인 화면 · 역할 기반 메뉴
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const I = (n, c) => WD.icon(n, c);
  const V = (WD.views = WD.views || {});
  let cleanups = [];

  const NAV = [
    { sec: '업무' },
    { path: '/dashboard', label: '대시보드', icon: 'home' },
    { path: '/docs', label: '통합 문서함', icon: 'folder' },
    { path: '/templates', label: '새 문서·양식 템플릿', icon: 'template' },
    { path: '/inbox', label: '수신함·발송 이력', icon: 'inbox', badge: 'inbox' },
    { path: '/workflow', label: '결재·보완 워크플로우', icon: 'flow', badge: 'wf' },
    { path: '/checklist', label: '필수 서류 체크리스트', icon: 'list' },
    { path: '/contracts', label: '계약서 관리', icon: 'contract', badge: 'contract' },
    { path: '/attendance', label: '출결·근태', icon: 'clock' },
    { sec: '대표 전용', ceo: true },
    { path: '/finance', label: '경영·매출 장부', icon: 'chart', ceo: true },
    { path: '/people', label: '인사·퇴사 관리', icon: 'users', ceo: true },
    { path: '/vault', label: '법정 보관 DB', icon: 'vault', ceo: true },
    { path: '/audit', label: '감사 로그', icon: 'audit', ceo: true },
    { path: '/launcher', label: '원클릭 런처', icon: 'rocket', ceo: true },
    { sec: '시스템' },
    { path: '/system', label: '아키텍처·보안 설계', icon: 'cog' },
  ];

  const ROUTES = [
    ['/dashboard', 'dashboard'], ['/docs', 'docs'], ['/docs/:folder', 'docs'], ['/doc/:id', 'docView'], ['/new/:kind', 'newDoc'],
    ['/templates', 'templates'], ['/inbox', 'inbox'], ['/workflow', 'workflow'], ['/checklist', 'checklist'],
    ['/contracts', 'contracts'], ['/contract/:id', 'contract'], ['/attendance', 'attendance'],
    ['/finance', 'finance', true], ['/people', 'people', true], ['/vault', 'vault', true], ['/audit', 'audit', true], ['/launcher', 'launcher', true],
    ['/system', 'system'],
  ];

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/dashboard';
    const [path, qs] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    for (const [pattern, view, ceoOnly] of ROUTES) {
      const pp = pattern.split('/'), hp = path.split('/');
      if (pp.length !== hp.length) continue;
      const params = {}; let ok = true;
      pp.forEach((seg, i) => { if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(hp[i]); else if (seg !== hp[i]) ok = false; });
      if (ok) return { path, view, params, query, ceoOnly, pattern };
    }
    return { path, view: path === '/login' ? 'login' : 'notFound', params: {}, query };
  }

  function badgeCounts(u) {
    const db = WD.db;
    const inbox = db.notifications.filter((n) => n.userId === u.id && !n.read).length;
    const wf = u.role === 'CEO'
      ? db.documents.filter((d) => ['PENDING', 'RESUBMITTED'].includes(d.status)).length
      : db.documents.filter((d) => (d.ownerId === u.id || d.assigneeId === u.id) && d.status === 'REVISION_REQUIRED').length;
    const contract = u.role === 'CEO'
      ? WD.wf.expiryAlerts().filter((a) => a.kind === '계약 종료' && !a.renewed).length + db.contracts.filter((c) => c.status === 'SIGNED').length
      : db.contracts.filter((c) => c.userId === u.id && c.status === 'SENT').length;
    return { inbox, wf, contract };
  }

  function shell(u, route) {
    const counts = badgeCounts(u);
    const isCEO = u.role === 'CEO';
    const nav = NAV.filter((n) => !n.ceo || isCEO).map((n) => {
      if (n.sec) return `<div class="nav-sec">${n.sec}</div>`;
      const active = route.path === n.path || (n.path !== '/dashboard' && route.path.startsWith(n.path)) || (n.path === '/docs' && route.path.startsWith('/doc')) || (n.path === '/templates' && route.path.startsWith('/new')) || (n.path === '/contracts' && route.path.startsWith('/contract'));
      const c = n.badge ? counts[n.badge] : 0;
      return `<a class="nav-item ${active ? 'active' : ''}" href="#${n.path}">${I(n.icon)}<span>${n.label}</span>${c ? `<em class="nav-badge">${c}</em>` : ''}</a>`;
    }).join('');
    const myNotes = WD.db.notifications.filter((n) => n.userId === u.id).slice(0, 7);
    return `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="#/dashboard">
          <span class="brand-mark"></span>
          <span class="brand-txt"><b>우리두리사회적협동조합</b><small>문서관리시스템</small></span>
        </a>
        <nav class="nav">${nav}</nav>
        <div class="side-foot">
          <div class="sec-pill ${isCEO ? 'ceo' : 'staff'}">${I(isCEO ? 'stamp' : 'lock')}<span>${isCEO ? '대표 권한 · 반출 허용' : '직원 권한 · 반출 차단 모드'}</span></div>
        </div>
      </aside>
      <div class="side-dim" data-close-side></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn only-m" data-open-side aria-label="메뉴">${I('menu')}</button>
          <div class="top-title" id="top-title">${WD.esc(WD.BRAND)}</div>
          <div class="top-actions">
            <div class="dd">
              <button class="icon-btn bell" data-dd="ntf" aria-label="알림">${I('bell')}${counts.inbox ? `<em>${counts.inbox}</em>` : ''}</button>
              <div class="dd-menu ntf-menu" data-ddm="ntf">
                <div class="dd-head"><b>알림</b><a href="#/inbox">수신함 전체 보기</a></div>
                ${myNotes.length ? myNotes.map((n) => `<a class="ntf ${n.read ? '' : 'unread'}" href="${n.link || '#/inbox'}" data-ntf="${n.id}"><span class="ntf-type t-${n.type}"></span><span><b>${WD.esc(n.title)}</b><small>${WD.esc(n.body)}</small><time>${WD.fmtDT(n.at)}</time></span></a>`).join('') : '<p class="muted pad">새 알림이 없습니다.</p>'}
              </div>
            </div>
            <div class="user-chip">${WD.ui.avatar(u, 32)}<span><b>${WD.esc(u.name)}</b><small>${WD.esc(u.title)} · ${u.role}</small></span></div>
            <button class="icon-btn" data-logout title="로그아웃" aria-label="로그아웃">${I('logout')}</button>
          </div>
        </header>
        <main class="content" id="view"></main>
      </div>
    </div>`;
  }

  function bindShell() {
    const root = document.getElementById('app');
    root.querySelector('[data-logout]').addEventListener('click', () => WD.auth.logout('로그아웃되었습니다.'));
    root.querySelector('[data-open-side]')?.addEventListener('click', () => document.body.classList.add('side-open'));
    root.querySelector('[data-close-side]')?.addEventListener('click', () => document.body.classList.remove('side-open'));
    root.querySelectorAll('[data-dd]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); root.querySelector(`[data-ddm="${b.dataset.dd}"]`).classList.toggle('open'); }));
    document.addEventListener('click', closeDD);
    root.querySelectorAll('[data-ntf]').forEach((a) => a.addEventListener('click', () => WD.tx((db) => { const n = db.notifications.find((x) => x.id === a.dataset.ntf); if (n) n.read = true; })));
  }
  function closeDD() { document.querySelectorAll('.dd-menu.open').forEach((m) => m.classList.remove('open')); }

  /* ---------------- 로그인 ---------------- */
  V.login = (root) => {
    const reason = sessionStorage.getItem('wd_logout_reason') || '';
    sessionStorage.removeItem('wd_logout_reason');
    const demo = [
      ['ceo', '김우리', '대표 (CEO)', '전체 권한 · 반출·결재·보관 DB'],
      ['teacher1', '이두리', '정규직 선생님 (STAFF)', '열람·웹 편집, 반출 차단'],
      ['teacher2', '박하늘', '위촉강사 (STAFF)', '보완 요청 받은 보고서 보유'],
      ['teacher3', '최은솔', '위촉강사 (STAFF)', '퇴사 처리 시연 대상'],
      ['admin1', '정민지', '행정실장 (STAFF)', '회계 정산 담당'],
      ['former', '한지훈', '퇴사자 (RESIGNED)', '로그인 차단 확인용'],
    ];
    root.innerHTML = `
    <div class="login">
      <section class="login-hero">
        <div class="login-brand"><span class="brand-mark lg"></span><div><b>우리두리사회적협동조합</b><span>문서관리시스템</span></div></div>
        <h1>함께 쓰는 문서,<br>안전하게 지키는 기록.</h1>
        <p>협동조합과 연계 기관·교육 현장을 위한 통합 문서 · 계약 · 근태 · 보안 · 경영 관리 시스템</p>
        <ul class="hero-list">
          <li>${I('lock')}<span><b>반출 통제</b> 직원은 웹 열람·편집만, 다운로드·인쇄·복사는 대표만</span></li>
          <li>${I('audit')}<span><b>감사 로그</b> 열람·수정 버전·발송·승인·권한 회수를 자동 기록</span></li>
          <li>${I('users')}<span><b>퇴사자 즉시 차단</b> 인수인계 확인 후 세션·권한 회수, 법정 서류는 대표 보관 DB로</span></li>
          <li>${I('sheet')}<span><b>무료 웹 오피스</b> 엑셀형 · 워드형 · 한글(HWP/HWPX) 편집기 내장</span></li>
        </ul>
      </section>
      <section class="login-panel">
        <form class="login-card" id="login-form" autocomplete="on">
          <h2>로그인</h2>
          <p class="muted">우리두리사회적협동조합 문서관리시스템</p>
          ${reason ? `<div class="alert ${/퇴사|회수|차단/.test(reason) ? 'alert-danger' : 'alert-info'}">${I(/퇴사|회수|차단/.test(reason) ? 'lock' : 'info')}<span>${WD.esc(reason)}</span></div>` : ''}
          <div class="alert alert-danger hidden" id="login-err"></div>
          <label class="fld"><span>아이디</span><input name="id" autocomplete="username" required placeholder="아이디"></label>
          <label class="fld"><span>비밀번호</span><input name="pw" type="password" autocomplete="current-password" required placeholder="비밀번호"></label>
          <button class="btn primary block lg" type="submit">로그인</button>
          <div class="demo-box">
            <div class="demo-head"><b>데모 계정</b><small>클릭하면 바로 로그인 · 비밀번호 1234</small></div>
            <div class="demo-grid">${demo.map(([id, name, role, desc]) => `<button type="button" class="demo-acc ${id === 'former' ? 'resigned' : ''}" data-demo="${id}"><b>${name}</b><span>${role}</span><small>${desc}</small></button>`).join('')}</div>
            <p class="tiny muted">데모 데이터는 이 브라우저(localStorage·IndexedDB)에만 저장됩니다. <a href="#" data-reset>데모 초기화</a></p>
          </div>
        </form>
        <p class="login-foot">© ${new Date().getFullYear()} ${WD.ORG} · 무단 접근 및 자료 반출은 관련 법령에 따라 처벌될 수 있습니다.</p>
      </section>
    </div>`;
    const form = root.querySelector('#login-form');
    const err = root.querySelector('#login-err');
    const doLogin = async (id, pw) => {
      const r = await WD.auth.login(id, pw);
      if (!r.ok) { err.classList.remove('hidden'); err.innerHTML = `${I('lock')}<span class="pre">${WD.esc(r.msg)}</span>`; return; }
      WD.wf.autoNotify();
      location.hash = '#/dashboard';
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); doLogin(form.id.value, form.pw.value); });
    root.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => { form.id.value = b.dataset.demo; form.pw.value = '1234'; doLogin(b.dataset.demo, '1234'); }));
    root.querySelector('[data-reset]').addEventListener('click', async (e) => { e.preventDefault(); if (await WD.ui.confirm('데모 초기화', '모든 데모 데이터(문서·로그·보관 DB·업로드 파일)를 처음 상태로 되돌립니다.', { danger: true })) { await WD.resetDemo(); WD.ui.toast('데모 데이터를 초기화했습니다.'); V.login(root); } });
  };

  V.notFound = (el) => { el.innerHTML = `<div class="page">${WD.ui.empty('페이지를 찾을 수 없습니다.', 'alert')}</div>`; };
  V.forbidden = (el) => { el.innerHTML = `<div class="page"><div class="forbidden">${I('lock')}<h2>대표(CEO) 전용 영역입니다</h2><p>접근 시도가 감사 로그에 기록되었습니다.</p><a class="btn primary" href="#/dashboard">대시보드로</a></div></div>`; };

  /* ---------------- 라우팅 ---------------- */
  async function route() {
    cleanups.forEach((f) => { try { f(); } catch (e) { /* noop */ } }); cleanups = [];
    document.removeEventListener('click', closeDD);
    document.body.classList.remove('side-open');
    const root = document.getElementById('app');
    const r = parseHash();
    const v = WD.auth.validate();
    if (r.view === 'login' || !v.ok) {
      if (!v.ok && sessionStorage.getItem('wd_sid')) { WD.auth.force(v.reason); return; }
      WD.sec.applyMode(null);
      if (r.view !== 'login') { location.replace('#/login'); }
      document.title = `로그인 · ${WD.BRAND}`;
      V.login(root); return;
    }
    const u = v.user;
    WD.sec.applyMode(u);
    root.innerHTML = shell(u, r);
    bindShell();
    const el = document.getElementById('view');
    if (r.ceoOnly && u.role !== 'CEO') {
      WD.auditTx('ACCESS_DENIED', { type: 'route', name: r.path }, `STAFF의 대표 전용 메뉴 접근 시도`);
      V.forbidden(el); return;
    }
    try { await (V[r.view] || V.notFound)(el, r.params, r.query, u); }
    catch (e) { console.error(e); el.innerHTML = `<div class="page"><div class="alert alert-danger">${I('alert')}<span>${WD.esc(e.message)}</span></div></div>`; }
    const h = el.querySelector('h1'); document.title = `${h ? h.textContent + ' · ' : ''}${WD.BRAND}`;
    window.scrollTo(0, 0);
  }

  WD.app = {
    route,
    onCleanup: (f) => cleanups.push(f),
    go: (h) => { if (location.hash === h) route(); else location.hash = h; },
    refresh: () => route(),
    setTitle: (t) => { const e = document.getElementById('top-title'); if (e) e.textContent = t; },
  };

  async function boot() {
    try {
      await WD.seedIfEmpty();
    } catch (e) {
      document.getElementById('app').innerHTML = `<div class="boot"><p>초기화 실패: ${WD.esc(e.message)}<br>HTTPS 환경(최신 브라우저)에서 접속해 주세요.</p></div>`; return;
    }
    WD.sec.installGuards();
    WD.auth.watch();
    window.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
