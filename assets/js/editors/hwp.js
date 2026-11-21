/* =========================================================================
 * 한글(HWP/HWPX) 에디터 — rhwp (Rust + WebAssembly, MIT) @rhwp/editor
 *  - HWP 5.0 / HWPX 열람·편집, HWP·HWPX 바이너리 저장(exportHwp/exportHwpx)
 *  - 저장 시 바이너리를 파일 저장소에 새 버전(v1, v2…)으로 기록
 *  - 직원 모드: 메뉴바 숨김(chrome.menu=false) + 상위 워터마크 + 내보내기 버튼 비노출
 *    ※ iframe 내부 단축키는 상위 페이지에서 제어 불가 → 운영 시 rhwp-studio를
 *      자체 호스팅하고 저장/인쇄 커맨드를 제거한 빌드를 직원용으로 배포
 *      (docs/security-rules.md §3-4)
 *  - 복잡한 서식은 양식 템플릿·PDF 확인을 병행
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

  WD.editors = WD.editors || {};
  WD.editors.hwp = {
    async mount(el, content, { readOnly = false } = {}) {
      const u = WD.auth.currentRaw();
      el.innerHTML = `<div class="hwp-shell"><div class="hwp-status">${WD.icon('hwp')} rhwp 한글 엔진(WebAssembly) 불러오는 중…</div><div class="hwp-tools hidden"></div><div class="hwp-host"></div></div>`;
      const host = el.querySelector('.hwp-host');
      const status = el.querySelector('.hwp-status');
      let mod;
      try {
        mod = await withTimeout(import(WD.ui.LIBS.rhwp), 25000, 'rhwp 모듈 로드 시간 초과');
      } catch (e) {
        status.innerHTML = `${WD.icon('alert')} 한글 엔진을 불러오지 못했습니다 (${WD.esc(e.message)}). 네트워크를 확인하거나 PDF 변환본으로 확인하세요.`;
        throw e;
      }
      let editor = null;
      const isCEO = u?.role === 'CEO';
      if ((!isCEO || readOnly) && typeof mod.createStudio === 'function') {
        try { editor = await withTimeout(mod.createStudio(host, { chrome: { menu: false, toolbar: !readOnly, statusbar: true } }), 25000, 'studio 초기화 시간 초과'); }
        catch (e) { console.warn('createStudio 실패 → createEditor 사용', e); host.innerHTML = ''; editor = null; }
      }
      if (!editor) editor = await withTimeout(mod.createEditor(host, { width: '100%', height: '100%' }), 30000, '에디터 초기화 시간 초과');
      // 직원 모드: 저장·인쇄·내보내기가 없는 자체 편집 툴바 (rhwp 커맨드 API 호출)
      if (editor.commands && !readOnly) {
        const tools = el.querySelector('.hwp-tools');
        const B = [
          ['edit:undo', '↶', '실행 취소'], ['edit:redo', '↷', '다시 실행'], '|',
          ['format:bold', '<b>가</b>', '굵게'], ['format:italic', '<i>가</i>', '기울임'], ['format:underline', '<u>가</u>', '밑줄'], ['format:strikethrough', '<s>가</s>', '취소선'],
          ['format:font-size-increase', '가+', '글자 크게'], ['format:font-size-decrease', '가−', '글자 작게'], ['format:char-shape', '글자모양', '글자 모양(글꼴·크기·색)', true], '|',
          ['format:align-left', '왼쪽', '왼쪽 정렬'], ['format:align-center', '가운데', '가운데 정렬'], ['format:align-right', '오른쪽', '오른쪽 정렬'], ['format:align-justify', '양쪽', '양쪽 정렬'],
          ['format:toggle-bullet', '• 목록', '글머리 목록'], ['format:toggle-numbering', '1. 번호', '번호 목록'], ['format:para-shape', '문단모양', '문단 모양', true], '|',
          ['table:create', '표 만들기', '표 만들기', true], ['table:insert-row-below', '+행', '아래에 행 추가'], ['table:insert-col-right', '+열', '오른쪽에 열 추가'], ['table:delete-row', '−행', '행 삭제'], ['table:delete-col', '−열', '열 삭제'], ['table:cell-merge', '셀 합치기', '셀 합치기'], '|',
          ['insert:image', '그림', '그림 넣기'], ['edit:find-replace', '찾기·바꾸기', '찾기·바꾸기', true], ['view:zoom-fit-width', '폭 맞춤', '폭에 맞춤'],
        ];
        tools.innerHTML = B.map((b) => (b === '|' ? '<span class="sep"></span>' : `<button type="button" data-cmd="${b[0]}" data-dlg="${b[3] ? 1 : ''}" title="${b[2]}">${b[1]}</button>`)).join('') + '<span class="hwp-tools-note">직원 모드 · 저장/인쇄/내보내기 메뉴 비활성</span>';
        tools.classList.remove('hidden');
        tools.querySelectorAll('[data-cmd]').forEach((btn) => btn.addEventListener('click', async () => {
          try {
            const r = await editor.commands.execute(btn.dataset.cmd, undefined, btn.dataset.dlg ? { allowDialog: true } : undefined);
            if (r && r.ok === false && r.reason !== 'disabled') WD.ui.toast(`실행할 수 없습니다 (${r.reason})`, 'warn');
          } catch (e) { WD.ui.toast('편집 명령 오류: ' + e.message, 'error'); }
        }));
      }
      let name = '새 문서.hwp';
      if (content?.fileId) {
        const rec = await WD.files.get(content.fileId);
        if (rec) {
          name = rec.name || name;
          status.textContent = `${name} 여는 중…`;
          const r = await editor.loadFile(await rec.blob.arrayBuffer(), name);
          status.innerHTML = `${WD.icon('hwp')} ${WD.esc(name)} · ${r?.pageCount ?? '?'}쪽 · rhwp WASM 엔진`;
        } else {
          status.innerHTML = `${WD.icon('alert')} 원본 파일을 찾을 수 없습니다 (이 브라우저의 저장소에 없음).`;
        }
      } else {
        status.innerHTML = `${WD.icon('hwp')} 새 한글 문서 · rhwp WASM 엔진 — 작성 후 [새 버전 저장]을 누르세요.`;
      }
      if (readOnly) status.innerHTML += ' · <b>열람 전용</b>';
      return {
        editor, name,
        async exportBytes(fmt = 'hwp') { return fmt === 'hwpx' ? editor.exportHwpx() : editor.exportHwp(); },
        async svgPages() { const n = await editor.pageCount(); const out = []; for (let i = 0; i < Math.min(n, 30); i++) out.push(await editor.getPageSvg(i, { profile: 'print' })); return out; },
        async markSaved(fileName) { try { await editor.notifySaved?.(fileName); } catch (e) { /* 구버전 studio */ } },
        isDirty: () => true,
        destroy() { try { editor.destroy(); } catch (e) { /* noop */ } },
      };
    },
  };
})();
