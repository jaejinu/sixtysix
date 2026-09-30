/**
 * 브라우저 저장소 구현. Gate 3 의 WorldRepository 경계를 그대로 따른다.
 * UI 는 키 이름을 모른다.
 */
import {
  STORAGE_KEYS, emptyWorld,
  type WorldId, type WorldMeta, type WorldState, type WorldRepository,
} from './world.js';
import { sanitizeMeta, sanitizeWorld } from './validate.js';

const DEFAULT_META: WorldMeta = { schemaVersion: 1, activeWorld: 'demo', simulatorVersion: 1 };

/** 형태는 모른다. 확인은 validate.ts 가 한다 */
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    // 저장소가 막혀 있거나(사파리 비공개) JSON 이 깨졌으면 없는 것으로 본다.
    return undefined;
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
    return sanitizeMeta(read(STORAGE_KEYS.meta), DEFAULT_META);
  }

  saveMeta(meta: WorldMeta): void {
    write(STORAGE_KEYS.meta, meta);
  }

  load(world: WorldId): WorldState {
    return sanitizeWorld(read(STORAGE_KEYS[world]));
  }

  save(world: WorldId, state: WorldState): void {
    write(STORAGE_KEYS[world], state);
  }

  clear(world: WorldId): void {
    write(STORAGE_KEYS[world], emptyWorld());
  }
}
