/* =========================================================================
 * 대시보드 — 대표: 경영(매출·지출·순수익) + 전 직원 근태/계약/서류 현황 + 런처
 *            직원: 내 업무(수신함·문서 상태·서류·근태)
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const V = (WD.views = WD.views || {});
  const I = (n, c) => WD.icon(n, c);
  const esc = WD.esc;

  WD.financeByMonth = () => {
    const by = {};
    WD.db.finance.forEach((f) => { const m = (by[f.month] = by[f.month] || { 매출: 0, 지출: 0 }); m[f.type] += Number(f.amount) || 0; });
    return Object.keys(by).sort().map((k) => ({ month: k, rev: by[k].매출, exp: by[k].지출, net: by[k].매출 - by[k].지출 }));
  };
  const short = (n) => { const a = Math.abs(n); return (n < 0 ? '-' : '') + (a >= 1e8 ? (a / 1e8).toFixed(2) + '억' : a >= 1e4 ? Math.round(a / 1e4).toLocaleString('ko-KR') + '만' : a.toLocaleString('ko-KR')); };
  WD.shortWon = short;

  WD.launcherGrid = (items) => !items.length ? `<p class="muted">등록된 바로가기가 없습니다. <a href="#/launcher">원클릭 런처</a>에서 블로그·인스타그램·거래처·업무 포털을 추가하세요.</p>` : `<div class="launcher-grid">${items.map((l) => `<a class="launch" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}"><span class="launch-ico" style="background:${esc(l.color || '#2f7d62')}">${esc(l.name.slice(0, 1))}</span><b>${esc(l.name)}</b><small>${esc(l.category || '')}</small></a>`).join('')}</div>`;

  async function drawChart(canvas, rows) {
    try { await WD.ui.loadScript(WD.ui.LIBS.chart); } catch (e) { canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: '차트 라이브러리를 불러오지 못했습니다.' })); return; }
    const ch = new window.Chart(canvas, {
      data: { labels: rows.map((r) => `${+r.month.slice(5)}월`), datasets: [
        { type: 'bar', label: '매출', data: rows.map((r) => r.rev), backgroundColor: '#2f7d62', borderRadius: 6, order: 2 },
        { type: 'bar', label: '지출', data: rows.map((r) => r.exp), backgroundColor: '#e3b45f', borderRadius: 6, order: 2 },
        { type: 'line', label: '순수익', data: rows.map((r) => r.net), borderColor: '#1d3b5c', backgroundColor: '#1d3b5c', tension: 0.35, pointRadius: 4, order: 1 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { font: { family: 'Pretendard' } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${WD.won(c.raw)}` } } },
        scales: { y: { ticks: { callback: (v) => short(v) }, grid: { color: '#eee9df' } }, x: { grid: { display: false } } } },
    });
    WD.app.onCleanup(() => ch.destroy());
  }

  V.dashboard = async (el, p, q, u) => (u.role === 'ceo' ? ceoDash(el, u) : staffDash(el, u));

  function ceoDash(el, u) {
    const db = WD.db;
    const fin = WD.financeByMonth();
    const cur = fin[fin.length - 1] || { rev: 0, exp: 0, net: 0 }, prev = fin[fin.length - 2] || { rev: 0, exp: 0, net: 0 };
    const pct = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : 0);
    const half = fin.reduce((a, r) => ({ rev: a.rev + r.rev, exp: a.exp + r.exp }), { rev: 0, exp: 0 });
    const waiting = db.documents.filter((d) => ['PENDING', 'RESUBMITTED'].includes(d.status)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const alerts = WD.wf.expiryAlerts();
    const staff = WD.staffUsers();
    const today = WD.ymd();
    const month = WD.monthKey();
    const attSt = WD.api.attendance.stats(month);
    const docStat = staff.map((x) => { const set = WD.wf.checklistFor(x); const st = set.items.map((it) => WD.wf.submissionStatus(x.id, it).st); return { x, miss: st.filter((s) => s === 'MISSING').length, rev: st.filter((s) => s === 'REVISION' || s === 'EXPIRED').length, review: st.filter((s) => s === 'REVIEW').length, done: st.filter((s) => s === 'DONE').length, total: st.length }; });
    const tot = docStat.reduce((a, s) => ({ miss: a.miss + s.miss, rev: a.rev + s.rev, review: a.review + s.review }), { miss: 0, rev: 0, review: 0 });
    const unsigned = db.contracts.filter((c) => c.status === 'SENT' || c.status === 'SIGNED');
    const logs = db.auditLogs.slice(0, 6);
    const security = db.auditLogs.filter((l) => ['DOWNLOAD_DENIED', 'PRINT_DENIED', 'COPY_DENIED', 'CAPTURE_DENIED', 'ACCESS_DENIED', 'LOGIN_BLOCKED'].includes(l.action) && Date.now() - new Date(l.at) < 30 * 864e5).length;

    el.innerHTML = `<div class="page">
      <div class="page-head"><div><small class="muted">${today} · ${esc(WD.ORG)}</small><h1>경영 대시보드</h1><p class="muted">${esc(u.name)} ${esc(u.title || '')}님, 결재 대기 ${waiting.length}건 · 만료 임박 ${alerts.length}건 · 서류 미제출 ${tot.miss}건이 있습니다.</p></div>
        <div class="row gap-s"><a class="btn ghost" href="#/finance">${I('chart')} 장부 관리</a><a class="btn primary" href="#/workflow">${I('flow')} 결재함</a></div></div>
      <div class="kpis">
        <div class="kpi big"><small>${+month.slice(5)}월 매출</small><b>${short(cur.rev)}원</b><span class="${pct(cur.rev, prev.rev) >= 0 ? 't-ok' : 't-danger'}">전월 대비 ${pct(cur.rev, prev.rev) >= 0 ? '▲' : '▼'} ${Math.abs(pct(cur.rev, prev.rev))}%</span></div>
        <div class="kpi big"><small>${+month.slice(5)}월 지출</small><b>${short(cur.exp)}원</b><span class="muted">전월 ${short(prev.exp)}원</span></div>
        <div class="kpi big ${cur.net >= 0 ? 'ok' : 'danger'}"><small>${+month.slice(5)}월 순수익</small><b>${short(cur.net)}원</b><span class="muted">이익률 ${cur.rev ? Math.round((cur.net / cur.rev) * 100) : 0}%</span></div>
        <div class="kpi big"><small>최근 ${fin.length}개월 누적 순수익</small><b>${short(half.rev - half.exp)}원</b><span class="muted">매출 ${short(half.rev)} · 지출 ${short(half.exp)}</span></div>
      </div>
      <div class="dash-grid">
        <section class="card span2"><div class="card-head"><h3>${I('chart')} 매출 · 지출 · 순수익 추이</h3><a href="#/finance" class="link">상세</a></div><div class="chart-box"><canvas id="fin-chart"></canvas></div></section>
        <section class="card"><div class="card-head"><h3>${I('flow')} 결재 대기 <em class="cnt">${waiting.length}</em></h3><a href="#/workflow" class="link">전체</a></div>
          <ul class="mini-list">${waiting.slice(0, 6).map((d) => `<li><a href="#/doc/${d.id}">${WD.ui.kindIcon(d.kind)}<span><b>${esc(d.title)}</b><small>${esc(WD.userName(d.ownerId))} · v${d.version} · ${WD.fmtDT(d.updatedAt)}</small></span>${WD.ui.status(d.status)}</a></li>`).join('') || `<li class="muted pad">대기 중인 결재가 없습니다.</li>`}</ul></section>
        <section class="card"><div class="card-head"><h3>${I('alert')} 계약·서류 만료 알림</h3><a href="#/contracts" class="link">계약서</a></div>
          <ul class="mini-list">${alerts.slice(0, 6).map((a) => `<li><a href="${a.link}"><span class="dd-b">${WD.ui.dday(a.days)}</span><span><b>${esc(a.title)}</b><small>${a.kind} · ${a.end}${a.renewed ? ' · 갱신 초안 있음' : ''}</small></span></a></li>`).join('') || '<li class="muted pad">30일 이내 만료 예정이 없습니다.</li>'}</ul></section>
        <section class="card"><div class="card-head"><h3>${I('list')} 필수 서류 누락·보완</h3><a href="#/checklist" class="link">체크리스트</a></div>
          <div class="tri"><div><b class="t-danger">${tot.miss}</b><small>미제출</small></div><div><b class="t-warn">${tot.rev}</b><small>보완 대기</small></div><div><b>${tot.review}</b><small>검토 중</small></div></div>
          <ul class="mini-list compact">${docStat.map((s) => `<li><div class="row gap-s center">${WD.ui.avatar(s.x, 22)}<b>${esc(s.x.name)}</b></div><div class="progress sm"><span style="width:${(s.total ? Math.round((s.done / s.total) * 100) : 100)}%"></span></div><small>${s.done}/${s.total}${s.miss ? ` · <span class="t-danger">미제출 ${s.miss}</span>` : ''}${s.rev ? ` · <span class="t-warn">보완 ${s.rev}</span>` : ''}</small></li>`).join('')}</ul></section>
        <section class="card"><div class="card-head"><h3>${I('clock')} 근태 요약 (${+month.slice(5)}월)</h3><a href="#/attendance" class="link">관리</a></div>
          <table class="tbl compact"><thead><tr><th>이름</th><th>직급</th><th class="c">출석</th><th class="c">지각</th><th class="c">병가·휴가</th><th class="c">대강</th></tr></thead><tbody>
          ${attSt.people.map((pp) => `<tr><td>${esc(pp.user.name)}</td><td>${WD.roleBadge(pp.user.role)}</td><td class="c">${pp.출석}</td><td class="c">${pp.지각 || '-'}</td><td class="c">${(pp.병가 + pp.휴가) || '-'}</td><td class="c">${pp.대강 || '-'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">등록된 직원이 없습니다.</td></tr>'}</tbody></table></section>
        <section class="card"><div class="card-head"><h3>${I('contract')} 계약 진행</h3><a href="#/contracts" class="link">관리</a></div>
          <ul class="mini-list">${unsigned.map((c) => `<li><a href="#/contract/${c.id}">${I('contract')}<span><b>${esc(c.title)}</b><small>${c.status === 'SENT' ? '직원 서명 대기' : '직원 서명 완료 → 직인 필요'}</small></span></a></li>`).join('') || '<li class="muted pad">진행 중인 계약이 없습니다.</li>'}</ul>
          <div class="sec-sum">${I('audit')} 최근 30일 보안 차단 이벤트 <b>${security}</b>건 <a href="#/audit?f=deny" class="link">로그</a></div></section>
        <section class="card span2"><div class="card-head"><h3>${I('rocket')} 원클릭 런처</h3><a href="#/launcher" class="link">편집</a></div>${WD.launcherGrid(db.launchers)}</section>
        <section class="card"><div class="card-head"><h3>${I('audit')} 최근 감사 로그</h3><a href="#/audit" class="link">전체</a></div>
          <ul class="mini-list compact">${logs.map((l) => `<li><small class="muted">${WD.fmtDT(l.at)}</small><span><b>${esc(l.userName)}</b> ${esc(WD.AUDIT_LABEL[l.action] || l.action)}</span><small>${esc(l.targetName)}</small></li>`).join('')}</ul></section>
      </div></div>`;
    drawChart(el.querySelector('#fin-chart'), fin);
  }

  function staffDash(el, u) {
    const db = WD.db;
    const today = WD.ymd();
    const t = WD.api.attendance.mine({ date: today })[0];
    const notes = db.notifications.filter((n) => n.userId === u.id).slice(0, 6);
    const myDocs = db.documents.filter((d) => d.ownerId === u.id || d.assigneeId === u.id).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const set = WD.wf.checklistFor(u);
    const items = set.items.map((it) => ({ it, ...WD.wf.submissionStatus(u.id, it) }));
    const done = items.filter((i) => i.st === 'DONE').length;
    const pctDone = items.length ? Math.round((done / items.length) * 100) : 100;
    const alerts = WD.wf.expiryAlerts(u.id);
    const sentContract = db.contracts.find((c) => c.userId === u.id && c.status === 'SENT');
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><small class="muted">${today}</small><h1>${esc(u.name)} ${esc(u.title)}님, 안녕하세요</h1><p class="muted">${esc(u.dept)} · ${esc(u.empType)} · 문서 작성·열람만 가능하며 파일 다운로드·PDF/엑셀 내보내기는 대표만 가능합니다.</p></div>
        <div class="row gap-s"><a class="btn primary" href="#/templates">${I('plus')} 새 문서</a></div></div>
      ${sentContract ? `<div class="alert alert-warn">${I('pen')}<span><b>계약서 서명 요청</b> ${esc(sentContract.title)} — <a href="#/contract/${sentContract.id}">지금 확인하고 전자서명하기</a></span></div>` : ''}
      ${alerts.map((a) => `<div class="alert alert-info slim">${I('alert')}<span>[${a.bucket}] ${a.kind}: ${esc(a.title)} (만료일 ${a.end})</span></div>`).join('')}
      <div class="dash-grid">
        <section class="card"><div class="card-head"><h3>${I('clock')} 오늘 출결</h3><a href="#/attendance" class="link">근태</a></div>
          <div class="today-att">${t ? `<span class="badge st-approved">${t.status}</span><p>${t.time} 등록</p>` : '<p class="muted">아직 오늘 근태를 체크하지 않았어요.</p>'}<a class="btn ${t ? 'ghost' : 'primary'} block" href="#/attendance">${t ? '근태 화면 열기' : '지금 체크하기'}</a></div></section>
        <section class="card"><div class="card-head"><h3>${I('list')} 내 필수 서류</h3><a href="#/checklist" class="link">제출하기</a></div>
          <div class="big-pct"><b>${pctDone}%</b><small>${done}/${items.length} 완료</small></div><div class="progress"><span style="width:${pctDone}%"></span></div>
          <ul class="mini-list compact">${items.filter((i) => i.st !== 'DONE').map((i) => `<li><span>${esc(i.it.name)}</span>${WD.ui.subStatus(i.st)}</li>`).join('') || '<li class="t-ok">모두 제출 완료</li>'}</ul></section>
        <section class="card"><div class="card-head"><h3>${I('inbox')} 수신함</h3><a href="#/inbox" class="link">전체</a></div>
          <ul class="mini-list">${notes.map((n) => `<li class="${n.read ? '' : 'unread'}"><a href="${n.link || '#/inbox'}"><span><b>${esc(n.title)}</b><small>${esc(n.body)}</small></span></a></li>`).join('') || '<li class="muted pad">새 알림이 없습니다.</li>'}</ul></section>
        <section class="card span2"><div class="card-head"><h3>${I('doc')} 내 문서 진행 상태</h3><a href="#/workflow" class="link">워크플로우</a></div>
          <table class="tbl compact"><thead><tr><th>문서</th><th>상태</th><th>버전</th><th>수정일</th></tr></thead><tbody>${myDocs.slice(0, 8).map((d) => `<tr class="click" onclick="location.hash='#/doc/${d.id}'"><td>${WD.ui.kindIcon(d.kind)} ${esc(d.title)}</td><td>${WD.ui.status(d.status)}</td><td><span class="ver">v${d.version}</span></td><td class="muted">${WD.fmtDT(d.updatedAt)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">작성한 문서가 없습니다.</td></tr>'}</tbody></table></section>
        <section class="card"><div class="card-head"><h3>${I('template')} 빠른 작성</h3></div>
          <div class="quick-col">${db.templates.length ? '' : '<a class="qrow" href="#/new/doc">' + WD.ui.kindIcon('doc') + '<span>새 문서(워드형) 작성</span></a><a class="qrow" href="#/new/sheet">' + WD.ui.kindIcon('sheet') + '<span>새 스프레드시트 작성</span></a>'}${db.templates.filter((t) => t.kind !== 'hwp').slice(0, 5).map((tp) => `<a class="qrow" href="#/new/${tp.kind}?template=${tp.id}">${WD.ui.kindIcon(tp.kind)}<span>${esc(tp.title)}</span></a>`).join('')}</div></section>
      </div></div>`;
  }
})();
