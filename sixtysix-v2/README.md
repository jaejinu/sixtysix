# 육십육 V2

React·TypeScript 모바일 웹과 Fastify API입니다. 현재 진행 상태와 검증 결과는 [PROGRESS.md](../PROGRESS.md)를 확인하세요. 범위 결정은 [V2-SCOPE.md](../v2/V2-SCOPE.md)를 따릅니다.

## 실행

Node.js 22를 사용합니다.

```bash
cd sixtysix-v2
npm ci
npm run dev        # http://localhost:5173
```

데모는 프런트만으로 실행할 수 있습니다. 실제 계정 기능에는 서버 설정이 필요합니다. `.env.example`을 참고해 로컬 `.env`에 앱용 DB 연결과 인증 설정을 준비한 뒤, 별도 터미널에서 실행하세요. 기존 `.env`가 있다면 값을 보존합니다.

```bash
cd sixtysix-v2
npm run dev:api    # http://127.0.0.1:3001
```

Vite가 `/v1` 요청을 로컬 API로 전달합니다. 앱은 `APP_DATABASE_URL`만 사용하며 소유자·worker DB 연결을 대신 사용하지 않습니다. 이메일·카카오 실제 로그인에는 공급자 설정이 필요합니다. [서버 환경 예시](.env.example)와 [배포 설정](../v2/VERCEL-BACKEND-SETUP.md)을 참고하세요.

## 구조와 데이터 흐름

```text
src/domain/         정책·타입·파생 계산
src/simulator/      29명 코호트의 결정론적 시뮬레이션
src/infrastructure/ 시계·시간대·localStorage·저장값 검증
src/app/            데모 상태·세계 구성·시드
src/ui/             화면·컴포넌트·스타일
src/auth/           실제 계정 API 클라이언트
src/cohorts/        공개 모집 API 클라이언트
src/records/        실제 활동 API 클라이언트
src/notifications/  알림 API 클라이언트
src/admin/          운영자 API 클라이언트
server/             Fastify 라우트·서비스·DB 연결
api/                Vercel 서버 함수 진입점
../backend/         SQL migration·OpenAPI·DB 및 worker 도구
```

데모는 localStorage의 사실과 시뮬레이션에서 화면 값을 계산합니다. 실제 계정은 API와 PostgreSQL을 사용하며 데모 기록을 가져오지 않습니다. 데모의 ‘실제 시간’ 모드도 서버 계정과는 별개입니다.

## 화면과 구현 범위

| 구분 | 경로 | 기능 |
|---|---|---|
| 데모 | `/home`, `/cohort`, `/record` | 상태별 홈·코호트·66일 기록 |
| 데모 | `/checkin`, `/my`, `/onboarding` | 인증 작성·설정·시작, 데모 시계 |
| 실제 계정 | `/login`, `/account` | 이메일 OTP·카카오 인증, 재인증·연결/해제 |
| 실제 계정 | `/recruitment` | 공개 모집 조회·참여·시작 전 취소 |
| 실제 계정 | `/activity/:membershipId` | 본인 홈·기록·인증·면제권 |
| 실제 계정 | `/notifications` | 코호트 시작·취소 알림 |
| 운영자 | `/admin/cohorts` | 모집 목록·개설·시작 전 취소 |

카카오 로그인은 Preview에서 실계정 로그인·세션 유지·로그아웃을 검수했습니다. 이메일 실발송과 Production 인증 환경은 후속입니다. 실제 사진 업로드와 타인 피드·순위는 후속 범위이며 현재 인증은 텍스트와 허용된 샘플 사진을 사용합니다. 기존 와이어프레임의 졸업·탐색·인증 상세·챌린지 상세·공지 화면도 남아 있습니다. 공개 모집 화면은 별도 서버 기능입니다.

## 검증

```bash
npm test                  # Vitest: 도메인·데모·API·화면 흐름
npm run build             # 프런트·서버 타입 검사 + Vite 빌드
npm --prefix ../backend run validate:api
```

DB 통합 검증은 `AUTH_TEST_DATABASE_URL`과 테스트 DB 생성 권한이 필요한 별도 검사입니다. [backend README](../backend/README.md)를 확인하세요. V2 모바일 검수는 개발 서버 실행 후 `npm --prefix ../qa run test:v2`로 실행합니다. 테스트 API 응답을 사용하며 실계정 E2E와 구분합니다.

## 배포

Vercel 프로젝트 루트는 `sixtysix-v2/`입니다. `/v1/*`는 서버 함수로, 화면 경로는 SPA로 전달합니다. main push는 연결된 배포를 유발할 수 있습니다. 카카오 연결 Preview는 `b9f801b` 소스로 재배포했습니다. 고정 검수 주소와 실계정 검증 결과는 [PROGRESS.md](../PROGRESS.md) 32장, Production 환경 범위는 29장을 확인하세요.

## 테스트 네 층

V1 은 「화면에 무엇이 보이는가」만 검사해서 데이터 버그를 하나도 못 잡았다.
그 실패를 두 번 되풀이하지 않기 위해 층을 나눈다.

| 층 | 어디 | 무엇을 |
|---|---|---|
| 표시 | `src/ui/__tests__` | 이름표가 그날의 실제 상태를 말하는가 |
| 저장 상태 | `src/app/__tests__` | 데모 시드가 도메인 인수 기준과 같은 수치를 내는가 |
| 파생 값 | `src/ui/__tests__/derived.test.tsx` | 카운터가 **입력을 따라 변하는가** |
| 흐름 | `src/ui/__tests__/appFlow.test.tsx` | 화면이 말한 것과 저장 상태가 **흐름 끝까지** 같은가 (시작일 · 중복 인증 · 세계 전환 · 시간 흐름) |

세 번째 층이 V1 에 없었다. 한 줄 카운터가 입력 0자에 40 을 표시했는데
Playwright 210건이 통과했다 — 카운터가 존재하는지만 봤기 때문이다.

테스트가 첫 실행에 통과하면 **뮤테이션으로 정말 무는지 확인한다.**

```
① 카운터를 40 으로 고정 (V1 이 실제로 출시한 버그)  → 1 실패
② 방향키 아래 이동을 11 → 1                          → 1 실패
③ 미래 차단 제거 (Gate 3 방화벽 4)                   → 2 실패
```

## V1 이 못 하던 것을 어디서 푸는가

| 진단 | 어디서 |
|---|---|
| P1-A 내 인증이 피드에 없다 | `HomeScreen` · `CohortScreen` 이 `facts.checkins` 하나만 읽는다 |
| P1-B 시간이 흐르지 않는다 | `DemoClockBar` + `AppProvider` 의 Clock |
| P1-C 코호트가 살아 있지 않다 | `buildWorld` 가 매 렌더 `now` 까지만 시뮬레이션한다 |
| P2-D 온보딩 직후 D+23 | 온보딩을 마친 **그날이 코호트 1일차**. 「둘러보기」는 마이에서만 |
| V1 버그 1 습관·코호트 불일치 | `cohortFor(habitId, startDate)` — 코호트가 습관에서 파생한다 |
| 랭킹이 나만 유리 | `getRanking` 이 모두를 `checkins` 로 센다 |

## 데모 시드

새 저장소의 첫 진입은 **온보딩**입니다. 초기 상태 내부에는 시드가 생성되지만, 온보딩을 완료하면 기록을 비우고 선택한 습관으로 시작합니다.
마이 → 진행 중인 상태로 둘러보기에서 `D+23 · 인증 20 · 면제권 1 · 연속 9`를 불러옵니다.
`V1_D23_BASELINE` 과 같은 수치이고, `src/app/__tests__/demoSeed.test.ts` 가 그것을 검사한다.

**화면의 첫 인상이 도메인 인수 기준과 어긋나면 안 된다.**
「표시는 맞는데 데이터가 틀린」 V1 의 실패가 되풀이되는 지점이 정확히 거기다.
