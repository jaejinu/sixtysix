/**
 * 저장소 복구 — 깨진 값이 들어 있어도 앱은 열려야 하고, 멀쩡한 사실은 살아남아야 한다.
 * V1 은 「손상된 저장소 복구」를 흐름 테스트로만 봤다. 여기서는 형태별로 본다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageWorldRepository } from '../localStorageWorld.js';
import { STORAGE_KEYS } from '../world.js';

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: () => null,
  get length() { return store.size; },
} as Storage;

const repo = new LocalStorageWorldRepository();
const put = (k: string, v: string) => store.set(k, v);

const GOOD = {
  id: 'ck-1', membershipId: 'ms-me', cohortDay: 3, createdAt: '2026-08-19T09:00:00.000Z',
  text: '읽었다', visibility: 'cohort',
};

beforeEach(() => store.clear());

describe('loadMeta', () => {
  it.each([
    ['JSON 이 아님', '{깨짐'],
    ['null', 'null'],
    ['배열', '[]'],
    ['다른 스키마 버전', '{"schemaVersion":99,"activeWorld":"real","simulatorVersion":1}'],
  ])('%s → 기본값', (_, raw) => {
    put(STORAGE_KEYS.meta, raw);
    expect(repo.loadMeta().activeWorld).toBe('demo');
  });

  it('알 수 없는 세계 이름은 demo 로 되돌린다', () => {
    put(STORAGE_KEYS.meta, '{"schemaVersion":1,"activeWorld":"moon","simulatorVersion":1}');
    expect(repo.loadMeta()).toEqual({ schemaVersion: 1, activeWorld: 'demo', simulatorVersion: 1 });
  });
});

describe('load', () => {
  it.each([['null', 'null'], ['숫자', '42'], ['문자열', '"hello"'], ['JSON 이 아님', '{']])(
    '%s → 빈 세계', (_, raw) => {
      put(STORAGE_KEYS.demo, raw);
      const w = repo.load('demo');
      expect(w.checkins).toEqual([]);
      expect(w.passUsages).toEqual([]);
      expect(w.preferences).toEqual({});
    },
  );

  it('배열 자리에 다른 값이 있어도 빈 배열로 읽는다', () => {
    put(STORAGE_KEYS.demo, JSON.stringify({ checkins: 'oops', passUsages: null, preferences: [] }));
    const w = repo.load('demo');
    expect(w.checkins).toEqual([]);
    expect(w.passUsages).toEqual([]);
    expect(w.preferences).toEqual({});
  });

  it('깨진 인증만 버리고 멀쩡한 인증은 살린다', () => {
    put(STORAGE_KEYS.demo, JSON.stringify({
      checkins: [
        GOOD,
        null,
        { ...GOOD, id: 'ck-2', cohortDay: '4' },          // 문자열 일차
        { ...GOOD, id: 'ck-3', cohortDay: 0 },            // 0일차는 없다
        { ...GOOD, id: 'ck-4', visibility: 'public' },    // 없는 공개 범위
        { ...GOOD, id: 'ck-5', text: undefined },
      ],
      passUsages: [{ id: 'p-1', membershipId: 'ms-me', cohortDay: 6, createdAt: 'x' }, { id: 'p-2' }],
    }));
    const w = repo.load('demo');
    expect(w.checkins.map((c) => c.id)).toEqual(['ck-1']);
    expect(w.passUsages.map((p) => p.id)).toEqual(['p-1']);
  });

  it('데모 시계 위치는 유한한 숫자일 때만 믿는다', () => {
    put(STORAGE_KEYS.demo, JSON.stringify({ clock: { currentAt: 'soon' } }));
    expect(repo.load('demo').clock).toBeUndefined();
    put(STORAGE_KEYS.demo, JSON.stringify({ clock: { currentAt: 1_757_289_600_000 } }));
    expect(repo.load('demo').clock).toEqual({ currentAt: 1_757_289_600_000 });
  });
});
