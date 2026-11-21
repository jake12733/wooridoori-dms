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
  const deny = (what) => { WD.auditTx('ACCESS_DENIED', { type: 'api', name: what }, `대표 전용 데이터 조회 시도 차단`); throw new Error('대표·관리자만 조회할 수 있는 데이터입니다.'); };
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
        const u = me(); if (!WD.isTop(u)) deny('attendance.all');
        return clone(WD.db.attendance.filter((a) => !month || a.date.startsWith(month)));
      },
      /** 이번 달 통계 — 대표 전용 */
      stats(month) {
        const u = me(); if (!WD.isTop(u)) deny('attendance.stats');
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
      add(status, note = '', date = null) {
        WD.blockPreview();
        const u = me();
        if (!WD.ATT_TYPES.some((t) => t.key === status)) throw new Error('알 수 없는 근태 유형입니다.');
        if ((status === '대강' || status === '병가' || status === '휴가') && !note.trim()) throw new Error(`${status} 사유를 입력해 주세요.`);
        const todayStr = WD.ymd();
        const today = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr; // 달력에서 고른 날짜 (기본: 오늘)
        const diff = WD.daysLeft(today);
        if (diff > 0 && !['휴가', '병가', '대강'].includes(status)) throw new Error('앞으로의 날짜에는 휴가·병가·대강만 등록할 수 있어요.');
        if (diff < -62 || diff > 120) throw new Error('지난 2개월 ~ 앞으로 4개월 안의 날짜만 등록할 수 있어요.');
        const dayLabel = today === todayStr ? '오늘' : `${+today.slice(5, 7)}월 ${+today.slice(8)}일`;
        return WD.tx((db) => {
          if (db.attendance.some((a) => a.userId === u.id && a.date === today && a.status === status)) throw new Error(`${dayLabel} '${status}'은(는) 이미 등록했습니다.`);
          if ((status === '출석' || status === '지각') && db.attendance.some((a) => a.userId === u.id && a.date === today && (a.status === '출석' || a.status === '지각'))) throw new Error(`${dayLabel} 출석/지각은 이미 등록했습니다. 수정은 대표에게 요청하세요.`);
          const rec = { id: WD.uid('att'), userId: u.id, date: today, time: WD.hm(), status, note: note.trim(), approved: false, approvedBy: null, createdAt: WD.now(), locked: true, lateEntry: diff < 0 };
          db.attendance.push(rec);
          WD.audit('ATTEND_IN', { type: 'attendance', id: rec.id, name: u.name }, `${rec.date} ${status} ${rec.time}${rec.lateEntry ? ' (나중 등록)' : ''}${rec.note ? ' · ' + rec.note : ''}`);
          WD.ceos().forEach((c) => { if (status !== '출석' || rec.lateEntry) WD.notify(c.id, { title: `근태 등록: ${u.name} ${dayLabel} ${status}${rec.lateEntry ? ' (나중 등록)' : ''}`, body: rec.note || rec.time, link: '#/attendance', type: 'INFO' }); });
          return clone(rec);
        });
      },
      /** 상태 수정 — 대표 전용 */
      update(id, patch) {
        const u = me(); if (!WD.isTop(u)) deny('attendance.update');
        return WD.tx((db) => {
          const r = db.attendance.find((a) => a.id === id); if (!r) throw new Error('기록 없음');
          const before = `${r.status}${r.note ? '(' + r.note + ')' : ''}`;
          Object.assign(r, { status: patch.status ?? r.status, note: patch.note ?? r.note, approved: true, approvedBy: u.id, approvedAt: WD.now() });
          WD.audit('ATTEND_EDIT', { type: 'attendance', id, name: WD.userName(r.userId) }, `${r.date}: ${before} → ${r.status} (수정·승인)`);
        });
      },
      approve(ids) {
        const u = me(); if (!WD.isTop(u)) deny('attendance.approve');
        return WD.tx((db) => { let n = 0; db.attendance.forEach((a) => { if (ids.includes(a.id) && !a.approved) { a.approved = true; a.approvedBy = u.id; a.approvedAt = WD.now(); n++; } }); WD.audit('ATTEND_EDIT', { type: 'attendance' }, `근태 ${n}건 승인`); return n; });
      },
      remove(id) {
        const u = me(); if (!WD.isTop(u)) deny('attendance.remove');
        WD.tx((db) => { const r = db.attendance.find((a) => a.id === id); db.attendance = db.attendance.filter((a) => a.id !== id); WD.audit('ATTEND_EDIT', { type: 'attendance', id, name: WD.userName(r?.userId) }, `${r?.date} ${r?.status} 기록 삭제`); });
      },
    },
    /* ---------- 메시지 (알림함 소통 창구) — 전체방 · 사용자 지정 방 · 1:1 개인 메시지 ----------
     * to: 'ALL' | 'room:<id>' | <userId>
     * 본인이 보내거나 받은 1:1, 본인이 멤버인 방, 전체방만 반환 (대표·관리자도 남의 1:1·방은 못 봄) */
    messages: {
      _rooms(u) { return (WD.db.rooms || []).filter((r) => !r.deleted && (r.members || []).includes(u.id)); },
      _visible(u, m) {
        if (m.to === 'ALL') return true;
        if (String(m.to).startsWith('room:')) { const r = (WD.db.rooms || []).find((x) => 'room:' + x.id === m.to); return !!r && !r.deleted && r.members.includes(u.id); }
        return m.from === u.id || m.to === u.id;
      },
      _mine(u) { return (WD.db.messages || []).filter((m) => this._visible(u, m)); },
      _inConv(u, m, id) {
        if (id === 'ALL') return m.to === 'ALL';
        if (String(id).startsWith('room:')) return m.to === id;
        return m.to !== 'ALL' && !String(m.to).startsWith('room:') && ((m.from === u.id && m.to === id) || (m.from === id && m.to === u.id));
      },
      unreadCount() {
        const u = WD.auth.currentRaw(); if (!u || !WD.db) return 0;
        return (WD.db.messages || []).filter((m) => m.from !== u.id && !(m.readBy || []).includes(u.id) && this._visible(u, m)).length;
      },
      conversations() {
        const u = me(); const mine = this._mine(u);
        const conv = (id) => { const ms = mine.filter((m) => this._inConv(u, m, id)); const last = ms[ms.length - 1]; return { id, last, unread: ms.filter((m) => m.from !== u.id && !(m.readBy || []).includes(u.id)).length }; };
        const rooms = this._rooms(u).map((r) => ({ ...conv('room:' + r.id), name: r.name, room: r, kind: 'room' }));
        const peers = WD.db.users.filter((x) => x.id !== u.id && mine.some((m) => this._inConv(u, m, x.id)))
          .map((p) => ({ ...conv(p.id), name: p.name, role: WD.effectiveRole(p), inactive: p.status !== 'ACTIVE', kind: 'dm' }));
        const byRecent = (a, b) => ((b.last?.at || b.room?.createdAt || '') > (a.last?.at || a.room?.createdAt || '') ? 1 : -1);
        return [{ ...conv('ALL'), name: '전체 공지방', kind: 'all', all: true }, ...[...rooms, ...peers].sort(byRecent)];
      },
      /** 1:1 개인 메시지 대상(등록된 활성 계정) */
      people() { const u = me(); return WD.db.users.filter((x) => x.id !== u.id && x.status === 'ACTIVE').map((x) => ({ id: x.id, name: x.name, role: WD.effectiveRole(x), dept: x.dept })); },
      peerInfo(id) {
        const u = me();
        if (id === 'ALL') return { id, kind: 'all', name: '전체 공지방' };
        if (String(id).startsWith('room:')) { const r = this._rooms(u).find((x) => 'room:' + x.id === id); return r ? { id, kind: 'room', name: r.name, room: r } : null; }
        const p = WD.user(id); return p ? { id, kind: 'dm', name: p.name, role: WD.effectiveRole(p), inactive: p.status !== 'ACTIVE' } : null;
      },
      thread(peer) { const u = me(); return clone(this._mine(u).filter((m) => this._inConv(u, m, peer))); },
      send(peer, text, docId = null) {
        WD.blockPreview();
        const u = me(); text = String(text || '').trim();
        if (!text && !docId) throw new Error('메시지를 입력하세요.');
        if (String(peer).startsWith('room:')) { if (!this._rooms(u).some((r) => 'room:' + r.id === peer)) throw new Error('이 방의 멤버가 아닙니다.'); }
        else if (peer !== 'ALL') { const p = WD.user(peer); if (!p || p.status !== 'ACTIVE') throw new Error('비활성화된 계정에는 보낼 수 없습니다.'); }
        const label = this.peerInfo(peer)?.name || '';
        return WD.tx((db) => {
          db.messages = db.messages || [];
          const m = { id: WD.uid('msg'), from: u.id, to: peer, text: text.slice(0, 2000), docId, at: WD.now(), readBy: [u.id] };
          db.messages.push(m);
          if (db.messages.length > 5000) db.messages.splice(0, db.messages.length - 5000);
          WD.audit('DISPATCH', { type: 'message', id: m.id, name: label }, `메시지 ${text.slice(0, 40)}${docId ? ' · 문서 첨부' : ''}`);
          return clone(m);
        });
      },
      markRead(peer) {
        const u = WD.auth.currentRaw(); if (!u || u.preview) return;
        const ids = this.thread(peer).filter((m) => m.from !== u.id && !(m.readBy || []).includes(u.id)).map((m) => m.id);
        if (ids.length) WD.tx((db) => db.messages.forEach((m) => { if (ids.includes(m.id)) m.readBy = [...(m.readBy || []), u.id]; }));
      },
      /* ---- 방 만들기 · 관리 ---- */
      createRoom(name, memberIds) {
        WD.blockPreview();
        const u = me(); name = String(name || '').trim();
        const members = [...new Set([u.id, ...memberIds])].filter((id) => WD.user(id)?.status === 'ACTIVE');
        if (!name) throw new Error('방 이름을 입력하세요.');
        if (members.length < 2) throw new Error('함께할 멤버를 1명 이상 선택하세요.');
        return WD.tx((db) => {
          db.rooms = db.rooms || [];
          const r = { id: WD.uid('room'), name: name.slice(0, 40), members, ownerId: u.id, createdAt: WD.now() };
          db.rooms.push(r);
          db.messages = db.messages || [];
          db.messages.push({ id: WD.uid('msg'), from: u.id, to: 'room:' + r.id, text: `'${r.name}' 방을 만들었습니다. (${members.map((id) => WD.userName(id)).join(', ')})`, system: true, at: WD.now(), readBy: [u.id] });
          WD.audit('DISPATCH', { type: 'room', id: r.id, name: r.name }, `방 생성 · 멤버 ${members.length}명`);
          return clone(r);
        });
      },
      canManageRoom(r) { const u = me(); return r.ownerId === u.id || WD.isTop({ role: u.realRole || u.role }); },
      updateRoom(roomId, { name, members }) {
        WD.blockPreview();
        const u = me();
        return WD.tx((db) => {
          const r = (db.rooms || []).find((x) => x.id === roomId); if (!r || r.deleted) throw new Error('방이 없습니다.');
          if (!(r.ownerId === u.id || WD.isTop({ role: u.realRole || u.role }))) throw new Error('방을 만든 사람 또는 대표·관리자만 수정할 수 있습니다.');
          const before = r.members.slice();
          if (name) r.name = String(name).trim().slice(0, 40);
          if (members) r.members = [...new Set([r.ownerId, ...members])].filter((id) => WD.user(id)?.status === 'ACTIVE' || id === r.ownerId);
          const added = r.members.filter((x) => !before.includes(x)), removed = before.filter((x) => !r.members.includes(x));
          if (added.length || removed.length) db.messages.push({ id: WD.uid('msg'), from: u.id, to: 'room:' + r.id, system: true, text: [added.length ? `${added.map((x) => WD.userName(x)).join(', ')}님 초대` : '', removed.length ? `${removed.map((x) => WD.userName(x)).join(', ')}님 내보냄` : ''].filter(Boolean).join(' · '), at: WD.now(), readBy: [u.id] });
          WD.audit('DISPATCH', { type: 'room', id: r.id, name: r.name }, `방 수정 · 멤버 ${r.members.length}명`);
        });
      },
      leaveRoom(roomId) {
        WD.blockPreview();
        const u = me();
        WD.tx((db) => {
          const r = (db.rooms || []).find((x) => x.id === roomId); if (!r) return;
          if (r.ownerId === u.id) { r.deleted = true; WD.audit('DISPATCH', { type: 'room', id: r.id, name: r.name }, '방 삭제'); return; }
          r.members = r.members.filter((x) => x !== u.id);
          db.messages.push({ id: WD.uid('msg'), from: u.id, to: 'room:' + r.id, system: true, text: `${u.name}님이 나갔습니다.`, at: WD.now(), readBy: [u.id] });
        });
      },
    },
    documents: {
      /** 내가 볼 수 있는 문서만 */
      visible() { const u = me(); return WD.db.documents.filter((d) => WD.sec.canView(d, u)); },
    },
  };
})();
