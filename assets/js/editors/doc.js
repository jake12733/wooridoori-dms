/* =========================================================================
 * 문서(워드형) 에디터 — Quill 2 (BSD-3) 리치텍스트
 *  - 글꼴(프리텐다드/나눔고딕/나눔명조/고운바탕), 크기, 제목, 굵게·기울임·밑줄·취소선,
 *    글자색·배경색, 정렬, 번호·글머리 목록, 들여쓰기, 링크, 이미지 삽입, 표 삽입·편집
 *  - .docx 가져오기(mammoth, BSD-2), (대표만) PDF·.doc 내보내기(html2pdf.js, MIT)
 *  - 운영 확장: TipTap(MIT) + 협업(Y.js) 구성 가능 (docs/ARCHITECTURE.md §4)
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const L = () => WD.ui.LIBS;
  let registered = false;

  const TOOLBAR = `
    <span class="ql-formats">
      <select class="ql-font" title="글꼴">
        <option value="pretendard" selected>프리텐다드</option><option value="nanum-gothic">나눔고딕</option>
        <option value="nanum-myeongjo">나눔명조</option><option value="gowun-batang">고운바탕</option><option value="monospace">고정폭</option>
      </select>
      <select class="ql-size" title="글자 크기">
        <option value="10px">10</option><option value="12px">12</option><option value="14px">14</option><option value="16px" selected>16</option>
        <option value="18px">18</option><option value="20px">20</option><option value="24px">24</option><option value="28px">28</option><option value="32px">32</option>
      </select>
      <select class="ql-header" title="문단 스타일"><option value="1">제목 1</option><option value="2">제목 2</option><option value="3">제목 3</option><option selected>본문</option></select>
    </span>
    <span class="ql-formats"><button class="ql-bold" title="굵게"></button><button class="ql-italic" title="기울임"></button><button class="ql-underline" title="밑줄"></button><button class="ql-strike" title="취소선"></button></span>
    <span class="ql-formats"><select class="ql-color" title="글자색"></select><select class="ql-background" title="배경색"></select></span>
    <span class="ql-formats"><select class="ql-align" title="정렬"></select></span>
    <span class="ql-formats"><button class="ql-list" value="ordered" title="번호 목록"></button><button class="ql-list" value="bullet" title="글머리 목록"></button><button class="ql-indent" value="-1" title="내어쓰기"></button><button class="ql-indent" value="+1" title="들여쓰기"></button></span>
    <span class="ql-formats"><button class="ql-link" title="링크"></button><button class="ql-image" title="이미지 삽입"></button><button class="ql-blockquote" title="인용"></button></span>
    <span class="ql-formats tbl-tools">
      <button type="button" class="tb-txt" data-tbl="insert" title="표 삽입 (3×3)">표</button>
      <button type="button" class="tb-txt" data-tbl="row" title="아래에 행 추가">+행</button>
      <button type="button" class="tb-txt" data-tbl="col" title="오른쪽에 열 추가">+열</button>
      <button type="button" class="tb-txt" data-tbl="delrow" title="행 삭제">-행</button>
      <button type="button" class="tb-txt" data-tbl="delcol" title="열 삭제">-열</button>
      <button type="button" class="tb-txt" data-tbl="deltable" title="표 삭제">표삭제</button>
    </span>
    <span class="ql-formats"><button class="ql-clean" title="서식 지우기"></button></span>`;

  function register() {
    if (registered) return; registered = true;
    const Q = window.Quill;
    const Font = Q.import('formats/font');
    Font.whitelist = ['pretendard', 'nanum-gothic', 'nanum-myeongjo', 'gowun-batang', 'monospace'];
    Q.register(Font, true);
    const Size = Q.import('attributors/style/size');
    Size.whitelist = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
    Q.register(Size, true);
    const Align = Q.import('attributors/style/align');
    Q.register(Align, true);
  }

  WD.editors = WD.editors || {};
  WD.editors.doc = {
    async ensure() { await Promise.all([WD.ui.loadCSS(L().quillCss), WD.ui.loadCSS(L().fontsKr), WD.ui.loadScript(L().quillJs)]); register(); },

    async mount(el, html, { readOnly = false, onChange } = {}) {
      await this.ensure();
      el.innerHTML = `<div class="doc-shell ${readOnly ? 'ro' : ''}">
        ${readOnly ? '' : `<div class="doc-toolbar">${TOOLBAR}</div>`}
        <div class="doc-scroll"><div class="doc-page"><div class="q-editor"></div></div></div></div>`;
      const edEl = el.querySelector('.q-editor');
      const q = new window.Quill(edEl, {
        theme: 'snow', readOnly,
        modules: { toolbar: readOnly ? false : { container: el.querySelector('.doc-toolbar') }, table: true, history: { delay: 800, maxStack: 200 } },
        placeholder: readOnly ? '' : '내용을 입력하세요…',
      });
      q.setContents(q.clipboard.convert({ html: html || '<p></p>' }), 'silent');
      q.history.clear();
      let dirty = false;
      q.on('text-change', (d, o, src) => { if (src === 'user') { dirty = true; onChange && onChange(); } });
      if (!readOnly) {
        const tbl = q.getModule('table');
        el.querySelectorAll('[data-tbl]').forEach((b) => b.addEventListener('click', () => {
          const a = b.dataset.tbl;
          try {
            if (a === 'insert') tbl.insertTable(3, 3);
            else {
              const [table] = tbl.getTable();
              if (!table) { WD.ui.toast('표 안에 커서를 두고 실행하세요.', 'warn'); return; }
              ({ row: () => tbl.insertRowBelow(), col: () => tbl.insertColumnRight(), delrow: () => tbl.deleteRow(), delcol: () => tbl.deleteColumn(), deltable: () => tbl.deleteTable() })[a]();
            }
            dirty = true; onChange && onChange();
          } catch (e) { WD.ui.toast('표 편집 오류: ' + e.message, 'error'); }
        }));
      }
      return {
        quill: q,
        getHTML: () => q.root.innerHTML,
        isDirty: () => dirty, clean: () => { dirty = false; },
        setHTML: (h) => { q.setContents(q.clipboard.convert({ html: h }), 'user'); dirty = true; },
        destroy: () => { el.innerHTML = ''; },
      };
    },

    /** .docx → HTML */
    async importDocx(file) {
      await WD.ui.loadScript(L().mammoth);
      const r = await window.mammoth.convertToHtml({ arrayBuffer: await WD.ui.readFile(file) });
      return r.value;
    },

    /** 출력용 노드 (브랜딩 헤더/푸터 포함) */
    printable(title, html) {
      const u = WD.auth.currentRaw();
      const wrap = document.createElement('div');
      wrap.className = 'print-doc';
      wrap.innerHTML = `<div class="print-head"><span>${WD.esc(WD.BRAND)}</span><span>${WD.esc(title)}</span></div>
        <div class="print-body ql-editor">${html}</div>
        <div class="print-foot">출력자 ${WD.esc(u?.name || '')} · ${WD.fmtDT(WD.now())} · 본 문서는 ${WD.esc(WD.ORG)}의 자산이며 무단 배포를 금합니다.</div>`;
      return wrap;
    },
    async toPdfBlob(title, html) {
      await WD.ui.loadScript(L().html2pdf);
      const node = this.printable(title, html);
      node.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff';
      document.body.appendChild(node);
      try {
        return await window.html2pdf().set({ margin: [10, 10, 12, 10], image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(node).outputPdf('blob');
      } finally { node.remove(); }
    },
    toWordBlob(title, html) {
      const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${WD.esc(title)}</title><style>body{font-family:'맑은 고딕',sans-serif;font-size:11pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}.ql-align-center{text-align:center}.ql-align-right{text-align:right}</style></head><body>${html}</body></html>`;
      return new Blob(['\ufeff', doc], { type: 'application/msword' });
    },
  };
})();
