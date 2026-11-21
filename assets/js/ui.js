/* =========================================================================
 * 공통 UI: 아이콘 · 토스트 · 모달 · 배지 · 라이브러리 지연 로딩
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const P = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
    hwp: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8v8M8 12h4M12 8v8M15 9.5c1.5-1 3 0 3 1.5s-1.5 1.5-1.5 2.5V15"/>',
    template: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    flow: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h5a4 4 0 0 1 4 4v5"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
    contract: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 17c1.5-2 2.5-2 3.5 0s2 2 4-1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.5"/>',
    vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5"/>',
    audit: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 15l-3-3a12 12 0 0 1 12-9 12 12 0 0 1-9 12z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    stamp: '<path d="M5 22h14M5 18h14v-3a2 2 0 0 0-2-2h-3l-.5-3a3 3 0 1 0-3 0L10 13H7a2 2 0 0 0-2 2z"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.file}</svg>`;

  const ui = {
    icon,
    toast(msg, type = 'ok', ms = 3200) {
      const root = document.getElementById('toast-root');
      const t = document.createElement('div');
      t.className = `toast toast-${type}`;
      t.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'warn' ? 'lock' : 'check')}<span>${WD.esc(msg)}</span>`;
      root.appendChild(t);
      setTimeout(() => t.classList.add('out'), ms);
      setTimeout(() => t.remove(), ms + 400);
    },
    /** 모달: body는 HTML 문자열, 반환된 el에 이벤트 바인딩 */
    modal({ title, body, size = '', okText = '확인', cancelText = '취소', onOk, hideOk = false, danger = false }) {
      const root = document.getElementById('modal-root');
      const wrap = document.createElement('div');
      wrap.className = 'modal-back';
      wrap.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${WD.esc(title)}">
        <div class="modal-head"><h3>${WD.esc(title)}</h3><button class="icon-btn" data-x aria-label="닫기">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">${cancelText ? `<button class="btn ghost" data-x>${cancelText}</button>` : ''}${hideOk ? '' : `<button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okText}</button>`}</div></div>`;
      root.appendChild(wrap);
      const close = () => wrap.remove();
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-x]')) close(); });
      wrap.querySelector('[data-ok]')?.addEventListener('click', async () => {
        try { const r = onOk ? await onOk(wrap) : true; if (r !== false) close(); }
        catch (e) { ui.toast(e.message, 'error'); }
      });
      setTimeout(() => wrap.querySelector('input:not([type=hidden]),textarea,select')?.focus(), 30);
      return { el: wrap, close };
    },
    confirm(title, msg, { danger = false, okText = '확인' } = {}) {
      return new Promise((res) => {
        const m = ui.modal({ title, body: `<p class="pre">${WD.esc(msg)}</p>`, danger, okText, onOk: () => { res(true); } });
        m.el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => res(false)));
      });
    },
    prompt(title, label, { placeholder = '', textarea = false, value = '' } = {}) {
      return new Promise((res) => {
        const m = ui.modal({ title, body: `<label class="fld"><span>${WD.esc(label)}</span>${textarea ? `<textarea rows="4" data-v placeholder="${WD.esc(placeholder)}">${WD.esc(value)}</textarea>` : `<input data-v value="${WD.esc(value)}" placeholder="${WD.esc(placeholder)}">`}</label>`, onOk: (el) => { const v = el.querySelector('[data-v]').value; if (!v.trim()) throw new Error('내용을 입력하세요.'); res(v); } });
        m.el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => res(null)));
      });
    },
    status(st) { const s = WD.STATUS[st] || { label: st, cls: '' }; return `<span class="badge ${s.cls}">${s.label}</span>`; },
    subStatus(st) { const s = WD.wf.SUB_STATUS[st]; return `<span class="badge ${s.cls}">${s.label}</span>`; },
    kindIcon(kind) { return `<span class="kind kind-${kind}">${icon(kind === 'sheet' ? 'sheet' : kind === 'doc' ? 'doc' : kind === 'hwp' ? 'hwp' : 'file')}</span>`; },
    KIND_LABEL: { sheet: '스프레드시트', doc: '문서', hwp: '한글', file: '파일' },
    avatar(u, size = 30) {
      if (!u) return '';
      const colors = ['#2f7d62', '#3c6fb4', '#c98a1e', '#8a5cc2', '#b2453a', '#1f8a8a', '#6b7a3a'];
      const c = colors[[...u.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % colors.length];
      return `<span class="avatar" style="width:${size}px;height:${size}px;background:${c}">${WD.esc(u.name.slice(-2))}</span>`;
    },
    dday(days) {
      if (days < 0) return `<span class="dday d-exp">만료 ${Math.abs(days)}일 경과</span>`;
      const b = WD.wf.bucket(days);
      return `<span class="dday ${b ? 'd-' + b.replace('-', '').toLowerCase() : ''}">D-${days}</span>`;
    },
    empty(msg, ic = 'inbox') { return `<div class="empty">${icon(ic)}<p>${WD.esc(msg)}</p></div>`; },

    /* ---------- 외부 라이브러리 지연 로딩 (CDN, 오픈소스) ---------- */
    _loaded: {},
    loadScript(src) {
      if (ui._loaded[src]) return ui._loaded[src];
      ui._loaded[src] = new Promise((res, rej) => {
        const s = document.createElement('script'); s.src = src; s.async = true;
        s.onload = res; s.onerror = () => { delete ui._loaded[src]; rej(new Error('라이브러리 로드 실패: ' + src)); };
        document.head.appendChild(s);
      });
      return ui._loaded[src];
    },
    loadCSS(href) {
      if (ui._loaded[href]) return ui._loaded[href];
      ui._loaded[href] = new Promise((res) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); });
      return ui._loaded[href];
    },
    LIBS: {
      xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      xsJs: 'https://cdn.jsdelivr.net/npm/x-data-spreadsheet@1.1.9/dist/xspreadsheet.js',
      xsCss: 'https://cdn.jsdelivr.net/npm/x-data-spreadsheet@1.1.9/dist/xspreadsheet.css',
      quillJs: 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js',
      quillCss: 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css',
      mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
      html2pdf: 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js',
      chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
      pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
      rhwp: 'https://cdn.jsdelivr.net/npm/@rhwp/editor@0.9.0/+esm',
      fontsKr: 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700&family=Nanum+Gothic:wght@400;700&family=Gowun+Batang&family=Nanum+Pen+Script&display=swap',
    },
    fileSize(n) { if (n < 1024) return n + 'B'; if (n < 1048576) return (n / 1024).toFixed(1) + 'KB'; return (n / 1048576).toFixed(1) + 'MB'; },
    readFile(file, as = 'arrayBuffer') { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r[as === 'text' ? 'readAsText' : as === 'dataURL' ? 'readAsDataURL' : 'readAsArrayBuffer'](file); }); },
    pickFile(accept = '*/*') {
      return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0] || null); i.click(); });
    },
  };
  WD.ui = ui;
  WD.icon = icon;
})();
