/**
 * Gate 1 방화벽 — 불변식 16개
 * 이 테스트가 통과해야 Gate 2(Simulator)로 넘어간다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Checkin, Facts, Membership } from '../types.js';
import { validateFacts } from '../invariants.js';
import { BASELINE, buildBaselineFacts } from '../fixtures/v1-baseline.js';
import { getProgress, getFilledDays } from '../selectors/progress.js';
import { getRanking } from '../selectors/ranking.js';
import { getCheckinKind, getCheckins } from '../selectors/checkin.js';
import { getHabitOf, getMembershipStatus, makeCtx, getCohort } from '../selectors/membership.js';
import { getDeadline } from '../selectors/time.js';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

const facts = buildBaselineFacts();
const ctx = makeCtx(facts, BASELINE.myMembershipId, BASELINE.now);
const me = BASELINE.myMembershipId;

describe('구조 — 저장 금지 필드', () => {
  it('1. 습관은 코호트를 통해서만 결정된다', () => {
    expect(getHabitOf(facts, me).id).toBe(BASELINE.cohort.habitId);
  });

  it('2. Membership 에 habitId 를 저장하지 않는다', () => {
    for (const m of facts.memberships) {
      expect(Object.keys(m)).not.toContain('habitId');
    }
    expect(read('types.ts')).not.toMatch(/interface Membership[\s\S]*?habitId[\s\S]*?\n}/);
  });

  it('3. Membership status 를 저장하지 않는다', () => {
    for (const m of facts.memberships) expect(Object.keys(m)).not.toContain('status');
    const cohort = getCohort(facts, facts.memberships[0]!.cohortId);
    expect(getMembershipStatus(facts.memberships[0]!, cohort, BASELINE.now)).toBe('active');
  });

  it('5. Checkin 에 status / late / returning / simple 을 저장하지 않는다', () => {
    for (const c of facts.checkins) {
      for (const banned of ['status', 'late', 'returning', 'simple', 'streak', 'filled']) {
        expect(Object.keys(c)).not.toContain(banned);
      }
    }
  });

  it('total 이라는 이름을 파생 결과에 쓰지 않는다', () => {
    // 인원 수를 세는 CohortParticipation 만 예외
    expect(Object.keys(getProgress(facts, me, ctx))).not.toContain('total');
    expect(Object.keys(getRanking(facts, BASELINE.cohort, BASELINE.now)[0]!)).not.toContain('total');
  });
});

describe('불변식 — 사실 데이터', () => {
  it('baseline 은 위반이 없다', () => {
    expect(validateFacts(facts, BASELINE.now)).toEqual([]);
  });

  it('15. 동일 Membership + cohortDay 에 Checkin 은 최대 1개', () => {
    const dup: Checkin = { ...facts.checkins[0]!, id: 'dup' };
    const v = validateFacts({ ...facts, checkins: [...facts.checkins, dup] }, BASELINE.now);
    expect(v.map((x) => x.rule)).toContain('unique-checkin-per-day');
  });

  it('16. 같은 날에 Checkin 과 PassUsage 가 동시에 존재할 수 없다', () => {
    const clash = { id: 'pu-x', membershipId: me, cohortDay: 1, createdAt: facts.checkins[0]!.createdAt };
    const v = validateFacts({ ...facts, passUsages: [...facts.passUsages, clash] }, BASELINE.now);
    expect(v.map((x) => x.rule)).toContain('checkin-and-pass-same-day');
  });

  it('4. 한 사용자에게 동시에 active 인 Membership 은 최대 하나', () => {
    const second: Membership = {
      id: 'ms-me-2', userId: 'u-me', cohortId: BASELINE.cohort.id, joinedAt: BASELINE.now.toISOString(),
    };
    const v = validateFacts({ ...facts, memberships: [...facts.memberships, second] }, BASELINE.now);
    expect(v.map((x) => x.rule)).toContain('single-active-membership');
  });

  it('면제권은 정책 한도를 넘을 수 없다', () => {
    const extra = [4, 5, 7].map((d) => ({
      id: `pu-${d}`, membershipId: me, cohortDay: d + 40, createdAt: BASELINE.now.toISOString(),
    }));
    const v = validateFacts({ ...facts, passUsages: [...facts.passUsages, ...extra] }, BASELINE.now);
    expect(v.map((x) => x.rule)).toContain('pass-limit');
  });
});

describe('파생 — 계산 규칙', () => {
  it('6. cohortDay 는 저장값이며 계산으로 덮어쓰지 않는다', () => {
    const c = facts.checkins.find((x) => x.membershipId === me)!;
    const before = c.cohortDay;
    getProgress(facts, me, ctx);
    getRanking(facts, BASELINE.cohort, BASELINE.now);
    expect(c.cohortDay).toBe(before);
  });

  it('7. checkins 는 실제 Checkin 수다', () => {
    expect(getProgress(facts, me, ctx).checkins).toBe(getCheckins(facts, me).length);
  });

  it('8. passes 는 실제 PassUsage 수다', () => {
    const n = facts.passUsages.filter((p) => p.membershipId === me).length;
    expect(getProgress(facts, me, ctx).passes).toBe(n);
  });

  it('9. filled 는 Checkin day 와 PassUsage day 의 합집합이다', () => {
    const p = getProgress(facts, me, ctx);
    const union = new Set([
      ...facts.checkins.filter((c) => c.membershipId === me).map((c) => c.cohortDay),
      ...facts.passUsages.filter((x) => x.membershipId === me).map((x) => x.cohortDay),
    ]);
    expect(p.filled).toBe(union.size);
    expect(p.filled).toBe(p.checkins + p.passes); // 16번 불변식 덕분에 겹치지 않는다
  });

  it('10. 면제권은 랭킹의 인증 수를 증가시키지 않는다', () => {
    const before = getRanking(facts, BASELINE.cohort, BASELINE.now).find((r) => r.membershipId === me)!;
    const withPass: Facts = {
      ...facts,
      passUsages: [...facts.passUsages, { id: 'pu-2', membershipId: me, cohortDay: 30, createdAt: BASELINE.now.toISOString() }],
    };
    const after = getRanking(withPass, BASELINE.cohort, BASELINE.now).find((r) => r.membershipId === me)!;
    expect(after.checkins).toBe(before.checkins);
    // 채운 날은 늘지만 인증 수는 그대로다
    expect(getProgress(withPass, me, ctx).filled).toBe(getProgress(facts, me, ctx).filled + 1);
  });

  it('11. returning 은 이전 이력에서만 파생된다', () => {
    const filled = getFilledDays(facts, me);
    const after = facts.checkins.find((c) => c.membershipId === me && c.cohortDay === 14)!;
    const normal = facts.checkins.find((c) => c.membershipId === me && c.cohortDay === 15)!;
    // 13일차가 미인증이므로 14일차는 복귀
    expect(getCheckinKind(after, BASELINE.cohort, filled).returning).toBe(true);
    expect(getCheckinKind(normal, BASELINE.cohort, filled).returning).toBe(false);
  });

  it('12. late 는 createdAt + cohortDay + cohort policy 에서만 파생된다', () => {
    const filled = getFilledDays(facts, me);
    const late = facts.checkins.find((c) => c.membershipId === me && c.cohortDay === 9)!;
    const normal = facts.checkins.find((c) => c.membershipId === me && c.cohortDay === 10)!;
    expect(new Date(late.createdAt).getTime()).toBeGreaterThan(getDeadline(BASELINE.cohort, 9).getTime());
    expect(getCheckinKind(late, BASELINE.cohort, filled).late).toBe(true);
    expect(getCheckinKind(normal, BASELINE.cohort, filled).late).toBe(false);
  });

  it('14. Clock 을 D+24 로 넘겨도 D+1~23 의 판정은 변하지 않는다', () => {
    const before = getFilledDays(facts, me);
    const beforeKinds = getCheckins(facts, me).map((c) => getCheckinKind(c, BASELINE.cohort, before));

    const tomorrow = new Date(BASELINE.now.getTime() + 86_400_000);
    const afterCtx = { now: tomorrow, cohort: BASELINE.cohort };
    const after = getFilledDays(facts, me);
    const afterKinds = getCheckins(facts, me).map((c) => getCheckinKind(c, BASELINE.cohort, after));

    expect(getProgress(facts, me, afterCtx).day).toBe(24);
    expect([...after]).toEqual([...before]);
    expect(afterKinds).toEqual(beforeKinds);
    // 인증 수·채운 날도 그대로
    expect(getProgress(facts, me, afterCtx).checkins).toBe(getProgress(facts, me, ctx).checkins);
  });
});

describe('13. 세계 분리', () => {
  it('Demo 와 Real 의 사실은 서로 영향을 주지 않는다', () => {
    const demo = buildBaselineFacts();
    const real: Facts = { ...demo, checkins: [], passUsages: [] };
    const demoProgress = getProgress(demo, me, ctx);
    const realProgress = getProgress(real, me, ctx);
    expect(demoProgress.checkins).toBe(20);
    expect(realProgress.checkins).toBe(0);
    // demo 를 건드려도 real 은 그대로
    expect(getProgress(real, me, ctx).checkins).toBe(0);
  });
});
