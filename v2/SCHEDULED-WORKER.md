# 자동 시작 판단·알림 처리 스케줄

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
