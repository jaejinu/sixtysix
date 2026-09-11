/**
 * 화면이 읽는 Facts 를 만든다.
 *
 * 시뮬레이터는 29명만 만든다 (정원 30 중 한 자리가 사용자).
 * 내 멤버십과 내 인증을 여기서 얹는다.
 */
import type { Facts, Checkin, PassUsage, Membership } from '../domain/types';
import { buildSimulatedCohort, type SimulatedMember } from '../simulator/cohort';
import { HABITS, DEMO_COHORT, PHOTO_REFS, CHECKIN_TEXTS, MY_USER_ID, MY_MEMBERSHIP_ID } from './catalog';
import { getCohortDay } from '../domain/selectors/time';

export const SIMULATOR_VERSION = 1;

export interface MyFacts {
  readonly checkins: readonly Checkin[];
  readonly passUsages: readonly PassUsage[];
}

export interface World {
  readonly facts: Facts;
  readonly members: readonly SimulatedMember[];
  readonly nameByMembership: ReadonlyMap<string, string>;
}

const MY_MEMBERSHIP: Membership = {
  id: MY_MEMBERSHIP_ID,
  userId: MY_USER_ID,
  cohortId: DEMO_COHORT.id,
  joinedAt: `${DEMO_COHORT.startDate}T00:00:00+09:00`,
};

/**
 * now 까지만 생성한다. 미래 인증이 새어 나오면 진행판·랭킹이 오염된다.
 * (Gate 3 방화벽 4 가 잡았던 버그)
 */
export function buildWorld(now: Date, mine: MyFacts): World {
  const throughDay = Math.max(0, Math.min(getCohortDay(now, DEMO_COHORT), DEMO_COHORT.durationDays));

  const sim = buildSimulatedCohort({
    simulatorVersion: SIMULATOR_VERSION,
    cohort: DEMO_COHORT,
    throughDay,
    photoRefs: [...PHOTO_REFS],
    texts: [...CHECKIN_TEXTS],
  });

  const nameByMembership = new Map<string, string>();
  for (const m of sim.members) nameByMembership.set(m.membershipId, m.name);
  nameByMembership.set(MY_MEMBERSHIP_ID, '재진');

  const facts: Facts = {
    habits: HABITS,
    cohorts: [DEMO_COHORT],
    memberships: [...sim.memberships, MY_MEMBERSHIP],
    checkins: [...sim.checkins, ...mine.checkins],
    passUsages: [...sim.passUsages, ...mine.passUsages],
    reactions: [],
  };

  return { facts, members: sim.members, nameByMembership };
}
