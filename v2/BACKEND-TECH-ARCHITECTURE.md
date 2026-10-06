# 육십육 백엔드 기술 구성과 구현 경계

> 2026-10-05 · T02 설계 기준안. 로그인 2종·공개 모집은 사용자 확정, 최소 모집 인원·보관 기간 등은 B0 권장안 상태다.
> 선행: [B0 정책·수용 기준](BACKEND-B0-SPEC.md) · 산출물: [backend](../backend/README.md)

**Vercel 배포 조건 반영:** [VERCEL-BACKEND-SETUP.md](VERCEL-BACKEND-SETUP.md)를 최신 배포 기준으로 사용한다. 서버 기반은 `sixtysix-v2/server`와 Vercel 함수에 구현했고 Neon Preview DB 생성·연결·업무 migration도 완료했다. 아래 T02 당시의 컨테이너/별도 worker 배포 가정은 Vercel 함수·예약 작업으로 대체한다. 실제 로그인과 Production 배포는 미완료다.

**T03a 결과:** [실행 검증](AUTH-SPIKE-RESULTS.md)에서 Better Auth 1.7.7 기본 구성의 정책 불일치 3개를 재현했다. 아래 우선 후보 선정은 직접 채택 보류로 갱신한다. 제품 요구를 유지하면서 provider identity 중심 adapter/엔진을 검토한다. 현재 인증 라이브러리는 검증용 의존성이며 운영 라우트에 연결하지 않았다.

**T03 구현 후속:** [계정·세션 코어](AUTH-CORE-IMPLEMENTATION.md)와 [이메일 로그인 API](EMAIL-AUTH-IMPLEMENTATION.md)를 PostgreSQL 트랜잭션 기반으로 구현했다. 인증 DB migration 002/003 Preview 적용, OTP HMAC·DB 공유 제한·CSRF·세션 쿠키와 Resend adapter 준비. 공급자 실계정/카카오 OAuth·React 연결·운영 권한 분리는 남아 있다.

**최신:** [카카오 OAuth·재인증·연결 HTTP](KAKAO-AUTH-IMPLEMENTATION.md), migration 004 Preview 적용까지 완료. DB/HTTP 통합 45개, Vitest 191개 통과. 공급자 실계정·현재 사용자/React 연결·운영 권한 분리는 계속 후속이다.

## 1. 개요

첫 목표는 실제 두 계정이 같은 코호트에 참여하고, 인증·면제권 저장 결과가 홈·기록·피드·순위에 일치하는 것이다. 기존 React/Vite 앱과 순수 TypeScript 도메인을 유지하고 API 서버와 PostgreSQL을 추가한다. 데모의 가상 멤버·시계·localStorage 데이터는 서버에 이관하지 않는다.

이번 작업은 기술 기준, 실행 가능한 **업무 DB 초기 마이그레이션**, OpenAPI 계약이다. HTTP 서버·인증 공급자 연결·실서비스 DB·배포는 아직 구현하지 않았다. 인증 라이브러리 내부 테이블은 버전을 고정한 뒤 생성해야 하므로 이번 업무 SQL에 임의로 복제하지 않는다.

## 2. 기술 선택

| 영역 | 개발 기준 | 선택 이유·비용 |
|---|---|---|
| API | Node.js 22 계열 + TypeScript + Fastify 5 계열 | 기존 도메인과 언어 공유, 요청·응답 스키마 검증. 세부 버전은 서버 생성 때 lockfile 고정 |
| DB | PostgreSQL 16 이상, SQL migration + node-postgres | UNIQUE·외래키·행 잠금으로 일차 중복과 동시 모집을 표현. SQL과 트랜잭션을 직접 관리 |
| 인증 | Better Auth 우선 후보 + 이메일 OTP 플러그인 + Kakao provider, 서비스 어댑터 | 자동 연결 차단 설정이 있고 세션 기반 사용 가능. 아래 호환성 검증을 통과하기 전 채택 완료로 표시하지 않음 |
| 공개 계약 | OpenAPI 3.0.3 JSON | 프런트·서버가 같은 입력/응답/오류 계약 사용. 런타임 JSON Schema와 변환 검증 필요 |
| 비동기 업무 | PostgreSQL outbox + 별도 worker | 초기에는 Redis/메시지 브로커 없이 재시도. 발송은 at-least-once, 수신 측 중복 방지 필요 |
| 테스트 | 기존 Vitest 도메인 + 실제 PostgreSQL 통합 테스트 | 메모리 저장소로는 정원·면제권·멱등 동시성 검증 불충분 |
| 파일 | 기존 승인된 샘플 사진 카탈로그 | 실제 업로드·스토리지·파일 수명은 후속 |
| 배포 형태 | 기존 Vercel 프로젝트의 React + Node API 함수, Neon PostgreSQL 연결 권장 | `/v1` 동일 origin, 리전·플랜·DB 실제 생성은 후속 |

Fastify는 스키마 기반 검증과 응답 직렬화를 제공한다. node-postgres 트랜잭션은 같은 client 연결에서 BEGIN부터 COMMIT/ROLLBACK까지 실행해야 한다. [Fastify 문서](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [node-postgres 문서](https://node-postgres.com/features/transactions)

Supabase Auth는 같은 이메일 identity 자동 연결을 문서화하고 있어 이번의 명시적 연결 정책과 바로 맞지 않는다. Better Auth에는 `disableImplicitLinking: true`가 있으며 같은 이메일 신규 OAuth 로그인을 연결 안내 오류로 돌리고 명시적 연결은 허용한다. 이는 이번 우선 후보 선정 근거이며 실제 조합 검증을 대신하지 않는다. [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [Better Auth accounts](https://better-auth.com/docs/concepts/users-accounts)

## 3. 인증 호환성 검증 — T03 첫 작업

권장 설정은 implicit linking 차단, 다른 이메일의 명시적 연결 허용, 연결 시 프로필 덮어쓰기 금지다. 이메일 OTP는 hashed 저장, 6자리/5분/3회 시도 제한을 시작값으로 하고 IP·이메일·브라우저별 공유 rate limit을 둔다. 인증번호는 응답·로그·일반 outbox payload에 저장하지 않는다. [OTP 문서](https://better-auth.com/docs/plugins/email-otp), [Kakao provider 문서](https://better-auth.com/docs/authentication/kakao)

다음 네 가지를 격리된 인증 spike에서 통과해야 라이브러리와 인증 migration을 확정한다.

1. 카카오 이메일 미제공·동의 거부 상태에서도 provider user ID로 로그인 가능한지 확인. 임의 이메일을 만들어 다른 사람 계정과 연결하지 않는다. 불가능하면 어댑터/인증 공급자 선택을 재검토하고 B0를 조용히 축소하지 않는다.
2. 카카오 먼저 가입 → 검증된 이메일 OTP 추가, 이메일 먼저 가입 → 카카오 추가를 모두 검증. OTP가 라이브러리 user.email에 연결되는 방식과 account 테이블 차이를 확인한다. 이메일 문자열 일치만으로 소유권을 인정하지 않는다.
3. 이미 다른 계정에 속한 수단 연결 거부, 마지막 사용 가능한 수단 해제 거부, 두 탭 동시 연결/해제, 로그인 목적과 연결 목적 callback 분리를 검증한다. 계정 합병은 첫 범위에 없다.
4. 기존 수단 재인증 → 5분 이내 민감 작업, 세션 교체·로그아웃·정지·탈퇴 후 접근 차단 검증. 라이브러리 freshness 기본값을 그대로 제품 계약으로 사용하지 않는다.

카카오 code는 서버에서 교환하고 state를 브라우저·목적·세션에 묶어 한 번만 사용한다. 리다이렉트는 등록 URI와 allowlist만 사용한다. 실제 카카오 앱 키·redirect URI·동의 항목 설정은 별도 연결 작업이다. [카카오 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api)

서비스의 `/v1/auth/*`는 라이브러리 원형 API를 그대로 노출하는 약속이 아니다. 어댑터가 아래 OpenAPI 계약으로 번역한다. 라이브러리 자체 라우트가 별도로 접근 가능해 정책 검사를 우회하지 않도록 한다. 인증 테이블이 확정되면 `app_users.auth_subject`와 라이브러리 user ID 간 FK 또는 생성/삭제 동기화 트랜잭션을 추가한다. 현재 text UNIQUE는 중복 매핑만 보장하며 실제 인증 사용자 존재는 보장하지 않는다.

## 4. 구조와 책임

```text
React 화면 → HTTP client → Fastify routes (입력/세션/CSRF)
                         → application commands (권한/트랜잭션/멱등)
                         → 순수 domain selectors (시간/진행/순위)
                         → PostgreSQL repositories (사실 저장)
                         → outbox → worker → 이메일/운영 안내
```

향후 서버 경로는 `backend/src/{http,application,domain,infrastructure,worker}`로 나눈다. domain 재사용은 simulator를 import하지 않는 공유 패키지 추출로 진행한다. UI가 전체 Facts를 다운로드해서 권한을 필터링하지 않는다. 서버가 허용된 DTO를 구성한다.

`state`, `late`, `streak`, `rank`, `filled`, `isFinal`은 계산값이다. 저장하는 상태는 모집 개시 판단·취소·이탈·신고 처리·작업 실패 같은 운영 사실이다. 코호트 시작 시각은 KST 04:00로 정규화하고 이후 시각 비교는 UTC timestamp로 한다. durationDays=66의 접수 종료는 시작 후 66일 +12시간이다. 종료 시각 **정확히 해당 순간까지** 늦은 접수를 허용하므로 `isFinal = serverNow > finalSubmissionAt`이다.

## 5. DB 계약

[001_initial.sql](../backend/db/001_initial.sql)은 업무 스키마 `sixtysix`를 만든다. 인증 공급자 테이블과 운영 role/grant 배포는 별도다. 앱 DB 사용자는 migration 소유자와 분리하고 API 외 직접 DB 접근은 허용하지 않는다. RLS를 구현했다고 가정하지 않는다.

| 테이블 묶음 | 역할 |
|---|---|
| app_users, preferences, operator_roles | 인증 subject 매핑·프로필·계정 차단 사실·설정·운영 권한 |
| habits, policy_versions, sample_photos | 카탈로그와 변경 불가 정책 버전. v1 규칙만 seed, 실제 모집은 생성하지 않음 |
| cohorts, memberships, user_cohort_slots | 모집·참여 사실, 사용자당 한 슬롯. 슬롯의 사용자와 멤버십 소유자 복합 FK |
| day_entries | 인증/면제 통합, 멤버십/일차 UNIQUE, kind별 payload CHECK |
| link_intents | 서비스 연결 작업의 소유 세션 hash·만료·검증된 provider subject·소비 사실. OTP 원문 저장소 아님 |
| idempotency_records | 사용자/명령 범위/키 UNIQUE, 요청 hash·성공 응답. 개인정보 포함 응답 보관 기간 별도 관리 |
| reports, support_requests, deletion_requests | 본인 요청 및 운영 처리. 비로그인 문의는 contact email과 별도 rate limit |
| outbox, audit_events | 작업 재시도·운영 감사. 인증 본문/토큰을 감사 기록에 넣지 않음 |

본문은 JS `trim()` 후 UTF-16 1~40단위다. SQL 보조 함수는 저장 문자열의 UTF-16 길이를 확인한다. JS와 PostgreSQL의 trim 문자 집합이 달라 정규화 자체는 서버가 수행한다. OpenAPI maxLength는 코드 포인트 기준이며 trim 전 입력 길이를 검사하므로 쓰기 요청에는 `x-utf16-max-length` 추가 검증을 사용한다. 정규화된 응답 본문에는 maxLength 보조 제한을 둔다. 서버에는 16 KiB JSON body limit을 별도로 설정한다.

DB가 보장하는 것은 FK, 단일 슬롯, 하루 한 항목, payload 형식, 정책 불변성 등이다. 정원·면제권 3회·시간·소유권·최소 한 로그인 수단은 서버 트랜잭션 책임이다. 이 파일만 실행해 이 조건이 구현됐다고 간주하지 않는다.

## 6. 트랜잭션과 조회

- 참여/취소: 사용자 → 코호트 순서 행 잠금, 시각·슬롯 만료·모집 상태·인원 재검사. 마지막 접수 시각이 지난 슬롯만 교체한다. 취소 코호트 슬롯은 즉시 해제한다.
- 시작 판단: 코호트 잠금으로 인원 충족이면 launch_decided_at, 미달이면 cancellation 사실과 outbox 저장. 스케줄 작업이 늦으면 첫 읽기/쓰기가 동일 함수를 호출한다.
- 인증/면제: 사용자 차단 확인과 소유자 검사 → 멱등 키 잠금 → 코호트 → 멤버십 잠금. 코호트 취소/운영 정지와 직렬화한 뒤 대상 일차·late·중복·면제 총횟수 재검사. 사실과 성공 응답을 한 트랜잭션에 저장한다.
- 운영 취소/계정 정지/탈퇴도 같은 자원 잠금 순서를 지킨다. 여러 사용자는 UUID 정렬 순서로 잠근다. 교착/직렬화 실패 재시도는 제한 횟수와 동일 멱등 키를 사용한다.
- 코호트 취소/시작 판단 작업은 코호트 잠금 상태에서 사용자 잠금을 역순으로 얻지 않는다. 취소 사실만 먼저 기록하고 슬롯 정리는 사용자 → 코호트 순서의 개별 작업 또는 다음 참여 트랜잭션에서 처리한다. 슬롯이 남아 있어도 취소된 코호트의 접근/쓰기는 즉시 거부한다.
- 재시도는 먼저 현재 계정·리소스 접근 권한을 확인한다. 성공 키+동일 요청이면 원래 응답, 다른 요청이면 409. 4xx 실패는 성공 캐시로 저장하지 않는다. 중간 실패는 전체 rollback.
- 아직 없는 멱등 행을 `SELECT FOR UPDATE`로 잠갔다고 가정하지 않는다. 모든 회원 쓰기의 사용자 행 잠금으로 같은 사용자 명령을 직렬화한 뒤 캐시를 확인한다. 처리 중 상태 행을 별도 commit하지 않는다.
- 홈/기록/순위는 하나의 읽기 snapshot과 동일 serverNow를 사용한다. 피드 본문은 cohort visibility이며 노출 중단·이탈·삭제 계정 제외. 비공개 본문/사진을 null 치환하여 타인에게 내려주는 대신 피드 항목 자체를 제외한다.
- 이탈자는 쓰기·다른 멤버 조회 금지, 자기 기록만 가능. 공개 집계의 식별 정보는 제외한다. 정확한 이탈·탈퇴 집계 보관 규칙은 운영 정책 확정 후 적용한다.
- outbox는 `FOR UPDATE SKIP LOCKED`로 임대하고 lease 만료 재수행, 지수 backoff 및 실패 보관. 같은 이벤트의 외부 발송 중복은 공급자 idempotency 또는 delivery 기록으로 방지한다.

## 7. HTTP·세션 계약

운영 권장 구성은 동일 origin `/v1`, HttpOnly/Secure/SameSite=Lax 세션 쿠키, 상태 변경 요청의 Origin 검사와 `X-CSRF-Token`이다. 개발 HTTP 쿠키 이름/옵션은 별도 설정한다. 라이브러리 쿠키는 서버 어댑터 내부 구현이므로 OpenAPI의 논리적 cookie 명칭은 T03 통합 때 실제 값과 맞춘다. 세션 ID를 localStorage에 저장하지 않는다. [OWASP 세션 지침](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

익명 OTP/문의도 `/v1/auth/context`에서 브라우저에 묶인 CSRF 문맥을 먼저 얻는다. OAuth callback은 일반 CSRF 헤더 대신 state 검증을 사용한다. 민감한 읽기와 인증 응답은 `Cache-Control: no-store`. 오류는 공통 envelope, 접근 불가 리소스는 404, 운영 권한 부족은 403. 429에는 Retry-After를 보낸다.

멱등 키는 UUID. 인증 challenge/state/proof에는 업무 멱등 캐시를 사용하지 않고 만료·일회성 처리로 보호한다. 업무 요청 hash에는 method/path와 정규화 본문을 포함한다. 가입 사용자별 scope를 사용하며 최소 최종 접수 종료까지 성공 결과를 보존한다. OTP·세션·연결 proof 응답은 멱등 테이블에 넣지 않는다.

## 8. 실제 구현 순서와 완료 기준

1. **T03a 인증 spike**: 위 네 호환성 항목, 카카오 설정·메일 공급자 연결, 인증 버전 및 migration 고정. 실패하면 선택 변경을 문서에 기록한다.
2. **B1 서버 기반**: Fastify 프로젝트, 환경 변수 검증, DB migration runner/checksum, 인증 어댑터·CSRF·권한·요청 ID·민감정보 로그 제거. 업무 테이블과 인증 ID 연결.
3. **B2 참여**: 공개 목록·개설·참여·취소, 마지막 자리 동시 요청·중복 슬롯 검증.
4. **B3 쓰기**: 인증/면제·멱등·04:00/16:00/마지막 날 경계, 두 연결에서 동시성 검증.
5. **B4/B5**: 화면 비동기 연결·실계정 비공개 검수·운영 처리·복구/보관 정책 후 공개.

운영 전에 확정할 값: 최소 인원, 취소/이탈 문구, 문의/신고/삭제·백업 보관 기간, 세션 수명, 발송 공급자·운영 도메인·DB 리전. SQL은 최소 인원에 10이라는 기본값을 박지 않았고 개설 요청이 명시적으로 지정하도록 했다. 이 미결 항목이 로컬 서버 기반 작업을 막지는 않는다.
