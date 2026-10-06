# 런타임 DB 권한 분리

> **최신 — 5분 worker 준비 (2026-10-06):** [자동 시작 판단·outbox 통합 실행](SCHEDULED-WORKER.md) 및 Preview migration 009·worker 권한 적용 완료. DB/HTTP 140개·Vitest 268개 통과. GitHub 전용 환경/Secret은 등록했지만 스케줄 변수는 false이며 main 반영·실제 활성화는 남았다.


> **최신 — 운영자 모집:** [생성·목록·시작 전 취소](OPERATOR-COHORTS.md)와 Preview migration 008 적용 완료. admin 역할·최근 재인증을 확인하는 제한된 함수만 앱에 허용한다. 26테이블·11함수 권한 검증, DB/HTTP 132개·Vitest 259개 통과. 실제 운영자 지정·모집 생성·앱 배포는 하지 않았다.


> **최신 — outbox·내부 알림:** [OUTBOX-IMPLEMENTATION.md](OUTBOX-IMPLEMENTATION.md) 구현·Preview migration 007 적용 완료. 앱과 worker 권한을 분리하고 26테이블·8함수 기준 검증했다. worker 상태 조회 0건, 수동 CLI만 제공하며 실제 처리·자동 스케줄·앱 배포는 하지 않았다. 최신 DB/HTTP 121개·Vitest 250개 통과.


> 2026-10-05 후속: [인증 감사·만료 정리](AUTH-AUDIT-CLEANUP.md)의 migration 006과 최소 grant를 Neon Preview에 적용했다. 런타임 25테이블·4함수 검증, 정리 dry-run 0행. 원격 실제 삭제·스케줄 설치·앱 배포는 하지 않았다. DB/HTTP 최신 검증은 102개다.


## 개요

2026-10-05. API가 migration 소유자 권한으로 실행되지 않도록 SQL로 생성한 별도 로그인 역할에 필요한 조회·열 단위 쓰기만 부여한다. 기존 migration은 수정하지 않는다. 실제 공급자 설정은 준비 상태 확인 후 별도로 검수한다.

## 작업 범위

- 명시적인 테이블/열 허용 목록과 반복 실행 가능한 역할 설정 도구.
- 계정 차단 해제·정책/모집 생성·운영자 승격·기록 수정/삭제·감사 수정/삭제·DDL 금지.
- 샘플 사진의 잠금 조회는 고정 SQL·고정 search_path의 좁은 함수로 제공해 카탈로그 수정 권한을 주지 않는다.
- 실제 PostgreSQL 로그인 역할로 기존 인증/모집/활동 통합 테스트를 실행하고 금지 동작도 검증한다.
- 앱과 migration 연결을 구분하고 원격 적용·Vercel 환경 전환 여부를 완료 기록에 명시한다.

## 근거와 경계

PostgreSQL의 행 잠금 조회도 UPDATE 권한을 요구한다. 계정 잠금에는 display_name 한 열의 UPDATE를 허용하고 샘플 사진은 잠금 전용 함수를 사용한다. 권한은 현재 구현에 필요한 범위이며, 행별 사용자 접근 제어는 기존 서버 검사 책임이다. RLS를 구현한 것은 아니다. [PostgreSQL SELECT](https://www.postgresql.org/docs/16/sql-select.html), [권한](https://www.postgresql.org/docs/16/ddl-priv.html)

## 진행

로컬 구현·검증 및 **기존 Neon Preview 적용 완료**. Production은 변경하지 않았다. 사용자 확인에 따라 Resend 도메인·카카오 앱은 아직 준비 전이며 실제 공급자 검수는 보류한다.

## 적용 내용

- `005_runtime_photo_lock.sql`: 샘플 사진을 잠금 조회하는 함수. 기존 001~004 checksum 유지.
- `backend/scripts/runtime-privileges.cjs`: 명시적 SELECT·INSERT 열·UPDATE 열·DELETE 허용 목록. 감사/outbox는 필요한 열의 INSERT만 허용하고, 기록은 조회/생성만 가능하다. 자동으로 새 테이블에 권한을 부여하지 않는다.
- `db:provision-runtime`: SQL로 LOGIN/NOINHERIT/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS 역할을 만들고 테이블 권한과 남은 열 권한을 초기화한 뒤 허용 목록을 재적용한다. 기존 역할의 비밀번호는 바꾸지 않는다. 소유권·역할 멤버십·상위 권한이 있으면 거부한다.
- `db:verify-runtime`: 실제 권한과 허용 목록을 비교한다. PUBLIC·열 grant·grant option·함수 실행·필수 객체 누락까지 검사하며 불일치 시 실패한다.
- API는 **APP_DATABASE_URL만 사용**한다. `DATABASE_URL`/`DIRECT_DATABASE_URL` fallback은 없으며, 소유자 이름이나 사용자/role을 덮어쓰는 URL 옵션을 거부한다.

## 검증

- Vitest **231개 / 22개 파일**, 프런트·서버 타입 검사·Vite 빌드 통과.
- 로컬 PostgreSQL DB/HTTP **89개** 통과. 기존 68개 기능 검증을 별도 런타임 로그인으로 실행하며, fixture 생성·시간 조정·제약 주입만 소유자 계정을 쓴다.
- DDL·임시 테이블·운영자 승격·계정 차단 해제·기록 수정/삭제·감사 수정/삭제·카탈로그/정원 변경·migration 이력 열람·TRUNCATE 거부 확인.
- 재적용, 오래된 열 grant 제거, 미래 테이블 접근 거부, 함수 누락/역할 멤버십 감지, 사진 잠금 중 retire 동시 요청 차단 확인.
- 원격 Preview: 실제 런타임 pooled 연결로 테이블 25개/함수 3개의 권한 비교 통과. 로컬 Fastify → 원격 DB의 readiness·카탈로그 API 읽기 통과. 테스트 회원/코호트는 생성하지 않았다.

## 현재 Preview 환경

- DB: 기존 `sixtysix-v2-preview`, Free, Singapore. 회원 0·코호트 0인 것을 확인한 뒤 적용했다.
- 역할: `sixtysix_runtime_preview`. migration 소유자와 별도 로그인이다.
- Vercel `sixtysix-v2`의 Preview: **APP_DATABASE_URL 한 개**, Secret 타입. 기존 Marketplace 프로젝트 연결을 해제해 DATABASE_URL·POSTGRES_*·PGPASSWORD 등 소유자 자격 증명의 자동 주입을 제거했다.
- Neon 리소스는 삭제하지 않았다. Available 상태이며 현재 연결된 프로젝트는 없다. 앱은 수동 등록한 런타임 연결값으로 연결한다. Marketplace에 재연결하면 소유자 자격 증명이 다시 주입될 수 있다.
- 원격 앱 배포는 이번에 하지 않았다. 환경 변수 변경은 기존 배포에 소급 적용되지 않는다. 실제 공개 전에 새 배포와 이전 배포의 접근/비밀값 수명을 함께 점검한다.
- 비밀값은 Git 제외·권한 600인 `backend/.env.preview-admin`(migration 전용)과 `sixtysix-v2/.env.preview-runtime`(앱 전용)에 보관했다. 내용을 채팅/문서/로그에 출력하지 않는다. Vercel 함수에는 admin 파일을 업로드하지 않는다.

## 실행 및 후속 migration

```sh
# backend/에서: 소유자 연결로 migration만 적용
node --env-file=.env.preview-admin scripts/migrate.cjs

# backend/.env에는 DIRECT_DATABASE_URL, RUNTIME_ROLE, RUNTIME_ROLE_PASSWORD를
# 안전하게 설정한 뒤 신규 역할 설정 또는 기존 역할의 grant 재적용
npm --prefix backend run db:provision-runtime

# sixtysix-v2/에서: 런타임 계정 읽기 검수
node --env-file=.env.preview-runtime --import tsx ../backend/scripts/verify-preview-db.mjs
```

신규 migration이 테이블·열·함수를 추가하면 허용 목록을 검토하고 소유자 환경에서 grant를 다시 적용한 후 런타임 검증을 통과시킨다. 함수 환경/빌드에서는 migration을 실행하지 않는다. 테스트 DB는 CREATEDB와 CREATEROLE 권한을 가진 로컬 계정으로만 생성하며 운영 연결을 테스트 주소로 넣지 않는다.

## 복구와 다음 작업

역할 설정은 한 transaction이며 실패하면 rollback된다. 이미 적용한 005 함수는 앱 데이터나 기존 테이블을 변경하지 않는다. 연결값 문제는 로컬 runtime 파일로 확인·재등록하고, 권한 누락은 허용 목록과 grant를 수정한다. 소유자 연결로 앱을 되돌리는 대신 실패한 권한을 확인한다. migration 파일을 수정하거나 DB를 재생성하지 않는다.

다음 독립 개발 항목은 인증 감사 기록과 만료 데이터 정리, 업무 남용 제한·outbox 처리다. 실계정 검수는 Resend 발송 도메인/발신자와 카카오 앱·고정 callback 주소가 준비된 후 진행한다.
