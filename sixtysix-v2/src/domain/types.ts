/**
 * 육십육 V2 도메인 타입
 *
 * 원칙: 저장은 사실(fact)만. 판단과 요약은 전부 파생.
 * V1 정합성 버그 3건이 모두 "파생될 수 있는 값을 저장하고 서로 어긋난 것"이었다.
 */

export type UserId = string;
export type HabitId = string;
export type CohortId = string;
export type MembershipId = string;
export type CheckinId = string;
export type BadgeId = string;

/** 코호트 안에서의 일차. 1..durationDays */
export type CohortDay = number;

/** ISO 8601 문자열. Date 대신 문자열로 저장해 직렬화 경계를 단순하게 둔다. */
export type IsoDateTime = string;
export type IsoDate = string;

/* ── ① 정적 데이터 ─────────────────────────────────────── */

export type TimeOfDay = 'morning' | 'evening';

export interface Habit {
  readonly id: HabitId;
  readonly name: string;
  /** 탐색 칩용 짧은 이름. V1 에서 습관명 첫 단어를 잘라 쓰다 "아침"이 두 번 나온 사고가 있었다. */
  readonly shortName: string;
  readonly goal: string;
  readonly imageRef: string;
  readonly timeOfDay: TimeOfDay;
}

export interface Cohort {
  readonly id: CohortId;
  readonly habitId: HabitId;
  readonly generation: string;
  readonly startDate: IsoDate;
  readonly durationDays: number;
  readonly capacity: number;
  /** 규칙이 바뀌어도 기존 코호트의 과거 판단을 새 규칙으로 재해석하지 않기 위한 것 */
  readonly policyVersion: number;
}

/* ── ② 저장 사실 ───────────────────────────────────────── */

/**
 * 누가 어느 코호트에 속하는가.
 *
 * habitId 를 두지 않는다. cohort.habitId 로 파생한다. (V1 버그 1 재발 방지)
 * status 도 두지 않는다. 코호트 날짜와 now 에서 파생한다.
 */
export interface Membership {
  readonly id: MembershipId;
  readonly userId: UserId;
  readonly cohortId: CohortId;
  readonly joinedAt: IsoDateTime;
}

export type Visibility = 'cohort' | 'private';

/**
 * 인증 하나.
 *
 * cohortDay 는 저장한다. 계산 결과가 아니라 접수 시점에 확정되는 업무상 귀속일이다.
 * late · simple · returning 은 저장하지 않는다. 전부 파생한다.
 */
export interface Checkin {
  readonly id: CheckinId;
  readonly membershipId: MembershipId;
  readonly cohortDay: CohortDay;
  readonly createdAt: IsoDateTime;
  readonly text: string;
  readonly photoRef?: string;
  readonly visibility: Visibility;
}

export interface PassUsage {
  readonly id: string;
  readonly membershipId: MembershipId;
  readonly cohortDay: CohortDay;
  readonly createdAt: IsoDateTime;
}

export interface Reaction {
  readonly id: string;
  readonly fromMembershipId: MembershipId;
  readonly checkinId: CheckinId;
  readonly createdAt: IsoDateTime;
}

/** 저장된 사실의 묶음. 셀렉터는 이것만 읽는다. */
export interface Facts {
  readonly habits: readonly Habit[];
  readonly cohorts: readonly Cohort[];
  readonly memberships: readonly Membership[];
  readonly checkins: readonly Checkin[];
  readonly passUsages: readonly PassUsage[];
  readonly reactions: readonly Reaction[];
}

/* ── ③ 파생 타입 — 저장하지 않는다 ─────────────────────── */

/**
 * 코호트 생애주기. 성취(완주 여부)와 분리한다.
 * graduated 를 쓰면 "기간이 끝났다"와 "완주 조건을 충족했다"가 다시 섞인다.
 */
export type MembershipStatus = 'reserved' | 'active' | 'ended';

/** 홈 화면이 따르는 사용자 상태. 정확히 하나만 참이다. */
export type MemberState =
  | 'day0'
  | 'ongoing'
  | 'done'
  | 'broken'
  | 'dormant'
  | 'ended';

/** 66칸 진행판의 칸 하나 */
export type DayStatus = 'done' | 'late' | 'pass' | 'miss' | 'today' | 'future';

export interface CheckinKind {
  readonly late: boolean;
  readonly simple: boolean;
  readonly returning: boolean;
}

export interface Progress {
  readonly day: CohortDay;
  /** 실제 인증 수 → 랭킹 기준 */
  readonly checkins: number;
  /** 인증 ∪ 면제권 → 완주 페이스 */
  readonly filled: number;
  readonly passes: number;
  readonly passesLeft: number;
  readonly lates: number;
  readonly simples: number;
  readonly privates: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly remaining: number;
  readonly percent: number;
}

export interface RankingRow {
  readonly membershipId: MembershipId;
  /** 실제 인증 수. 나와 남이 같은 기준이어야 한다. (V1 버그 3) */
  readonly checkins: number;
  readonly streak: number;
  readonly state: MemberState;
  readonly rank: number;
}

export interface CohortParticipation {
  readonly day: CohortDay;
  readonly done: number;
  readonly late: number;
  readonly dormant: number;
  readonly pending: number;
  /** 정원. 인원 수이지 점수가 아니므로 여기서만 total 을 쓴다. */
  readonly total: number;
}

export interface EarnedBadge {
  readonly badgeId: BadgeId;
  readonly earnedAtDay: CohortDay;
}

/** 셀렉터가 받는 문맥. now 를 인자로 받고 Clock 을 알지 못한다. */
export interface Ctx {
  readonly now: Date;
  readonly cohort: Cohort;
}
