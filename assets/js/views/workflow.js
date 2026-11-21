/* =========================================================================
 * 수신함·발송 이력 · 결재/보완 워크플로우 보드 · 유형별 필수 서류 체크리스트
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const V = (WD.views = WD.views || {});
  const I = (n, c) => WD.icon(n, c);
  const esc = WD.esc;

  /* ---------------- 수신함 ---------------- */
  V.inbox = (el, p, query, u) => {
    const db = WD.db;
    const tab = query.tab || 'in';
    const mine = db.notifications.filter((n) => n.userId === u.id);
    const sent = db.dispatches.filter((d) => d.senderId === u.id || u.role === 'CEO');
    const TYPE = { APPROVAL: '결재', REVISION: '보완', SIGN: '서명', APPROVED: '승인', EXPIRY: '만료', INFO: '공유' };
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>수신함 · 발송 이력</h1><p class="muted">원클릭 발송 즉시 수신자의 알림/수신함에 반영되고 이력이 자동 기록됩니다.</p></div>
        <button class="btn ghost" data-readall>${I('check')} 모두 읽음</button></div>
      <div class="tabs big"><a class="tab ${tab === 'in' ? 'active' : ''}" href="#/inbox">받은 알림 <em>${mine.filter((n) => !n.read).length}</em></a><a class="tab ${tab === 'sent' ? 'active' : ''}" href="#/inbox?tab=sent">${u.role === 'CEO' ? '전체 발송 이력' : '보낸 발송'} <em>${sent.length}</em></a><a class="tab ${tab === 'presets' ? 'active' : ''}" href="#/inbox?tab=presets">발송 프리셋 <em>${db.presets.length}</em></a></div>
      <div class="card flush">
      ${tab === 'in' ? (mine.length ? `<ul class="inbox">${mine.map((n) => `<li class="${n.read ? '' : 'unread'}"><a href="${n.link || '#/inbox'}" data-n="${n.id}"><span class="itype t-${n.type}">${TYPE[n.type] || '알림'}</span><span class="ibody"><b>${esc(n.title)}</b><small>${esc(n.body)}</small></span><time>${WD.fmtDT(n.at)}</time></a></li>`).join('')}</ul>` : WD.ui.empty('받은 알림이 없습니다.'))
      : tab === 'sent' ? (sent.length ? `<table class="tbl"><thead><tr><th>일시</th><th>문서</th><th>프리셋</th><th>보낸 사람</th><th>받는 사람</th><th>버전</th></tr></thead><tbody>${sent.map((d) => { const doc = WD.doc(d.docId); return `<tr><td class="nowrap muted">${WD.fmtDT(d.at)}</td><td>${doc ? `<a href="#/doc/${doc.id}">${esc(doc.title)}</a>` : '<span class="muted">(보관 DB 이관/삭제)</span>'}</td><td><span class="tag">${esc(d.presetName)}</span></td><td>${esc(WD.userName(d.senderId))}</td><td>${esc(d.targets.map((t) => WD.userName(t)).join(', ') || (d.folderId ? WD.folderPath(d.folderId) : '-'))}</td><td>${d.version ? 'v' + d.version : '-'}</td></tr>`; }).join('')}</tbody></table>` : WD.ui.empty('발송 이력이 없습니다.', 'send'))
      : `<div class="pad"><p class="muted">문서 화면의 <b>[원클릭 발송]</b> 메뉴에 표시되는 프리셋입니다. 문서 화면의 '직접 선택해서 발송'에서 새 프리셋을 저장할 수 있습니다.</p>
          <table class="tbl"><thead><tr><th>이름</th><th>동작</th><th>대상</th><th></th></tr></thead><tbody>${db.presets.map((pr) => `<tr><td><b>${esc(pr.name)}</b></td><td>${WD.wf.ACTION_LABEL[pr.action]}</td><td>${pr.action === 'REQUEST_USER' ? esc(WD.userName(pr.targetUserId)) + (WD.user(pr.targetUserId)?.status !== 'ACTIVE' ? ' <span class="tag danger">퇴사</span>' : '') : pr.action === 'SAVE_FOLDER' ? esc(WD.folderPath(pr.folderId)) : pr.action === 'DEPT' ? esc(pr.dept) : pr.action === 'SUBMIT_CEO' ? '대표' : '전체 직원'}</td><td class="r">${u.role === 'CEO' ? `<button class="btn sm ghost icon-only" data-delp="${pr.id}">${I('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`}
      </div></div>`;
    el.querySelectorAll('[data-n]').forEach((a) => a.addEventListener('click', () => WD.tx((db2) => { const n = db2.notifications.find((x) => x.id === a.dataset.n); if (n) n.read = true; })));
    el.querySelector('[data-readall]').addEventListener('click', () => { WD.tx((db2) => db2.notifications.forEach((n) => { if (n.userId === u.id) n.read = true; })); WD.app.refresh(); });
    el.querySelectorAll('[data-delp]').forEach((b) => b.addEventListener('click', () => { WD.tx((db2) => { db2.presets = db2.presets.filter((x) => x.id !== b.dataset.delp); }); WD.app.refresh(); }));
  };

  /* ---------------- 결재·보완 워크플로우 ---------------- */
  V.workflow = (el, p, query, u) => {
    const db = WD.db;
    const scope = query.scope || (u.role === 'CEO' ? 'all' : 'mine');
    const docs = db.documents.filter((d) => d.status !== 'DRAFT' && WD.sec.canView(d, u) && (scope === 'all' || d.ownerId === u.id || d.assigneeId === u.id));
    const cols = ['PENDING', 'REVISION_REQUIRED', 'RESUBMITTED', 'APPROVED'];
    const lastEv = (d, to) => [...db.wfEvents].reverse().find((e) => e.docId === d.id && (!to || e.to === to));
    const card = (d) => {
      const rev = d.status === 'REVISION_REQUIRED' ? lastEv(d, 'REVISION_REQUIRED') : null;
      const revCount = db.wfEvents.filter((e) => e.docId === d.id && e.to === 'REVISION_REQUIRED').length;
      const canAct = u.role === 'CEO' && ['PENDING', 'RESUBMITTED'].includes(d.status);
      const canResub = d.status === 'REVISION_REQUIRED' && WD.wf.canTransition(d, 'RESUBMITTED', u);
      return `<div class="kcard">
        <a href="#/doc/${d.id}" class="kc-title">${WD.ui.kindIcon(d.kind)}<b>${esc(d.title)}</b></a>
        <div class="kc-meta">${WD.ui.avatar(WD.user(d.ownerId), 20)} ${esc(WD.userName(d.ownerId))} · <span class="ver">v${d.version}</span>${revCount ? ` · 보완 ${revCount}회` : ''}</div>
        <div class="kc-meta muted">${esc(WD.folderPath(d.folderId))} · ${WD.fmtDT(d.updatedAt)}</div>
        ${rev ? `<div class="kc-reason">${I('alert', 'xs')} ${esc(rev.reason)}</div>` : ''}
        ${canAct ? `<div class="row gap-s mt-s"><button class="btn sm success" data-ap="${d.id}">${I('check')} 승인</button><button class="btn sm warn" data-rv="${d.id}">${I('pen')} 보완 요청</button></div>` : ''}
        ${canResub ? `<div class="row gap-s mt-s"><a class="btn sm primary" href="#/doc/${d.id}">${I('pen')} 수정하기</a><button class="btn sm ghost" data-rs="${d.id}">${I('refresh')} 재제출</button></div>` : ''}
      </div>`;
    };
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>결재 · 서류 보완 워크플로우</h1>
        <p class="muted">PENDING(제출) → REVISION_REQUIRED(보완 요청·사유 기록) → RESUBMITTED(수정 후 재제출) → APPROVED(최종 승인·잠금). 모든 단계는 버전(v1, v2…)과 함께 타임라인에 기록됩니다.</p></div>
        <div class="seg"><a class="${scope === 'mine' ? 'active' : ''}" href="#/workflow?scope=mine">내 문서</a><a class="${scope === 'all' ? 'active' : ''}" href="#/workflow?scope=all">${u.role === 'CEO' ? '전체' : '열람 가능 전체'}</a></div></div>
      <div class="flow-steps">${cols.map((c, i) => `<div class="fs ${WD.STATUS[c].cls}"><b>${WD.STATUS[c].label}</b><small>${c}</small><em>${docs.filter((d) => d.status === c).length}</em></div>${i < 3 ? `<span class="fs-arrow">${I('arrow')}</span>` : ''}`).join('')}</div>
      <div class="kanban">${cols.map((c) => `<div class="kcol"><div class="kcol-head">${WD.ui.status(c)}<em>${docs.filter((d) => d.status === c).length}</em></div>${docs.filter((d) => d.status === c).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map(card).join('') || '<p class="muted tiny pad">없음</p>'}</div>`).join('')}</div>
    </div>`;
    const act = async (id, to) => {
      let reason = '';
      if (to === 'REVISION_REQUIRED') { reason = await WD.ui.prompt('보완 요청 (반려)', '보완 사유', { textarea: true }); if (!reason) return; }
      try { WD.wf.transition(id, to, reason); WD.ui.toast(`${WD.STATUS[to].label} 처리되었습니다.`); WD.app.refresh(); } catch (e) { WD.ui.toast(e.message, 'error'); }
    };
    el.querySelectorAll('[data-ap]').forEach((b) => b.addEventListener('click', () => act(b.dataset.ap, 'APPROVED')));
    el.querySelectorAll('[data-rv]').forEach((b) => b.addEventListener('click', () => act(b.dataset.rv, 'REVISION_REQUIRED')));
    el.querySelectorAll('[data-rs]').forEach((b) => b.addEventListener('click', () => act(b.dataset.rs, 'RESUBMITTED')));
  };

  /* ---------------- 필수 서류 체크리스트 ---------------- */
  function submitItem(u, item, after) {
    const m = WD.ui.modal({ title: `제출: ${item.name}`, okText: '제출 (대표에게 발송)',
      body: `<label class="fld"><span>파일 (스캔본 PDF·이미지·HWP·워드 등)</span><input type="file" data-f></label>
        ${item.expiry ? `<label class="fld"><span>유효기간 만료일</span><input type="date" data-exp value="${WD.addDays(365)}"></label>` : ''}
        <p class="tiny muted">제출 문서는 인사/인사기록·제출서류 폴더(대표 전용)에 저장되며, 본인과 대표만 열람할 수 있습니다.</p>`,
      onOk: async (w) => {
        const f = w.querySelector('[data-f]').files[0]; if (!f) throw new Error('파일을 선택하세요.');
        const fileId = await WD.files.put(f, { name: f.name });
        const ext = f.name.split('.').pop().toLowerCase();
        const d = WD.wf.createDoc({ title: `${item.name} (${u.name})`, kind: ['hwp', 'hwpx'].includes(ext) ? 'hwp' : 'file', folderId: 'f_hr_rec', content: { fileId, name: f.name, size: f.size, type: f.type }, note: `제출: ${f.name}` });
        WD.tx((db) => {
          db.submissions.push({ id: WD.uid('sub'), userId: u.id, itemCode: item.code, docId: d.id, expiresAt: w.querySelector('[data-exp]')?.value || null });
          WD.audit('DOC_UPLOAD', { type: 'document', id: d.id, name: d.title }, `필수 서류 제출: ${f.name}`);
        });
        const prev = WD.db.submissions.filter((s) => s.userId === u.id && s.itemCode === item.code).slice(-2)[0];
        WD.wf.dispatch(d.id, WD.db.presets.find((p) => p.action === 'SUBMIT_CEO') || { name: '대표에게 결재·제출', action: 'SUBMIT_CEO' });
        WD.ui.toast(`${item.name} 제출 완료 — 대표에게 결재 요청되었습니다.`);
        after();
        return prev;
      } });
    return m;
  }

  V.checklist = (el, p, query, u) => {
    const db = WD.db;
    const isCEO = u.role === 'CEO';
    const people = isCEO ? WD.staffUsers() : [u];
    const rows = people.map((x) => {
      const set = WD.wf.checklistFor(x);
      const items = set.items.map((it) => ({ it, ...WD.wf.submissionStatus(x.id, it) }));
      const cnt = { MISSING: 0, REVIEW: 0, REVISION: 0, DONE: 0, EXPIRED: 0 }; items.forEach((i) => cnt[i.st]++);
      return { x, set, items, cnt };
    });
    const total = rows.reduce((a, r) => { Object.keys(r.cnt).forEach((k) => (a[k] = (a[k] || 0) + r.cnt[k])); return a; }, {});
    const all = rows.reduce((a, r) => a + r.items.length, 0);

    const sumCards = `<div class="kpis five">
      <div class="kpi"><small>필수 서류 총계</small><b>${all}</b><span class="muted">${people.length}명</span></div>
      <div class="kpi ok"><small>완료</small><b>${total.DONE || 0}</b><span>${all ? Math.round(((total.DONE || 0) / all) * 100) : 0}%</span></div>
      <div class="kpi info"><small>검토 중</small><b>${total.REVIEW || 0}</b></div>
      <div class="kpi warn"><small>보완 대기</small><b>${(total.REVISION || 0) + (total.EXPIRED || 0)}</b></div>
      <div class="kpi danger"><small>미제출</small><b>${total.MISSING || 0}</b></div></div>`;

    const cellLink = (r, i) => {
      if (i.it.source === 'contract') return i.ref ? `#/contract/${i.ref.id}` : '#/contracts';
      return i.doc ? `#/doc/${i.doc.id}` : '';
    };

    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>유형별 필수 서류 체크리스트</h1><p class="muted">정규직·위촉강사 등 고용 유형별 필수 서류 세트를 설정하고, 인원별 미제출·보완 대기·완료 현황을 자동 집계합니다.</p></div>
        ${isCEO ? `<button class="btn ghost" data-sets>${I('cog')} 필수 서류 세트 설정</button>` : ''}</div>
      ${sumCards}
      ${isCEO ? `<div class="card flush scroll-x"><table class="tbl matrix"><thead><tr><th>직원</th><th>유형</th><th>진행률</th>${['MISSING', 'REVISION', 'REVIEW', 'DONE'].map((k) => `<th class="c">${WD.wf.SUB_STATUS[k].label}</th>`).join('')}<th>미완료 항목</th></tr></thead><tbody>
        ${rows.map((r) => { const pct = Math.round((r.cnt.DONE / r.items.length) * 100); return `<tr class="click" data-person="${r.x.id}"><td><div class="row gap-s center">${WD.ui.avatar(r.x, 26)}<b>${esc(r.x.name)}</b><small class="muted">${esc(r.x.dept)}</small></div></td><td><span class="tag">${esc(r.x.empType)}</span></td>
          <td><div class="progress"><span style="width:${pct}%"></span></div><small>${pct}% (${r.cnt.DONE}/${r.items.length})</small></td>
          <td class="c">${r.cnt.MISSING ? `<b class="t-danger">${r.cnt.MISSING}</b>` : '0'}</td><td class="c">${r.cnt.REVISION + r.cnt.EXPIRED ? `<b class="t-warn">${r.cnt.REVISION + r.cnt.EXPIRED}</b>` : '0'}</td><td class="c">${r.cnt.REVIEW}</td><td class="c">${r.cnt.DONE}</td>
          <td class="tiny">${r.items.filter((i) => i.st !== 'DONE').map((i) => `<span class="badge ${WD.wf.SUB_STATUS[i.st].cls}">${esc(i.it.name)}</span>`).join(' ') || '<span class="t-ok">모두 완료</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>` : ''}
      <div class="person-lists">${rows.map((r) => `<div class="card person-card" id="pc-${r.x.id}">
        <div class="pc-head">${WD.ui.avatar(r.x, 34)}<div><b>${esc(r.x.name)}</b> <small class="muted">${esc(r.x.title)} · ${esc(r.x.dept)}</small><div><span class="tag">${esc(r.set.empType)} 세트</span></div></div><div class="pc-pct">${Math.round((r.cnt.DONE / r.items.length) * 100)}%</div></div>
        <ul class="chk-items">${r.items.map((i) => { const link = cellLink(r, i); const exp = i.sub?.expiresAt; return `<li class="ci-${i.st.toLowerCase()}">
          <span class="ci-ico">${i.st === 'DONE' ? I('check') : i.st === 'MISSING' ? '' : I('alert', 'xs')}</span>
          <span class="ci-name">${link ? `<a href="${link}">${esc(i.it.name)}</a>` : esc(i.it.name)}${exp ? ` <small class="muted">~${exp}</small> ${WD.wf.bucket(WD.daysLeft(exp)) ? WD.ui.dday(WD.daysLeft(exp)) : ''}` : ''}${i.it.source === 'contract' ? ' <small class="muted">(계약서 관리 연동)</small>' : ''}</span>
          ${WD.ui.subStatus(i.st)}
          ${!isCEO && i.it.source !== 'contract' && ['MISSING', 'REVISION', 'EXPIRED'].includes(i.st) ? `<button class="btn sm primary" data-submit="${i.it.code}">${i.st === 'MISSING' ? '제출' : '다시 제출'}</button>` : ''}
          ${isCEO && i.st === 'REVIEW' && i.doc ? `<a class="btn sm ghost" href="#/doc/${i.doc.id}">검토</a>` : ''}
        </li>`; }).join('')}</ul></div>`).join('')}</div>
    </div>`;
    el.querySelectorAll('[data-person]').forEach((tr) => tr.addEventListener('click', () => document.getElementById('pc-' + tr.dataset.person)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    el.querySelectorAll('[data-submit]').forEach((b) => b.addEventListener('click', () => {
      const item = WD.wf.checklistFor(u).items.find((i) => i.code === b.dataset.submit);
      submitItem(u, item, () => WD.app.refresh());
    }));
    el.querySelector('[data-sets]')?.addEventListener('click', () => {
      const m = WD.ui.modal({ title: '필수 서류 세트 설정', size: 'lg', okText: '저장',
        body: `<p class="muted">고용 유형별로 필수 제출 서류를 한 줄에 하나씩 입력하세요. 끝에 <code>*</code>를 붙이면 유효기간 관리 대상(만료 알림)입니다.</p>
          <div class="grid2">${db.checklistSets.map((s) => `<label class="fld"><span>${esc(s.empType)}</span><textarea rows="10" data-set="${s.id}">${s.items.filter((i) => !i.source).map((i) => i.name + (i.expiry ? ' *' : '')).join('\n')}</textarea><small class="muted">※ ${s.empType === '정규직' ? '근로계약서' : '위촉계약서'}는 계약서 관리와 자동 연동</small></label>`).join('')}</div>`,
        onOk: (w) => {
          WD.tx((d) => {
            d.checklistSets.forEach((s) => {
              const lines = w.querySelector(`[data-set="${s.id}"]`).value.split('\n').map((x) => x.trim()).filter(Boolean);
              const fixed = s.items.filter((i) => i.source);
              const items = lines.map((ln) => { const expiry = /\*$/.test(ln); const name = ln.replace(/\s*\*$/, ''); const old = s.items.find((i) => i.name === name); return { code: old?.code || WD.uid('item'), name, expiry }; });
              s.items = [...fixed, ...items];
            });
            WD.audit('CHECKLIST_EDIT', { type: 'checklist' }, d.checklistSets.map((s) => `${s.empType} ${s.items.length}종`).join(', '));
          });
          WD.ui.toast('필수 서류 세트를 저장했습니다.'); WD.app.refresh();
        } });
      return m;
    });
  };
})();
