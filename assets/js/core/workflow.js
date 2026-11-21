/* =========================================================================
 * 서류 보완 워크플로우 · 원클릭 발송 · 버전 관리 · 만료 알림
 *   DRAFT → PENDING → REVISION_REQUIRED → RESUBMITTED → APPROVED(잠금)
 * ========================================================================= */
(function () {
  const WD = window.WD;

  WD.STATUS = {
    DRAFT: { label: '작성 중', cls: 'st-draft' },
    PENDING: { label: '제출됨', cls: 'st-pending' },
    REVISION_REQUIRED: { label: '보완 요청', cls: 'st-revision' },
    RESUBMITTED: { label: '재제출', cls: 'st-resubmitted' },
    APPROVED: { label: '승인·잠금', cls: 'st-approved' },
  };

  // 허용 전이표 (서버의 CHECK/트리거와 동일한 규칙: docs/schema.sql)
  const RULES = {
    'DRAFT>PENDING': 'owner', 'REVISION_REQUIRED>RESUBMITTED': 'owner',
    'PENDING>REVISION_REQUIRED': 'ceo', 'RESUBMITTED>REVISION_REQUIRED': 'ceo',
    'PENDING>APPROVED': 'ceo', 'RESUBMITTED>APPROVED': 'ceo', 'DRAFT>APPROVED': 'ceo',
  };

  const wf = {
    canTransition(doc, to, u = WD.auth.currentRaw()) {
      const who = RULES[`${doc.status}>${to}`];
      if (!who || !u) return false;
      if (who === 'ceo') return u.role === 'CEO';
      return u.role === 'CEO' || doc.ownerId === u.id || doc.assigneeId === u.id;
    },

    /** 상태 전이 (tx 내부 사용 가능하도록 db 인자) */
    transition(docId, to, reason = '') {
      const u = WD.auth.current(); if (!u) throw new Error('로그인 필요');
      return WD.tx((db) => {
        const d = db.documents.find((x) => x.id === docId);
        if (!d) throw new Error('문서 없음');
        if (!wf.canTransition(d, to, u)) throw new Error(`허용되지 않은 전이: ${d.status} → ${to}`);
        if (to === 'REVISION_REQUIRED' && !reason.trim()) throw new Error('보완 요청 사유를 입력하세요.');
        if (to === 'RESUBMITTED' && d.revisionAtVersion && d.version <= d.revisionAtVersion) throw new Error(`보완 요청 이후 수정된 버전이 없습니다. 내용을 수정·저장(v${d.version + 1})한 뒤 재제출하세요.`);
        const from = d.status;
        d.status = to; d.updatedAt = WD.now();
        if (to === 'REVISION_REQUIRED') d.revisionAtVersion = d.version;
        if (to === 'APPROVED') { d.locked = true; d.lockedAt = WD.now(); d.approvedBy = u.id; }
        db.wfEvents.push({ id: WD.uid('wf'), docId, from, to, actorId: u.id, reason, at: WD.now(), version: d.version });
        const act = { PENDING: 'WF_SUBMIT', REVISION_REQUIRED: 'WF_REVISION', RESUBMITTED: 'WF_RESUBMIT', APPROVED: 'WF_APPROVE' }[to];
        WD.audit(act, { type: 'document', id: d.id, name: d.title }, `${from} → ${to} (v${d.version})${reason ? ' · 사유: ' + reason : ''}`);
        const link = `#/doc/${d.id}`;
        if (to === 'PENDING' || to === 'RESUBMITTED') WD.ceos().forEach((c) => WD.notify(c.id, { title: `${to === 'PENDING' ? '결재 요청' : '재제출'}: ${d.title} (v${d.version})`, body: `${u.name}님이 ${to === 'PENDING' ? '제출' : '보완 후 재제출'}했습니다.`, link, type: 'APPROVAL', docId: d.id }));
        const targets = [...new Set([d.ownerId, d.assigneeId].filter((x) => x && x !== u.id))];
        if (to === 'REVISION_REQUIRED') targets.forEach((t) => WD.notify(t, { title: `보완 요청: ${d.title}`, body: `사유: ${reason}`, link, type: 'REVISION', docId: d.id }));
        if (to === 'APPROVED') targets.forEach((t) => WD.notify(t, { title: `최종 승인: ${d.title} (v${d.version})`, body: '문서가 승인되어 잠금 처리되었습니다.', link, type: 'APPROVED', docId: d.id }));
        return d;
      });
    },

    /** 새 버전 저장 (v1, v2 …) */
    saveVersion(docId, content, note = '') {
      const u = WD.auth.current(); if (!u) throw new Error('로그인 필요');
      return WD.tx((db) => {
        const d = db.documents.find((x) => x.id === docId);
        if (!d) throw new Error('문서 없음');
        if (!WD.sec.canEdit(d, u)) throw new Error(d.locked ? '승인·잠금된 문서는 수정할 수 없습니다.' : '편집 권한이 없습니다.');
        const v = d.version + 1;
        db.versions.push({ id: WD.uid('ver'), docId, version: v, authorId: u.id, at: WD.now(), note: note || '수정', content });
        d.version = v; d.updatedAt = WD.now(); d.lastEditorId = u.id;
        WD.audit('DOC_EDIT', { type: 'document', id: d.id, name: d.title }, `v${v - 1} → v${v}${note ? ' · ' + note : ''}`);
        return d;
      });
    },

    createDoc({ title, kind, folderId, content, note = '최초 작성', status = 'DRAFT' }) {
      const u = WD.auth.current(); if (!u) throw new Error('로그인 필요');
      const f = WD.folder(folderId);
      return WD.tx((db) => {
        const d = { id: WD.uid('doc'), title, kind, folderId, ownerId: u.id, status, version: 1, locked: false, recipients: [], assigneeId: null, legalHold: !!f?.legal, createdAt: WD.now(), updatedAt: WD.now() };
        db.documents.push(d);
        db.versions.push({ id: WD.uid('ver'), docId: d.id, version: 1, authorId: u.id, at: WD.now(), note, content });
        WD.audit('DOC_CREATE', { type: 'document', id: d.id, name: title }, `${WD.folderPath(folderId)} · ${kind}`);
        return d;
      });
    },

    /* ---------- 원클릭 발송 ---------- */
    ACTION_LABEL: { SUBMIT_CEO: '대표 결재·제출', REQUEST_USER: '서명·보완 요청', SAVE_FOLDER: '폴더 저장·공유', BROADCAST: '전체 발송', DEPT: '부서 발송', CUSTOM: '직접 선택 발송' },

    dispatch(docId, preset, extra = {}) {
      const u = WD.auth.current(); if (!u) throw new Error('로그인 필요');
      const res = WD.tx((db) => {
        const d = db.documents.find((x) => x.id === docId);
        if (!d) throw new Error('문서 없음');
        if (!WD.sec.canView(d, u)) throw new Error('권한 없음');
        const active = db.users.filter((x) => x.status === 'ACTIVE');
        let targets = []; let statusChange = null; let folderMsg = '';
        switch (preset.action) {
          case 'SUBMIT_CEO':
            targets = active.filter((x) => x.role === 'CEO').map((x) => x.id);
            if (d.status === 'DRAFT') statusChange = 'PENDING';
            else if (d.status === 'REVISION_REQUIRED') statusChange = 'RESUBMITTED';
            break;
          case 'REQUEST_USER':
            targets = [preset.targetUserId].filter((id) => active.some((x) => x.id === id));
            if (!targets.length) throw new Error('대상 직원이 없거나 퇴사 처리되었습니다.');
            d.assigneeId = targets[0];
            break;
          case 'SAVE_FOLDER': {
            const f = db.folders.find((x) => x.id === preset.folderId); if (!f) throw new Error('폴더 없음');
            if (d.folderId !== f.id) { d.folderId = f.id; folderMsg = ` → ${WD.folderPath(f.id)}`; }
            targets = active.filter((x) => x.role === 'CEO' || (f.staffAccess !== 'none' && x.id !== u.id)).map((x) => x.id);
            break; }
          case 'BROADCAST': targets = active.filter((x) => x.id !== u.id).map((x) => x.id); break;
          case 'DEPT': targets = active.filter((x) => x.dept === preset.dept && x.id !== u.id).map((x) => x.id); break;
          case 'CUSTOM': targets = (extra.targets || []).filter((id) => active.some((x) => x.id === id)); if (extra.folderId) { d.folderId = extra.folderId; folderMsg = ` → ${WD.folderPath(extra.folderId)}`; } break;
          default: throw new Error('알 수 없는 프리셋');
        }
        targets = [...new Set(targets)].filter((t) => t !== u.id || preset.action === 'SUBMIT_CEO' && u.role === 'CEO');
        if (statusChange) {
          if (statusChange === 'RESUBMITTED' && d.revisionAtVersion && d.version <= d.revisionAtVersion) throw new Error(`보완 요청 이후 수정된 버전이 없습니다. 수정·저장 후 다시 발송하세요.`);
          db.wfEvents.push({ id: WD.uid('wf'), docId, from: d.status, to: statusChange, actorId: u.id, reason: '', at: WD.now(), version: d.version });
          WD.audit(statusChange === 'PENDING' ? 'WF_SUBMIT' : 'WF_RESUBMIT', { type: 'document', id: d.id, name: d.title }, `${d.status} → ${statusChange} (v${d.version})`);
          d.status = statusChange;
        }
        d.recipients = [...new Set([...(d.recipients || []), ...targets])];
        d.updatedAt = WD.now();
        const msg = extra.message || '';
        const titleMap = { SUBMIT_CEO: statusChange === 'RESUBMITTED' ? '재제출' : '결재 요청', REQUEST_USER: '서명·보완 요청', SAVE_FOLDER: '공유됨', BROADCAST: '공지', DEPT: '부서 공유', CUSTOM: '문서 수신' };
        targets.forEach((t) => WD.notify(t, { title: `${titleMap[preset.action]}: ${d.title} (v${d.version})`, body: `${u.name}님이 '${preset.name}'(으)로 발송했습니다.${msg ? ' · ' + msg : ''}`, link: `#/doc/${d.id}`, type: preset.action === 'SUBMIT_CEO' ? 'APPROVAL' : preset.action === 'REQUEST_USER' ? 'SIGN' : 'INFO', docId: d.id }));
        const rec = { id: WD.uid('dsp'), docId, presetName: preset.name, action: preset.action, targets, folderId: preset.folderId || extra.folderId || null, senderId: u.id, message: msg, at: WD.now(), version: d.version };
        db.dispatches.unshift(rec);
        WD.audit('DISPATCH', { type: 'document', id: d.id, name: d.title }, `${preset.name}${folderMsg} → ${targets.map((t) => WD.userName(t)).join(', ') || '(수신자 없음)'}`);
        return { doc: d, targets, rec };
      });
      return res;
    },

    /* ---------- 계약·서류 만료 알림 (D-30/14/7) ---------- */
    bucket(days) { if (days < 0) return 'EXPIRED'; if (days <= 7) return 'D-7'; if (days <= 14) return 'D-14'; if (days <= 30) return 'D-30'; return null; },
    expiryAlerts(userId = null) {
      const db = WD.db; const out = [];
      db.contracts.forEach((c) => {
        if (c.status !== 'SEALED' || (userId && c.userId !== userId)) return;
        const renewed = db.contracts.some((x) => x.renewedFrom === c.id);
        const days = WD.daysLeft(c.end); const b = wf.bucket(days);
        if (b) out.push({ kind: '계약 종료', refId: c.id, userId: c.userId, title: c.title, end: c.end, days, bucket: b, link: `#/contract/${c.id}`, renewed });
      });
      db.submissions.forEach((s) => {
        if (!s.expiresAt || (userId && s.userId !== userId)) return;
        const u = WD.user(s.userId); if (!u || u.status !== 'ACTIVE') return;
        const days = WD.daysLeft(s.expiresAt); const b = wf.bucket(days);
        const item = db.checklistSets.flatMap((x) => x.items).find((i) => i.code === s.itemCode);
        if (b) out.push({ kind: '서류 유효기간', refId: s.id, userId: s.userId, title: `${item?.name || s.itemCode} (${u.name})`, end: s.expiresAt, days, bucket: b, link: '#/checklist' });
      });
      return out.sort((a, b) => a.days - b.days);
    },
    /** 로그인 시 임계값 도달 알림 자동 발송 (중복 방지 키) */
    autoNotify() {
      WD.tx((db) => {
        wf.expiryAlerts().forEach((a) => {
          const key = `${a.refId}:${a.bucket}`;
          if (db.alertSent.includes(key)) return;
          db.alertSent.push(key);
          const title = `[${a.bucket === 'EXPIRED' ? '만료' : a.bucket}] ${a.kind}: ${a.title}`;
          const body = `만료일 ${a.end} (${a.days < 0 ? Math.abs(a.days) + '일 지남' : 'D-' + a.days})${a.kind === '계약 종료' ? ' · 재계약/갱신 초안을 준비하세요.' : ' · 갱신 서류 제출이 필요합니다.'}`;
          WD.ceos().forEach((c) => WD.notify(c.id, { title, body, link: a.link, type: 'EXPIRY' }));
          if (a.userId) WD.notify(a.userId, { title, body, link: a.link, type: 'EXPIRY' });
        });
      });
    },

    /* ---------- 필수 서류 체크리스트 상태 ---------- */
    SUB_STATUS: { MISSING: { label: '미제출', cls: 'st-missing' }, REVIEW: { label: '검토 중', cls: 'st-pending' }, REVISION: { label: '보완 대기', cls: 'st-revision' }, DONE: { label: '완료', cls: 'st-approved' }, EXPIRED: { label: '기간 만료', cls: 'st-revision' } },
    submissionStatus(userId, item) {
      const db = WD.db;
      if (item.source === 'contract') {
        const kind = item.code === 'emp_contract' ? '근로' : '위촉';
        const cs = db.contracts.filter((c) => c.userId === userId && c.kind === kind);
        if (cs.some((c) => c.status === 'SEALED' && WD.daysLeft(c.end) >= 0)) return { st: 'DONE', ref: cs.find((c) => c.status === 'SEALED') };
        if (cs.some((c) => c.status === 'SIGNED')) return { st: 'REVIEW', ref: cs.find((c) => c.status === 'SIGNED') };
        return { st: 'MISSING', ref: cs[0] };
      }
      const s = db.submissions.filter((x) => x.userId === userId && x.itemCode === item.code).pop();
      if (!s) return { st: 'MISSING' };
      const d = db.documents.find((x) => x.id === s.docId);
      if (!d) return { st: 'MISSING', sub: s };
      if (s.expiresAt && WD.daysLeft(s.expiresAt) < 0) return { st: 'EXPIRED', sub: s, doc: d };
      const st = { APPROVED: 'DONE', PENDING: 'REVIEW', RESUBMITTED: 'REVIEW', REVISION_REQUIRED: 'REVISION', DRAFT: 'MISSING' }[d.status] || 'MISSING';
      return { st, sub: s, doc: d };
    },
    checklistFor(user) { return WD.db.checklistSets.find((s) => s.empType === user.empType) || WD.db.checklistSets[0]; },
  };
  WD.wf = wf;
})();
