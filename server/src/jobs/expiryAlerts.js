// 계약 종료 · 서류 유효기간 만료 알림 (D-30 / D-14 / D-7) — 매일 07:00 KST
import cron from 'node-cron';
import { pool } from '../db.js';

export async function notify(client, userId, { type, title, body = '', link = '', documentId = null }) {
  await client.query(`INSERT INTO app.notifications (user_id, type, title, body, link, document_id) VALUES ($1,$2,$3,$4,$5,$6)`, [userId, type, title, body, link, documentId]);
}

export async function runExpiryAlerts() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: ceos } = await client.query(`SELECT id FROM app.users WHERE role = 'ADMIN' AND status = 'ACTIVE'`);
    const { rows } = await client.query(`SELECT * FROM app.v_expiring`);
    let sent = 0;
    for (const a of rows) {
      const ins = await client.query(
        `INSERT INTO app.expiry_alerts_sent (ref_type, ref_id, bucket) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`,
        [a.ref_type, a.ref_id, a.bucket]);
      if (!ins.rowCount) continue; // 이미 보낸 버킷
      const title = `[${a.bucket}] ${a.ref_type === 'contract' ? '계약 종료' : '서류 유효기간'}: ${a.title}`;
      const body = `만료일 ${a.end_date.toISOString().slice(0, 10)} · ${a.ref_type === 'contract' ? '재계약/갱신 초안을 준비하세요.' : '갱신 서류 제출이 필요합니다.'}`;
      const link = a.ref_type === 'contract' ? `#/contract/${a.ref_id}` : '#/checklist';
      for (const c of ceos) await notify(client, c.id, { type: 'EXPIRY', title, body, link });
      await notify(client, a.user_id, { type: 'EXPIRY', title, body, link });
      sent++;
    }
    await client.query(`INSERT INTO audit.logs (role, action, detail) VALUES ('SYSTEM', 'EXPIRY_ALERT', $1)`, [`만료 알림 ${sent}건 발송`]);
    await client.query('COMMIT');
    return sent;
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

if (process.argv[1]?.endsWith('expiryAlerts.js')) {
  cron.schedule('0 7 * * *', () => runExpiryAlerts().then((n) => console.log(`[expiry] ${n}건`)), { timezone: 'Asia/Seoul' });
  console.log('[expiry] 매일 07:00 (Asia/Seoul) 만료 알림 스케줄 등록');
}
