/* =========================================================================
 * 한글(HWP/HWPX) — rhwp (Rust + WebAssembly, MIT) @rhwp/editor
 *  - 최고 관리자: 전체 편집기(iframe) — 열람·편집·HWP/HWPX 저장
 *  - 실장·직원: "보안 열람 모드"
 *      rhwp 엔진은 화면 밖 비활성(inert) iframe에서 문서만 해석하고,
 *      페이지는 SVG로 변환해 이 페이지 안에 그립니다.
 *      → iframe에 키보드 포커스가 갈 수 없으므로 rhwp 내부 저장(Ctrl+S)·인쇄 경로가 원천 차단되고,
 *        우클릭·복사·인쇄 차단과 워터마크가 그대로 적용됩니다.
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

  WD.editors = WD.editors || {};
  WD.editors.hwp = {
    async mount(el, content, { readOnly = false } = {}) {
      const u = WD.auth.currentRaw();
      const secure = u?.role !== 'ADMIN';
      el.innerHTML = `<div class="hwp-shell"><div class="hwp-status">${WD.icon('hwp')} rhwp 한글 엔진(WebAssembly) 불러오는 중…</div>
        ${secure ? '<div class="hwp-pages no-select"></div>' : ''}<div class="hwp-host ${secure ? 'hwp-engine-hidden' : ''}"></div></div>`;
      const host = el.querySelector('.hwp-host');
      const status = el.querySelector('.hwp-status');
      if (secure) { host.setAttribute('inert', ''); host.setAttribute('aria-hidden', 'true'); }

      let mod;
      try { mod = await withTimeout(import(WD.ui.LIBS.rhwp), 25000, 'rhwp 모듈 로드 시간 초과'); }
      catch (e) { status.innerHTML = `${WD.icon('alert')} 한글 엔진을 불러오지 못했습니다 (${WD.esc(e.message)}).`; throw e; }

      const rec = content?.fileId ? await WD.files.get(content.fileId) : null;
      if (secure && !rec) {
        status.innerHTML = `${WD.icon('lock')} ${content?.fileId ? '원본 파일을 이 브라우저 저장소에서 찾을 수 없습니다.' : '아직 내용이 없는 한글 문서입니다. 한글 문서 작성·편집은 최고 관리자만 가능합니다.'}`;
        return { destroy() {}, isDirty: () => false };
      }

      const editor = await withTimeout(mod.createEditor(host, { width: '100%', height: '100%' }), 30000, '에디터 초기화 시간 초과');
      const name = rec?.name || '새 문서.hwp';
      if (rec) {
        status.textContent = `${name} 여는 중…`;
        const r = await editor.loadFile(await rec.blob.arrayBuffer(), name);
        status.innerHTML = `${WD.icon('hwp')} ${WD.esc(name)} · ${r?.pageCount ?? '?'}쪽 · rhwp WASM 엔진`;
      } else {
        // 새 문서: 빈 HWP 양식을 명시적으로 불러옴 (rhwp 복구본 대화상자에 가려 문서가 없는 상태 방지)
        try {
          const blank = await (await fetch('assets/blank.hwp?v=1')).arrayBuffer();
          await editor.loadFile(blank, '새 문서.hwp', { skipUnsavedGuard: true });
        } catch (e) { console.warn('빈 문서 로드 실패', e); }
        status.innerHTML = `${WD.icon('hwp')} 새 한글 문서 · rhwp WASM 엔진 — 작성 후 [새 버전 저장]을 누르세요.`;
      }

      if (secure) {
        // 보안 열람: 페이지를 SVG로 변환해 상위 페이지에 표시 (iframe은 비활성 상태로 제거)
        const pagesEl = el.querySelector('.hwp-pages');
        const n = await editor.pageCount();
        const max = Math.min(n, 60);
        for (let i = 0; i < max; i++) {
          const svg = await editor.getPageSvg(i, { profile: 'print' });
          const pg = document.createElement('div'); pg.className = 'hwp-page';
          pg.innerHTML = String(svg).replace(/<script[\s\S]*?<\/script>/gi, '');
          pagesEl.appendChild(pg);
        }
        status.innerHTML = `${WD.icon('lock')} 보안 열람 모드 · ${WD.esc(name)} · ${n}쪽${n > max ? ` (앞 ${max}쪽 표시)` : ''} — 한글 문서의 편집·저장·인쇄는 최고 관리자만 가능합니다.`;
        try { editor.destroy(); } catch (e) { /* noop */ }
        host.remove();
        return { destroy() {}, isDirty: () => false };
      }

      if (readOnly) status.innerHTML += ' · <b>열람 전용(잠금)</b>';
      return {
        editor, name,
        async exportBytes(fmt = 'hwp') { return fmt === 'hwpx' ? editor.exportHwpx() : editor.exportHwp(); },
        async markSaved(fileName) { try { await editor.notifySaved?.(fileName); } catch (e) { /* 구버전 studio */ } },
        isDirty: () => true,
        destroy() { try { editor.destroy(); } catch (e) { /* noop */ } },
      };
    },
  };
})();
