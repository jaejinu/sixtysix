/**
 * 저장소에서 읽은 값은 믿지 않는다.
 *
 * JSON.parse 가 성공해도 형태가 맞다는 보장은 없다 — `null`, 배열 대신 문자열,
 * 필드 하나가 빠진 인증. 그대로 흘려보내면 셀렉터가 undefined 를 세다가 화면이 깨진다.
 * 여기서 걸러서 **읽을 수 있는 사실만** 도메인에 넘긴다. 깨진 항목은 버리고 나머지는 살린다.
 */
import type { Checkin, PassUsage } from '../domain/types.js';
import { emptyWorld, type WorldId, type WorldMeta, type WorldState } from './world.js';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isDay = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;

export function isCheckin(v: unknown): v is Checkin {
  return isObj(v)
    && isStr(v.id) && isStr(v.membershipId) && isDay(v.cohortDay) && isStr(v.createdAt)
    && typeof v.text === 'string'
    && (v.visibility === 'cohort' || v.visibility === 'private')
    && (v.photoRef === undefined || isStr(v.photoRef));
}

export function isPassUsage(v: unknown): v is PassUsage {
  return isObj(v) && isStr(v.id) && isStr(v.membershipId) && isDay(v.cohortDay) && isStr(v.createdAt);
}

const arr = <T>(v: unknown, guard: (x: unknown) => x is T): T[] =>
  Array.isArray(v) ? v.filter(guard) : [];

export function sanitizeWorld(raw: unknown): WorldState {
  if (!isObj(raw)) return emptyWorld();
  const at = isObj(raw.clock) ? raw.clock.currentAt : undefined;
  return {
    ...(typeof at === 'number' && Number.isFinite(at) ? { clock: { currentAt: at } } : {}),
    memberships: arr(raw.memberships, isObj) as unknown as WorldState['memberships'],
    checkins: arr(raw.checkins, isCheckin),
    passUsages: arr(raw.passUsages, isPassUsage),
    reactions: arr(raw.reactions, isObj) as unknown as WorldState['reactions'],
    preferences: isObj(raw.preferences) ? raw.preferences : {},
  };
}

const isWorldId = (v: unknown): v is WorldId => v === 'demo' || v === 'real';

export function sanitizeMeta(raw: unknown, fallback: WorldMeta): WorldMeta {
  if (!isObj(raw) || raw.schemaVersion !== fallback.schemaVersion) return fallback;
  return {
    schemaVersion: fallback.schemaVersion,
    activeWorld: isWorldId(raw.activeWorld) ? raw.activeWorld : fallback.activeWorld,
    simulatorVersion: typeof raw.simulatorVersion === 'number' ? raw.simulatorVersion : fallback.simulatorVersion,
  };
}
