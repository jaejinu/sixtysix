/**
 * 멤버 한 명의 하루.
 *
 * 출력은 판단이 아니라 **도메인 사실**(Checkin · PassUsage)이다.
 * late·simple·returning 은 여기서 정하지 않는다. Gate 1 셀렉터가 createdAt 과
 * 이력에서 파생한다. 시뮬레이터는 "언제 무엇을 했는가"만 만든다.
 *
 * 하루 단위(stepMember)로 쪼개 둔 이유는 코호트 신호 때문이다.
 * 코호트 전체를 날짜 우선으로 돌면서 이미 확정된 과거 날짜의 참여율만
 * 신호로 쓰면 순환 없이 결정론을 유지할 수 있다.
 */
import type { Checkin, Cohort, PassUsage } from '../domain/types.js';
import { policyFor } from '../domain/policies.js';
import { getDeadline } from '../domain/selectors/time.js';
import { epochForZonedTime } from '../infrastructure/timezone.js';
import { intFor, pickFor, valueFor, type Dimension } from './random.js';
import { getAttendanceProbability, type ArchetypeParams } from './archetypes.js';

export interface MemberSimConfig {
  readonly simulatorVersion: number;
  readonly cohort: Cohort;
  readonly membershipId: string;
  readonly archetype: ArchetypeParams;
  readonly photoRefs: readonly string[];
  readonly texts: readonly string[];
}

/** 하루를 넘어가며 이어지는 상태. 경로 의존은 전부 여기에 담긴다. */
export interface MemberState {
  streak: number;
  misses: number;
  passesUsed: number;
  best: number;
  dormantSpells: number;
  comebacks: number;
  missTotal: number;
  lastEngagementDay: number;
}

export function initialMemberState(): MemberState {
  return { streak: 0, misses: 0, passesUsed: 0, best: 0, dormantSpells: 0, comebacks: 0, missTotal: 0, lastEngagementDay: 0 };
}

/**
 * 코호트가 복귀 확률에 주는 보정. 연속 참여 중인 멤버에게는 적용하지 않는다.
 * 계산은 cohort.ts 가 넘겨준다.
 */
export interface CohortSignal {
  readonly comebackBoost: number;
}

export interface DayResult {
  readonly checkin?: Checkin;
  readonly passUsage?: PassUsage;
  readonly probability: number;
  readonly attended: boolean;
}

/** 서비스 시간대 기준으로 그 일차의 시각을 만든다 */
function zonedAt(cohort: Cohort, day: number, hour: number, minute: number): Date {
  const tz = policyFor(cohort.policyVersion).timeZone;
  const [y, m, d] = cohort.startDate.split('-').map(Number) as [number, number, number];
  return new Date(epochForZonedTime(y, m, d + (day - 1), hour, minute, tz));
}

export function stepMember(
  cfg: MemberSimConfig,
  state: MemberState,
  day: number,
  signal?: CohortSignal,
): DayResult {
  const { cohort, membershipId, archetype, simulatorVersion } = cfg;
  const policy = policyFor(cohort.policyVersion);
  const coord = (dimension: Dimension) => ({
    simulatorVersion, cohortId: cohort.id, membershipId, cohortDay: day, dimension,
  });

  const base = getAttendanceProbability({
    archetype,
    previousStreak: state.streak,
    consecutiveMisses: state.misses,
    cohortDay: day,
    durationDays: cohort.durationDays,
  });
  // 코호트 보정은 확률 함수 밖에서 더한다. 계수 0 이면 base 와 완전히 같다.
  const probability = Math.min(0.97, base + (signal?.comebackBoost ?? 0));

  const attended = valueFor(coord('attendance')) < probability;

  if (attended) {
    if (state.misses > 0) state.comebacks++;
    const late = valueFor(coord('late')) < archetype.latePropensity;
    const simple = valueFor(coord('simple')) < archetype.simpleCheckinPropensity;

    const createdAt = late
      ? new Date(getDeadline(cohort, day).getTime() + intFor(coord('checkin-time'), 30, 600) * 60_000)
      : zonedAt(cohort, day, intFor(coord('checkin-time'), 6, 23), intFor(coord('text'), 0, 59));

    const checkin: Checkin = {
      id: `sim-${membershipId}-${day}`,
      membershipId,
      cohortDay: day,
      createdAt: createdAt.toISOString(),
      text: pickFor(coord('text'), cfg.texts),
      ...(simple ? {} : { photoRef: pickFor(coord('photo'), cfg.photoRefs) }),
      visibility: 'cohort',
    };

    state.streak++;
    if (state.streak > state.best) state.best = state.streak;
    state.misses = 0;
    state.lastEngagementDay = day;
    return { checkin, probability, attended: true };
  }

  const wantsPass =
    state.passesUsed < policy.passLimit && state.streak >= 5 && valueFor(coord('pass-use')) < 0.45;

  if (wantsPass) {
    const passUsage: PassUsage = {
      id: `sim-pass-${membershipId}-${day}`,
      membershipId,
      cohortDay: day,
      createdAt: new Date(getDeadline(cohort, day).getTime() - 3_600_000).toISOString(),
    };
    state.passesUsed++;
    state.streak++;
    if (state.streak > state.best) state.best = state.streak;
    state.misses = 0;
    state.lastEngagementDay = day;
    return { passUsage, probability, attended: false };
  }

  state.streak = 0;
  state.misses++;
  state.missTotal++;
  if (state.misses === policy.dormancyDays) state.dormantSpells++;
  return { probability, attended: false };
}

export interface MemberTrajectory {
  readonly checkins: Checkin[];
  readonly passUsages: PassUsage[];
  readonly summary: {
    readonly checkins: number;
    readonly lates: number;
    readonly simples: number;
    readonly passes: number;
    readonly misses: number;
    readonly bestStreak: number;
    readonly dormantSpells: number;
    readonly comebacks: number;
    readonly lastEngagementDay: number;
  };
}

/** 코호트 신호 없이 한 명만 돌린다. 원형 튜닝과 단위 테스트용. */
export function simulateMember(
  input: MemberSimConfig & { readonly throughDay: number },
): MemberTrajectory {
  const state = initialMemberState();
  const checkins: Checkin[] = [];
  const passUsages: PassUsage[] = [];
  const last = Math.min(input.throughDay, input.cohort.durationDays);

  for (let day = 1; day <= last; day++) {
    const r = stepMember(input, state, day);
    if (r.checkin) checkins.push(r.checkin);
    if (r.passUsage) passUsages.push(r.passUsage);
  }

  return {
    checkins,
    passUsages,
    summary: {
      checkins: checkins.length,
      lates: checkins.filter((c) => new Date(c.createdAt).getTime() > getDeadline(input.cohort, c.cohortDay).getTime()).length,
      simples: checkins.filter((c) => c.photoRef == null).length,
      passes: passUsages.length,
      misses: state.missTotal,
      bestStreak: state.best,
      dormantSpells: state.dormantSpells,
      comebacks: state.comebacks,
      lastEngagementDay: state.lastEngagementDay,
    },
  };
}
