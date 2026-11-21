/* =========================================================================
 * 대표 전용: 경영·매출 장부 · 법정 보관 DB · 감사 로그 · 원클릭 런처
 * 공통: 아키텍처·보안 설계 안내
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const V = (WD.views = WD.views || {});
  const I = (n, c) => WD.icon(n, c);
  const esc = WD.esc;
  const REPO = 'https://github.com/jake12733/wooridoori-dms';

  /* ---------------- 경영·매출 장부 ---------------- */
  V.finance = (el, p, q, u) => {
    const db = WD.db;
    const months = [...new Set(db.finance.map((f) => f.month))].sort();
    const month = q.m || months[months.length - 1] || WD.monthKey();
    const rows = WD.financeByMonth();
    const entries = db.finance.filter((f) => f.month === month);
    const cat = (type) => { const by = {}; entries.filter((e) => e.type === type).forEach((e) => (by[e.category] = (by[e.category] || 0) + Number(e.amount))); return Object.entries(by).sort((a, b) => b[1] - a[1]); };
    const rev = cat('매출'), exp = cat('지출');
    const sum = (a) => a.reduce((s, [, v]) => s + v, 0);
    const bar = (list, color) => { const max = Math.max(1, ...list.map(([, v]) => v)); return list.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><div><i style="width:${(v / max) * 100}%;background:${color}"></i></div><b>${WD.won(v)}</b></div>`).join(''); };
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>경영 · 매출 장부</h1><p class="muted">회사 매출·지출·순수익을 월별로 기록하고 대시보드와 연동합니다. (최고 관리자 전용)</p></div>
        <div class="row gap-s"><select id="fm">${months.map((m) => `<option ${m === month ? 'selected' : ''}>${m}</option>`).join('')}</select><button class="btn primary" data-add>${I('plus')} 기록 추가</button><button class="btn ghost" data-csv>${I('download')} CSV 반출</button></div></div>
      <div class="kpis"><div class="kpi big"><small>${month} 매출</small><b>${WD.won(sum(rev))}</b></div><div class="kpi big"><small>${month} 지출</small><b>${WD.won(sum(exp))}</b></div><div class="kpi big ${sum(rev) - sum(exp) >= 0 ? 'ok' : 'danger'}"><small>${month} 순수익</small><b>${WD.won(sum(rev) - sum(exp))}</b></div></div>
      <div class="dash-grid">
        <section class="card"><div class="card-head"><h3>매출 구성</h3></div>${bar(rev, '#2f7d62') || WD.ui.empty('기록 없음')}</section>
        <section class="card"><div class="card-head"><h3>지출 구성</h3></div>${bar(exp, '#e3b45f') || WD.ui.empty('기록 없음')}</section>
        <section class="card"><div class="card-head"><h3>월별 요약</h3></div><table class="tbl compact"><thead><tr><th>월</th><th class="r">매출</th><th class="r">지출</th><th class="r">순수익</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.month}</td><td class="r">${WD.shortWon(r.rev)}</td><td class="r">${WD.shortWon(r.exp)}</td><td class="r ${r.net >= 0 ? 't-ok' : 't-danger'}"><b>${WD.shortWon(r.net)}</b></td></tr>`).join('')}</tbody></table></section>
      </div>
      <div class="card flush"><div class="sub-head">${month} 상세 기록 (${entries.length})</div><table class="tbl"><thead><tr><th>구분</th><th>항목</th><th class="r">금액</th><th>메모</th><th></th></tr></thead><tbody>
        ${entries.map((e) => `<tr><td><span class="badge ${e.type === '매출' ? 'st-approved' : 'st-pending'}">${e.type}</span></td><td>${esc(e.category)}</td><td class="r">${WD.won(e.amount)}</td><td class="muted">${esc(e.memo || '')}</td><td class="r"><button class="btn sm ghost icon-only" data-del="${e.id}">${I('trash')}</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
    el.querySelector('#fm').addEventListener('change', (e) => (location.hash = `#/finance?m=${e.target.value}`));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { WD.tx((d) => { d.finance = d.finance.filter((x) => x.id !== b.dataset.del); WD.audit('FINANCE_ADD', { type: 'finance' }, '장부 기록 삭제'); }); WD.app.refresh(); }));
    el.querySelector('[data-add]').addEventListener('click', () => WD.ui.modal({ title: '장부 기록 추가', okText: '추가',
      body: `<div class="grid2"><label class="fld"><span>월</span><input type="month" data-m value="${month}"></label><label class="fld"><span>구분</span><select data-t><option>매출</option><option>지출</option></select></label>
        <label class="fld"><span>항목</span><input data-c list="fcats" placeholder="예) 위탁교육 수입"><datalist id="fcats">${[...new Set(db.finance.map((f) => f.category))].map((c) => `<option>${esc(c)}</option>`).join('')}</datalist></label><label class="fld"><span>금액(원)</span><input type="number" data-a></label>
        <label class="fld full"><span>메모</span><input data-n></label></div>`,
      onOk: (w) => { const a = Number(w.querySelector('[data-a]').value); const c = w.querySelector('[data-c]').value.trim(); if (!a || !c) throw new Error('항목과 금액을 입력하세요.'); WD.tx((d) => { d.finance.push({ id: WD.uid('fin'), month: w.querySelector('[data-m]').value, type: w.querySelector('[data-t]').value, category: c, amount: a, memo: w.querySelector('[data-n]').value }); WD.audit('FINANCE_ADD', { type: 'finance', name: c }, `${w.querySelector('[data-t]').value} ${WD.won(a)}`); }); WD.app.refresh(); } }));
    el.querySelector('[data-csv]').addEventListener('click', () => WD.sec.exportDoc({ type: 'finance', id: month, title: `매출장부_${month}` }, 'CSV', () => {
      const csv = ['월,구분,항목,금액,메모', ...db.finance.map((f) => [f.month, f.type, f.category, f.amount, (f.memo || '').replace(/,/g, ' ')].join(','))].join('\r\n');
      WD.sec.saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), `우리두리_매출지출장부_${WD.ymd()}.csv`);
    }));
  };

  /* ---------------- 법정 보관 DB ---------------- */
  V.vault = (el, p, q, u) => {
    let vault;
    try { vault = WD.vault.read(); } catch (e) { V.forbidden(el); return; }
    WD.auditTx('VAULT_VIEW', { type: 'vault', name: q.u ? WD.userName(q.u) : '전체' }, `보관 DB 목록 열람 (${vault.records.length}건)`);
    const recs = vault.records.filter((r) => !q.u || r.userId === q.u).sort((a, b) => (a.movedAt < b.movedAt ? 1 : -1));
    const people = [...new Set(vault.records.map((r) => r.userId))];
    const KIND = { contract: ['계약서', 'contract'], attendance: ['근태', 'clock'], document: ['서류', 'doc'] };
    const kindLabel = (r) => (r.kind === 'document' ? (/국세/.test(r.basis || '') ? '회계·정산' : '인사 서류') : KIND[r.kind][0]);
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>법정 보관 DB <span class="tag lock">${I('lock', 'xs')} 최고 관리자 전용</span></h1><p class="muted">퇴사자의 계약서·근태·정산 기록 등 법적 보관 의무 자료를 일반 열람 영역과 분리해 보관합니다. 별도 저장소(운영: 별도 스키마·암호화·RLS)로 격리되며 열람도 감사 로그에 기록됩니다.</p></div></div>
      <div class="chips"><a class="chip ${!q.u ? 'active' : ''}" href="#/vault">전체 <em>${vault.records.length}</em></a>${people.map((id) => { const r = vault.records.find((x) => x.userId === id); return `<a class="chip ${q.u === id ? 'active' : ''}" href="#/vault?u=${id}">${esc(r.userName)} <em>${vault.records.filter((x) => x.userId === id).length}</em></a>`; }).join('')}</div>
      <div class="card flush"><table class="tbl"><thead><tr><th>구분</th><th>기록</th><th>대상자</th><th>이관일</th><th>보존 기한</th><th>근거</th><th class="r"></th></tr></thead><tbody>
      ${recs.map((r) => { const left = WD.daysLeft(r.retainUntil); return `<tr><td class="nowrap">${I(KIND[r.kind][1])} ${kindLabel(r)}</td><td><b>${esc(r.title)}</b></td><td class="nowrap">${esc(r.userName)}</td><td class="nowrap">${WD.fmtDT(r.movedAt)}</td><td class="nowrap">${r.retainUntil} ${left < 0 ? '<span class="tag danger">파기 대상</span>' : `<small class="muted">(${(left / 365).toFixed(1)}년 남음)</small>`}</td><td class="tiny muted">${esc(r.basis || '')}</td><td class="r nowrap"><button class="btn sm ghost" data-open="${r.id}">${I('eye')} 열람</button></td></tr>`; }).join('') || `<tr><td colspan="7">${WD.ui.empty('보관된 기록이 없습니다.', 'vault')}</td></tr>`}
      </tbody></table></div></div>`;
    el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => {
      const r = vault.records.find((x) => x.id === b.dataset.open);
      WD.auditTx('VAULT_VIEW', { type: 'vault', id: r.id, name: r.title }, `${r.userName} 보관 기록 열람`);
      let body = '';
      if (r.kind === 'contract') body = WD.renderContract({ ...r.payload, userName: r.userName });
      else if (r.kind === 'attendance') body = `<h3>${esc(r.title)}</h3><div class="row gap-s wrap">${Object.entries(r.payload.summary || {}).map(([k, v]) => `<span class="tag">${k} ${v}</span>`).join('')}</div>${(r.payload.rows || []).length ? `<table class="tbl compact mt-s"><thead><tr><th>날짜</th><th>상태</th><th>출근</th><th>퇴근</th><th>비고</th></tr></thead><tbody>${r.payload.rows.sort((a, b) => (a.date < b.date ? 1 : -1)).map((a) => `<tr><td>${a.date}</td><td>${a.status}</td><td>${a.in || '-'}</td><td>${a.out || '-'}</td><td>${esc(a.note || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">세부 일자 기록은 요약본으로 보관되었습니다.</p>'}`;
      else {
        const v = (r.payload.versions || []).slice(-1)[0]; const d = r.payload.doc;
        if (d.kind === 'sheet') { await WD.editors.sheet.ensure(); body = WD.editors.sheet.toHtml(v?.content); }
        else if (d.kind === 'doc') body = `<div class="ql-editor">${v?.content || ''}</div>`;
        else body = `<p class="muted">파일 형식 문서: ${esc(v?.content?.name || '')} (원본은 파일 저장소에 보관)</p>`;
      }
      const m = WD.ui.modal({ title: `보관 기록 · ${r.title}`, size: 'lg', hideOk: true, cancelText: '닫기', body: `<div class="protected vault-view" id="vv">${body}</div><p class="tiny muted mt-s">보존 근거: ${esc(r.basis || '')} · 보존 기한 ${r.retainUntil}</p>` });
      WD.sec.watermark(m.el.querySelector('#vv'), { label: '법정 보관 DB · 최고 관리자 열람' });
    }));
  };

  /* ---------------- 감사 로그 ---------------- */
  V.audit = (el, p, q, u) => {
    const db = WD.db;
    const DENY = ['DOWNLOAD_DENIED', 'PRINT_DENIED', 'COPY_DENIED', 'CAPTURE_DENIED', 'ACCESS_DENIED', 'LOGIN_BLOCKED', 'VAULT_DENIED', 'LOGIN_FAIL'];
    const GROUPS = { all: '전체', view: '열람', edit: '수정·버전', send: '발송', wf: '승인·반려', hr: '퇴사·권한 회수', deny: '보안 차단', export: '반출', auth: '로그인' };
    const inGroup = (a, g) => ({ all: true, view: ['DOC_VIEW', 'VAULT_VIEW'].includes(a), edit: ['DOC_EDIT', 'DOC_CREATE', 'DOC_UPLOAD', 'DOC_MOVE'].includes(a), send: a === 'DISPATCH', wf: a.startsWith('WF_') || a.startsWith('CONTRACT_'), hr: ['RESIGN_HANDOVER', 'RESIGN_CONFIRM', 'SESSION_REVOKE', 'VAULT_MOVE', 'USER_CREATE'].includes(a), deny: DENY.includes(a), export: a === 'DOC_DOWNLOAD', auth: ['LOGIN', 'LOGOUT', 'LOGIN_FAIL', 'LOGIN_BLOCKED'].includes(a) }[g]);
    const g = q.f || 'all';
    const users = [...new Set(db.auditLogs.map((l) => l.userName))];
    let logs = db.auditLogs.filter((l) => inGroup(l.action, g));
    if (q.user) logs = logs.filter((l) => l.userName === q.user);
    if (q.from) logs = logs.filter((l) => l.at.slice(0, 10) >= q.from);
    if (q.to) logs = logs.filter((l) => l.at.slice(0, 10) <= q.to);
    if (q.s) logs = logs.filter((l) => `${l.targetName} ${l.detail}`.toLowerCase().includes(q.s.toLowerCase()));
    const qs = (o) => '#/audit?' + new URLSearchParams(Object.fromEntries(Object.entries({ ...q, ...o }).filter(([, v]) => v))).toString();
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>감사 로그 (Audit Trail)</h1><p class="muted">문서 열람 시각, 수정 버전(v1, v2…), 원클릭 발송, 승인/반려, 반출·차단, 퇴사 권한 회수 내역을 사용자·일시 기준으로 자동 기록합니다. 기록은 추가만 가능(append-only)하며 최고 관리자만 조회할 수 있습니다.</p></div>
        <button class="btn ghost" data-csv>${I('download')} CSV 반출</button></div>
      <div class="chips">${Object.entries(GROUPS).map(([k, v]) => `<a class="chip ${g === k ? 'active' : ''} ${k === 'deny' ? 'danger' : ''}" href="${qs({ f: k === 'all' ? '' : k })}">${v} <em>${db.auditLogs.filter((l) => inGroup(l.action, k)).length}</em></a>`).join('')}</div>
      <form class="card filters" id="af"><select name="user"><option value="">모든 사용자</option>${users.map((x) => `<option ${q.user === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <input type="date" name="from" value="${q.from || ''}"><span>~</span><input type="date" name="to" value="${q.to || ''}"><input name="s" placeholder="대상·상세 검색" value="${esc(q.s || '')}"><button class="btn primary sm">조회</button><a class="btn ghost sm" href="#/audit">초기화</a></form>
      <div class="card flush scroll-x"><table class="tbl audit-tbl"><thead><tr><th>일시</th><th>사용자</th><th>권한</th><th>행위</th><th>대상</th><th>상세</th></tr></thead><tbody>
      ${logs.slice(0, 400).map((l) => `<tr class="${DENY.includes(l.action) ? 'deny' : ''}"><td class="nowrap muted">${WD.fmtDT(l.at)}<small>:${new Date(l.at).getSeconds().toString().padStart(2, '0')}</small></td><td class="nowrap"><b>${esc(l.userName)}</b></td><td><span class="tag">${esc(l.role)}</span></td><td class="nowrap"><span class="act act-${l.action.split('_')[0].toLowerCase()} ${DENY.includes(l.action) ? 'act-deny' : ''}">${esc(WD.AUDIT_LABEL[l.action] || l.action)}</span></td><td>${l.targetType === 'document' && WD.doc(l.targetId) ? `<a href="#/doc/${l.targetId}">${esc(l.targetName)}</a>` : esc(l.targetName)}</td><td class="muted">${esc(l.detail)}</td></tr>`).join('')}
      </tbody></table>${logs.length ? (logs.length > 400 ? `<p class="muted pad tiny">최근 400건 표시 (전체 ${logs.length}건 · CSV로 전체 반출)</p>` : '') : WD.ui.empty('조건에 맞는 기록이 없습니다.', 'audit')}</div></div>`;
    el.querySelector('#af').addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); location.hash = qs({ user: f.get('user'), from: f.get('from'), to: f.get('to'), s: f.get('s') }); });
    el.querySelector('[data-csv]').addEventListener('click', () => WD.sec.exportDoc({ type: 'audit', title: '감사로그' }, 'CSV', () => {
      const csv = ['일시,사용자,권한,행위,대상유형,대상,상세,브라우저', ...logs.map((l) => [l.at, l.userName, l.role, WD.AUDIT_LABEL[l.action] || l.action, l.targetType, l.targetName, l.detail, l.ua].map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
      WD.sec.saveBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), `우리두리_감사로그_${WD.ymd()}.csv`);
    }));
  };

  /* ---------------- 원클릭 런처 ---------------- */
  V.launcher = (el, p, q, u) => {
    const db = WD.db;
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>원클릭 런처</h1><p class="muted">블로그·인스타그램·주요 거래처·업무 포털 바로가기를 관리합니다. 대시보드에서 한 번에 접속하세요.</p></div><button class="btn primary" data-add>${I('plus')} 바로가기 추가</button></div>
      <div class="card">${WD.launcherGrid(db.launchers)}</div>
      <div class="card flush"><table class="tbl"><thead><tr><th>이름</th><th>주소</th><th>분류</th><th>색상</th><th></th></tr></thead><tbody>
      ${db.launchers.map((l) => `<tr><td><b>${esc(l.name)}</b></td><td class="muted">${esc(l.url)}</td><td>${esc(l.category || '')}</td><td><span class="swatch" style="background:${esc(l.color)}"></span></td><td class="r nowrap"><button class="btn sm ghost" data-edit="${l.id}">${I('pen')}</button> <button class="btn sm ghost" data-del="${l.id}">${I('trash')}</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
    const form = (l = {}) => WD.ui.modal({ title: l.id ? '바로가기 수정' : '바로가기 추가', okText: '저장',
      body: `<div class="grid2"><label class="fld"><span>이름</span><input data-k="name" value="${esc(l.name || '')}" placeholder="예) ○○초 방과후 포털"></label><label class="fld"><span>분류</span><input data-k="category" value="${esc(l.category || '')}" list="lcats"><datalist id="lcats"><option>홍보</option><option>업무 포털</option><option>거래처</option><option>기관</option></datalist></label>
        <label class="fld full"><span>주소 (https://)</span><input data-k="url" value="${esc(l.url || 'https://')}"></label><label class="fld"><span>색상</span><input type="color" data-k="color" value="${esc(l.color || '#2f7d62')}"></label></div>`,
      onOk: (w) => { const v = {}; w.querySelectorAll('[data-k]').forEach((i) => (v[i.dataset.k] = i.value.trim())); if (!v.name || !/^https?:\/\//.test(v.url)) throw new Error('이름과 올바른 주소(https://)를 입력하세요.'); WD.tx((d) => { if (l.id) Object.assign(d.launchers.find((x) => x.id === l.id), v); else d.launchers.push({ id: WD.uid('l'), ...v }); WD.audit('LAUNCHER_EDIT', { type: 'launcher', name: v.name }, v.url); }); WD.app.refresh(); } });
    el.querySelector('[data-add]').addEventListener('click', () => form());
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => form(db.launchers.find((x) => x.id === b.dataset.edit))));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { WD.tx((d) => { d.launchers = d.launchers.filter((x) => x.id !== b.dataset.del); }); WD.app.refresh(); }));
  };

  /* ---------------- 아키텍처·보안 설계 ---------------- */
  V.system = (el, p, q, u) => {
    const doc = (f, label) => `<a class="doc-link" href="${REPO}/blob/main/${f}" target="_blank" rel="noopener">${I('doc')}<span><b>${label}</b><small>${f}</small></span></a>`;
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>아키텍처 · 보안 설계</h1><p class="muted">${esc(WD.BRAND)} MVP 구조와 운영 전환 설계 요약입니다. 전체 문서는 저장소 docs/ 폴더에 있습니다.</p></div></div>
      <div class="doc-links">${doc('docs/ARCHITECTURE.md', '전체 시스템 아키텍처·폴더 구조')}${doc('docs/schema.sql', 'DB 스키마 (PostgreSQL + RLS)')}${doc('docs/security-rules.md', '보안 규칙 (반출 차단·감사 로그·퇴사자 통제)')}${doc('server/README.md', '서버 레퍼런스 코드 (Node/Express)')}</div>
      <div class="card"><h3>시스템 구성</h3>
        <div class="arch">
          <div class="arch-col"><div class="arch-h">클라이언트 (브라우저)</div><div class="arch-b">SPA (HTML/CSS/JS)<small>역할별 UI · 해시 라우터</small></div><div class="arch-b">웹 오피스<small>x-spreadsheet+SheetJS · Quill 2 · rhwp(WASM)</small></div><div class="arch-b warn">반출 억제 계층<small>워터마크 · 우클릭/복사/인쇄 차단 · 다운로드 버튼 잠금</small></div></div>
          <div class="arch-arrow">${I('arrow')}<small>HTTPS · HttpOnly 세션 쿠키</small></div>
          <div class="arch-col"><div class="arch-h">API 서버</div><div class="arch-b">인증·세션 검증<small>매 요청 role·status·revoked 재확인</small></div><div class="arch-b">권한 엔진 (RBAC+폴더 ACL)<small>ADMIN / MANAGER(실장) / STAFF / RESIGNED</small></div><div class="arch-b warn">반출 게이트<small>ADMIN만 서명 URL(60초) 발급</small></div><div class="arch-b">워크플로우·발송·알림</div></div>
          <div class="arch-arrow">${I('arrow')}</div>
          <div class="arch-col"><div class="arch-h">데이터</div><div class="arch-b">PostgreSQL (app 스키마)<small>문서·버전·워크플로우·근태·계약 + RLS</small></div><div class="arch-b vault">보관 DB (vault 스키마)<small>최고 관리자 전용 · 별도 롤 · 암호화</small></div><div class="arch-b">비공개 오브젝트 스토리지<small>원본 파일 · 공개 URL 없음</small></div><div class="arch-b">audit_logs (append-only)<small>해시 체인 · UPDATE/DELETE 금지</small></div></div>
        </div>
        <p class="tiny muted">현재 버전은 서버 없이 브라우저 저장소(localStorage = app DB, 분리 키 = vault, IndexedDB = 파일 스토리지)로 같은 흐름을 재현합니다. 브라우저 측 차단은 억제 수단이며, 운영에서는 서버 권한 검증이 최종 방어선입니다.</p></div>
      <div class="grid2">
        <div class="card"><h3>권한 매트릭스 (문서 유출 방지)</h3><table class="tbl compact"><thead><tr><th>기능</th><th class="c">최고 관리자</th><th class="c">실장</th><th class="c">직원</th><th class="c">비활성(퇴사)</th></tr></thead><tbody>
          ${[['로그인', '✔', '✔', '✔', '✖ 즉시 차단'], ['문서 작성(새 버전 저장)', '✔', '✔ 관리자 전용 폴더 제외', '✔ 폴더 권한 내', '✖'], ['문서 열람', '✔ 전체', '✔ 관리자 전용 폴더 제외', '✔ 폴더 권한 내', '✖'], ['파일 다운로드 · PDF/엑셀 내보내기', '✔ (기록)', '✖ 차단', '✖ 차단', '✖'], ['우클릭 · 복사(Ctrl+C) · 인쇄(Ctrl+P)', '✔', '✖ 차단·기록', '✖ 차단·기록', '✖'], ['한글(HWP) 편집', '✔', '보안 열람만', '보안 열람만', '✖'], ['결재 승인·보완 요청', '✔', '✖', '✖', '✖'], ['계정 발급·비활성화 · 보관 DB · 감사 로그', '✔', '✖', '✖', '✖']].map((r) => `<tr><td>${r[0]}</td><td class="c">${r[1]}</td><td class="c">${r[2]}</td><td class="c">${r[3]}</td><td class="c">${r[4]}</td></tr>`).join('')}</tbody></table></div>
        <div class="card"><h3>오픈소스 구성 (무료)</h3><table class="tbl compact"><tbody>
          <tr><td>스프레드시트</td><td>x-data-spreadsheet (MIT) + SheetJS CE (Apache-2.0)</td></tr><tr><td>문서 편집기</td><td>Quill 2 (BSD-3), mammoth.js (BSD-2), html2pdf.js (MIT)</td></tr>
          <tr><td>한글 HWP/HWPX</td><td>rhwp @rhwp/editor (MIT, Rust+WASM)</td></tr><tr><td>PDF 보안 뷰어</td><td>PDF.js (Apache-2.0)</td></tr><tr><td>차트</td><td>Chart.js (MIT)</td></tr><tr><td>글꼴</td><td>Pretendard, 나눔·고운 (OFL)</td></tr></tbody></table></div>
      </div>

    </div>`;
  };
})();
