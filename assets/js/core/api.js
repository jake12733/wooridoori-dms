/* =========================================================================
 * 데이터 접근 API (권한 체크 계층)
 * -------------------------------------------------------------------------
 * 화면(views)은 근태·문서 데이터를 DB에서 직접 읽지 않고 반드시 이 API를 거칩니다.
 * 각 함수는 호출 시점에 세션·직급을 재검증하고, 'ceo' 외 직급에게는
 * 타 직원의 근태 기록·누적 통계를 아예 반환하지 않습니다.
 * 서버 연동 시 동일한 규칙: server/src/routes/attendance.js + docs/schema.sql RLS(attend_*)
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const me = () => { const u = WD.auth.current(); if (!u) throw new Error('로그인이 필요합니다.'); return u; };
  const deny = (what) => { WD.auditTx('ACCESS_DENIED', { type: 'api', name: what }, `대표 전용 데이터 조회 시도 차단`); throw new Error('대표만 조회할 수 있는 데이터입니다.'); };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  WD.ATT_TYPES = [
    { key: '출석', icon: 'check', cls: 'a-work', desc: '정상 출근' },
    { key: '지각', icon: 'clock', cls: 'a-late', desc: '늦게 출근' },
    { key: '병가', icon: 'alert', cls: 'a-sick', desc: '아파서 결근' },
    { key: '휴가', icon: 'home', cls: 'a-leave', desc: '연차·휴가' },
    { key: '대강', icon: 'users', cls: 'a-sub', desc: '다른 선생님 수업 대신' },
  ];

  WD.api = {
    attendance: {
      /** 본인 기록만 (모든 직급 공통) */
      mine({ month = null, date = null } = {}) {
        const u = me();
        return clone(WD.db.attendance.filter((a) => a.userId === u.id && (!month || a.date.startsWith(month)) && (!date || a.date === date)));
      },
      /** 전 직원 기록 — 대표 전용 */
      all({ month = null } = {}) {
        const u = me(); if (u.role !== 'ceo') deny('attendance.all');
        return clone(WD.db.attendance.filter((a) => !month || a.date.startsWith(month)));
      },
      /** 이번 달 통계 — 대표 전용 */
      stats(month) {
        const u = me(); if (u.role !== 'ceo') deny('attendance.stats');
        const rows = WD.db.attendance.filter((a) => a.date.startsWith(month));
        const people = WD.staffUsers();
        const per = people.map((p) => {
          const r = rows.filter((a) => a.userId === p.id);
          const c = (s) => r.filter((a) => a.status === s).length;
          return { user: { id: p.id, name: p.name, role: p.role, dept: p.dept }, 출석: c('출석'), 지각: c('지각'), 병가: c('병가'), 휴가: c('휴가'), 대강: c('대강'), subs: r.filter((a) => a.status === '대강').map((a) => ({ date: a.date, note: a.note })), pending: r.filter((a) => !a.approved).length, records: clone(r) };
        });
        const tot = (k) => per.reduce((s, p) => s + p[k], 0);
        return { people: per, total: { 출석: tot('출석'), 지각: tot('지각'), 병가휴가: tot('병가') + tot('휴가'), 대강: tot('대강'), pending: tot('pending') } };
      },
      /** 본인 근태 체크 (등록 후 본인 삭제·수정 불가 — locked) */
      add(status, note = '') {
        const u = me();
        if (!WD.ATT_TYPES.some((t) => t.key === status)) throw new Error('알 수 없는 근태 유형입니다.');
        if ((status === '대강' || status === '병가' || status === '휴가') && !note.trim()) throw new Error(`${status} 사유를 입력해 주세요.`);
        const today = WD.ymd();
        return WD.tx((db) => {
          if (db.attendance.some((a) => a.userId === u.id && a.date === today && a.status === status)) throw new Error(`오늘 '${status}'은(는) 이미 등록했습니다.`);
          if ((status === '출석' || status === '지각') && db.attendance.some((a) => a.userId === u.id && a.date === today && (a.status === '출석' || a.status === '지각'))) throw new Error('오늘 출석/지각은 이미 등록했습니다. 수정은 대표에게 요청하세요.');
          const rec = { id: WD.uid('att'), userId: u.id, date: today, time: WD.hm(), status, note: note.trim(), approved: false, approvedBy: null, createdAt: WD.now(), locked: true };
          db.attendance.push(rec);
          WD.audit('ATTEND_IN', { type: 'attendance', id: rec.id, name: u.name }, `${status} ${rec.time}${rec.note ? ' · ' + rec.note : ''}`);
          WD.ceos().forEach((c) => { if (status !== '출석') WD.notify(c.id, { title: `근태 등록: ${u.name} ${status}`, body: rec.note || rec.time, link: '#/attendance', type: 'INFO' }); });
          return clone(rec);
        });
      },
      /** 상태 수정 — 대표 전용 */
      update(id, patch) {
        const u = me(); if (u.role !== 'ceo') deny('attendance.update');
        return WD.tx((db) => {
          const r = db.attendance.find((a) => a.id === id); if (!r) throw new Error('기록 없음');
          const before = `${r.status}${r.note ? '(' + r.note + ')' : ''}`;
          Object.assign(r, { status: patch.status ?? r.status, note: patch.note ?? r.note, approved: true, approvedBy: u.id, approvedAt: WD.now() });
          WD.audit('ATTEND_EDIT', { type: 'attendance', id, name: WD.userName(r.userId) }, `${r.date}: ${before} → ${r.status} (수정·승인)`);
        });
      },
      approve(ids) {
        const u = me(); if (u.role !== 'ceo') deny('attendance.approve');
        return WD.tx((db) => { let n = 0; db.attendance.forEach((a) => { if (ids.includes(a.id) && !a.approved) { a.approved = true; a.approvedBy = u.id; a.approvedAt = WD.now(); n++; } }); WD.audit('ATTEND_EDIT', { type: 'attendance' }, `근태 ${n}건 승인`); return n; });
      },
      remove(id) {
        const u = me(); if (u.role !== 'ceo') deny('attendance.remove');
        WD.tx((db) => { const r = db.attendance.find((a) => a.id === id); db.attendance = db.attendance.filter((a) => a.id !== id); WD.audit('ATTEND_EDIT', { type: 'attendance', id, name: WD.userName(r?.userId) }, `${r?.date} ${r?.status} 기록 삭제`); });
      },
    },
    documents: {
      /** 내가 볼 수 있는 문서만 */
      visible() { const u = me(); return WD.db.documents.filter((d) => WD.sec.canView(d, u)); },
    },
  };
})();
