/** 확률 함수는 난수와 분리돼 있어 단독으로 검증한다 */
import { describe, expect, it } from 'vitest';
import { ARCHETYPES, getAttendanceProbability, type ArchetypeId } from '../archetypes.js';

const IDS = Object.keys(ARCHETYPES) as ArchetypeId[];
const at = (id: ArchetypeId, over: Partial<Parameters<typeof getAttendanceProbability>[0]> = {}) =>
  getAttendanceProbability({
    archetype: ARCHETYPES[id],
    previousStreak: 0,
    consecutiveMisses: 0,
    cohortDay: 1,
    durationDays: 66,
    ...over,
  });

describe('확률 함수', () => {
  it('원형 6종이 모두 정의돼 있다', () => {
    expect(IDS).toEqual(['steady', 'ordinary', 'deadline', 'hotStart', 'comeback', 'atRisk']);
  });

  it('항상 0 초과 1 미만', () => {
    for (const id of IDS) {
      for (const streak of [0, 5, 30, 60]) {
        for (const misses of [0, 1, 3, 10]) {
          for (const day of [1, 33, 66]) {
            const p = at(id, { previousStreak: streak, consecutiveMisses: misses, cohortDay: day });
            expect(p).toBeGreaterThan(0);
            expect(p).toBeLessThan(1);
          }
        }
      }
    }
  });

  it('연속이 쌓이면 확률이 오르고 cap 에서 멈춘다', () => {
    const p0 = at('steady', { previousStreak: 0 });
    const p7 = at('steady', { previousStreak: 7 });
    const p14 = at('steady', { previousStreak: 14 });
    const p60 = at('steady', { previousStreak: 60 });
    expect(p7).toBeGreaterThan(p0);
    expect(p14).toBeGreaterThan(p7);
    expect(p60).toBe(p14); // cap 이후 더 오르지 않는다
  });

  it('한두 번 빠지면 확률이 내려간다', () => {
    const p0 = at('ordinary', { consecutiveMisses: 0 });
    const p1 = at('ordinary', { consecutiveMisses: 1 });
    const p2 = at('ordinary', { consecutiveMisses: 2 });
    expect(p1).toBeLessThan(p0);
    expect(p2).toBeLessThan(p1);
  });

  it('오래 빠지면 comeback 이 작동해 다시 오른다', () => {
    const dip = at('comeback', { consecutiveMisses: 2 });
    const back = at('comeback', { consecutiveMisses: 6 });
    expect(back).toBeGreaterThan(dip);
  });

  it('atRisk 는 오래 빠져도 잘 돌아오지 않는다', () => {
    const comebackGain = at('comeback', { consecutiveMisses: 6 }) - at('comeback', { consecutiveMisses: 2 });
    const atRiskGain = at('atRisk', { consecutiveMisses: 6 }) - at('atRisk', { consecutiveMisses: 2 });
    expect(comebackGain).toBeGreaterThan(atRiskGain);
  });

  it('날이 갈수록 피로가 쌓인다', () => {
    for (const id of IDS) {
      expect(at(id, { cohortDay: 66 })).toBeLessThan(at(id, { cohortDay: 1 }));
    }
  });

  it('hotStart 는 후반 하락 폭이 가장 크다', () => {
    const drops = IDS.map((id) => ({ id, drop: at(id, { cohortDay: 1 }) - at(id, { cohortDay: 66 }) }));
    drops.sort((a, b) => b.drop - a.drop);
    expect(drops[0]!.id).toBe('hotStart');
  });

  it('deadline 은 출석이 아니라 늦는 성향으로 구분된다', () => {
    // 출석 확률은 ordinary 와 비슷해야 한다
    expect(Math.abs(at('deadline') - at('ordinary'))).toBeLessThan(0.05);
    // 늦는 성향은 확연히 크다
    expect(ARCHETYPES.deadline.latePropensity).toBeGreaterThan(ARCHETYPES.ordinary.latePropensity * 3);
  });

  it('cohortMomentum 은 기본값 0 이라 결과에 영향을 주지 않는다', () => {
    const withoutTerm = at('ordinary', { previousStreak: 3 });
    const explicitZero = at('ordinary', { previousStreak: 3, cohortMomentum: 0, yesterdayParticipation: 0.9 });
    expect(explicitZero).toBe(withoutTerm);
  });

  it('cohortMomentum 을 켜면 어제 참여율이 오늘 확률을 움직인다', () => {
    const low = at('ordinary', { cohortMomentum: 0.08, yesterdayParticipation: 0.2 });
    const high = at('ordinary', { cohortMomentum: 0.08, yesterdayParticipation: 0.9 });
    expect(high).toBeGreaterThan(low);
  });
});
