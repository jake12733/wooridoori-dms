// 출결·근태 API — 대표('ceo') 외 직급은 본인 기록만 조회·등록 (RLS + 라우트 이중 체크)
import { Router } from 'express';
import { withUser } from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';

const r = Router();
const TYPES = ['출석', '지각', '병가', '휴가', '대강'];

// 본인 기록 (모든 직급) — 다른 직원 행은 RLS(attend_select)가 반환하지 않음
r.get('/mine', async (req, res, next) => {
  try {
    const rows = await withUser(req.user, (c) => c.query(
      `SELECT id, work_date, clock_in, status, note, approved_at FROM app.attendance WHERE user_id = $1 AND work_date = coalesce($2::date, work_date) ORDER BY clock_in DESC`,
      [req.user.id, req.query.date || null]).then((x) => x.rows));
    res.json(rows);
  } catch (e) { next(e); }
});

// 1초 체크: 오늘 날짜로만 등록, 등록 후 수정·삭제 불가(UPDATE/DELETE 권한 없음)
r.post('/', async (req, res, next) => {
  try {
    const { status, note = '' } = req.body;
    if (!TYPES.includes(status)) return res.status(400).json({ error: '알 수 없는 근태 유형입니다.' });
    if (['병가', '휴가', '대강'].includes(status) && !note.trim()) return res.status(400).json({ error: `${status} 사유를 입력해 주세요.` });
    const row = await withUser(req.user, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO app.attendance (user_id, work_date, clock_in, status, note, updated_by) VALUES ($1, current_date, localtime, $2, $3, $1) RETURNING id, clock_in`,
        [req.user.id, status, note.trim()]);
      await audit(req, { action: 'ATTEND_IN', targetType: 'attendance', targetId: rows[0].id, detail: `${status} ${note}` }, c);
      return rows[0];
    });
    res.json(row);
  } catch (e) { next(e); }
});

// 전 직원 기록·통계 — 대표 전용 (그 외 403 + 차단 기록)
r.get('/stats', requireRole('ceo'), async (req, res, next) => {
  try {
    const month = req.query.month; // 'YYYY-MM'
    const rows = await withUser(req.user, (c) => c.query(
      `SELECT u.id, u.name, u.role,
              count(*) FILTER (WHERE a.status = '출석') AS 출석, count(*) FILTER (WHERE a.status = '지각') AS 지각,
              count(*) FILTER (WHERE a.status = '병가') AS 병가, count(*) FILTER (WHERE a.status = '휴가') AS 휴가,
              count(*) FILTER (WHERE a.status = '대강') AS 대강, count(*) FILTER (WHERE a.approved_at IS NULL) AS pending
         FROM app.users u LEFT JOIN app.attendance a ON a.user_id = u.id AND to_char(a.work_date, 'YYYY-MM') = $1
        WHERE u.status = 'ACTIVE' AND u.role <> 'ceo' GROUP BY u.id ORDER BY u.name`, [month]).then((x) => x.rows));
    res.json(rows);
  } catch (e) { next(e); }
});

// 수정·승인 — 대표 전용
r.patch('/:id', requireRole('ceo'), async (req, res, next) => {
  try {
    await withUser(req.user, (c) => c.query(`SELECT app.ceo_update_attendance($1, $2, $3)`, [req.params.id, req.body.status, req.body.note]));
    await audit(req, { action: 'ATTEND_EDIT', targetType: 'attendance', targetId: req.params.id, detail: `${req.body.status} (수정·승인)` });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
