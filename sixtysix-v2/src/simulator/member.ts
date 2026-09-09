/**
 * 멤버 한 명의 66일 궤적.
 *
 * 출력은 판단이 아니라 **도메인 사실**(Checkin · PassUsage)이다.
 * late·simple·returning 은 여기서 정하지 않는다. Gate 1 셀렉터가 createdAt 과
 * 이력에서 파생한다. 시뮬레이터는 "언제 무엇을 했는가"만 만든다.
 */
import type { Checkin, Cohort, PassUsage, Visibility } from '../domain/types.js';
import { policyFor } from '../domain/policies.js';
import { getDeadline } from '../domain/selectors/time.js';
import { intFor, pickFor, valueFor, type Dimension } from './random.js';
import { getAttendanceProbability, type ArchetypeParams } from './archetypes.js';

export interface SimulateInput {
  readonly simulatorVersion: number;
  readonly cohort: Cohort;
  readonly membershipId: string;
  readonly archetype: ArchetypeParams;
  /** 어디까지 시뮬레이션할지. 미래는 만들지 않는다 */
  readonly throughDay: number;
  readonly photoRefs: readonly string[];
  readonly texts: readonly string[];
  /** Gate 2 첫 버전에서는 0 */
  readonly cohortMomentum?: number;
  /** 일차별 어제 참여율. cohortMomentum 이 0 이면 쓰이지 않는다 */
  readonly participationByDay?: ReadonlyMap<number, number>;
}

export interface MemberTrajectory {
  readonly checkins: Checkin[];
  readonly passUsages: PassUsage[];
  /** 검증용 요약. 저장하지 않는다 */
  readonly summary: {
    readonly checkins: number;
    readonly lates: number;
    readonly simples: number;
    readonly passes: number;
    readonly misses: number;
    readonly bestStreak: number;
    readonly dormantSpells: number;
    readonly comebacks: number;
  };
}

function dayStart(cohort: Cohort, day: number): Date {
  const [y, m, d] = cohort.startDate.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d + (day - 1));
}

export function simulateMember(input: SimulateInput): MemberTrajectory {
  const { cohort, membershipId, archetype, simulatorVersion } = input;
  const policy = policyFor(cohort.policyVersion);
  const coord = (cohortDay: number, dimension: Dimension) => ({
    simulatorVersion, cohortId: cohort.id, membershipId, cohortDay, dimension,
  });

  const checkins: Checkin[] = [];
  const passUsages: PassUsage[] = [];

  let streak = 0;
  let misses = 0;
  let passesUsed = 0;
  let best = 0;
  let dormantSpells = 0;
  let comebacks = 0;
  let wasDormant = false;
  let missTotal = 0;

  const last = Math.min(input.throughDay, cohort.durationDays);

  for (let day = 1; day <= last; day++) {
    const p = getAttendanceProbability({
      archetype,
      previousStreak: streak,
      consecutiveMisses: misses,
      cohortDay: day,
      durationDays: cohort.durationDays,
      ...(input.cohortMomentum !== undefined ? { cohortMomentum: input.cohortMomentum } : {}),
      ...(input.participationByDay?.has(day - 1)
        ? { yesterdayParticipation: input.participationByDay.get(day - 1)! }
        : {}),
    });

    const attended = valueFor(coord(day, 'attendance')) < p;

    if (attended) {
      if (misses > 0) comebacks++;
      if (wasDormant) wasDormant = false;

      const late = valueFor(coord(day, 'late')) < archetype.latePropensity;
      const simple = valueFor(coord(day, 'simple')) < archetype.simpleCheckinPropensity;

      // 늦은 인증은 마감(다음 날 04:00)을 넘긴 시각에 만든다.
      // 셀렉터가 이 createdAt 을 보고 late 를 파생한다.
      const createdAt = late
        ? new Date(getDeadline(cohort, day).getTime() + intFor(coord(day, 'checkin-time'), 30, 600) * 60_000)
        : (() => {
            const base = dayStart(cohort, day);
            const hour = intFor(coord(day, 'checkin-time'), 6, 23);
            const minute = intFor(coord(day, 'text'), 0, 59);
            return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0);
          })();

      const visibility: Visibility = 'cohort';
      checkins.push({
        id: `sim-${membershipId}-${day}`,
        membershipId,
        cohortDay: day,
        createdAt: createdAt.toISOString(),
        text: pickFor(coord(day, 'text'), input.texts),
        ...(simple ? {} : { photoRef: pickFor(coord(day, 'photo'), input.photoRefs) }),
        visibility,
      });

      streak++;
      if (streak > best) best = streak;
      misses = 0;
      continue;
    }

    // 인증하지 않은 날. 연속이 아깝고 면제권이 남았으면 쓴다.
    const wantsPass =
      passesUsed < policy.passLimit &&
      streak >= 5 &&
      valueFor(coord(day, 'pass-use')) < 0.45;

    if (wantsPass) {
      passUsages.push({
        id: `sim-pass-${membershipId}-${day}`,
        membershipId,
        cohortDay: day,
        createdAt: new Date(getDeadline(cohort, day).getTime() - 3_600_000).toISOString(),
      });
      passesUsed++;
      streak++; // 면제권은 연속을 잇는다
      if (streak > best) best = streak;
      misses = 0;
      continue;
    }

    streak = 0;
    misses++;
    missTotal++;
    if (misses === policy.dormancyDays) {
      dormantSpells++;
      wasDormant = true;
    }
  }

  return {
    checkins,
    passUsages,
    summary: {
      checkins: checkins.length,
      lates: checkins.filter((c) => new Date(c.createdAt).getTime() > getDeadline(cohort, c.cohortDay).getTime()).length,
      simples: checkins.filter((c) => c.photoRef == null).length,
      passes: passUsages.length,
      misses: missTotal,
      bestStreak: best,
      dormantSpells,
      comebacks,
    },
  };
}
