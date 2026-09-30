/**
 * 시간 — Clock 과 Cohort 를 잇는다.
 *
 * 여기서 new Date() 를 직접 부르지 않는다. now 는 인자로만 받는다.
 * 그리고 Clock 은 "지금 몇 시인가"만 답한다.
 * "이 시각이 어느 cohortDay 에 귀속되는가"는 정책이며 이 파일의 몫이다.
 */
import type { Cohort, CohortDay } from '../types.js';
import { policyFor } from '../policies.js';
import { dayNumberOfIsoDate, epochForZonedTime, zonedDayNumber, zonedParts } from '../../infrastructure/timezone.js';

/** 달력 기준 며칠째인가. 시작일이 1일차. */
export function calendarDay(at: Date, cohort: Cohort): number {
  const tz = policyFor(cohort.policyVersion).timeZone;
  return zonedDayNumber(at.getTime(), tz) - dayNumberOfIsoDate(cohort.startDate) + 1;
}

/**
 * 지금이 코호트 몇 일차인가.
 *
 * 마감이 다음 날 04:00 이므로 04:00 이전은 아직 전날의 인증 창이 열려 있다.
 * 진행판과 홈이 가리키는 "오늘"은 그 창을 따른다.
 */
export function getCohortDay(now: Date, cohort: Cohort): CohortDay {
  const policy = policyFor(cohort.policyVersion);
  const raw = calendarDay(now, cohort);
  const hour = zonedParts(now.getTime(), policy.timeZone).hour;
  return Math.max(0, hour < policy.deadlineHour ? raw - 1 : raw);
}

export type CohortPhase = 'before' | 'running' | 'ended';

export function getCohortPhase(now: Date, cohort: Cohort): CohortPhase {
  const day = getCohortDay(now, cohort);
  if (day < 1) return 'before';
  if (day > cohort.durationDays) return 'ended';
  return 'running';
}

/** 해당 일차의 마감 시각. 다음 날 04:00. 서비스 시간대 기준이다. */
export function getDeadline(cohort: Cohort, day: CohortDay): Date {
  const policy = policyFor(cohort.policyVersion);
  const [y, m, d] = cohort.startDate.split('-').map(Number) as [number, number, number];
  return new Date(epochForZonedTime(y, m, d + day, policy.deadlineHour, 0, policy.timeZone));
}

/** 늦은 인증을 받아주는 마지막 시각. 마감 + 12시간. */
export function getLateWindowEnd(cohort: Cohort, day: CohortDay): Date {
  const policy = policyFor(cohort.policyVersion);
  return new Date(getDeadline(cohort, day).getTime() + policy.lateWindowHours * 3_600_000);
}

/**
 * 인증을 지금 남기면 어느 일차에 귀속되는가. **쓰기 경로 전용.**
 *
 * 04:00 이전이면 전날 인증 창이 열려 있다.
 * 04:00 이후라도 전날을 아직 채우지 않았고 늦은 인증 창이 남아 있으면 전날에 귀속한다.
 * 그 외에는 오늘에 귀속한다.
 */
export function resolveCheckinTarget(
  now: Date,
  cohort: Cohort,
  filledDays: ReadonlySet<CohortDay>,
): { cohortDay: CohortDay; late: boolean } {
  const policy = policyFor(cohort.policyVersion);
  const cal = calendarDay(now, cohort);

  if (zonedParts(now.getTime(), policy.timeZone).hour < policy.deadlineHour) {
    return { cohortDay: Math.max(1, cal - 1), late: false };
  }

  const yesterday = cal - 1;
  if (
    yesterday >= 1 &&
    !filledDays.has(yesterday) &&
    now.getTime() <= getLateWindowEnd(cohort, yesterday).getTime()
  ) {
    return { cohortDay: yesterday, late: true };
  }

  return { cohortDay: cal, late: false };
}

/**
 * 지금 인증을 남길 수 있는가. **쓰기 경로의 문지기.**
 *
 * 화면(버튼 비활성)만 막으면 /checkin 직접 진입·더블클릭·기간 종료 후 진입이 새어 들어온다.
 * 귀속 일차를 정한 뒤, 그 일차가 기간 안인지 · 이미 채워졌는지를 여기서 한 번에 판정한다.
 */
export type CheckinBlockReason = 'before' | 'ended' | 'filled';

export type CheckinAvailability =
  | { readonly ok: true; readonly cohortDay: CohortDay; readonly late: boolean }
  | { readonly ok: false; readonly reason: CheckinBlockReason; readonly cohortDay: CohortDay };

export function getCheckinAvailability(
  now: Date,
  cohort: Cohort,
  filledDays: ReadonlySet<CohortDay>,
): CheckinAvailability {
  // 시작일 04:00 전에는 1일차 창이 아직 열리지 않았다
  if (getCohortDay(now, cohort) < 1) return { ok: false, reason: 'before', cohortDay: 1 };

  const target = resolveCheckinTarget(now, cohort, filledDays);
  if (target.cohortDay > cohort.durationDays) {
    return { ok: false, reason: 'ended', cohortDay: cohort.durationDays };
  }
  if (filledDays.has(target.cohortDay)) {
    return { ok: false, reason: 'filled', cohortDay: target.cohortDay };
  }
  return { ok: true, cohortDay: target.cohortDay, late: target.late };
}

/** n일차는 달력으로 며칠인가. 서비스 시간대 기준 */
export function getDayDate(cohort: Cohort, day: CohortDay): { year: number; month: number; day: number } {
  const policy = policyFor(cohort.policyVersion);
  const [y, m, d] = cohort.startDate.split('-').map(Number) as [number, number, number];
  const p = zonedParts(epochForZonedTime(y, m, d + day - 1, 12, 0, policy.timeZone), policy.timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

/**
 * 지금 코호트를 시작하면 시작일은 언제인가 — 「지금」이 1일차가 되는 날짜.
 *
 * 04:00 전은 아직 전날의 창이다. 새벽 2시에 시작하면 시작일은 어제이고,
 * 그래야 getCohortDay(now) 가 0 이 아니라 1 이 된다 (P2-D — 말한 대로 1일차).
 */
export function getJoinDate(now: Date, policyVersion: number): string {
  const policy = policyFor(policyVersion);
  const p = zonedParts(now.getTime(), policy.timeZone);
  const back = p.hour < policy.deadlineHour ? 1 : 0;
  const q = zonedParts(epochForZonedTime(p.year, p.month, p.day - back, 12, 0, policy.timeZone), policy.timeZone);
  return `${q.year}-${String(q.month).padStart(2, '0')}-${String(q.day).padStart(2, '0')}`;
}
