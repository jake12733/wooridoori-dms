// PostgreSQL 연결 + 요청 단위 RLS 컨텍스트
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 });

/**
 * 요청 사용자 컨텍스트로 트랜잭션 실행.
 * SET LOCAL app.user_id / app.role 이 설정되어 RLS 정책(app.doc_access 등)이 적용됩니다.
 * @param {{id:string, role:string}} user
 * @param {(client: pg.PoolClient) => Promise<any>} fn
 */
export async function withUser(user, fn, { vault = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)`, [user.id, user.role]);
    if (vault) {
      if (user.role !== 'CEO') throw Object.assign(new Error('대표 전용 보관 DB입니다.'), { status: 403 });
      await client.query('SET LOCAL ROLE wd_vault');
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
