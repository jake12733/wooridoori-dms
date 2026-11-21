/* =========================================================================
 * 인증 · 세션 · 퇴사자 즉시 차단
 * - 세션은 DB(sessions)에 저장되고 탭은 세션 ID만 보관(sessionStorage).
 * - 퇴사 확정 시 해당 사용자의 모든 세션에 revokedAt 기록 → 다른 탭/기기에서도
 *   storage 이벤트 + 4초 주기 검증으로 즉시 강제 로그아웃.
 * - 운영: 서버가 매 요청마다 세션·role·status를 재검증 (server/src/middleware/auth.js).
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const SID_KEY = 'wd_sid';
  const TTL_MS = 8 * 60 * 60 * 1000; // 8시간

  const auth = {
    sid: () => sessionStorage.getItem(SID_KEY),

    async login(loginId, password) {
      sessionStorage.removeItem(SID_KEY); // 이전(만료·회수된) 세션 흔적 제거
      WD.load();
      const key = String(loginId || '').trim().toLowerCase();
      const u = WD.db.users.find((x) => (x.email || '').toLowerCase() === key || (x.loginId || '').toLowerCase() === key);
      const hash = await WD.sha256('wooridoori::' + password);
      if (!u || u.pwHash !== hash) {
        WD.tx(() => WD.audit('LOGIN_FAIL', { type: 'user', name: loginId, actorName: loginId || '알 수 없음' }, '아이디 또는 비밀번호 불일치'));
        return { ok: false, msg: '이메일 또는 비밀번호가 올바르지 않습니다.' };
      }
      if (u.role === 'RESIGNED' || u.status !== 'ACTIVE') {
        WD.tx(() => WD.audit('LOGIN_BLOCKED', { type: 'user', id: u.id, name: u.name, actorName: u.name }, `퇴사일 ${WD.fmtDT(u.resignedAt)} · 계정 비활성`));
        return { ok: false, blocked: true, msg: '비활성화(퇴사 처리)된 계정입니다. 시스템 접근이 차단되었습니다.\n문의: 최고 관리자' };
      }
      const s = { id: WD.uid('ses'), userId: u.id, createdAt: WD.now(), lastSeen: WD.now(), expiresAt: new Date(Date.now() + TTL_MS).toISOString(), revokedAt: null, revokedReason: '', ua: navigator.userAgent.slice(0, 80) };
      WD.tx((db) => {
        db.sessions = db.sessions.filter((x) => !x.revokedAt || Date.now() - new Date(x.revokedAt) < 30 * 864e5).slice(-200);
        db.sessions.push(s);
      });
      sessionStorage.setItem(SID_KEY, s.id);
      WD.auditTx('LOGIN', { type: 'user', id: u.id, name: u.name });
      return { ok: true, user: u };
    },

    /** 감사 로그 등 내부용: 현재 로드된 DB 기준 사용자 (재검증 없음) */
    currentRaw() {
      const sid = sessionStorage.getItem(SID_KEY); if (!sid || !WD.db) return null;
      const s = WD.db.sessions.find((x) => x.id === sid); if (!s) return null;
      return WD.db.users.find((u) => u.id === s.userId) || null;
    },

    /** 세션 + 사용자 상태를 매번 재검증 */
    validate() {
      WD.load();
      const sid = sessionStorage.getItem(SID_KEY);
      if (!sid) return { ok: false, reason: '' };
      const s = WD.db.sessions.find((x) => x.id === sid);
      if (!s) return { ok: false, reason: '세션이 존재하지 않습니다.' };
      if (s.revokedAt) return { ok: false, reason: s.revokedReason === 'RESIGNED' ? '계정이 비활성화(퇴사 처리)되어 모든 세션이 만료되었습니다. 강제 로그아웃됩니다.' : s.revokedReason === 'LOGOUT' ? '로그아웃되었습니다.' : '최고 관리자에 의해 세션이 종료되었습니다.' };
      if (new Date(s.expiresAt) < new Date()) return { ok: false, reason: '세션이 만료되었습니다. 다시 로그인해 주세요.', expired: true };
      const u = WD.db.users.find((x) => x.id === s.userId);
      if (!u || u.status !== 'ACTIVE' || u.role === 'RESIGNED') return { ok: false, reason: '계정이 비활성화(퇴사 처리)되어 강제 로그아웃되었습니다.' };
      return { ok: true, user: u, session: s };
    },

    current() { const v = auth.validate(); return v.ok ? v.user : null; },
    isCEO() { return auth.current()?.role === 'ADMIN'; },

    logout(reason = '', { silent = false } = {}) {
      const sid = sessionStorage.getItem(SID_KEY);
      if (sid) {
        WD.tx((db) => {
          const s = db.sessions.find((x) => x.id === sid);
          if (s && !s.revokedAt) { WD.audit('LOGOUT', { type: 'user', id: s.userId, name: WD.userName(s.userId) }); s.revokedAt = WD.now(); s.revokedReason = 'LOGOUT'; }
        });
      }
      sessionStorage.removeItem(SID_KEY);
      if (reason) sessionStorage.setItem('wd_logout_reason', reason);
      if (!silent) location.hash = '#/login';
    },

    /** 강제 로그아웃 (권한 회수 감지) */
    force(reason) {
      sessionStorage.removeItem(SID_KEY);
      sessionStorage.setItem('wd_logout_reason', reason);
      document.body.classList.remove('staff-mode', 'ceo-mode');
      document.getElementById('modal-root').innerHTML = '';
      if (location.hash === '#/login') WD.app?.route(); else location.hash = '#/login';
    },

    /** 세션 감시: 다른 탭에서 퇴사 처리 → 이 탭 즉시 차단 */
    watch() {
      const check = () => {
        if (!sessionStorage.getItem(SID_KEY)) return;
        const v = auth.validate();
        if (!v.ok) { auth.force(v.reason); return; }
        // lastSeen 갱신 (1분 단위)
        if (Date.now() - new Date(v.session.lastSeen) > 60000) WD.tx((db) => { const s = db.sessions.find((x) => x.id === v.session.id); if (s) s.lastSeen = WD.now(); });
      };
      window.addEventListener('storage', (e) => { if (e.key === WD.DB_KEY) check(); }); // 같은 브라우저 다른 탭: 즉시
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      setInterval(check, 2000); // 보조 주기 검증 (2초)
    },

    /** 특정 사용자의 모든 세션 회수 (tx 내부에서 호출) */
    revokeAll(db, userId, reason) {
      let n = 0;
      db.sessions.forEach((s) => { if (s.userId === userId && !s.revokedAt) { s.revokedAt = WD.now(); s.revokedReason = reason; n++; } });
      return n;
    },
  };
  WD.auth = auth;
})();
