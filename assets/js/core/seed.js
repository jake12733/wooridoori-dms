/* =========================================================================
 * 샘플 데이터 (데모용) — 날짜는 "오늘" 기준 상대값으로 생성되어
 * 언제 열어도 D-30/D-14/D-7 만료 알림, 이번 달 근태, 최근 6개월 매출이 보입니다.
 * 모든 데모 계정 비밀번호: 1234
 * ========================================================================= */
(function () {
  const WD = window.WD;
  const SCHEMA_VERSION = 3;

  // 결정적 의사난수 (같은 날짜/사용자면 같은 값)
  const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

  const sheet = (name, aoa, opts = {}) => {
    const rows = {};
    aoa.forEach((r, i) => {
      const cells = {};
      r.forEach((v, j) => {
        if (v === null || v === undefined || v === '') return;
        cells[j] = { text: String(v) };
        if (i === 0 && opts.header !== false) cells[j].style = 0;
      });
      rows[i] = { cells };
    });
    rows.len = Math.max(aoa.length + 20, 60);
    const cols = { len: 26 }; (opts.widths || []).forEach((w, i) => (cols[i] = { width: w }));
    return [{ name, freeze: 'A2', styles: [{ font: { bold: true }, bgcolor: '#e6f0ea', align: 'center' }], merges: [], rows, cols }];
  };

  const signSvg = (name) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="90"><path d="M20 70 C 80 40, 140 85, 240 52" stroke="#1d2a26" stroke-width="2" fill="none" opacity=".45"/><text x="40" y="60" font-family="'Nanum Pen Script','Brush Script MT',cursive" font-size="44" fill="#1d2a26" transform="rotate(-6 120 50)">${name}</text></svg>`);

  WD.signSvg = signSvg;

  async function buildSeed() {
    const today = new Date();
    const T = (n) => WD.addDays(n, today);
    const at = (n, h = 10, m = 0) => { const d = new Date(today); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const pw = await WD.sha256('wooridoori::1234');

    const users = [
      { id: 'u_ceo', loginId: 'ceo', name: '김우리', role: 'CEO', title: '대표이사', empType: '정규직', dept: '경영지원', joinedAt: '2019-03-02', phone: '010-1234-0001', workStart: '09:00', workEnd: '18:00' },
      { id: 'u_lee', loginId: 'teacher1', name: '이두리', role: 'STAFF', title: '선생님', empType: '정규직', dept: '교육팀', joinedAt: '2022-03-01', phone: '010-2345-0002', workStart: '09:00', workEnd: '18:00' },
      { id: 'u_kang', loginId: 'teacher4', name: '강서준', role: 'STAFF', title: '선생님', empType: '정규직', dept: '교육팀', joinedAt: '2023-09-01', phone: '010-2345-0006', workStart: '09:00', workEnd: '18:00' },
      { id: 'u_park', loginId: 'teacher2', name: '박하늘', role: 'STAFF', title: '강사', empType: '위촉강사', dept: '방과후팀', joinedAt: '2024-03-04', phone: '010-3456-0003', workStart: '13:00', workEnd: '18:00' },
      { id: 'u_choi', loginId: 'teacher3', name: '최은솔', role: 'STAFF', title: '강사', empType: '위촉강사', dept: '방과후팀', joinedAt: '2025-03-03', phone: '010-4567-0005', workStart: '13:00', workEnd: '18:00' },
      { id: 'u_jung', loginId: 'admin1', name: '정민지', role: 'STAFF', title: '행정실장', empType: '정규직', dept: '경영지원', joinedAt: '2021-05-10', phone: '010-5678-0004', workStart: '09:00', workEnd: '18:00' },
      { id: 'u_han', loginId: 'former', name: '한지훈', role: 'RESIGNED', title: '강사', empType: '위촉강사', dept: '방과후팀', joinedAt: '2023-03-02', resignedAt: at(-52, 18), phone: '010-6789-0007', workStart: '13:00', workEnd: '18:00' },
    ].map((u) => ({ ...u, pwHash: pw, status: u.role === 'RESIGNED' ? 'RESIGNED' : 'ACTIVE', createdAt: at(-400) }));

    const folders = [
      { id: 'f_hr', name: '인사', parentId: null, staffAccess: 'none', color: '#2f7d62' },
      { id: 'f_hr_emp', name: '근로계약', parentId: 'f_hr', staffAccess: 'none', legal: true },
      { id: 'f_hr_inst', name: '위촉계약', parentId: 'f_hr', staffAccess: 'none', legal: true },
      { id: 'f_hr_rec', name: '인사기록·제출서류', parentId: 'f_hr', staffAccess: 'none', legal: true },
      { id: 'f_hr_cert', name: '증명서·확인서', parentId: 'f_hr', staffAccess: 'view' },
      { id: 'f_doc', name: '문서', parentId: null, staffAccess: 'edit', color: '#3c6fb4' },
      { id: 'f_doc_notice', name: '공문·안내문', parentId: 'f_doc', staffAccess: 'edit' },
      { id: 'f_doc_report', name: '보고서', parentId: 'f_doc', staffAccess: 'edit' },
      { id: 'f_doc_attend', name: '출석부', parentId: 'f_doc', staffAccess: 'edit' },
      { id: 'f_doc_minutes', name: '회의록', parentId: 'f_doc', staffAccess: 'view' },
      { id: 'f_acc', name: '회계', parentId: null, staffAccess: 'view', color: '#c98a1e' },
      { id: 'f_acc_sales', name: '매출', parentId: 'f_acc', staffAccess: 'none' },
      { id: 'f_acc_exp', name: '지출·증빙', parentId: 'f_acc', staffAccess: 'edit', legal: true },
      { id: 'f_acc_settle', name: '정산', parentId: 'f_acc', staffAccess: 'edit', legal: true },
      { id: 'f_sec', name: '보안', parentId: null, staffAccess: 'none', color: '#b2453a' },
      { id: 'f_sec_pledge', name: '보안서약', parentId: 'f_sec', staffAccess: 'view' },
      { id: 'f_sec_privacy', name: '개인정보', parentId: 'f_sec', staffAccess: 'none' },
    ];

    /* ---------- 문서 본문 ---------- */
    const attendAoa = [['번호', '이름', '11/3', '11/5', '11/10', '11/12', '11/17', '11/19', '출석일수', '비고'],
      ...['김하준', '이서윤', '박도윤', '최지우', '정시우', '강하은', '윤지호', '임수아'].map((n, i) => {
        const marks = [0, 1, 2, 3, 4, 5].map((k) => (hash(n + k) > 0.12 ? 1 : 0));
        return [i + 1, n, ...marks, `=SUM(C${i + 2}:H${i + 2})`, ''];
      }), ['', '합계', '=SUM(C2:C9)', '=SUM(D2:D9)', '=SUM(E2:E9)', '=SUM(F2:F9)', '=SUM(G2:G9)', '=SUM(H2:H9)', '=SUM(I2:I9)', '1=출석, 0=결석']];
    const settleAoa = [['No', '일자', '항목', '거래처', '금액', '증빙', '비고'],
      [1, '2026-10-02', '교재 구입', '○○문고', 184000, '카드전표', ''], [2, '2026-10-07', '미술 재료', '△△화방', 96500, '세금계산서', ''],
      [3, '2026-10-15', '간식비', '우리마트', 72000, '카드전표', '방과후A·B반'], [4, '2026-10-21', '체험학습 차량', '□□관광', 330000, '세금계산서', ''],
      [5, '2026-10-28', '소모품', '오피스몰', 41800, '카드전표', ''], ['', '', '', '합계', '=SUM(E2:E6)', '', '']];
    const choiExpAoa = [['No', '일자', '항목', '금액', '비고'], [1, '2026-11-04', '공예 재료', 58000, ''], [2, '2026-11-11', '만들기 키트', 112000, '12인분'], ['', '', '합계', '=SUM(D2:D3)', '']];
    const salesAoa = [['월', '위탁교육', '방과후', '보조금', '기타', '합계'], ['2026-07', 12800000, 6400000, 5000000, 300000, '=SUM(B2:E2)'], ['2026-08', 9800000, 7200000, 5000000, 0, '=SUM(B3:E3)'], ['2026-09', 13600000, 7900000, 5000000, 450000, '=SUM(B4:E4)'], ['2026-10', 14200000, 8100000, 5000000, 220000, '=SUM(B5:E5)']];

    const H = {
      notice: `<h1 style="text-align:center">2026 동절기 돌봄 프로그램 안내</h1><p style="text-align:right">우리두리사회적협동조합 교육팀</p><p>학부모님 안녕하십니까. 겨울방학 기간 동안 아래와 같이 동절기 돌봄 프로그램을 운영하오니 많은 참여 바랍니다.</p><h2>1. 운영 개요</h2><ul><li>기간: 2026. 12. 28.(월) ~ 2027. 2. 19.(금)</li><li>시간: 평일 09:00 ~ 17:00</li><li>장소: 우리두리 배움터 1층 활동실</li></ul><h2>2. 프로그램</h2><table><tbody><tr><td><strong>요일</strong></td><td><strong>오전</strong></td><td><strong>오후</strong></td></tr><tr><td>월·수</td><td>독서 토론</td><td>미술 공예</td></tr><tr><td>화·목</td><td>보드게임 수학</td><td>체육 놀이</td></tr><tr><td>금</td><td>과학 실험</td><td>영화 감상</td></tr></tbody></table><h2>3. 신청 방법</h2><p>12월 12일(금)까지 담당 선생님께 신청서를 제출해 주세요.</p>`,
      report: `<h1>11월 활동 결과보고서</h1><p><strong>작성자:</strong> 박하늘 강사 / <strong>반:</strong> 방과후 A반</p><h2>1. 활동 내용</h2><p>11월 한 달간 '가을 생태 관찰' 주제로 총 6회 수업을 진행하였습니다.</p><h2>2. 참여 현황</h2><p>등록 8명, 평균 참여 7명</p><h2>3. 성과 및 개선점</h2><p>아이들의 관찰 일지 작성률이 높았으며, 다음 달에는 발표 활동을 추가할 예정입니다.</p>`,
      minutes: `<h1 style="text-align:center">11월 정기 운영위원회 회의록</h1><table><tbody><tr><td><strong>일시</strong></td><td>2026년 11월 6일 18:30</td><td><strong>장소</strong></td><td>본부 회의실</td></tr><tr><td><strong>참석</strong></td><td colspan="3">김우리, 정민지, 이두리, 강서준 (4명)</td></tr></tbody></table><h2>안건 1. 동절기 프로그램 운영 계획</h2><p>원안 의결. 강사 배치는 12월 첫 주 확정.</p><h2>안건 2. 문서관리시스템 도입</h2><p>전 직원 문서 반출 통제 및 감사 로그 적용에 동의. 12월부터 시행.</p>`,
      pledge: `<h1 style="text-align:center">보안서약서</h1><p>본인은 우리두리사회적협동조합에 근무하면서 취득한 아동·학부모 개인정보 및 조합의 업무상 비밀을 외부에 누설하거나 반출하지 않을 것을 서약합니다.</p><ol><li>업무 문서를 개인 PC·저장매체·메신저로 복사하거나 전송하지 않는다.</li><li>퇴직 시 보유한 모든 자료를 반납하고 인수인계를 완료한다.</li><li>위반 시 관계 법령 및 조합 규정에 따른 책임을 진다.</li></ol><p style="text-align:right">서약자: 이두리 (서명)</p>`,
      plan: `<h1>12월 수업계획서</h1><p><strong>강사:</strong> 최은솔 / <strong>과목:</strong> 창의공예</p><table><tbody><tr><td><strong>주차</strong></td><td><strong>주제</strong></td><td><strong>준비물</strong></td></tr><tr><td>1주</td><td>크리스마스 리스 만들기</td><td>솔방울, 리본</td></tr><tr><td>2주</td><td>나만의 달력</td><td>색지, 스티커</td></tr><tr><td>3주</td><td>펠트 인형</td><td>펠트, 바늘</td></tr><tr><td>4주</td><td>작품 전시회</td><td>-</td></tr></tbody></table>`,
      counsel: `<h1>학부모 상담일지 (초안)</h1><p>상담 일시: 2026-11-18 / 대상: 방과후 B반 학부모 3명</p><p>주요 내용: 수업 태도, 교우 관계, 겨울방학 참여 의사 확인 … (작성 중)</p>`,
      privacy: `<h1>개인정보 처리 현황 (대표 전용)</h1><p>보유 항목: 아동 성명·생년월일·보호자 연락처 / 보유 기간: 프로그램 종료 후 3년</p><p>접근 권한자: 대표, 행정실장</p>`,
      cert: `<h1 style="text-align:center">재직증명서 발급 신청서</h1><p>신청인: 정민지 (행정실장)</p><p>용도: 금융기관 제출 / 매수: 1부</p>`,
    };

    const docs = [];
    const versions = [];
    const wfEvents = [];
    const addDoc = (d, vlist) => {
      docs.push({ recipients: [], assigneeId: null, locked: false, legalHold: false, createdAt: vlist[0].at, ...d, version: vlist.length, updatedAt: vlist[vlist.length - 1].at });
      vlist.forEach((v, i) => versions.push({ id: WD.uid('ver'), docId: d.id, version: i + 1, authorId: v.by || d.ownerId, at: v.at, note: v.note || (i === 0 ? '최초 작성' : '수정'), content: v.content }));
    };
    const ev = (docId, from, to, actorId, atIso, reason = '') => wfEvents.push({ id: WD.uid('wf'), docId, from, to, actorId, reason, at: atIso });

    addDoc({ id: 'd_attend', title: '2026년 11월 방과후A반 출석부', kind: 'sheet', folderId: 'f_doc_attend', ownerId: 'u_park', status: 'APPROVED', locked: true, lockedAt: at(-1, 17) },
      [{ at: at(-9, 15), content: sheet('11월 출석', attendAoa.map((r) => r.slice(0, 6).concat(['', '', '']))) }, { at: at(-2, 16), note: '11/17·19 출석 반영', content: sheet('11월 출석', attendAoa, { widths: [50, 90] }) }]);
    ev('d_attend', 'DRAFT', 'PENDING', 'u_park', at(-2, 16, 10)); ev('d_attend', 'PENDING', 'APPROVED', 'u_ceo', at(-1, 17));

    addDoc({ id: 'd_notice', title: '2026 동절기 돌봄 프로그램 안내문', kind: 'doc', folderId: 'f_doc_notice', ownerId: 'u_lee', status: 'PENDING' }, [{ at: at(-1, 11), content: H.notice }]);
    ev('d_notice', 'DRAFT', 'PENDING', 'u_lee', at(-1, 11, 5));

    addDoc({ id: 'd_report', title: '11월 활동 결과보고서 (방과후A반)', kind: 'doc', folderId: 'f_doc_report', ownerId: 'u_park', status: 'REVISION_REQUIRED', revisionAtVersion: 1 }, [{ at: at(-3, 14), content: H.report }]);
    ev('d_report', 'DRAFT', 'PENDING', 'u_park', at(-3, 14, 5)); ev('d_report', 'PENDING', 'REVISION_REQUIRED', 'u_ceo', at(-2, 10), '참여 인원 회차별 통계표와 활동 사진 2장을 보완해 주세요.');

    addDoc({ id: 'd_settle', title: '2026년 10월 지출 정산표', kind: 'sheet', folderId: 'f_acc_settle', ownerId: 'u_jung', status: 'RESUBMITTED', revisionAtVersion: 1 },
      [{ at: at(-6, 10), content: sheet('10월 정산', settleAoa.slice(0, 5).concat([settleAoa[6]]), { widths: [40, 100, 110, 100, 100, 90] }) }, { at: at(-4, 15), note: '소모품 누락분 추가', content: sheet('10월 정산', settleAoa, { widths: [40, 100, 110, 100, 100, 90] }) }]);
    ev('d_settle', 'DRAFT', 'PENDING', 'u_jung', at(-6, 10, 5)); ev('d_settle', 'PENDING', 'REVISION_REQUIRED', 'u_ceo', at(-5, 9), '10/28 소모품 영수증 금액이 누락되었습니다.'); ev('d_settle', 'REVISION_REQUIRED', 'RESUBMITTED', 'u_jung', at(-4, 15, 5));

    addDoc({ id: 'd_minutes', title: '11월 정기 운영위원회 회의록', kind: 'doc', folderId: 'f_doc_minutes', ownerId: 'u_ceo', status: 'APPROVED', locked: true, lockedAt: at(-14, 20) }, [{ at: at(-15, 20), content: H.minutes }]);
    ev('d_minutes', 'DRAFT', 'APPROVED', 'u_ceo', at(-14, 20));

    addDoc({ id: 'd_pledge_lee', title: '보안서약서 (이두리)', kind: 'doc', folderId: 'f_sec_pledge', ownerId: 'u_lee', status: 'APPROVED', locked: true, lockedAt: at(-200) }, [{ at: at(-201), content: H.pledge }]);
    addDoc({ id: 'd_plan_choi', title: '12월 수업계획서 (창의공예)', kind: 'doc', folderId: 'f_doc_report', ownerId: 'u_choi', status: 'PENDING' }, [{ at: at(-1, 15), content: H.plan }]);
    ev('d_plan_choi', 'DRAFT', 'PENDING', 'u_choi', at(-1, 15, 3));
    addDoc({ id: 'd_counsel_choi', title: '학부모 상담일지 초안 (방과후B반)', kind: 'doc', folderId: 'f_doc_report', ownerId: 'u_choi', status: 'DRAFT' }, [{ at: at(-3, 17), content: H.counsel }]);
    addDoc({ id: 'd_exp_choi', title: '11월 재료비 정산 내역 (최은솔)', kind: 'sheet', folderId: 'f_acc_settle', ownerId: 'u_choi', status: 'PENDING' }, [{ at: at(-2, 13), content: sheet('재료비', choiExpAoa, { widths: [40, 100, 120, 100] }) }]);
    ev('d_exp_choi', 'DRAFT', 'PENDING', 'u_choi', at(-2, 13, 2));
    addDoc({ id: 'd_sales', title: '2026 하반기 매출 현황 (대표 전용)', kind: 'sheet', folderId: 'f_acc_sales', ownerId: 'u_ceo', status: 'APPROVED', locked: true }, [{ at: at(-10), content: sheet('매출', salesAoa, { widths: [80, 110, 110, 110, 90, 120] }) }]);
    addDoc({ id: 'd_privacy', title: '개인정보 처리 현황', kind: 'doc', folderId: 'f_sec_privacy', ownerId: 'u_ceo', status: 'DRAFT' }, [{ at: at(-20), content: H.privacy }]);
    addDoc({ id: 'd_cert', title: '재직증명서 발급 신청 (정민지)', kind: 'doc', folderId: 'f_hr_cert', ownerId: 'u_jung', status: 'DRAFT' }, [{ at: at(-1, 9), content: H.cert }]);

    /* ---------- 필수 서류 체크리스트 ---------- */
    const checklistSets = [
      { id: 'cs_reg', empType: '정규직', items: [
        { code: 'emp_contract', name: '근로계약서', source: 'contract' }, { code: 'resident', name: '주민등록등본' }, { code: 'bank', name: '통장 사본' },
        { code: 'insurance', name: '4대보험 취득 신고 서류' }, { code: 'privacy', name: '개인정보 수집·이용 동의서' }, { code: 'security', name: '보안서약서' },
        { code: 'health', name: '건강진단결과서(보건증)', expiry: true }] },
      { id: 'cs_inst', empType: '위촉강사', items: [
        { code: 'inst_contract', name: '위촉계약서', source: 'contract' }, { code: 'resume', name: '강사 이력서' }, { code: 'license', name: '자격증 사본' },
        { code: 'crime', name: '성범죄 경력 조회 동의서', expiry: true }, { code: 'abuse', name: '아동학대 범죄전력 조회 동의서' }, { code: 'bank', name: '통장 사본' },
        { code: 'privacy', name: '개인정보 수집·이용 동의서' }, { code: 'security', name: '보안서약서' }] },
    ];
    const itemName = (code) => checklistSets.flatMap((s) => s.items).find((i) => i.code === code)?.name || code;
    const submissions = [];
    const sub = (userId, code, status, opt = {}) => {
      let docId = opt.docId;
      if (!docId) {
        docId = `d_sub_${userId}_${code}`;
        const u = users.find((x) => x.id === userId);
        addDoc({ id: docId, title: `${itemName(code)} (${u.name})`, kind: 'doc', folderId: 'f_hr_rec', ownerId: userId, status, locked: status === 'APPROVED', revisionAtVersion: status === 'REVISION_REQUIRED' ? 1 : undefined },
          [{ at: at(opt.d ?? -30, 10), content: `<h2>${itemName(code)}</h2><p>[샘플 제출본] ${u.name} / 제출일 ${T(opt.d ?? -30)}</p><p>실제 운영 시 스캔본(PDF·이미지)이 첨부됩니다.</p>` }]);
        ev(docId, 'DRAFT', 'PENDING', userId, at(opt.d ?? -30, 10, 1));
        if (status === 'APPROVED') ev(docId, 'PENDING', 'APPROVED', 'u_ceo', at((opt.d ?? -30) + 1, 9));
        if (status === 'REVISION_REQUIRED') ev(docId, 'PENDING', 'REVISION_REQUIRED', 'u_ceo', at((opt.d ?? -30) + 1, 9), opt.reason || '사본이 흐려 식별이 어렵습니다. 다시 스캔해 제출해 주세요.');
      }
      submissions.push({ id: WD.uid('sub'), userId, itemCode: code, docId, expiresAt: opt.expiresAt || null });
    };
    ['resident', 'bank', 'insurance', 'privacy'].forEach((c) => sub('u_lee', c, 'APPROVED', { d: -300 }));
    sub('u_lee', 'security', 'APPROVED', { docId: 'd_pledge_lee' });
    sub('u_lee', 'health', 'APPROVED', { d: -340, expiresAt: T(24) });
    ['resident', 'bank', 'insurance', 'privacy', 'security'].forEach((c) => sub('u_kang', c, 'APPROVED', { d: -380 }));
    sub('u_kang', 'health', 'APPROVED', { d: -160, expiresAt: T(200) });
    sub('u_jung', 'resident', 'APPROVED', { d: -500 }); sub('u_jung', 'privacy', 'APPROVED', { d: -500 });
    sub('u_jung', 'bank', 'PENDING', { d: -2 }); sub('u_jung', 'security', 'REVISION_REQUIRED', { d: -6, reason: '서약서 2쪽 서명 누락' });
    ['resume', 'license', 'bank', 'privacy'].forEach((c) => sub('u_park', c, 'APPROVED', { d: -250 }));
    sub('u_park', 'crime', 'APPROVED', { d: -353, expiresAt: T(12) });
    sub('u_park', 'abuse', 'PENDING', { d: -1 });
    ['resume', 'bank'].forEach((c) => sub('u_choi', c, 'APPROVED', { d: -260 }));
    sub('u_choi', 'license', 'REVISION_REQUIRED', { d: -4, reason: '자격증 유효기간이 보이지 않습니다. 앞·뒷면 모두 제출해 주세요.' });
    sub('u_choi', 'crime', 'APPROVED', { d: -215, expiresAt: T(150) });

    /* ---------- 계약서 ---------- */
    const contractBase = { place: '우리두리 배움터 (서울시 ○○구 ○○로 12)', createdAt: at(-330), locked: true, status: 'SEALED' };
    const contracts = [
      { ...contractBase, id: 'c_lee', kind: '근로', userId: 'u_lee', title: '근로계약서 (이두리)', start: T(-337), end: T(28), duties: '아동 돌봄 및 교육 프로그램 운영', workDays: '월~금 (주 5일)', workHours: '09:00~18:00 (휴게 12:00~13:00)', payType: '월급', pay: 2650000, payDay: '매월 10일', employeeSign: signSvg('이두리'), employeeSignedAt: at(-336), sealedAt: at(-336, 15), folderId: 'f_hr_emp' },
      { ...contractBase, id: 'c_jung', kind: '근로', userId: 'u_jung', title: '근로계약서 (정민지)', start: T(-175), end: T(190), duties: '행정·회계 실무 총괄', workDays: '월~금 (주 5일)', workHours: '09:00~18:00 (휴게 12:00~13:00)', payType: '월급', pay: 3100000, payDay: '매월 10일', employeeSign: signSvg('정민지'), employeeSignedAt: at(-175), sealedAt: at(-175, 15), folderId: 'f_hr_emp' },
      { ...contractBase, id: 'c_park', kind: '위촉', userId: 'u_park', title: '위촉계약서 (박하늘)', start: T(-352), end: T(13), duties: '방과후 생태·과학 강의', workDays: '월·수·금', workHours: '14:00~17:00', payType: '강의료(시간당)', pay: 45000, payDay: '익월 5일 (3.3% 원천징수)', employeeSign: signSvg('박하늘'), employeeSignedAt: at(-352), sealedAt: at(-352, 15), folderId: 'f_hr_inst' },
      { ...contractBase, id: 'c_choi', kind: '위촉', userId: 'u_choi', title: '위촉계약서 (최은솔)', start: T(-359), end: T(6), duties: '방과후 창의공예 강의', workDays: '화·목', workHours: '14:00~17:00', payType: '강의료(시간당)', pay: 42000, payDay: '익월 5일 (3.3% 원천징수)', employeeSign: signSvg('최은솔'), employeeSignedAt: at(-359), sealedAt: at(-359, 15), folderId: 'f_hr_inst' },
      { id: 'c_kang', kind: '근로', userId: 'u_kang', title: '근로계약서 (강서준) 2026 갱신', start: T(-20), end: T(345), place: contractBase.place, duties: '초등 돌봄교실 운영', workDays: '월~금 (주 5일)', workHours: '09:00~18:00 (휴게 12:00~13:00)', payType: '월급', pay: 2550000, payDay: '매월 10일', status: 'SENT', locked: false, createdAt: at(-21), folderId: 'f_hr_emp' },
    ];

    /* ---------- 근태 (지난달 + 이번 달 어제까지) ---------- */
    const attendance = [];
    const staff = users.filter((u) => u.status === 'ACTIVE' && u.role === 'STAFF');
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    for (let d = new Date(start); d < new Date(today.getFullYear(), today.getMonth(), today.getDate()); d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); if (dow === 0 || dow === 6) continue;
      const date = WD.ymd(d);
      staff.forEach((u) => {
        if (u.empType === '위촉강사') {
          const days = u.id === 'u_park' ? [1, 3, 5] : [2, 4];
          if (!days.includes(dow)) return;
        }
        const r = hash(u.id + date);
        const [sh, sm] = u.workStart.split(':').map(Number); const [eh, em] = u.workEnd.split(':').map(Number);
        const t = (h, m) => `${WD.pad(Math.floor((h * 60 + m) / 60))}:${WD.pad((h * 60 + m) % 60)}`;
        let status = '근무', inT = t(sh, sm - Math.floor(hash(date + u.id + 'i') * 14)), outT = t(eh, em + Math.floor(hash(date + u.id + 'o') * 20)), note = '', subFor = null;
        if (r > 0.95) { status = '휴가'; inT = outT = ''; note = '연차'; }
        else if (r > 0.92) { status = '병가'; inT = outT = ''; note = '감기 몸살'; }
        else if (r > 0.86) { status = '지각'; inT = t(sh, sm + 12 + Math.floor(hash(date + 'l') * 30)); note = '교통 지연'; }
        else if (r > 0.83) { status = '조퇴'; outT = t(eh - 2, em + Math.floor(hash(date + 'e') * 50)); note = '병원 진료'; }
        else if (r > 0.80 && u.dept !== '경영지원') { status = '대강'; const others = staff.filter((o) => o.id !== u.id && o.dept !== '경영지원'); subFor = others[Math.floor(hash(date + u.id + 's') * others.length)].id; note = '대체 수업'; }
        attendance.push({ id: WD.uid('att'), userId: u.id, date, in: inT, out: outT, status, note, subFor });
      });
    }

    /* ---------- 매출·지출 (최근 6개월) ---------- */
    const finance = [];
    for (let k = 5; k >= 0; k--) {
      const m = WD.monthKey(new Date(today.getFullYear(), today.getMonth() - k, 1));
      const f = (base, key) => Math.round((base * (0.85 + hash(m + key) * 0.3)) / 10000) * 10000;
      const partial = k === 0 ? Math.min(1, today.getDate() / 30) : 1;
      [['매출', '위탁교육 수입', 12500000], ['매출', '방과후 프로그램', 7400000], ['매출', '지자체 보조금', 5000000], ['매출', '기타 수입', 350000],
        ['지출', '인건비', 11800000], ['지출', '강사료', 4200000], ['지출', '교재·재료비', 1900000], ['지출', '임차료', 2200000], ['지출', '운영비', 1600000]]
        .forEach(([type, category, base]) => finance.push({ id: WD.uid('fin'), month: m, type, category, amount: Math.round(f(base, category) * (category === '임차료' || category === '지자체 보조금' ? 1 : partial) / 10000) * 10000, memo: k === 0 ? '진행 중(월중)' : '' }));
    }

    const launchers = [
      { id: 'l1', name: '우리두리 블로그', url: 'https://blog.naver.com', category: '홍보', color: '#03c75a' },
      { id: 'l2', name: '인스타그램', url: 'https://www.instagram.com', category: '홍보', color: '#d6249f' },
      { id: 'l3', name: '홈택스', url: 'https://www.hometax.go.kr', category: '업무 포털', color: '#1d4f91' },
      { id: 'l4', name: '4대사회보험 정보연계센터', url: 'https://www.4insure.or.kr', category: '업무 포털', color: '#0f7bbf' },
      { id: 'l5', name: '협동조합 홈페이지', url: 'https://www.coop.go.kr', category: '기관', color: '#2f7d62' },
      { id: 'l6', name: '사회적기업 통합정보시스템', url: 'https://www.seis.or.kr', category: '기관', color: '#6a4fb3' },
      { id: 'l7', name: '나라장터 (입찰)', url: 'https://www.g2b.go.kr', category: '거래처', color: '#c0392b' },
      { id: 'l8', name: 'e나라도움 (보조금)', url: 'https://www.gosims.go.kr', category: '거래처', color: '#e08a1e' },
      { id: 'l9', name: '구글 드라이브', url: 'https://drive.google.com', category: '업무 포털', color: '#4285f4' },
    ];

    const T_ = {
      report: `<h1>활동 결과보고서</h1><table><tbody><tr><td><strong>작성자</strong></td><td>　</td><td><strong>작성일</strong></td><td>　</td></tr><tr><td><strong>프로그램</strong></td><td colspan="3">　</td></tr></tbody></table><h2>1. 활동 개요</h2><p>(기간, 대상, 회차)</p><h2>2. 활동 내용</h2><p>　</p><h2>3. 참여 현황</h2><p>　</p><h2>4. 성과 및 개선점</h2><p>　</p><h2>5. 첨부</h2><p>활동 사진, 참여자 명단</p>`,
      notice: `<p style="text-align:right">우리두리사회적협동조합</p><h1 style="text-align:center">가정통신문</h1><p>학부모님 안녕하십니까.</p><p>(안내 내용을 입력하세요)</p><h2>1. 일시</h2><p>　</p><h2>2. 장소</h2><p>　</p><h2>3. 문의</h2><p>담당: ○○○ 선생님 (02-000-0000)</p><p style="text-align:center">2026년 　월 　일</p><p style="text-align:center"><strong>우리두리사회적협동조합 대표</strong></p>`,
      confirm: `<h1 style="text-align:center">재직(경력) 확인서</h1><table><tbody><tr><td><strong>성명</strong></td><td>　</td><td><strong>생년월일</strong></td><td>　</td></tr><tr><td><strong>소속</strong></td><td>　</td><td><strong>직위</strong></td><td>　</td></tr><tr><td><strong>재직기간</strong></td><td colspan="3">20　. 　. 　. ~ 현재</td></tr><tr><td><strong>용도</strong></td><td colspan="3">　</td></tr></tbody></table><p>위 사람은 우리 조합에 재직(근무)하였음을 확인합니다.</p><p style="text-align:center">2026년 　월 　일</p><p style="text-align:center"><strong>우리두리사회적협동조합 대표 김우리 (인)</strong></p>`,
      minutes: `<h1 style="text-align:center">회의록</h1><table><tbody><tr><td><strong>일시</strong></td><td>　</td><td><strong>장소</strong></td><td>　</td></tr><tr><td><strong>참석자</strong></td><td colspan="3">　</td></tr></tbody></table><h2>안건</h2><ol><li>　</li></ol><h2>논의 내용</h2><p>　</p><h2>결정 사항 및 담당</h2><p>　</p>`,
      plan: `<h1>강사 수업계획서</h1><p><strong>강사:</strong> 　 / <strong>과목:</strong> 　 / <strong>대상:</strong> 　</p><table><tbody><tr><td><strong>주차</strong></td><td><strong>주제</strong></td><td><strong>활동 내용</strong></td><td><strong>준비물</strong></td></tr><tr><td>1주</td><td>　</td><td>　</td><td>　</td></tr><tr><td>2주</td><td>　</td><td>　</td><td>　</td></tr><tr><td>3주</td><td>　</td><td>　</td><td>　</td></tr><tr><td>4주</td><td>　</td><td>　</td><td>　</td></tr></tbody></table>`,
      participation: `<h1 style="text-align:center">프로그램 참여 확인서</h1><p>성명: 　　　　 (학년/반: 　　)</p><p>프로그램명: 　</p><p>참여기간: 　</p><p>위 학생은 상기 프로그램에 성실히 참여하였음을 확인합니다.</p><p style="text-align:center">우리두리사회적협동조합 대표 (인)</p>`,
    };
    const attendTpl = sheet('출석부', [['번호', '이름', '1회', '2회', '3회', '4회', '5회', '6회', '7회', '8회', '출석일수'], ...Array.from({ length: 12 }, (_, i) => [i + 1, '', '', '', '', '', '', '', '', '', `=SUM(C${i + 2}:J${i + 2})`])], { widths: [50, 90] });
    const expenseTpl = sheet('지출결의서', [['No', '일자', '계정과목', '적요', '거래처', '금액', '증빙'], ...Array.from({ length: 8 }, (_, i) => [i + 1, '', '', '', '', '', '']), ['', '', '', '', '합계', '=SUM(F2:F9)', '']], { widths: [40, 90, 90, 160, 100, 100, 80] });
    const templates = [
      { id: 'tpl_report', category: '보고서', title: '활동 결과보고서', kind: 'doc', content: T_.report },
      { id: 'tpl_minutes', category: '보고서', title: '회의록', kind: 'doc', content: T_.minutes },
      { id: 'tpl_plan', category: '보고서', title: '강사 수업계획서', kind: 'doc', content: T_.plan },
      { id: 'tpl_attend', category: '출석부', title: '월간 출석부 (자동 합계)', kind: 'sheet', content: attendTpl },
      { id: 'tpl_notice', category: '안내문', title: '가정통신문·안내문', kind: 'doc', content: T_.notice },
      { id: 'tpl_hwp', category: '안내문', title: '한글(HWP) 공문 — 빈 문서', kind: 'hwp', content: null },
      { id: 'tpl_confirm', category: '확인서', title: '재직(경력) 확인서', kind: 'doc', content: T_.confirm },
      { id: 'tpl_part', category: '확인서', title: '프로그램 참여 확인서', kind: 'doc', content: T_.participation },
      { id: 'tpl_expense', category: '회계', title: '지출결의서 (자동 합계)', kind: 'sheet', content: expenseTpl },
    ].map((t) => ({ ...t, ownerId: 'u_ceo', createdAt: at(-60) }));

    const presets = [
      { id: 'p_ceo', name: '대표에게 결재·제출', action: 'SUBMIT_CEO', icon: 'stamp' },
      { id: 'p_lee', name: '이두리 선생님께 서명·보완 요청', action: 'REQUEST_USER', targetUserId: 'u_lee', icon: 'pen' },
      { id: 'p_park', name: '박하늘 강사께 서명·보완 요청', action: 'REQUEST_USER', targetUserId: 'u_park', icon: 'pen' },
      { id: 'p_settle', name: '회계/정산 폴더에 저장·공유', action: 'SAVE_FOLDER', folderId: 'f_acc_settle', icon: 'folder' },
      { id: 'p_all', name: '전체 직원 공지 발송', action: 'BROADCAST', icon: 'megaphone' },
      { id: 'p_edu', name: '교육팀 전체 발송', action: 'DEPT', dept: '교육팀', icon: 'users' },
    ];

    const notifications = [
      { userId: 'u_ceo', title: '결재 요청: 2026 동절기 돌봄 프로그램 안내문', body: '이두리 선생님이 결재를 요청했습니다.', link: '#/doc/d_notice', type: 'APPROVAL', docId: 'd_notice', at: at(-1, 11, 5) },
      { userId: 'u_ceo', title: '재제출: 2026년 10월 지출 정산표 (v2)', body: '정민지 행정실장이 보완 후 재제출했습니다.', link: '#/doc/d_settle', type: 'APPROVAL', docId: 'd_settle', at: at(-4, 15, 5) },
      { userId: 'u_ceo', title: '결재 요청: 12월 수업계획서 (창의공예)', body: '최은솔 강사가 제출했습니다.', link: '#/doc/d_plan_choi', type: 'APPROVAL', docId: 'd_plan_choi', at: at(-1, 15, 3) },
      { userId: 'u_park', title: '보완 요청: 11월 활동 결과보고서', body: '사유: 참여 인원 회차별 통계표와 활동 사진 2장을 보완해 주세요.', link: '#/doc/d_report', type: 'REVISION', docId: 'd_report', at: at(-2, 10) },
      { userId: 'u_kang', title: '계약서 서명 요청: 근로계약서 (강서준) 2026 갱신', body: '내용 확인 후 전자서명해 주세요.', link: '#/contract/c_kang', type: 'SIGN', at: at(-21, 10) },
      { userId: 'u_lee', title: '공지: 11월 정기 운영위원회 회의록', body: '대표가 전체 공지로 발송했습니다.', link: '#/doc/d_minutes', type: 'INFO', docId: 'd_minutes', at: at(-14, 20, 5) },
    ].map((n) => ({ id: WD.uid('ntf'), read: false, ...n }));

    const dispatches = [
      { id: WD.uid('dsp'), docId: 'd_minutes', presetName: '전체 직원 공지 발송', action: 'BROADCAST', targets: staff.map((s) => s.id), senderId: 'u_ceo', at: at(-14, 20, 5) },
      { id: WD.uid('dsp'), docId: 'd_notice', presetName: '대표에게 결재·제출', action: 'SUBMIT_CEO', targets: ['u_ceo'], senderId: 'u_lee', at: at(-1, 11, 5) },
      { id: WD.uid('dsp'), docId: 'd_settle', presetName: '대표에게 결재·제출', action: 'SUBMIT_CEO', targets: ['u_ceo'], senderId: 'u_jung', at: at(-4, 15, 5) },
    ];
    docs.find((d) => d.id === 'd_minutes').recipients = staff.map((s) => s.id);

    const auditLogs = [
      ['u_ceo', 'RESIGN_CONFIRM', { type: 'user', id: 'u_han', name: '한지훈' }, '인수인계 3건 완료 후 퇴사 확정', at(-52, 18)],
      ['u_ceo', 'SESSION_REVOKE', { type: 'user', id: 'u_han', name: '한지훈' }, '활성 세션 1개 즉시 만료, 폴더 권한 회수', at(-52, 18, 1)],
      ['u_ceo', 'VAULT_MOVE', { type: 'user', id: 'u_han', name: '한지훈' }, '계약서 1, 근태 1, 정산 1건 보관 DB 이관', at(-52, 18, 1)],
      ['u_park', 'DOC_EDIT', { type: 'document', id: 'd_attend', name: '2026년 11월 방과후A반 출석부' }, 'v1 → v2', at(-2, 16)],
      ['u_park', 'DOWNLOAD_DENIED', { type: 'document', id: 'd_attend', name: '2026년 11월 방과후A반 출석부' }, 'xlsx 반출 시도 차단', at(-2, 16, 4)],
      ['u_ceo', 'WF_REVISION', { type: 'document', id: 'd_report', name: '11월 활동 결과보고서 (방과후A반)' }, '참여 인원 회차별 통계표와 활동 사진 2장을 보완해 주세요.', at(-2, 10)],
      ['u_ceo', 'WF_APPROVE', { type: 'document', id: 'd_attend', name: '2026년 11월 방과후A반 출석부' }, 'v2 최종 승인·잠금', at(-1, 17)],
      ['u_lee', 'DISPATCH', { type: 'document', id: 'd_notice', name: '2026 동절기 돌봄 프로그램 안내문' }, '대표에게 결재·제출 → 김우리', at(-1, 11, 5)],
    ].map(([uid, action, target, detail, atIso]) => {
      const u = users.find((x) => x.id === uid);
      return { id: WD.uid('log'), at: atIso, userId: uid, userName: u.name, role: u.role === 'RESIGNED' ? 'STAFF' : u.role, action, targetType: target.type, targetId: target.id, targetName: target.name, detail, ua: 'seed' };
    }).sort((a, b) => (a.at < b.at ? 1 : -1));

    const db = {
      schemaVersion: SCHEMA_VERSION, createdAt: WD.now(),
      users, sessions: [], folders, documents: docs, versions, wfEvents, dispatches, presets, notifications,
      templates, checklistSets, submissions, contracts, attendance, finance, launchers, auditLogs, alertSent: [],
    };

    const vault = { records: [
      { id: 'vr1', userId: 'u_han', userName: '한지훈', kind: 'contract', title: '위촉계약서 (한지훈)', movedAt: at(-52, 18, 1), retainUntil: T(-52 + 365 * 3), basis: '근로기준법 제42조(계약서류 3년 보존) 준용', payload: { kind: '위촉', userId: 'u_han', title: '위촉계약서 (한지훈)', start: T(-600), end: T(-52), place: contractBase.place, duties: '방과후 코딩 강의', workDays: '화·목', workHours: '14:00~17:00', payType: '강의료(시간당)', pay: 45000, payDay: '익월 5일 (3.3% 원천징수)', status: 'SEALED', locked: true, employeeSign: signSvg('한지훈'), employeeSignedAt: at(-600), sealedAt: at(-600, 15) } },
      { id: 'vr2', userId: 'u_han', userName: '한지훈', kind: 'attendance', title: '근태 기록 (2025-03 ~ 퇴사일)', movedAt: at(-52, 18, 1), retainUntil: T(-52 + 365 * 3), basis: '근로기준법 시행령 제22조 준용', payload: { summary: { 근무: 182, 지각: 4, 조퇴: 2, 병가: 1, 휴가: 3, 대강: 6 }, rows: [] } },
      { id: 'vr3', userId: 'u_han', userName: '한지훈', kind: 'document', title: '9월 강의료 정산서 (한지훈)', movedAt: at(-52, 18, 1), retainUntil: T(-52 + 365 * 5), basis: '국세기본법 제85조의3(장부 5년 보존)', payload: { doc: { title: '9월 강의료 정산서 (한지훈)', kind: 'doc', status: 'APPROVED' }, versions: [{ version: 1, content: '<h2>9월 강의료 정산서</h2><p>강의 16시간 × 45,000원 = 720,000원 (원천징수 3.3% 23,760원 공제, 실지급 696,240원)</p>' }] } },
    ] };
    return { db, vault };
  }

  WD.seedIfEmpty = async () => {
    WD.load();
    if (WD.db && WD.db.schemaVersion === SCHEMA_VERSION) return false;
    const { db, vault } = await buildSeed();
    WD.db = db; WD.save();
    localStorage.setItem(WD.VAULT_KEY, JSON.stringify(vault));
    return true;
  };
  WD.resetDemo = async () => {
    localStorage.removeItem(WD.DB_KEY); localStorage.removeItem(WD.VAULT_KEY);
    try { await WD.files.clear(); } catch (e) { /* noop */ }
    sessionStorage.removeItem('wd_sid');
    await WD.seedIfEmpty();
  };
})();
