/**
 * Gate 2 중간 완료 기준.
 * 30명으로 확장하기 전에 원형 1명씩 6명을 66일 돌려 궤적을 확인한다.
 * 이름을 가리고 봐도 어느 원형인지 느껴지면 성공이다.
 */
import { describe, expect, it } from 'vitest';
import type { Cohort } from '../../domain/types.js';
import { ARCHETYPES, type ArchetypeId } from '../archetypes.js';
import { simulateMember, type MemberTrajectory } from '../member.js';
import { validateFacts } from '../../domain/invariants.js';

const COHORT: Cohort = {
  id: 'c-reading-0817', habitId: 'reading', generation: '9월 2기',
  startDate: '2026-08-17', durationDays: 66, capacity: 30, policyVersion: 1,
};
const PHOTOS = ['habit-reading', 'habit-journal', 'habit-english'];
const TEXTS = ['오늘도 15분', '출근길에 읽었다', '자기 전에 겨우', '카페에서 30분'];

const IDS = Object.keys(ARCHETYPES) as ArchetypeId[];

function run(id: ArchetypeId, version = 1): MemberTrajectory {
  return simulateMember({
    simulatorVersion: version,
    cohort: COHORT,
    membershipId: `ms-${id}`,
    archetype: ARCHETYPES[id],
    throughDay: 66,
    photoRefs: PHOTOS,
    texts: TEXTS,
   
  });
}

const T = Object.fromEntries(IDS.map((id) => [id, run(id)])) as Record<ArchetypeId, MemberTrajectory>;

describe('궤적 — 결정론', () => {
  it('같은 seed 면 같은 궤적', () => {
    for (const id of IDS) {
      expect(run(id).checkins).toEqual(T[id].checkins);
      expect(run(id).passUsages).toEqual(T[id].passUsages);
    }
  });

  it('simulatorVersion 을 올리면 다른 세계가 된다', () => {
    // 개수만 비교하면 우연히 같을 수 있다. 궤적 자체를 비교한다
    const v2 = run('ordinary', 2);
    const daysOf = (t: MemberTrajectory) => t.checkins.map((c) => c.cohortDay).join(',');
    expect(daysOf(v2)).not.toBe(daysOf(T.ordinary));
  });

  it('throughDay 를 늘려도 앞선 날의 결과는 변하지 않는다', () => {
    const to23 = simulateMember({
      simulatorVersion: 1, cohort: COHORT, membershipId: 'ms-ordinary',
      archetype: ARCHETYPES.ordinary, throughDay: 23, photoRefs: PHOTOS, texts: TEXTS,
    });
    const to66 = T.ordinary;
    const prefix = to66.checkins.filter((c) => c.cohortDay <= 23);
    expect(to23.checkins).toEqual(prefix);
  });
});

describe('궤적 — 불변식', () => {
  it('생성된 사실이 도메인 불변식을 지킨다', () => {
    for (const id of IDS) {
      const facts = {
        habits: [], cohorts: [COHORT],
        memberships: [{ id: `ms-${id}`, userId: `u-${id}`, cohortId: COHORT.id, joinedAt: '2026-08-17T09:00:00.000Z' }],
        checkins: T[id].checkins, passUsages: T[id].passUsages, reactions: [],
      };
      expect(validateFacts(facts, new Date(2026, 9, 21, 9, 0)), id).toEqual([]);
    }
  });

  it('같은 날에 인증과 면제권이 겹치지 않는다', () => {
    for (const id of IDS) {
      const days = new Set(T[id].checkins.map((c) => c.cohortDay));
      for (const p of T[id].passUsages) expect(days.has(p.cohortDay), id).toBe(false);
    }
  });

  it('면제권은 3회를 넘지 않는다', () => {
    for (const id of IDS) expect(T[id].summary.passes, id).toBeLessThanOrEqual(3);
  });
});

describe('궤적 — 원형이 구분되는가', () => {
  it('출석 순서가 성향과 맞는다', () => {
    expect(T.steady.summary.checkins).toBeGreaterThan(T.ordinary.summary.checkins);
    expect(T.ordinary.summary.checkins).toBeGreaterThan(T.comeback.summary.checkins);
    expect(T.comeback.summary.checkins).toBeGreaterThan(T.atRisk.summary.checkins);
  });

  it('steady 가 가장 긴 연속을 만든다', () => {
    for (const id of IDS) {
      if (id === 'steady') continue;
      expect(T.steady.summary.bestStreak, id).toBeGreaterThanOrEqual(T[id].summary.bestStreak);
    }
  });

  it('deadline 은 늦은 인증 비율이 가장 높다', () => {
    const rate = (id: ArchetypeId) => T[id].summary.lates / Math.max(1, T[id].summary.checkins);
    for (const id of IDS) {
      if (id === 'deadline') continue;
      expect(rate('deadline'), id).toBeGreaterThan(rate(id));
    }
  });

  it('deadline 은 출석 자체는 나쁘지 않다 — 막판에 나타나는 사람이다', () => {
    expect(T.deadline.summary.checkins).toBeGreaterThan(T.comeback.summary.checkins);
  });

  it('hotStart 는 초반이 후반보다 확연히 높다', () => {
    // 한 명만 보면 22일 구간의 분산이 커서 원형 차이가 묻힌다.
    // 실제 코호트는 원형당 여러 명이므로 평균으로 판정한다.
    const N = 8;
    const meanDecline = (id: ArchetypeId): number => {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const t = simulateMember({
          simulatorVersion: 1, cohort: COHORT, membershipId: `ms-${id}-${i}`,
          archetype: ARCHETYPES[id], throughDay: 66,
          photoRefs: PHOTOS, texts: TEXTS,
        });
        const early = t.checkins.filter((c) => c.cohortDay <= 22).length;
        const late = t.checkins.filter((c) => c.cohortDay > 44).length;
        sum += early - late;
      }
      return sum / N;
    };

    const hot = meanDecline('hotStart');
    expect(hot, '초반이 후반보다 높아야 한다').toBeGreaterThan(0);
    for (const id of IDS) {
      if (id === 'hotStart') continue;
      expect(hot, `${id} 보다 하락폭이 커야 한다`).toBeGreaterThan(meanDecline(id));
    }
  });

  it('comeback 은 atRisk 보다 복귀가 잦다', () => {
    expect(T.comeback.summary.comebacks).toBeGreaterThan(T.atRisk.summary.comebacks);
  });

  it('atRisk 는 휴면에 빠진다', () => {
    expect(T.atRisk.summary.dormantSpells).toBeGreaterThan(0);
  });

  it('steady 도 완벽하지는 않다 — 각본이 아니라 성향이어야 한다', () => {
    expect(T.steady.summary.misses).toBeGreaterThan(0);
    expect(T.steady.summary.checkins).toBeLessThan(66);
  });
});

describe('궤적 요약 출력', () => {
  it('사람처럼 보이는 범위 안에 있다', () => {
    const rows = IDS.map((id) => {
      const s = T[id].summary;
      return `${id.padEnd(9)} 인증 ${String(s.checkins).padStart(2)} · 늦은 ${String(s.lates).padStart(2)} · 간단 ${String(s.simples).padStart(2)} · 면제 ${s.passes} · 최장연속 ${String(s.bestStreak).padStart(2)} · 휴면 ${s.dormantSpells} · 복귀 ${s.comebacks}`;
    });
    console.log('\n' + rows.join('\n') + '\n');
    // 임의의 하한을 두지 않는다. atRisk 가 사실상 이탈하는 것은 서비스가 말하는 문제 그 자체다.
    for (const id of IDS) {
      expect(T[id].summary.checkins, `${id} 는 완전히 사라지지 않는다`).toBeGreaterThan(5);
      expect(T[id].summary.checkins, `${id} 는 만점이 아니다`).toBeLessThan(66);
    }
    // 대신 분포가 넓게 퍼져 있어야 한다. 좁으면 원형이 구분되지 않는다는 뜻이다
    const counts = IDS.map((id) => T[id].summary.checkins);
    expect(Math.max(...counts) - Math.min(...counts)).toBeGreaterThan(20);
  });
});
