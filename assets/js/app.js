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
    { sec: '최고 관리자 전용', ceo: true },
    { path: '/finance', label: '경영·매출 장부', icon: 'chart', ceo: true },
    { path: '/people', label: '인사·계정 관리', icon: 'users', ceo: true },
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
    const wf = u.role === 'ADMIN'
      ? db.documents.filter((d) => ['PENDING', 'RESUBMITTED'].includes(d.status)).length
      : db.documents.filter((d) => (d.ownerId === u.id || d.assigneeId === u.id) && d.status === 'REVISION_REQUIRED').length;
    const contract = u.role === 'ADMIN'
      ? WD.wf.expiryAlerts().filter((a) => a.kind === '계약 종료' && !a.renewed).length + db.contracts.filter((c) => c.status === 'SIGNED').length
      : db.contracts.filter((c) => c.userId === u.id && c.status === 'SENT').length;
    return { inbox, wf, contract };
  }

  function shell(u, route) {
    const counts = badgeCounts(u);
    const isCEO = u.role === 'ADMIN';
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
          <div class="sec-pill ${isCEO ? 'ceo' : 'staff'}">${I(isCEO ? 'stamp' : 'lock')}<span>${isCEO ? '최고 관리자 · 반출 허용' : `${WD.ROLE_LABEL[u.role]} · 유출 방지(DLP) 적용`}</span></div>
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
            <div class="user-chip">${WD.ui.avatar(u, 32)}<span><b>${WD.esc(u.name)}</b><small>${WD.esc(u.title)} · ${WD.ROLE_LABEL[u.role] || u.role}</small></span></div>
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

  /* ---------------- 로그인 / 최초 설정 ---------------- */
  const heroHTML = () => `
      <section class="login-hero">
        <div class="login-brand"><span class="brand-mark lg"></span><div><b>우리두리사회적협동조합</b><span>문서관리시스템</span></div></div>
        <h1>함께 쓰는 문서,<br>안전하게 지키는 기록.</h1>
        <p>협동조합과 연계 기관·교육 현장을 위한 통합 문서 · 계약 · 근태 · 보안 · 경영 관리 시스템</p>
        <ul class="hero-list">
          <li>${I('lock')}<span><b>문서 유출 방지(DLP)</b> 실장·직원은 작성·열람만, 다운로드·PDF/엑셀 내보내기는 최고 관리자만</span></li>
          <li>${I('eye')}<span><b>열람 보호</b> 우클릭·복사·인쇄 차단, 이름·이메일·현재 시간 워터마크</span></li>
          <li>${I('users')}<span><b>계정 비활성화 즉시 차단</b> 퇴사 처리 시 모든 세션 즉시 만료·강제 로그아웃</span></li>
          <li>${I('audit')}<span><b>감사 로그</b> 열람·수정 버전·발송·승인·차단 시도를 자동 기록</span></li>
        </ul>
      </section>`;

  V.setup = (root) => {
    root.innerHTML = `<div class="login">${heroHTML()}
      <section class="login-panel">
        <form class="login-card" id="setup-form" autocomplete="off">
          <h2>최초 설정</h2>
          <p class="muted">처음 사용하시는군요. 시스템 전체를 관리할 <b>최고 관리자(대표)</b> 계정을 만들어 주세요. 이후 실장·직원 계정은 최고 관리자가 [인사·계정 관리]에서 등록합니다.</p>
          <div class="alert alert-danger hidden" id="setup-err"></div>
          <label class="fld"><span>이름</span><input name="name" required placeholder="예) 홍길동"></label>
          <label class="fld"><span>직함</span><input name="title" value="대표"></label>
          <label class="fld"><span>이메일 (로그인 ID)</span><input name="email" type="email" required autocomplete="username" placeholder="name@example.com"></label>
          <label class="fld"><span>비밀번호 (8자 이상)</span><input name="pw" type="password" required minlength="8" autocomplete="new-password"></label>
          <label class="fld"><span>비밀번호 확인</span><input name="pw2" type="password" required minlength="8" autocomplete="new-password"></label>
          <button class="btn primary block lg" type="submit">최고 관리자 계정 만들기</button>
          <p class="tiny muted mt-s">데이터는 현재 이 브라우저에 저장됩니다. 여러 PC에서 함께 쓰려면 서버(DB) 연동이 필요합니다.</p>
        </form>
      </section></div>`;
    const f = root.querySelector('#setup-form'); const err = root.querySelector('#setup-err');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const show = (m) => { err.classList.remove('hidden'); err.innerHTML = `${I('alert')}<span>${WD.esc(m)}</span>`; };
      if (f.pw.value !== f.pw2.value) return show('비밀번호가 서로 다릅니다.');
      if (f.pw.value.length < 8) return show('비밀번호는 8자 이상이어야 합니다.');
      try {
        await WD.createFirstAdmin({ name: f.name.value.trim(), title: f.title.value.trim(), email: f.email.value.trim().toLowerCase(), password: f.pw.value });
        const r = await WD.auth.login(f.email.value, f.pw.value);
        if (r.ok) location.hash = '#/dashboard'; else show(r.msg);
        WD.app.route();
      } catch (ex) { show(ex.message); }
    });
  };

  V.login = (root) => {
    const reason = sessionStorage.getItem('wd_logout_reason') || '';
    sessionStorage.removeItem('wd_logout_reason');
    const danger = /퇴사|회수|차단|비활성|만료/.test(reason) && !/^로그아웃/.test(reason);
    root.innerHTML = `<div class="login">${heroHTML()}
      <section class="login-panel">
        <form class="login-card" id="login-form" autocomplete="on">
          <h2>로그인</h2>
          <p class="muted">우리두리사회적협동조합 문서관리시스템</p>
          ${reason ? `<div class="alert ${danger ? 'alert-danger' : 'alert-info'}">${I(danger ? 'lock' : 'info')}<span>${WD.esc(reason)}</span></div>` : ''}
          <div class="alert alert-danger hidden" id="login-err"></div>
          <label class="fld"><span>이메일</span><input name="id" type="email" autocomplete="username" required placeholder="name@example.com"></label>
          <label class="fld"><span>비밀번호</span><input name="pw" type="password" autocomplete="current-password" required placeholder="비밀번호"></label>
          <button class="btn primary block lg" type="submit">로그인</button>
          <p class="tiny muted mt-s">계정은 최고 관리자가 발급합니다. 비밀번호를 잊으셨다면 최고 관리자에게 재설정을 요청하세요.</p>
        </form>
        <p class="login-foot">© ${new Date().getFullYear()} ${WD.ORG} · 무단 접근 및 자료 반출은 관련 법령에 따라 처벌될 수 있습니다.</p>
      </section></div>`;
    const form = root.querySelector('#login-form');
    const err = root.querySelector('#login-err');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await WD.auth.login(form.id.value, form.pw.value);
      if (!r.ok) { err.classList.remove('hidden'); err.innerHTML = `${I('lock')}<span class="pre">${WD.esc(r.msg)}</span>`; return; }
      WD.wf.autoNotify();
      location.hash = '#/dashboard';
    });
  };

  V.notFound = (el) => { el.innerHTML = `<div class="page">${WD.ui.empty('페이지를 찾을 수 없습니다.', 'alert')}</div>`; };
  V.forbidden = (el) => { el.innerHTML = `<div class="page"><div class="forbidden">${I('lock')}<h2>최고 관리자 전용 영역입니다</h2><p>접근 시도가 감사 로그에 기록되었습니다.</p><a class="btn primary" href="#/dashboard">대시보드로</a></div></div>`; };

  /* ---------------- 라우팅 ---------------- */
  async function route() {
    cleanups.forEach((f) => { try { f(); } catch (e) { /* noop */ } }); cleanups = [];
    document.removeEventListener('click', closeDD);
    document.body.classList.remove('side-open');
    const root = document.getElementById('app');
    const r = parseHash();
    const v = WD.auth.validate();
    if (WD.needsSetup()) { WD.sec.applyMode(null); sessionStorage.removeItem('wd_sid'); document.title = `최초 설정 · ${WD.BRAND}`; V.setup(root); return; }
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
    if (r.ceoOnly && u.role !== 'ADMIN') {
      WD.auditTx('ACCESS_DENIED', { type: 'route', name: r.path }, `${u.role}의 관리자 전용 메뉴 접근 시도`);
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
