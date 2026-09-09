# Gate 1 — 도메인 모델 초안

> `v2/V2-SCOPE.md` 결정 3의 첫 게이트
> 상태: **논의용 초안**. 확정 아님
> 통과 기준: *Checkin 목록 하나를 주면 스트릭·인증 수·채운 날·상태·랭킹을 모두 계산할 수 있는가*

---

## 0. 이 문서의 원칙 — V1이 알려준 것

V1에서 발견된 정합성 버그 3건은 전부 같은 뿌리였다.

> **파생될 수 있는 값을 저장했고, 저장된 값끼리 어긋났다.**

| V1 사고 | 원인 |
|---|---|
| 온보딩 습관·코호트 불일치 | `habitId`와 `cohortId`를 각각 저장하고 관계를 검사하지 않음 |
| 랭킹에서 나만 유리 | 내 `total`은 `filled`, 남의 `total`은 인증 수. **같은 이름의 값이 두 가지 의미** |
| 참여가 상태를 안 바꿈 | 화면 표시와 저장 상태가 별도 경로 |

그래서 V2의 규칙은 하나다.

**저장은 사실(fact)만. 판단(judgement)과 요약(summary)은 전부 파생.**

사실은 "언제 무엇이 일어났는가"이고, 판단은 "그래서 연속인가 끊겼는가"다.
판단을 저장하는 순간 사실과 어긋날 수 있는 두 번째 진실이 생긴다.

---

## 1. 세 층으로 나눈다

```
① 정적 데이터   앱에 내장. 사용자가 못 바꿈.        Habit · Cohort · BadgeDef
② 저장 사실     사용자 행동의 기록. localStorage.   Membership · Checkin · PassUsage · Reaction · Preference
③ 파생값        절대 저장하지 않음. 매번 계산.       streak · filled · state · rank · badge · D+N
```

---

## 2. ① 정적 데이터

### Habit
```ts
{ id, name, shortName, goal, imageId, timeOfDay: 'morning' | 'evening' }
```
`shortName`은 탐색 칩용이다. V1에서 습관명 첫 단어를 잘라 쓰다가 "아침"이 두 번 나온 사고가 있었다.

### Cohort
```ts
{ id, habitId, generation, startDate, durationDays: 66, capacity: 30, policyVersion, memberIds }
```
- **`name`을 저장하지 않는다.** `habit.name + ' · ' + generation`으로 파생한다.
  V1에서 이름을 손으로 적다가 `영어 단어 · 9월 2기`만 규칙을 벗어났다.
- `endDate`도 `startDate + 65일`로 파생 가능하지만, 66일 규칙이 바뀔 여지가 없으므로 저장해도 무방하다. 파생 권장.

### BadgeDef
```ts
{ id, name, condition, icon, rule: (ctx) => boolean }
```
획득 **여부**는 저장하지 않는다. 규칙과 Checkin 목록으로 매번 판정한다.

---

## 3. ② 저장 사실

### Membership — 누가 어느 코호트에 속하는가
```ts
{ id, userId, cohortId, joinedAt }
```
- **`habitId`를 저장하지 않는다.** `cohort.habitId`로 파생한다.
  V1 버그 1의 재발 방지책이다. 두 곳에 적으면 반드시 어긋난다.
- **`status`도 저장하지 않는다.** 앞선 논의에서 저장하기로 했다가 정정했다.
  `reserved` · `active` · `graduated`는 `cohort.startDate` · `endDate`와 `now`에서 전부 파생된다.
  정책 10이 "제거하지 않는다"이므로 `left` 상태와 `leftAt`은 필요 없다.
- V1.1의 `nextCohortId`는 **`status === 'reserved'`로 파생되는 Membership**이 대체한다.
- **`passesUsed`를 저장하지 않는다.** `PassUsage` 개수로 센다.
- 불변 조건: **한 사용자에게 동시에 `active`인 Membership은 최대 하나다.** (정책 7)

### Checkin — 인증 하나
```ts
{ id, membershipId, cohortDay: 1..66, createdAt, text, photoRef?, visibility: 'cohort' | 'private' }
```

**저장하지 않고 파생하는 것**

| 항목 | 파생 방법 |
|---|---|
| `late` | `createdAt` vs 해당 일차의 마감(다음 날 04:00) |
| `simple` | `photoRef == null` |
| `returning` | 직전 일차들이 미인증인가 |
| `memberId` | `membership.userId` |
| `cohortId` | `membership.cohortId` |

ChatGPT 초안의 `status: normal | late | return`은 **저장하지 않기를 제안한다.**
셋 다 `createdAt`과 이력에서 계산되므로, 저장하면 규칙을 고쳤을 때 과거 데이터와 어긋난다.

> **확정: `cohortDay`는 저장한다.** "파생될 수 있는 값은 저장하지 않는다"의 예외다.
> 단순 계산 결과가 아니라 **인증이 접수될 때 확정되는 업무상 귀속일**이기 때문이다.
>
> ```
> createdAt = 2026-09-10T02:31:00+09:00   물리적으로 언제 제출했는가
> cohortDay = 24                          66일 역사 중 어느 칸에 귀속됐는가
> ```
>
> 함께 `Cohort.policyVersion`을 둔다. 나중에 04:00 규칙이 바뀌어도
> **기존 코호트의 과거 판단을 새 규칙으로 재해석하지 않는다.**

### PassUsage — 면제권 사용
```ts
{ id, membershipId, cohortDay, usedAt }
```
잔여는 `3 - count`로 파생한다.

### Reaction — 응원
```ts
{ id, checkinId, fromMemberId, type: 'cheer', createdAt }
```
V1은 `cheers` 수를 샘플 데이터에 박아 두고 내 토글만 더했다. V2는 시뮬레이터가 만든 Reaction을 센다.

### Preference
```ts
{ alarmHour, defaultScope, savedCheckinIds, reportedCheckinIds, readNoticeIds }
```

---

## 4. ③ 파생값 — 저장 금지 목록

**V1에서 저장했다가 문제가 된 것에 ⚠️ 표시.**

| 파생값 | 계산 근거 |
|---|---|
| ⚠️ `dayCount` (D+N) | `clock.now()`와 `cohort.startDate` |
| ⚠️ `passesUsed` / `passesLeft` | `PassUsage` 개수 |
| `checkins` (인증 수) | Checkin 개수 → **랭킹 기준** |
| `filled` (채운 날) | 인증 수 + 면제권 사용 수 → **완주 페이스** |
| `streak` / `bestStreak` | 일차 순회 |
| `lates` / `simples` / `privates` | Checkin 속성 집계 |
| ⚠️ 사용자 상태 6종 | 위 값들의 조합 |
| 랭킹 | 멤버별 인증 수 → 동률 시 스트릭 |
| 배지 획득 | `BadgeDef.rule` 판정 |
| 코호트 오늘 인증 인원 | 그날 Checkin 개수 → **V1은 `18 + (내가 했나)`로 하드코딩** |

### 이름 규칙 고정

V1 랭킹 버그의 직접 원인은 **`total`이라는 이름이 두 의미로 쓰인 것**이었다.

```
checkins  실제 인증 수      → 랭킹, "인증 N일"
filled    인증 + 면제권      → 66칸 진행판, "채운 날 N일"
passes    면제권 사용 수      → "면제권 N회"
```

**`total`이라는 이름을 코드와 화면 어디에도 쓰지 않는다.**

---

## 5. 통과 기준 검증 시나리오

Gate 1이 끝났는지 판정하는 테스트다. **UI 없이** 통과해야 한다.

```
주어진 것: Checkin[] + PassUsage[] + Cohort + clock.now()

1. D+N 이 맞는가
2. 인증 수 · 채운 날 · 면제권 잔여가 맞는가
3. 현재 연속 · 최장 연속이 맞는가
4. 사용자 상태 6종이 정확히 하나로 판정되는가
5. 늦은 인증 · 간단 인증 · 복귀가 Checkin 에서 파생되는가
6. 랭킹이 모든 멤버에게 같은 기준으로 계산되는가
7. 배지 7종 획득 여부가 판정되는가
8. 내 인증과 코호트 인증이 같은 스트림에서 나오는가  ← P1-A 해결 확인
9. clock 을 D+24 로 넘겨도 D+1~23 결과가 변하지 않는가  ← 결정 4-C 확인
```

**8번과 9번이 핵심이다.** 이 둘이 통과하면 P1-A·B·C가 구조적으로 해결된 것이다.

---

## 6. V1 → V2 매핑

| V1 | V2 |
|---|---|
| `Store.days` (일차 → 상태) | `Checkin[]` + `PassUsage[]` |
| `Store.texts` | `Checkin.text` |
| `Store.photoDays` | `Checkin.photoId` |
| `Store.simpleDays` | 파생 (`photoId == null`) |
| `Store.privateDays` | `Checkin.scope` |
| `FEED_CHECKINS` | 같은 `Checkin[]` (Simulator 생성분) |
| `Store.me.habitId` | 파생 (`membership.cohort.habitId`) |
| `Store.me.dayCount` | 파생 (`clock` + `cohort.startDate`) |
| `Store.me.passesUsed` | 파생 (`PassUsage` 개수) |
| `Store.me.nextCohortId` | `Membership { status: 'reserved' }` |
| `Store.cheers` | `Reaction[]` |
| `derived()` | 유지. 순수 함수라 그대로 옮길 수 있다 |

`derived()`는 V1에서 가장 잘 만든 부분이다. 인증 목록에서 모든 것을 계산하는 순수 함수라 훅으로 그대로 전환된다.

---

## 7. 확정된 나머지 결정

| 항목 | 결정 |
|---|---|
| `cohortDay` | **저장한다.** 업무상 귀속일이므로 예외. `Cohort.policyVersion` 병행 |
| 멤버 원형 | **6종** — steady · deadline · comeback · atRisk · ordinary · hotStart. UI에 노출하지 않고 시뮬레이터 파라미터로만 존재 |
| Reaction | **사용자 것만 저장, 시뮬레이션은 lazy projection.** 시차를 두어 뒤늦게 붙게 한다 |
| 저장 키 | 세계 단위 물리 분리 — `sixtysix:v2:meta` · `:demo` · `:real`. UI는 `WorldRepository`만 통한다 |
| V1 테스트 | 의도는 65~75% 재사용, 코드는 30~40%. 도메인 정합성은 Playwright에서 빼고 **Vitest 단위 테스트로 재작성** |

### 저장 키 구조

```
sixtysix:v2:meta   { schemaVersion, activeWorld: 'demo'|'real', simulatorVersion }
sixtysix:v2:demo   { clock: { currentAt }, membership, checkins, passUsages, reactions, preferences }
sixtysix:v2:real   { membership, checkins, passUsages, reactions, preferences }
```

RealClock은 시스템 시각을 읽으므로 `currentAt`을 저장하지 않는다.
DemoClock은 날짜를 넘겼다 돌아와도 위치를 유지해야 하므로 저장한다.

### 원형 파라미터 예시

```ts
{ baseAttendance: 0.84, streakMomentum: 0.10, missDrag: 0.07,
  comebackStrength: 0.18, fatigueSlope: 0.04, latePropensity: 0.08 }
```

출석 확률은 전날 true/false만 보지 않고 `previousStreak` · `consecutiveMisses` · `cohortDay` · `archetype`을 함께 받는다.

```
P(attendToday) = baseAttendance
               + streakMomentum(previousStreak)
               - missDrag(consecutiveMisses)
               - fatigue(cohortDay)
               + comebackPressure(consecutiveMisses)
               + cohortMomentum(yesterdayCohortParticipation)   ← Gate 2 v1 에서는 계수 0
               + deterministicNoise
```

**`cohortMomentum` 항이 가설 1 검증의 장치다.** 계수를 켜고 끌 수 있게 만들면
"혼자 스트릭만 보는 버전"과 "코호트 움직임이 보이는 버전"을 같은 코드로 비교할 수 있다.
Gate 2 첫 버전에서는 0으로 두고 개인 원형만으로 자연스러운 66일 궤적을 먼저 만든다.

---

## 8. 파생 함수 목록

→ `v2/GATE1-SELECTORS.md`
