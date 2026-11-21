/* =========================================================================
 * 통합 문서함 · 문서 뷰어/편집기 · 새 문서 · 양식 템플릿 보관함 · 원클릭 발송
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const V = (WD.views = WD.views || {});
  const I = (n, c) => WD.icon(n, c);
  const esc = WD.esc;

  /* ---------- 공통 헬퍼 ---------- */
  WD.bindDD = (el) => {
    el.querySelectorAll('[data-dd]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = el.querySelector(`[data-ddm="${b.dataset.dd}"]`);
      const open = m.classList.contains('open');
      document.querySelectorAll('.dd-menu.open').forEach((x) => x.classList.remove('open'));
      if (!open) m.classList.add('open');
    }));
  };
  const closeAllDD = () => document.querySelectorAll('.dd-menu.open').forEach((x) => x.classList.remove('open'));
  document.addEventListener('click', closeAllDD);

  WD.folderOptions = (u, { mode = 'edit', selected = '' } = {}) => {
    const db = WD.db;
    return db.folders.filter((f) => !f.parentId).map((top) => {
      const kids = db.folders.filter((f) => f.parentId === top.id);
      const opts = [top, ...kids].filter((f) => u.role === 'CEO' || (mode === 'edit' ? f.staffAccess === 'edit' : f.staffAccess !== 'none'))
        .map((f) => `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${f.parentId ? '└ ' : ''}${esc(f.name)}${u.role !== 'CEO' ? '' : f.staffAccess === 'none' ? ' (대표 전용)' : ''}</option>`).join('');
      return opts ? `<optgroup label="${esc(top.name)}">${opts}</optgroup>` : '';
    }).join('');
  };

  const visibleDocs = (u) => WD.db.documents.filter((d) => WD.sec.canView(d, u));

  /* ---------- 반출(내보내기) ---------- */
  const FORMATS = { sheet: [['xlsx', '엑셀 (.xlsx)'], ['csv', 'CSV (.csv)']], doc: [['pdf', 'PDF (.pdf)'], ['doc', 'Word 호환 (.doc)']], hwp: [['hwp', '한글 (.hwp)'], ['hwpx', '한글 (.hwpx)']], file: [['original', '원본 파일']] };
  async function exportDoc(d, fmt, live) {
    return WD.sec.exportDoc(d, fmt.toUpperCase(), async () => {
      const v = WD.latest(d.id); const base = d.title.replace(/[\\/:*?"<>|]/g, '_');
      if (d.kind === 'sheet') {
        const data = live?.getData?.() || v.content;
        const blob = fmt === 'csv' ? WD.editors.sheet.toCsvBlob(data) : await WD.editors.sheet.toXlsxBlob(data);
        WD.sec.saveBlob(blob, `${base}.${fmt}`);
      } else if (d.kind === 'doc') {
        const html = live?.getHTML?.() || v.content;
        const blob = fmt === 'pdf' ? await WD.editors.doc.toPdfBlob(d.title, html) : WD.editors.doc.toWordBlob(d.title, html);
        WD.sec.saveBlob(blob, `${base}.${fmt}`);
      } else if (d.kind === 'hwp' && live?.exportBytes) {
        const bytes = await live.exportBytes(fmt);
        WD.sec.saveBlob(new Blob([bytes], { type: fmt === 'hwpx' ? 'application/vnd.hancom.hwpx' : 'application/x-hwp' }), `${base}.${fmt}`);
      } else {
        const rec = await WD.files.get(v.content?.fileId);
        if (!rec) throw new Error('원본 파일이 이 브라우저 저장소에 없습니다.');
        WD.sec.saveBlob(rec.blob, rec.name);
      }
    });
  }
  WD.exportDoc = exportDoc;

  function exportMenu(d, live) {
    const u = WD.auth.currentRaw();
    if (!WD.sec.canExport(u)) { exportDoc(d, 'blocked'); return; }
    const fm = d.kind === 'hwp' && !live ? [['original', '저장된 한글 원본']] : FORMATS[d.kind];
    const m = WD.ui.modal({ title: '외부 반출 (대표 전용)', hideOk: true, cancelText: '닫기',
      body: `<p class="muted">반출 시 감사 로그에 사용자·일시·형식이 기록됩니다. PDF에는 시스템 브랜딩과 출력자가 표기됩니다.</p><div class="fmt-grid">${fm.map(([k, l]) => `<button class="btn ghost" data-fmt="${k}">${I('download')} ${l}</button>`).join('')}</div>` });
    m.el.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; b.textContent = '내보내는 중…'; await exportDoc(d, b.dataset.fmt, live); m.close(); }));
  }

  /* ---------- 원클릭 발송 ---------- */
  function presetIcon(p) { return I(p.icon || ({ SUBMIT_CEO: 'stamp', REQUEST_USER: 'pen', SAVE_FOLDER: 'folder', BROADCAST: 'megaphone', DEPT: 'users' }[p.action] || 'send')); }
  function presetDesc(p) {
    if (p.action === 'REQUEST_USER') return `→ ${WD.userName(p.targetUserId)}`;
    if (p.action === 'SAVE_FOLDER') return `→ ${WD.folderPath(p.folderId)}`;
    if (p.action === 'DEPT') return `→ ${p.dept}`;
    return WD.wf.ACTION_LABEL[p.action];
  }
  WD.dispatchMenuHTML = (docId) => {
    const ps = WD.db.presets.filter((p) => p.action !== 'REQUEST_USER' || WD.user(p.targetUserId)?.status === 'ACTIVE');
    return `<div class="dd">
      <button class="btn accent" data-dd="dispatch-${docId}">${I('send')} 원클릭 발송</button>
      <div class="dd-menu preset-menu" data-ddm="dispatch-${docId}">
        <div class="dd-head"><b>발송 프리셋</b><small>클릭 즉시 발송·알림·이력 기록</small></div>
        ${ps.map((p) => `<button class="preset" data-preset="${p.id}" data-doc="${docId}">${presetIcon(p)}<span><b>${esc(p.name)}</b><small>${esc(presetDesc(p))}</small></span></button>`).join('')}
        <button class="preset custom" data-custom-dispatch="${docId}">${I('plus')}<span><b>직접 선택해서 발송…</b><small>선생님·부서·전체·폴더 지정, 프리셋 저장</small></span></button>
      </div></div>`;
  };
  WD.bindDispatch = (el, after) => {
    el.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); closeAllDD();
      const p = WD.db.presets.find((x) => x.id === b.dataset.preset);
      try {
        const r = WD.wf.dispatch(b.dataset.doc, p);
        WD.ui.toast(`'${p.name}' 발송 완료 → ${r.targets.map((t) => WD.userName(t)).join(', ') || '수신자 없음'}`);
        after ? after() : WD.app.refresh();
      } catch (err) { WD.ui.toast(err.message, 'error'); }
    }));
    el.querySelectorAll('[data-custom-dispatch]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); closeAllDD(); customDispatch(b.dataset.customDispatch, after); }));
  };
  function customDispatch(docId, after) {
    const u = WD.auth.current(); const db = WD.db;
    const users = WD.activeUsers().filter((x) => x.id !== u.id);
    const depts = [...new Set(users.map((x) => x.dept))];
    const m = WD.ui.modal({ title: '직접 선택해서 발송', okText: '즉시 발송', size: 'md',
      body: `<div class="grid2">
        <div><div class="fld-label">받는 사람</div>
          <div class="chk-list">${users.map((x) => `<label class="chk"><input type="checkbox" value="${x.id}" data-u data-dept="${esc(x.dept)}"> ${WD.ui.avatar(x, 22)} ${esc(x.name)} <small>${esc(x.title)} · ${esc(x.dept)}</small></label>`).join('')}</div>
          <div class="row gap-s wrap mt-s"><button type="button" class="chip" data-all>전체 선택</button>${depts.map((d) => `<button type="button" class="chip" data-dept-pick="${esc(d)}">${esc(d)}</button>`).join('')}</div>
        </div>
        <div>
          <label class="fld"><span>저장·공유할 폴더 (선택)</span><select data-folder><option value="">이동 안 함</option>${WD.folderOptions(u, { mode: 'edit' })}</select></label>
          <label class="fld"><span>메시지</span><textarea rows="3" data-msg placeholder="예) 내일까지 서명 부탁드립니다."></textarea></label>
          <label class="chk"><input type="checkbox" data-save> 이 설정을 발송 프리셋으로 저장</label>
          <input class="mt-s" data-pname placeholder="프리셋 이름 (예: 방과후팀 공지)">
        </div></div>`,
      onOk: (w) => {
        const targets = [...w.querySelectorAll('[data-u]:checked')].map((c) => c.value);
        const folderId = w.querySelector('[data-folder]').value;
        if (!targets.length && !folderId) throw new Error('받는 사람이나 폴더를 선택하세요.');
        const r = WD.wf.dispatch(docId, { name: '직접 선택 발송', action: 'CUSTOM' }, { targets, folderId, message: w.querySelector('[data-msg]').value });
        if (w.querySelector('[data-save]').checked) {
          const name = w.querySelector('[data-pname]').value.trim() || `맞춤 발송 ${db.presets.length + 1}`;
          WD.tx((d) => {
            if (targets.length === 1 && !folderId) d.presets.push({ id: WD.uid('p'), name, action: 'REQUEST_USER', targetUserId: targets[0] });
            else if (!targets.length && folderId) d.presets.push({ id: WD.uid('p'), name, action: 'SAVE_FOLDER', folderId });
            else { const dep = [...new Set(targets.map((t) => WD.user(t)?.dept))]; const all = WD.activeUsers().filter((x) => x.id !== u.id); if (targets.length === all.length) d.presets.push({ id: WD.uid('p'), name, action: 'BROADCAST' }); else if (dep.length === 1 && all.filter((x) => x.dept === dep[0]).length === targets.length) d.presets.push({ id: WD.uid('p'), name, action: 'DEPT', dept: dep[0] }); else WD.ui.toast('여러 명 개별 지정은 프리셋 대신 부서/전체 단위로 저장됩니다.', 'warn'); }
          });
        }
        WD.ui.toast(`발송 완료 → ${r.targets.map((t) => WD.userName(t)).join(', ') || '폴더 저장'}`);
        after ? after() : WD.app.refresh();
      } });
    m.el.querySelector('[data-all]').addEventListener('click', () => m.el.querySelectorAll('[data-u]').forEach((c) => (c.checked = true)));
    m.el.querySelectorAll('[data-dept-pick]').forEach((b) => b.addEventListener('click', () => m.el.querySelectorAll('[data-u]').forEach((c) => { if (c.dataset.dept === b.dataset.deptPick) c.checked = true; })));
  }

  /* ---------- 업로드 ---------- */
  async function uploadFlow(u, folderId) {
    const m = WD.ui.modal({ title: '파일 업로드 (모든 형식)', okText: '업로드', size: 'md',
      body: `<label class="fld"><span>파일</span><input type="file" data-file></label>
        <label class="fld"><span>폴더</span><select data-folder>${WD.folderOptions(u, { mode: 'edit', selected: folderId })}</select></label>
        <label class="fld"><span>문서 제목</span><input data-title placeholder="비우면 파일명 사용"></label>
        <label class="chk"><input type="checkbox" data-convert checked> 엑셀(.xlsx/.xls/.csv)·워드(.docx)는 웹 편집 형식으로 변환</label>
        <p class="tiny muted">HWP/HWPX는 한글 엔진(rhwp)으로, PDF·이미지·텍스트는 보안 뷰어로 열립니다. 업로드된 원본은 직원 PC로 내려받을 수 없습니다.</p>`,
      onOk: async (w) => {
        const f = w.querySelector('[data-file]').files[0]; if (!f) throw new Error('파일을 선택하세요.');
        const fid = w.querySelector('[data-folder]').value; if (!fid) throw new Error('업로드 가능한 폴더가 없습니다.');
        const title = w.querySelector('[data-title]').value.trim() || f.name.replace(/\.[^.]+$/, '');
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const convert = w.querySelector('[data-convert]').checked;
        const fileId = await WD.files.put(f, { name: f.name });
        let kind = 'file', content = { fileId, name: f.name, size: f.size, type: f.type };
        if (convert && ['xlsx', 'xls', 'csv', 'ods'].includes(ext)) { kind = 'sheet'; content = await WD.editors.sheet.importFile(f); }
        else if (convert && ext === 'docx') { kind = 'doc'; content = await WD.editors.doc.importDocx(f); }
        else if (['hwp', 'hwpx', 'hml'].includes(ext)) { kind = 'hwp'; }
        const d = WD.wf.createDoc({ title, kind, folderId: fid, content, note: `업로드: ${f.name}` });
        WD.tx((db) => { const x = db.documents.find((y) => y.id === d.id); x.sourceFileId = fileId; WD.audit('DOC_UPLOAD', { type: 'document', id: d.id, name: title }, `${f.name} (${WD.ui.fileSize(f.size)}) → ${WD.folderPath(fid)}`); });
        WD.ui.toast('업로드 완료');
        WD.app.go(`#/doc/${d.id}`);
      } });
    return m;
  }

  /* =====================================================================
   * 통합 문서함
   * ===================================================================== */
  V.docs = (el, params, query, u) => {
    const db = WD.db;
    const folderId = params.folder || 'all';
    const cur = WD.folder(folderId);
    const tops = db.folders.filter((f) => !f.parentId);
    const docs = visibleDocs(u);
    const inFolder = (d, fid) => fid === 'all' || d.folderId === fid || WD.folder(d.folderId)?.parentId === fid;
    const countIn = (fid) => docs.filter((d) => inFolder(d, fid)).length;
    const accessOf = (f) => (u.role === 'CEO' ? 'edit' : f.staffAccess);
    const tree = `<a class="tree-item ${folderId === 'all' ? 'active' : ''}" href="#/docs">${I('inbox')}<span>전체 문서</span><em>${docs.length}</em></a>` + tops.map((t) => {
      const kids = db.folders.filter((f) => f.parentId === t.id);
      return `<div class="tree-group"><a class="tree-item top ${folderId === t.id ? 'active' : ''}" href="#/docs/${t.id}"><span class="fdot" style="background:${t.color}"></span><span>${esc(t.name)}</span>${accessOf(t) === 'none' ? I('lock', 'xs') : ''}<em>${countIn(t.id)}</em></a>
        ${kids.map((k) => `<a class="tree-item sub ${folderId === k.id ? 'active' : ''}" href="#/docs/${k.id}">${I('folder', 'xs')}<span>${esc(k.name)}</span>${accessOf(k) === 'none' ? I('lock', 'xs') : ''}<em>${countIn(k.id)}</em></a>`).join('')}</div>`;
    }).join('');

    let list = docs.filter((d) => inFolder(d, folderId)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const contracts = u.role === 'CEO' && ['f_hr', 'f_hr_emp', 'f_hr_inst'].includes(folderId)
      ? db.contracts.filter((c) => folderId === 'f_hr' || c.folderId === folderId) : [];
    const lvl = cur ? accessOf(cur) : null;
    const canExport = WD.sec.canExport(u);

    el.innerHTML = `<div class="page">
      <div class="page-head">
        <div><div class="crumb"><a href="#/docs">통합 문서함</a>${cur ? ` / ${esc(WD.folderPath(cur.id))}` : ''}</div>
          <h1>${cur ? esc(cur.name) : '통합 문서함'}</h1>
          <p class="muted">${cur ? `직원 권한: <b>${WD.sec.ACCESS_LABEL[cur.staffAccess]}</b>${cur.legal ? ' · <span class="tag">법정 보관 대상</span>' : ''}${u.role !== 'CEO' && cur.staffAccess === 'none' ? ' — 본인 관련 문서만 표시됩니다.' : ''}` : '인사 · 문서 · 회계 · 보안 폴더의 모든 서류를 한 곳에서 관리합니다.'}</p></div>
        <div class="row gap-s wrap">
          <div class="search-box">${I('search')}<input id="doc-q" placeholder="문서 검색" value="${esc(query.q || '')}"></div>
          <div class="dd"><button class="btn primary" data-dd="newdoc">${I('plus')} 새 문서</button>
            <div class="dd-menu" data-ddm="newdoc">
              <a class="dd-item" href="#/new/sheet${cur ? '?folder=' + cur.id : ''}">${I('sheet')} 스프레드시트 (엑셀형)</a>
              <a class="dd-item" href="#/new/doc${cur ? '?folder=' + cur.id : ''}">${I('doc')} 문서 (워드형)</a>
              <a class="dd-item" href="#/new/hwp${cur ? '?folder=' + cur.id : ''}">${I('hwp')} 한글 (HWP/HWPX)</a>
              <a class="dd-item" href="#/templates">${I('template')} 양식 템플릿에서…</a>
            </div></div>
          <button class="btn ghost" data-upload>${I('upload')} 업로드</button>
        </div>
      </div>
      <div class="docs-layout">
        <aside class="card tree">${tree}
          <div class="legend"><div>${I('lock', 'xs')} 대표 전용 폴더</div><div><span class="tag">직원</span> 열람·웹 편집 / 열람 전용</div></div>
        </aside>
        <section class="card flush">
          ${contracts.length ? `<div class="sub-head">${I('contract')} 계약서 (${contracts.length}) <small>계약서 관리에서 서명·직인·갱신</small></div>
            <table class="tbl"><tbody>${contracts.map((c) => `<tr class="click" data-href="#/contract/${c.id}"><td>${I('contract')} <b>${esc(c.title)}</b></td><td>${esc(WD.folderPath(c.folderId))}</td><td>${{ DRAFT: '초안', SENT: '서명 대기', SIGNED: '서명 완료', SEALED: '날인·잠금' }[c.status]}</td><td>${c.end} ${c.status === 'SEALED' ? WD.ui.dday(WD.daysLeft(c.end)) : ''}</td></tr>`).join('')}</tbody></table>` : ''}
          <table class="tbl docs-tbl"><thead><tr><th>문서명</th><th>폴더</th><th>상태</th><th>버전</th><th>작성자</th><th>수정일</th><th class="r">작업</th></tr></thead>
          <tbody id="doc-rows">${list.map((d) => `<tr data-title="${esc(d.title.toLowerCase())}">
            <td class="click" data-href="#/doc/${d.id}"><div class="doc-name">${WD.ui.kindIcon(d.kind)}<span><b>${esc(d.title)}</b><small>${WD.ui.KIND_LABEL[d.kind]}${d.locked ? ' · ' + I('lock', 'xs') + '잠금' : ''} · ${WD.sec.ACCESS_LABEL[WD.sec.level(d, u)]}</small></span></div></td>
            <td class="muted">${esc(WD.folderPath(d.folderId))}</td><td>${WD.ui.status(d.status)}</td><td><span class="ver">v${d.version}</span></td>
            <td class="nowrap">${esc(WD.userName(d.ownerId))}</td><td class="muted nowrap">${WD.fmtDT(d.updatedAt)}</td>
            <td class="r nowrap"><a class="btn sm ghost" href="#/doc/${d.id}">${I(WD.sec.canEdit(d, u) ? 'pen' : 'eye')} ${WD.sec.canEdit(d, u) ? '편집' : '열람'}</a>
              <button class="btn sm ${canExport ? 'ghost' : 'locked'}" data-export="${d.id}" title="${canExport ? '외부 반출 (기록됨)' : '대표만 반출 가능 — 다운로드 차단'}">${I(canExport ? 'download' : 'lock')}</button></td></tr>`).join('')}</tbody></table>
          ${list.length ? '' : WD.ui.empty('이 폴더에 표시할 문서가 없습니다.', 'folder')}
        </section>
      </div></div>`;
    WD.bindDD(el);
    el.querySelectorAll('[data-href]').forEach((r) => r.addEventListener('click', () => (location.hash = r.dataset.href)));
    el.querySelector('[data-upload]').addEventListener('click', () => uploadFlow(u, cur && lvl === 'edit' ? cur.id : ''));
    el.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => exportMenu(WD.doc(b.dataset.export))));
    const q = el.querySelector('#doc-q');
    const filter = () => { const v = q.value.trim().toLowerCase(); el.querySelectorAll('#doc-rows tr').forEach((tr) => { tr.style.display = !v || tr.dataset.title.includes(v) ? '' : 'none'; }); };
    q.addEventListener('input', filter); filter();
  };

  /* =====================================================================
   * 문서 뷰어 / 편집기
   * ===================================================================== */
  async function mountFileViewer(host, content) {
    const rec = await WD.files.get(content?.fileId);
    if (!rec) { host.innerHTML = `<div class="file-view">${WD.ui.empty('원본 파일이 이 브라우저 저장소에 없습니다. (운영 버전은 서버 스토리지에서 스트리밍)', 'file')}</div>`; return; }
    const type = rec.type || ''; const name = rec.name || '';
    if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
      await WD.ui.loadScript(WD.ui.LIBS.pdfjs);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = WD.ui.LIBS.pdfWorker;
      const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await rec.blob.arrayBuffer()) }).promise;
      host.innerHTML = `<div class="file-view pdf-view"><div class="muted tiny">${esc(name)} · ${pdf.numPages}쪽 · 보안 뷰어(PDF.js, 텍스트 선택·다운로드 불가)</div></div>`;
      const wrap = host.firstChild;
      for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
        const page = await pdf.getPage(i); const vp = page.getViewport({ scale: 1.4 });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.className = 'pdf-page';
        wrap.appendChild(c); await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      }
    } else if (type.startsWith('image/')) {
      const url = URL.createObjectURL(rec.blob); WD.app.onCleanup(() => URL.revokeObjectURL(url));
      host.innerHTML = `<div class="file-view img-view"><div class="img-guard" style="background-image:url(${url})"></div><div class="muted tiny">${esc(name)} · ${WD.ui.fileSize(rec.size)}</div></div>`;
      const img = new Image(); img.onload = () => { const g = host.querySelector('.img-guard'); g.style.aspectRatio = `${img.width}/${img.height}`; }; img.src = url;
    } else if (type.startsWith('text/') || /\.(txt|md|csv|json|log)$/i.test(name)) {
      host.innerHTML = `<div class="file-view"><pre class="text-view">${esc(await rec.blob.text())}</pre></div>`;
    } else {
      host.innerHTML = `<div class="file-view">${WD.ui.empty(`${name} (${WD.ui.fileSize(rec.size)}) — 웹 미리보기를 지원하지 않는 형식입니다. 원본 반출은 대표만 가능합니다.`, 'file')}</div>`;
    }
  }

  function timelineHTML(d) {
    const db = WD.db;
    const items = [
      ...WD.versions(d.id).map((v) => ({ at: v.at, html: `<b>v${v.version}</b> 저장 · ${esc(WD.userName(v.authorId))}<small>${esc(v.note || '')}</small>`, cls: 'tl-ver' })),
      ...db.wfEvents.filter((e) => e.docId === d.id).map((e) => ({ at: e.at, html: `${WD.ui.status(e.to)} ${esc(WD.userName(e.actorId))}${e.reason ? `<small class="reason">사유: ${esc(e.reason)}</small>` : ''}`, cls: 'tl-' + e.to.toLowerCase() })),
      ...db.dispatches.filter((x) => x.docId === d.id).map((x) => ({ at: x.at, html: `${I('send', 'xs')} 발송 '${esc(x.presetName)}' · ${esc(WD.userName(x.senderId))}<small>→ ${esc(x.targets.map((t) => WD.userName(t)).join(', ') || '폴더 저장')}</small>`, cls: 'tl-send' })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));
    return `<ol class="timeline">${items.map((i) => `<li class="${i.cls}"><time>${WD.fmtDT(i.at)}</time><div>${i.html}</div></li>`).join('')}</ol>`;
  }

  V.docView = async (el, { id }, query, u) => {
    WD.load();
    const d = WD.doc(id);
    if (!d) { el.innerHTML = `<div class="page">${WD.ui.empty('문서를 찾을 수 없습니다. (퇴사자 법정 서류는 보관 DB로 이관되었을 수 있습니다)', 'alert')}</div>`; return; }
    const lvl = WD.sec.level(d, u);
    if (lvl === 'none') { WD.auditTx('ACCESS_DENIED', { type: 'document', id: d.id, name: d.title }, '권한 없는 문서 열람 시도'); V.forbidden(el); return; }
    WD.tx((db) => { WD.audit('DOC_VIEW', { type: 'document', id: d.id, name: d.title }, `v${d.version} · ${lvl === 'edit' ? '편집 모드' : '열람 전용'}`); db.notifications.forEach((n) => { if (n.userId === u.id && n.docId === d.id) n.read = true; }); });
    const v = WD.latest(d.id);
    const editable = lvl === 'edit';
    const isOwner = d.ownerId === u.id || d.assigneeId === u.id;
    const canExport = WD.sec.canExport(u);
    const wfBtns = [];
    if (WD.wf.canTransition(d, 'PENDING', u) && isOwner) wfBtns.push(`<button class="btn ghost" data-wf="PENDING">${I('send')} 결재 제출</button>`);
    if (WD.wf.canTransition(d, 'RESUBMITTED', u)) wfBtns.push(`<button class="btn ghost" data-wf="RESUBMITTED">${I('refresh')} 재제출</button>`);
    if (u.role === 'CEO' && ['PENDING', 'RESUBMITTED'].includes(d.status)) wfBtns.push(`<button class="btn warn" data-wf="REVISION_REQUIRED">${I('pen')} 보완 요청</button>`, `<button class="btn success" data-wf="APPROVED">${I('check')} 최종 승인·잠금</button>`);
    const lastRev = [...WD.db.wfEvents].reverse().find((e) => e.docId === d.id && e.to === 'REVISION_REQUIRED');

    el.innerHTML = `<div class="page doc-page-v">
      <div class="doc-head">
        <div class="doc-head-l">
          <div class="crumb"><a href="#/docs">통합 문서함</a> / <a href="#/docs/${d.folderId}">${esc(WD.folderPath(d.folderId))}</a></div>
          <div class="row gap-s center wrap">${WD.ui.kindIcon(d.kind)}
            ${editable ? `<input class="title-input" id="doc-title" value="${esc(d.title)}" aria-label="문서 제목">` : `<h1 class="doc-title">${esc(d.title)}</h1>`}
            ${WD.ui.status(d.status)} <span class="ver">v${d.version}</span> ${d.locked ? `<span class="tag lock">${I('lock', 'xs')} 잠금</span>` : ''}
            <span class="tag ${editable ? 'ok' : ''}">${WD.sec.ACCESS_LABEL[lvl]}</span><span class="dirty hidden" id="dirty">● 저장 안 됨</span>
          </div>
        </div>
        <div class="doc-actions">
          ${editable ? `<button class="btn primary" data-save>${I('save')} 새 버전 저장 (v${d.version + 1})</button>` : ''}
          ${WD.dispatchMenuHTML(d.id)}
          ${wfBtns.join('')}
          <div class="dd"><button class="btn ghost icon-only" data-dd="more" aria-label="더보기">⋯</button>
            <div class="dd-menu right" data-ddm="more">
              ${editable && d.kind === 'sheet' ? `<button class="dd-item" data-import="sheet">${I('upload')} 엑셀/CSV 가져오기</button>` : ''}
              ${editable && d.kind === 'doc' ? `<button class="dd-item" data-import="docx">${I('upload')} Word(.docx) 가져오기</button>` : ''}
              ${editable && d.kind === 'hwp' ? `<button class="dd-item" data-import="hwp">${I('upload')} HWP/HWPX 파일 열기</button>` : ''}
              ${['sheet', 'doc', 'hwp'].includes(d.kind) ? `<button class="dd-item" data-tpl>${I('template')} 템플릿으로 저장</button>` : ''}
              ${editable ? `<button class="dd-item" data-move>${I('folder')} 폴더 이동</button>` : ''}
            </div></div>
          <button class="btn ${canExport ? 'ghost' : 'locked'}" data-export title="${canExport ? '외부 반출 (대표 전용, 기록됨)' : '다운로드·인쇄·외부 반출은 대표만 가능합니다'}">${I(canExport ? 'download' : 'lock')} ${canExport ? '반출' : '반출 차단'}</button>
        </div>
      </div>
      ${d.status === 'REVISION_REQUIRED' && lastRev ? `<div class="alert alert-warn">${I('alert')}<span><b>보완 요청</b> (${esc(WD.userName(lastRev.actorId))}, ${WD.fmtDT(lastRev.at)}) — ${esc(lastRev.reason)}<br><small>내용을 수정해 새 버전으로 저장한 뒤 [재제출]하세요.</small></span></div>` : ''}
      ${!canExport ? `<div class="alert alert-info slim">${I('lock')}<span>직원 보안 모드: 웹 뷰어 열람·웹 편집만 가능합니다. 다운로드·복사·인쇄·우클릭이 차단되며 시도는 감사 로그에 기록됩니다.</span></div>` : ''}
      <div class="doc-body">
        <section class="editor-area protected ${editable ? '' : 'readonly'}" id="editor-area"><div class="editor-host" id="editor-host"><div class="loading">${I('refresh', 'spin')} 편집기 불러오는 중…</div></div></section>
        <aside class="doc-side card">
          <div class="tabs" role="tablist"><button class="tab active" data-tab="info">정보</button><button class="tab" data-tab="ver">버전 ${d.version}</button><button class="tab" data-tab="tl">이력</button></div>
          <div class="tab-pane" data-pane="info">
            <dl class="kv"><dt>폴더</dt><dd>${esc(WD.folderPath(d.folderId))}</dd><dt>형식</dt><dd>${WD.ui.KIND_LABEL[d.kind]}</dd><dt>작성자</dt><dd>${esc(WD.userName(d.ownerId))}</dd>
            ${d.assigneeId ? `<dt>담당(요청)</dt><dd>${esc(WD.userName(d.assigneeId))}</dd>` : ''}<dt>생성</dt><dd>${WD.fmtDT(d.createdAt)}</dd><dt>최종 수정</dt><dd>${WD.fmtDT(d.updatedAt)}</dd>
            ${d.locked ? `<dt>승인·잠금</dt><dd>${WD.fmtDT(d.lockedAt)}</dd>` : ''}<dt>공유 대상</dt><dd>${(d.recipients || []).map((r) => esc(WD.userName(r))).join(', ') || '-'}</dd>
            ${d.legalHold || WD.folder(d.folderId)?.legal ? '<dt>보관</dt><dd><span class="tag">법정 보관 대상</span></dd>' : ''}</dl>
          </div>
          <div class="tab-pane hidden" data-pane="ver"><ul class="ver-list">${WD.versions(d.id).reverse().map((x) => `<li><div><b>v${x.version}</b> ${x.version === d.version ? '<span class="tag ok">현재</span>' : ''}<small>${esc(WD.userName(x.authorId))} · ${WD.fmtDT(x.at)}</small><small>${esc(x.note || '')}</small></div>${x.version !== d.version && d.kind !== 'hwp' && d.kind !== 'file' ? `<button class="btn sm ghost" data-ver="${x.version}">${editable ? '불러오기' : '보기'}</button>` : ''}</li>`).join('')}</ul></div>
          <div class="tab-pane hidden" data-pane="tl">${timelineHTML(d)}</div>
        </aside>
      </div></div>`;

    WD.bindDD(el);
    WD.bindDispatch(el);
    el.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => {
      el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === t));
      el.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab));
    }));

    // 편집기 마운트
    const host = el.querySelector('#editor-host');
    const dirtyEl = el.querySelector('#dirty');
    const onChange = () => dirtyEl.classList.remove('hidden');
    let ed = null;
    try {
      if (d.kind === 'sheet') ed = await WD.editors.sheet.mount(host, v.content, { readOnly: !editable, onChange });
      else if (d.kind === 'doc') ed = await WD.editors.doc.mount(host, v.content, { readOnly: !editable, onChange });
      else if (d.kind === 'hwp') ed = await WD.editors.hwp.mount(host, v.content, { readOnly: !editable });
      else await mountFileViewer(host, v.content);
    } catch (e) { console.error(e); host.insertAdjacentHTML('beforeend', `<div class="alert alert-danger">${I('alert')}<span>편집기 로드 실패: ${esc(e.message)}</span></div>`); }
    if (ed) WD.app.onCleanup(() => ed.destroy && ed.destroy());
    WD.sec.watermark(el.querySelector('#editor-area'));

    // 저장
    el.querySelector('[data-save]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        let content;
        if (d.kind === 'sheet') content = ed.getData();
        else if (d.kind === 'doc') content = ed.getHTML();
        else if (d.kind === 'hwp') {
          const bytes = await ed.exportBytes('hwp');
          const name = (el.querySelector('#doc-title')?.value || d.title) + '.hwp';
          const fileId = await WD.files.put(new Blob([bytes], { type: 'application/x-hwp' }), { name });
          content = { fileId, name, size: bytes.byteLength };
          ed.markSaved(name);
        } else { WD.ui.toast('파일 형식 문서는 새 파일을 업로드해 교체하세요.', 'warn'); btn.disabled = false; return; }
        const note = await WD.ui.prompt(`v${WD.doc(d.id).version + 1} 저장`, '변경 내용 메모', { placeholder: '예) 참여 인원 통계표 추가', value: d.status === 'REVISION_REQUIRED' ? '보완 요청 반영' : '내용 수정' });
        if (note === null) { btn.disabled = false; return; }
        const newTitle = el.querySelector('#doc-title')?.value.trim();
        WD.wf.saveVersion(d.id, content, note);
        if (newTitle && newTitle !== d.title) WD.tx((db) => { db.documents.find((x) => x.id === d.id).title = newTitle; });
        WD.ui.toast(`v${WD.doc(d.id).version}로 저장했습니다.`);
        WD.app.refresh();
      } catch (err) { WD.ui.toast(err.message, 'error'); btn.disabled = false; }
    });

    // 워크플로우
    el.querySelectorAll('[data-wf]').forEach((b) => b.addEventListener('click', async () => {
      const to = b.dataset.wf; let reason = '';
      if (dirtyEl && !dirtyEl.classList.contains('hidden') && to !== 'REVISION_REQUIRED' && to !== 'APPROVED') { WD.ui.toast('저장되지 않은 변경이 있습니다. 먼저 [새 버전 저장]을 눌러 주세요.', 'warn'); return; }
      if (to === 'REVISION_REQUIRED') { reason = await WD.ui.prompt('보완 요청 (반려)', '보완 사유', { textarea: true, placeholder: '예) 3쪽 참여 인원 통계표를 추가해 주세요.' }); if (!reason) return; }
      if (to === 'APPROVED' && !(await WD.ui.confirm('최종 승인', `v${d.version}을 최종 승인하고 잠금합니다. 승인 후에는 누구도 수정할 수 없습니다.`))) return;
      try { WD.wf.transition(d.id, to, reason); WD.ui.toast(`${WD.STATUS[to].label} 처리되었습니다.`); WD.app.refresh(); }
      catch (err) { WD.ui.toast(err.message, 'error'); }
    }));

    el.querySelector('[data-export]').addEventListener('click', () => exportMenu(d, ed));

    // 가져오기
    el.querySelectorAll('[data-import]').forEach((b) => b.addEventListener('click', async () => {
      const t = b.dataset.import;
      const f = await WD.ui.pickFile(t === 'sheet' ? '.xlsx,.xls,.csv,.ods' : t === 'docx' ? '.docx' : '.hwp,.hwpx');
      if (!f) return;
      try {
        if (t === 'sheet') { ed.load(await WD.editors.sheet.importFile(f)); onChange(); }
        else if (t === 'docx') { ed.setHTML(await WD.editors.doc.importDocx(f)); onChange(); }
        else { await ed.editor.loadFile(await f.arrayBuffer(), f.name, { skipUnsavedGuard: true }); }
        WD.auditTx('DOC_UPLOAD', { type: 'document', id: d.id, name: d.title }, `가져오기: ${f.name}`);
        WD.ui.toast(`${f.name} 내용을 불러왔습니다. [새 버전 저장]으로 확정하세요.`);
      } catch (err) { WD.ui.toast('가져오기 실패: ' + err.message, 'error'); }
    }));

    // 템플릿으로 저장
    el.querySelector('[data-tpl]')?.addEventListener('click', async () => {
      const m = WD.ui.modal({ title: '템플릿으로 저장', okText: '저장',
        body: `<label class="fld"><span>템플릿 이름</span><input data-n value="${esc(d.title)}"></label><label class="fld"><span>카테고리</span><select data-c>${['보고서', '출석부', '안내문', '확인서', '회계', '계약서', '기타'].map((c) => `<option>${c}</option>`).join('')}</select></label>`,
        onOk: async (w) => {
          let content;
          if (d.kind === 'sheet') content = ed ? ed.getData() : v.content;
          else if (d.kind === 'doc') content = ed ? ed.getHTML() : v.content;
          else if (d.kind === 'hwp') { const bytes = await ed.exportBytes('hwp'); const fileId = await WD.files.put(new Blob([bytes], { type: 'application/x-hwp' }), { name: w.querySelector('[data-n]').value + '.hwp' }); content = { fileId, name: w.querySelector('[data-n]').value + '.hwp' }; }
          WD.tx((db) => { const t = { id: WD.uid('tpl'), category: w.querySelector('[data-c]').value, title: w.querySelector('[data-n]').value, kind: d.kind, content, ownerId: u.id, createdAt: WD.now() }; db.templates.push(t); WD.audit('TEMPLATE_SAVE', { type: 'template', id: t.id, name: t.title }, `원본: ${d.title}`); });
          WD.ui.toast('템플릿 보관함에 저장했습니다.');
        } });
      return m;
    });

    el.querySelector('[data-move]')?.addEventListener('click', () => {
      WD.ui.modal({ title: '폴더 이동', okText: '이동', body: `<label class="fld"><span>대상 폴더</span><select data-f>${WD.folderOptions(u, { mode: 'edit', selected: d.folderId })}</select></label>`,
        onOk: (w) => { const f = w.querySelector('[data-f]').value; WD.tx((db) => { const x = db.documents.find((y) => y.id === d.id); WD.audit('DOC_MOVE', { type: 'document', id: d.id, name: d.title }, `${WD.folderPath(x.folderId)} → ${WD.folderPath(f)}`); x.folderId = f; }); WD.app.refresh(); } });
    });

    // 버전 보기/불러오기
    el.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', async () => {
      const ver = WD.versions(d.id).find((x) => x.version === +b.dataset.ver);
      if (editable && ed) {
        if (!(await WD.ui.confirm(`v${ver.version} 불러오기`, `v${ver.version} 내용을 편집기에 불러옵니다. 저장하면 v${d.version + 1}로 기록됩니다.`))) return;
        if (d.kind === 'sheet') ed.load(ver.content); else ed.setHTML(ver.content);
        onChange();
      } else {
        const m = WD.ui.modal({ title: `v${ver.version} 미리보기 (${WD.fmtDT(ver.at)})`, size: 'lg', hideOk: true, cancelText: '닫기', body: `<div class="protected ver-preview" id="vp">${d.kind === 'sheet' ? WD.editors.sheet.toHtml(ver.content) : `<div class="ql-editor">${ver.content}</div>`}</div>` });
        if (d.kind === 'sheet') await WD.editors.sheet.ensure().then(() => { m.el.querySelector('#vp').innerHTML = WD.editors.sheet.toHtml(ver.content); });
        WD.sec.watermark(m.el.querySelector('#vp'));
      }
    }));
  };

  /* =====================================================================
   * 새 문서
   * ===================================================================== */
  V.newDoc = (el, { kind }, query, u) => {
    if (!['sheet', 'doc', 'hwp'].includes(kind)) { V.notFound(el); return; }
    const tpls = WD.db.templates.filter((t) => t.kind === kind);
    const tpl = WD.db.templates.find((t) => t.id === query.template);
    const defFolder = query.folder || (kind === 'sheet' ? 'f_doc_attend' : 'f_doc_report');
    el.innerHTML = `<div class="page narrow">
      <div class="crumb"><a href="#/templates">새 문서·양식 템플릿</a> / 새 ${WD.ui.KIND_LABEL[kind]}</div>
      <h1>${WD.ui.kindIcon(kind)} 새 ${WD.ui.KIND_LABEL[kind]} 작성</h1>
      <form class="card form" id="nf">
        <label class="fld"><span>제목</span><input name="title" required value="${esc(tpl ? tpl.title.replace(/\s*\(.*\)$/, '') + ' ' + WD.ymd().slice(0, 7) : '')}" placeholder="예) 12월 활동 결과보고서"></label>
        <label class="fld"><span>저장 폴더</span><select name="folder">${WD.folderOptions(u, { mode: 'edit', selected: defFolder })}</select></label>
        <label class="fld"><span>양식</span><select name="tpl"><option value="">빈 ${WD.ui.KIND_LABEL[kind]}</option>${tpls.map((t) => `<option value="${t.id}" ${tpl?.id === t.id ? 'selected' : ''}>[${esc(t.category)}] ${esc(t.title)}</option>`).join('')}</select></label>
        ${kind === 'hwp' ? `<p class="tiny muted">한글 문서는 무료 오픈소스 rhwp(WebAssembly) 엔진으로 브라우저에서 바로 작성·편집합니다. 기존 HWP/HWPX 파일은 [업로드]로 올리면 됩니다.</p>` : ''}
        <div class="row gap-s"><button class="btn primary" type="submit">${I('pen')} 작성 시작</button><a class="btn ghost" href="#/templates">취소</a></div>
      </form></div>`;
    el.querySelector('#nf').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target; const t = WD.db.templates.find((x) => x.id === f.tpl.value);
      let content = t ? JSON.parse(JSON.stringify(t.content)) : (kind === 'sheet' ? [{ name: 'Sheet1' }] : kind === 'doc' ? '<p></p>' : { fileId: null });
      if (kind === 'hwp' && !content) content = { fileId: null };
      try {
        const d = WD.wf.createDoc({ title: f.title.value.trim(), kind, folderId: f.folder.value, content, note: t ? `템플릿 '${t.title}'에서 작성` : '빈 문서로 작성' });
        WD.app.go(`#/doc/${d.id}`);
      } catch (err) { WD.ui.toast(err.message, 'error'); }
    });
  };

  /* =====================================================================
   * 양식 템플릿 보관함
   * ===================================================================== */
  V.templates = (el, p, query, u) => {
    const db = WD.db;
    const cats = ['전체', ...new Set(db.templates.map((t) => t.category))];
    const cat = query.cat || '전체';
    const list = db.templates.filter((t) => cat === '전체' || t.category === cat);
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>새 문서 · 양식 템플릿</h1><p class="muted">보고서·출석부·안내문·확인서 등 반복 문서를 양식으로 불러와 내용만 고쳐 바로 쓰세요. 유료 오피스 없이 브라우저에서 작성합니다.</p></div>
        <button class="btn ghost" data-up-tpl>${I('upload')} 파일을 템플릿으로 등록</button></div>
      <div class="quick-new">
        <a class="qn" href="#/new/sheet">${WD.ui.kindIcon('sheet')}<b>빈 스프레드시트</b><small>수식·서식·표 · xlsx/csv</small></a>
        <a class="qn" href="#/new/doc">${WD.ui.kindIcon('doc')}<b>빈 문서</b><small>글꼴·표·이미지 · PDF 출력</small></a>
        <a class="qn" href="#/new/hwp">${WD.ui.kindIcon('hwp')}<b>빈 한글 문서</b><small>HWP/HWPX · rhwp 엔진</small></a>
      </div>
      <div class="chips">${cats.map((c) => `<a class="chip ${c === cat ? 'active' : ''}" href="#/templates${c === '전체' ? '' : '?cat=' + encodeURIComponent(c)}">${esc(c)} <em>${c === '전체' ? db.templates.length : db.templates.filter((t) => t.category === c).length}</em></a>`).join('')}</div>
      <div class="tpl-grid">${list.map((t) => `<div class="tpl-card">
        <div class="tpl-thumb kind-${t.kind}">${WD.ui.kindIcon(t.kind)}<span>${WD.ui.KIND_LABEL[t.kind]}</span></div>
        <div class="tpl-meta"><span class="tag">${esc(t.category)}</span><b>${esc(t.title)}</b><small>${esc(WD.userName(t.ownerId))} · ${WD.ymd(new Date(t.createdAt))}</small></div>
        <div class="row gap-s"><a class="btn sm primary" href="#/new/${t.kind}?template=${t.id}">이 양식으로 작성</a>${t.kind !== 'hwp' ? `<button class="btn sm ghost" data-pv="${t.id}">미리보기</button>` : ''}${u.role === 'CEO' || t.ownerId === u.id ? `<button class="btn sm ghost icon-only" data-del="${t.id}" title="삭제">${I('trash')}</button>` : ''}</div>
      </div>`).join('')}</div></div>`;
    el.querySelectorAll('[data-pv]').forEach((b) => b.addEventListener('click', async () => {
      const t = db.templates.find((x) => x.id === b.dataset.pv);
      if (t.kind === 'sheet') await WD.editors.sheet.ensure(); else await WD.editors.doc.ensure();
      WD.ui.modal({ title: `양식 미리보기 · ${t.title}`, size: 'lg', hideOk: true, cancelText: '닫기', body: `<div class="ver-preview">${t.kind === 'sheet' ? WD.editors.sheet.toHtml(t.content) : `<div class="ql-editor">${t.content}</div>`}</div>` });
    }));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const t = db.templates.find((x) => x.id === b.dataset.del);
      if (!(await WD.ui.confirm('템플릿 삭제', `'${t.title}' 템플릿을 삭제할까요?`, { danger: true }))) return;
      WD.tx((d) => { d.templates = d.templates.filter((x) => x.id !== t.id); WD.audit('TEMPLATE_DELETE', { type: 'template', id: t.id, name: t.title }); });
      WD.app.refresh();
    }));
    el.querySelector('[data-up-tpl]').addEventListener('click', () => {
      WD.ui.modal({ title: '파일을 템플릿으로 등록', okText: '등록',
        body: `<label class="fld"><span>파일 (.xlsx .csv .docx .hwp .hwpx)</span><input type="file" data-f accept=".xlsx,.xls,.csv,.docx,.hwp,.hwpx"></label><label class="fld"><span>템플릿 이름</span><input data-n></label><label class="fld"><span>카테고리</span><select data-c>${['보고서', '출석부', '안내문', '확인서', '회계', '계약서', '기타'].map((c) => `<option>${c}</option>`).join('')}</select></label>`,
        onOk: async (w) => {
          const f = w.querySelector('[data-f]').files[0]; if (!f) throw new Error('파일을 선택하세요.');
          const ext = f.name.split('.').pop().toLowerCase(); let kind, content;
          if (['xlsx', 'xls', 'csv'].includes(ext)) { kind = 'sheet'; content = await WD.editors.sheet.importFile(f); }
          else if (ext === 'docx') { kind = 'doc'; content = await WD.editors.doc.importDocx(f); }
          else if (['hwp', 'hwpx'].includes(ext)) { kind = 'hwp'; content = { fileId: await WD.files.put(f, { name: f.name }), name: f.name }; }
          else throw new Error('지원하지 않는 형식입니다.');
          const title = w.querySelector('[data-n]').value.trim() || f.name.replace(/\.[^.]+$/, '');
          WD.tx((db2) => { const t = { id: WD.uid('tpl'), category: w.querySelector('[data-c]').value, title, kind, content, ownerId: u.id, createdAt: WD.now() }; db2.templates.push(t); WD.audit('TEMPLATE_SAVE', { type: 'template', id: t.id, name: title }, `파일 등록: ${f.name}`); });
          WD.ui.toast('템플릿을 등록했습니다.'); WD.app.refresh();
        } });
    });
  };
})();
