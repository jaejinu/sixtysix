/**
 * 세계 분리 — Demo 와 Real 은 저장 영역을 공유하지 않는다.
 *
 * 같은 Checkin 을 두 Clock 이 공유하면 DemoClock 에서 D+23 인증을 남긴 뒤
 * RealClock(D+1)으로 바꿨을 때 미래의 인증이 이미 존재하는 모순이 생긴다.
 *
 * 모드 전환은 데이터 변환이 아니라 다른 세션으로 들어가는 것에 가깝다.
 */
import type { Checkin, PassUsage, Reaction, Membership } from '../domain/types.js';

export type WorldId = 'demo' | 'real';

export const STORAGE_KEYS = {
  meta: 'sixtysix:v2:meta',
  demo: 'sixtysix:v2:demo',
  real: 'sixtysix:v2:real',
} as const;

export interface WorldMeta {
  readonly schemaVersion: number;
  readonly activeWorld: WorldId;
  readonly simulatorVersion: number;
}

export interface WorldState {
  /** DemoClock 만 저장한다. RealClock 은 시스템 시각을 읽으므로 위치가 없다 */
  readonly clock?: { readonly currentAt: number };
  readonly memberships: Membership[];
  readonly checkins: Checkin[];
  readonly passUsages: PassUsage[];
  readonly reactions: Reaction[];
  readonly preferences: Record<string, unknown>;
}

export function emptyWorld(): WorldState {
  return { memberships: [], checkins: [], passUsages: [], reactions: [], preferences: {} };
}

/**
 * 저장소 경계. UI 는 키 이름을 몰라도 된다.
 * 나중에 실제 사진 업로드로 IndexedDB 가 생겨도 이 안에서 처리한다.
 */
export interface WorldRepository {
  loadMeta(): WorldMeta;
  saveMeta(meta: WorldMeta): void;
  load(world: WorldId): WorldState;
  save(world: WorldId, state: WorldState): void;
}

/** 저장소 없이 동작하는 구현. Gate 3 에서는 이것만 쓴다. */
export class InMemoryWorldRepository implements WorldRepository {
  private meta: WorldMeta = { schemaVersion: 1, activeWorld: 'demo', simulatorVersion: 1 };
  private worlds: Record<WorldId, WorldState> = { demo: emptyWorld(), real: emptyWorld() };

  loadMeta(): WorldMeta { return { ...this.meta }; }
  saveMeta(meta: WorldMeta): void { this.meta = { ...meta }; }

  load(world: WorldId): WorldState {
    const s = this.worlds[world];
    return { ...s, memberships: [...s.memberships], checkins: [...s.checkins],
      passUsages: [...s.passUsages], reactions: [...s.reactions] };
  }

  save(world: WorldId, state: WorldState): void {
    this.worlds[world] = { ...state, memberships: [...state.memberships], checkins: [...state.checkins],
      passUsages: [...state.passUsages], reactions: [...state.reactions] };
  }
}
