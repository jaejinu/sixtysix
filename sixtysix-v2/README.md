# 육십육 V2

`v2/V2-SCOPE.md` 결정 3의 Gate 1~3 위에 React 화면을 올린 것이다.

```
src/domain/         Gate 1 — 타입 · 정책 · 셀렉터 · 불변식     (순수 함수, now 를 인자로 받는다)
src/simulator/      Gate 2 — 29명 코호트 결정론적 생성
src/infrastructure/ Gate 3 — Clock · 시간대 · 저장소 경계
src/app/            세계 구성 · 상태 · 데모 시드
src/ui/             화면 · 컴포넌트 · 디자인 토큰
```

## 실행

```bash
npm run dev        # http://localhost:5173
npm test           # 132개 (도메인 121 + 시드 5 + 화면 6)
npm run typecheck
npm run build
```

## 지금 되는 것

| | |
|---|---|
| 홈 | 상태 6종 · Hero · 코호트 현황(계산값) · 오늘의 인증 레일 |
| 코호트 | 오늘 / 피드 / 멤버 30명 · AvatarGrid |
| 기록 | 66칸 진행판 ↔ 날짜 목록 양방향 연동 · 방향키 이동 |
| 인증 작성 | 마감까지 남은 시간 · 사진 · 한 줄 · 공개 범위 |
| 데모 시계 | ±1일 이동. 상태·코호트·연속이 전부 따라 바뀐다 |
| 인증 | 남기면 즉시 피드 최상단에 뜨고 코호트 수가 오른다 |

아직 없는 화면: 마이 · 졸업 · 온보딩 · 탐색 · 인증 상세 · 챌린지 상세.

## 테스트 세 층

V1 은 「화면에 무엇이 보이는가」만 검사해서 데이터 버그를 하나도 못 잡았다.
그 실패를 두 번 되풀이하지 않기 위해 층을 나눈다.

| 층 | 어디 | 무엇을 |
|---|---|---|
| 표시 | `src/ui/__tests__` | 이름표가 그날의 실제 상태를 말하는가 |
| 저장 상태 | `src/app/__tests__` | 데모 시드가 도메인 인수 기준과 같은 수치를 내는가 |
| 파생 값 | `src/ui/__tests__/derived.test.tsx` | 카운터가 **입력을 따라 변하는가** |

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
| P2-D 온보딩 직후 D+23 | `demoSeed` 를 「둘러보기」로 분리. `startFresh()` 가 0일차 |
| 랭킹이 나만 유리 | `getRanking` 이 모두를 `checkins` 로 센다 |

## 데모 시드

첫 실행은 **진행 중인 상태**로 연다 — `D+23 · 인증 20 · 면제권 1 · 연속 9`.
`V1_D23_BASELINE` 과 같은 수치이고, `src/app/__tests__/demoSeed.test.ts` 가 그것을 검사한다.

**화면의 첫 인상이 도메인 인수 기준과 어긋나면 안 된다.**
「표시는 맞는데 데이터가 틀린」 V1 의 실패가 되풀이되는 지점이 정확히 거기다.

---

## Gate 1 의 범위

포함: 타입 · 정책 · 파생 함수(selector) · 불변식 검증 · 단위 테스트

**일부러 제외한 것**

```
❌ React 컴포넌트
❌ localStorage repository
❌ DemoClock / RealClock
❌ 30명 코호트 시뮬레이터
```

Clock 을 먼저 넣으면 버그가 났을 때 데이터 문제인지 시뮬레이션 문제인지
날짜 문제인지 범인이 셋이 된다. Gate 1 에서는 `now` 를 인자로 받기만 한다.

## 실행

```bash
npm install
npm test        # 불변식 16개 + V1 baseline acceptance
npm run typecheck
```

## 종료 조건

1. 불변식 16개 통과
2. `V1_D23_BASELINE` fixture 에서
   `checkins 20 · passes 1 · filled 21 · streak 9 · rank 4` 재현

2번이 핵심이다. V1 과 V2 가 같은 사실에서 같은 수치를 내야
재설계 과정에서 정책을 바꾸지 않았다는 증거가 된다.
특히 rank 4 는 V1.1 에서 고친 랭킹 공정성 버그의 결과라
여기서 3 이 나오면 같은 실수를 반복한 것이다.
