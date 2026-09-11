/**
 * 브라우저 저장소 구현. Gate 3 의 WorldRepository 경계를 그대로 따른다.
 * UI 는 키 이름을 모른다.
 */
import {
  STORAGE_KEYS, emptyWorld,
  type WorldId, type WorldMeta, type WorldState, type WorldRepository,
} from './world.js';

const DEFAULT_META: WorldMeta = { schemaVersion: 1, activeWorld: 'demo', simulatorVersion: 1 };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // 저장소가 막혀 있거나(사파리 비공개) 형식이 깨졌으면 기본값으로 간다.
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 실패는 화면을 막지 않는다 */
  }
}

export class LocalStorageWorldRepository implements WorldRepository {
  loadMeta(): WorldMeta {
    const meta = read<WorldMeta>(STORAGE_KEYS.meta, DEFAULT_META);
    if (meta.schemaVersion !== DEFAULT_META.schemaVersion) return DEFAULT_META;
    return meta;
  }

  saveMeta(meta: WorldMeta): void {
    write(STORAGE_KEYS.meta, meta);
  }

  load(world: WorldId): WorldState {
    return read<WorldState>(STORAGE_KEYS[world], emptyWorld());
  }

  save(world: WorldId, state: WorldState): void {
    write(STORAGE_KEYS[world], state);
  }

  clear(world: WorldId): void {
    write(STORAGE_KEYS[world], emptyWorld());
  }
}
