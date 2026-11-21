# 보안 규칙 — 다운로드 차단 · 감사 로그 · 퇴사자 통제

우리두리사회적협동조합 문서관리시스템의 보안 설계 원칙과 구현 규칙입니다.
원칙: **서버가 최종 판정, 브라우저는 억제와 기록.** 화면 차단만으로는 사진 촬영·외부 캡처를 막을 수 없으므로, 반출 경로를 서버에서 끊고 모든 시도를 남겨 추적성을 확보합니다.

---

## 1. 인증 · 세션

| 규칙 | 운영 구현 | MVP 구현 |
|---|---|---|
| 비밀번호 | argon2id (m=64MB, t=3), 최소 10자 | SHA-256(솔트) 데모 |
| 2단계 인증 | 대표 필수, 직원 권장 (TOTP) | — |
| 세션 토큰 | 32바이트 난수, 쿠키 `HttpOnly; Secure; SameSite=Strict`, DB에는 SHA-256만 저장 | 탭별 sessionStorage SID |
| 세션 수명 | 유휴 30분 / 최대 8시간, 재검증은 **매 요청** | 8시간, 4초 주기 + storage 이벤트 재검증 |
| 검증 항목 | 세션 존재 · `revoked_at IS NULL` · `expires_at > now()` · `users.status='ACTIVE'` · `role<>'RESIGNED'` | 동일 (`WD.auth.validate`) |
| 로그인 실패 | 5회 실패 시 15분 잠금, `LOGIN_FAIL` 기록 | `LOGIN_FAIL` 기록 |
| CSRF | Double-submit 토큰 + SameSite=Strict | — (서버 없음) |

---

## 2. 반출(다운로드) 통제

### 2.1 서버 측 (최종 방어선)
1. **원본 파일은 비공개 버킷**에 저장. 퍼블릭 URL·정적 경로 없음. 버킷 정책: API 서비스 계정만 `GetObject`.
2. `GET /files/:id/download` → `rbac.requireRole('CEO')` 통과 시에만 **60초 유효 서명 URL** 발급(`Content-Disposition: attachment`), `DOC_DOWNLOAD` 기록.
3. 직원 요청은 `403` + `DOWNLOAD_DENIED` 기록. 직원 열람은 `GET /files/:id/render`(PDF→이미지 타일, 문서→HTML)로만 제공하며 응답 헤더:
   `Cache-Control: no-store` · `Content-Disposition: inline` · `X-Content-Type-Options: nosniff` · `Content-Security-Policy: default-src 'self'; frame-ancestors 'self'`.
4. 내보내기 API(`/documents/:id/export?format=xlsx|pdf|hwp`)도 동일 게이트. 서버 렌더 PDF에는 **출력자·일시·문서 ID 워터마크** 삽입.
5. 이메일·메신저 외부 공유 기능은 제공하지 않음(원클릭 발송은 **내부 사용자·폴더 대상만**).
6. 스토리지 액세스 로그(버킷 서버 액세스 로그)를 감사 로그와 대조하는 일일 점검.

### 2.2 클라이언트 측 (억제 · 기록) — `assets/js/core/security.js`
| 통제 | 구현 |
|---|---|
| 다운로드 버튼 | 직원은 `반출 차단` 잠금 버튼 표시 → 클릭 시 `WD.sec.exportDoc()`가 거부하고 `DOWNLOAD_DENIED` 기록 |
| 단일 반출 관문 | 모든 다운로드는 `exportDoc()` → `saveBlob()` 경유, `saveBlob()`도 CEO 재검증 |
| 우클릭 | `contextmenu` 캡처 단계 차단 (스프레드시트 자체 메뉴는 편집용으로 허용) |
| 복사/잘라내기 | `.protected` 영역에서 `copy`/`cut` 차단, 클립보드에 경고문 기록, `COPY_DENIED` |
| 인쇄 | `Ctrl+P` 차단, `beforeprint` 기록, `@media print`에서 직원 화면 전체 숨김 + 안내문 |
| 페이지 저장 | `Ctrl+S` 차단 |
| 캡처 키 | `PrintScreen` 감지 → 화면 1.8초 블러 + 클립보드 덮어쓰기 + `CAPTURE_DENIED` |
| 드래그 | 이미지·캔버스 드래그 아웃 차단 |
| 텍스트 선택 | 읽기 전용 뷰어·계약서·미리보기에서 `user-select: none` |
| PDF·이미지 | 브라우저 내장 PDF 뷰어(다운로드 버튼 있음) 대신 PDF.js 캔버스 렌더, 이미지는 배경 렌더 |
| 워터마크 | 시스템명 + 사용자명(아이디) + 열람 일시 + "열람 전용 · 외부 반출 금지"를 대각선 반복, `pointer-events:none`, MutationObserver로 제거·숨김 시 즉시 복원 + 기록 |

### 2.3 한글(rhwp) iframe 주의
rhwp 에디터는 별도 오리진 iframe이라 상위 페이지가 내부 단축키를 제어할 수 없습니다.
- MVP: 직원은 메뉴바 숨김(`chrome.menu=false`) + 상위 워터마크 + 반출 버튼 비노출.
- 운영: rhwp-studio를 **자체 도메인에 셀프 호스팅**하고 직원용 빌드에서 `file:save`, `file:print`, 다운로드 커맨드를 제거, CSP `frame-src`를 자체 도메인으로 제한.

### 2.4 한계와 보완
화면 촬영(휴대폰)·외부 캡처 프로그램은 기술적으로 완전 차단이 불가능합니다 → 개인 식별 워터마크로 **유출 시 추적 가능**하게 하고, 보안서약서·취업규칙·근로계약서 비밀유지 조항으로 법적 억지력을 확보합니다. 필요 시 MDM/DRM(사내 PC 에이전트) 연동을 2단계로 검토합니다.

---

## 3. 감사 로그 (Audit Trail)

### 3.1 기록 대상
| 분류 | 액션 코드 |
|---|---|
| 인증 | `LOGIN` `LOGIN_FAIL` `LOGIN_BLOCKED` `LOGOUT` `SESSION_EXPIRED` |
| 열람 | `DOC_VIEW`(문서·버전·모드) `VAULT_VIEW` |
| 수정 | `DOC_CREATE` `DOC_EDIT`(v1→v2, 메모) `DOC_UPLOAD` `DOC_MOVE` `TEMPLATE_SAVE` |
| 발송 | `DISPATCH`(프리셋, 수신자 목록) |
| 결재 | `WF_SUBMIT` `WF_REVISION`(사유) `WF_RESUBMIT` `WF_APPROVE`(잠금) |
| 계약 | `CONTRACT_CREATE` `CONTRACT_SIGN` `CONTRACT_SEAL` `CONTRACT_RENEW` |
| 반출 | `DOC_DOWNLOAD`(형식) |
| 차단 | `DOWNLOAD_DENIED` `PRINT_DENIED` `COPY_DENIED` `CAPTURE_DENIED` `ACCESS_DENIED` `VAULT_DENIED` |
| 퇴사 | `RESIGN_HANDOVER` `RESIGN_CONFIRM` `SESSION_REVOKE` `VAULT_MOVE` |
| 근태 | `ATTEND_IN` `ATTEND_OUT` `ATTEND_EDIT` |

각 행: 일시(ms) · 사용자 ID/이름 · 역할 · 액션 · 대상 유형/ID/이름 · 상세 · IP · User-Agent · `prev_hash` · `row_hash`.

### 3.2 무결성
- `audit.logs`는 **INSERT 전용**(API 롤), `UPDATE/DELETE` 트리거로 거부.
- 행 해시 = SHA-256(이전 행 해시 ‖ 일시 ‖ 사용자 ‖ 액션 ‖ 대상 ‖ 상세) → 체인 검증으로 삭제·변조 탐지.
- 일 1회 마지막 해시를 별도 저장소(WORM 버킷)에 기록.
- 조회는 `wd_auditor` 롤 = 대표 전용 화면, 조회·CSV 반출 자체도 기록.
- 보존: 최소 3년(근로 관계 서류와 동일), 이후 아카이브.

---

## 4. 퇴사자 통제

### 4.1 절차 (화면: 인사·퇴사 관리 → 퇴사 처리)
1. **인수인계 점검**: 퇴사자가 작성자/담당자인 미결 문서(`status ≠ APPROVED`)를 모두 나열 → 인수자 지정 + 인계 확인. 하나라도 미체크면 확정 불가(서버 프로시저도 미결 문서 존재 시 예외).
2. **퇴사 체크리스트**: 인계 면담, 지급품 반납, 개인 기기 업무자료 삭제 확약, 최종 정산.
3. **확정(단일 트랜잭션)** — `app.confirm_resignation()`:
   - `users.role/status = RESIGNED`, 퇴사일·사유 기록
   - `sessions.revoked_at = now()` (전 기기) → 다음 요청부터 401, 실시간 채널 강제 종료
   - `document_recipients`, `folder_grants`, `dispatch_presets` 에서 제거
   - 법정 보관 자료를 `vault.records`로 암호화 이관 후 일반 영역에서 삭제
   - 감사 로그 `RESIGN_CONFIRM` · `SESSION_REVOKE` · `VAULT_MOVE`
4. 재로그인 시도는 `LOGIN_BLOCKED`로 기록되고 대표 대시보드 보안 이벤트에 집계.

### 4.2 법정 보관 DB (vault)
| 자료 | 보존 기한(퇴사일 기준) | 근거 |
|---|---|---|
| 근로계약서·위촉계약서 | 3년 | 근로기준법 제42조(계약 서류 보존) |
| 근태(출퇴근·휴가) 기록 | 3년 | 근로기준법 제42조, 같은 법 시행령 제22조 |
| 회계·정산(승인 완료분) | 5년 | 국세기본법 제85조의3(장부·증빙 보관) |
| 인사 제출서류 | 3년 (경과 후 파기) | 근로기준법 제42조 준용, 개인정보 보호법 제21조(목적 달성 시 파기) |

- 별도 스키마·별도 롤(`wd_vault`)·별도 버킷, payload는 `pgp_sym_encrypt`(키는 KMS).
- 접근은 대표 세션에서만 `SET ROLE wd_vault`, 열람마다 `VAULT_VIEW` 기록.
- 보존 기한 경과 시 대표 화면에 "파기 대상" 표시 → 파기 처리(`destroyed_at`, 원본 삭제, 기록).
- ※ 보존 기간은 업무 특성에 따라 노무사·세무사 확인 후 확정하세요.

---

## 5. 운영 체크리스트
- [ ] HTTPS 전용(HSTS), 관리자 페이지 IP 제한(선택)
- [ ] DB 백업 일 1회 암호화 + 분기별 복구 훈련
- [ ] 비공개 버킷 · 퍼블릭 액세스 차단 · 서명 URL 60초
- [ ] 감사 로그 해시 체인 일일 검증
- [ ] 퇴사 처리 후 24시간 내 계정 접근 시도 모니터링
- [ ] 보안서약서 연 1회 재징구, 개인정보 처리방침 게시
