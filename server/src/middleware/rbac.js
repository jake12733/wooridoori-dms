// 역할 기반 접근 제어
import { audit } from './audit.js';

/** requireRole('CEO') — 실패 시 403 + 감사 로그(차단 기록) */
export const requireRole = (...roles) => async (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) return next();
  const action = req.baseUrl.startsWith('/files') ? 'DOWNLOAD_DENIED' : 'ACCESS_DENIED';
  await audit(req, { action, targetType: req.baseUrl.slice(1), targetId: req.params.id, detail: `${req.method} ${req.originalUrl} (role=${req.user?.role})` }).catch(() => {});
  res.status(403).json({ error: action === 'DOWNLOAD_DENIED' ? '외부 반출(다운로드)은 대표만 가능합니다.' : '권한이 없습니다.' });
};
