/**
 * 앱 상태의 유일한 출처.
 *
 * 저장하는 것 : 내 인증 · 면제권 · DemoClock 위치 · 설정
 * 파생하는 것 : 그 밖의 전부 (셀렉터가 계산한다)
 *
 * V1 의 실패가 여기서 반복되면 안 된다 — 화면에 보이는 값을 따로 저장하지 않는다.
 */
import {
  createContext, useContext, useMemo, useReducer, useEffect, type ReactNode,
} from 'react';
import type { Checkin, PassUsage, Visibility, Ctx } from '../domain/types';
import { LocalStorageWorldRepository } from '../infrastructure/localStorageWorld';
import { type WorldId, emptyWorld } from '../infrastructure/world';
import { demoClockAt, RealClock, nowDate, DemoClock } from '../infrastructure/clock';
import { SERVICE_TIME_ZONE, epochForZonedTime, zonedParts } from '../infrastructure/timezone';
import { buildWorld, type World } from './world';
import { DEMO_COHORT, MY_MEMBERSHIP_ID } from './catalog';
import { buildDemoSeed } from './demoSeed';
import { makeCtx } from '../domain/selectors/membership';
import { getCohortDay, resolveCheckinTarget } from '../domain/selectors/time';
import { getFilledDays } from '../domain/selectors/progress';

const repo = new LocalStorageWorldRepository();

/** 데모 기본 위치 — V1 과 같은 D+23, 오전 9시 */
const DEMO_DEFAULT_AT = demoClockAt(2026, 9, 8, 9, 0).now();

interface State {
  readonly worldId: WorldId;
  readonly demoAt: number;
  readonly checkins: readonly Checkin[];
  readonly passUsages: readonly PassUsage[];
  readonly defaultVisibility: Visibility;
  /** 시작 지점을 이미 골랐는가. 안 골랐으면 첫 실행이다 (P2-D) */
  readonly seeded: boolean;
}

type Action =
  | { type: 'addCheckin'; checkin: Checkin }
  | { type: 'usePass'; usage: PassUsage }
  | { type: 'setDemoAt'; at: number }
  | { type: 'advanceDemoDays'; days: number }
  | { type: 'setWorld'; worldId: WorldId }
  | { type: 'setDefaultVisibility'; visibility: Visibility }
  | { type: 'startSeeded' }
  | { type: 'startFresh' };

function load(): State {
  const meta = repo.loadMeta();
  const w = repo.load(meta.activeWorld);
  const prefs = w.preferences as { defaultVisibility?: Visibility; seeded?: boolean };
  const seeded = prefs?.seeded ?? false;

  // 첫 실행은 「진행 중인 상태로 둘러보기」로 연다.
  // V1 처럼 문구로 덮지 않고, 마이에서 「처음부터」로 바꿀 수 있게 한다 (P2-D)
  const seed = seeded ? null : buildDemoSeed();

  return {
    worldId: meta.activeWorld,
    demoAt: w.clock?.currentAt ?? DEMO_DEFAULT_AT,
    checkins: seed ? seed.checkins : (w.checkins ?? []),
    passUsages: seed ? seed.passUsages : (w.passUsages ?? []),
    defaultVisibility: prefs?.defaultVisibility ?? 'cohort',
    seeded: true,
  };
}

function persist(s: State): void {
  repo.saveMeta({ schemaVersion: 1, activeWorld: s.worldId, simulatorVersion: 1 });
  repo.save(s.worldId, {
    ...emptyWorld(),
    clock: { currentAt: s.demoAt },
    checkins: [...s.checkins],
    passUsages: [...s.passUsages],
    preferences: { defaultVisibility: s.defaultVisibility, seeded: s.seeded },
  });
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'addCheckin':
      return { ...s, checkins: [...s.checkins, a.checkin] };
    case 'usePass':
      return { ...s, passUsages: [...s.passUsages, a.usage] };
    case 'setDemoAt':
      return { ...s, demoAt: a.at };
    case 'advanceDemoDays': {
      const p = zonedParts(s.demoAt, SERVICE_TIME_ZONE);
      return { ...s, demoAt: epochForZonedTime(p.year, p.month, p.day + a.days, p.hour, p.minute, SERVICE_TIME_ZONE) };
    }
    case 'setWorld': {
      const w = repo.load(a.worldId);
      const prefs = w.preferences as { defaultVisibility?: Visibility };
      return {
        worldId: a.worldId,
        demoAt: w.clock?.currentAt ?? DEMO_DEFAULT_AT,
        checkins: w.checkins ?? [],
        passUsages: w.passUsages ?? [],
        defaultVisibility: prefs?.defaultVisibility ?? 'cohort',
        seeded: true,
      };
    }
    case 'setDefaultVisibility':
      return { ...s, defaultVisibility: a.visibility };
    case 'startSeeded': {
      const seed = buildDemoSeed();
      return { ...s, checkins: seed.checkins, passUsages: seed.passUsages, demoAt: DEMO_DEFAULT_AT };
    }
    case 'startFresh':
      return { ...s, checkins: [], passUsages: [], demoAt: DEMO_DEFAULT_AT };
  }
}

export interface AppValue {
  readonly state: State;
  readonly now: Date;
  readonly isDemo: boolean;
  readonly world: World;
  readonly ctx: Ctx;
  readonly myMembershipId: string;
  readonly today: number;
  readonly addCheckin: (input: { text: string; photoRef?: string; visibility: Visibility }) => void;
  readonly usePass: () => void;
  readonly advanceDemoDays: (days: number) => void;
  readonly setDemoAt: (at: number) => void;
  readonly setWorld: (w: WorldId) => void;
  readonly setDefaultVisibility: (v: Visibility) => void;
  /** 진행 중인 상태로 둘러보기 */
  readonly startSeeded: () => void;
  /** 처음부터 시작하기 — 0일차 */
  readonly startFresh: () => void;
}

const Ctxt = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => { persist(state); }, [state]);

  const value = useMemo<AppValue>(() => {
    const isDemo = state.worldId === 'demo';
    const clock = isDemo ? new DemoClock(state.demoAt) : new RealClock();
    const now = nowDate(clock);

    const world = buildWorld(now, { checkins: state.checkins, passUsages: state.passUsages });
    const ctx = makeCtx(world.facts, MY_MEMBERSHIP_ID, now);
    const today = getCohortDay(now, DEMO_COHORT);
    // 쓰기 경로는 「어제를 아직 채웠는가」를 알아야 귀속 일차를 정할 수 있다
    const myFilled = getFilledDays(world.facts, MY_MEMBERSHIP_ID, today);

    return {
      state, now, isDemo, world, ctx, today,
      myMembershipId: MY_MEMBERSHIP_ID,

      addCheckin: ({ text, photoRef, visibility }) => {
        // 어느 일차에 귀속되는지는 Policy 가 정한다. 화면이 정하지 않는다.
        const target = resolveCheckinTarget(now, DEMO_COHORT, myFilled);
        const checkin: Checkin = {
          id: `ck-me-${target.cohortDay}-${now.getTime()}`,
          membershipId: MY_MEMBERSHIP_ID,
          cohortDay: target.cohortDay,
          createdAt: now.toISOString(),
          text,
          visibility,
          ...(photoRef ? { photoRef } : {}),
        };
        dispatch({ type: 'addCheckin', checkin });
      },

      usePass: () => {
        const target = resolveCheckinTarget(now, DEMO_COHORT, myFilled);
        dispatch({
          type: 'usePass',
          usage: {
            id: `pass-me-${target.cohortDay}`,
            membershipId: MY_MEMBERSHIP_ID,
            cohortDay: target.cohortDay,
            createdAt: now.toISOString(),
          },
        });
      },

      advanceDemoDays: (days) => dispatch({ type: 'advanceDemoDays', days }),
      setDemoAt: (at) => dispatch({ type: 'setDemoAt', at }),
      setWorld: (w) => dispatch({ type: 'setWorld', worldId: w }),
      setDefaultVisibility: (v) => dispatch({ type: 'setDefaultVisibility', visibility: v }),
      startSeeded: () => dispatch({ type: 'startSeeded' }),
      startFresh: () => dispatch({ type: 'startFresh' }),
    };
  }, [state]);

  return <Ctxt.Provider value={value}>{children}</Ctxt.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctxt);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
