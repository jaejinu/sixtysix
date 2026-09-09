/**
 * Random layer 방화벽.
 * 원형을 만들기 전에 난수 기반부터 잠근다. 나중에 행동이 이상할 때
 * "파라미터가 잘못됐나, 랜덤 기반이 바뀌었나"를 구분할 수 있어야 한다.
 */
import { describe, expect, it } from 'vitest';
import { intFor, pickFor, seedString, valueFor, type WorldCoord } from '../random.js';

const base: WorldCoord = {
  simulatorVersion: 1,
  cohortId: 'c-reading-0817',
  membershipId: 'ms-doyun',
  cohortDay: 23,
  dimension: 'attendance',
};

describe('valueFor — 결정론', () => {
  it('1. 동일 입력이면 동일 값', () => {
    expect(valueFor(base)).toBe(valueFor({ ...base }));
    expect(valueFor(base)).toBe(valueFor({ ...base }));
  });

  it('2. dimension 이 바뀌면 다른 값', () => {
    const a = valueFor(base);
    const b = valueFor({ ...base, dimension: 'late' });
    const c = valueFor({ ...base, dimension: 'photo' });
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it('3. membershipId 가 바뀌면 다른 값', () => {
    expect(valueFor(base)).not.toBe(valueFor({ ...base, membershipId: 'ms-jiho' }));
  });

  it('4. cohortDay 가 바뀌면 다른 값', () => {
    expect(valueFor(base)).not.toBe(valueFor({ ...base, cohortDay: 24 }));
  });

  it('5. 호출 순서를 바꿔도 값이 변하지 않는다', () => {
    const forward = [
      valueFor({ ...base, dimension: 'attendance' }),
      valueFor({ ...base, dimension: 'checkin-time' }),
      valueFor({ ...base, dimension: 'photo' }),
    ];
    const backward = [
      valueFor({ ...base, dimension: 'photo' }),
      valueFor({ ...base, dimension: 'checkin-time' }),
      valueFor({ ...base, dimension: 'attendance' }),
    ].reverse();
    expect(forward).toEqual(backward);
  });

  it('중간에 새 dimension 을 추가해도 기존 값이 밀리지 않는다', () => {
    const before = valueFor({ ...base, dimension: 'photo' });
    // 새 축을 여러 번 호출해도
    valueFor({ ...base, dimension: 'pass-use' });
    valueFor({ ...base, dimension: 'text' });
    const after = valueFor({ ...base, dimension: 'photo' });
    expect(after).toBe(before);
  });

  it('6. simulatorVersion 이 같으면 값이 변하지 않는다', () => {
    expect(valueFor({ ...base, simulatorVersion: 1 })).toBe(valueFor({ ...base, simulatorVersion: 1 }));
  });

  it('7. simulatorVersion 을 올리면 새 세계가 생성된다', () => {
    const v1 = valueFor({ ...base, simulatorVersion: 1 });
    const v2 = valueFor({ ...base, simulatorVersion: 2 });
    expect(v1).not.toBe(v2);
  });

  it('8. 항상 0 이상 1 미만', () => {
    for (let day = 1; day <= 66; day++) {
      for (const dim of ['attendance', 'late', 'simple', 'photo'] as const) {
        const v = valueFor({ ...base, cohortDay: day, dimension: dim });
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('9. seed 는 객체 직렬화가 아니라 canonical 조합이다', () => {
    // 키 순서를 바꿔도 seed 문자열이 같아야 한다
    const reordered: WorldCoord = {
      dimension: 'attendance',
      cohortDay: 23,
      membershipId: 'ms-doyun',
      cohortId: 'c-reading-0817',
      simulatorVersion: 1,
    };
    expect(seedString(reordered)).toBe(seedString(base));
    expect(valueFor(reordered)).toBe(valueFor(base));
    expect(seedString(base)).toBe('1|c-reading-0817|ms-doyun|23|attendance|');
  });

  it('counterpartId 가 다르면 다른 값 (응원용)', () => {
    const a = valueFor({ ...base, dimension: 'reaction', counterpartId: 'ms-a' });
    const b = valueFor({ ...base, dimension: 'reaction', counterpartId: 'ms-b' });
    expect(a).not.toBe(b);
  });
});

describe('valueFor — 분포', () => {
  const samples: number[] = [];
  for (let m = 0; m < 30; m++) {
    for (let d = 1; d <= 66; d++) {
      samples.push(valueFor({ ...base, membershipId: `ms-${m}`, cohortDay: d }));
    }
  }

  it('평균이 0.5 근처다', () => {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.46);
    expect(mean).toBeLessThan(0.54);
  });

  it('10개 구간에 고르게 흩어진다', () => {
    const buckets = new Array(10).fill(0) as number[];
    for (const v of samples) buckets[Math.floor(v * 10)]!++;
    const expected = samples.length / 10;
    for (const [i, n] of buckets.entries()) {
      expect(n, `구간 ${i} 가 치우침 (${n} vs 기대 ${expected.toFixed(0)})`).toBeGreaterThan(expected * 0.6);
      expect(n, `구간 ${i} 가 치우침`).toBeLessThan(expected * 1.4);
    }
  });

  it('인접한 날끼리 상관이 없다', () => {
    // 연속한 day 의 값이 단조 증가·감소하지 않아야 한다
    const seq: number[] = [];
    for (let d = 1; d <= 66; d++) seq.push(valueFor({ ...base, cohortDay: d }));
    let ups = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i]! > seq[i - 1]!) ups++;
    expect(ups).toBeGreaterThan(20);
    expect(ups).toBeLessThan(45);
  });
});

describe('보조 함수', () => {
  it('intFor 는 범위를 지킨다', () => {
    for (let d = 1; d <= 66; d++) {
      const v = intFor({ ...base, cohortDay: d, dimension: 'checkin-time' }, 5, 23);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(23);
    }
  });

  it('pickFor 는 목록 안에서 고른다', () => {
    const items = ['a', 'b', 'c'];
    for (let d = 1; d <= 66; d++) {
      expect(items).toContain(pickFor({ ...base, cohortDay: d, dimension: 'photo' }, items));
    }
  });
});
