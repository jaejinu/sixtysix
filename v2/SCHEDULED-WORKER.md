# 자동 시작 판단·알림 처리 스케줄

## 현재 운영 경로 — Neon Function 예약 (2026-10-22 전환 완료)

Preview·Production worker 모두 **Neon Functions 예약 trigger**가 15분 간격으로 실행한다. GitHub Actions 예약은 `WORKER_SCHEDULE_ENABLED=false`로 중지했고, workflow 자체는 Preview 수동 복구용으로 `active` 상태를 유지한다.

| 항목 | Preview | Production |
|---|---|---|
| 프로젝트 / 브랜치 | `twilight-scene-60200159` / `br-dawn-shadow-b3ozdovu` | `fancy-salad-12582763` / `br-sweet-mouse-az0j2men` |
| worker 비밀 파일 | `backend/.env.preview-worker` | `backend/.env.production-worker` |
| trigger | `sixtysix-preview-tick` | `sixtysix-production-tick` |

공통: 함수 `sixtysixworker`(nodejs24), `2,17,32,47 * * * *` UTC, Singapore, CLI 프로필 `sixtysix-preview`(브라우저 OAuth, 같은 Vercel 관리 조직의 두 프로젝트에 모두 접근).

`neon.ts`는 `WORKER_DATABASE_URL`의 역할 이름(`sixtysix_worker_preview`/`_production`)에서 대상을 정한다. 그래서 Production 비밀 파일로 Preview 이름의 trigger를 만들거나 그 반대가 되지 않는다. 새 브랜치 첫 배포는 `NEON_TRIGGER_ENABLED=false`로 예약을 끈 채 올리고 403 확인 뒤 변수 없이 다시 apply한다.

```sh
cd backend
# Production 예: 대상 프로젝트·브랜치·비밀 파일을 항상 함께 명시한다
npx neonctl config plan  --profile sixtysix-preview --project-id fancy-salad-12582763 --branch br-sweet-mouse-az0j2men --config neon.ts --env .env.production-worker
npx neonctl config apply --profile sixtysix-preview --project-id fancy-salad-12582763 --branch br-sweet-mouse-az0j2men --config neon.ts --env .env.production-worker --no-env-pull
```

전환 검증 (시각은 UTC):

- `neon config plan`: 함수 1개·trigger 1개 추가만 표시, 그 외 변경 없음. 배포는 `--no-env-pull`로 로컬 비밀 파일을 건드리지 않았다.
- 배포 직후(예약 꺼짐): `GET` 405, 헤더 없는 `POST` 403, `X-Neon-Trigger-Invocation-Id` 위조 + 정상 envelope `POST` 403(대소문자 두 형태). 예약 활성화 재배포 후 위조 요청 다시 403.
- Production(2026-10-22 01:39 KST 배포): 같은 순서로 일반 403·위조 403·GET 405, 활성화 재배포 후 위조 403.
- 실제 예약 실행 연속 2회 — 실패 0, 예산 초과 없음 (Preview):

| scheduledAt | 지연 | 처리 | 시작 판단 | 전달 |
|---|---|---|---|---|
| 2026-10-21 16:17:00 | 535ms | 150ms | due 0 | 0 (failed 0) |
| 2026-10-21 16:32:00 | 1,102ms | 934ms | due 0 | 0 (failed 0) |

실행 기록 확인:

```sh
cd backend
npx neonctl logs query --source function --since 2h --sort-order asc \
  --profile sixtysix-preview --project-id twilight-scene-60200159 --branch br-dawn-shadow-b3ozdovu -o json
```

`neon.function.app` scope의 `{"event":"scheduled_worker",…}` 줄이 한 번의 예약 실행이다. trigger 자체(`neon triggers get`)는 다음 실행 시각만 보여주고 과거 실행 이력은 없다.

설정 변경은 `backend/neon.ts`를 고친 뒤 `neon config plan` → `neon config apply --no-env-pull` 순서로 한다. 콘솔이나 `neon triggers enable/disable`로만 바꾸면 다음 apply가 파일 값으로 되돌린다.

**되돌리기:** `NEON_TRIGGER_ENABLED=false`로 apply (Preview) → GitHub `WORKER_SCHEDULE_ENABLED=true`. 두 예약이 동시에 켜져도 DB 행 잠금·outbox 임대로 중복 처리는 막히지만 CU 사용량이 늘어난다.

## 2026-10-08: 예약 지연 조사와 Neon 대체 경로

GitHub schedule 8건은 모두 성공했지만, 2026-10-05 22:09 UTC부터 10월 7일 13:14 UTC까지 실행 간격이 **203~429분**이었다. 최신 실행은 생성 6초 뒤 runner가 시작하고 14초 뒤 종료했다. 따라서 관측된 수 시간 공백은 worker 처리 시간이 아니라 예약 이벤트 생성 단계에 있다. GitHub 내부 지연의 구체 원인까지 확인한 것은 아니다. [공식 지연/누락 안내](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows).

기존 Preview 프로젝트 `twilight-scene-60200159`, 브랜치 `br-dawn-shadow-b3ozdovu`는 Singapore이며 Neon Functions를 사용할 수 있다. `pg_cron`도 설치 가능하지만 DB가 잠들면 실행되지 않으므로 이를 켜는 것으로 해결하지 않는다. [pg_cron 제한](https://neon.com/docs/extensions/pg_cron), [절전 상태에서도 실행되는 Function Trigger](https://neon.com/docs/compute/functions/triggers/schedule).

### 준비된 구현 (당시 기록 — 원격 활성화는 위 장에서 완료)

후속 사용자 ‘진행해줘봐’에 따라 권장한 무료 Preview **15분 간격**을 선택해 `backend/neon.ts`를 `2,17,32,47 * * * *`로 변경했다. 신규 예약은 검증 전까지 비활성이다. 현재 세션은 네트워크 제한·`.git` 읽기 전용으로 바뀌어 CLI 연결/배포와 commit/push를 진행할 수 없다. 권한이 허용되는 세션에서 아래 전환 절차를 재개한다.

- `backend/functions/scheduled-worker.mjs`: 기존 최소 권한 worker·SQL·outbox 로직을 재사용한다. 자동 주입되는 owner `DATABASE_URL`은 사용하지 않고 `WORKER_DATABASE_URL`만 허용한다. DB grant 검사·배치 20개·90초 처리 예산을 유지한다.
- `scheduled-handler.mjs`: Neon edge가 외부 입력에서 제거하는 `X-Neon-Trigger-Invocation-Id`를 검증한다. **다른 호스팅에 그대로 배포하면 안 된다.** POST/경로/예약 envelope 검증, 겹치는 실행 재시도, 실패 시 503, 비밀값 없는 지연·처리시간 로그를 제공한다. [플랫폼의 헤더 보증](https://neon.com/docs/compute/functions/triggers/overview#confirming-a-request-came-from-neon).
- `backend/neon.ts`: 함수·예약을 선언하며 최초 상태는 `enabled: false`다. 타 서비스·DB 설정을 선언하지 않는다. 신규 원격 함수의 일반 요청과 위조 헤더 요청이 모두 403인지 확인한 뒤 활성화한다.
- 로컬 단위 검증 6개 통과. 실제 Preview worker 연결로 handler 호출 200, 추가 시작/전달 0·실패 0 확인. 이는 실제 예약 호출 검증과 다르다.
- Neon Free의 DB 한도는 월 100 CU-hours, 절전은 무활동 5분 후다. 0.25 CU를 5분 간격으로 계속 깨우면 월 약 180~186 CU-hours가 될 수 있다. 무료 Preview는 15분 간격 선택을 제안했으며 사용자 답변을 기다린다. 유료 전환은 자동 진행하지 않는다. [요금제 근거](https://neon.com/docs/introduction/plans).

### 배포·전환 절차

1. Neon CLI를 승인받은 계정/프로필로 인증한다. 광범위한 계정 권한이 필요하므로 콘솔 로그인만으로 승인됐다고 간주하지 않는다.
2. `backend/`에서 대상 프로젝트·브랜치를 명시해 `neon config plan --config neon.ts --env .env.preview-worker` 결과를 검토한다. 계획/에러 출력에 비밀값이 포함되지 않도록 처리한다. `--no-env-pull`로 기존 로컬 비밀 파일을 보존한다.
3. 동일 대상에 배포하고 함수 READY 및 일반/위조 HTTP 요청 차단을 검증한다. CLI profile은 `sixtysix-preview`를 사용한다.
4. 승인된 주기로 예약을 활성화하고 최소 연속 2회의 실제 trigger 로그에서 예약 시각·실행 시각·지연·실패 수를 확인한다.
5. 새 예약 검수가 끝나면 GitHub `WORKER_SCHEDULE_ENABLED=false`로 중복 예약을 중지한다. 기존 수동 workflow는 복구용으로 유지한다. 전환 실패 시 기존 예약을 유지하며 완료로 보고하지 않는다.

아래는 GitHub 경로를 구축한 당시 기록이다. 실제 전환 여부는 PROGRESS 최신 장을 따른다.

## 활성화 기록 — 2026-10-06

- 사용자 승인으로 worker 파일을 `d9a89fd`로 main에 반영했다. 앱 UI/API 미커밋 구현은 포함하지 않았다.
- workflow `active`, 저장소 변수 `WORKER_SCHEDULE_ENABLED=true` 확인.
- [조회 실행](https://github.com/jaejinu/sixtysix/actions/runs/37333104927)과 [실제 처리 모드](https://github.com/jaejinu/sixtysix/actions/runs/37333740790) 모두 성공. 모집 대상·알림·실패 0건.
- 첫 예약 이벤트는 아직 미관측이다. 위 두 실행은 수동 검증이다.
- 연결된 Vercel V1 배포 완료, V2는 Ignored Build Step으로 건너뜀. Production DB 변경 없음.

2026-10-06. 사용자 선택은 **GitHub Actions 5분 간격**이다. Preview DB에 migration 009와 worker 권한을 적용했다. GitHub Actions의 실행 여부는 저장소 변수 `WORKER_SCHEDULE_ENABLED`로 관리한다.

## 구현

한 번의 tick이 다음 순서로 처리한다.

1. 시작 시각이 지난 미판정 모집을 최대 20개 판단한다. 최소 인원 충족이면 시작, 미달이면 취소한다.
2. outbox 최대 20개를 처리해 앱 내부 알림을 저장한다.
3. 남은 시작 대상·가장 오래된 시작 시각·대기열 상태를 집계해 출력한다.

`--batch`는 1~100이며 시작 판단과 outbox 각각의 한도다. 기본은 조회만 한다. 실제 처리는 `--apply`가 필요하다. outbox는 90초 예산이 지나면 다음 임대를 중단하며 실행 중 SQL은 10초 제한이다. GitHub job은 5분 제한이다.

migration 009의 `settle_due_cohorts`는 기존 앱과 같은 코호트 행을 ID 순으로 잠근다. 이미 잠긴 행은 건너뛰며 시작/취소·outbox·감사를 같은 transaction으로 저장한다. 앱의 첫 조회/쓰기 판단과 동시에 실행돼도 결정과 이벤트는 한 번만 생성된다. 취소·판정 완료·미래 모집은 제외한다. 참여 슬롯은 기존 요청 경로에서 정리한다.

시작 판단과 알림 전달은 별도 transaction이다. 시작 직후 프로세스가 중단되면 outbox가 남고 다음 tick에서 알림만 이어 처리한다. outbox 임대·재시도·중복 방지는 [기존 worker](../backend/scripts/process-outbox.cjs)를 그대로 사용한다. 실패 보관 이벤트가 있으면 CLI는 집계 결과를 출력한 뒤 `OUTBOX_FAILED_JOBS_PRESENT`와 종료 코드 1을 반환해 GitHub 실행에서 드러나게 한다. 실패 이벤트를 자동 삭제하거나 성공 처리하지 않는다.

## 실행과 권한

프로젝트 루트에서 상태만 확인:

```sh
node --env-file=backend/.env.preview-worker backend/scripts/run-scheduled-work.cjs
```

실제 한 배치 처리:

```sh
node --env-file=backend/.env.preview-worker backend/scripts/run-scheduled-work.cjs --apply --batch=20
```

`backend/.env`를 구성한 환경에서는 `npm --prefix backend run worker:tick -- --apply`도 가능하다. WORKER_DATABASE_URL만 사용하며 앱/소유자 연결로 대체하지 않는다. 역할 이름과 전체 권한을 검사한 후 실행한다. 앱 역할은 시작 배치·작업 상태 함수 실행이 거부된다. worker에는 기존 함수 4개에 시작 판단·상태 조회 2개를 추가했으며 직접 테이블 권한은 없다. 출력에 URL·토큰·계정 ID·payload를 넣지 않는다.

## GitHub 설정

워크플로: [`.github/workflows/preview-worker.yml`](../.github/workflows/preview-worker.yml)

- cron: `2-57/5 * * * *` (매시 02·07·…·57분, UTC). 매 정시 부하를 피한 5분 간격이며 한국 시간 분 간격도 동일하다.
- 저장소 `jaejinu/sixtysix`, main 브랜치만 실행한다. `preview-worker` 환경의 배포 브랜치도 main으로 제한했다.
- 전용 환경에 `WORKER_DATABASE_URL` Secret 등록 완료. 앱 Vercel 환경에는 worker 연결을 추가하지 않았다.
- 저장소 변수 `WORKER_SCHEDULE_ENABLED=true`이면 cron job이 실행되며, `false`이면 다음 예약 작업을 건너뛴다.
- 수동 `workflow_dispatch`의 기본 `apply=false`는 상태만 조회한다. 수동 실제 실행은 apply를 명시한다.
- GitHub concurrency는 같은 worker job 중복을 줄이고 진행 중 작업을 취소하지 않는다. DB 잠금/임대가 수동 CLI와의 중복도 방어한다.
- actions/checkout·setup-node는 확인한 v4 commit SHA로 고정했다. 저장소 권한은 contents:read, checkout 자격 증명 저장 해제. Secret은 마지막 실행 step에만 전달한다. 의존성은 backend lockfile로 `npm ci --omit=dev --ignore-scripts`를 사용한다.

GitHub의 예약 실행은 기본 브랜치의 workflow를 사용하며 최소 간격은 5분이다. 부하 등에 따라 지연될 수 있어 정각 실행 보장이 아니다. 앱의 지연 시작 판단은 유지한다. [GitHub 스케줄 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule). Vercel Cron은 production 배포를 대상으로 하므로 현재 Preview worker와 분리해 구성했다. [Vercel Cron 문서](https://vercel.com/docs/cron-jobs).

## 검증·적용 상태

- DB/HTTP **140개**, Vitest **268개 / 27개 파일**, 프런트·서버 타입 검사·빌드 통과.
- 실제 제한된 앱/worker 로그인으로 조회 무변경, 시작/미달 취소, 앱과 경합, 병렬 worker·행 잠금 건너뛰기, 감사 실패 rollback, 중단 후 재개, 기존 취소 보존, SQL 옵션/권한 거부, CLI 실패 종료·비밀값 비노출 확인.
- 최소 인원 경계를 `<`에서 `<=`로 바꾼 변이를 검증이 탐지했다. 복원 후 전체 DB 테스트 통과.
- actionlint **1.7.12**의 workflow 문법·표현식 검사 통과(shellcheck 검사 제외). 화면 변화는 없어 기존 모바일 QA를 반복하지 않았다.
- Neon Preview migration **009** 및 worker 최소 grant 적용. 001~008 checksum 유지. 26테이블·13함수 기준 앱/worker 권한 검증 통과.
- 실제 Preview에서 CLI 기본 조회 검증: dueCohorts/outbox 모두 **0건**, 변경 없음. 활성화 전 검증에서는 실제 모집 판단·알림 처리·Production 변경을 하지 않았다.

## 활성화·중지 절차

1. 검토한 workflow와 worker 실행에 필요한 backend 파일을 main에 반영한다. 다른 미커밋 작업을 무조건 함께 올리지 않는다. 이 저장소는 main push에 Vercel 배포가 연결되어 있으므로 반영 범위를 확인한다.
2. Actions의 **Preview scheduled worker**를 main에서 `apply=false`로 실행해 GitHub runner → DB 연결을 검증한다.
3. 조회가 통과하면 `WORKER_SCHEDULE_ENABLED=true`로 바꾸고 예약 실행 성공을 확인한다. 실행 결과는 GitHub Actions에서 확인한다.
4. 중지할 때는 변수만 false로 바꾼다. 이미 진행 중인 작업의 강제 중단은 임대 복구에 맡길 수 있지만 다음 예약 시작은 차단된다.

필요 파일은 workflow, backend/package.json·package-lock.json, scripts/run-scheduled-work.cjs·process-outbox.cjs·worker-privileges.cjs·runtime-privileges.cjs·verify-runtime.cjs다. DB migration과 운영 문서도 함께 버전 관리해야 재현할 수 있다. 활성화 후 공급자 준비에 맞춰 실제 로그인·운영자 지정·카탈로그 검수·Preview 앱 배포를 이어간다.
