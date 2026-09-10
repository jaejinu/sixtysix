/**
 * A/B 지표 — 정의를 한 곳에만 둔다.
 *
 * "복귀율" 을 두 곳에서 다르게 계산했다가 40% 와 62% 가 같은 이름으로 문서에 남았다.
 * 분모가 미인증 "일수" 냐 미인증 "구간" 이냐의 차이였다.
 * 지표 정의가 흩어지면 같은 실수가 반복되므로 여기서만 정의한다.
 */
import type { Cohort, Ctx, Facts } from '../domain/types.js';
import { getFilledDays } from '../domain/selectors/progress.js';
import { getCohortOutcome } from '../domain/selectors/achievements.js';
import type { SimulatedCohort } from './cohort.js';

export interface AbMetrics {
  /** 미인증이 시작된 구간 중 3일 안에 돌아온 비율(%) — cohortMomentum 의 직접 효과 */
  readonly comebackWithin3: number;
  /** 휴면(7일 연속 미인증)을 한 번이라도 겪은 인원 — 이탈 방지 효과 */
  readonly dormantMembers: number;
  /** 코호트 평균 채운 날 */
  readonly meanFilled: number;
  /** steady 원형 평균. 효과가 잘하는 사람에게 번지지 않는지 확인한다 */
  readonly steadyMeanFilled: number;
  /** 보조 지표. 정의상 포화되어 판별력이 약하다 */
  readonly stayedToEnd: number;
}

/**
 * 미인증 구간의 시작 시점만 기회로 센다.
 * 같은 구간의 2일차·3일차를 각각 세면 오래 빠진 사람이 분모를 지배한다.
 */
export function comebackWithin3(cohort: SimulatedCohort, facts: Facts, durationDays: number): number {
  let chances = 0;
  let returned = 0;
  for (const m of cohort.members) {
    const filled = getFilledDays(facts, m.membershipId, durationDays);
    for (let d = 2; d <= durationDays - 3; d++) {
      // 어제는 채웠고 오늘 비었다 = 미인증 구간의 시작
      if (filled.has(d) || !filled.has(d - 1)) continue;
      chances++;
      if (filled.has(d + 1) || filled.has(d + 2) || filled.has(d + 3)) returned++;
    }
  }
  return chances ? Number(((returned / chances) * 100).toFixed(1)) : 0;
}

export function getAbMetrics(cohort: SimulatedCohort, facts: Facts, ctx: Ctx): AbMetrics {
  const outcome = getCohortOutcome(facts, ctx);
  const steadyIds = cohort.members.filter((m) => m.archetype === 'steady').map((m) => m.membershipId);
  const steadyMean =
    steadyIds.reduce((s, id) => s + getFilledDays(facts, id, ctx.cohort.durationDays).size, 0) / steadyIds.length;

  return {
    comebackWithin3: comebackWithin3(cohort, facts, ctx.cohort.durationDays),
    dormantMembers: [...cohort.stateByMember.values()].filter((s) => s.dormantSpells > 0).length,
    meanFilled: Number(outcome.meanFilled.toFixed(1)),
    steadyMeanFilled: Number(steadyMean.toFixed(1)),
    stayedToEnd: outcome.stayedToEnd,
  };
}

export function factsOf(cohort: SimulatedCohort, c: Cohort): Facts {
  return {
    habits: [], cohorts: [c], memberships: cohort.memberships,
    checkins: cohort.checkins, passUsages: cohort.passUsages, reactions: [],
  };
}
