# Gate 1 — 파생 함수(Selector) 목록

> `v2/GATE1-DOMAIN.md`의 저장 사실로부터 무엇을 어떻게 계산할지 정의한다.
> **React보다 먼저 이 목록이 도메인의 뼈가 된다.**
> 상태: 논의용 초안

---

## 0. 계약

모든 셀렉터는 **순수 함수**다.

```ts
selector(facts, ctx) → value
```

| 규칙 | 이유 |
|---|---|
| `new Date()`를 직접 부르지 않는다. `ctx.now`만 받는다 | 결정 4-C. Clock을 마지막에 꽂기 위함 |
| `localStorage`를 읽지 않는다 | 저장소 교체(IndexedDB)에 영향받지 않게 |
| 값을 캐시하지 않는다. 메모이제이션은 호출 측에서 | 파생값을 저장하지 않는다는 원칙과 동일 |
| 같은 입력이면 항상 같은 출력 | 시뮬레이터 결정론과 같은 계약 |

```ts
type Ctx = { now: Date; cohort: Cohort; policy: Policy }
```

---

## 1. 시간 — Clock과 Cohort를 잇는다

| 셀렉터 | 반환 | 비고 |
|---|---|---|
| `getCohortDay(now, cohort)` | `number` | 1..66. 시작 전 0, 종료 후 66 초과 |
| `getCohortPhase(now, cohort)` | `'before' \| 'running' \| 'ended'` | |
| `getDeadline(cohort, day)` | `Date` | 해당 일차 다음 날 04:00 (정책 1) |
| `getLateWindowEnd(cohort, day)` | `Date` | 마감 + 12시간 (정책 2) |
| `getEffectiveDay(createdAt, cohort)` | `number` | **쓰기 시점 전용.** 04:00 규칙으로 귀속 일차를 확정해 `Checkin.cohortDay`에 저장 |

`getEffectiveDay`만 쓰기 경로에서 쓰이고 나머지는 읽기 전용이다. 이 구분이 `cohortDay`를 저장하는 근거다.

---

## 2. 인증 분류 — 저장하지 않는 세 가지

```ts
getCheckinKind(checkin, ctx, priorHistory) → {
  late: boolean       // createdAt > getDeadline(cohort, checkin.cohortDay)
  simple: boolean     // checkin.photoRef == null
  returning: boolean  // 직전 일차들이 연속 미인증이었는가
}
```

| 항목 | 계산 근거 | 저장 금지 이유 |
|---|---|---|
| `late` | `createdAt` + `cohort.policyVersion`의 마감 규칙 | 규칙이 바뀌면 과거가 재해석돼야 하는데, `policyVersion`이 그걸 막는다 |
| `simple` | `photoRef == null` | 완전히 파생 가능 |
| `returning` | 이전 이력 | 이력이 바뀌면 함께 바뀌어야 함 |

`returning` 판정 기준은 **직전 일차가 미인증이고, 그 이전으로 1일 이상 연속 미인증**이다.
휴면(7일) 여부와 별개로 "끊겼다 돌아온 인증"을 표시한다.

---

## 3. 진행 — 66칸과 통계

```ts
getProgress(membership, ctx) → {
  day: number          // 오늘이 몇 일차
  checkins: number     // 실제 인증 수      → 랭킹 기준
  filled: number       // 인증 ∪ 면제권      → 완주 페이스
  passes: number       // 면제권 사용 수
  passesLeft: number   // 3 - passes
  lates: number
  simples: number
  privates: number
  streak: number       // 현재 연속
  bestStreak: number   // 최장 연속
  remaining: number    // 66 - filled
  percent: number
}
```

**`total`이라는 키를 두지 않는다.** V1 랭킹 버그의 직접 원인이다.

```ts
getFilledDays(membership) → Set<number>   // Checkin.cohortDay ∪ PassUsage.cohortDay
getDayStatus(day, membership, ctx) → 'done' | 'late' | 'pass' | 'miss' | 'today' | 'future'
```

`getDayStatus`가 **66칸 진행판 66개 칸을 그리는 유일한 함수**다.
V1에서는 이 판정이 렌더 함수 안에 흩어져 있었다.

```ts
getStreak(membership, ctx) → number
getBestStreak(membership) → number
```

연속 계산 규칙: `done` · `late` · `pass`는 연속을 잇고, `miss`는 끊는다. `future`는 무시한다.
**면제권이 연속을 잇되 인증 수에는 들어가지 않는다**는 것이 정책 3의 핵심이고,
이 두 함수와 `getProgress`의 `checkins`가 그 구분을 만든다.

---

## 4. 사용자 상태 — 6종 중 정확히 하나

```ts
getMemberState(membership, ctx) →
  'day0' | 'ongoing' | 'done' | 'broken' | 'dormant' | 'graduated'
```

판정 순서(먼저 맞는 것 하나만):

```
graduated  cohort phase == 'ended' 또는 filled >= 66
done       오늘 일차가 filled
dormant    최근 7일차가 모두 miss
broken     어제 일차가 miss
day0       checkins == 0
ongoing    그 외
```

**정확히 하나만 참이어야 한다.** Gate 1 방화벽 테스트 항목이다.

---

## 5. 코호트 — 가설 1이 사는 곳

```ts
getCohortMembers(cohort) → Membership[]                  // 30명
getCohortDayParticipation(cohort, day, ctx) → {
  done: number      // 그날 인증한 인원
  late: number
  dormant: number
  pending: number   // 아직 안 한 인원
  total: number     // 정원 (여기서만 total 허용 — 인원 수이지 점수가 아님)
}
```

V1은 이 값을 `18 + (내가 했나)`로 하드코딩했다. **V2에서는 그날 Checkin을 센다.**
가설 1을 검증 가능하게 만드는 핵심 지점이다.

```ts
getRanking(cohort, ctx) → Array<{
  membershipId, name, avatar,
  checkins: number,   // 실제 인증 수 — 나와 남이 같은 기준
  streak: number,
  state: MemberState,
  rank: number,
  isMe: boolean
}>
```

정렬: `checkins` 내림차순 → 동률 시 `streak` 내림차순.
**나와 다른 멤버가 같은 함수로 계산돼야 한다.** V1은 내 행만 다른 값을 썼다.

---

## 6. 피드 — P1-A가 해결되는 지점

```ts
getCohortFeed(cohort, ctx, filter) → Checkin[]
getStoryRail(cohort, ctx) → Checkin[]     // 오늘 인증한 멤버
```

**내 Checkin과 시뮬레이터 Checkin이 같은 배열에서 나온다.**
V1이 `myCheckins()`와 `FEED_CHECKINS`로 나뉘어 있어 인증해도 피드에 안 나타나던 문제가
이 함수 하나로 사라진다.

필터 규칙:
- `visibility === 'private'`인 인증은 **내 것이라도** 피드에서 제외한다. 기록과 랭킹에는 포함한다.
- `filter`: `all` · `today` · `noLate` · `photoOnly`

---

## 7. 응원 — 저장 사실과 시뮬레이션의 병합

```ts
getReactions(checkin, ctx) → Reaction[]
getReactionCount(checkin, ctx) → number
hasMyReaction(checkin, myMembershipId) → boolean
```

병합 규칙:

```
저장된 Reaction (사용자가 실제로 누른 것)
+ getSimulatedReactions(checkin, ctx).filter(r => r.availableAt <= ctx.now)
```

시뮬레이션 응원은 **저장하지 않고** 필요 시점에 계산한다.
`availableAt`에 시차를 두어 인증 직후 0개 → 30분 뒤 2개 → 오후 7개처럼 **뒤늦게 반응이 붙게** 한다.
즉시 12개가 생기는 것보다 사람이 있다는 느낌이 강하다.

> **seed 주의**: `checkinId`로 시드하면 안 된다. 내 인증의 id는 세션마다 새로 생성될 수 있어
> 응원 수가 흔들린다. `(cohortId, membershipId, cohortDay, reactorMemberId, 'reaction')`로 시드한다.
> 이 조합은 안정적이고 의미도 명확하다.

---

## 8. 배지 — 정의는 데이터, 획득은 파생

```ts
getEarnedBadges(membership, ctx) → Array<{ badgeId, earnedAtDay }>
getRecentBadges(membership, ctx, withinDays) → Array<{ badgeId, earnedAtDay }>
```

**획득 여부만이 아니라 `earnedAtDay`도 파생해야 한다.**
홈의 "이번 주에 받은 배지"가 시점을 필요로 하기 때문이다.
규칙이 처음 참이 되는 일차를 찾는다. 저장하지 않는다.

---

## 9. Membership — 상태도 파생이다

```ts
getMembershipStatus(membership, ctx) → 'reserved' | 'active' | 'graduated'
getActiveMembership(user, ctx) → Membership | null
getReservedMemberships(user, ctx) → Membership[]
```

**ChatGPT 최종 모델에서 빠진 것을 여기서 채운다.**

앞선 논의에서 `Membership.status`를 저장하기로 했는데,
최종 잠금 모델(`{ id, userId, cohortId, joinedAt }`)에는 그 필드가 없다.
**저장하지 않는 쪽이 맞다.** 날짜에서 전부 파생되기 때문이다.

```
reserved   cohort.startDate > now
active     cohort 진행 중
graduated  cohort.endDate < now
```

정책 10이 "제거하지 않는다"이므로 `left` 상태와 `leftAt` 필드는 필요 없다.
휴면은 Membership 상태가 아니라 **사용자 상태**(4장)다. 둘을 섞지 않는다.

**불변 조건 하나가 추가된다.**

> 한 사용자에게 동시에 `active`인 Membership은 최대 하나다. (정책 7)

V1.1의 `nextCohortId`는 `status === 'reserved'`인 Membership으로 대체된다.

---

## 10. Gate 1 방화벽 테스트 (13개)

ChatGPT가 제시한 12개에 Membership 불변 조건 1개를 더했다. **UI 없이 통과해야 한다.**

| # | 검사 |
|---:|---|
| 1 | Habit은 Cohort를 통해서만 하나로 결정된다 (`Membership.habitId` 없음) |
| 2 | Checkin에 `status` · `streak` · `total` · `filled`이 존재하지 않는다 |
| 3 | `cohortDay`는 생성 이후 변하지 않는다 |
| 4 | `checkins` = 실제 Checkin 수 |
| 5 | `passes` = 실제 PassUsage 수 |
| 6 | `filled` = Checkin day ∪ PassUsage day |
| 7 | **면제권을 써도 `checkins`와 랭킹 점수는 증가하지 않는다** |
| 8 | 같은 Checkin 데이터에서 홈·기록·랭킹이 같은 수치를 파생한다 |
| 9 | `returning`은 이전 이력에서만 계산된다 |
| 10 | `late`는 `createdAt` + `cohortDay` + `cohort.policyVersion`에서만 계산된다 |
| 11 | Demo와 Real에서 같은 행동을 해도 서로의 저장 상태에 영향이 없다 |
| 12 | 저장된 파생값 없이 새로고침 후 모든 수치가 동일하게 복원된다 |
| 13 | **한 사용자에게 동시에 `active`인 Membership은 최대 하나다** |

여기에 결정 4-C 확인용 하나를 더한다.

| 14 | Clock을 D+24로 넘겨도 D+1~23의 모든 판정이 변하지 않는다 |

---

## 11. 이름 통일

논의 중 두 이름이 섞였다. 하나로 고정한다.

| 확정 | 버림 |
|---|---|
| `Checkin.visibility: 'cohort' \| 'private'` | `scope` |
| `Checkin.photoRef` | `photoId` |
| `checkins` / `filled` / `passes` | `total` (인원 수 세는 곳만 예외) |

---

## 12. 다음 단계

이 목록이 확정되면 **테스트 먼저 쓰고 셀렉터를 구현한다.**
Gate 1은 React 없이, Vitest 단위 테스트로만 통과 판정한다.

```
1. 타입 정의 (Habit · Cohort · Membership · Checkin · PassUsage · Reaction)
2. 방화벽 테스트 14개 작성 (실패 상태로)
3. 셀렉터 구현
4. V1 데모 데이터를 새 모델로 옮겨 수치가 일치하는지 대조
   → D+23 · 인증 20 · 면제권 1 · 채운 날 21 · 연속 9 · 랭킹 4위
5. 전부 통과하면 Gate 1 종료, Gate 2(Simulator)로
```

**4번이 중요하다.** V1과 V2가 같은 사실에서 같은 수치를 내야 마이그레이션이 맞았다는 증거가 된다.
