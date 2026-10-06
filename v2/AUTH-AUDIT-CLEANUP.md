# 인증 감사와 만료 데이터 정리

## 개요

2026-10-05. 계정 인증의 중요 변경을 감사 기록과 함께 저장하고, 만료된 인증 임시 데이터를 제한된 배치로 정리한다. 앱 런타임의 직접 DELETE 권한은 추가하지 않는다.

## 범위와 결정

- 로그인·재인증·수단 연결/해제·로그아웃 성공은 계정 변경과 같은 transaction으로 감사 기록을 남긴다. 실패하면 변경도 rollback한다.
- 인식한 인증 거부는 고정 오류 코드만 기록한다. 이메일·카카오 ID·인증번호·세션/브라우저 토큰·해시·IP·요청 본문은 감사에 넣지 않는다. HTTP 요청 ID는 서버가 만든 UUID만 사용한다.
- 정리 대상은 email_challenges·oauth_states·auth_intents·auth_proofs·link_intents·auth_sessions·auth_rate_limits다. 만료/회수 후 **24시간 유예**를 둔다. 인증의 유효 기간을 늘리는 설정이 아니며 이미 무효인 임시 데이터의 정리 지연이다.
- 회원·인증 수단·습관 기록·업무 멱등 응답·감사·outbox는 이번 정리에서 삭제하지 않는다. 해당 보관 정책은 별도 운영 결정이다.
- 한 번에 전체 최대 500행, 기본 100행. 참조가 남은 부모는 보존하고 잠긴 행은 건너뛴다. 기본 실행은 dry-run, 실제 정리는 명시적인 apply 옵션으로 실행한다.
- 자동 스케줄이나 공개 HTTP 작업 endpoint는 추가하지 않는다. 수동 작업 CLI를 제공하고 스케줄은 배포·운영 주기를 정한 후 연결한다.

## 검증 범위

감사 원자성/거부/중복 로그아웃/HTTP 요청 격리/비밀값 미포함, 만료·유예 경계/참조 유지/삭제 순서/배치 제한/동시 요청·잠금/rollback/기존 권한 방어를 실제 PostgreSQL에서 확인한다. Preview에는 검증한 migration과 grant만 적용하고 정리 dry-run 결과를 확인한다.

## 구현·검증 결과 (2026-10-05)

- `server/auth/audit.ts`에서 고정 action/reason만 허용한다. 이메일 발송 성공/실패와 인식한 OTP·OAuth 거부도 기록한다. 확인되지 않은 세션 쿠키, 알 수 없는 OTP 요청, 잘못되거나 재사용된 OAuth state는 감사 쓰기를 만들지 않는다.
- 서버 생성 요청 UUID는 AsyncLocalStorage로 전달한다. 동시 HTTP 요청의 감사가 섞이지 않고 클라이언트가 보낸 요청 ID를 신뢰하지 않는 것을 검증했다.
- migration `006_auth_cleanup.sql`의 SECURITY DEFINER 함수는 고정 search_path, 작업 잠금, SKIP LOCKED와 참조 검사를 사용한다. 런타임에는 함수 실행 및 감사 reason_code INSERT만 추가했다. 직접 DELETE는 계속 거부한다.
- 실제 PostgreSQL·HTTP **102개**, Vitest **238개 / 23개 파일**, API 계약 **14개**, 프런트·서버 타입 검사 및 빌드 통과. 감사 저장 실패 시 계정 변경 rollback, 정리 감사 실패 시 삭제 rollback, 미확인 세션의 감사 증폭 방지를 확인했다.
- 24시간 유예를 일시적으로 0으로 바꾼 변이에서 경계 테스트 실패를 확인하고 복원했다. 실제 공급자 호출은 테스트 대역을 사용했으며 Resend·카카오 실계정 검수는 준비 후 진행한다.

## 실행

프로젝트 루트에서 기본 실행은 조회만 한다. 연결값은 Git에서 제외한 런타임 파일로 읽는다.

```sh
node --env-file=sixtysix-v2/.env.preview-runtime backend/scripts/cleanup-auth.cjs
```

실제 삭제가 필요한 경우에만 다음 명령을 사용한다. 한 번에 전체 100행이며 최대 `--batch=500`까지 허용한다.

```sh
node --env-file=sixtysix-v2/.env.preview-runtime backend/scripts/cleanup-auth.cjs --apply --batch=100
```

`backend/.env`에 APP_DATABASE_URL을 구성한 환경에서는 `npm --prefix backend run auth:cleanup -- --batch=100`도 사용할 수 있다. CLI는 런타임 권한을 먼저 검사하고 한 배치만 실행한다. 자동 반복·스케줄은 설치하지 않았다.

결과에는 상태·기준 시각·테이블별 개수만 포함하며 행 식별자는 출력하지 않는다. dry-run은 **현재 참조 상태에서 정리 가능한 행**을 센다. apply는 자식을 먼저 지운 후 부모를 정리하므로 dry-run보다 부모를 더 정리할 수 있다. `batchFull`은 한도 도달 표시이며 잔여 행이 있다는 확정값은 아니다. 동시 작업은 `busy`를 반환한다.

## Preview 적용

- Neon Preview에 migration **006**과 최소 grant 적용 완료. 기존 001~005 checksum 유지.
- 런타임 권한 검증: 테이블 25개·함수 4개. dry-run 결과는 7개 대상 테이블 모두 **0행**.
- 원격 실제 삭제·테스트 회원/코호트 생성·앱 배포·Production 변경은 하지 않았다.
- 다음 작업은 업무 API 남용 제한 및 outbox 처리다. 업무/감사 데이터 보관 정책과 정리 스케줄 연결은 별도 후속이다.
