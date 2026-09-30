/**
 * 앱 상태의 유일한 출처.
 *
 * 저장하는 것 : 내 인증 · 면제권 · DemoClock 위치 · 설정
 * 파생하는 것 : 그 밖의 전부 (셀렉터가 계산한다)
 *
 * V1 의 실패가 여기서 반복되면 안 된다 — 화면에 보이는 값을 따로 저장하지 않는다.
 */
import {
  createContext, useContext, useMemo, useReducer, useEffect, useState, type ReactNode,
} from 'react';
import type { Checkin, PassUsage, Visibility, Ctx, Cohort, HabitId } from '../domain/types';
import { LocalStorageWorldRepository } from '../infrastructure/localStorageWorld';
import { type WorldId, type WorldState, emptyWorld } from '../infrastructure/world';
import { demoClockAt, RealClock, nowDate, DemoClock } from '../infrastructure/clock';
import { SERVICE_TIME_ZONE, epochForZonedTime, zonedParts } from '../infrastructure/timezone';
import { buildWorld, type World } from './world';
import { cohortFor, COHORT_START, DEFAULT_HABIT_ID, HABITS, MY_MEMBERSHIP_ID } from './catalog';
import { buildDemoSeed } from './demoSeed';
import { makeCtx } from '../domain/selectors/membership';
import {
  getCohortDay, getCheckinAvailability, getJoinDate,
  type CheckinAvailability, type CheckinBlockReason,
} from '../domain/selectors/time';
import { getFilledDays, getProgress } from '../domain/selectors/progress';
import { policyFor } from '../domain/policies';

const repo = new LocalStorageWorldRepository();

/** 데모 기본 위치 — V1 과 같은 D+23, 오전 9시 */
const DEMO_DEFAULT_AT = demoClockAt(2026, 9, 8, 9, 0).now();

/** 실제 시간 모드에서 화면이 시각을 다시 읽는 간격. 마감 카운트다운이 분 단위다 */
const REAL_TICK_MS = 30_000;

interface State {
  readonly worldId: WorldId;
  readonly demoAt: number;
  readonly checkins: readonly Checkin[];
  readonly passUsages: readonly PassUsage[];
  readonly defaultVisibility: Visibility;
  /** 시작 지점을 이미 골랐는가. 안 골랐으면 첫 실행이다 (P2-D) */
  readonly seeded: boolean;
  /** 온보딩을 마쳤는가 */
  readonly onboarded: boolean;
  /** 어느 습관의 코호트에 있는가. 코호트는 여기서 파생한다 (V1 버그 1) */
  readonly habitId: HabitId;
  /** 내 코호트가 시작한 날. 온보딩을 마친 날이 1일차다 (P2-D) */
  readonly cohortStart: string;
}

type Action =
  | { type: 'addCheckin'; checkin: Checkin }
  | { type: 'usePass'; usage: PassUsage }
  | { type: 'setDemoAt'; at: number }
  | { type: 'advanceDemoDays'; days: number }
  | { type: 'setWorld'; worldId: WorldId }
  | { type: 'setDefaultVisibility'; visibility: Visibility }
  | { type: 'startSeeded' }
  | { type: 'startFresh'; startDate: string; demoAt: number }
  | { type: 'completeOnboarding'; habitId: HabitId; startDate: string };

const isHabitId = (v: unknown): v is HabitId => HABITS.some((h) => h.id === v);
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * 한 세계의 저장본을 State 로 읽는다. 첫 실행과 세계 전환이 **같은 길**을 탄다.
 *
 * 세계는 따로 사는 세션이다 (infrastructure/world.ts). 기록만 바꿔 끼우고
 * 습관·시작일·온보딩 여부를 이전 세계에서 들고 오면, 데모의 독서 코호트 설정 위에
 * 실제 세계의 기록이 얹히는 식으로 둘이 섞인다.
 */
function fromStored(worldId: WorldId, w: WorldState): State {
  const prefs = w.preferences;
  const seeded = prefs.seeded === true;

  // 데모 세계의 첫 실행은 시드를 깔아 둔다. 실제 세계는 빈 채로 시작한다.
  const seed = worldId === 'demo' && !seeded ? buildDemoSeed() : null;

  return {
    worldId,
    demoAt: w.clock?.currentAt ?? DEMO_DEFAULT_AT,
    checkins: seed ? seed.checkins : w.checkins,
    passUsages: seed ? seed.passUsages : w.passUsages,
    defaultVisibility: prefs.defaultVisibility === 'private' ? 'private' : 'cohort',
    seeded: true,
    onboarded: prefs.onboarded === true,
    habitId: isHabitId(prefs.habitId) ? prefs.habitId : DEFAULT_HABIT_ID,
    cohortStart: isIsoDate(prefs.cohortStart) ? prefs.cohortStart : COHORT_START,
  };
}

function load(): State {
  const meta = repo.loadMeta();
  return fromStored(meta.activeWorld, repo.load(meta.activeWorld));
}

/** 이 날이 이미 채워졌는가. 리듀서의 마지막 방어선 — 같은 렌더에서 두 번 눌러도 하나만 들어간다 */
const dayTaken = (s: State, day: number) =>
  s.checkins.some((c) => c.cohortDay === day) || s.passUsages.some((p) => p.cohortDay === day);

function persist(s: State): void {
  repo.saveMeta({ schemaVersion: 1, activeWorld: s.worldId, simulatorVersion: 1 });
  repo.save(s.worldId, {
    ...emptyWorld(),
    clock: { currentAt: s.demoAt },
    checkins: [...s.checkins],
    passUsages: [...s.passUsages],
    preferences: {
      defaultVisibility: s.defaultVisibility, seeded: s.seeded,
      onboarded: s.onboarded, habitId: s.habitId, cohortStart: s.cohortStart,
    },
  });
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'addCheckin':
      if (dayTaken(s, a.checkin.cohortDay)) return s;
      return { ...s, checkins: [...s.checkins, a.checkin] };
    case 'usePass': {
      const limit = policyFor(cohortFor(s.habitId, s.cohortStart).policyVersion).passLimit;
      if (dayTaken(s, a.usage.cohortDay) || s.passUsages.length >= limit) return s;
      return { ...s, passUsages: [...s.passUsages, a.usage] };
    }
    case 'setDemoAt':
      return { ...s, demoAt: a.at };
    case 'advanceDemoDays': {
      const p = zonedParts(s.demoAt, SERVICE_TIME_ZONE);
      return { ...s, demoAt: epochForZonedTime(p.year, p.month, p.day + a.days, p.hour, p.minute, SERVICE_TIME_ZONE) };
    }
    case 'setWorld':
      if (a.worldId === s.worldId) return s;
      // 떠나는 세계는 persist 가 이미 저장해 두었다. 들어가는 세계는 그 세계의 설정 전부를 읽는다
      return fromStored(a.worldId, repo.load(a.worldId));
    case 'setDefaultVisibility':
      return { ...s, defaultVisibility: a.visibility };
    case 'startSeeded': {
      // 시드는 데모 기준 코호트(독서 · 8/17 시작)를 전제한다. 문구가 그 습관의 것이다.
      const seed = buildDemoSeed();
      return {
        ...s, habitId: DEFAULT_HABIT_ID, cohortStart: COHORT_START,
        checkins: seed.checkins, passUsages: seed.passUsages, demoAt: DEMO_DEFAULT_AT,
      };
    }
    case 'startFresh':
      // 「처음부터」는 기록만 비우는 게 아니다. 시작일도 오늘로 옮겨야 1일차다.
      // (8/17 시작 코호트에서 기록만 비우면 D+23 · 휴면이 된다)
      return { ...s, checkins: [], passUsages: [], demoAt: a.demoAt, cohortStart: a.startDate };
    case 'completeOnboarding':
      // 「같은 날 시작하는 30명」이라고 말했으면 정말 오늘이 1일차여야 한다 (P2-D).
      // 시작일은 호출하는 쪽이 지금 시각에서 계산해 넘긴다 — 데모든 실제든 같은 규칙이다.
      // 다른 코호트로 들어가므로 이전 기록도 따라오지 않는다.
      return {
        ...s, onboarded: true, habitId: a.habitId, cohortStart: a.startDate,
        checkins: [], passUsages: [],
      };
  }
}

export interface AppValue {
  readonly state: State;
  readonly now: Date;
  readonly isDemo: boolean;
  readonly world: World;
  readonly ctx: Ctx;
  readonly cohort: Cohort;
  readonly myMembershipId: string;
  readonly today: number;
  /** 지금 인증을 남길 수 있는가 · 남기면 몇 일차인가. 화면과 쓰기 경로가 같은 값을 본다 */
  readonly availability: CheckinAvailability;
  /** 지금 온보딩을 마치면 시작일이 되는 날 — 그날이 1일차다 */
  readonly joinDate: string;
  readonly addCheckin: (input: { text: string; photoRef?: string; visibility: Visibility }) => AddCheckinResult;
  readonly usePass: () => boolean;
  readonly advanceDemoDays: (days: number) => void;
  readonly setDemoAt: (at: number) => void;
  readonly setWorld: (w: WorldId) => void;
  readonly setDefaultVisibility: (v: Visibility) => void;
  /** 진행 중인 상태로 둘러보기 */
  readonly startSeeded: () => void;
  /** 처음부터 시작하기 — 오늘이 1일차 */
  readonly startFresh: () => void;
  readonly completeOnboarding: (habitId: HabitId) => void;
}

export type AddCheckinResult =
  | { readonly ok: true; readonly cohortDay: number }
  | { readonly ok: false; readonly reason: CheckinBlockReason | 'text' };

const Ctxt = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => { persist(state); }, [state]);

  // 실제 시간은 흐른다. state 가 바뀔 때만 now 를 읽으면 마감 카운트다운이 멈추고
  // 04:00 이 지나도 일차가 넘어가지 않는다. 데모 시계는 사용자가 옮길 때만 움직인다.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (state.worldId !== 'real') return;
    const bump = () => setTick((n) => n + 1);
    const id = setInterval(bump, REAL_TICK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') bump(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [state.worldId]);

  const value = useMemo<AppValue>(() => {
    const isDemo = state.worldId === 'demo';
    const clock = isDemo ? new DemoClock(state.demoAt) : new RealClock();
    const now = nowDate(clock);

    const cohort = cohortFor(state.habitId, state.cohortStart);
    const world = buildWorld(now, { checkins: state.checkins, passUsages: state.passUsages }, cohort);
    const ctx = makeCtx(world.facts, MY_MEMBERSHIP_ID, now);
    const today = getCohortDay(now, cohort);
    // 쓰기 경로는 「어제를 아직 채웠는가」를 알아야 귀속 일차를 정할 수 있다
    const myFilled = getFilledDays(world.facts, MY_MEMBERSHIP_ID, today);
    // 어느 일차에 귀속되는지, 남길 수 있는지는 Policy 가 정한다. 화면이 정하지 않는다.
    const availability = getCheckinAvailability(now, cohort, myFilled);
    const policy = policyFor(cohort.policyVersion);

    return {
      state, now, isDemo, world, ctx, cohort, today, availability,
      joinDate: getJoinDate(now, cohort.policyVersion),
      myMembershipId: MY_MEMBERSHIP_ID,

      addCheckin: ({ text, photoRef, visibility }) => {
        if (!availability.ok) return { ok: false, reason: availability.reason };
        const body = text.trim();
        if (body.length === 0 || body.length > policy.textMaxLength) return { ok: false, reason: 'text' };

        const checkin: Checkin = {
          id: `ck-me-${availability.cohortDay}-${now.getTime()}`,
          membershipId: MY_MEMBERSHIP_ID,
          cohortDay: availability.cohortDay,
          createdAt: now.toISOString(),
          text: body,
          visibility,
          ...(photoRef ? { photoRef } : {}),
        };
        dispatch({ type: 'addCheckin', checkin });
        return { ok: true, cohortDay: availability.cohortDay };
      },

      usePass: () => {
        if (!availability.ok) return false;
        if (getProgress(world.facts, MY_MEMBERSHIP_ID, ctx).passesLeft <= 0) return false;
        dispatch({
          type: 'usePass',
          usage: {
            id: `pass-me-${availability.cohortDay}`,
            membershipId: MY_MEMBERSHIP_ID,
            cohortDay: availability.cohortDay,
            createdAt: now.toISOString(),
          },
        });
        return true;
      },

      advanceDemoDays: (days) => dispatch({ type: 'advanceDemoDays', days }),
      setDemoAt: (at) => dispatch({ type: 'setDemoAt', at }),
      setWorld: (w) => dispatch({ type: 'setWorld', worldId: w }),
      setDefaultVisibility: (v) => dispatch({ type: 'setDefaultVisibility', visibility: v }),
      startSeeded: () => dispatch({ type: 'startSeeded' }),
      startFresh: () => {
        // 데모는 기본 위치(9/8 09:00)로 돌아가서 그날을 1일차로, 실제는 지금을 1일차로
        const at = isDemo ? DEMO_DEFAULT_AT : now.getTime();
        dispatch({ type: 'startFresh', demoAt: at, startDate: getJoinDate(new Date(at), cohort.policyVersion) });
      },
      completeOnboarding: (habitId) =>
        dispatch({ type: 'completeOnboarding', habitId, startDate: getJoinDate(now, cohort.policyVersion) }),
    };
    // tick 은 값으로 쓰지 않는다. 실제 시간 모드에서 now 를 다시 읽게 하는 신호다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tick]);

  return <Ctxt.Provider value={value}>{children}</Ctxt.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctxt);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
