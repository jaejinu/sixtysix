/** Gate 2 5~7단계 — 30명 코호트와 cohortMomentum A/B */
import { describe, expect, it } from 'vitest';
import type { Cohort, Facts, Ctx } from '../../domain/types.js';
import { validateFacts } from '../../domain/invariants.js';
import { getProgress, getFilledDays } from '../../domain/selectors/progress.js';
import { getCohortOutcome, stayedToEnd, filled66, perfect66 } from '../../domain/selectors/achievements.js';
import {
  DEFAULT_MIX, MEMBER_NAMES, buildMembers, buildSimulatedCohort,
  getComebackNeed, nonlinearSignal, MOMENTUM_OFF,
} from '../cohort.js';
import type { ArchetypeId } from '../archetypes.js';

const COHORT: Cohort = {
  id: 'c-reading-0817', habitId: 'reading', generation: '9월 2기',
  startDate: '2026-08-17', durationDays: 66, capacity: 30, policyVersion: 1,
};
const PHOTOS = ['habit-reading', 'habit-journal', 'habit-english'];
const TEXTS = ['오늘도 15분', '출근길에 읽었다', '자기 전에 겨우', '카페에서 30분'];
/** 66일이 끝난 뒤 시점 */
const AFTER_END = new Date(2026, 9, 25, 9, 0);

const build = (coefficient: number, throughDay = 66) =>
  buildSimulatedCohort({
    simulatorVersion: 1, cohort: COHORT, throughDay, photoRefs: PHOTOS, texts: TEXTS,
    momentum: coefficient === 0 ? MOMENTUM_OFF : { coefficient, windowDays: 3 },
  });

const toFacts = (c: ReturnType<typeof build>): Facts => ({
  habits: [], cohorts: [COHORT], memberships: c.memberships,
  checkins: c.checkins, passUsages: c.passUsages, reactions: [],
});

const OFF = build(0);
const factsOff = toFacts(OFF);
const ctx: Ctx = { now: AFTER_END, cohort: COHORT };

describe('구성', () => {
  it('배분대로 29명이 생성된다 (30번째는 사용자 자리)', () => {
    expect(OFF.members).toHaveLength(29);
    expect(DEFAULT_MIX.reduce((s, e) => s + e.count, 0)).toBe(29);
    const counts = new Map<ArchetypeId, number>();
    for (const m of OFF.members) counts.set(m.archetype, (counts.get(m.archetype) ?? 0) + 1);
    for (const e of DEFAULT_MIX) expect(counts.get(e.archetype), e.archetype).toBe(e.count);
  });

  it('원형이 index 와 붙어 있지 않다', () => {
    // 앞 8명이 전부 ordinary 면 셔플이 안 된 것이다
    const first8 = OFF.members.slice(0, 8).map((m) => m.archetype);
    expect(new Set(first8).size).toBeGreaterThan(1);
  });

  it('이름이 29개 모두 다르고 한글이다', () => {
    expect(new Set(MEMBER_NAMES).size).toBe(29);
    for (const n of MEMBER_NAMES) expect(n).toMatch(/^[가-힣]+$/);
  });

  it('결정론 — 같은 입력이면 같은 코호트', () => {
    const again = build(0);
    expect(again.members).toEqual(OFF.members);
    expect(again.checkins.map((c) => c.id)).toEqual(OFF.checkins.map((c) => c.id));
  });

  it('throughDay 를 늘려도 앞선 날의 결과가 변하지 않는다', () => {
    const to23 = build(0, 23);
    const prefix = OFF.checkins.filter((c) => c.cohortDay <= 23).map((c) => c.id).sort();
    expect(to23.checkins.map((c) => c.id).sort()).toEqual(prefix);
  });

  it('셔플은 결정론적이다', () => {
    const a = buildMembers(COHORT, DEFAULT_MIX, 1).map((m) => m.archetype);
    const b = buildMembers(COHORT, DEFAULT_MIX, 1).map((m) => m.archetype);
    expect(a).toEqual(b);
    const other = buildMembers(COHORT, DEFAULT_MIX, 2).map((m) => m.archetype);
    expect(other).not.toEqual(a);
  });
});

describe('생성된 사실이 도메인 불변식을 지킨다', () => {
  it('위반 0건', () => {
    expect(validateFacts(factsOff, AFTER_END)).toEqual([]);
  });

  it('모든 멤버가 66일을 넘지 않는다', () => {
    for (const m of OFF.members) {
      expect(getFilledDays(factsOff, m.membershipId).size).toBeLessThanOrEqual(66);
      expect(getProgress(factsOff, m.membershipId, ctx).passes).toBeLessThanOrEqual(3);
    }
  });
});

describe('성취 지표 — 생애주기와 분리', () => {
  it('stayedToEnd 는 마지막 7일 안에 직접 행동이 있어야 한다', () => {
    for (const m of OFF.members) {
      const last = Math.max(0, ...getFilledDays(factsOff, m.membershipId));
      expect(stayedToEnd(factsOff, m.membershipId, ctx)).toBe(last >= 60);
    }
  });

  it('코호트가 끝나기 전에는 stayedToEnd 가 성립하지 않는다', () => {
    const during: Ctx = { now: new Date(2026, 8, 8, 9, 0), cohort: COHORT };
    for (const m of OFF.members) expect(stayedToEnd(factsOff, m.membershipId, during)).toBe(false);
  });

  it('perfect66 은 면제권을 쓰면 성립하지 않는다', () => {
    for (const m of OFF.members) {
      const p = getProgress(factsOff, m.membershipId, ctx);
      if (perfect66(factsOff, m.membershipId, ctx)) {
        expect(p.passes).toBe(0);
        expect(p.checkins).toBeGreaterThanOrEqual(66);
      }
      if (p.passes > 0) expect(perfect66(factsOff, m.membershipId, ctx)).toBe(false);
    }
  });

  it('filled66 은 면제권을 인정한다', () => {
    for (const m of OFF.members) {
      expect(filled66(factsOff, m.membershipId, ctx))
        .toBe(getFilledDays(factsOff, m.membershipId).size >= 66);
    }
  });
});

describe('코호트 신호 함수', () => {
  it('연속 참여 중이면 복귀 필요도가 0 이다', () => {
    expect(getComebackNeed(0)).toBe(0);
  });

  it('2~4일 빠짐에서 가장 크고 휴면에서는 줄지만 0 은 아니다', () => {
    expect(getComebackNeed(1)).toBeLessThan(getComebackNeed(2));
    expect(getComebackNeed(3)).toBe(1);
    expect(getComebackNeed(8)).toBeLessThan(getComebackNeed(5));
    expect(getComebackNeed(8)).toBeGreaterThan(0);
  });

  it('신호는 절반을 기준으로 갈리고 비선형이다', () => {
    expect(nonlinearSignal(0.3)).toBeLessThan(0);   // 포기 전염
    expect(nonlinearSignal(0.5)).toBe(0);           // 절반이 기준점
    expect(nonlinearSignal(0.8)).toBeGreaterThan(0);
    // 제곱근이라 높은 쪽 상승이 완만하다
    expect(nonlinearSignal(1.0) - nonlinearSignal(0.8))
      .toBeLessThan(nonlinearSignal(0.7) - nonlinearSignal(0.5));
  });
});

describe('cohortMomentum A/B — 같은 seed 세계에서 계수만 바꾼다', () => {
  // 0.35 는 복귀율과 휴면에는 뚜렷한 효과가 있으면서
  // steady 원형에는 거의 번지지 않는 지점이다.
  const ON = build(0.35);
  const factsOn = toFacts(ON);

  const comebackWithin3 = (c: ReturnType<typeof build>) => {
    const facts = toFacts(c);
    let chances = 0;
    let returned = 0;
    for (const m of c.members) {
      const filled = getFilledDays(facts, m.membershipId);
      for (let d = 2; d <= 63; d++) {
        if (filled.has(d) || filled.has(d - 1)) continue; // 미인증이 이어진 시점만
        chances++;
        if (filled.has(d + 1) || filled.has(d + 2) || filled.has(d + 3)) returned++;
      }
    }
    return chances ? returned / chances : 0;
  };

  const dormantMembers = (c: ReturnType<typeof build>) =>
    [...c.stateByMember.values()].filter((s) => s.dormantSpells > 0).length;

  const steadyMeanFilled = (c: ReturnType<typeof build>) => {
    const facts = toFacts(c);
    const ids = c.members.filter((m) => m.archetype === 'steady').map((m) => m.membershipId);
    return ids.reduce((s, id) => s + getFilledDays(facts, id).size, 0) / ids.length;
  };

  it('결과를 출력한다', () => {
    const a = getCohortOutcome(factsOff, ctx);
    const b = getCohortOutcome(factsOn, ctx);
    console.log('\n  === cohortMomentum A/B (같은 seed, 계수만 0 → 0.35) ===');
    console.log(`  3일 내 복귀율   ${(comebackWithin3(OFF) * 100).toFixed(1)}%  →  ${(comebackWithin3(ON) * 100).toFixed(1)}%`);
    console.log(`  휴면 경험 인원   ${dormantMembers(OFF)}명  →  ${dormantMembers(ON)}명`);
    console.log(`  stayedToEnd     ${a.stayedToEnd}명  →  ${b.stayedToEnd}명`);
    console.log(`  평균 채운 날     ${a.meanFilled.toFixed(1)}  →  ${b.meanFilled.toFixed(1)}`);
    console.log(`  filled66        ${a.filled66}명  →  ${b.filled66}명`);
    console.log(`  perfect66       ${a.perfect66}명  →  ${b.perfect66}명`);
    console.log(`  steady 평균      ${steadyMeanFilled(OFF).toFixed(1)}  →  ${steadyMeanFilled(ON).toFixed(1)}`);
    console.log(`  (복귀율·휴면이 1차 지표. stayedToEnd 는 정의상 포화되어 판별력이 없다)\n`);
    expect(a.members).toBe(29);
  });

  it('① 3일 내 복귀율이 오른다 — 직접 효과', () => {
    expect(comebackWithin3(ON)).toBeGreaterThan(comebackWithin3(OFF));
  });

  it('② 휴면 인원이 줄거나 같다 — 이탈 방지', () => {
    expect(dormantMembers(ON)).toBeLessThanOrEqual(dormantMembers(OFF));
  });

  it('③ 평균 채운 날이 늘어난다', () => {
    expect(getCohortOutcome(factsOn, ctx).meanFilled)
      .toBeGreaterThan(getCohortOutcome(factsOff, ctx).meanFilled);
  });

  it('stayedToEnd 는 이 시뮬레이션에서 판별력이 없다 — 지표의 성질이다', () => {
    // 정의상 마지막 7일 안에 한 번만 행동해도 성립하므로 거의 모두가 충족한다.
    // 정의를 숫자에 맞춰 고치지 않는다. 대신 A/B 의 1차 지표로 쓰지 않는다.
    const a = getCohortOutcome(factsOff, ctx).stayedToEnd;
    const b = getCohortOutcome(factsOn, ctx).stayedToEnd;
    expect(a / 29).toBeGreaterThan(0.8);
    expect(b / 29).toBeGreaterThan(0.8);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
  });

  it('⑥ steady 에게 효과가 과도하게 번지지 않는다', () => {
    // 연속 참여 중인 멤버에게는 보정이 적용되지 않아야 한다
    const diff = steadyMeanFilled(ON) - steadyMeanFilled(OFF);
    expect(diff).toBeLessThan(1.5);
  });

  it('계수 0 이면 momentum 을 끈 것과 완전히 같다', () => {
    const zero = build(0);
    expect(zero.checkins.map((c) => c.id)).toEqual(OFF.checkins.map((c) => c.id));
  });
});
