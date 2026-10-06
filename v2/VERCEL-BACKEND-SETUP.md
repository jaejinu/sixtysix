# Vercel 앱·API·PostgreSQL 연결 계획

> **최신 2026-10-06:** [고정 Preview](https://sixtysix-v2-auth-preview.vercel.app)에 인증 기반 설정 적용. Preview 변수는 APP_DATABASE_URL·APP_ORIGIN·AUTH_CONTEXT_SECRET·AUTH_OTP_SECRET이며 공급자 키는 미등록이다. 원격 **22개 검증 통과**, context 200·비로그인 계정/알림/관리자 401·카카오 503. 사용자 도메인 미보유로 이메일은 보류하고 카카오를 먼저 준비한다. **`PROGRESS.md` 28장**의 재개 순서가 아래 이전 기록보다 우선한다. Production 주소 유지.

CLI 배포 전에 루트 `.vercelignore`를 유지한다. `.gitignore`만으로 `.env.preview-*` 업로드가 차단되지 않는 것을 dry-run으로 확인했다. 현재 제외 규칙은 V2 전용이며 V1 CLI 배포에는 재사용하지 않는다. [Vercel 제외 규칙 문서](https://vercel.com/docs/deployments/vercel-ignore).

```sh
vercel deploy --dry --force --json --yes --local-config sixtysix-v2/vercel.json > /private/tmp/sixtysix-upload.json
node backend/scripts/verify-vercel-upload.cjs /private/tmp/sixtysix-upload.json
# 위 검사가 통과한 경우에만 실행
vercel deploy --yes --force --target preview --local-config sixtysix-v2/vercel.json
node backend/scripts/verify-preview-http.cjs https://sixtysix-v2-auth-preview.vercel.app --context-ready
```

HTTP 검사의 `--context-ready`는 인증 context만 설정되고 공급자는 미설정인 단계다. 카카오 키 설정 후에는 카카오 503 기대값을 갱신하고 실제 로그인 검수를 추가해야 한다. Vercel CLI의 프로젝트 보호 우회 기능으로 검증했으며 보호 자체는 해제하지 않았다. 재배포 후 고정 alias를 새 Preview 배포에 연결해야 APP_ORIGIN 및 카카오 callback 주소가 유지된다.

> **최신 — 5분 worker 준비 (2026-10-06):** [자동 시작 판단·outbox 통합 실행](SCHEDULED-WORKER.md) 및 Preview migration 009·worker 권한 적용 완료. DB/HTTP 140개·Vitest 268개 통과. GitHub 전용 환경/Secret은 등록했지만 스케줄 변수는 false이며 main 반영·실제 활성화는 남았다.


> **최신 — 운영자 모집:** [생성·목록·시작 전 취소](OPERATOR-COHORTS.md)와 Preview migration 008 적용 완료. admin 역할·최근 재인증을 확인하는 제한된 함수만 앱에 허용한다. 26테이블·11함수 권한 검증, DB/HTTP 132개·Vitest 259개 통과. 실제 운영자 지정·모집 생성·앱 배포는 하지 않았다.


> **최신 — outbox·내부 알림:** [OUTBOX-IMPLEMENTATION.md](OUTBOX-IMPLEMENTATION.md) 구현·Preview migration 007 적용 완료. 앱과 worker 권한을 분리하고 26테이블·8함수 기준 검증했다. worker 상태 조회 0건, 수동 CLI만 제공하며 실제 처리·자동 스케줄·앱 배포는 하지 않았다. 최신 DB/HTTP 121개·Vitest 250개 통과.


> 2026-10-05 후속: [인증 감사·만료 정리](AUTH-AUDIT-CLEANUP.md)의 migration 006과 최소 grant를 Neon Preview에 적용했다. 런타임 25테이블·4함수 검증, 정리 dry-run 0행. 원격 실제 삭제·스케줄 설치·앱 배포는 하지 않았다. DB/HTTP 최신 검증은 102개다.


> 2026-10-05 · 기존 `sixtysix-v2` Vercel 프로젝트 기준. API·Neon Preview DB·이메일/카카오 인증 HTTP 구현 완료, 실제 공급자 인증·원격 앱 배포는 미완료.

## 최신 연결 상태 — 2026-10-05 후속

> **권한 분리 후속 완료:** [런타임 DB 기록](RUNTIME-DB-IMPLEMENTATION.md)을 우선한다. `005_runtime_photo_lock.sql`과 `sixtysix_runtime_preview` 역할을 적용했고, 앱은 `APP_DATABASE_URL`만 사용한다. Vercel Preview에서 Marketplace 프로젝트 연결을 해제해 소유자 자격 증명 자동 주입을 제거하고 `APP_DATABASE_URL` Secret만 남겼다. Neon 리소스는 유지한다. 아래 자동 연결·DATABASE_URL 사용 설명은 이전 단계 기록이며, 새로 Marketplace에 재연결하지 않는다. 현재 연결로 원격 DB 읽기/권한 검증 완료, 앱 배포는 미수행이다.

- 검수 DB **sixtysix-v2-preview** 생성 완료: Neon Free (`free_v3`), Singapore (`sin1`), Vercel resource `store_i4LPcScSB5jClNk6`.
- Vercel **sixtysix-v2의 Preview에만 연결**했다. Production DB는 생성/연결하지 않았다.
- `001_initial.sql`~`004_auth_intents_oauth.sql` 적용 완료: 업무 테이블 17개 + 인증 테이블 7개 + public migration 이력, 정책 v1 seed. 실제 회원·모집 seed 없음.
- 로컬 API에서 원격 DB의 `/v1/ready`·`/v1/habits` 읽기 검증 완료. 원격 앱 배포는 하지 않았다.
- 연결 환경 변수는 Marketplace가 관리한다. `DATABASE_URL`은 pooled, migration은 `DATABASE_URL_UNPOOLED`를 `DIRECT_DATABASE_URL`로 매핑해 실행했다. 키/비밀번호는 저장소나 문서에 기록하지 않는다.
- Marketplace가 함께 제공한 Neon Auth URL은 앱에서 사용하지 않는다. [인증 코어](AUTH-CORE-IMPLEMENTATION.md)·[이메일 로그인](EMAIL-AUTH-IMPLEMENTATION.md)·[카카오 OAuth](KAKAO-AUTH-IMPLEMENTATION.md)를 구현했다. 공급자 실계정 설정은 후속이다.
- 인증/발송 비밀값(`APP_ORIGIN`, `AUTH_CONTEXT_SECRET`, `AUTH_OTP_SECRET`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`)은 미등록. 키 없는 환경에서 로그인 시작은 503이다. 해당 설정 없이 실제 로그인 완료로 안내하지 않는다.
- [카카오 OAuth·양방향 재인증/연결 HTTP](KAKAO-AUTH-IMPLEMENTATION.md) 구현과 PostgreSQL/HTTP 45개 검증 완료. 후속으로 [`/v1/me`·로그인/계정 UI](LOGIN-UI-IMPLEMENTATION.md)도 연결했다. 최신 DB/HTTP 47개·Vitest 204개와 Vercel 로컬 빌드가 통과했고 실계정 검수는 남아 있다.
- **배포 전 후속:** 기본 integration 자격 증명과 별도로 런타임 최소 권한 역할을 만들고, 함수 환경에서 DDL용 자격 증명을 분리해야 한다. 현재 연결 완료는 운영 권한 분리 완료를 뜻하지 않는다. Preview DB를 Production에 재사용하지 않는다.

관리: [Vercel의 검수 DB](https://vercel.com/d/dashboard/integrations/neon/icfg_XSckeJGX7kzrVWdTzcXr7H9G/resources/store_i4LPcScSB5jClNk6)

이하 연결 순서는 최초 설정 기록이다. 새 DB를 다시 생성하지 말고 위 리소스를 이어서 사용한다.

## 1. 가능한 구성

**현재 앱을 유지하면서 Vercel에서 API와 DB 연동까지 진행할 수 있다.** React 정적 파일과 Node.js API 함수를 같은 프로젝트에서 배포하고 데이터는 Neon PostgreSQL에 저장한다. Vercel의 Marketplace는 외부 PostgreSQL 연결을 지원한다. [공식 DB 안내](https://vercel.com/docs/postgres), [Neon 연결](https://vercel.com/marketplace/neon)

```text
브라우저 ── Vercel sixtysix-v2 ── React 정적 파일
             └ /v1/* → Node API 함수 (Fastify)
                         └ Neon PostgreSQL (서버 환경 변수로 연결)
```

별도 컨테이너 서버를 먼저 개설할 필요는 없다. API는 기존 프로젝트 루트 `sixtysix-v2` 안에 둔다. [Vercel Node 함수](https://vercel.com/docs/functions/runtimes/node-js), [Fastify 지원](https://vercel.com/docs/frameworks/backend/fastify)

## 2. 이번 구현

| 위치 | 역할 |
|---|---|
| `sixtysix-v2/api/backend.ts` | Vercel 함수 진입점. rewrite의 내부 경로를 Fastify `/v1` 경로로 복원 |
| `sixtysix-v2/server/app.ts` | Fastify 앱, 공통 오류·요청 ID·응답 필드 제한 |
| `sixtysix-v2/server/database.ts` | 재사용 DB pool, 같은 연결의 transaction과 release |
| `sixtysix-v2/vercel.json` | `/v1/*`를 API로, 나머지를 React로 라우팅, 빌드 명령 고정 |
| `backend/scripts/migrate.cjs` | SQL 순차 적용·checksum·DB 잠금·적용 이력 |

현재 구현 경로는 health/ready/habits, 인증 context/code/verify/logout, 카카오 start/callback, 재인증 intent·연결 intent/complete·수단 해제다. health는 프로세스 생존, ready는 DB 연결과 업무 테이블 존재 확인이다. 인증은 별도 서버/공급자 설정이 필요하다. 현재 사용자·참여·인증 쓰기 API는 아직 구현되지 않았고 404를 반환한다. 기존 React 화면은 계속 데모 저장소를 사용한다.

DB는 모듈별 최대 5개 pool을 재사용하며 Vercel에서는 `attachDatabasePool`을 연결한다. 인스턴스가 여러 개면 전체 연결 수도 늘어나므로 Neon pooled URL을 런타임에 사용한다. 트랜잭션은 하나의 client를 빌려 끝까지 실행한다. [Vercel pooling 지침](https://vercel.com/kb/guide/connection-pooling-with-functions)

## 3. 실제 연결 순서

1. Vercel의 **sixtysix-v2 → Storage/Marketplace → Neon**으로 DB를 연결한다. 공급자 계정·플랜·리전 설정은 아직 수행하지 않았다. API와 DB 리전은 가까운 위치로 맞춘다.
2. Preview와 Production은 서로 다른 DB/branch 및 자격 증명으로 분리한다. 실제 운영 데이터가 있는 branch를 검수용으로 무조건 복제하지 않는다.
3. Vercel 서버 환경 변수 `DATABASE_URL`에 런타임 역할의 pooled 연결 문자열을 등록한다. `VITE_` 접두어를 붙이지 않는다. 현재 프로젝트의 환경 변수 목록은 비어 있음을 확인했다.
4. migration 역할의 direct 연결 문자열은 로컬 보안 환경 또는 CI secret `DIRECT_DATABASE_URL`에 둔다. 함수 환경에는 배포용 DDL 권한을 주지 않는다. 예시 `.env.example`에는 실제 비밀값이 없다.
5. 빈 Preview DB에 `npm --prefix backend run db:migrate`를 실행한다. 필요하면 `backend/.env`를 사용한다. 스키마와 migration 이력을 한 transaction에 기록하므로 실패 후 재시도할 수 있다. 이미 적용한 SQL을 수정하면 checksum 오류로 멈춘다. 새 변경은 `002_...sql`로 추가한다.
6. Preview 배포 후 `/v1/health`, `/v1/ready`, `/v1/habits`와 기존 `/home` 직접 진입을 확인한다. 업무 seed/인증 테이블은 후속 migration으로 추가한다.

**마이그레이션은 Vercel의 buildCommand나 매 요청에서 자동 실행하지 않는다.** Preview 빌드가 운영 DB 스키마를 바꾸는 일을 막기 위해 DB 대상이 명시된 별도 단계에서 실행한다. 이전에 SQL을 수동 적용한 DB는 이력 자동 채택을 하지 않는다. 새 DB에서 runner를 쓰거나 별도 검증된 baseline 절차를 마련한다.

로컬 실행:

```sh
# 프로젝트 루트에서, 각 폴더 .env에 예시를 참고해 설정
npm --prefix backend run db:migrate
npm --prefix sixtysix-v2 run dev:api
# 별도 터미널
npm --prefix sixtysix-v2 run dev
```

Vite의 `/v1` 프록시는 로컬 3001 API를 향한다. Vercel 빌드는 프로젝트 설정의 Root Directory가 `sixtysix-v2`이므로 **저장소 루트**에 해당 Vercel 프로젝트를 연결한 후 `vercel build --yes --local-config sixtysix-v2/vercel.json`으로 검사한다. 하위 폴더에서 같은 Root Directory 설정으로 실행하면 경로가 두 번 붙을 수 있다.

## 4. 예약 작업과 인증의 후속 조건

Vercel 함수 안에 무한 worker나 `setInterval`을 두지 않는다. outbox는 제한된 건수를 처리하는 작업 함수와 재시도 스케줄로 연결한다. 공개 운영의 메일/삭제 작업에 필요한 빈도를 정한 뒤 Vercel Cron 또는 외부 큐를 선택한다. Hobby Cron은 하루 1회와 시간 정확도 제약이 있어 빠른 재시도 수단으로 가정하지 않는다. 코호트 시작 판정은 기존 B0대로 첫 조회/쓰기에서도 보완한다. [Cron 제한](https://vercel.com/docs/cron-jobs/usage-and-pricing)

이메일 OTP·카카오 실제 검증에는 메일 발송 공급자와 카카오 앱 키·redirect URI가 필요하다. Better Auth 정책 불일치는 T03a에서 확인했으며 별도 코어의 양방향 연결·최종 수단 해제는 로컬 DB 통합 테스트로 검증했다. 공급자 실제 인증 완료와는 구분한다.

## 5. 검증 결과

- 기존 169개 + API 기반/transaction 6개 = 테스트 175개 통과.
- 프런트·서버 타입 검사와 Vite 프로덕션 빌드 통과.
- Vercel 로컬 Preview 빌드 통과. 생성된 함수·정적 파일과 `/v1` 중첩 경로/SPA 라우팅을 `node backend/scripts/verify-vercel-build.cjs`로 확인한다. 이 검사는 원격 배포 성공을 의미하지 않는다.
- PostgreSQL 16 임시 DB: migration 최초 적용·동일 checksum 재실행 통과, 실제 repository/API를 통한 카탈로그 조회 통과. 검수 데이터 정리 완료.
- 런타임 의존성 `npm audit --omit=dev`: 보고된 취약점 0개. 기존 개발 도구 의존성의 audit 항목은 별도 업그레이드 대상으로 남긴다.
- 원격 DB 생성·Production migration·실서비스 배포는 하지 않았다.

### 공개 모집·참여 후속 — 2026-10-05

[구현 및 검증](COHORT-JOIN-IMPLEMENTATION.md): 공개 모집 목록/상세, 참여·취소 API와 `/recruitment` 화면 연결 완료. Vitest 212개·DB/HTTP 58개 통과. 실제 모집 데이터·운영 최소 인원·공급자 E2E·원격 배포는 아직이다. 기존 데모 기록은 유지하며 다음은 실제 인증/면제권 저장이다.
