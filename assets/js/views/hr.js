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
    const emp = WD.user(c.userId) || { name: c.userName || '(퇴사자)', phone: c.userPhone || '' };
    const ceo = WD.db.users.find((x) => WD.isTop(x));
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
      body: `${(WD.db.contractTemplates || []).some((t) => t.type === 'fields') ? `<label class="fld tpl-load"><span>${I('template')} 양식 불러오기</span><select data-tpl-load><option value="">— 저장된 계약 조건 양식 선택 —</option>${WD.db.contractTemplates.filter((t) => t.type === 'fields').map((t) => `<option value="${t.id}">[${t.kind}] ${esc(t.name)}</option>`).join('')}</select></label>` : ''}<div class="grid2">
        <label class="fld"><span>계약 유형</span><select data-k="kind"><option ${kind === '근로' ? 'selected' : ''}>근로</option><option ${kind === '위촉' ? 'selected' : ''}>위촉</option></select></label>
        <label class="fld"><span>대상 직원 (등록된 계정 선택)</span><select data-k="userId"><option value="">— 직접 입력 —</option>${staff.map((s) => `<option value="${s.id}" ${s.id === base.userId ? 'selected' : ''}>${esc(s.name)} (${esc(s.empType)} · ${esc(s.dept)})</option>`).join('')}</select></label>
        <label class="fld"><span>또는 이름 직접 입력 (계정 없는 직원)</span><input data-k="userName" value="${esc(base.userId ? '' : (base.userName || ''))}" placeholder="예) 홍길동"></label>
        <label class="fld"><span>연락처 (직접 입력 시)</span><input data-k="userPhone" value="${esc(base.userPhone || '')}" placeholder="010-0000-0000"></label>
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
        if (!v.userId && !v.userName.trim()) throw new Error('대상 직원을 선택하거나 이름을 직접 입력하세요.');
        if (v.userId) { v.userName = ''; v.userPhone = ''; } else v.userId = null;
        if (!v.duties || !v.pay) throw new Error('업무 내용과 금액을 입력하세요.');
        if (v.end <= v.start) throw new Error('종료일이 시작일보다 늦어야 합니다.');
        v.pay = Number(v.pay);
        onSave(v);
      } });
    m.el.querySelector('[data-tpl-load]')?.addEventListener('change', (e) => {
      const t = (WD.db.contractTemplates || []).find((x) => x.id === e.target.value); if (!t) return;
      const set = (k, val) => { const i = m.el.querySelector(`[data-k="${k}"]`); if (i && val !== undefined && val !== null && val !== '') i.value = val; };
      set('kind', t.kind); TPL_FIELDS.forEach((k) => set(k, t.fields?.[k]));
      WD.ui.toast(`'${t.name}' 양식을 불러왔습니다.`);
    });
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
  /* ---------------- 계약서 양식함 (미리 만든 근로·위촉계약서 보관) ---------------- */
  const TPL_FIELDS = ['place', 'duties', 'workDays', 'workHours', 'payType', 'pay', 'payDay'];
  const extOf = (n) => (String(n || '').split('.').pop() || '').toLowerCase();
  const fileTypeLabel = (n) => ({ hwp: '한글', hwpx: '한글', docx: '워드', doc: '워드', pdf: 'PDF', xlsx: '엑셀', xls: '엑셀', png: '이미지', jpg: '이미지', jpeg: '이미지' }[extOf(n)] || '파일');

  function saveContractTemplate({ kind, name, type, fields = null, fileId = null, fileName = '' }) {
    const u = WD.auth.current(); WD.blockPreview();
    return WD.tx((db) => {
      db.contractTemplates = db.contractTemplates || [];
      const t = { id: WD.uid('ctpl'), kind, name, type, fields, fileId, fileName, createdBy: u.id, createdAt: WD.now(), updatedAt: WD.now() };
      db.contractTemplates.unshift(t);
      WD.audit('TEMPLATE_SAVE', { type: 'contractTemplate', id: t.id, name }, `${kind}계약서 양식 저장 (${type === 'file' ? fileTypeLabel(fileName) + ' 파일' : '계약 조건'})`);
      return t;
    });
  }
  WD.saveContractTemplate = saveContractTemplate;

  function uploadContractTemplate(defKind) {
    WD.ui.modal({ title: '미리 만든 계약서 양식 저장', okText: '양식함에 저장', size: 'md',
      body: `<p class="muted">사용 중인 근로계약서·위촉계약서 파일(한글·워드·PDF·엑셀·사진)을 올려 두면 언제든 꺼내 쓸 수 있어요.</p>
        <div class="grid2"><label class="fld"><span>종류</span><select data-k="kind"><option ${defKind !== '위촉' ? 'selected' : ''}>근로</option><option ${defKind === '위촉' ? 'selected' : ''}>위촉</option></select></label>
        <label class="fld"><span>양식 이름</span><input data-k="name" placeholder="예) 2027 정규직 근로계약서"></label></div>
        <label class="fld"><span>계약서 파일</span><input type="file" data-file accept=".hwp,.hwpx,.docx,.doc,.pdf,.xlsx,.xls,.png,.jpg,.jpeg"></label>`,
      onOk: async (w) => {
        const f = w.querySelector('[data-file]').files[0]; if (!f) throw new Error('계약서 파일을 선택하세요.');
        const kind = w.querySelector('[data-k=kind]').value;
        const name = w.querySelector('[data-k=name]').value.trim() || f.name.replace(/\.[^.]+$/, '');
        const fileId = await WD.files.put(f, { name: f.name });
        saveContractTemplate({ kind, name, type: 'file', fileId, fileName: f.name });
        WD.ui.toast('계약서 양식함에 저장했습니다.'); WD.app.refresh();
      } });
  }

  function fieldTemplateForm(defKind, base = null) {
    WD.ui.modal({ title: base ? '계약 조건 양식 수정' : '계약 조건 양식 만들기', okText: '저장', size: 'lg',
      body: `<p class="muted">자주 쓰는 계약 조건(근무지·업무·근무시간·임금)을 양식으로 저장해 두면, 새 계약서를 만들 때 [양식 불러오기]로 한 번에 채워집니다.</p>
        <div class="grid2"><label class="fld"><span>종류</span><select data-k="kind"><option ${(base?.kind || defKind) !== '위촉' ? 'selected' : ''}>근로</option><option ${(base?.kind || defKind) === '위촉' ? 'selected' : ''}>위촉</option></select></label>
        <label class="fld"><span>양식 이름</span><input data-k="name" value="${esc(base?.name || '')}" placeholder="예) 방과후 강사 기본 위촉 조건"></label>
        <label class="fld full"><span>근무(강의) 장소</span><input data-k="place" value="${esc(base?.fields?.place || '')}"></label>
        <label class="fld full"><span>업무 내용 / 강의 과목</span><input data-k="duties" value="${esc(base?.fields?.duties || '')}"></label>
        <label class="fld"><span>근무일</span><input data-k="workDays" value="${esc(base?.fields?.workDays || '')}" placeholder="월~금 (주 5일)"></label>
        <label class="fld"><span>근무시간</span><input data-k="workHours" value="${esc(base?.fields?.workHours || '')}" placeholder="09:00~18:00"></label>
        <label class="fld"><span>임금 형태</span><select data-k="payType">${['월급', '시급', '강의료(시간당)', '강의료(회당)'].map((x) => `<option ${x === base?.fields?.payType ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="fld"><span>금액(원)</span><input type="number" data-k="pay" value="${esc(base?.fields?.pay || '')}"></label>
        <label class="fld full"><span>지급일·방법</span><input data-k="payDay" value="${esc(base?.fields?.payDay || '')}" placeholder="매월 10일"></label></div>`,
      onOk: (w) => {
        const v = {}; w.querySelectorAll('[data-k]').forEach((i) => (v[i.dataset.k] = i.value.trim()));
        if (!v.name) throw new Error('양식 이름을 입력하세요.');
        const fields = {}; TPL_FIELDS.forEach((k) => (fields[k] = k === 'pay' ? Number(v[k] || 0) : v[k]));
        if (base) WD.tx((db) => { const t = db.contractTemplates.find((x) => x.id === base.id); Object.assign(t, { kind: v.kind, name: v.name, fields, updatedAt: WD.now() }); WD.audit('TEMPLATE_SAVE', { type: 'contractTemplate', id: t.id, name: t.name }, '계약 조건 양식 수정'); });
        else saveContractTemplate({ kind: v.kind, name: v.name, type: 'fields', fields });
        WD.ui.toast('양식을 저장했습니다.'); WD.app.refresh();
      } });
  }

  /** 파일 양식 → 인사·직원 분류에 새 문서로 만들어 바로 작성 */
  async function useFileTemplate(t) {
    WD.blockPreview();
    const rec = await WD.files.get(t.fileId);
    if (!rec) throw new Error('양식 파일을 이 브라우저 저장소에서 찾을 수 없습니다.');
    const ext = extOf(t.fileName);
    const file = new File([rec.blob], t.fileName, { type: rec.type });
    let kind = 'file', content = { fileId: t.fileId, name: t.fileName, size: rec.size, type: rec.type };
    if (['hwp', 'hwpx'].includes(ext)) kind = 'hwp';
    else if (ext === 'docx') { kind = 'doc'; content = await WD.editors.doc.importDocx(file); }
    else if (['xlsx', 'xls'].includes(ext)) { kind = 'sheet'; content = await WD.editors.sheet.importFile(file); }
    const d = WD.wf.createDoc({ title: `${t.name} (${WD.ymd()})`, kind, folderId: 'c_hr', content, note: `계약서 양식 '${t.name}'에서 작성`, sub: t.kind === '근로' ? '근로계약' : '위촉계약' });
    WD.app.go(`#/doc/${d.id}`);
  }

  async function previewFileTemplate(t) {
    const rec = await WD.files.get(t.fileId);
    if (!rec) { WD.ui.toast('양식 파일을 찾을 수 없습니다.', 'error'); return; }
    const ext = extOf(t.fileName);
    const url = URL.createObjectURL(rec.blob);
    const body = ['png', 'jpg', 'jpeg'].includes(ext) ? `<img src="${url}" style="max-width:100%">`
      : ext === 'pdf' ? `<iframe src="${url}" style="width:100%;height:70vh;border:0"></iframe>`
      : `<p class="muted">${esc(t.fileName)} (${fileTypeLabel(t.fileName)}) — [이 양식으로 작성]을 누르면 웹 편집기로 열립니다.</p>`;
    const m = WD.ui.modal({ title: `양식 미리보기 · ${t.name}`, size: 'lg', hideOk: true, cancelText: '닫기', body });
    m.el.addEventListener('click', () => { if (!m.el.isConnected) URL.revokeObjectURL(url); });
  }

  function contractTemplatesHTML(db) {
    const list = db.contractTemplates || [];
    return `<div class="card ctpl-card">
      <div class="card-head"><h3>${I('template')} 계약서 양식함 <em class="cnt">${list.length}</em></h3>
        <div class="row gap-s"><button class="btn sm primary" data-ctpl-upload>${I('upload')} 미리 만든 계약서 파일 저장</button><button class="btn sm ghost" data-ctpl-fields>${I('plus')} 계약 조건 양식 만들기</button></div></div>
      ${list.length ? `<div class="ctpl-grid">${list.map((t) => `<div class="ctpl-item">
        <div class="ctpl-ico ${t.type === 'file' ? 'f-' + extOf(t.fileName) : 'fields'}">${t.type === 'file' ? esc(fileTypeLabel(t.fileName)) : '조건'}</div>
        <div class="ctpl-meta"><b>${esc(t.name)}</b><small><span class="tag">${t.kind}계약서</span> ${t.type === 'file' ? esc(t.fileName) : '계약 조건 양식'} · ${WD.ymd(new Date(t.updatedAt || t.createdAt))}</small></div>
        <div class="ctpl-act"><button class="btn sm primary" data-ctpl-use="${t.id}">이 양식으로 작성</button>
          ${t.type === 'file' ? `<button class="btn sm ghost" data-ctpl-view="${t.id}">미리보기</button><button class="btn sm ghost icon-only" data-ctpl-dl="${t.id}" title="원본 내려받기">${I('download')}</button>` : `<button class="btn sm ghost" data-ctpl-edit="${t.id}">수정</button>`}
          <button class="btn sm ghost icon-only" data-ctpl-del="${t.id}" title="삭제">${I('trash')}</button></div>
      </div>`).join('')}</div>` : `<p class="muted">아직 저장된 양식이 없습니다. 쓰고 계신 근로계약서·위촉계약서 파일을 올려 두거나, 자주 쓰는 계약 조건을 양식으로 만들어 두세요.</p>`}
    </div>`;
  }

  function bindContractTemplates(el, u, createFromFields) {
    const db = WD.db;
    const T = (id) => (db.contractTemplates || []).find((x) => x.id === id);
    el.querySelector('[data-ctpl-upload]')?.addEventListener('click', () => uploadContractTemplate('근로'));
    el.querySelector('[data-ctpl-fields]')?.addEventListener('click', () => fieldTemplateForm('근로'));
    el.querySelectorAll('[data-ctpl-use]').forEach((b) => b.addEventListener('click', async () => {
      const t = T(b.dataset.ctplUse);
      try { if (t.type === 'file') await useFileTemplate(t); else createFromFields(t); } catch (e) { WD.ui.toast(e.message, 'error'); }
    }));
    el.querySelectorAll('[data-ctpl-view]').forEach((b) => b.addEventListener('click', () => previewFileTemplate(T(b.dataset.ctplView))));
    el.querySelectorAll('[data-ctpl-edit]').forEach((b) => b.addEventListener('click', () => fieldTemplateForm('근로', T(b.dataset.ctplEdit))));
    el.querySelectorAll('[data-ctpl-dl]').forEach((b) => b.addEventListener('click', () => { const t = T(b.dataset.ctplDl); WD.sec.exportDoc({ type: 'contractTemplate', id: t.id, title: t.name }, '양식 원본', async () => { const rec = await WD.files.get(t.fileId); if (!rec) throw new Error('파일 없음'); WD.sec.saveBlob(rec.blob, t.fileName); }); }));
    el.querySelectorAll('[data-ctpl-del]').forEach((b) => b.addEventListener('click', async () => {
      const t = T(b.dataset.ctplDel);
      if (!(await WD.ui.confirm('양식 삭제', `'${t.name}' 양식을 삭제할까요? (이미 작성된 계약서는 그대로 남습니다)`, { danger: true }))) return;
      WD.tx((d2) => { d2.contractTemplates = d2.contractTemplates.filter((x) => x.id !== t.id); WD.audit('TEMPLATE_DELETE', { type: 'contractTemplate', id: t.id, name: t.name }); });
      WD.app.refresh();
    }));
  }

  V.contracts = (el, p, q, u) => {
    const db = WD.db; const isCEO = WD.isTop(u);
    const crumbHTML = '<div class="crumb"><a href="#/checklist">필수 서류</a> / 근로·위촉계약서</div>';
    const list = db.contracts.filter((c) => isCEO || c.userId === u.id).sort((a, b) => (a.end > b.end ? 1 : -1));
    const alerts = WD.wf.expiryAlerts(isCEO ? null : u.id);
    const buckets = ['D-7', 'D-14', 'D-30'];
    el.innerHTML = `<div class="page">
      ${crumbHTML}
      <div class="page-head"><div><h1>근로·위촉계약서</h1><p class="muted">근로계약서(정규직·직원)·위촉계약서(강사·프리랜서) 작성 → 서명 요청 → 캔버스 전자서명 → 대표 전자 직인 날인 → 완료 문서 잠금. 종료 D-30·D-14·D-7 자동 알림.</p></div>
        ${isCEO ? `<div class="row gap-s"><button class="btn primary" data-new="근로">${I('plus')} 근로계약서</button><button class="btn ghost" data-new="위촉">${I('plus')} 위촉계약서</button></div>` : ''}</div>
      <div class="alert-board">${buckets.map((b) => { const xs = alerts.filter((a) => a.bucket === b); return `<div class="ab-col ab-${b.replace('-', '').toLowerCase()}"><div class="ab-head"><b>${b}</b><small>${b === 'D-7' ? '7일 이내' : b === 'D-14' ? '8~14일' : '15~30일'}</small><em>${xs.length}</em></div>
        ${xs.map((a) => `<div class="ab-item"><div><span class="tag">${a.kind}</span> <a href="${a.link}"><b>${esc(a.title)}</b></a><small>만료일 ${a.end} · D-${a.days}</small></div>${a.kind === '계약 종료' && isCEO ? (a.renewed ? '<span class="tag ok">갱신 초안 있음</span>' : `<button class="btn sm primary" data-renew="${a.refId}">갱신 초안</button>`) : ''}</div>`).join('') || '<p class="muted tiny">없음</p>'}</div>`; }).join('')}</div>
      ${isCEO ? contractTemplatesHTML(db) : ''}
      <div class="card flush"><table class="tbl"><thead><tr><th>계약서</th><th>유형</th><th>대상</th><th>계약 기간</th><th>상태</th><th>만료</th><th class="r">작업</th></tr></thead><tbody>
      ${list.map((c) => `<tr class="click" data-href="#/contract/${c.id}"><td>${I('contract')} <b>${esc(c.title)}</b>${c.renewedFrom ? ' <span class="tag">갱신</span>' : ''}</td><td>${c.kind === '근로' ? '근로계약' : '위촉계약'}</td><td>${esc(c.userId ? WD.userName(c.userId) : (c.userName || '-') + ' (직접 입력)')}</td><td class="nowrap">${c.start} ~ ${c.end}</td><td>${cBadge(c.status)}</td><td>${c.status === 'SEALED' ? WD.ui.dday(WD.daysLeft(c.end)) : '-'}</td><td class="r"><a class="btn sm ghost" href="#/contract/${c.id}">열기</a></td></tr>`).join('')}
      </tbody></table>${list.length ? '' : WD.ui.empty('계약서가 없습니다.', 'contract')}</div></div>`;
    el.querySelectorAll('[data-href]').forEach((r) => r.addEventListener('click', (e) => { if (!e.target.closest('a,button')) location.hash = r.dataset.href; }));
    el.querySelectorAll('[data-renew]').forEach((b) => b.addEventListener('click', () => renewDraft(db.contracts.find((c) => c.id === b.dataset.renew))));
    const createWith = (base) => contractForm(u, base, (v) => {
      const emp = WD.user(v.userId) || { name: v.userName };
      const c = WD.tx((db2) => { const nc = { ...v, id: WD.uid('c'), title: `${v.kind === '근로' ? '근로계약서' : '위촉계약서'} (${emp.name})`, status: 'DRAFT', locked: false, createdAt: WD.now(), folderId: 'c_hr' }; delete nc.tplId; db2.contracts.push(nc); WD.audit('CONTRACT_CREATE', { type: 'contract', id: nc.id, name: nc.title }); return nc; });
      WD.app.go(`#/contract/${c.id}`);
    });
    el.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => createWith({ kind: b.dataset.new })));
    if (isCEO) bindContractTemplates(el, u, (t) => createWith({ kind: t.kind, ...t.fields }));
  };

  /* ---------------- 계약서 상세 ---------------- */
  V.contract = (el, { id }, q, u) => {
    const db = WD.db; const c = db.contracts.find((x) => x.id === id);
    if (!c) { el.innerHTML = `<div class="page">${WD.ui.empty('계약서를 찾을 수 없습니다. (퇴사자 계약서는 법정 보관 DB로 이관됩니다)', 'alert')}</div>`; return; }
    const isCEO = WD.isTop(u);
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
          ${!c.userId && ['DRAFT', 'SENT'].includes(c.status) ? `<button class="btn accent" data-sign>${I('pen')} 현장 서명 받기 (${esc(c.userName || '대상자')})</button>` : ''}
          ${isCEO && c.status === 'SENT' ? '<span class="muted">직원 서명 대기 중</span>' : ''}
          ${isCEO && c.status === 'SIGNED' ? `<button class="btn success" data-seal>${I('stamp')} 대표 직인 날인·잠금</button>` : ''}
          ${isCEO ? `<button class="btn ghost" data-save-tpl>${I('template')} 양식으로 저장</button>` : ''}
          ${isCEO && c.status === 'SEALED' ? `<button class="btn ghost" data-renew>${I('refresh')} 재계약/갱신 초안</button>` : ''}
          ${isCEO ? `<button class="btn ghost" data-pdf>${I('download')} PDF 내보내기</button>` : `<span class="tag lock">${I('lock', 'xs')} 유출 방지(DLP) 적용</span>`}
        </div></div>
      <div class="steps">${['초안 작성', '서명 요청', '직원 전자서명', '대표 직인·잠금'].map((s, i) => `<div class="step ${i <= si ? 'done' : ''} ${i === si ? 'cur' : ''}"><span>${i + 1}</span><b>${s}</b></div>`).join('')}</div>
      <div class="contract-wrap protected" id="cw">${WD.renderContract(c)}</div></div>`;
    WD.sec.watermark(el.querySelector('#cw'));
    if (!WD.isTop(u)) WD.sec.watermark(el.querySelector('.page'), { full: true });
    const save = (fn, action, detail) => { WD.tx((d) => { const x = d.contracts.find((y) => y.id === c.id); fn(x, d); WD.audit(action, { type: 'contract', id: c.id, name: c.title }, detail); }); WD.app.refresh(); };
    el.querySelector('[data-edit]')?.addEventListener('click', () => contractForm(u, c, (v) => save((x) => Object.assign(x, v), 'CONTRACT_CREATE', '초안 조건 수정')));
    el.querySelector('[data-send]')?.addEventListener('click', () => save((x) => { x.status = 'SENT'; x.sentAt = WD.now(); if (x.userId) WD.notify(x.userId, { title: `계약서 서명 요청: ${x.title}`, body: '내용 확인 후 전자서명해 주세요.', link: `#/contract/${x.id}`, type: 'SIGN' }); }, 'DISPATCH', `서명 요청 → ${WD.userName(c.userId)}`));
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
    el.querySelector('[data-save-tpl]')?.addEventListener('click', async () => {
      const name = await WD.ui.prompt('계약 조건을 양식으로 저장', '양식 이름', { value: `${c.kind}계약 기본 조건 (${c.duties || ''})` });
      if (!name) return;
      const fields = {}; TPL_FIELDS.forEach((k) => (fields[k] = c[k]));
      try { saveContractTemplate({ kind: c.kind, name, type: 'fields', fields }); WD.ui.toast('계약서 양식함에 저장했습니다.'); } catch (e) { WD.ui.toast(e.message, 'error'); }
    });
    el.querySelector('[data-pdf]')?.addEventListener('click', () => WD.sec.exportDoc({ type: 'contract', id: c.id, title: c.title }, 'PDF', async () => {
      await WD.editors.doc.ensure();
      const blob = await WD.editors.doc.toPdfBlob(c.title, WD.renderContract(c));
      WD.sec.saveBlob(blob, `${c.title}.pdf`);
    }));
  };

  /* ---------------- 출결·근태 (대표: 통계·관리 / 그 외: 1초 체크) ---------------- */
  const ACLS = { 출석: 'a-work', 지각: 'a-late', 병가: 'a-sick', 휴가: 'a-leave', 대강: 'a-sub' };
  const attBadge = (s) => `<span class="badge ${ACLS[s] || ''}">${s}</span>`;

  V.attendance = (el, p, q, u) => (WD.isTop(u) ? attendanceCEO(el, q, u) : attendanceSelf(el, q, u));
  /** 관리자 본인 출결 체크 (직원·계정 관리 > 내 출결 체크) — 직원과 같은 화면 */
  V.attendanceMe = (el, p, q, u) => { attendanceSelf(el, q, u, '#/attendance/me'); el.querySelector('.page')?.insertAdjacentHTML('afterbegin', '<div class="crumb" style="text-align:left"><a href="#/people">직원·계정 관리</a> / 내 출결 체크</div>'); };

  /** 관리자·실장·직원: 큰 버튼 5개 + 사유 + 달력(날짜 선택) + 선택한 날짜 내 기록(잠금) — 타인 기록·통계는 API에서 아예 내려오지 않음 */
  function attendanceSelf(el, q, u, base = '#/attendance') {
    const today = WD.ymd();
    const sel = /^\d{4}-\d{2}-\d{2}$/.test(q.d || '') ? q.d : today;
    const month = /^\d{4}-\d{2}$/.test(q.m || '') ? q.m : sel.slice(0, 7);
    const [Y, M] = month.split('-').map(Number);
    const prevM = WD.monthKey(new Date(Y, M - 2, 1)), nextM = WD.monthKey(new Date(Y, M, 1));
    const monthRecs = WD.api.attendance.mine({ month });
    const dayRecs = WD.api.attendance.mine({ date: sel }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const selD = new Date(sel + 'T00:00:00');
    const dowName = '일월화수목금토';
    const isToday = sel === today, isFuture = sel > today;
    const selLabel = `${selD.getMonth() + 1}월 ${selD.getDate()}일 (${dowName[selD.getDay()]})`;
    // 미래 날짜는 계획성 항목(휴가·병가·대강)만
    const allowed = (k) => !isFuture || ['휴가', '병가', '대강'].includes(k);
    // 달력 셀
    const first = new Date(Y, M - 1, 1), days = new Date(Y, M, 0).getDate();
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<div class="cal-cell empty"></div>');
    for (let d = 1; d <= days; d++) {
      const date = `${month}-${WD.pad(d)}`; const w = new Date(Y, M - 1, d).getDay();
      const recs = monthRecs.filter((a) => a.date === date);
      cells.push(`<a class="cal-cell ${date === today ? 'today' : ''} ${date === sel ? 'sel' : ''} ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''} ${date > today ? 'future' : ''}" href="${base}?m=${month}&d=${date}">
        <span class="cal-day">${d}</span>
        <span class="cal-chips">${recs.map((a) => `<span class="cal-chip ${ACLS[a.status] || ''}" title="${esc(a.status + (a.note ? ' · ' + a.note : ''))}">${a.status}</span>`).join('')}</span></a>`);
    }
    const cnt = (s) => monthRecs.filter((a) => a.status === s).length;

    el.innerHTML = `<div class="page narrow-att">
      <div class="att-hero">
        <small class="muted">${today} (${dowName[new Date().getDay()]})</small>
        <h1 class="att-clock" id="att-clock">${WD.hm()}</h1>
        <p class="muted">${esc(u.name)} ${WD.roleBadge(u.role)} · ${isToday ? '오늘 상태를 눌러 주세요' : `<b class="sel-date">${selLabel}</b> 기록을 등록합니다 <a href="${base}">오늘로 돌아가기</a>`}</p>
      </div>
      <div class="att-buttons">${WD.ATT_TYPES.map((t) => `<button class="att-btn ${t.cls}" data-att="${t.key}" ${allowed(t.key) ? '' : 'disabled title="앞으로의 날짜에는 휴가·병가·대강만 등록할 수 있어요"'}>${I(t.icon)}<b>${t.key}</b><small>${t.desc}</small></button>`).join('')}</div>
      <div class="att-reason"><input id="att-note" maxlength="80" placeholder="사유 (병가·휴가·대강은 꼭 적어 주세요. 예: 감기 / 연차 / 3교시 김선생님 대신)"></div>
      <div class="card att-today">
        <div class="card-head"><h3>${I('check')} ${isToday ? '오늘' : selLabel} 등록 내역</h3><small class="muted">${I('lock', 'xs')} 등록 후에는 삭제·수정할 수 없어요 (수정은 대표에게 요청)</small></div>
        ${dayRecs.length ? `<ul class="att-list">${dayRecs.map((a) => `<li>${attBadge(a.status)}<span class="t">${a.time}</span><span class="n">${esc(a.note || '')}${a.lateEntry ? ' <small class="muted">(나중 등록)</small>' : ''}</span><span class="st">${a.approved ? '<span class="tag ok">대표 확인</span>' : '<span class="tag">확인 대기</span>'} ${I('lock', 'xs')}</span></li>`).join('')}</ul>` : `<p class="muted">${isToday ? '아직 오늘' : '이 날짜에'} 등록한 내역이 없습니다.</p>`}
      </div>
      <div class="card att-cal">
        <div class="card-head"><h3>${I('clock')} 내 출결 달력</h3>
          <div class="seg"><a href="${base}?m=${prevM}&d=${sel}">‹</a><span class="seg-label">${Y}년 ${M}월</span><a href="${base}?m=${nextM}&d=${sel}">›</a></div></div>
        <div class="cal-sum">${WD.ATT_TYPES.map((t) => `<span class="cal-chip ${t.cls}">${t.key} ${cnt(t.key)}</span>`).join('')}<small class="muted">이번 달 내 기록</small></div>
        <div class="cal-grid">${['일', '월', '화', '수', '목', '금', '토'].map((d, i) => `<div class="cal-head ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</div>`).join('')}${cells.join('')}</div>
        <p class="tiny muted">날짜를 누르면 그날 한 일을 보고, 위 버튼으로 그 날짜의 출결을 등록할 수 있어요. 지난 날짜는 '나중 등록'으로 대표 확인을 거칩니다.</p>
      </div>
    </div>`;
    const tick = setInterval(() => { const c = el.querySelector('#att-clock'); if (c) c.textContent = WD.hm(); }, 10000);
    WD.app.onCleanup(() => clearInterval(tick));
    el.querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => {
      try {
        const r = WD.api.attendance.add(b.dataset.att, el.querySelector('#att-note').value, sel);
        WD.ui.toast(`${isToday ? '' : selLabel + ' '}${r.status} 등록 완료`);
        WD.app.refresh();
      } catch (e) { WD.ui.toast(e.message, 'warn'); }
    }));
  }

  /** 대표: 이번 달 요약 카드 + 직원별 표(지각·병가/휴가·대강) + 수정·승인 */
  function attendanceCEO(el, q, u) {
    const month = q.m || WD.monthKey();
    const [Y, M] = month.split('-').map(Number);
    const prev = WD.monthKey(new Date(Y, M - 2, 1)), next = WD.monthKey(new Date(Y, M, 1));
    const st = WD.api.attendance.stats(month);
    const pendingAll = st.people.flatMap((pp) => pp.records.filter((r) => !r.approved));
    el.innerHTML = `<div class="page">
      <div class="crumb"><a href="#/people">직원·계정 관리</a> / 출결·근태</div>
      <div class="page-head simple"><div><h1>출결·근태 관리</h1><p class="muted">직원이 버튼으로 체크한 근태를 한눈에 보고 수정·승인합니다.</p></div>
        <div class="seg"><a href="#/attendance?m=${prev}">‹</a><span class="seg-label">${Y}년 ${M}월</span><a href="#/attendance?m=${next}">›</a></div></div>
      <div class="kpis att-kpis">
        <div class="kpi ok"><small>출석 현황</small><b>${st.total.출석}</b><span class="muted">이번 달 출석 체크 수</span></div>
        <div class="kpi warn"><small>지각 누적</small><b>${st.total.지각}</b><span class="muted">전 직원 합계</span></div>
        <div class="kpi info"><small>병가·휴가</small><b>${st.total.병가휴가}</b><span class="muted">사용 일수</span></div>
        <div class="kpi"><small>대강 현황</small><b>${st.total.대강}</b><span class="muted">대체 수업 건수</span></div>
      </div>
      ${pendingAll.length ? `<div class="alert alert-warn">${I('alert')}<span>확인 대기 중인 근태가 <b>${pendingAll.length}건</b> 있습니다.</span><button class="btn sm primary" data-approve-all style="margin-left:auto">모두 확인(승인)</button></div>` : ''}
      <div class="card flush"><table class="tbl att-table"><thead><tr><th>이름</th><th>직급</th><th class="c">출석</th><th class="c">지각</th><th class="c">병가</th><th class="c">휴가</th><th>대강 내역</th><th class="c">확인 대기</th><th class="r">관리</th></tr></thead><tbody>
        ${st.people.map((pp) => `<tr><td><div class="row gap-s center">${WD.ui.avatar(pp.user, 26)}<b>${esc(pp.user.name)}</b></div></td><td>${WD.roleBadge(pp.user.role)}</td>
          <td class="c">${pp.출석}</td><td class="c">${pp.지각 ? `<b class="t-warn">${pp.지각}</b>` : 0}</td><td class="c">${pp.병가 || 0}</td><td class="c">${pp.휴가 || 0}</td>
          <td class="tiny">${pp.subs.length ? pp.subs.map((s) => `${+s.date.slice(8)}일 ${esc(s.note || '')}`).join('<br>') : '<span class="muted">-</span>'}</td>
          <td class="c">${pp.pending ? `<span class="badge st-pending">${pp.pending}</span>` : '-'}</td>
          <td class="r"><button class="btn sm ghost" data-detail="${pp.user.id}">기록 보기·수정</button></td></tr>`).join('') || `<tr><td colspan="9"><p class="muted pad">등록된 직원이 없습니다. [직원·계정 관리]에서 계정을 등록하세요.</p></td></tr>`}
      </tbody></table></div>
    </div>`;
    el.querySelector('[data-approve-all]')?.addEventListener('click', () => { const n = WD.api.attendance.approve(pendingAll.map((r) => r.id)); WD.ui.toast(`${n}건 확인했습니다.`); WD.app.refresh(); });
    el.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => {
      const pp = st.people.find((x) => x.user.id === b.dataset.detail);
      const rows = pp.records.sort((a, c) => (a.date + a.time < c.date + c.time ? 1 : -1));
      const m = WD.ui.modal({ title: `${pp.user.name} · ${M}월 근태 기록`, size: 'lg', hideOk: true, cancelText: '닫기',
        body: rows.length ? `<table class="tbl compact"><thead><tr><th>날짜</th><th>시각</th><th>상태</th><th>사유</th><th>확인</th><th class="r">수정</th></tr></thead><tbody>${rows.map((r) => `<tr data-row="${r.id}"><td>${r.date}</td><td>${r.time || '-'}${r.lateEntry ? ' <small class="muted">(나중 등록)</small>' : ''}</td>
          <td><select data-st>${WD.ATT_TYPES.map((t) => `<option ${t.key === r.status ? 'selected' : ''}>${t.key}</option>`).join('')}</select></td>
          <td><input data-note value="${esc(r.note || '')}"></td><td>${r.approved ? '<span class="tag ok">확인</span>' : '<span class="tag">대기</span>'}</td>
          <td class="r nowrap"><button class="btn sm primary" data-save-row>저장·승인</button> <button class="btn sm ghost icon-only" data-del-row title="삭제">${I('trash')}</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">이번 달 기록이 없습니다.</p>' });
      m.el.querySelectorAll('[data-row]').forEach((tr) => {
        tr.querySelector('[data-save-row]').addEventListener('click', () => { WD.api.attendance.update(tr.dataset.row, { status: tr.querySelector('[data-st]').value, note: tr.querySelector('[data-note]').value }); WD.ui.toast('저장·승인했습니다.'); m.close(); WD.app.refresh(); });
        tr.querySelector('[data-del-row]').addEventListener('click', async () => { if (await WD.ui.confirm('기록 삭제', '이 근태 기록을 삭제할까요? (기록은 보안 기록에 남습니다)', { danger: true })) { WD.api.attendance.remove(tr.dataset.row); m.close(); WD.app.refresh(); } });
      });
    }));
  }

  /* ---------------- 인사·퇴사 관리 (CEO) ---------------- */
  const RETAIN = { contract: [3, '근로기준법 제42조(계약서류 3년 보존)'], attendance: [3, '근로기준법 제42조·시행령 제22조(근로자명부·근태 3년)'], accounting: [5, '국세기본법 제85조의3(장부·증빙 5년)'], hrdoc: [3, '근로기준법 제42조 준용(인사서류 3년, 보존기간 경과 후 파기)'] };

  function pendingFor(uid) {
    const db = WD.db;
    const docs = db.documents.filter((d) => (d.ownerId === uid || d.assigneeId === uid) && d.status !== 'APPROVED' && !db.submissions.some((s) => s.docId === d.id));
    const contracts = db.contracts.filter((c) => c.userId === uid && c.status !== 'SEALED');
    return { docs, contracts };
  }
  function legalFor(uid) {
    const db = WD.db;
    const contracts = db.contracts.filter((c) => c.userId === uid);
    const attendance = db.attendance.filter((a) => a.userId === uid);
    const acc = db.documents.filter((d) => d.ownerId === uid && d.status === 'APPROVED' && d.folderId === 'c_acc');
    const hr = db.documents.filter((d) => d.ownerId === uid && db.submissions.some((s) => s.docId === d.id));
    return { contracts, attendance, acc, hr };
  }

  function resignWizard(target) {
    const pend = pendingFor(target.id);
    const legal = legalFor(target.id);
    const others = WD.activeUsers().filter((x) => x.id !== target.id);
    const opt = (sel = '') => others.map((o) => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>${esc(o.name)} (${esc(o.title)})</option>`).join('');
    const sameDept = others.find((o) => o.dept === target.dept && o.role === 'staff')?.id || others.find((o) => WD.isTop(o))?.id;
    const m = WD.ui.modal({ title: `계정 비활성화(퇴사 처리) · ${target.name} (${target.title || ''}, ${target.dept})`, size: 'xl', okText: '비활성화 확정 · 모든 세션 즉시 만료', danger: true,
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
        setTimeout(() => WD.ui.modal({ title: '계정 비활성화 완료', hideOk: true, cancelText: '확인', body: `<ul class="auto-list done">
          <li>${I('check')} 인수인계 ${result.handover}건 이관 완료</li><li>${I('lock')} ${esc(target.name)} 계정 로그인 차단 · 세션 ${result.sessions}개 즉시 회수</li>
          <li>${I('users')} 문서 공유 ${result.shares}건 · 발송 프리셋 ${result.presets}건에서 권한 제거</li>
          <li>${I('vault')} 법정 보관 DB 이관 ${result.vault}건 (계약 ${result.counts.contracts}, 근태 ${result.counts.attendance}, 회계 ${result.counts.acc}, 인사서류 ${result.counts.hr})</li></ul>
          <p class="muted tiny">${esc(target.email || target.loginId)} 계정으로 열려 있던 화면은 즉시 강제 로그아웃되며, 이후 로그인 시도는 차단·기록됩니다.</p>` }), 50);
        WD.app.refresh();
      } });
    m.el.querySelector('[data-bulk-apply]')?.addEventListener('click', () => { const v = m.el.querySelector('[data-bulk]').value; m.el.querySelectorAll('[data-to]').forEach((s) => (s.value = v)); m.el.querySelectorAll('[data-ho]').forEach((c) => (c.checked = true)); });
  }

  function confirmResign(target, transfers, { date, reason }) {
    const ceo = WD.auth.current();
    if (!WD.sec.canManageUsers(ceo)) throw new Error('대표 또는 관리자만 계정을 비활성화할 수 있습니다.');
    if (WD.fixedRole(target.email)) throw new Error('고정 지정된 대표·관리자 계정은 비활성화할 수 없습니다.');
    if (target.id === ceo.id) throw new Error('본인 계정은 비활성화할 수 없습니다.');
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
      u.status = 'RESIGNED'; u.resignedAt = new Date(date + 'T18:00:00').toISOString(); u.resignReason = reason;
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
      <div class="page-head"><div><h1>직원 · 계정 관리</h1><p class="muted">관리자·실장·직원 계정을 발급하면 로그인할 때 직급에 맞는 화면이 자동으로 나옵니다. 계정 비활성화(퇴사 처리) 시 해당 계정의 <b>모든 세션이 즉시 만료</b>되어 열려 있는 화면이 강제 로그아웃되고, 재로그인이 차단됩니다.</p></div>
        <div class="row gap-s"><a class="btn ghost" href="#/attendance">${I('clock')} 출결·근태</a><button class="btn primary" data-add>${I('plus')} 계정 등록</button></div></div>
      <div class="card flush"><div class="sub-head">${I('users')} 활성 계정 ${active.length}명</div><table class="tbl"><thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>고용 유형</th><th>부서·직함</th><th class="c">활성 세션</th><th class="c">미결 문서</th><th class="r">작업</th></tr></thead><tbody>
      ${active.map((x) => { const pd = pendingFor(x.id); return `<tr><td><div class="row gap-s center">${WD.ui.avatar(x, 28)}<b>${esc(x.name)}</b></div></td><td class="muted">${esc(x.email || x.loginId)}</td><td>${WD.roleBadge(x.role)}</td><td>${esc(x.empType)}</td><td>${esc(x.dept)} · ${esc(x.title || '')}</td><td class="c">${liveSessions(x.id) ? `<span class="live-dot"></span>${liveSessions(x.id)}` : '0'}</td><td class="c">${pd.docs.length || '-'}</td>
        <td class="r nowrap">${(x.id !== u.id && !WD.fixedRole(x.email)) ? `<button class="btn sm ghost" data-edit="${x.id}">수정</button> <button class="btn sm ghost" data-pw="${x.id}">비밀번호 재설정</button> <button class="btn sm ghost" data-kick="${x.id}" title="모든 세션 강제 종료">세션 종료</button> <button class="btn sm danger" data-resign="${x.id}">비활성화(퇴사)</button>` : x.id === u.id ? `<button class="btn sm ghost" data-pw="${x.id}">비밀번호 변경</button>` : '<span class="muted tiny">대표만 변경</span>'}</td></tr>`; }).join('')}
      </tbody></table>${active.length > 1 ? '' : `<div class="pad muted">아직 실장·직원 계정이 없습니다. [계정 등록]으로 발급하세요.</div>`}</div>
      <div class="card flush"><div class="sub-head">${I('lock')} 비활성 계정 (접근 차단) ${resigned.length}명</div><table class="tbl"><thead><tr><th>이름</th><th>이메일</th><th>이전 소속</th><th>비활성화 일시</th><th>로그인</th><th>보관 DB 기록</th><th></th></tr></thead><tbody>
      ${resigned.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td class="muted">${esc(x.email || x.loginId)}</td><td>${esc(x.dept)} · ${esc(x.empType)}</td><td>${WD.fmtDT(x.resignedAt)}</td><td><span class="badge st-revision">${I('lock', 'xs')} 차단됨</span></td><td>${vault.records.filter((r) => r.userId === x.id).length}건</td><td class="r"><a class="btn sm ghost" href="#/vault?u=${x.id}">보관 DB 보기</a></td></tr>`).join('') || `<tr><td colspan="7"><p class="muted pad">비활성 계정이 없습니다.</p></td></tr>`}
      </tbody></table></div>
    </div>`;
    el.querySelectorAll('[data-resign]').forEach((b) => b.addEventListener('click', () => resignWizard(WD.user(b.dataset.resign))));
    el.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', async () => {
      const x = WD.user(b.dataset.kick);
      if (!(await WD.ui.confirm('세션 강제 종료', `${x.name}님의 모든 로그인 세션을 즉시 종료합니다.`))) return;
      WD.tx((d) => { const n = WD.auth.revokeAll(d, x.id, 'ceo'); WD.audit('SESSION_REVOKE', { type: 'user', id: x.id, name: x.name }, `관리자 강제 종료 ${n}개`); });
      WD.ui.toast('세션을 종료했습니다.'); WD.app.refresh();
    }));
    el.querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', () => {
      const x = WD.user(b.dataset.pw);
      WD.ui.modal({ title: `비밀번호 ${x.id === u.id ? '변경' : '재설정'} · ${x.name}`, okText: '저장',
        body: `<label class="fld"><span>새 비밀번호 (8자 이상)</span><input type="password" data-p autocomplete="new-password"></label><label class="fld"><span>새 비밀번호 확인</span><input type="password" data-p2 autocomplete="new-password"></label>${x.id !== u.id ? '<p class="tiny muted">재설정하면 해당 계정의 기존 세션이 모두 만료됩니다.</p>' : ''}`,
        onOk: async (w) => {
          const pw = w.querySelector('[data-p]').value;
          if (pw.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
          if (pw !== w.querySelector('[data-p2]').value) throw new Error('비밀번호가 서로 다릅니다.');
          const h = await WD.sha256('wooridoori::' + pw);
          WD.tx((d) => { const t = d.users.find((y) => y.id === x.id); t.pwHash = h; if (x.id !== u.id) WD.auth.revokeAll(d, x.id, 'ceo'); WD.audit('USER_CREATE', { type: 'user', id: x.id, name: x.name }, '비밀번호 변경/재설정'); });
          WD.ui.toast('비밀번호를 저장했습니다.'); WD.app.refresh();
        } });
    }));
    const form = (x = null) => WD.ui.modal({ title: x ? `계정 수정 · ${x.name}` : '계정 등록', okText: x ? '저장' : '등록', size: 'md',
      body: `<div class="grid2"><label class="fld"><span>이름</span><input data-k="name" value="${esc(x?.name || '')}"></label><label class="fld"><span>이메일 (로그인 ID)</span><input type="email" data-k="email" value="${esc(x?.email || '')}" ${x ? 'disabled' : ''}></label>
        <label class="fld"><span>직급</span><select data-k="role">${['ceo', 'admin', 'manager', 'staff'].map((r) => `<option value="${r}" ${(x?.role || 'staff') === r ? 'selected' : ''}>${WD.ROLE_LABEL[r]}</option>`).join('')}</select></label>
        <label class="fld"><span>고용 유형</span><select data-k="empType">${['정규직', '위촉강사'].map((t) => `<option ${x?.empType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="fld"><span>부서</span><input data-k="dept" list="depts" value="${esc(x?.dept || '')}" placeholder="예) 교육팀"><datalist id="depts">${[...new Set(WD.db.users.map((y) => y.dept).filter(Boolean))].map((dp) => `<option>${esc(dp)}</option>`).join('')}</datalist></label>
        <label class="fld"><span>직함</span><input data-k="title" value="${esc(x?.title || '')}" placeholder="예) 선생님, 실장"></label>
        <label class="fld"><span>출근 기준</span><input type="time" data-k="workStart" value="${x?.workStart || '09:00'}"></label><label class="fld"><span>퇴근 기준</span><input type="time" data-k="workEnd" value="${x?.workEnd || '18:00'}"></label>
        ${x ? '' : '<label class="fld full"><span>초기 비밀번호 (8자 이상)</span><input type="password" data-k="pw" autocomplete="new-password"></label>'}</div>
        <p class="tiny muted">대표 외 직급은 문서 작성·열람만 가능하며 다운로드·PDF/엑셀 내보내기·복사·인쇄가 차단됩니다. 대표·관리자는 같은 최고 권한입니다. happydrawing2@naver.com(대표)·yunt59894@gmail.com(관리자)은 고정 직급으로 보호됩니다.</p>`,
      onOk: async (w) => {
        const v = {}; w.querySelectorAll('[data-k]').forEach((i) => (v[i.dataset.k] = i.value.trim()));
        if (!v.name) throw new Error('이름을 입력하세요.');
        if (!WD.isTop({ role: u.realRole || u.role })) throw new Error('대표·관리자만 계정을 관리할 수 있습니다.');
        if (x && WD.fixedRole(x.email)) v.role = WD.fixedRole(x.email); // 고정 이메일은 직급 변경 불가
        if (!x && WD.fixedRole(v.email)) v.role = WD.fixedRole(v.email);
        if (x) {
          WD.tx((d) => { const t = d.users.find((y) => y.id === x.id); const before = t.role; Object.assign(t, { name: v.name, role: v.role, empType: v.empType, dept: v.dept, title: v.title, workStart: v.workStart, workEnd: v.workEnd }); WD.audit('USER_CREATE', { type: 'user', id: t.id, name: t.name }, `계정 수정${before !== v.role ? ` · 권한 ${WD.ROLE_LABEL[before]} → ${WD.ROLE_LABEL[v.role]}` : ''}`); });
          WD.ui.toast('저장했습니다.'); WD.app.refresh(); return;
        }
        const email = v.email.toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('올바른 이메일을 입력하세요.');
        if (WD.db.users.some((y) => (y.email || '').toLowerCase() === email)) throw new Error('이미 등록된 이메일입니다.');
        if ((v.pw || '').length < 8) throw new Error('초기 비밀번호는 8자 이상이어야 합니다.');
        const pwHash = await WD.sha256('wooridoori::' + v.pw);
        WD.tx((d) => { const nu = { id: WD.uid('u'), loginId: email, email, name: v.name, role: v.role, title: v.title || ({ admin: '관리자', manager: '실장', staff: '선생님' }[v.role]), empType: v.empType, dept: v.dept || '미지정', joinedAt: WD.ymd(), phone: '', workStart: v.workStart || '09:00', workEnd: v.workEnd || '18:00', pwHash, status: 'ACTIVE', createdAt: WD.now() }; d.users.push(nu); WD.audit('USER_CREATE', { type: 'user', id: nu.id, name: nu.name }, `${WD.ROLE_LABEL[nu.role]} · ${nu.empType} · ${nu.dept}`); });
        WD.ui.toast('계정을 등록했습니다. 이메일과 초기 비밀번호를 본인에게 전달하세요.'); WD.app.refresh();
      } });
    el.querySelector('[data-add]').addEventListener('click', () => form());
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => form(WD.user(b.dataset.edit))));
  };
})();
