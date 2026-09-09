/**
 * Gate 1 Acceptance — V1_D23_BASELINE
 *
 * V1.1 이 만든 제품 의미의 기준점. 숫자가 달라지면 재설계 과정에서
 * 정책을 바꿔버린 것이다.
 */
import { describe, expect, it } from 'vitest';
import { BASELINE, buildBaselineFacts } from '../fixtures/v1-baseline.js';
import { getProgress, getMemberState, getDayStatus } from '../selectors/progress.js';
import { getRanking, getCohortParticipation } from '../selectors/ranking.js';
import { makeCtx, getCohortName } from '../selectors/membership.js';
import { getEarnedBadges } from '../selectors/badges.js';
import { validateFacts } from '../invariants.js';

const facts = buildBaselineFacts();
const me = BASELINE.myMembershipId;
const ctx = makeCtx(facts, me, BASELINE.now);

describe('V1_D23_BASELINE', () => {
  it('사실 데이터가 불변식을 지킨다', () => {
    expect(validateFacts(facts, BASELINE.now)).toEqual([]);
  });

  it('cohortDay 23', () => {
    expect(getProgress(facts, me, ctx).day).toBe(BASELINE.expected.day);
  });

  it('checkins 20 · passes 1 · filled 21 · streak 9', () => {
    const p = getProgress(facts, me, ctx);
    expect(p.checkins).toBe(BASELINE.expected.checkins);
    expect(p.passes).toBe(BASELINE.expected.passes);
    expect(p.filled).toBe(BASELINE.expected.filled);
    expect(p.streak).toBe(BASELINE.expected.streak);
  });

  it('rank 4 — V1.1 에서 고친 공정성 버그의 결과다', () => {
    const rows = getRanking(facts, BASELINE.cohort, BASELINE.now);
    const mine = rows.find((r) => r.membershipId === me)!;
    expect(mine.checkins).toBe(20);
    expect(mine.rank).toBe(BASELINE.expected.rank);
    // 면제권을 인증으로 세면 3위가 된다. 그렇게 되면 안 된다.
    expect(mine.rank).not.toBe(3);
  });

  it('동률에서 연속 기록이 앞선다', () => {
    const rows = getRanking(facts, BASELINE.cohort, BASELINE.now);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!;
      const b = rows[i]!;
      expect(a.checkins).toBeGreaterThanOrEqual(b.checkins);
      if (a.checkins === b.checkins) expect(a.streak).toBeGreaterThanOrEqual(b.streak);
    }
  });

  it('나머지 통계도 V1 과 같다', () => {
    const p = getProgress(facts, me, ctx);
    expect(p.lates).toBe(2);
    expect(p.simples).toBe(3);
    expect(p.privates).toBe(2);
    expect(p.passesLeft).toBe(2);
    expect(p.remaining).toBe(45);
    expect(p.bestStreak).toBe(12); // 1~12일차 (6일차 면제권 포함)
  });

  it('사용자 상태는 ongoing 이다', () => {
    expect(getMemberState(facts, me, ctx)).toBe('ongoing');
  });

  it('66칸의 각 칸이 V1 과 같은 상태를 낸다', () => {
    const s = (d: number) => getDayStatus(d, facts, me, ctx);
    expect(s(1)).toBe('done');
    expect(s(6)).toBe('pass');
    expect(s(9)).toBe('late');
    expect(s(13)).toBe('miss');
    expect(s(18)).toBe('late');
    expect(s(22)).toBe('done');
    expect(s(23)).toBe('today');
    expect(s(24)).toBe('future');

    const counts = { done: 0, late: 0, pass: 0, miss: 0, today: 0, future: 0 };
    for (let d = 1; d <= 66; d++) counts[s(d)]++;
    expect(counts.done).toBe(18);
    expect(counts.late).toBe(2);
    expect(counts.pass).toBe(1);
    expect(counts.miss).toBe(1);
    expect(counts.today).toBe(1);
    expect(counts.future).toBe(43);
    expect(counts.done + counts.late + counts.pass).toBe(21); // 채운 날
  });

  it('배지는 첫 인증 · 7일 연속 · 복귀 세 개를 획득한다', () => {
    const earned = getEarnedBadges(facts, me, ctx).map((b) => b.badgeId).sort();
    expect(earned).toEqual(['comeback', 'first', 'streak7']);
  });

  it('배지 획득 시점도 파생된다', () => {
    const earned = getEarnedBadges(facts, me, ctx);
    expect(earned.find((b) => b.badgeId === 'first')!.earnedAtDay).toBe(1);
    expect(earned.find((b) => b.badgeId === 'streak7')!.earnedAtDay).toBe(7);
    expect(earned.find((b) => b.badgeId === 'comeback')!.earnedAtDay).toBe(14);
  });

  it('코호트명은 저장하지 않고 파생한다', () => {
    expect(getCohortName(facts, BASELINE.cohort)).toBe('독서 15분 · 9월 2기');
  });

  it('코호트 오늘 현황을 하드코딩 없이 센다', () => {
    const p = getCohortParticipation(facts, BASELINE.cohort, 23, BASELINE.now);
    expect(p.done).toBe(6); // 오늘 인증한 샘플 멤버 6명. 나는 아직 안 했다
    expect(p.total).toBe(30);
    expect(p.done + p.dormant + p.pending).toBe(facts.memberships.length);
  });

  it('홈·기록·랭킹이 같은 수치를 파생한다', () => {
    const p = getProgress(facts, me, ctx);
    const rank = getRanking(facts, BASELINE.cohort, BASELINE.now).find((r) => r.membershipId === me)!;
    expect(rank.checkins).toBe(p.checkins);
    expect(rank.streak).toBe(p.streak);
    expect(rank.state).toBe(getMemberState(facts, me, ctx));
  });
});
