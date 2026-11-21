// 인사 · 퇴사 확정 (대표 전용)
import { Router } from 'express';
import { withUser } from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';

const r = Router();
r.use(requireRole('ADMIN'));

// 퇴사 전 점검: 미결 문서 + 보관 이관 대상 미리보기
r.get('/:id/resign-preview', async (req, res, next) => {
  try {
    const data = await withUser(req.user, async (c) => {
      const open = await c.query(
        `SELECT d.id, d.title, d.status, (d.owner_id = $1) AS is_owner FROM app.documents d JOIN app.folders f ON f.id = d.folder_id
          WHERE (d.owner_id = $1 OR d.assignee_id = $1) AND d.status <> 'APPROVED' AND f.name <> '인사기록·제출서류'`, [req.params.id]);
      const counts = await c.query(
        `SELECT (SELECT count(*) FROM app.contracts WHERE user_id = $1) AS contracts,
                (SELECT count(*) FROM app.attendance WHERE user_id = $1) AS attendance,
                (SELECT count(*) FROM app.sessions WHERE user_id = $1 AND revoked_at IS NULL) AS sessions`, [req.params.id]);
      return { open: open.rows, ...counts.rows[0] };
    });
    res.json(data);
  } catch (e) { next(e); }
});

// 퇴사 확정: 인수인계 적용 → 프로시저(계정 차단·세션 회수·권한 회수·보관 이관·감사) → 실시간 강제 종료
r.post('/:id/resign', async (req, res, next) => {
  try {
    const { transfers = [], date, reason, checklist = [] } = req.body;
    if (checklist.length < 4 || checklist.some((x) => !x)) return res.status(400).json({ error: '퇴사 체크리스트를 모두 확인하세요.' });
    await withUser(req.user, async (c) => {
      for (const { documentId, to } of transfers) {
        const { rows: [d] } = await c.query(
          `UPDATE app.documents SET owner_id = CASE WHEN owner_id = $2 THEN $3 ELSE owner_id END,
                                    assignee_id = CASE WHEN assignee_id = $2 THEN $3 ELSE assignee_id END, updated_at = now()
            WHERE id = $1 RETURNING title`, [documentId, req.params.id, to]);
        await c.query('INSERT INTO app.document_recipients (document_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [documentId, to]);
        await audit(req, { action: 'RESIGN_HANDOVER', targetType: 'document', targetId: documentId, targetName: d?.title, detail: `→ ${to}` }, c);
      }
      // 미결 문서가 남아 있으면 프로시저가 예외 → 전체 롤백
      await c.query('CALL app.confirm_resignation($1, $2, $3, $4)', [req.params.id, date, reason, process.env.VAULT_KEY]);
    });
    // 실시간 채널(WebSocket/SSE)에 강제 로그아웃 이벤트 발행 — 열린 탭 즉시 차단
    req.app.get('realtime')?.toUser(req.params.id, { type: 'FORCE_LOGOUT', reason: '퇴사 처리되어 접근 권한이 회수되었습니다.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// 보관 DB 열람 (wd_vault 롤로 전환, 복호화는 서버에서만)
r.get('/vault/records', async (req, res, next) => {
  try {
    const rows = await withUser(req.user, async (c) => {
      const q = await c.query(`SELECT id, user_id, user_name, kind, title, retain_until, legal_basis, moved_at, pgp_sym_decrypt(payload_enc, $1)::jsonb AS payload FROM vault.records WHERE destroyed_at IS NULL ORDER BY moved_at DESC`, [process.env.VAULT_KEY]);
      return q.rows;
    }, { vault: true });
    await audit(req, { action: 'VAULT_VIEW', targetType: 'vault', detail: `${rows.length}건 조회` });
    res.json(rows);
  } catch (e) { next(e); }
});

export default r;
