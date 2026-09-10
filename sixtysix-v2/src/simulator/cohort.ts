/**
 * 30명 코호트를 날짜 우선으로 시뮬레이션한다.
 *
 * 멤버별로 66일을 따로 돌리면 코호트 신호를 쓸 수 없다.
 * 날짜 우선으로 돌면서 **이미 확정된 과거 날짜의 참여율만** 신호로 쓰면
 * 순환 없이 결정론을 유지할 수 있다.
 */
import type { Checkin, Cohort, Membership, PassUsage } from '../domain/types.js';
import { ARCHETYPES, type ArchetypeId } from './archetypes.js';
import { initialMemberState, stepMember, type MemberSimConfig, type MemberState } from './member.js';
import { valueFor } from './random.js';

export interface CohortMixEntry {
  readonly archetype: ArchetypeId;
  readonly count: number;
}

/**
 * 배분. 균등이 아니라 ordinary 를 가장 많이 둔다.
 * 균등하면 30명이 6가지 유형의 전시장처럼 보인다.
 *
 * 코호트 정원 30명 중 1명은 사용자 자리(ordinary)이므로 시뮬레이션은 29명이다.
 */
export const DEFAULT_MIX: readonly CohortMixEntry[] = [
  { archetype: 'ordinary', count: 8 },
  { archetype: 'steady', count: 5 },
  { archetype: 'deadline', count: 5 },
  { archetype: 'hotStart', count: 4 },
  { archetype: 'comeback', count: 4 },
  { archetype: 'atRisk', count: 3 },
];

export const MEMBER_NAMES = [
  '도윤', '서아', '민준', '하은', '지호', '수빈', '예준', '나연', '시우', '지아',
  '건우', '유나', '주원', '채원', '현우', '다인', '은서', '소율', '태윤', '가은',
  '민서', '지훈', '아린', '연우', '하율', '지완', '세아', '윤호', '보라',
] as const;

/** 코호트 신호 계수. Gate 2 첫 버전에서는 0 이다. */
export interface MomentumConfig {
  /** 0 이면 코호트가 복귀 확률에 아무 영향을 주지 않는다 */
  readonly coefficient: number;
  /** 최근 며칠의 참여율을 볼 것인가. 하루만 보면 우연에 민감하다 */
  readonly windowDays: number;
}

export const MOMENTUM_OFF: MomentumConfig = { coefficient: 0, windowDays: 3 };

export interface BuildCohortInput {
  readonly simulatorVersion: number;
  readonly cohort: Cohort;
  readonly throughDay: number;
  readonly photoRefs: readonly string[];
  readonly texts: readonly string[];
  readonly mix?: readonly CohortMixEntry[];
  readonly momentum?: MomentumConfig;
}

export interface SimulatedMember {
  readonly membershipId: string;
  readonly userId: string;
  readonly name: string;
  readonly archetype: ArchetypeId;
}

export interface SimulatedCohort {
  readonly members: readonly SimulatedMember[];
  readonly memberships: Membership[];
  readonly checkins: Checkin[];
  readonly passUsages: PassUsage[];
  /** 일차별 참여율(본인 포함 전체). 검증용이며 저장하지 않는다 */
  readonly participationByDay: ReadonlyMap<number, number>;
  readonly stateByMember: ReadonlyMap<string, MemberState>;
}

/**
 * 미인증 일수에 따른 복귀 필요도.
 * 1일은 작게, 2~6일에서 가장 크고, 휴면(7일 이상)에서는 줄지만 0 은 아니다.
 */
export function getComebackNeed(consecutiveMisses: number): number {
  if (consecutiveMisses <= 0) return 0;
  if (consecutiveMisses === 1) return 0.35;
  if (consecutiveMisses <= 4) return 1;
  if (consecutiveMisses <= 6) return 0.85;
  return 0.45;
}

/**
 * 코호트 활동 신호를 비선형으로 만든다.
 * 참여율이 낮은 날 뒤의 하락을 크게, 높은 날 뒤의 상승을 완만하게 잡는다.
 * 0.6 을 기준으로 -1..1 범위로 편다.
 */
export function nonlinearSignal(participation: number): number {
  // 기준점은 절반이다. 절반 미만이면 포기 전염, 넘으면 함께 가는 느낌.
  // 관측된 평균에 맞춰 끼우면 튜닝할 때마다 기준이 흔들린다.
  const centered = (participation - 0.5) / 0.5;
  const clamped = Math.max(-1, Math.min(1, centered));
  return clamped >= 0 ? Math.sqrt(clamped) : -Math.sqrt(-clamped);
}

/** 배분을 멤버 목록으로 펼치고 결정론적으로 섞는다. index 와 원형이 붙어 있으면 안 된다. */
export function buildMembers(cohort: Cohort, mix: readonly CohortMixEntry[], simulatorVersion: number): SimulatedMember[] {
  const archetypes: ArchetypeId[] = [];
  for (const e of mix) for (let i = 0; i < e.count; i++) archetypes.push(e.archetype);

  // 결정론적 셔플. 정렬 키를 해시로 뽑는다.
  const keyed = archetypes.map((a, i) => ({
    a,
    key: valueFor({ simulatorVersion, cohortId: cohort.id, membershipId: `slot-${i}`, cohortDay: 0, dimension: 'attendance' }),
  }));
  keyed.sort((x, y) => x.key - y.key);

  return keyed.map((k, i) => ({
    membershipId: `ms-${cohort.id}-${i}`,
    userId: `u-${cohort.id}-${i}`,
    name: MEMBER_NAMES[i] ?? `멤버${i + 1}`,
    archetype: k.a,
  }));
}

export function buildSimulatedCohort(input: BuildCohortInput): SimulatedCohort {
  const { cohort, simulatorVersion, throughDay } = input;
  const mix = input.mix ?? DEFAULT_MIX;
  const momentum = input.momentum ?? MOMENTUM_OFF;
  const members = buildMembers(cohort, mix, simulatorVersion);

  const configs = new Map<string, MemberSimConfig>();
  const states = new Map<string, MemberState>();
  for (const m of members) {
    configs.set(m.membershipId, {
      simulatorVersion, cohort, membershipId: m.membershipId,
      archetype: ARCHETYPES[m.archetype], photoRefs: input.photoRefs, texts: input.texts,
    });
    states.set(m.membershipId, initialMemberState());
  }

  const checkins: Checkin[] = [];
  const passUsages: PassUsage[] = [];
  /** 일차 → 그날 활동한(인증 또는 면제권) 멤버 id 집합 */
  const activeByDay = new Map<number, Set<string>>();
  const participationByDay = new Map<number, number>();

  const last = Math.min(throughDay, cohort.durationDays);

  for (let day = 1; day <= last; day++) {
    const activeToday = new Set<string>();

    for (const m of members) {
      const state = states.get(m.membershipId)!;
      const cfg = configs.get(m.membershipId)!;

      let boost = 0;
      // 복귀 특화: 연속 참여 중인 멤버에게는 적용하지 않는다
      if (momentum.coefficient > 0 && state.misses > 0) {
        // 최근 N일 참여율. 본인은 제외한다. 내가 인증해서 내 복귀 확률이 오르면 안 된다
        let done = 0;
        let slots = 0;
        for (let d = Math.max(1, day - momentum.windowDays); d < day; d++) {
          const set = activeByDay.get(d);
          if (!set) continue;
          slots += members.length - 1;
          for (const id of set) if (id !== m.membershipId) done++;
        }
        if (slots > 0) {
          boost = momentum.coefficient * nonlinearSignal(done / slots) * getComebackNeed(state.misses);
        }
      }

      const r = stepMember(cfg, state, day, boost !== 0 ? { comebackBoost: boost } : undefined);
      if (r.checkin) { checkins.push(r.checkin); activeToday.add(m.membershipId); }
      if (r.passUsage) { passUsages.push(r.passUsage); activeToday.add(m.membershipId); }
    }

    activeByDay.set(day, activeToday);
    participationByDay.set(day, activeToday.size / members.length);
  }

  return {
    members,
    memberships: members.map((m) => ({
      id: m.membershipId, userId: m.userId, cohortId: cohort.id,
      joinedAt: `${cohort.startDate}T09:00:00.000Z`,
    })),
    checkins,
    passUsages,
    participationByDay,
    stateByMember: states,
  };
}
