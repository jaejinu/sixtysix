/** 진행 — 66칸과 통계. total 이라는 이름을 쓰지 않는다. */
import type {
  CohortDay, Ctx, DayStatus, Facts, MemberState, MembershipId, PassUsage, Progress,
} from '../types.js';
import { policyFor } from '../policies.js';
import { getCohortDay, getCohortPhase } from './time.js';
import { getCheckins, isLate } from './checkin.js';

export function getPassUsages(
  facts: Facts, membershipId: MembershipId, throughDay?: number,
): PassUsage[] {
  return facts.passUsages
    .filter((p) => p.membershipId === membershipId && (throughDay === undefined || p.cohortDay <= throughDay))
    .slice()
    .sort((a, b) => a.cohortDay - b.cohortDay);
}

/** 인증한 날 ∪ 면제권 쓴 날. throughDay 이후는 세지 않는다. */
export function getFilledDays(
  facts: Facts, membershipId: MembershipId, throughDay?: number,
): Set<CohortDay> {
  const days = new Set<CohortDay>();
  for (const c of getCheckins(facts, membershipId, throughDay)) days.add(c.cohortDay);
  for (const p of getPassUsages(facts, membershipId, throughDay)) days.add(p.cohortDay);
  return days;
}

/** 66칸 한 칸의 상태. 진행판을 그리는 유일한 함수다. */
export function getDayStatus(
  day: CohortDay,
  facts: Facts,
  membershipId: MembershipId,
  ctx: Ctx,
): DayStatus {
  const today = getCohortDay(ctx.now, ctx.cohort);
  // 미래 판정을 가장 먼저 한다. 데이터가 있어도 시계 너머는 보여주지 않는다.
  if (day > today) return 'future';

  const checkin = facts.checkins.find(
    (c) => c.membershipId === membershipId && c.cohortDay === day,
  );
  if (checkin) return isLate(checkin, ctx.cohort) ? 'late' : 'done';
  if (facts.passUsages.some((p) => p.membershipId === membershipId && p.cohortDay === day)) {
    return 'pass';
  }
  if (day === today) return 'today';
  return 'miss';
}

/** 연속은 인증·늦은 인증·면제권이 잇고 미인증이 끊는다. */
export function getStreak(facts: Facts, membershipId: MembershipId, ctx: Ctx): number {
  const today = getCohortDay(ctx.now, ctx.cohort);
  const filled = getFilledDays(facts, membershipId, today);
  let cursor = filled.has(today) ? today : today - 1;
  let streak = 0;
  while (cursor >= 1 && filled.has(cursor)) {
    streak++;
    cursor--;
  }
  return streak;
}

export function getBestStreak(facts: Facts, membershipId: MembershipId, ctx: Ctx): number {
  const today = getCohortDay(ctx.now, ctx.cohort);
  const filled = getFilledDays(facts, membershipId, today);
  let best = 0;
  let run = 0;
  for (let d = 1; d <= Math.min(today, ctx.cohort.durationDays); d++) {
    if (filled.has(d)) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

export function getProgress(facts: Facts, membershipId: MembershipId, ctx: Ctx): Progress {
  const policy = policyFor(ctx.cohort.policyVersion);
  const today = getCohortDay(ctx.now, ctx.cohort);
  const checkins = getCheckins(facts, membershipId, today);
  const passes = getPassUsages(facts, membershipId, today);
  const filled = getFilledDays(facts, membershipId, today);

  let lates = 0;
  let simples = 0;
  let privates = 0;
  for (const c of checkins) {
    if (isLate(c, ctx.cohort)) lates++;
    if (c.photoRef == null) simples++;
    if (c.visibility === 'private') privates++;
  }

  const filledCount = filled.size;
  return {
    day: today,
    checkins: checkins.length,
    filled: filledCount,
    passes: passes.length,
    passesLeft: Math.max(0, policy.passLimit - passes.length),
    lates,
    simples,
    privates,
    streak: getStreak(facts, membershipId, ctx),
    bestStreak: getBestStreak(facts, membershipId, ctx),
    remaining: Math.max(0, ctx.cohort.durationDays - filledCount),
    percent: Math.round((filledCount / ctx.cohort.durationDays) * 100),
  };
}

/** 연속 미인증이 정책 일수에 도달했는가 */
export function isDormant(facts: Facts, membershipId: MembershipId, ctx: Ctx): boolean {
  const policy = policyFor(ctx.cohort.policyVersion);
  const today = getCohortDay(ctx.now, ctx.cohort);
  if (today <= policy.dormancyDays) return false;
  const filled = getFilledDays(facts, membershipId, today);
  for (let d = today - policy.dormancyDays; d < today; d++) {
    if (filled.has(d)) return false;
  }
  return true;
}

/** 사용자 상태 6종. 정확히 하나만 참이다. */
export function getMemberState(facts: Facts, membershipId: MembershipId, ctx: Ctx): MemberState {
  if (getCohortPhase(ctx.now, ctx.cohort) === 'ended') return 'ended';

  const today = getCohortDay(ctx.now, ctx.cohort);
  const filled = getFilledDays(facts, membershipId, today);

  if (filled.has(today)) return 'done';
  if (isDormant(facts, membershipId, ctx)) return 'dormant';
  if (today > 1 && !filled.has(today - 1)) return 'broken';
  if (getCheckins(facts, membershipId, today).length === 0) return 'day0';
  return 'ongoing';
}
