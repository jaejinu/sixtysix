/**
 * 결정론적 난수 — 시뮬레이터의 "운"만 담당한다.
 *
 * 이 파일에 원형(archetype)이나 경로 의존 개념을 넣지 않는다.
 * 역할은 하나다: 같은 세계 좌표를 넣으면 언제나 같은 값을 돌려준다.
 *
 * PRNG 스트림을 순서대로 소비하지 않는다. 각 dimension 이 독립 해시라
 * 호출 순서를 바꾸거나 중간에 새 dimension 을 추가해도 기존 값이 변하지 않는다.
 * 이게 없으면 코드를 조금 고칠 때마다 지난 날들의 역사가 통째로 흔들린다.
 */

export type Dimension =
  | 'attendance'
  | 'checkin-time'
  | 'late'
  | 'simple'
  | 'photo'
  | 'pass-use'
  | 'reaction'
  | 'reaction-delay'
  | 'text';

export interface WorldCoord {
  readonly simulatorVersion: number;
  readonly cohortId: string;
  readonly membershipId: string;
  readonly cohortDay: number;
  readonly dimension: Dimension;
  /** 응원처럼 두 멤버가 관여하는 축에서만 쓴다 */
  readonly counterpartId?: string;
}

/**
 * seed 문자열은 canonical 하게 직접 조합한다.
 * JSON.stringify 를 쓰면 키 순서가 바뀔 때 seed 가 달라진다.
 */
export function seedString(c: WorldCoord): string {
  return [
    c.simulatorVersion,
    c.cohortId,
    c.membershipId,
    c.cohortDay,
    c.dimension,
    c.counterpartId ?? '',
  ].join('|');
}

/** xmur3 계열 문자열 해시. 눈사태 효과가 충분해 인접 문자열도 값이 크게 갈린다. */
function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 0 이상 1 미만. 같은 좌표면 언제나 같은 값. */
export function valueFor(coord: WorldCoord): number {
  return hashString(seedString(coord)) / 4294967296;
}

/** 정수 범위 [min, max] 에서 하나 고른다 */
export function intFor(coord: WorldCoord, min: number, max: number): number {
  return min + Math.floor(valueFor(coord) * (max - min + 1));
}

/** 목록에서 하나 고른다 */
export function pickFor<T>(coord: WorldCoord, items: readonly T[]): T {
  if (items.length === 0) throw new Error('빈 목록에서 고를 수 없다');
  const i = Math.min(items.length - 1, Math.floor(valueFor(coord) * items.length));
  return items[i] as T;
}
