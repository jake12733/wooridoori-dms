// 매 요청 세션 재검증 — 퇴사 즉시 차단의 핵심
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { audit } from './audit.js';

export const SESSION_COOKIE = 'wd_sid';
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest();

const IDLE_MS = 30 * 60 * 1000; // 유휴 30분

export async function authRequired(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { rows } = await pool.query(
      `SELECT s.id AS sid, s.revoked_at, s.revoked_reason, s.expires_at, s.last_seen,
              u.id, u.name, u.role, u.status, u.emp_type, u.dept
         FROM app.sessions s JOIN app.users u ON u.id = s.user_id
        WHERE s.token_hash = $1`, [hashToken(token)]);
    const r = rows[0];
    if (!r) return res.status(401).json({ error: '세션이 존재하지 않습니다.' });
    if (r.revoked_at) {
      return res.status(401).json({ error: r.revoked_reason === 'RESIGNED' ? '퇴사 처리되어 접근 권한이 회수되었습니다.' : '세션이 종료되었습니다.', code: 'SESSION_REVOKED' });
    }
    if (new Date(r.expires_at) < new Date() || Date.now() - new Date(r.last_seen) > IDLE_MS) {
      await pool.query(`UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'EXPIRED' WHERE id = $1`, [r.sid]);
      return res.status(401).json({ error: '세션이 만료되었습니다.', code: 'SESSION_EXPIRED' });
    }
    if (r.status !== 'ACTIVE' || r.role === 'RESIGNED') {
      await pool.query(`UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'RESIGNED' WHERE user_id = $1 AND revoked_at IS NULL`, [r.id]);
      await audit(req, { action: 'LOGIN_BLOCKED', userId: r.id, userName: r.name, targetType: 'user', targetId: r.id });
      return res.status(403).json({ error: '계정이 비활성화되었습니다.', code: 'RESIGNED' });
    }
    // last_seen 갱신 (1분 단위로만 쓰기)
    if (Date.now() - new Date(r.last_seen) > 60_000) pool.query('UPDATE app.sessions SET last_seen = now() WHERE id = $1', [r.sid]).catch(() => {});
    req.session = { id: r.sid };
    req.user = { id: r.id, name: r.name, role: r.role, empType: r.emp_type, dept: r.dept };
    next();
  } catch (e) { next(e); }
}
