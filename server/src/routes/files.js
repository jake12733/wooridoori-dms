// 반출 게이트 — 원본은 비공개 버킷, 직원은 렌더 스트림만, 대표만 60초 서명 URL
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { withUser } from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import { audit } from '../middleware/audit.js';

const s3 = new S3Client({ region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: true });
const BUCKET = process.env.S3_BUCKET; // 퍼블릭 액세스 차단된 비공개 버킷
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });
const r = Router();

/** 문서 최신 버전 + 접근 수준 (RLS 통과한 경우에만 행 반환) */
async function loadVersion(client, docId) {
  const { rows } = await client.query(
    `SELECT d.id, d.title, d.kind, app.doc_access(d) AS access, v.storage_key, v.version
       FROM app.documents d JOIN app.document_versions v ON v.document_id = d.id AND v.version = d.current_version
      WHERE d.id = $1`, [docId]);
  return rows[0];
}

// 업로드 (모든 형식) — 편집 권한 폴더만
r.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const key = `docs/${crypto.randomUUID()}`;
    const sha = crypto.createHash('sha256').update(req.file.buffer).digest();
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype, ServerSideEncryption: 'AES256' }));
    await audit(req, { action: 'DOC_UPLOAD', targetType: 'file', targetName: req.file.originalname, detail: `${req.file.size} bytes` });
    res.json({ storageKey: key, sha256: sha.toString('hex') });
  } catch (e) { next(e); }
});

// 직원/대표 공통: 브라우저 표시용 인라인 스트림 (다운로드 헤더 없음, 캐시 금지)
r.get('/:id/render', async (req, res, next) => {
  try {
    const doc = await withUser(req.user, (c) => loadVersion(c, req.params.id));
    if (!doc || doc.access === 'none') return res.status(404).end();
    await audit(req, { action: 'DOC_VIEW', targetType: 'document', targetId: doc.id, targetName: doc.title, detail: `v${doc.version} render` });
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: doc.storage_key }));
    res.set({
      'Content-Type': obj.ContentType || 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    // 운영 권장: PDF/오피스 문서는 서버에서 이미지 타일 + 사용자 워터마크로 변환 후 전송
    obj.Body.pipe(res);
  } catch (e) { next(e); }
});

// 대표 전용: 원본 반출 (60초 서명 URL)
r.get('/:id/download', requireRole('CEO'), async (req, res, next) => {
  try {
    const doc = await withUser(req.user, (c) => loadVersion(c, req.params.id));
    if (!doc) return res.status(404).end();
    const url = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: BUCKET, Key: doc.storage_key,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(doc.title)}`,
    }), { expiresIn: 60 });
    await audit(req, { action: 'DOC_DOWNLOAD', targetType: 'document', targetId: doc.id, targetName: doc.title, detail: `v${doc.version} 원본 반출` });
    res.json({ url, expiresIn: 60 });
  } catch (e) { next(e); }
});

export default r;
