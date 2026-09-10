/**
 * Gate 2 동결 — 시뮬레이터 파라미터와 결과를 고정한다.
 *
 * Gate 3 이후 이 숫자가 하나라도 움직이면 Clock 이 커튼 역할을 넘어
 * 세계를 건드린 것이다. 파라미터를 "더 그럴듯한 숫자"로 다시 만지는 것도 막는다.
 */
import { describe, expect, it } from 'vitest';
import type { Cohort, Ctx } from '../../domain/types.js';
import { ARCHETYPES } from '../archetypes.js';
import { buildSimulatedCohort, DEFAULT_MIX, MOMENTUM_OFF } from '../cohort.js';
import { getCohortOutcome } from '../../domain/selectors/achievements.js';
import { factsOf, getAbMetrics } from '../metrics.js';
import { demoClockAt, nowDate } from '../../infrastructure/clock.js';

const COHORT: Cohort = {
  id: 'c-reading-0817', habitId: 'reading', generation: '9월 2기',
  startDate: '2026-08-17', durationDays: 66, capacity: 30, policyVersion: 1,
};
/** 66일이 끝난 뒤. DemoClock 으로 세운다 */
const AFTER_END: Ctx = { now: nowDate(demoClockAt(2026, 10, 25, 9)), cohort: COHORT };

const build = (coef: number) =>
  buildSimulatedCohort({
    simulatorVersion: 1, cohort: COHORT, throughDay: 66,
    photoRefs: ['habit-reading', 'habit-journal', 'habit-english'],
    texts: ['오늘도 15분', '출근길에 읽었다', '자기 전에 겨우', '카페에서 30분'],
    momentum: coef === 0 ? MOMENTUM_OFF : { coefficient: coef, windowDays: 3 },
  });

const facts = (c: ReturnType<typeof build>) => factsOf(c, COHORT);
const stats = (c: ReturnType<typeof build>) => getAbMetrics(c, facts(c), AFTER_END);

describe('파라미터 동결', () => {
  it('배분이 바뀌지 않았다', () => {
    expect(DEFAULT_MIX).toEqual([
      { archetype: 'ordinary', count: 8 },
      { archetype: 'steady', count: 5 },
      { archetype: 'deadline', count: 5 },
      { archetype: 'hotStart', count: 4 },
      { archetype: 'comeback', count: 4 },
      { archetype: 'atRisk', count: 3 },
    ]);
  });

  it('원형 수치가 바뀌지 않았다', () => {
    expect(ARCHETYPES.steady.baseAttendance).toBe(0.78);
    expect(ARCHETYPES.steady.comebackStrength).toBe(0.14);
    expect(ARCHETYPES.ordinary.baseAttendance).toBe(0.66);
    expect(ARCHETYPES.ordinary.comebackStrength).toBe(0.09);
    expect(ARCHETYPES.deadline.latePropensity).toBe(0.42);
    expect(ARCHETYPES.hotStart.fatigueSlope).toBe(0.34);
    expect(ARCHETYPES.comeback.comebackStrength).toBe(0.26);
    expect(ARCHETYPES.atRisk.baseAttendance).toBe(0.46);
  });
});

describe('Gate 2 결과 스냅샷', () => {
  it('momentum 0 — 최종 기준 세계', () => {
    expect(stats(build(0))).toEqual({
      comebackWithin3: 81.6, dormantMembers: 9, meanFilled: 39.5, steadyMeanFilled: 57.6, stayedToEnd: 26,
    });
  });

  it('momentum 0.35 — 실험 세계', () => {
    expect(stats(build(0.35))).toEqual({
      comebackWithin3: 86.9, dormantMembers: 7, meanFilled: 41.3, steadyMeanFilled: 57.6, stayedToEnd: 25,
    });
  });

  it('Clock 을 어디에 두든 66일 종료 후 통계는 같다', () => {
    const c = build(0);
    const later: Ctx = { now: nowDate(demoClockAt(2026, 12, 31, 9)), cohort: COHORT };
    expect(getCohortOutcome(facts(c), later).meanFilled)
      .toBeCloseTo(getCohortOutcome(facts(c), AFTER_END).meanFilled, 5);
  });
});

