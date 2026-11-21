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
        return { ok: false, blocked: true, msg: '비활성화(퇴사 처리)된 계정입니다. 시스템 접근이 차단되었습니다.\n문의: 대표' };
      }
      // 직급 결정: 고정 이메일(대표·관리자) 우선 → DB role → 기본 'staff' (DB에도 동기화)
      const eff = WD.effectiveRole(u);
      if (u.role !== eff) WD.tx((db) => { const t = db.users.find((x) => x.id === u.id); WD.audit('USER_CREATE', { type: 'user', id: u.id, name: u.name, actorName: u.name }, `직급 자동 적용: ${t.role || '미지정'} → ${eff}${WD.fixedRole(u.email) ? ' (고정 이메일)' : ''}`); t.role = eff; });
      sessionStorage.removeItem('wd_preview');
      const s = { id: WD.uid('ses'), userId: u.id, createdAt: WD.now(), lastSeen: WD.now(), expiresAt: new Date(Date.now() + TTL_MS).toISOString(), revokedAt: null, revokedReason: '', ua: navigator.userAgent.slice(0, 80) };
      WD.tx((db) => {
        db.sessions = db.sessions.filter((x) => !x.revokedAt || Date.now() - new Date(x.revokedAt) < 30 * 864e5).slice(-200);
        db.sessions.push(s);
      });
      sessionStorage.setItem(SID_KEY, s.id);
      WD.auditTx('LOGIN', { type: 'user', id: u.id, name: u.name });
      return { ok: true, user: { ...u, role: eff } };
    },

    /**
     * 화면용 사용자 객체: 적용 직급 + (대표·관리자의) 직원 화면 미리보기 반영
     * - realRole: 실제 로그인 직급 (미리보기 중에도 유지)
     * - role: 화면 렌더링 기준 직급 (미리보기 중이면 'staff' 또는 'manager')
     */
    viewUser(u) {
      if (!u) return null;
      const real = WD.effectiveRole(u);
      const pv = sessionStorage.getItem('wd_preview');
      const preview = WD.TOP_ROLES.includes(real) && ['staff', 'manager'].includes(pv) ? pv : null;
      return { ...u, role: preview || real, realRole: real, preview };
    },
    /** 감사 로그 등 내부용: 현재 로드된 DB 기준 사용자 (재검증 없음) */
    currentRaw() {
      const sid = sessionStorage.getItem(SID_KEY); if (!sid || !WD.db) return null;
      const s = WD.db.sessions.find((x) => x.id === sid); if (!s) return null;
      return auth.viewUser(WD.db.users.find((u) => u.id === s.userId));
    },
    /** 직원 화면 미리보기 (대표·관리자 전용, 실제 권한은 유지) */
    setPreview(role) {
      const v = auth.validate(); if (!v.ok || !WD.TOP_ROLES.includes(v.user.realRole)) return;
      if (role) sessionStorage.setItem('wd_preview', role); else sessionStorage.removeItem('wd_preview');
      WD.auditTx('DOC_VIEW', { type: 'preview', name: role || '원래 권한' }, role ? `${WD.ROLE_LABEL[role]} 화면 미리보기 시작` : '미리보기 종료');
    },

    /** 세션 + 사용자 상태를 매번 재검증 */
    validate() {
      WD.load();
      const sid = sessionStorage.getItem(SID_KEY);
      if (!sid) return { ok: false, reason: '' };
      const s = WD.db.sessions.find((x) => x.id === sid);
      if (!s) return { ok: false, reason: '세션이 존재하지 않습니다.' };
      if (s.revokedAt) return { ok: false, reason: s.revokedReason === 'RESIGNED' ? '계정이 비활성화(퇴사 처리)되어 모든 세션이 만료되었습니다. 강제 로그아웃됩니다.' : s.revokedReason === 'LOGOUT' ? '로그아웃되었습니다.' : '대표에 의해 세션이 종료되었습니다.' };
      if (new Date(s.expiresAt) < new Date()) return { ok: false, reason: '세션이 만료되었습니다. 다시 로그인해 주세요.', expired: true };
      const u = WD.db.users.find((x) => x.id === s.userId);
      if (!u || u.status !== 'ACTIVE' || u.role === 'RESIGNED') return { ok: false, reason: '계정이 비활성화(퇴사 처리)되어 강제 로그아웃되었습니다.' };
      // 직급은 매번 DB의 사용자 정보에서 자동 조회 → 전역 상태에 반영 (새로고침해도 세션으로 복원)
      const vu = auth.viewUser(u);
      WD.state.user = vu; WD.state.role = vu.role; WD.state.realRole = vu.realRole; WD.state.preview = vu.preview; WD.state.sessionStartedAt = s.createdAt;
      sessionStorage.setItem('wd_role', vu.realRole);
      return { ok: true, user: vu, session: s };
    },

    current() { const v = auth.validate(); return v.ok ? v.user : null; },
    isCEO() { return WD.isTop(auth.current()); },

    logout(reason = '', { silent = false } = {}) {
      const sid = sessionStorage.getItem(SID_KEY);
      if (sid) {
        WD.tx((db) => {
          const s = db.sessions.find((x) => x.id === sid);
          if (s && !s.revokedAt) { WD.audit('LOGOUT', { type: 'user', id: s.userId, name: WD.userName(s.userId) }); s.revokedAt = WD.now(); s.revokedReason = 'LOGOUT'; }
        });
      }
      sessionStorage.removeItem(SID_KEY); sessionStorage.removeItem('wd_role'); WD.state.user = null; WD.state.role = null;
      if (reason) sessionStorage.setItem('wd_logout_reason', reason);
      if (!silent) location.hash = '#/login';
    },

    /** 강제 로그아웃 (권한 회수 감지) */
    force(reason) {
      sessionStorage.removeItem(SID_KEY); sessionStorage.removeItem('wd_role'); WD.state.user = null; WD.state.role = null;
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
