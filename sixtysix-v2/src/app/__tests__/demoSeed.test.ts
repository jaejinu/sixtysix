/**
 * 데모 시드는 V1_D23_BASELINE 과 같은 수치를 내야 한다.
 *
 * 화면이 보여 주는 첫 인상이 도메인 인수 기준과 어긋나면
 * 「표시는 맞는데 데이터가 틀린」 V1 의 실패가 되풀이된다.
 */
import { describe, it, expect } from 'vitest';
import { buildDemoSeed } from '../demoSeed';
import { buildWorld } from '../world';
import { DEMO_COHORT, MY_MEMBERSHIP_ID } from '../catalog';
import { makeCtx } from '../../domain/selectors/membership';
import { getProgress } from '../../domain/selectors/progress';
import { getRanking } from '../../domain/selectors/ranking';
import { getCohortDay } from '../../domain/selectors/time';
import { SERVICE_TIME_ZONE, epochForZonedTime } from '../../infrastructure/timezone';

/** 2026-09-08 09:00 KST — BASELINE_NOW 와 같은 순간 */
const NOW = new Date(epochForZonedTime(2026, 9, 8, 9, 0, SERVICE_TIME_ZONE));

describe('데모 시드', () => {
  const world = buildWorld(NOW, buildDemoSeed());
  const ctx = makeCtx(world.facts, MY_MEMBERSHIP_ID, NOW);

  it('오늘은 23일차다', () => {
    expect(getCohortDay(NOW, DEMO_COHORT)).toBe(23);
  });

  it('V1_D23_BASELINE 과 같은 수치를 낸다', () => {
    const p = getProgress(world.facts, MY_MEMBERSHIP_ID, ctx);
    expect(p.day).toBe(23);
    expect(p.checkins).toBe(20);
    expect(p.passes).toBe(1);
    expect(p.filled).toBe(21);
    expect(p.streak).toBe(9);
  });

  it('코호트 정원은 30명이다 — 시뮬레이터 29 + 나', () => {
    const members = world.facts.memberships.filter((m) => m.cohortId === DEMO_COHORT.id);
    expect(members).toHaveLength(DEMO_COHORT.capacity);
  });

  it('랭킹은 실제 인증 수로 매긴다 — 면제권이 나만 유리하게 세지 않는다', () => {
    const rows = getRanking(world.facts, DEMO_COHORT, NOW);
    const mine = rows.find((r) => r.membershipId === MY_MEMBERSHIP_ID);
    expect(mine?.checkins).toBe(20);   // filled 21 이 아니다 (V1 버그 3)
  });

  it('미래 인증이 새어 나오지 않는다', () => {
    const future = world.facts.checkins.filter((c) => c.cohortDay > 23);
    expect(future).toHaveLength(0);
  });
});
