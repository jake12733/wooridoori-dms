// 우리두리사회적협동조합 문서관리시스템 — API 서버 진입점 (레퍼런스)
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { pool, withUser } from './db.js';
import { authRequired, SESSION_COOKIE, hashToken } from './middleware/auth.js';
import { audit } from './middleware/audit.js';
import filesRouter from './routes/files.js';
import documentsRouter from './routes/documents.js';
import usersRouter from './routes/users.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      frameSrc: [process.env.RHWP_STUDIO_ORIGIN || "'self'"], // 자체 호스팅 rhwp-studio
      frameAncestors: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

// ---------- 로그인 ----------
app.post('/auth/login', async (req, res) => {
  const { loginId, password } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM app.users WHERE login_id = $1', [loginId]);
  const u = rows[0];
  if (!u || !(await argon2.verify(u.password_hash, String(password || '')))) {
    await audit(req, { action: 'LOGIN_FAIL', targetType: 'user', targetName: loginId });
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  if (u.role === 'RESIGNED' || u.status !== 'ACTIVE') {
    await audit(req, { action: 'LOGIN_BLOCKED', userId: u.id, userName: u.name, targetType: 'user', targetId: u.id, targetName: u.name });
    return res.status(403).json({ error: '퇴사 처리된 계정입니다. 시스템 접근이 차단되었습니다.' });
  }
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO app.sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, now() + interval '8 hours', $3, $4)`,
    [u.id, hashToken(token), req.ip, req.get('user-agent')],
  );
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 8 * 3600e3, path: '/' });
  await audit(req, { action: 'LOGIN', userId: u.id, userName: u.name, role: u.role, targetType: 'user', targetId: u.id });
  res.json({ id: u.id, name: u.name, role: u.role });
});

app.post('/auth/logout', authRequired, async (req, res) => {
  await pool.query(`UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'LOGOUT' WHERE id = $1`, [req.session.id]);
  await audit(req, { action: 'LOGOUT' });
  res.clearCookie(SESSION_COOKIE).json({ ok: true });
});

// ---------- 보호 라우트 ----------
app.use('/files', authRequired, filesRouter);
app.use('/documents', authRequired, documentsRouter);
app.use('/users', authRequired, usersRouter);

app.get('/me', authRequired, (req, res) => res.json(req.user));
app.get('/health', (_req, res) => res.json({ ok: true }));
// 프론트엔드 정적 파일 (서버 소스·docs는 노출하지 않음)
const FRONT = new URL('../../', import.meta.url).pathname;
app.use('/assets', express.static(FRONT + 'assets', { maxAge: '1h' }));
app.get('/', (_req, res) => res.set('Cache-Control', 'no-store').sendFile(FRONT + 'index.html'));

// 오류 처리 (내부 메시지 노출 최소화)
app.use((err, _req, res, _next) => { console.error(err); res.status(err.status || 500).json({ error: err.status ? err.message : '서버 오류가 발생했습니다.' }); });

export { withUser };
const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`[우리두리 DMS] API listening on :${port}`));
