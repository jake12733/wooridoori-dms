/* =========================================================================
 * 스프레드시트(엑셀형) 에디터 — x-data-spreadsheet(MIT) + SheetJS(Apache-2.0)
 *  - 수식(SUM/AVERAGE/MAX/MIN/IF/CONCAT 등), 셀 서식, 병합, 행/열 삽입·삭제
 *  - .xlsx / .xls / .csv 가져오기, (대표만) .xlsx / .csv 내보내기
 *  - 운영 확장: Univer(Apache-2.0) 프리셋으로 교체 가능 (docs/ARCHITECTURE.md §4)
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const L = () => WD.ui.LIBS;

  const colName = (c) => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
  const parseRef = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) return null; let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64); return { r: +m[2] - 1, c: c - 1 }; };

  /** 간이 수식 계산기 (CSV 내보내기·캐시값용) */
  function evaluateSheet(xws) {
    const rows = xws.rows || {};
    const raw = (r, c) => rows[r]?.cells?.[c]?.text ?? '';
    const memo = {};
    const val = (r, c, depth = 0) => {
      const k = r + ':' + c; if (k in memo) return memo[k];
      const t = raw(r, c);
      let v;
      if (typeof t === 'string' && t.startsWith('=')) v = depth > 50 ? '#REF' : calc(t.slice(1), depth + 1);
      else v = t !== '' && !isNaN(Number(t)) ? Number(t) : t;
      memo[k] = v; return v;
    };
    const range = (a, b, depth) => { const s = parseRef(a), e = parseRef(b); const out = []; for (let r = Math.min(s.r, e.r); r <= Math.max(s.r, e.r); r++) for (let c = Math.min(s.c, e.c); c <= Math.max(s.c, e.c); c++) out.push(val(r, c, depth)); return out; };
    const nums = (arr) => arr.flat().map(Number).filter((n) => !isNaN(n) && n !== null);
    const F = {
      SUM: (...a) => nums(a).reduce((x, y) => x + y, 0), AVERAGE: (...a) => { const n = nums(a); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : 0; },
      MAX: (...a) => Math.max(...nums(a)), MIN: (...a) => Math.min(...nums(a)), COUNT: (...a) => nums(a).length,
      IF: (c, a, b) => (c ? a : b), CONCAT: (...a) => a.flat().join(''), ROUND: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
    };
    function calc(expr, depth) {
      try {
        let js = expr.toUpperCase()
          .replace(/([A-Z]+\d+):([A-Z]+\d+)/g, (_, a, b) => JSON.stringify(range(a, b, depth)))
          .replace(/\b([A-Z]+)(\d+)\b/g, (m, a, b) => { if (F[a]) return m; const p = parseRef(m); const v = val(p.r, p.c, depth); return typeof v === 'number' ? String(v) : JSON.stringify(v); })
          .replace(/\b(SUM|AVERAGE|MAX|MIN|COUNT|IF|CONCAT|ROUND)\(/g, 'F.$1(')
          .replace(/<>/g, '!=').replace(/([^<>!=])=([^=])/g, '$1==$2');
        if (/[^\d\s+\-*/().,"\[\]F.A-Z!=<>:]/.test(js.replace(/"[^"]*"/g, ''))) return '#ERR';
        // eslint-disable-next-line no-new-func
        const r = Function('F', `return (${js});`)(F);
        return typeof r === 'number' && !isFinite(r) ? '#DIV/0' : r;
      } catch (e) { return '#ERR'; }
    }
    let maxR = 0, maxC = 0;
    Object.keys(rows).forEach((ri) => { if (ri === 'len') return; Object.keys(rows[ri].cells || {}).forEach((ci) => { if ((rows[ri].cells[ci].text ?? '') !== '') { maxR = Math.max(maxR, +ri); maxC = Math.max(maxC, +ci); } }); });
    const aoa = [];
    for (let r = 0; r <= maxR; r++) { const row = []; for (let c = 0; c <= maxC; c++) row.push(val(r, c)); aoa.push(row); }
    return aoa;
  }

  function stox(wb) {
    const X = window.XLSX; const out = [];
    wb.SheetNames.forEach((name) => {
      const o = { name, rows: {}, merges: [], styles: [] };
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) { out.push(o); return; }
      const range = X.utils.decode_range(ws['!ref']);
      for (let R = 0; R <= range.e.r; R++) {
        const cells = {};
        for (let C = 0; C <= range.e.c; C++) {
          const cell = ws[X.utils.encode_cell({ r: R, c: C })]; if (!cell) continue;
          cells[C] = { text: cell.f ? '=' + cell.f : String(cell.w ?? cell.v ?? '') };
        }
        o.rows[R] = { cells };
      }
      o.rows.len = Math.max(range.e.r + 30, 100);
      (ws['!merges'] || []).forEach((m) => {
        const r = (o.rows[m.s.r] = o.rows[m.s.r] || { cells: {} });
        const c = (r.cells[m.s.c] = r.cells[m.s.c] || { text: '' });
        c.merge = [m.e.r - m.s.r, m.e.c - m.s.c]; o.merges.push(X.utils.encode_range(m));
      });
      if (ws['!cols']) { o.cols = { len: Math.max(26, range.e.c + 1) }; ws['!cols'].forEach((c, i) => { if (c && (c.wpx || c.wch)) o.cols[i] = { width: c.wpx || Math.round(c.wch * 7.5) }; }); }
      out.push(o);
    });
    return out;
  }

  function xtos(sdata) {
    const X = window.XLSX; const wb = X.utils.book_new();
    sdata.forEach((xws, si) => {
      const ws = {}; const rows = xws.rows || {}; let maxR = 0, maxC = 0;
      const values = evaluateSheet(xws);
      Object.keys(rows).forEach((ri) => {
        if (ri === 'len') return; const r = +ri; const cells = rows[ri].cells || {};
        Object.keys(cells).forEach((ci) => {
          const c = +ci; const cell = cells[ci]; const t = cell.text ?? '';
          if (t === '' && !cell.merge) return;
          maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
          const addr = X.utils.encode_cell({ r, c });
          if (typeof t === 'string' && t.startsWith('=')) { const v = values[r]?.[c]; ws[addr] = typeof v === 'number' ? { t: 'n', f: t.slice(1), v } : { t: 's', f: t.slice(1), v: String(v ?? '') }; }
          else if (/^-?\d+(\.\d+)?$/.test(String(t).trim())) ws[addr] = { t: 'n', v: Number(t) };
          else ws[addr] = { t: 's', v: String(t) };
          if (cell.merge) { (ws['!merges'] = ws['!merges'] || []).push({ s: { r, c }, e: { r: r + cell.merge[0], c: c + cell.merge[1] } }); maxR = Math.max(maxR, r + cell.merge[0]); maxC = Math.max(maxC, c + cell.merge[1]); }
        });
      });
      ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
      if (xws.cols) { ws['!cols'] = []; for (let i = 0; i <= maxC; i++) ws['!cols'][i] = { wpx: xws.cols[i]?.width || 100 }; }
      X.utils.book_append_sheet(wb, ws, String(xws.name || `Sheet${si + 1}`).slice(0, 31));
    });
    return wb;
  }

  WD.editors = WD.editors || {};
  WD.editors.sheet = {
    colName, evaluateSheet, stox, xtos,
    async ensure() { await Promise.all([WD.ui.loadCSS(L().xsCss), WD.ui.loadScript(L().xsJs), WD.ui.loadScript(L().xlsx)]); },

    async mount(el, data, { readOnly = false, onChange } = {}) {
      await this.ensure();
      el.innerHTML = '<div class="xs-holder allow-ctx"></div>';
      const holder = el.firstChild;
      const s = window.x_spreadsheet(holder, {
        mode: readOnly ? 'read' : 'edit', showToolbar: !readOnly, showGrid: true, showContextmenu: !readOnly, showBottomBar: true,
        view: { height: () => Math.max(420, el.clientHeight), width: () => el.clientWidth },
        row: { len: 100, height: 26 }, col: { len: 26, width: 100, indexWidth: 56, minWidth: 50 },
        style: { bgcolor: '#ffffff', align: 'left', valign: 'middle', textwrap: false, strike: false, underline: false, color: '#1d2a26', font: { name: 'Arial', size: 10, bold: false, italic: false } },
      });
      s.loadData(JSON.parse(JSON.stringify(data && data.length ? data : [{ name: 'Sheet1' }])));
      // 최고 관리자 외: 스프레드시트 자체 인쇄 버튼 제거 (인쇄도 반출 경로)
      if (!WD.sec.isAdmin()) holder.querySelectorAll('.x-spreadsheet-toolbar-btn').forEach((b) => { if (b.querySelector('.print') || /print|인쇄/i.test(b.getAttribute('data-tooltip') || '')) b.remove(); });
      let dirty = false;
      s.change(() => { dirty = true; onChange && onChange(); });
      const api = {
        getData: () => s.getData(),
        isDirty: () => dirty, clean: () => { dirty = false; },
        load: (d) => { s.loadData(d); dirty = true; },
        destroy: () => { el.innerHTML = ''; },
      };
      return api;
    },

    /** 파일 → x-spreadsheet 데이터 */
    async importFile(file) {
      await this.ensure();
      const buf = await WD.ui.readFile(file);
      const wb = window.XLSX.read(buf, { type: 'array', cellFormula: true, codepage: 949 });
      return stox(wb);
    },
    async toXlsxBlob(data) { await this.ensure(); const out = window.XLSX.write(xtos(data), { bookType: 'xlsx', type: 'array' }); return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); },
    toCsvBlob(data, idx = 0) {
      const aoa = evaluateSheet(data[idx] || data[0]);
      const csv = aoa.map((r) => r.map((v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
      return new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    },
    /** 읽기 전용 HTML 미리보기 (보관 DB 등) */
    toHtml(data) {
      const xws = (data || [])[0]; if (!xws) return '<p>(빈 시트)</p>';
      const aoa = evaluateSheet(xws);
      return `<table class="tbl sheet-preview"><thead><tr><th></th>${(aoa[0] || []).map((_, i) => `<th>${colName(i)}</th>`).join('')}</tr></thead><tbody>${aoa.map((r, i) => `<tr><th>${i + 1}</th>${r.map((v) => `<td>${WD.esc(typeof v === 'number' ? v.toLocaleString('ko-KR') : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    },
  };
})();
