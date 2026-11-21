/* =========================================================================
 * 문서 보안 계층: 권한 판정 · 반출 통제 · 워터마크 · 우클릭/복사/인쇄 차단
 * -------------------------------------------------------------------------
 * [중요] 브라우저 측 통제는 "억제·기록" 수단입니다. 실제 반출 차단의 근거는
 * 서버 권한 검증입니다: 원본 파일은 비공개 버킷에 있고, 다운로드용 서명 URL은
 * role=CEO 세션에만 발급됩니다 (docs/security-rules.md §2, server/src/routes/files.js).
 * ========================================================================= */
(function () {
  const WD = window.WD;
  let lastDeny = {};
  const throttle = (k, ms = 8000) => { const n = Date.now(); if (n - (lastDeny[k] || 0) < ms) return false; lastDeny[k] = n; return true; };
  const isStaff = () => document.body.classList.contains('staff-mode');

  const sec = {
    ACCESS_LABEL: { edit: '열람·웹 편집', view: '열람 전용', none: '대표 전용' },

    /** 문서 접근 수준: 'edit' | 'view' | 'none' */
    level(doc, u = WD.auth.currentRaw()) {
      if (!doc || !u) return 'none';
      if (u.role === 'CEO') return doc.locked ? 'view' : 'edit';
      if (u.role !== 'STAFF') return 'none';
      const f = WD.folder(doc.folderId);
      let lvl = f?.staffAccess || 'none';
      if (doc.ownerId === u.id || doc.assigneeId === u.id) lvl = 'edit';
      else if ((doc.recipients || []).includes(u.id) && lvl === 'none') lvl = 'view';
      if (doc.locked && lvl === 'edit') lvl = 'view';
      return lvl;
    },
    canView: (doc, u) => sec.level(doc, u) !== 'none',
    canEdit: (doc, u) => sec.level(doc, u) === 'edit',
    /** 외부 반출(다운로드/인쇄/내보내기)은 대표만 */
    canExport: (u = WD.auth.currentRaw()) => u?.role === 'CEO',

    /** 반출 요청 게이트 — 모든 다운로드는 이 함수를 통과해야 함 */
    async exportDoc(target, format, fn) {
      const u = WD.auth.current();
      const t = { type: target.type || 'document', id: target.id, name: target.title || target.name };
      if (!sec.canExport(u)) {
        WD.auditTx('DOWNLOAD_DENIED', t, `${format} 반출 시도 차단 (role=${u?.role || '-'})`);
        WD.ui.toast('외부 반출 권한이 없습니다. 다운로드·인쇄·내보내기는 대표만 가능하며 시도 기록이 남았습니다.', 'error');
        return false;
      }
      try { await fn(); WD.auditTx('DOC_DOWNLOAD', t, `${format} 반출`); return true; }
      catch (e) { console.error(e); WD.ui.toast('내보내기 실패: ' + e.message, 'error'); return false; }
    },

    /** 실제 파일 저장 — 대표 세션 재검증 후에만 동작 */
    saveBlob(blob, filename) {
      if (!sec.canExport(WD.auth.current())) throw new Error('반출 권한 없음');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    },

    /** 역할별 body 모드 적용 */
    applyMode(u) {
      document.body.classList.toggle('staff-mode', !!u && u.role !== 'CEO');
      document.body.classList.toggle('ceo-mode', u?.role === 'CEO');
    },

    /** 전역 반출 억제 리스너 (1회 설치) */
    installGuards() {
      if (sec._installed) return; sec._installed = true;
      const deny = (action, msg, detail) => {
        if (throttle(action)) { WD.auditTx(action, { type: 'page', name: location.hash }, detail); }
        WD.ui.toast(msg, 'warn');
      };
      document.addEventListener('contextmenu', (e) => {
        if (!isStaff()) return;
        e.preventDefault();
        if (e.target.closest?.('.protected') && !e.target.closest('.allow-ctx')) WD.ui.toast('보안 문서 영역에서는 우클릭이 제한됩니다.', 'warn');
      }, true);
      ['copy', 'cut'].forEach((t) => document.addEventListener(t, (e) => {
        if (!isStaff()) return;
        const inProtected = e.target.closest?.('.protected') || document.getSelection()?.anchorNode?.parentElement?.closest?.('.protected');
        if (!inProtected) return;
        e.preventDefault();
        try { e.clipboardData.setData('text/plain', `[${WD.BRAND}] 복사가 제한된 문서입니다.`); } catch (err) { /* noop */ }
        deny('COPY_DENIED', '보안 문서의 내용은 복사할 수 없습니다. (기록됨)', `${t} 시도`);
      }, true));
      document.addEventListener('dragstart', (e) => { if (isStaff() && e.target.closest?.('.protected')) { e.preventDefault(); } }, true);
      document.addEventListener('keydown', (e) => {
        if (!isStaff()) return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p')) {
          e.preventDefault(); e.stopPropagation();
          deny(k === 'p' ? 'PRINT_DENIED' : 'DOWNLOAD_DENIED', k === 'p' ? '인쇄는 대표만 가능합니다. (기록됨)' : '로컬 저장은 대표만 가능합니다. (기록됨)', `단축키 Ctrl+${k.toUpperCase()}`);
        }
      }, true);
      document.addEventListener('keyup', (e) => {
        if (!isStaff() || e.key !== 'PrintScreen') return;
        try { navigator.clipboard?.writeText(`[${WD.BRAND}] 화면 캡처가 제한됩니다.`); } catch (err) { /* noop */ }
        document.body.classList.add('shield'); setTimeout(() => document.body.classList.remove('shield'), 1800);
        deny('CAPTURE_DENIED', '화면 캡처가 감지되어 기록되었습니다.', 'PrintScreen 키');
      });
      window.addEventListener('beforeprint', () => { if (isStaff()) deny('PRINT_DENIED', '인쇄는 대표만 가능합니다. (기록됨)', '브라우저 인쇄 메뉴'); });
    },

    /** 워터마크 오버레이 (제거 시 자동 복원) */
    watermark(el, opts = {}) {
      const u = WD.auth.currentRaw(); if (!el || !u) return;
      const c = document.createElement('canvas'); c.width = 420; c.height = 230;
      const g = c.getContext('2d');
      g.translate(210, 115); g.rotate(-0.42);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(31,95,74,0.13)'; g.font = '700 15px Pretendard, "Malgun Gothic", sans-serif';
      g.fillText(WD.BRAND, 0, -14);
      g.font = '500 13px Pretendard, "Malgun Gothic", sans-serif';
      g.fillText(`${u.name} (${u.loginId}) · ${WD.fmtDT(WD.now())}`, 0, 8);
      g.fillStyle = u.role === 'CEO' ? 'rgba(31,95,74,0.10)' : 'rgba(178,69,58,0.14)';
      g.fillText(opts.label || (u.role === 'CEO' ? '대표 열람본' : '열람 전용 · 외부 반출 금지'), 0, 28);
      const url = c.toDataURL();
      const make = () => { const d = document.createElement('div'); d.className = 'wm-overlay'; d.setAttribute('aria-hidden', 'true'); d.style.backgroundImage = `url(${url})`; return d; };
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      let ov = make(); el.appendChild(ov);
      const mo = new MutationObserver(() => {
        if (!el.isConnected) { mo.disconnect(); return; }
        if (!ov.isConnected || ov.style.backgroundImage.indexOf('data:') < 0 || ov.style.display === 'none' || ov.style.opacity === '0') {
          ov.remove(); ov = make(); el.appendChild(ov); mo.observe(ov, { attributes: true });
          if (u.role !== 'CEO' && throttle('WM')) WD.auditTx('ACCESS_DENIED', { type: 'watermark', name: location.hash }, '워터마크 제거 시도 감지·복원');
        }
      });
      mo.observe(el, { childList: true, subtree: false, attributes: true, attributeFilter: ['style', 'class'] });
      mo.observe(ov, { attributes: true });
      WD.app?.onCleanup(() => mo.disconnect());
    },
  };
  WD.sec = sec;
})();
