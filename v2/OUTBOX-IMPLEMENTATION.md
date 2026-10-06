# outbox 처리와 앱 내부 알림

2026-10-05. 사용자가 첫 처리 채널을 **앱 내부 알림**으로 선택했다. 코호트 시작·최소 인원 미달 모집 취소를 참여자에게 안내한다. 이메일·카카오 발송은 연결하지 않는다.

## 처리 흐름

1. 기존 코호트 시작 판단 transaction이 `cohort.started` 또는 `cohort.cancelled`를 outbox에 저장한다.
2. worker 전용 DB 역할이 실행 가능한 작업을 60초 동안 임대한다. 임대마다 새 UUID 토큰과 시도 횟수를 기록한다.
3. DB 함수가 이벤트와 코호트 상태를 검증하고 유효 참여자에게 내부 알림을 저장한다. 알림·outbox 완료·감사를 한 transaction으로 처리한다.
4. 실패하면 30·60·120·240초 후 재시도한다. 다섯 번째 실패 또는 다섯 번째 임대 중 중단 후 만료되면 실패 상태로 보관한다. 알 수 없는 이벤트·잘못된 payload는 즉시 실패로 보관한다.

`notifications`의 `(outbox_id,user_id)` 유일 제약과 원자적 완료 처리로 내부 알림 중복을 막는다. 다른 worker가 맡은 행은 SKIP LOCKED로 건너뛰고, 만료되거나 교체된 임대 토큰으로 완료·실패 처리를 할 수 없다. [PostgreSQL SELECT 문서](https://www.postgresql.org/docs/16/sql-select.html)의 큐 소비자 잠금 방식에 따른다.

현재 처리 대상은 `cohort.launch:<cohortId>` 이벤트 두 종류다. 취소·이탈한 참여와 정지·탈퇴 요청·익명화 계정은 새 알림 대상에서 제외한다. 발송 주소나 토큰을 읽지 않고 payload의 자유 텍스트도 알림에 복사하지 않는다. 나중에 외부 발송을 추가한다면 공급자의 멱등 처리 등 별도 중복 방지가 필요하다.

## 앱 알림

- 계정 화면의 **내 알림** → `/notifications`에서 시작·모집 취소 안내와 활동/모집 링크를 제공한다.
- `GET /v1/me/notifications`: 세션 검증 후 본인 알림만 최신순 최대 50개. 계정 ID query를 받지 않고 `Cache-Control: no-store`를 사용한다.
- 빈 상태·오류·새로고침을 제공하며 세션 만료 시 표시하던 알림을 지운다. 읽음 상태·푸시·리마인더는 이번 범위에 없다.

## 권한과 실행

앱은 알림 SELECT만 추가로 허용한다. worker는 업무/세션/알림/outbox 테이블에 직접 접근할 수 없으며 상태 조회·임대·내부 알림 처리·실패 처리 함수 4개만 실행한다. 앱 역할은 worker 함수를 실행할 수 없다. 기존 권한 설정·검증 로직을 공통화하되 각 역할의 명시적 허용 목록과 이름 검증은 분리했다.

Preview worker 연결값은 Git에서 제외하고 권한 600인 `backend/.env.preview-worker`에 보관한다. **앱의 Vercel 환경에 worker 연결값을 넣지 않는다.** 관리자 연결은 migration과 역할 설정에만 쓴다.

프로젝트 루트에서 상태만 확인:

```sh
node --env-file=backend/.env.preview-worker backend/scripts/process-outbox.cjs
```

알림을 실제 처리할 때:

```sh
node --env-file=backend/.env.preview-worker backend/scripts/process-outbox.cjs --apply --batch=20
```

기본은 상태 조회이며 `--apply`가 있어야 처리한다. 실행당 기본 20건·최대 100건이다. 처리 직전에 한 건씩 임대해 대기 중 임대가 만료되는 것을 줄인다. 출력은 처리 개수·상태 개수뿐이며 payload·계정 ID·토큰을 출력하지 않는다. 마지막 임대가 소진된 행을 실패로 전환한 경우 해당 실행은 조기에 끝날 수 있고 다음 실행에서 남은 대기열을 계속 처리한다.

`backend/.env`에 연결값을 설정한 환경에서는 `npm --prefix backend run outbox:work -- --apply --batch=20`도 가능하다. 역할 신규 설정은 DIRECT_DATABASE_URL·WORKER_ROLE·WORKER_ROLE_PASSWORD를 관리 환경에 설정하고 `npm --prefix backend run db:provision-worker`로 실행한다. 기존 역할 비밀번호는 변경하지 않는다.

현재는 **수동 CLI**다. 자동 스케줄·공개 작업 endpoint·상시 worker 배포는 설치하지 않았다. 실패 이벤트는 삭제하거나 성공으로 간주하지 않는다. 원인 확인 후 별도 운영 절차로 재처리해야 하며, 자동으로 실패 상태를 되돌리는 기능은 없다. 코호트 시작 판단 자체의 스케줄도 후속이며 현재 첫 조회/쓰기에서 판단한다.

## 검증과 Preview 적용

- 제한된 앱·worker 로그인으로 DB/HTTP **121개** 통과. 서로의 금지 권한, 동시 임대, 잠긴 행 건너뛰기, 임대 만료/교체, worker 중단, 최대 시도, 지수 대기, 원자적 rollback, 중복 방지, 알림 소유권·50개 제한 검증.
- Vitest **250개 / 25개 파일**, API 계약 **17개 / 47경로**, 프런트·서버 타입 검사·빌드 통과.
- 모바일 360/390/430px의 알림·빈 상태·만료·기존 알림 제거 **12개 검수** 통과. 가로 넘침·페이지 오류 없음. 테스트 API 응답 기반이며 실계정 검수는 아니다. 재현: `qa/scripts/notifications-mobile.cjs`.
- 임대 토큰 비교를 제거한 변이가 회귀 테스트에 잡혔다. 복원 후 전체 DB 검증 통과.
- Neon Preview에 `007_outbox_notifications.sql`, 앱 SELECT 및 `sixtysix_worker_preview` 역할 적용 완료. 001~006 checksum 유지. DB 객체 26테이블·8함수 기준 앱/worker 권한 검증 통과(각 역할이 모든 객체에 접근한다는 뜻이 아니다).
- 원격 상태 조회는 ready/leased/deferred/delivered/failed 모두 **0건**. 원격 알림 생성·회원/모집 seed·외부 발송·Vercel 환경 변경·앱 배포·Production 변경·commit/push는 하지 않았다.

다음 독립 작업은 운영자 모집 생성/관리다. 공급자 준비 후 실제 로그인 검수와 앱 배포, worker 실행 주기 연결을 진행한다.
