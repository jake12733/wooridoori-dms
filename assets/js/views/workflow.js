/* =========================================================================
 * 수신함·발송 이력 · 결재/보완 워크플로우 보드 · 유형별 필수 서류 체크리스트
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const V = (WD.views = WD.views || {});
  const I = (n, c) => WD.icon(n, c);
  const esc = WD.esc;

  /* ---------------- 알림함 · 메시지 (직원들과 소통 창구) ---------------- */
  function renderMessages(el, query, u, tabsHTML) {
    const convs = WD.api.messages.conversations();
    const peer = query.with || (convs.find((c) => c.unread)?.id) || 'ALL';
    const cur = convs.find((c) => c.id === peer) || convs[0];
    const docs = WD.api.documents.visible().slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 50);
    const fmtT = (iso) => { const d = new Date(iso); const today = WD.ymd() === WD.ymd(d); return today ? `${WD.pad(d.getHours())}:${WD.pad(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()}`; };
    const bubble = (m) => {
      const mine = m.from === u.id; const s = WD.user(m.from);
      const doc = m.docId ? WD.doc(m.docId) : null;
      const d = new Date(m.at);
      return `<div class="msg ${mine ? 'mine' : ''}">
        ${mine ? '' : WD.ui.avatar(s || { id: m.from, name: '?' }, 30)}
        <div class="msg-col">${mine ? '' : `<div class="msg-from"><b>${esc(s?.name || '(삭제된 사용자)')}</b>${s ? WD.roleBadge(WD.effectiveRole(s)) : ''}</div>`}
          <div class="msg-bubble">${esc(m.text).replace(/\n/g, '<br>')}${m.docId ? `<a class="msg-doc" href="#/doc/${m.docId}">${doc ? WD.ui.kindIcon(doc.kind) : WD.icon('file')}<span>${esc(doc?.title || '(열람할 수 없는 문서)')}</span></a>` : ''}</div>
          <time>${WD.ymd(d).slice(5).replace('-', '/')} ${WD.pad(d.getHours())}:${WD.pad(d.getMinutes())}${mine && peer !== 'ALL' ? ` · ${(m.readBy || []).includes(peer) ? '읽음' : '안 읽음'}` : ''}</time></div></div>`;
    };
    const threadHTML = () => { const th = WD.api.messages.thread(cur.id); return th.length ? th.map(bubble).join('') : `<div class="msg-empty">${WD.icon('send')}<p>${cur.all ? '전체 직원에게 보내는 공지방입니다. 첫 메시지를 남겨 보세요.' : `${esc(cur.name)}님과의 대화를 시작해 보세요.`}</p></div>`; };
    el.innerHTML = `<div class="page">
      <div class="page-head simple"><div><h1>알림함</h1><p class="muted">직원들과 메시지로 바로 소통하고, 문서를 함께 보낼 수 있어요.</p></div></div>
      ${tabsHTML}
      <div class="chat card flush">
        <aside class="chat-list">${convs.map((c) => `<a class="conv ${c.id === cur.id ? 'active' : ''} ${c.inactive ? 'inactive' : ''}" href="#/inbox?tab=msg&with=${c.id}">
          ${c.all ? `<span class="avatar all-room">${WD.icon('megaphone')}</span>` : WD.ui.avatar(WD.user(c.id), 36)}
          <span class="conv-body"><span class="conv-top"><b>${esc(c.name)}</b>${c.role ? WD.roleBadge(c.role) : ''}${c.inactive ? '<small class="muted">비활성</small>' : ''}<time>${c.last ? fmtT(c.last.at) : ''}</time></span>
          <small>${c.last ? esc((c.last.from === u.id ? '나: ' : '') + (c.last.text || '📎 문서')) : '대화 없음'}</small></span>
          ${c.unread ? `<em class="conv-unread">${c.unread}</em>` : ''}</a>`).join('')}</aside>
        <section class="chat-main">
          <div class="chat-head">${cur.all ? `<span class="avatar all-room">${WD.icon('megaphone')}</span><b>전체 공지방</b><small class="muted">활성 직원 전체가 함께 보는 방</small>` : `${WD.ui.avatar(WD.user(cur.id), 32)}<b>${esc(cur.name)}</b>${cur.role ? WD.roleBadge(cur.role) : ''}`}</div>
          <div class="chat-thread" id="chat-thread">${threadHTML()}</div>
          ${cur.inactive ? '<div class="chat-input"><p class="muted">비활성화된 계정이라 메시지를 보낼 수 없습니다.</p></div>' : `<form class="chat-input" id="chat-form">
            <select id="chat-doc" title="문서 함께 보내기"><option value="">📎 문서 첨부 안 함</option>${docs.map((d) => `<option value="${d.id}">${esc(d.title)}</option>`).join('')}</select>
            <textarea id="chat-text" rows="2" placeholder="메시지를 입력하세요 (Enter 보내기 · Shift+Enter 줄바꿈)"></textarea>
            <button class="btn primary" type="submit">${WD.icon('send')} 보내기</button></form>`}
        </section>
      </div></div>`;
    const thread = el.querySelector('#chat-thread');
    const scrollEnd = () => { thread.scrollTop = thread.scrollHeight; };
    scrollEnd();
    WD.api.messages.markRead(cur.id);
    const form = el.querySelector('#chat-form');
    if (form) {
      const ta = el.querySelector('#chat-text');
      const send = () => {
        try { WD.api.messages.send(cur.id, ta.value, el.querySelector('#chat-doc').value || null); ta.value = ''; el.querySelector('#chat-doc').value = ''; thread.innerHTML = threadHTML(); scrollEnd(); }
        catch (e) { WD.ui.toast(e.message, 'warn'); }
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
      setTimeout(() => ta.focus(), 50);
    }
    // 새 메시지 자동 반영 (같은 브라우저의 다른 탭·주기 확인)
    let lastSig = JSON.stringify(WD.api.messages.thread(cur.id).map((m) => [m.id, (m.readBy || []).length]));
    const poll = () => {
      if (!thread.isConnected) return;
      WD.load();
      const sig = JSON.stringify(WD.api.messages.thread(cur.id).map((m) => [m.id, (m.readBy || []).length]));
      if (sig !== lastSig) { lastSig = sig; const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80; thread.innerHTML = threadHTML(); if (atBottom) scrollEnd(); WD.api.messages.markRead(cur.id); }
    };
    const iv = setInterval(poll, 2500);
    const onStorage = (e) => { if (e.key === WD.DB_KEY) poll(); };
    window.addEventListener('storage', onStorage);
    WD.app.onCleanup(() => { clearInterval(iv); window.removeEventListener('storage', onStorage); });
  }

  /* ---------------- 알림함: 발송 이력 (누가 · 누구에게 · 어떤 문서 · 몇 시) ---------------- */
  V.inbox = (el, p, query, u) => {
    const db = WD.db;
    const isTop = WD.isTop(u);
    const tab = query.tab || 'msg';
    const recv = db.dispatches.filter((x) => (x.targets || []).includes(u.id));
    const sent = db.dispatches.filter((x) => x.senderId === u.id);
    const all = isTop ? db.dispatches : [];
    const notes = db.notifications.filter((n) => n.userId === u.id);
    const unreadDoc = new Set(notes.filter((n) => !n.read && n.docId).map((n) => n.docId));
    const list = tab === 'sent' ? sent : tab === 'all' ? all : recv;
    const who = (x) => {
      const s = WD.user(x.senderId);
      const name = x.senderName || s?.name || '(삭제된 사용자)';
      const role = x.senderRole || WD.effectiveRole(s) || 'staff';
      return `${WD.ui.avatar(s || { id: x.senderId || 'x', name }, 30)}<span class="who"><b>${esc(name)}</b>${WD.roleBadge(role)}</span>`;
    };
    const toWhom = (x) => {
      const t = x.targetNames || (x.targets || []).map((id) => ({ name: WD.userName(id), role: WD.effectiveRole(WD.user(id)) }));
      if (!t.length) return x.folderId ? `<span class="muted">${esc(WD.folderPath(x.folderId))} 폴더</span>` : '<span class="muted">-</span>';
      const shown = t.slice(0, 4).map((r) => `<span class="to-chip">${esc(r.name)} <small>${WD.ROLE_LABEL[r.role] || ''}</small></span>`).join('');
      return shown + (t.length > 4 ? `<span class="to-chip more">외 ${t.length - 4}명</span>` : '');
    };
    const row = (x) => {
      const doc = WD.doc(x.docId);
      const can = doc && WD.sec.canView(doc, u);
      const dt = new Date(x.at);
      return `<li class="${tab === 'in' && unreadDoc.has(x.docId) ? 'unread' : ''}"><a ${can ? `href="#/doc/${x.docId}"` : ''} class="send-row ${can ? '' : 'disabled'}" data-doc="${x.docId}">
        <div class="sr-from">${who(x)}</div>
        <div class="sr-arrow">${I('arrow')}</div>
        <div class="sr-to">${toWhom(x)}</div>
        <div class="sr-doc">${doc ? WD.ui.kindIcon(doc.kind) : I('file')}<span><b>${esc(x.docTitle || doc?.title || '(삭제·이관된 문서)')}</b>${x.message ? `<small>${esc(x.message)}</small>` : ''}</span></div>
        <time class="sr-time"><b>${WD.ymd(dt).slice(5).replace('-', '.')}</b> ${WD.pad(dt.getHours())}:${WD.pad(dt.getMinutes())}<small>${WD.ymd(dt).slice(0, 4)}</small></time>
      </a></li>`;
    };
    const tabsHTML = `<div class="tabs big">
        <a class="tab ${tab === 'msg' ? 'active' : ''}" href="#/inbox?tab=msg">💬 메시지 <em>${WD.api.messages.unreadCount()}</em></a>
        <a class="tab ${tab === 'in' ? 'active' : ''}" href="#/inbox?tab=in">받은 문서 <em>${recv.length}</em></a>
        <a class="tab ${tab === 'sent' ? 'active' : ''}" href="#/inbox?tab=sent">보낸 문서 <em>${sent.length}</em></a>
        ${isTop ? `<a class="tab ${tab === 'all' ? 'active' : ''}" href="#/inbox?tab=all">전체 발송 이력 <em>${all.length}</em></a>` : ''}
        <a class="tab ${tab === 'note' ? 'active' : ''}" href="#/inbox?tab=note">기타 알림 <em>${notes.filter((n) => !n.read).length}</em></a>
      </div>`;
    if (tab === 'msg') { renderMessages(el, query, u, tabsHTML); return; }
    el.innerHTML = `<div class="page">
      <div class="page-head simple"><div><h1>알림함</h1><p class="muted">누가 · 누구에게 · 어떤 문서를 · 몇 시에 보냈는지 한눈에 봅니다. 줄을 누르면 문서가 열려요.</p></div>
        <button class="btn ghost" data-readall>${I('check')} 모두 읽음</button></div>
      ${tabsHTML}
      <div class="card flush">
        ${tab === 'note'
          ? (notes.length ? `<ul class="inbox">${notes.map((n) => `<li class="${n.read ? '' : 'unread'}"><a href="${n.link || '#/inbox'}" data-n="${n.id}"><span class="ibody"><b>${esc(n.title)}</b><small>${esc(n.body)}</small></span><time>${WD.fmtDT(n.at)}</time></a></li>`).join('')}</ul>` : WD.ui.empty('알림이 없습니다.'))
          : (list.length ? `<div class="send-head"><span>보낸 사람</span><span></span><span>받는 사람</span><span>문서</span><span>보낸 시각</span></div><ul class="send-list">${list.map(row).join('')}</ul>` : WD.ui.empty(tab === 'sent' ? '아직 보낸 문서가 없습니다. 문서 화면에서 [원클릭 발송]을 눌러 보세요.' : '받은 문서가 없습니다.', 'send'))}
      </div></div>`;
    el.querySelectorAll('[data-doc]').forEach((a) => a.addEventListener('click', () => WD.tx((d2) => d2.notifications.forEach((n) => { if (n.userId === u.id && n.docId === a.dataset.doc) n.read = true; }))));
    el.querySelectorAll('[data-n]').forEach((a) => a.addEventListener('click', () => WD.tx((d2) => { const n = d2.notifications.find((x) => x.id === a.dataset.n); if (n) n.read = true; })));
    el.querySelector('[data-readall]').addEventListener('click', () => { WD.tx((d2) => d2.notifications.forEach((n) => { if (n.userId === u.id) n.read = true; })); WD.app.refresh(); });
  };

  /* ---------------- 결재·보완 워크플로우 ---------------- */
  V.workflow = (el, p, query, u) => {
    const db = WD.db;
    const scope = query.scope || (WD.isTop(u) ? 'all' : 'mine');
    const docs = db.documents.filter((d) => d.status !== 'DRAFT' && WD.sec.canView(d, u) && (scope === 'all' || d.ownerId === u.id || d.assigneeId === u.id));
    const cols = ['PENDING', 'REVISION_REQUIRED', 'RESUBMITTED', 'APPROVED'];
    const lastEv = (d, to) => [...db.wfEvents].reverse().find((e) => e.docId === d.id && (!to || e.to === to));
    const card = (d) => {
      const rev = d.status === 'REVISION_REQUIRED' ? lastEv(d, 'REVISION_REQUIRED') : null;
      const revCount = db.wfEvents.filter((e) => e.docId === d.id && e.to === 'REVISION_REQUIRED').length;
      const canAct = WD.isTop(u) && ['PENDING', 'RESUBMITTED'].includes(d.status);
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
        <div class="seg"><a class="${scope === 'mine' ? 'active' : ''}" href="#/workflow?scope=mine">내 문서</a><a class="${scope === 'all' ? 'active' : ''}" href="#/workflow?scope=all">${WD.isTop(u) ? '전체' : '열람 가능 전체'}</a></div></div>
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
        const d = WD.wf.createDoc({ title: `${item.name} (${u.name})`, kind: ['hwp', 'hwpx'].includes(ext) ? 'hwp' : 'file', folderId: 'c_hr', content: { fileId, name: f.name, size: f.size, type: f.type }, note: `제출: ${f.name}` });
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
    const isCEO = WD.isTop(u);
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
        ${rows.map((r) => { const pct = (r.items.length ? Math.round((r.cnt.DONE / r.items.length) * 100) : 100); return `<tr class="click" data-person="${r.x.id}"><td><div class="row gap-s center">${WD.ui.avatar(r.x, 26)}<b>${esc(r.x.name)}</b><small class="muted">${esc(r.x.dept)}</small></div></td><td><span class="tag">${esc(r.x.empType)}</span></td>
          <td><div class="progress"><span style="width:${pct}%"></span></div><small>${pct}% (${r.cnt.DONE}/${r.items.length})</small></td>
          <td class="c">${r.cnt.MISSING ? `<b class="t-danger">${r.cnt.MISSING}</b>` : '0'}</td><td class="c">${r.cnt.REVISION + r.cnt.EXPIRED ? `<b class="t-warn">${r.cnt.REVISION + r.cnt.EXPIRED}</b>` : '0'}</td><td class="c">${r.cnt.REVIEW}</td><td class="c">${r.cnt.DONE}</td>
          <td class="tiny">${r.items.filter((i) => i.st !== 'DONE').map((i) => `<span class="badge ${WD.wf.SUB_STATUS[i.st].cls}">${esc(i.it.name)}</span>`).join(' ') || '<span class="t-ok">모두 완료</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>` : ''}
      <div class="person-lists">${rows.length ? '' : WD.ui.empty('등록된 실장·직원이 없습니다. [인사·계정 관리]에서 계정을 등록하면 필수 서류 현황이 집계됩니다.', 'users')}${rows.map((r) => `<div class="card person-card" id="pc-${r.x.id}">
        <div class="pc-head">${WD.ui.avatar(r.x, 34)}<div><b>${esc(r.x.name)}</b> <small class="muted">${esc(r.x.title)} · ${esc(r.x.dept)}</small><div><span class="tag">${esc(r.set.empType)} 세트</span></div></div><div class="pc-pct">${(r.items.length ? Math.round((r.cnt.DONE / r.items.length) * 100) : 100)}%</div></div>
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
