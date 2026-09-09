/** 시간 — Clock 과 Cohort 를 잇는다. new Date() 를 직접 부르지 않는다. */
import type { Cohort, CohortDay } from '../types.js';
import { policyFor } from '../policies.js';

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function cohortStart(cohort: Cohort): Date {
  const [y, m, d] = cohort.startDate.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** 달력 기준 며칠째인가. 시작일이 1일차. */
export function calendarDay(at: Date, cohort: Cohort): number {
  const diff = startOfDay(at).getTime() - cohortStart(cohort).getTime();
  return Math.round(diff / DAY_MS) + 1;
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
  const day = now.getHours() < policy.deadlineHour ? raw - 1 : raw;
  return Math.max(0, day);
}

export type CohortPhase = 'before' | 'running' | 'ended';

export function getCohortPhase(now: Date, cohort: Cohort): CohortPhase {
  const day = getCohortDay(now, cohort);
  if (day < 1) return 'before';
  if (day > cohort.durationDays) return 'ended';
  return 'running';
}

/** 해당 일차의 마감 시각. 다음 날 04:00. */
export function getDeadline(cohort: Cohort, day: CohortDay): Date {
  const policy = policyFor(cohort.policyVersion);
  const base = cohortStart(cohort);
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + day);
  d.setHours(policy.deadlineHour, 0, 0, 0);
  return d;
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

  if (now.getHours() < policy.deadlineHour) {
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
