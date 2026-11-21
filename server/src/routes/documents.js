// 문서 버전 · 워크플로우 전이 · 원클릭 발송
import { Router } from 'express';
import { withUser } from '../db.js';
import { audit } from '../middleware/audit.js';
import { notify } from '../jobs/expiryAlerts.js';

const r = Router();

// 열람 (RLS가 권한 밖 문서를 숨김)
r.get('/:id', async (req, res, next) => {
  try {
    const out = await withUser(req.user, async (c) => {
      const { rows } = await c.query(`SELECT d.*, app.doc_access(d) AS access FROM app.documents d WHERE d.id = $1`, [req.params.id]);
      if (!rows[0]) return null;
      const v = await c.query(`SELECT version, content_json, note, author_id, created_at FROM app.document_versions WHERE document_id = $1 ORDER BY version DESC LIMIT 1`, [req.params.id]);
      await audit(req, { action: 'DOC_VIEW', targetType: 'document', targetId: rows[0].id, targetName: rows[0].title, detail: `v${rows[0].current_version} · ${rows[0].access}` }, c);
      return { ...rows[0], latest: v.rows[0] };
    });
    out ? res.json(out) : res.status(404).end();
  } catch (e) { next(e); }
});

// 새 버전 저장 (v+1) — 잠금 문서는 DB 트리거가 거부, 편집 권한은 RLS ver_insert 정책이 검증
r.post('/:id/versions', async (req, res, next) => {
  try {
    const { content, storageKey, note } = req.body;
    const v = await withUser(req.user, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO app.document_versions (document_id, version, author_id, note, content_json, storage_key)
         SELECT d.id, d.current_version + 1, $2, $3, $4, $5 FROM app.documents d WHERE d.id = $1
         RETURNING version`, [req.params.id, req.user.id, note, content ?? null, storageKey ?? null]);
      if (!rows[0]) throw Object.assign(new Error('편집 권한이 없습니다.'), { status: 403 });
      await audit(req, { action: 'DOC_EDIT', targetType: 'document', targetId: req.params.id, detail: `v${rows[0].version - 1} → v${rows[0].version} · ${note || ''}` }, c);
      return rows[0].version;
    });
    res.json({ version: v });
  } catch (e) { next(e); }
});

// 상태 전이 (전이 규칙·대표 권한·재제출 버전 검증은 DB 트리거 app.check_transition)
r.post('/:id/transition', async (req, res, next) => {
  try {
    const { to, reason } = req.body;
    const ev = await withUser(req.user, async (c) => {
      const { rows: [d] } = await c.query('SELECT id, title, status, owner_id, assignee_id FROM app.documents WHERE id = $1', [req.params.id]);
      if (!d) throw Object.assign(new Error('문서 없음'), { status: 404 });
      const { rows: [e] } = await c.query(
        `INSERT INTO app.workflow_events (document_id, from_status, to_status, actor_id, reason, version) VALUES ($1,$2,$3,$4,$5,0) RETURNING *`,
        [d.id, d.status, to, req.user.id, reason || null]);
      const action = { PENDING: 'WF_SUBMIT', REVISION_REQUIRED: 'WF_REVISION', RESUBMITTED: 'WF_RESUBMIT', APPROVED: 'WF_APPROVE' }[to];
      await audit(req, { action, targetType: 'document', targetId: d.id, targetName: d.title, detail: `${d.status} → ${to} (v${e.version})${reason ? ' · ' + reason : ''}` }, c);
      if (to === 'REVISION_REQUIRED' || to === 'APPROVED') {
        for (const uid of new Set([d.owner_id, d.assignee_id].filter(Boolean))) await notify(c, uid, { type: to === 'APPROVED' ? 'APPROVED' : 'REVISION', title: `${to === 'APPROVED' ? '최종 승인' : '보완 요청'}: ${d.title}`, body: reason || '', link: `#/doc/${d.id}`, documentId: d.id });
      } else {
        const { rows: ceos } = await c.query(`SELECT id FROM app.users WHERE role = 'ADMIN' AND status = 'ACTIVE'`);
        for (const x of ceos) await notify(c, x.id, { type: 'APPROVAL', title: `${to === 'PENDING' ? '결재 요청' : '재제출'}: ${d.title}`, link: `#/doc/${d.id}`, documentId: d.id });
      }
      return e;
    });
    res.json(ev);
  } catch (e) { next(e); }
});

// 원클릭 발송 — 한 트랜잭션: 상태 전이 + 수신 권한 + 알림 + 발송 이력 + 감사
r.post('/:id/dispatch', async (req, res, next) => {
  try {
    const { presetId, targets: customTargets = [], folderId, message } = req.body;
    const out = await withUser(req.user, async (c) => {
      const { rows: [d] } = await c.query('SELECT * FROM app.documents WHERE id = $1', [req.params.id]);
      if (!d) throw Object.assign(new Error('문서 없음'), { status: 404 });
      const { rows: [p] } = presetId ? await c.query('SELECT * FROM app.dispatch_presets WHERE id = $1', [presetId]) : { rows: [{ name: '직접 선택 발송', action: 'CUSTOM', folder_id: folderId }] };
      let targets = [];
      const active = async (sql, args = []) => (await c.query(`SELECT id FROM app.users WHERE status = 'ACTIVE' AND ${sql}`, args)).rows.map((x) => x.id);
      switch (p.action) {
        case 'SUBMIT_CEO': targets = await active(`role = 'ADMIN'`);
          if (d.status === 'DRAFT' || d.status === 'REVISION_REQUIRED') await c.query(`INSERT INTO app.workflow_events (document_id, from_status, to_status, actor_id, version) VALUES ($1,$2,$3,$4,0)`, [d.id, d.status, d.status === 'DRAFT' ? 'PENDING' : 'RESUBMITTED', req.user.id]);
          break;
        case 'REQUEST_USER': targets = await active('id = $1', [p.target_user_id]); await c.query('UPDATE app.documents SET assignee_id = $2 WHERE id = $1', [d.id, targets[0]]); break;
        case 'SAVE_FOLDER': await c.query('UPDATE app.documents SET folder_id = $2 WHERE id = $1', [d.id, p.folder_id]); targets = await active(`(role = 'ADMIN' OR (SELECT staff_access FROM app.folders WHERE id = $1) <> 'none') AND id <> $2`, [p.folder_id, req.user.id]); break;
        case 'BROADCAST': targets = await active('id <> $1', [req.user.id]); break;
        case 'DEPT': targets = await active('dept = $1 AND id <> $2', [p.dept, req.user.id]); break;
        default: targets = await active('id = ANY($1)', [customTargets]); if (folderId) await c.query('UPDATE app.documents SET folder_id = $2 WHERE id = $1', [d.id, folderId]);
      }
      for (const t of targets) {
        await c.query('INSERT INTO app.document_recipients (document_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [d.id, t]);
        await notify(c, t, { type: p.action === 'SUBMIT_CEO' ? 'APPROVAL' : p.action === 'REQUEST_USER' ? 'SIGN' : 'INFO', title: `${p.name}: ${d.title}`, body: message || '', link: `#/doc/${d.id}`, documentId: d.id });
      }
      await c.query(`INSERT INTO app.dispatches (document_id, preset_name, action, target_user_ids, folder_id, message, version, sender_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [d.id, p.name, p.action, targets, p.folder_id || folderId || null, message || null, d.current_version, req.user.id]);
      await audit(req, { action: 'DISPATCH', targetType: 'document', targetId: d.id, targetName: d.title, detail: `${p.name} → ${targets.length}명` }, c);
      return { targets };
    });
    res.json(out);
  } catch (e) { next(e); }
});

export default r;
