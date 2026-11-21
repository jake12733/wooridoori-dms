// 감사 로그 기록 — audit.logs 는 INSERT 전용(해시 체인은 DB 트리거가 계산)
import { pool } from '../db.js';

/**
 * @param {import('express').Request} req
 * @param {{action:string, targetType?:string, targetId?:string, targetName?:string, detail?:string, userId?:string, userName?:string, role?:string}} e
 * @param {import('pg').PoolClient} [client]  트랜잭션 안에서 함께 커밋하려면 전달
 */
export async function audit(req, e, client = pool) {
  const u = req.user || {};
  await client.query(
    `INSERT INTO audit.logs (user_id, user_name, role, action, target_type, target_id, target_name, detail, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [e.userId ?? u.id ?? null, e.userName ?? u.name ?? null, e.role ?? u.role ?? null, e.action,
      e.targetType ?? null, e.targetId ?? null, e.targetName ?? null, e.detail ?? null, req.ip, req.get?.('user-agent') ?? null],
  );
}

/** 라우트 단위 자동 기록 미들웨어 */
export const auditRoute = (action, pick = (req) => ({ targetId: req.params.id })) => async (req, _res, next) => {
  try { await audit(req, { action, ...pick(req) }); next(); } catch (e) { next(e); }
};
