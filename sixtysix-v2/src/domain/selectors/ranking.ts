/**
 * 랭킹 — 정책 4. 실제 인증 일수 내림차순, 동률이면 연속 기록.
 * 면제권은 연속만 잇고 인증 수에는 들어가지 않는다. 나와 남이 같은 함수로 계산된다.
 */
import type { Cohort, CohortDay, CohortParticipation, Ctx, Facts, RankingRow } from '../types.js';
import { getCheckins, isLate } from './checkin.js';
import { getMemberState, getStreak, isDormant } from './progress.js';
import { getCohortMemberships } from './membership.js';

export function getRanking(facts: Facts, cohort: Cohort, now: Date): RankingRow[] {
  const ctx: Ctx = { now, cohort };
  const rows = getCohortMemberships(facts, cohort.id).map((m) => ({
    membershipId: m.id,
    checkins: getCheckins(facts, m.id).length,
    streak: getStreak(facts, m.id, ctx),
    state: getMemberState(facts, m.id, ctx),
  }));

  rows.sort((a, b) => (b.checkins !== a.checkins ? b.checkins - a.checkins : b.streak - a.streak));

  let rank = 0;
  let prevCheckins: number | null = null;
  let prevStreak: number | null = null;
  return rows.map((r, i) => {
    if (r.checkins !== prevCheckins || r.streak !== prevStreak) rank = i + 1;
    prevCheckins = r.checkins;
    prevStreak = r.streak;
    return { ...r, rank };
  });
}

/** 그날 코호트가 어떤 상태였는가. V1 은 이 값을 하드코딩했다. */
export function getCohortParticipation(
  facts: Facts,
  cohort: Cohort,
  day: CohortDay,
  now: Date,
): CohortParticipation {
  const ctx: Ctx = { now, cohort };
  const members = getCohortMemberships(facts, cohort.id);
  let done = 0;
  let late = 0;
  let dormant = 0;

  for (const m of members) {
    const checkin = facts.checkins.find((c) => c.membershipId === m.id && c.cohortDay === day);
    if (checkin) {
      done++;
      if (isLate(checkin, cohort)) late++;
    } else if (isDormant(facts, m.id, ctx)) {
      dormant++;
    }
  }

  return {
    day,
    done,
    late,
    dormant,
    pending: Math.max(0, members.length - done - dormant),
    total: cohort.capacity,
  };
}
