/** Membership — status 는 저장하지 않고 코호트 날짜와 now 에서 파생한다. */
import type {
  Cohort, Ctx, Facts, Habit, Membership, MembershipId, MembershipStatus, UserId,
} from '../types.js';
import { getCohortPhase } from './time.js';

export function getCohort(facts: Facts, cohortId: string): Cohort {
  const c = facts.cohorts.find((x) => x.id === cohortId);
  if (!c) throw new Error(`코호트를 찾을 수 없다: ${cohortId}`);
  return c;
}

export function getMembership(facts: Facts, membershipId: MembershipId): Membership {
  const m = facts.memberships.find((x) => x.id === membershipId);
  if (!m) throw new Error(`Membership 을 찾을 수 없다: ${membershipId}`);
  return m;
}

/** 습관은 코호트를 통해서만 결정된다. Membership 에 habitId 를 두지 않는다. */
export function getHabitOf(facts: Facts, membershipId: MembershipId): Habit {
  const cohort = getCohort(facts, getMembership(facts, membershipId).cohortId);
  const h = facts.habits.find((x) => x.id === cohort.habitId);
  if (!h) throw new Error(`습관을 찾을 수 없다: ${cohort.habitId}`);
  return h;
}

/** 코호트명은 저장하지 않는다. 습관명과 기수로 파생한다. */
export function getCohortName(facts: Facts, cohort: Cohort): string {
  const h = facts.habits.find((x) => x.id === cohort.habitId);
  if (!h) throw new Error(`습관을 찾을 수 없다: ${cohort.habitId}`);
  return `${h.name} · ${cohort.generation}`;
}

export function getMembershipStatus(membership: Membership, cohort: Cohort, now: Date): MembershipStatus {
  const phase = getCohortPhase(now, cohort);
  if (phase === 'before') return 'reserved';
  if (phase === 'ended') return 'ended';
  return 'active';
}

export function getMembershipsOf(facts: Facts, userId: UserId): Membership[] {
  return facts.memberships.filter((m) => m.userId === userId);
}

export function getActiveMembership(facts: Facts, userId: UserId, now: Date): Membership | null {
  const found = getMembershipsOf(facts, userId).filter(
    (m) => getMembershipStatus(m, getCohort(facts, m.cohortId), now) === 'active',
  );
  return found[0] ?? null;
}

export function getReservedMemberships(facts: Facts, userId: UserId, now: Date): Membership[] {
  return getMembershipsOf(facts, userId).filter(
    (m) => getMembershipStatus(m, getCohort(facts, m.cohortId), now) === 'reserved',
  );
}

export function getCohortMemberships(facts: Facts, cohortId: string): Membership[] {
  return facts.memberships.filter((m) => m.cohortId === cohortId);
}

/** 이 문맥에서 쓸 Ctx 를 만든다. */
export function makeCtx(facts: Facts, membershipId: MembershipId, now: Date): Ctx {
  return { now, cohort: getCohort(facts, getMembership(facts, membershipId).cohortId) };
}
