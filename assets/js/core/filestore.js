/* =========================================================================
 * 파일 저장소 (MVP: IndexedDB) — 운영: 비공개 오브젝트 스토리지(S3/Supabase Storage)
 * 직원 브라우저에는 원본 URL을 절대 노출하지 않고, 대표만 서명 URL(60초)을 발급받는 구조를
 * 흉내 냅니다. (server/src/routes/files.js 참고)
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const DBN = 'wd_files_v1', STORE = 'blobs';
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode); const st = tx.objectStore(STORE);
      const req = fn(st);
      tx.oncomplete = () => res(req?.result);
      tx.onerror = () => rej(tx.error);
    });
  };
  WD.files = {
    /** @returns {Promise<string>} fileId */
    async put(blob, meta = {}) {
      const id = WD.uid('file');
      await run('readwrite', (st) => st.put({ blob, name: meta.name || 'file', type: blob.type || meta.type || 'application/octet-stream', size: blob.size, at: WD.now() }, id));
      return id;
    },
    async get(id) { if (!id) return null; return run('readonly', (st) => st.get(id)); },
    async del(id) { return run('readwrite', (st) => st.delete(id)); },
    async clear() { return run('readwrite', (st) => st.clear()); },
  };
})();
