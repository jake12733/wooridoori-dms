/* =========================================================================
 * 계약서(근로·위촉) 관리 · 전자서명 · 대표 직인 · 만료 알림/갱신
 * 출결·근태 · 인사/퇴사 관리(인수인계 → 즉시 차단 → 법정 보관 DB 이관)
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const V = (WD.views = WD.views || {});
  const I = (n, c) => WD.icon(n, c);
  const esc = WD.esc;
  const CST = { DRAFT: ['초안', 'st-draft'], SENT: ['서명 대기', 'st-pending'], SIGNED: ['직원 서명 완료', 'st-resubmitted'], SEALED: ['날인·잠금 완료', 'st-approved'] };
  const cBadge = (s) => `<span class="badge ${CST[s][1]}">${CST[s][0]}</span>`;

  /* ---------- 대표 전자 직인 (SVG) ---------- */
  WD.sealSvg = () => `<svg class="seal" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-label="우리두리사회적협동조합 대표 직인">
    <defs><path id="sealArc" d="M60,60 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0"/></defs>
    <circle cx="60" cy="60" r="55" fill="none" stroke="#c8102e" stroke-width="5"/><circle cx="60" cy="60" r="31" fill="none" stroke="#c8102e" stroke-width="2"/>
    <text font-size="12.5" font-weight="700" fill="#c8102e" letter-spacing="1.2" font-family="'Nanum Myeongjo',serif"><textPath href="#sealArc" startOffset="2%">우리두리사회적협동조합 ✦ 우리두리사회적협동조합 ✦</textPath></text>
    <text x="60" y="56" text-anchor="middle" font-size="15" font-weight="800" fill="#c8102e" font-family="'Nanum Myeongjo',serif">대표이사</text>
    <text x="60" y="76" text-anchor="middle" font-size="15" font-weight="800" fill="#c8102e" font-family="'Nanum Myeongjo',serif">之印</text></svg>`;

  /* ---------- 계약서 본문 렌더 ---------- */
  WD.renderContract = (c) => {
    const emp = WD.user(c.userId) || { name: c.userName || '(퇴사자)', phone: '' };
    const ceo = WD.db.users.find((x) => x.role === 'CEO');
    const yr = (s) => s ? `${s.slice(0, 4)}년 ${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일` : '';
    const isEmp = c.kind === '근로';
    const pay = isEmp ? `${c.payType} ${WD.won(c.pay)}` : `${c.payType} ${WD.won(c.pay)}`;
    const clauses = isEmp ? [
      ['근로계약기간', `${yr(c.start)}부터 ${yr(c.end)}까지`], ['근무장소', c.place], ['업무의 내용', c.duties],
      ['소정근로시간', c.workHours], ['근무일/휴일', `${c.workDays} / 주휴일: 매주 일요일`],
      ['임금', `${pay} (기본급 포함, 지급일: ${c.payDay}, 근로자 명의 예금통장에 입금)`],
      ['연차유급휴가', '근로기준법에서 정하는 바에 따라 부여함'], ['사회보험 적용', '고용보험 · 산재보험 · 국민연금 · 건강보험'],
      ['근로계약서 교부', '사업주는 계약 체결과 동시에 본 계약서를 사본하여 근로자에게 교부함(전자문서 교부 포함)'],
      ['기타', '이 계약에 정함이 없는 사항은 근로기준법 및 조합 취업규칙에 따름'],
    ] : [
      ['위촉기간', `${yr(c.start)}부터 ${yr(c.end)}까지`], ['강의 장소', c.place], ['위촉 업무(과목)', c.duties],
      ['강의 일정', `${c.workDays} ${c.workHours}`], ['강의료', `${pay} (지급일: ${c.payDay})`],
      ['소득 구분', '사업소득(3.3% 원천징수). 본 계약은 근로계약이 아닌 위촉(용역) 계약임'],
      ['수강생 안전', '아동·청소년 안전 및 인권 보호 지침을 준수하며, 성범죄·아동학대 전력 조회에 동의함'],
      ['비밀유지', '강의 중 취득한 수강생 개인정보 및 조합 자료를 외부에 유출하거나 반출하지 않음'],
      ['계약 해지', '일방이 계약을 위반한 경우 상대방은 14일 전 서면 통지로 해지할 수 있음'],
    ];
    return `<article class="contract-doc">
      <div class="cd-brand">${esc(WD.BRAND)}</div>
      <h2>${isEmp ? '근 로 계 약 서' : '강 사 위 촉 계 약 서'}</h2>
      <p class="cd-lead"><b>${esc(WD.ORG)}</b>(이하 "${isEmp ? '사업주' : '위촉자'}"라 함)과(와) <b>${esc(emp.name)}</b>(이하 "${isEmp ? '근로자' : '강사'}"라 함)은 다음과 같이 ${isEmp ? '근로' : '위촉'}계약을 체결한다.</p>
      <ol class="cd-clauses">${clauses.map(([k, v]) => `<li><b>${k}</b><span>${esc(v)}</span></li>`).join('')}</ol>
      <p class="cd-date">${yr(c.sealedAt ? WD.ymd(new Date(c.sealedAt)) : c.start)}</p>
      <div class="cd-sign">
        <div class="cd-party"><small>(${isEmp ? '사업주' : '위촉자'})</small><b>${esc(WD.ORG)}</b><span>대표이사 ${esc(ceo?.name || '')}</span>
          <div class="cd-mark">${c.status === 'SEALED' ? WD.sealSvg() : '<span class="cd-wait">(직인 대기)</span>'}</div></div>
        <div class="cd-party"><small>(${isEmp ? '근로자' : '강사'})</small><b>${esc(emp.name)}</b><span>연락처 ${esc(emp.phone || '')}</span>
          <div class="cd-mark">${c.employeeSign ? `<img src="${c.employeeSign}" alt="${esc(emp.name)} 전자서명">` : '<span class="cd-wait">(서명 대기)</span>'}</div></div>
      </div>
      ${c.status === 'SEALED' ? `<div class="cd-lock">${I('lock', 'xs')} 전자서명 ${WD.fmtDT(c.employeeSignedAt)} · 대표 직인 ${WD.fmtDT(c.sealedAt)} · 완료 문서 잠금</div>` : ''}
    </article>`;
  };

  function contractForm(u, base = {}, onSave) {
    const kind = base.kind || '근로';
    const staff = WD.staffUsers();
    const m = WD.ui.modal({ title: `${kind === '근로' ? '근로계약서' : '위촉계약서'} ${base.id ? '수정' : '작성'}`, size: 'lg', okText: '저장 (초안)',
      body: `<div class="grid2">
        <label class="fld"><span>계약 유형</span><select data-k="kind"><option ${kind === '근로' ? 'selected' : ''}>근로</option><option ${kind === '위촉' ? 'selected' : ''}>위촉</option></select></label>
        <label class="fld"><span>대상 직원</span><select data-k="userId">${staff.map((s) => `<option value="${s.id}" ${s.id === base.userId ? 'selected' : ''}>${esc(s.name)} (${esc(s.empType)} · ${esc(s.dept)})</option>`).join('')}</select></label>
        <label class="fld"><span>계약 시작일</span><input type="date" data-k="start" value="${base.start || WD.ymd()}"></label>
        <label class="fld"><span>계약 종료일</span><input type="date" data-k="end" value="${base.end || WD.addDays(364)}"></label>
        <label class="fld full"><span>근무(강의) 장소</span><input data-k="place" value="${esc(base.place || '우리두리 배움터 (서울시 ○○구 ○○로 12)')}"></label>
        <label class="fld full"><span>업무 내용 / 강의 과목</span><input data-k="duties" value="${esc(base.duties || '')}" placeholder="예) 방과후 미술 강의"></label>
        <label class="fld"><span>근무일</span><input data-k="workDays" value="${esc(base.workDays || (kind === '근로' ? '월~금 (주 5일)' : '화·목'))}"></label>
        <label class="fld"><span>근무시간</span><input data-k="workHours" value="${esc(base.workHours || (kind === '근로' ? '09:00~18:00 (휴게 12:00~13:00)' : '14:00~17:00'))}"></label>
        <label class="fld"><span>임금 형태</span><select data-k="payType">${['월급', '시급', '강의료(시간당)', '강의료(회당)'].map((x) => `<option ${x === (base.payType || (kind === '근로' ? '월급' : '강의료(시간당)')) ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="fld"><span>금액(원)</span><input type="number" data-k="pay" value="${base.pay || ''}" placeholder="예) 2600000"></label>
        <label class="fld full"><span>지급일·방법</span><input data-k="payDay" value="${esc(base.payDay || (kind === '근로' ? '매월 10일' : '익월 5일 (3.3% 원천징수)'))}"></label>
      </div>`,
      onOk: (w) => {
        const v = {}; w.querySelectorAll('[data-k]').forEach((i) => (v[i.dataset.k] = i.value));
        if (!v.duties || !v.pay) throw new Error('업무 내용과 금액을 입력하세요.');
        if (v.end <= v.start) throw new Error('종료일이 시작일보다 늦어야 합니다.');
        v.pay = Number(v.pay);
        onSave(v);
      } });
    return m;
  }

  function signaturePad(title) {
    return new Promise((resolve) => {
      const m = WD.ui.modal({ title, okText: '서명 완료', size: 'md',
        body: `<p class="muted">아래 칸에 마우스·손가락·펜으로 서명하세요.</p><canvas class="sign-pad" width="560" height="200"></canvas><div class="row gap-s mt-s"><button type="button" class="btn sm ghost" data-clear>${I('refresh')} 다시 쓰기</button><label class="chk"><input type="checkbox" data-agree> 계약 내용을 모두 확인했으며 전자서명에 동의합니다.</label></div>`,
        onOk: (w) => {
          if (!strokes) throw new Error('서명을 입력하세요.');
          if (!w.querySelector('[data-agree]').checked) throw new Error('전자서명 동의에 체크하세요.');
          resolve(cv.toDataURL('image/png'));
        } });
      const cv = m.el.querySelector('canvas'); const g = cv.getContext('2d');
      g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1d2a26';
      let drawing = false, strokes = 0;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
      cv.addEventListener('pointerdown', (e) => { drawing = true; strokes++; cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); });
      cv.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); });
      cv.addEventListener('pointerup', () => (drawing = false));
      m.el.querySelector('[data-clear]').addEventListener('click', () => { g.clearRect(0, 0, cv.width, cv.height); strokes = 0; });
      m.el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => resolve(null)));
    });
  }

  function renewDraft(c) {
    const u = WD.auth.current();
    const start = WD.addDays(1, new Date(c.end + 'T00:00:00'));
    const endD = new Date(start + 'T00:00:00'); endD.setFullYear(endD.getFullYear() + 1); endD.setDate(endD.getDate() - 1);
    const emp = WD.user(c.userId);
    const n = WD.tx((db) => {
      const nc = { ...JSON.parse(JSON.stringify(c)), id: WD.uid('c'), title: `${c.kind === '근로' ? '근로계약서' : '위촉계약서'} (${emp?.name}) ${start.slice(0, 4)} 갱신`, start, end: WD.ymd(endD), status: 'DRAFT', locked: false, employeeSign: null, employeeSignedAt: null, sealedAt: null, renewedFrom: c.id, createdAt: WD.now() };
      db.contracts.push(nc);
      WD.audit('CONTRACT_RENEW', { type: 'contract', id: nc.id, name: nc.title }, `원 계약 ${c.title} (만료 ${c.end}) 기반 갱신 초안`);
      return nc;
    });
    WD.ui.toast('갱신 초안을 불러왔습니다. 조건 확인 후 서명 요청을 보내세요.');
    WD.app.go(`#/contract/${n.id}`);
    return u;
  }

  /* ---------------- 계약서 목록 ---------------- */
  V.contracts = (el, p, q, u) => {
    const db = WD.db; const isCEO = u.role === 'CEO';
    const list = db.contracts.filter((c) => isCEO || c.userId === u.id).sort((a, b) => (a.end > b.end ? 1 : -1));
    const alerts = WD.wf.expiryAlerts(isCEO ? null : u.id);
    const buckets = ['D-7', 'D-14', 'D-30'];
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>계약서 관리</h1><p class="muted">근로계약서(정규직·직원)·위촉계약서(강사·프리랜서) 작성 → 서명 요청 → 캔버스 전자서명 → 대표 전자 직인 날인 → 완료 문서 잠금. 종료 D-30·D-14·D-7 자동 알림.</p></div>
        ${isCEO ? `<div class="row gap-s"><button class="btn primary" data-new="근로">${I('plus')} 근로계약서</button><button class="btn ghost" data-new="위촉">${I('plus')} 위촉계약서</button></div>` : ''}</div>
      <div class="alert-board">${buckets.map((b) => { const xs = alerts.filter((a) => a.bucket === b); return `<div class="ab-col ab-${b.replace('-', '').toLowerCase()}"><div class="ab-head"><b>${b}</b><small>${b === 'D-7' ? '7일 이내' : b === 'D-14' ? '8~14일' : '15~30일'}</small><em>${xs.length}</em></div>
        ${xs.map((a) => `<div class="ab-item"><div><span class="tag">${a.kind}</span> <a href="${a.link}"><b>${esc(a.title)}</b></a><small>만료일 ${a.end} · D-${a.days}</small></div>${a.kind === '계약 종료' && isCEO ? (a.renewed ? '<span class="tag ok">갱신 초안 있음</span>' : `<button class="btn sm primary" data-renew="${a.refId}">갱신 초안</button>`) : ''}</div>`).join('') || '<p class="muted tiny">없음</p>'}</div>`; }).join('')}</div>
      <div class="card flush"><table class="tbl"><thead><tr><th>계약서</th><th>유형</th><th>대상</th><th>계약 기간</th><th>상태</th><th>만료</th><th class="r">작업</th></tr></thead><tbody>
      ${list.map((c) => `<tr class="click" data-href="#/contract/${c.id}"><td>${I('contract')} <b>${esc(c.title)}</b>${c.renewedFrom ? ' <span class="tag">갱신</span>' : ''}</td><td>${c.kind === '근로' ? '근로계약' : '위촉계약'}</td><td>${esc(WD.userName(c.userId))}</td><td class="nowrap">${c.start} ~ ${c.end}</td><td>${cBadge(c.status)}</td><td>${c.status === 'SEALED' ? WD.ui.dday(WD.daysLeft(c.end)) : '-'}</td><td class="r"><a class="btn sm ghost" href="#/contract/${c.id}">열기</a></td></tr>`).join('')}
      </tbody></table>${list.length ? '' : WD.ui.empty('계약서가 없습니다.', 'contract')}</div></div>`;
    el.querySelectorAll('[data-href]').forEach((r) => r.addEventListener('click', (e) => { if (!e.target.closest('a,button')) location.hash = r.dataset.href; }));
    el.querySelectorAll('[data-renew]').forEach((b) => b.addEventListener('click', () => renewDraft(db.contracts.find((c) => c.id === b.dataset.renew))));
    el.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => contractForm(u, { kind: b.dataset.new }, (v) => {
      const emp = WD.user(v.userId);
      const c = WD.tx((db2) => { const nc = { ...v, id: WD.uid('c'), title: `${v.kind === '근로' ? '근로계약서' : '위촉계약서'} (${emp.name})`, status: 'DRAFT', locked: false, createdAt: WD.now(), folderId: v.kind === '근로' ? 'f_hr_emp' : 'f_hr_inst' }; db2.contracts.push(nc); WD.audit('CONTRACT_CREATE', { type: 'contract', id: nc.id, name: nc.title }); return nc; });
      WD.app.go(`#/contract/${c.id}`);
    })));
  };

  /* ---------------- 계약서 상세 ---------------- */
  V.contract = (el, { id }, q, u) => {
    const db = WD.db; const c = db.contracts.find((x) => x.id === id);
    if (!c) { el.innerHTML = `<div class="page">${WD.ui.empty('계약서를 찾을 수 없습니다. (퇴사자 계약서는 법정 보관 DB로 이관됩니다)', 'alert')}</div>`; return; }
    const isCEO = u.role === 'CEO';
    if (!isCEO && c.userId !== u.id) { WD.auditTx('ACCESS_DENIED', { type: 'contract', id: c.id, name: c.title }, '타인 계약서 열람 시도'); V.forbidden(el); return; }
    WD.auditTx('DOC_VIEW', { type: 'contract', id: c.id, name: c.title }, `계약서 열람 (${CST[c.status][0]})`);
    const steps = ['DRAFT', 'SENT', 'SIGNED', 'SEALED'];
    const si = steps.indexOf(c.status);
    el.innerHTML = `<div class="page">
      <div class="crumb"><a href="#/contracts">계약서 관리</a> / ${esc(c.title)}</div>
      <div class="page-head"><div><h1>${esc(c.title)}</h1><div class="row gap-s center">${cBadge(c.status)} ${c.status === 'SEALED' ? WD.ui.dday(WD.daysLeft(c.end)) : ''} ${c.locked ? `<span class="tag lock">${I('lock', 'xs')} 잠금</span>` : ''}${c.renewedFrom ? ' <span class="tag">갱신 계약</span>' : ''}</div></div>
        <div class="row gap-s wrap">
          ${isCEO && c.status === 'DRAFT' ? `<button class="btn ghost" data-edit>${I('pen')} 조건 수정</button><button class="btn accent" data-send>${I('send')} 서명 요청 발송</button>` : ''}
          ${c.userId === u.id && c.status === 'SENT' ? `<button class="btn accent" data-sign>${I('pen')} 전자서명하기</button>` : ''}
          ${isCEO && c.status === 'SENT' ? '<span class="muted">직원 서명 대기 중</span>' : ''}
          ${isCEO && c.status === 'SIGNED' ? `<button class="btn success" data-seal>${I('stamp')} 대표 직인 날인·잠금</button>` : ''}
          ${isCEO && c.status === 'SEALED' ? `<button class="btn ghost" data-renew>${I('refresh')} 재계약/갱신 초안</button>` : ''}
          <button class="btn ${isCEO ? 'ghost' : 'locked'}" data-pdf>${I(isCEO ? 'download' : 'lock')} ${isCEO ? 'PDF 반출' : '반출 차단'}</button>
        </div></div>
      <div class="steps">${['초안 작성', '서명 요청', '직원 전자서명', '대표 직인·잠금'].map((s, i) => `<div class="step ${i <= si ? 'done' : ''} ${i === si ? 'cur' : ''}"><span>${i + 1}</span><b>${s}</b></div>`).join('')}</div>
      <div class="contract-wrap protected" id="cw">${WD.renderContract(c)}</div></div>`;
    WD.sec.watermark(el.querySelector('#cw'));
    const save = (fn, action, detail) => { WD.tx((d) => { const x = d.contracts.find((y) => y.id === c.id); fn(x, d); WD.audit(action, { type: 'contract', id: c.id, name: c.title }, detail); }); WD.app.refresh(); };
    el.querySelector('[data-edit]')?.addEventListener('click', () => contractForm(u, c, (v) => save((x) => Object.assign(x, v), 'CONTRACT_CREATE', '초안 조건 수정')));
    el.querySelector('[data-send]')?.addEventListener('click', () => save((x) => { x.status = 'SENT'; x.sentAt = WD.now(); WD.notify(x.userId, { title: `계약서 서명 요청: ${x.title}`, body: '내용 확인 후 전자서명해 주세요.', link: `#/contract/${x.id}`, type: 'SIGN' }); }, 'DISPATCH', `서명 요청 → ${WD.userName(c.userId)}`));
    el.querySelector('[data-sign]')?.addEventListener('click', async () => {
      const sig = await signaturePad('전자서명'); if (!sig) return;
      save((x) => { x.employeeSign = sig; x.employeeSignedAt = WD.now(); x.status = 'SIGNED'; WD.ceos().forEach((ce) => WD.notify(ce.id, { title: `서명 완료: ${x.title}`, body: `${u.name}님이 전자서명했습니다. 직인 날인이 필요합니다.`, link: `#/contract/${x.id}`, type: 'APPROVAL' })); }, 'CONTRACT_SIGN', '캔버스 전자서명');
      WD.ui.toast('전자서명이 완료되었습니다.');
    });
    el.querySelector('[data-seal]')?.addEventListener('click', async () => {
      if (!(await WD.ui.confirm('대표 직인 날인', '전자 직인을 날인하고 계약서를 잠급니다. 이후 수정할 수 없습니다.'))) return;
      save((x) => { x.status = 'SEALED'; x.sealedAt = WD.now(); x.locked = true; WD.notify(x.userId, { title: `계약 체결 완료: ${x.title}`, body: '대표 직인이 날인되어 계약서가 확정·잠금되었습니다.', link: `#/contract/${x.id}`, type: 'APPROVED' }); }, 'CONTRACT_SEAL', '전자 직인 날인 · 완료 문서 잠금');
    });
    el.querySelector('[data-renew]')?.addEventListener('click', () => renewDraft(c));
    el.querySelector('[data-pdf]').addEventListener('click', () => WD.sec.exportDoc({ type: 'contract', id: c.id, title: c.title }, 'PDF', async () => {
      await WD.editors.doc.ensure();
      const blob = await WD.editors.doc.toPdfBlob(c.title, WD.renderContract(c));
      WD.sec.saveBlob(blob, `${c.title}.pdf`);
    }));
  };

  /* ---------------- 출결·근태 ---------------- */
  const AST = ['근무', '지각', '조퇴', '병가', '휴가', '대강'];
  const ACLS = { 근무: 'a-work', 지각: 'a-late', 조퇴: 'a-early', 병가: 'a-sick', 휴가: 'a-leave', 대강: 'a-sub' };
  const mins = (a, b) => { if (!a || !b) return 0; const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1) - (h2 - h1 >= 8 ? 60 : 0)); };
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  V.attendance = (el, p, q, u) => {
    const db = WD.db; const isCEO = u.role === 'CEO';
    const month = q.m || WD.monthKey();
    const [Y, M] = month.split('-').map(Number);
    const prev = WD.monthKey(new Date(Y, M - 2, 1)), next = WD.monthKey(new Date(Y, M, 1));
    const days = new Date(Y, M, 0).getDate();
    const people = isCEO ? WD.staffUsers() : [u];
    const recs = db.attendance.filter((a) => a.date.startsWith(month));
    const summary = (uid) => { const s = Object.fromEntries(AST.map((k) => [k, 0])); let m = 0; recs.filter((a) => a.userId === uid).forEach((a) => { s[a.status]++; m += mins(a.in, a.out); }); return { s, hours: (m / 60).toFixed(1) }; };
    const today = WD.ymd();
    const mineToday = db.attendance.find((a) => a.userId === u.id && a.date === today);
    const todayAll = WD.staffUsers().map((x) => ({ x, r: db.attendance.find((a) => a.userId === x.id && a.date === today) }));

    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>선생님 출결 · 근태</h1><p class="muted">출근/퇴근 및 근무·지각·조퇴·병가·휴가·대강 기록과 월별 집계</p></div>
        <div class="seg"><a href="#/attendance?m=${prev}">‹</a><span class="seg-label">${Y}년 ${M}월</span><a href="#/attendance?m=${next}">›</a></div></div>
      ${!isCEO ? `<div class="card clock-card">
        <div><small class="muted">${today} (${'일월화수목금토'[new Date().getDay()]})</small><h2 id="clock-now">${WD.hm()}</h2><p class="muted">기준 근무시간 ${u.workStart} ~ ${u.workEnd}</p></div>
        <div class="clock-state">${mineToday ? `<span class="badge ${ACLS[mineToday.status]}">${mineToday.status}</span><div>출근 <b>${mineToday.in || '-'}</b> · 퇴근 <b>${mineToday.out || '-'}</b></div>` : '<span class="muted">오늘 기록 없음</span>'}</div>
        <div class="row gap-s"><button class="btn primary lg" data-in ${mineToday?.in || ['병가', '휴가'].includes(mineToday?.status) ? 'disabled' : ''}>${I('clock')} 출근</button><button class="btn ghost lg" data-out ${!mineToday?.in || mineToday?.out ? 'disabled' : ''}>퇴근</button><button class="btn ghost" data-req>병가·휴가 신청</button></div>
      </div>` : `<div class="kpis five">
        <div class="kpi"><small>오늘 출근</small><b>${todayAll.filter((t) => t.r?.in).length}</b><span class="muted">/ ${todayAll.length}명</span></div>
        <div class="kpi warn"><small>오늘 지각</small><b>${todayAll.filter((t) => t.r?.status === '지각').length}</b></div>
        <div class="kpi info"><small>휴가·병가</small><b>${todayAll.filter((t) => ['휴가', '병가'].includes(t.r?.status)).length}</b></div>
        <div class="kpi"><small>이번 달 대강</small><b>${recs.filter((r) => r.status === '대강').length}</b></div>
        <div class="kpi danger"><small>이번 달 지각·조퇴</small><b>${recs.filter((r) => ['지각', '조퇴'].includes(r.status)).length}</b></div></div>`}
      <div class="card flush"><div class="sub-head">${I('chart')} ${M}월 집계</div><table class="tbl"><thead><tr><th>직원</th>${AST.map((s) => `<th class="c">${s}</th>`).join('')}<th class="c">총 근무시간</th></tr></thead><tbody>
        ${people.map((x) => { const { s, hours } = summary(x.id); return `<tr><td><div class="row gap-s center">${WD.ui.avatar(x, 24)} <b>${esc(x.name)}</b> <small class="muted">${esc(x.empType)}</small></div></td>${AST.map((k) => `<td class="c">${s[k] ? `<span class="badge ${ACLS[k]}">${s[k]}</span>` : '<span class="muted">0</span>'}</td>`).join('')}<td class="c"><b>${hours}</b>h</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="card flush scroll-x"><div class="sub-head">${I('clock')} 일별 기록 ${isCEO ? '<small>셀을 눌러 수정 (대강 지정 포함)</small>' : ''}</div>
        <table class="tbl att-grid"><thead><tr><th>직원</th>${Array.from({ length: days }, (_, i) => { const d = new Date(Y, M - 1, i + 1); const w = d.getDay(); return `<th class="c ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}">${i + 1}<small>${'일월화수목금토'[w]}</small></th>`; }).join('')}</tr></thead><tbody>
        ${people.map((x) => `<tr><td class="nowrap"><b>${esc(x.name)}</b></td>${Array.from({ length: days }, (_, i) => { const date = `${month}-${WD.pad(i + 1)}`; const r = recs.find((a) => a.userId === x.id && a.date === date); const w = new Date(Y, M - 1, i + 1).getDay(); return `<td class="c cell ${w === 0 || w === 6 ? 'wkend' : ''} ${isCEO ? 'editable' : ''}" data-cell="${x.id}|${date}" title="${r ? `${r.status} ${r.in || ''}~${r.out || ''}${r.subFor ? ' · ' + WD.userName(r.subFor) + ' 대강' : ''}${r.note ? ' · ' + r.note : ''}` : ''}">${r ? `<span class="dot ${ACLS[r.status]}">${r.status[0]}</span>` : ''}</td>`; }).join('')}</tr>`).join('')}
        </tbody></table>
        <div class="legend row gap-s wrap pad">${AST.map((s) => `<span><span class="dot ${ACLS[s]}">${s[0]}</span> ${s}</span>`).join('')}</div></div>
      ${!isCEO ? `<div class="card flush"><div class="sub-head">내 ${M}월 상세</div><table class="tbl"><thead><tr><th>날짜</th><th>상태</th><th>출근</th><th>퇴근</th><th>근무</th><th>비고</th></tr></thead><tbody>${recs.filter((a) => a.userId === u.id).sort((a, b) => (a.date < b.date ? 1 : -1)).map((a) => `<tr><td>${a.date}</td><td><span class="badge ${ACLS[a.status]}">${a.status}</span></td><td>${a.in || '-'}</td><td>${a.out || '-'}</td><td>${(mins(a.in, a.out) / 60).toFixed(1)}h</td><td class="muted">${esc(a.note || '')}${a.subFor ? ' · ' + esc(WD.userName(a.subFor)) + ' 대강' : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>`;

    const tick = setInterval(() => { const c = el.querySelector('#clock-now'); if (c) c.textContent = WD.hm(); }, 15000);
    WD.app.onCleanup(() => clearInterval(tick));
    el.querySelector('[data-in]')?.addEventListener('click', () => {
      const now = WD.hm(); const late = toMin(now) > toMin(u.workStart) + 10;
      WD.tx((d) => { let r = d.attendance.find((a) => a.userId === u.id && a.date === today); if (!r) { r = { id: WD.uid('att'), userId: u.id, date: today, in: '', out: '', status: '근무', note: '', subFor: null }; d.attendance.push(r); } r.in = now; if (r.status !== '대강') r.status = late ? '지각' : '근무'; WD.audit('ATTEND_IN', { type: 'attendance', id: r.id, name: u.name }, `${now}${late ? ' (지각)' : ''}`); });
      WD.ui.toast(`출근 ${now}${late ? ' — 지각으로 기록되었습니다.' : ''}`); WD.app.refresh();
    });
    el.querySelector('[data-out]')?.addEventListener('click', () => {
      const now = WD.hm(); const early = toMin(now) < toMin(u.workEnd) - 10;
      WD.tx((d) => { const r = d.attendance.find((a) => a.userId === u.id && a.date === today); r.out = now; if (early && r.status === '근무') r.status = '조퇴'; WD.audit('ATTEND_OUT', { type: 'attendance', id: r.id, name: u.name }, `${now}${early ? ' (조퇴)' : ''}`); });
      WD.ui.toast(`퇴근 ${now}`); WD.app.refresh();
    });
    el.querySelector('[data-req]')?.addEventListener('click', () => WD.ui.modal({ title: '병가·휴가 신청', okText: '등록',
      body: `<label class="fld"><span>날짜</span><input type="date" data-d value="${today}"></label><label class="fld"><span>구분</span><select data-s><option>휴가</option><option>병가</option></select></label><label class="fld"><span>사유</span><input data-n placeholder="예) 연차, 병원 진료"></label>`,
      onOk: (w) => { const date = w.querySelector('[data-d]').value; const st = w.querySelector('[data-s]').value; WD.tx((d) => { d.attendance = d.attendance.filter((a) => !(a.userId === u.id && a.date === date)); d.attendance.push({ id: WD.uid('att'), userId: u.id, date, in: '', out: '', status: st, note: w.querySelector('[data-n]').value, subFor: null }); WD.audit('ATTEND_EDIT', { type: 'attendance', name: u.name }, `${date} ${st} 신청`); WD.ceos().forEach((c) => WD.notify(c.id, { title: `${st} 신청: ${u.name} (${date})`, body: w.querySelector('[data-n]').value, link: '#/attendance', type: 'INFO' })); }); WD.app.refresh(); } }));
    if (isCEO) el.querySelectorAll('[data-cell]').forEach((td) => td.addEventListener('click', () => {
      const [uid, date] = td.dataset.cell.split('|'); const r = db.attendance.find((a) => a.userId === uid && a.date === date) || {};
      const x = WD.user(uid);
      WD.ui.modal({ title: `${x.name} · ${date} 근태`, okText: '저장',
        body: `<div class="grid2"><label class="fld"><span>상태</span><select data-s><option value="">(기록 없음)</option>${AST.map((s) => `<option ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="fld"><span>대강 대상(누구 수업을 대신)</span><select data-sub><option value="">-</option>${WD.staffUsers().filter((y) => y.id !== uid).map((y) => `<option value="${y.id}" ${r.subFor === y.id ? 'selected' : ''}>${esc(y.name)}</option>`).join('')}</select></label>
          <label class="fld"><span>출근</span><input type="time" data-i value="${r.in || ''}"></label><label class="fld"><span>퇴근</span><input type="time" data-o value="${r.out || ''}"></label>
          <label class="fld full"><span>비고</span><input data-n value="${esc(r.note || '')}"></label></div>`,
        onOk: (w) => {
          const st = w.querySelector('[data-s]').value;
          WD.tx((d) => {
            d.attendance = d.attendance.filter((a) => !(a.userId === uid && a.date === date));
            if (st) d.attendance.push({ id: r.id || WD.uid('att'), userId: uid, date, status: st, in: w.querySelector('[data-i]').value, out: w.querySelector('[data-o]').value, note: w.querySelector('[data-n]').value, subFor: st === '대강' ? w.querySelector('[data-sub]').value || null : null });
            WD.audit('ATTEND_EDIT', { type: 'attendance', id: r.id, name: x.name }, `${date}: ${r.status || '없음'} → ${st || '삭제'}`);
          });
          WD.app.refresh();
        } });
    }));
  };

  /* ---------------- 인사·퇴사 관리 (CEO) ---------------- */
  const RETAIN = { contract: [3, '근로기준법 제42조(계약서류 3년 보존)'], attendance: [3, '근로기준법 제42조·시행령 제22조(근로자명부·근태 3년)'], accounting: [5, '국세기본법 제85조의3(장부·증빙 5년)'], hrdoc: [3, '근로기준법 제42조 준용(인사서류 3년, 보존기간 경과 후 파기)'] };

  function pendingFor(uid) {
    const db = WD.db;
    const docs = db.documents.filter((d) => (d.ownerId === uid || d.assigneeId === uid) && d.status !== 'APPROVED' && WD.folder(d.folderId)?.id !== 'f_hr_rec');
    const contracts = db.contracts.filter((c) => c.userId === uid && c.status !== 'SEALED');
    return { docs, contracts };
  }
  function legalFor(uid) {
    const db = WD.db;
    const contracts = db.contracts.filter((c) => c.userId === uid);
    const attendance = db.attendance.filter((a) => a.userId === uid);
    const acc = db.documents.filter((d) => d.ownerId === uid && d.status === 'APPROVED' && WD.folder(d.folderId)?.parentId === 'f_acc');
    const hr = db.documents.filter((d) => d.ownerId === uid && d.folderId === 'f_hr_rec');
    return { contracts, attendance, acc, hr };
  }

  function resignWizard(target) {
    const pend = pendingFor(target.id);
    const legal = legalFor(target.id);
    const others = WD.activeUsers().filter((x) => x.id !== target.id);
    const opt = (sel = '') => others.map((o) => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>${esc(o.name)} (${esc(o.title)})</option>`).join('');
    const sameDept = others.find((o) => o.dept === target.dept && o.role === 'STAFF')?.id || others.find((o) => o.role === 'CEO')?.id;
    const m = WD.ui.modal({ title: `퇴사 처리 · ${target.name} (${target.title}, ${target.dept})`, size: 'xl', okText: '퇴사 확정 · 즉시 접근 차단', danger: true,
      body: `<div class="wizard">
        <section><h4><span class="wz-n">1</span> 미결 서류·진행 중 문서 인계/이관</h4>
          ${pend.docs.length ? `<div class="row gap-s center mb-s"><span class="muted">일괄 인수자</span><select data-bulk>${opt(sameDept)}</select><button type="button" class="btn sm ghost" data-bulk-apply>모두 적용 + 인계 확인</button></div>
          <table class="tbl compact"><thead><tr><th>문서</th><th>상태</th><th>역할</th><th>인수자</th><th class="c">인계 확인</th></tr></thead><tbody>
          ${pend.docs.map((d) => `<tr><td>${WD.ui.kindIcon(d.kind)} ${esc(d.title)} <small class="muted">${esc(WD.folderPath(d.folderId))}</small></td><td>${WD.ui.status(d.status)}</td><td>${d.ownerId === target.id ? '작성자' : '담당자'}</td><td><select data-to="${d.id}">${opt(sameDept)}</select></td><td class="c"><input type="checkbox" data-ho="${d.id}"></td></tr>`).join('')}
          </tbody></table>` : '<p class="t-ok">진행 중인 미결 문서가 없습니다.</p>'}
          ${pend.contracts.length ? `<p class="tiny warn-txt">${I('alert', 'xs')} 미체결 계약서 ${pend.contracts.length}건은 효력 없이 보관 DB로 이관됩니다: ${pend.contracts.map((c) => esc(c.title)).join(', ')}</p>` : ''}
        </section>
        <section><h4><span class="wz-n">2</span> 퇴사 체크리스트</h4>
          <div class="grid2">
            <label class="fld"><span>퇴사일</span><input type="date" data-date value="${WD.ymd()}"></label>
            <label class="fld"><span>사유</span><select data-reason><option>계약 만료</option><option>자진 퇴사</option><option>권고사직</option><option>기타</option></select></label></div>
          ${['업무 인수인계 면담 완료', '출입카드·노트북·교구 등 지급품 반납', '개인 기기·저장매체의 업무 자료 삭제 확약서 수령', '최종 급여·강의료 정산 및 원천징수 확인'].map((t, i) => `<label class="chk"><input type="checkbox" data-cl="${i}"> ${t}</label>`).join('')}
        </section>
        <section><h4><span class="wz-n">3</span> 확정 시 자동 처리</h4>
          <ul class="auto-list">
            <li>${I('lock')} <b>즉시 로그인 차단</b> — 계정 상태 RESIGNED, 활성 세션 <b>${WD.db.sessions.filter((s) => s.userId === target.id && !s.revokedAt).length}개</b> 즉시 만료(다른 기기·탭 포함 4초 내 강제 로그아웃)</li>
            <li>${I('users')} <b>권한 회수</b> — 폴더 접근·문서 공유 대상·발송 프리셋에서 제거</li>
            <li>${I('vault')} <b>법정 보관 DB 이관 (대표 전용, 일반 영역에서 분리)</b>
              <ul><li>계약서 ${legal.contracts.length}건 · ${RETAIN.contract[1]}</li><li>근태 기록 ${legal.attendance.length}건 · ${RETAIN.attendance[1]}</li><li>승인된 회계·정산 문서 ${legal.acc.length}건 · ${RETAIN.accounting[1]}</li><li>인사기록·제출서류 ${legal.hr.length}건 · ${RETAIN.hrdoc[1]}</li></ul></li>
            <li>${I('audit')} <b>감사 로그</b> — 인수인계·퇴사 확정·세션 회수·보관 이관 내역 기록</li>
          </ul>
        </section></div>`,
      onOk: (w) => {
        const hos = [...w.querySelectorAll('[data-ho]')];
        if (hos.some((c) => !c.checked)) throw new Error('모든 미결 문서의 인계 확인에 체크해야 퇴사를 확정할 수 있습니다.');
        if ([...w.querySelectorAll('[data-cl]')].some((c) => !c.checked)) throw new Error('퇴사 체크리스트를 모두 확인하세요.');
        const transfers = hos.map((c) => ({ docId: c.dataset.ho, to: w.querySelector(`[data-to="${c.dataset.ho}"]`).value }));
        const date = w.querySelector('[data-date]').value; const reason = w.querySelector('[data-reason]').value;
        const result = confirmResign(target, transfers, { date, reason });
        setTimeout(() => WD.ui.modal({ title: '퇴사 처리 완료', hideOk: true, cancelText: '확인', body: `<ul class="auto-list done">
          <li>${I('check')} 인수인계 ${result.handover}건 이관 완료</li><li>${I('lock')} ${esc(target.name)} 계정 로그인 차단 · 세션 ${result.sessions}개 즉시 회수</li>
          <li>${I('users')} 문서 공유 ${result.shares}건 · 발송 프리셋 ${result.presets}건에서 권한 제거</li>
          <li>${I('vault')} 법정 보관 DB 이관 ${result.vault}건 (계약 ${result.counts.contracts}, 근태 ${result.counts.attendance}, 회계 ${result.counts.acc}, 인사서류 ${result.counts.hr})</li></ul>
          <p class="muted tiny">다른 탭에서 ${esc(target.loginId)} 계정으로 로그인해 두었다면 지금 자동 로그아웃되는 것을 확인할 수 있습니다.</p>` }), 50);
        WD.app.refresh();
      } });
    m.el.querySelector('[data-bulk-apply]')?.addEventListener('click', () => { const v = m.el.querySelector('[data-bulk]').value; m.el.querySelectorAll('[data-to]').forEach((s) => (s.value = v)); m.el.querySelectorAll('[data-ho]').forEach((c) => (c.checked = true)); });
  }

  function confirmResign(target, transfers, { date, reason }) {
    const ceo = WD.auth.current();
    if (ceo?.role !== 'CEO') throw new Error('대표만 퇴사 처리할 수 있습니다.');
    const vaultRecs = []; const counts = {};
    const r = WD.tx((db) => {
      const out = { handover: 0, sessions: 0, shares: 0, presets: 0 };
      // 1) 인수인계
      transfers.forEach(({ docId, to }) => {
        const d = db.documents.find((x) => x.id === docId); if (!d) return;
        const role = d.ownerId === target.id ? '작성자' : '담당자';
        if (d.ownerId === target.id) d.ownerId = to;
        if (d.assigneeId === target.id) d.assigneeId = to;
        d.recipients = [...new Set([...(d.recipients || []), to])];
        db.wfEvents.push({ id: WD.uid('wf'), docId, from: d.status, to: d.status, actorId: ceo.id, reason: `퇴사 인수인계: ${target.name} → ${WD.userName(to)} (${role})`, at: WD.now(), version: d.version, handover: true });
        WD.notify(to, { title: `인수인계: ${d.title}`, body: `${target.name}님 퇴사로 ${role} 업무가 이관되었습니다.`, link: `#/doc/${d.id}`, type: 'INFO', docId });
        WD.audit('RESIGN_HANDOVER', { type: 'document', id: d.id, name: d.title }, `${target.name} → ${WD.userName(to)} (${role})`);
        out.handover++;
      });
      // 2) 계정 비활성 + 세션 회수
      const u = db.users.find((x) => x.id === target.id);
      u.prevRole = u.role; u.role = 'RESIGNED'; u.status = 'RESIGNED'; u.resignedAt = new Date(date + 'T18:00:00').toISOString(); u.resignReason = reason;
      out.sessions = WD.auth.revokeAll(db, target.id, 'RESIGNED');
      // 3) 권한 회수
      db.documents.forEach((d) => { if ((d.recipients || []).includes(target.id)) { d.recipients = d.recipients.filter((x) => x !== target.id); out.shares++; } if (d.assigneeId === target.id) d.assigneeId = null; });
      const before = db.presets.length; db.presets = db.presets.filter((p) => p.targetUserId !== target.id); out.presets = before - db.presets.length;
      WD.audit('RESIGN_CONFIRM', { type: 'user', id: target.id, name: target.name }, `퇴사일 ${date} · 사유 ${reason} · 인수인계 ${out.handover}건`);
      WD.audit('SESSION_REVOKE', { type: 'user', id: target.id, name: target.name }, `활성 세션 ${out.sessions}개 즉시 만료 · 공유 ${out.shares}건 · 프리셋 ${out.presets}건 권한 회수`);
      // 4) 법정 보관 DB 이관 (일반 영역에서 제거)
      const L = legalFor(target.id);
      const retain = (y) => { const d = new Date(date + 'T00:00:00'); d.setFullYear(d.getFullYear() + y); return WD.ymd(d); };
      const base = { userId: target.id, userName: target.name, movedAt: WD.now(), movedBy: ceo.id };
      L.contracts.forEach((c) => vaultRecs.push({ ...base, id: WD.uid('vr'), kind: 'contract', title: c.title + (c.status !== 'SEALED' ? ' (미체결)' : ''), retainUntil: retain(RETAIN.contract[0]), basis: RETAIN.contract[1], payload: JSON.parse(JSON.stringify(c)) }));
      if (L.attendance.length) {
        const s = {}; L.attendance.forEach((a) => (s[a.status] = (s[a.status] || 0) + 1));
        vaultRecs.push({ ...base, id: WD.uid('vr'), kind: 'attendance', title: `근태 기록 (${L.attendance.map((a) => a.date).sort()[0]} ~ ${date})`, retainUntil: retain(RETAIN.attendance[0]), basis: RETAIN.attendance[1], payload: { summary: s, rows: L.attendance } });
      }
      [...L.acc.map((d) => ['accounting', d]), ...L.hr.map((d) => ['hrdoc', d])].forEach(([k, d]) => vaultRecs.push({ ...base, id: WD.uid('vr'), kind: 'document', title: d.title, retainUntil: retain(RETAIN[k][0]), basis: RETAIN[k][1], payload: { doc: d, versions: db.versions.filter((v) => v.docId === d.id) } }));
      const moveDocIds = new Set([...L.acc, ...L.hr].map((d) => d.id));
      db.contracts = db.contracts.filter((c) => c.userId !== target.id);
      db.attendance = db.attendance.filter((a) => a.userId !== target.id);
      db.documents = db.documents.filter((d) => !moveDocIds.has(d.id));
      db.versions = db.versions.filter((v) => !moveDocIds.has(v.docId));
      db.submissions = db.submissions.filter((s) => s.userId !== target.id);
      counts.contracts = L.contracts.length; counts.attendance = L.attendance.length; counts.acc = L.acc.length; counts.hr = L.hr.length;
      WD.audit('VAULT_MOVE', { type: 'user', id: target.id, name: target.name }, `보관 DB 이관 ${vaultRecs.length}건 (계약 ${counts.contracts}, 근태 ${counts.attendance}, 회계 ${counts.acc}, 인사서류 ${counts.hr})`);
      return out;
    });
    WD.vault.put(vaultRecs);
    return { ...r, vault: vaultRecs.length, counts };
  }

  V.people = (el, p, q, u) => {
    const db = WD.db;
    const active = db.users.filter((x) => x.status === 'ACTIVE');
    const resigned = db.users.filter((x) => x.status !== 'ACTIVE');
    const vault = WD.vault._raw();
    const liveSessions = (uid) => db.sessions.filter((s) => s.userId === uid && !s.revokedAt && new Date(s.expiresAt) > new Date()).length;
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>인사 · 퇴사 관리</h1><p class="muted">퇴사 처리 전 미결 서류·진행 문서의 인계/이관을 확인하고, 확정 즉시 로그인 차단·세션/권한 회수·법정 서류 보관 DB 이관을 한 번에 처리합니다.</p></div>
        <button class="btn primary" data-add>${I('plus')} 직원 등록</button></div>
      <div class="card flush"><div class="sub-head">${I('users')} 재직자 ${active.length}명</div><table class="tbl"><thead><tr><th>이름</th><th>권한</th><th>고용 유형</th><th>부서·직위</th><th>입사일</th><th class="c">활성 세션</th><th class="c">미결 문서</th><th class="r">작업</th></tr></thead><tbody>
      ${active.map((x) => { const pd = pendingFor(x.id); return `<tr><td><div class="row gap-s center">${WD.ui.avatar(x, 28)}<b>${esc(x.name)}</b><small class="muted">${esc(x.loginId)}</small></div></td><td><span class="tag ${x.role === 'CEO' ? 'ok' : ''}">${x.role}</span></td><td>${esc(x.empType)}</td><td>${esc(x.dept)} · ${esc(x.title)}</td><td>${esc(x.joinedAt)}</td><td class="c">${liveSessions(x.id) ? `<span class="live-dot"></span>${liveSessions(x.id)}` : '0'}</td><td class="c">${pd.docs.length || '-'}</td>
        <td class="r nowrap">${x.role !== 'CEO' ? `<button class="btn sm ghost" data-kick="${x.id}" title="모든 세션 강제 종료">세션 종료</button> <button class="btn sm danger" data-resign="${x.id}">퇴사 처리</button>` : '<span class="muted tiny">대표</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="card flush"><div class="sub-head">${I('lock')} 퇴사자 (접근 차단) ${resigned.length}명</div><table class="tbl"><thead><tr><th>이름</th><th>이전 소속</th><th>퇴사일</th><th>로그인</th><th>보관 DB 기록</th><th></th></tr></thead><tbody>
      ${resigned.map((x) => `<tr><td><b>${esc(x.name)}</b> <small class="muted">${esc(x.loginId)}</small></td><td>${esc(x.dept)} · ${esc(x.empType)}</td><td>${WD.fmtDT(x.resignedAt)}</td><td><span class="badge st-revision">${I('lock', 'xs')} 차단됨</span></td><td>${vault.records.filter((r) => r.userId === x.id).length}건</td><td class="r"><a class="btn sm ghost" href="#/vault?u=${x.id}">보관 DB 보기</a></td></tr>`).join('') || `<tr><td colspan="6">${WD.ui.empty('퇴사자가 없습니다.')}</td></tr>`}
      </tbody></table></div>
      <div class="alert alert-info">${I('info')}<span><b>시연 팁</b> 다른 창(시크릿 창 X, 같은 브라우저의 새 탭)에서 <b>teacher3 (최은솔)</b>으로 로그인해 둔 뒤 여기서 [퇴사 처리]를 확정하면, 그 탭이 4초 안에 강제 로그아웃되고 재로그인이 차단됩니다.</span></div>
    </div>`;
    el.querySelectorAll('[data-resign]').forEach((b) => b.addEventListener('click', () => resignWizard(WD.user(b.dataset.resign))));
    el.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', async () => {
      const x = WD.user(b.dataset.kick);
      if (!(await WD.ui.confirm('세션 강제 종료', `${x.name}님의 모든 로그인 세션을 즉시 종료합니다.`))) return;
      WD.tx((d) => { const n = WD.auth.revokeAll(d, x.id, 'ADMIN'); WD.audit('SESSION_REVOKE', { type: 'user', id: x.id, name: x.name }, `관리자 강제 종료 ${n}개`); });
      WD.ui.toast('세션을 종료했습니다.'); WD.app.refresh();
    }));
    el.querySelector('[data-add]').addEventListener('click', () => WD.ui.modal({ title: '직원 등록', okText: '등록',
      body: `<div class="grid2"><label class="fld"><span>이름</span><input data-k="name"></label><label class="fld"><span>아이디</span><input data-k="loginId"></label>
        <label class="fld"><span>고용 유형</span><select data-k="empType"><option>정규직</option><option>위촉강사</option></select></label><label class="fld"><span>부서</span><select data-k="dept"><option>교육팀</option><option>방과후팀</option><option>경영지원</option></select></label>
        <label class="fld"><span>직위</span><input data-k="title" value="선생님"></label><label class="fld"><span>초기 비밀번호</span><input data-k="pw" value="1234"></label></div><p class="tiny muted">운영 버전: 첫 로그인 시 비밀번호 변경 + 2단계 인증(OTP) 강제</p>`,
      onOk: async (w) => {
        const v = {}; w.querySelectorAll('[data-k]').forEach((i) => (v[i.dataset.k] = i.value.trim()));
        if (!v.name || !v.loginId) throw new Error('이름과 아이디를 입력하세요.');
        if (WD.db.users.some((x) => x.loginId === v.loginId)) throw new Error('이미 사용 중인 아이디입니다.');
        const pwHash = await WD.sha256('wooridoori::' + v.pw);
        WD.tx((d) => { const nu = { id: WD.uid('u'), loginId: v.loginId, name: v.name, role: 'STAFF', title: v.title, empType: v.empType, dept: v.dept, joinedAt: WD.ymd(), phone: '', workStart: v.empType === '정규직' ? '09:00' : '13:00', workEnd: '18:00', pwHash, status: 'ACTIVE', createdAt: WD.now() }; d.users.push(nu); WD.audit('USER_CREATE', { type: 'user', id: nu.id, name: nu.name }, `${nu.empType} · ${nu.dept}`); });
        WD.ui.toast('직원을 등록했습니다.'); WD.app.refresh();
      } }));
  };
})();
