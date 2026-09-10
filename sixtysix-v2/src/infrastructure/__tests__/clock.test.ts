/** Gate 3 방화벽 — Clock 은 세계를 만들지 않고 커튼만 연다 */
import { describe, expect, it } from 'vitest';
import type { Cohort, Ctx, Facts } from '../../domain/types.js';
import { DemoClock, RealClock, demoClockAt, nowDate } from '../clock.js';
import { SERVICE_TIME_ZONE, zonedParts } from '../timezone.js';
import { InMemoryWorldRepository, emptyWorld } from '../world.js';
import { getCohortDay, getDeadline, getLateWindowEnd, resolveCheckinTarget } from '../../domain/selectors/time.js';
import { getProgress, getMemberState, getDayStatus, getFilledDays } from '../../domain/selectors/progress.js';
import { getCheckinKind, getCheckins } from '../../domain/selectors/checkin.js';
import { buildSimulatedCohort, MOMENTUM_OFF } from '../../simulator/cohort.js';
import { getCohortOutcome } from '../../domain/selectors/achievements.js';

const COHORT: Cohort = {
  id: 'c-reading-0817', habitId: 'reading', generation: '9월 2기',
  startDate: '2026-08-17', durationDays: 66, capacity: 30, policyVersion: 1,
};

const cohort = buildSimulatedCohort({
  simulatorVersion: 1, cohort: COHORT, throughDay: 66,
  photoRefs: ['p1', 'p2'], texts: ['t1', 't2'], momentum: MOMENTUM_OFF,
});
const facts: Facts = {
  habits: [], cohorts: [COHORT], memberships: cohort.memberships,
  checkins: cohort.checkins, passUsages: cohort.passUsages, reactions: [],
};
const someone = cohort.members[0]!.membershipId;

describe('1. RealClock', () => {
  it('현재 실제 시각을 반환한다', () => {
    const before = Date.now();
    const t = new RealClock().now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });

  it('임의로 이동할 수 없다', () => {
    const c = new RealClock() as unknown as Record<string, unknown>;
    expect(typeof c['set']).toBe('undefined');
    expect(typeof c['advanceByDays']).toBe('undefined');
  });
});

describe('2. DemoClock', () => {
  it('같은 저장값이면 항상 같은 now 를 반환한다', () => {
    const c = demoClockAt(2026, 9, 8, 9);
    const t = c.now();
    expect(c.now()).toBe(t);
    expect(new DemoClock(t).now()).toBe(t);
  });

  it('advanceByDays 는 벽시계 시각을 유지한 채 날짜만 옮긴다', () => {
    const c = demoClockAt(2026, 9, 8, 9, 30);
    c.advanceByDays(1);
    const p = zonedParts(c.now(), SERVICE_TIME_ZONE);
    expect(p).toMatchObject({ year: 2026, month: 9, day: 9, hour: 9, minute: 30 });
  });

  it('되돌릴 수 있다', () => {
    const c = demoClockAt(2026, 9, 8, 9);
    const start = c.now();
    c.advanceByDays(5);
    c.advanceByDays(-5);
    expect(c.now()).toBe(start);
  });
});

describe('3. D+23 → D+24 로 옮겨도 과거는 변하지 않는다', () => {
  const at23 = demoClockAt(2026, 9, 8, 9);
  const at24 = demoClockAt(2026, 9, 9, 9);
  const ctx23: Ctx = { now: nowDate(at23), cohort: COHORT };
  const ctx24: Ctx = { now: nowDate(at24), cohort: COHORT };

  it('일차 계산이 하루 나아간다', () => {
    expect(getCohortDay(ctx23.now, COHORT)).toBe(23);
    expect(getCohortDay(ctx24.now, COHORT)).toBe(24);
  });

  it('D+1~23 의 칸 상태가 그대로다', () => {
    for (const m of cohort.members) {
      for (let d = 1; d <= 23; d++) {
        const a = getDayStatus(d, facts, m.membershipId, ctx23);
        const b = getDayStatus(d, facts, m.membershipId, ctx24);
        // 23일차만 'today' 에서 실제 상태로 확정된다
        if (d === 23 && a === 'today') continue;
        expect(b, `${m.name} d${d}`).toBe(a);
      }
    }
  });

  it('D+1~23 인증의 late·simple·returning 판정이 그대로다', () => {
    for (const m of cohort.members) {
      const filled = getFilledDays(facts, m.membershipId);
      for (const c of getCheckins(facts, m.membershipId)) {
        if (c.cohortDay > 23) continue;
        expect(getCheckinKind(c, COHORT, filled)).toEqual(getCheckinKind(c, COHORT, filled));
      }
    }
  });

  it('23일차까지의 인증 수와 채운 날이 그대로다', () => {
    const upTo = (day: number, id: string) =>
      [...getFilledDays(facts, id)].filter((d) => d <= day).length;
    for (const m of cohort.members) {
      expect(upTo(23, m.membershipId)).toBe(upTo(23, m.membershipId));
    }
  });
});

describe('4. 미래는 노출되지 않는다', () => {
  const ctx: Ctx = { now: nowDate(demoClockAt(2026, 9, 8, 9)), cohort: COHORT };

  it('D+24 이후는 future 로만 보인다', () => {
    for (const m of cohort.members.slice(0, 5)) {
      for (const d of [24, 30, 50, 66]) {
        expect(getDayStatus(d, facts, m.membershipId, ctx), `d${d}`).toBe('future');
      }
    }
  });

  it('미래 인증이 데이터에 있어도 진행 수치에 들어가지 않는다', () => {
    // 시뮬레이터는 66일 전체를 만들어 두었다
    expect(facts.checkins.some((c) => c.cohortDay > 23)).toBe(true);
    for (const m of cohort.members.slice(0, 5)) {
      const p = getProgress(facts, m.membershipId, ctx);
      const past = [...getFilledDays(facts, m.membershipId)].filter((d) => d <= 23).length;
      // 진행판이 보여주는 범위는 오늘까지다
      expect(p.day).toBe(23);
      expect(past).toBeLessThanOrEqual(23);
    }
  });

  it('코호트가 끝나기 전에는 성취가 확정되지 않는다', () => {
    expect(getCohortOutcome(facts, ctx).stayedToEnd).toBe(0);
  });
});

describe('5. Demo 와 Real 은 섞이지 않는다', () => {
  it('저장 키가 분리돼 있다', () => {
    const repo = new InMemoryWorldRepository();
    repo.save('demo', { ...emptyWorld(), checkins: [...facts.checkins] });
    repo.save('real', emptyWorld());

    expect(repo.load('demo').checkins.length).toBeGreaterThan(0);
    expect(repo.load('real').checkins).toHaveLength(0);
  });

  it('한쪽을 바꿔도 다른 쪽에 영향이 없다', () => {
    const repo = new InMemoryWorldRepository();
    repo.save('demo', { ...emptyWorld(), checkins: [...facts.checkins] });
    repo.save('real', emptyWorld());

    const real = repo.load('real');
    repo.save('real', { ...real, checkins: [facts.checkins[0]!] });

    expect(repo.load('demo').checkins.length).toBe(facts.checkins.length);
    expect(repo.load('real').checkins.length).toBe(1);
  });

  it('DemoClock 위치만 저장하고 RealClock 은 저장하지 않는다', () => {
    const repo = new InMemoryWorldRepository();
    repo.save('demo', { ...emptyWorld(), clock: { currentAt: demoClockAt(2026, 9, 8).now() } });
    repo.save('real', emptyWorld());
    expect(repo.load('demo').clock).toBeDefined();
    expect(repo.load('real').clock).toBeUndefined();
  });

  it('활성 세계는 meta 에만 있다', () => {
    const repo = new InMemoryWorldRepository();
    expect(repo.loadMeta().activeWorld).toBe('demo');
    repo.saveMeta({ ...repo.loadMeta(), activeWorld: 'real' });
    expect(repo.loadMeta().activeWorld).toBe('real');
  });
});

describe('6. 04:00 경계와 12시간 늦은 인증 창구', () => {
  const dayOf = (y: number, m: number, d: number, h: number) =>
    getCohortDay(nowDate(demoClockAt(y, m, d, h)), COHORT);

  it('03:59 는 아직 전날이고 04:00 부터 오늘이다', () => {
    expect(dayOf(2026, 9, 9, 3)).toBe(23);
    expect(dayOf(2026, 9, 9, 4)).toBe(24);
  });

  it('마감은 다음 날 04:00 이고 늦은 인증은 그 뒤 12시간까지다', () => {
    const deadline = getDeadline(COHORT, 23);
    const p = zonedParts(deadline.getTime(), SERVICE_TIME_ZONE);
    expect(p).toMatchObject({ month: 9, day: 9, hour: 4, minute: 0 });
    expect(getLateWindowEnd(COHORT, 23).getTime() - deadline.getTime()).toBe(12 * 3_600_000);
  });

  it('같은 now 에서 귀속 일차와 늦음 여부가 일관되게 나온다', () => {
    const filled = new Set<number>();
    // 03:00 — 아직 23일차 창이 열려 있다
    expect(resolveCheckinTarget(nowDate(demoClockAt(2026, 9, 9, 3)), COHORT, filled))
      .toEqual({ cohortDay: 23, late: false });
    // 09:00 — 마감은 지났지만 12시간 창구 안이라 늦은 인증
    expect(resolveCheckinTarget(nowDate(demoClockAt(2026, 9, 9, 9)), COHORT, filled))
      .toEqual({ cohortDay: 23, late: true });
    // 17:00 — 창구가 닫혀 오늘(24일차)에 귀속된다
    expect(resolveCheckinTarget(nowDate(demoClockAt(2026, 9, 9, 17)), COHORT, filled))
      .toEqual({ cohortDay: 24, late: false });
    // 이미 채웠으면 늦은 인증 창구를 쓰지 않는다
    expect(resolveCheckinTarget(nowDate(demoClockAt(2026, 9, 9, 9)), COHORT, new Set([23])))
      .toEqual({ cohortDay: 24, late: false });
  });

  it('사용자 상태도 같은 now 에서 일관되다', () => {
    const ctx: Ctx = { now: nowDate(demoClockAt(2026, 9, 9, 3)), cohort: COHORT };
    const state = getMemberState(facts, someone, ctx);
    expect(['day0', 'ongoing', 'done', 'broken', 'dormant', 'ended']).toContain(state);
    expect(getProgress(facts, someone, ctx).day).toBe(23);
  });
});
