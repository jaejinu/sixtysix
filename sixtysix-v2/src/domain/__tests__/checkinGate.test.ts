/**
 * 쓰기 경로의 문지기 — 버튼이 아니라 도메인이 막는다.
 *
 * V1 은 화면 버튼만 비활성으로 두어서 /checkin 직접 진입이나 기간 종료 후 진입을 막지 못했다.
 */
import { describe, it, expect } from 'vitest';
import { getCheckinAvailability, getDayDate, getJoinDate, getCohortDay } from '../selectors/time.js';
import { SERVICE_TIME_ZONE, epochForZonedTime } from '../../infrastructure/timezone.js';
import type { Cohort } from '../types.js';

const COHORT: Cohort = {
  id: 'c-test', habitId: 'h-reading', generation: '테스트', startDate: '2026-08-17',
  durationDays: 66, capacity: 30, policyVersion: 1,
};

const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(epochForZonedTime(y, m, d, h, min, SERVICE_TIME_ZONE));

describe('getCheckinAvailability', () => {
  it('시작일 04:00 전은 아직 열리지 않았다', () => {
    const r = getCheckinAvailability(at(2026, 8, 17, 2), COHORT, new Set());
    expect(r).toEqual({ ok: false, reason: 'before', cohortDay: 1 });
  });

  it('시작일 04:00 이후는 1일차로 열린다', () => {
    const r = getCheckinAvailability(at(2026, 8, 17, 9), COHORT, new Set());
    expect(r).toEqual({ ok: true, cohortDay: 1, late: false });
  });

  it('이미 채운 날에는 다시 남길 수 없다 — 중복 인증', () => {
    const r = getCheckinAvailability(at(2026, 9, 8, 9), COHORT, new Set([22, 23]));
    expect(r).toEqual({ ok: false, reason: 'filled', cohortDay: 23 });
  });

  it('어제를 비웠으면 늦은 인증 창 안에서는 어제로 귀속된다', () => {
    const r = getCheckinAvailability(at(2026, 9, 8, 9), COHORT, new Set([21]));
    expect(r).toEqual({ ok: true, cohortDay: 22, late: true });
  });

  it('66일차 다음 날에도 66일차의 늦은 인증 창은 열려 있다', () => {
    // 66일차 = 10/21. 마감 10/22 04:00, 늦은 인증 10/22 16:00 까지
    const r = getCheckinAvailability(at(2026, 10, 22, 10), COHORT, new Set());
    expect(r).toEqual({ ok: true, cohortDay: 66, late: true });
  });

  it('기간이 끝나면 닫힌다 — 67일차는 없다', () => {
    const filled = new Set(Array.from({ length: 66 }, (_, i) => i + 1));
    expect(getCheckinAvailability(at(2026, 10, 22, 10), COHORT, filled))
      .toEqual({ ok: false, reason: 'ended', cohortDay: 66 });
    expect(getCheckinAvailability(at(2026, 10, 30, 10), COHORT, new Set()))
      .toEqual({ ok: false, reason: 'ended', cohortDay: 66 });
  });
});

describe('getDayDate', () => {
  it('1일차는 시작일, 23일차는 9월 8일, 66일차는 10월 21일', () => {
    expect(getDayDate(COHORT, 1)).toEqual({ year: 2026, month: 8, day: 17 });
    expect(getDayDate(COHORT, 23)).toEqual({ year: 2026, month: 9, day: 8 });
    expect(getDayDate(COHORT, 66)).toEqual({ year: 2026, month: 10, day: 21 });
  });
});

describe('getJoinDate — 지금 시작하면 지금이 1일차', () => {
  it.each([
    ['오전 9시', at(2026, 9, 8, 9), '2026-09-08'],
    ['자정 직후', at(2026, 9, 9, 0, 30), '2026-09-08'],
    ['새벽 3시 59분', at(2026, 9, 9, 3, 59), '2026-09-08'],
    ['새벽 4시 정각', at(2026, 9, 9, 4), '2026-09-09'],
    ['월 경계', at(2026, 10, 1, 2), '2026-09-30'],
  ])('%s', (_, now, expected) => {
    const start = getJoinDate(now, 1);
    expect(start).toBe(expected);
    expect(getCohortDay(now, { ...COHORT, startDate: start })).toBe(1);
  });
});
