/* =========================================================================
 * 앱 셸 · 해시 라우터 · 로그인 화면 · 4단계 직급(ceo/admin/manager/staff) 자동 분기
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const I = (n, c) => WD.icon(n, c);
  const V = (WD.views = WD.views || {});
  let cleanups = [];
  const ALL = ['ceo', 'admin', 'manager', 'staff'];
  const CEO = ['ceo', 'admin']; // 최고 권한: 대표·관리자 동일
  const CHECK = ['ceo', 'admin', 'manager']; // 필수 서류: 대표·관리자·실장

  // 메뉴: roles에 포함된 직급에게만 보임 (라우트 권한과 동일)
  const NAV = [
    { path: '/dashboard', label: '대시보드', icon: 'home', roles: CEO },
    { path: '/docs', label: '통합 문서함', icon: 'folder', roles: ALL },
    { path: '/attendance', label: '출결·근태', icon: 'clock', roles: ['manager', 'staff'] }, // 실장·직원: 본인 출결 체크용 단독 메뉴
    { path: '/inbox', label: '알림함', icon: 'inbox', badge: 'inbox', roles: ALL },
    // 필수 서류(메인) > 근로·위촉계약서(서브)
    { path: '/checklist', label: '필수 서류', icon: 'list', roles: CHECK },
    { path: '/contracts', label: '근로·위촉계약서', icon: 'contract', badge: 'contract', roles: CEO, sub: true, parent: '/checklist' },
    // 직원·계정 관리(메인) > 출결·근태(서브)
    { path: '/people', label: '직원·계정 관리', icon: 'users', roles: CEO },
    { path: '/attendance', label: '출결·근태', icon: 'clock', roles: CEO, sub: true, parent: '/people' },
    { sec: '🔒 대표 전용', roles: CEO },
    { path: '/finance', label: '경영·매출 장부', icon: 'chart', roles: CEO },
    { path: '/docs/c_ceo', label: '대표 전용 보안 폴더', icon: 'lock', roles: CEO },
    { path: '/workflow', label: '결재·보완', icon: 'flow', badge: 'wf', roles: CEO, sub: true, parent: '/docs/c_ceo' }, // 대표 전용 보안 폴더 > 결재·보완
    { path: '/vault', label: '퇴사자 보관함', icon: 'vault', roles: CEO },
    { path: '/audit', label: '보안 기록(감사 로그)', icon: 'audit', roles: CEO },
    { path: '/launcher', label: '바로가기 관리', icon: 'rocket', roles: CEO },
  ];

  const ROUTES = [
    ['/dashboard', 'dashboard', CEO], ['/docs', 'docs', ALL], ['/docs/:folder', 'docs', ALL], ['/doc/:id', 'docView', ALL], ['/new/:kind', 'newDoc', ALL],
    ['/templates', 'templates', ALL], ['/inbox', 'inbox', ALL], ['/workflow', 'workflow', CEO], ['/checklist', 'checklist', CHECK],
    ['/contracts', 'contracts', CEO], ['/contract/:id', 'contract', CEO], ['/attendance', 'attendance', ALL],
    ['/finance', 'finance', CEO], ['/people', 'people', CEO], ['/vault', 'vault', CEO], ['/audit', 'audit', CEO], ['/launcher', 'launcher', CEO],
    ['/system', 'system', CEO],
  ];
  /** 직급별 첫 화면: 대표=대시보드, 그 외=통합 문서함 */
  WD.homeFor = (u) => (WD.isTop(u) ? '#/dashboard' : '#/docs');

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    if (path === '/' || path === '') return { path: '/', view: 'home', params: {}, query };
    for (const [pattern, view, roles] of ROUTES) {
      const pp = pattern.split('/'), hp = path.split('/');
      if (pp.length !== hp.length) continue;
      const params = {}; let ok = true;
      pp.forEach((seg, i) => { if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(hp[i]); else if (seg !== hp[i]) ok = false; });
      if (ok) return { path, view, params, query, roles, pattern };
    }
    return { path, view: path === '/login' ? 'login' : 'notFound', params: {}, query };
  }

  function badgeCounts(u) {
    const db = WD.db;
    const inbox = db.notifications.filter((n) => n.userId === u.id && !n.read).length + WD.api.messages.unreadCount();
    const wf = WD.isTop(u) ? db.documents.filter((d) => ['PENDING', 'RESUBMITTED'].includes(d.status)).length : 0;
    const contract = WD.isTop(u)
      ? WD.wf.expiryAlerts().filter((a) => a.kind === '계약 종료' && !a.renewed).length + db.contracts.filter((c) => c.status === 'SIGNED').length
      : db.contracts.filter((c) => c.userId === u.id && c.status === 'SENT').length;
    return { inbox, wf, contract };
  }

  function shell(u, route) {
    const counts = badgeCounts(u);
    const isCEO = WD.isTop(u);
    const nav = NAV.filter((n) => n.roles.includes(u.role)).map((n) => {
      if (n.sec) return `<div class="nav-sec ceo-sec">${n.sec}</div>`;
      const active = route.path === n.path
        || (n.path === '/docs' && (route.path.startsWith('/doc') || route.path.startsWith('/new')) && route.path !== '/docs/c_ceo')
        || (n.path === '/contracts' && route.path.startsWith('/contract'));
      const c = n.badge ? counts[n.badge] : 0;
      return `<a class="nav-item ${n.sub ? 'nav-sub' : ''} ${active ? 'active' : ''}" href="#${n.path}">${I(n.icon)}<span>${n.label}</span>${c ? `<em class="nav-badge">${c}</em>` : ''}</a>`;
    }).join('');
    const myNotes = WD.db.notifications.filter((n) => n.userId === u.id).slice(0, 7);
    return `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="${WD.homeFor(u)}">
          <span class="brand-mark"></span>
          <span class="brand-txt"><b>우리두리사회적협동조합</b><small>문서관리시스템</small></span>
        </a>
        <div class="side-user">${WD.ui.avatar(u, 40)}<div><b>${WD.esc(u.name)}</b>${WD.roleBadge(u.realRole || u.role)}</div></div>
        ${WD.TOP_ROLES.includes(u.realRole) ? `<div class="preview-box">${u.preview ? `<button class="btn sm block preview-exit" data-preview="">${I('refresh')} 원래 권한으로 돌아가기</button>` : `<div class="dd"><button class="btn sm block preview-btn" data-dd="pv">${I('eye')} 직원 화면 미리보기</button><div class="dd-menu" data-ddm="pv"><button class="dd-item" data-preview="staff">${WD.roleBadge('staff')} 직원 기준으로 보기</button><button class="dd-item" data-preview="manager">${WD.roleBadge('manager')} 실장 기준으로 보기</button></div></div>`}</div>` : ''}
        <nav class="nav">${nav}</nav>
        <div class="side-foot">
          <div class="sec-pill ${isCEO ? 'ceo' : 'staff'}">${I(isCEO ? 'stamp' : 'lock')}<span>${isCEO ? `${WD.ROLE_LABEL[u.role]} · 최고 권한 · 다운로드 허용` : '웹 열람전용 · 다운로드 차단'}</span></div>
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
                <div class="dd-head"><b>알림</b><a href="#/inbox">전체 보기</a></div>
                ${myNotes.length ? myNotes.map((n) => `<a class="ntf ${n.read ? '' : 'unread'}" href="${n.link || '#/inbox'}" data-ntf="${n.id}"><span class="ntf-type t-${n.type}"></span><span><b>${WD.esc(n.title)}</b><small>${WD.esc(n.body)}</small><time>${WD.fmtDT(n.at)}</time></span></a>`).join('') : '<p class="muted pad">새 알림이 없습니다.</p>'}
              </div>
            </div>
            ${u.preview ? `<div class="preview-banner">${I('eye')}<b>직원 화면 미리보기 중</b>${WD.roleBadge(u.role)}<button class="btn sm" data-preview="">원래 권한으로 돌아가기</button></div>` : ''}
            <div class="user-chip">${WD.ui.avatar(u, 32)}<span><b>${WD.esc(u.name)}</b>${WD.roleBadge(u.realRole || u.role)}</span></div>
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
    root.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); WD.auth.setPreview(b.dataset.preview || null); const nu = WD.auth.current(); WD.ui.toast(b.dataset.preview ? `${WD.ROLE_LABEL[b.dataset.preview]} 화면으로 보는 중입니다. 실제 권한은 그대로예요.` : '원래 권한으로 돌아왔습니다.'); const h = WD.homeFor(nu); if (location.hash === h) route(); else location.hash = h; }));
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
          <li>${I('users')}<span><b>직급별 자동 화면</b> 대표·관리자·실장·직원에 맞는 메뉴만 보여요</span></li>
          <li>${I('lock')}<span><b>문서 유출 방지</b> 다운로드·PDF/엑셀 내보내기는 대표만</span></li>
          <li>${I('eye')}<span><b>열람 보호</b> 다운로드·우클릭·복사·인쇄 차단</span></li>
          <li>${I('users')}<span><b>계정 비활성화 즉시 차단</b> 퇴사 처리 시 모든 세션 즉시 만료·강제 로그아웃</span></li>
          <li>${I('clock')}<span><b>1초 출결 체크</b> 큰 버튼 하나로 출석·지각·병가·휴가·대강</span></li>
        </ul>
      </section>`;

  V.setup = (root) => {
    root.innerHTML = `<div class="login">${heroHTML()}
      <section class="login-panel">
        <form class="login-card" id="setup-form" autocomplete="off">
          <h2>최초 설정</h2>
          <p class="muted">처음 사용하시는군요. 시스템 전체를 관리할 <b>대표(원장)</b> 계정을 먼저 만들어 주세요. 관리자·실장·직원 계정은 이후 [직원·계정 관리]에서 등록합니다.</p>
          <div class="alert alert-danger hidden" id="setup-err"></div>
          <label class="fld"><span>이름</span><input name="name" required placeholder="예) 홍길동"></label>
          <label class="fld"><span>직함</span><input name="title" value="원장"></label>
          <label class="fld"><span>이메일 (로그인 ID)</span><input name="email" type="email" required autocomplete="username" placeholder="name@example.com"></label>
          <label class="fld"><span>비밀번호 (8자 이상)</span><input name="pw" type="password" required minlength="8" autocomplete="new-password"></label>
          <label class="fld"><span>비밀번호 확인</span><input name="pw2" type="password" required minlength="8" autocomplete="new-password"></label>
          <button class="btn primary block lg" type="submit">대표 계정 만들기</button>
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
        if (r.ok) location.hash = WD.homeFor(r.user); else show(r.msg);
        WD.app.route();
      } catch (ex) { show(ex.message); }
    });
  };

  V.login = (root) => {
    document.getElementById('modal-root').innerHTML = ''; // 이전 사용자의 대화상자 제거
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
          <p class="tiny muted mt-s">계정은 대표 또는 관리자가 발급합니다. 비밀번호를 잊으셨다면 재설정을 요청하세요.</p>
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
      location.hash = WD.homeFor(r.user); // 직급별 첫 화면으로 자동 이동
    });
  };

  V.notFound = (el) => { el.innerHTML = `<div class="page">${WD.ui.empty('페이지를 찾을 수 없습니다.', 'alert')}</div>`; };
  V.forbidden = (el) => { const u = WD.auth.currentRaw(); el.innerHTML = `<div class="page"><div class="forbidden">${I('lock')}<h2>접근 권한이 없는 화면입니다</h2><p>${WD.ROLE_LABEL[u?.role] || ''} 직급에서는 열 수 없습니다. 접근 시도는 보안 기록에 남습니다.</p><a class="btn primary" href="${WD.homeFor(u)}">처음 화면으로</a></div></div>`; };

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
    if (r.view === 'home' || (r.roles && !r.roles.includes(u.role) && r.view === 'dashboard')) {
      if (r.view === 'dashboard') WD.auditTx('ACCESS_DENIED', { type: 'route', name: r.path }, `${WD.ROLE_LABEL[u.role]}(${u.role}) 직급의 대시보드 접근 차단`);
      location.replace(WD.homeFor(u)); return;
    }
    root.innerHTML = shell(u, r);
    bindShell();
    const el = document.getElementById('view');
    if (r.view === 'home') { location.replace(WD.homeFor(u)); return; }
    // 직접 경로 접근 차단: 대시보드는 첫 화면으로 돌려보내고, 나머지는 차단 화면 + 기록
    if (r.roles && !r.roles.includes(u.role)) {
      WD.auditTx('ACCESS_DENIED', { type: 'route', name: r.path }, `${WD.ROLE_LABEL[u.role]}(${u.role}) 직급의 권한 밖 화면 접근 시도`);
      if (r.view === 'dashboard') { location.replace(WD.homeFor(u)); return; }
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
    // 알림함 배지(알림+메시지) 실시간 갱신
    setInterval(() => {
      const u = WD.auth.currentRaw(); if (!u || !WD.db) return;
      const n = WD.db.notifications.filter((x) => x.userId === u.id && !x.read).length + WD.api.messages.unreadCount();
      const a = document.querySelector('.nav-item[href="#/inbox"]'); if (!a) return;
      let em = a.querySelector('.nav-badge');
      if (n) { if (!em) { em = document.createElement('em'); em.className = 'nav-badge'; a.appendChild(em); } em.textContent = n; } else if (em) em.remove();
    }, 3000);
    window.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
