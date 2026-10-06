# SIXTYSIX DB·API 계약 도구

실제 Fastify 서버는 `../sixtysix-v2/server/`, Vercel 진입점은 `../sixtysix-v2/api/`에 있습니다. 이 폴더는 DB migration, OpenAPI와 운영·검증 도구를 관리합니다. 현재 진행 상태는 [PROGRESS.md](../PROGRESS.md)를 따릅니다.

## 구성

| 경로 | 역할 |
|---|---|
| `db/001_initial.sql` ~ `009_scheduled_cohort_launch.sql` | 업무·인증·감사·알림·운영자·예약 실행 migration |
| `db/verify.sql` | 테스트 사실을 만들고 rollback하는 DB 제약 검증 |
| `openapi.json` | OpenAPI 3.0.3 계약 |
| `scripts/` | migration·권한·통합 검증·정리·worker·배포 검사 |
| `auth-spike/` | 인증 후보 라이브러리 호환성 검증 |

인증은 provider identity 기반 서비스로 구현했습니다. Better Auth는 후보 검증용 의존성으로 남아 있으며 앱 런타임에 채택한 것이 아닙니다. [검증 결과](../v2/AUTH-SPIKE-RESULTS.md)를 참고하세요.

## 로컬 검증

프로젝트 루트에서 실행합니다. Node.js 22를 사용합니다.

```bash
npm --prefix backend ci
npm --prefix backend run validate:api
npm --prefix backend run test:auth-spike
```

OpenAPI 검증은 문법·참조·계약 사례를 검사하며 서버 동작이나 DB 통합 검증을 대신하지 않습니다.

DB 통합 검증은 로컬 PostgreSQL의 `AUTH_TEST_DATABASE_URL`을 설정한 뒤 실행합니다. CREATEDB·CREATEROLE 권한이 필요하며 매번 생성한 전용 DB와 역할을 정리합니다. 실제 서비스 요청은 제한된 런타임 로그인으로 검사하며 이메일·카카오 공급자를 호출하지 않습니다.

```bash
npm --prefix sixtysix-v2 run test:auth-core
```

## DB 적용과 운영 명령

`backend/.env.example`을 참고해 대상 환경을 설정합니다. 기존 비밀 파일은 보존하며 앱·소유자·worker 연결을 구분합니다. migration은 `DIRECT_DATABASE_URL`, 앱은 `APP_DATABASE_URL`, worker는 `WORKER_DATABASE_URL`을 사용합니다.

| 명령 (`npm --prefix backend run …`) | 동작 |
|---|---|
| `db:migrate` | SQL 적용 및 checksum 이력 기록 |
| `db:provision-runtime` | 앱 런타임 권한 준비 |
| `db:verify-runtime` | 앱 권한 검증 |
| `db:provision-worker` | worker 권한 준비 |
| `auth:cleanup` | 만료 인증 데이터 정리, 기본 dry-run |
| `outbox:work` | 알림 outbox 처리, 기본 조회 |
| `worker:tick` | 코호트 시작 판단·알림 통합 실행, 기본 조회 |

변경 명령은 대상 DB와 각 운영 문서의 옵션을 확인한 뒤 실행합니다. 초기 SQL을 기존 DB에 임의 재적용하지 않습니다. migration runner는 기존 수동 적용 이력을 자동 채택하지 않습니다.

## 구현·운영 문서

- 정책과 기술 구성: [B0 명세](../v2/BACKEND-B0-SPEC.md), [기술 아키텍처](../v2/BACKEND-TECH-ARCHITECTURE.md)
- 인증: [코어](../v2/AUTH-CORE-IMPLEMENTATION.md), [이메일](../v2/EMAIL-AUTH-IMPLEMENTATION.md), [카카오](../v2/KAKAO-AUTH-IMPLEMENTATION.md), [감사·정리](../v2/AUTH-AUDIT-CLEANUP.md)
- 업무: [모집·참여](../v2/COHORT-JOIN-IMPLEMENTATION.md), [인증·기록](../v2/CHECKIN-RECORD-IMPLEMENTATION.md), [요청 제한](../v2/BUSINESS-RATE-LIMITS.md), [운영자 모집](../v2/OPERATOR-COHORTS.md)
- 운영: [DB 권한 분리](../v2/RUNTIME-DB-IMPLEMENTATION.md), [outbox·알림](../v2/OUTBOX-IMPLEMENTATION.md), [예약 worker](../v2/SCHEDULED-WORKER.md), [Vercel 설정](../v2/VERCEL-BACKEND-SETUP.md)

기능별 문서는 해당 작업 당시의 검증 기록을 포함합니다. 배포·공급자 설정·worker 활성화의 현재 재개 기준은 PROGRESS의 0장과 28장을 우선합니다.
