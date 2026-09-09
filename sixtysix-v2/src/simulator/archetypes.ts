/**
 * 멤버 원형 — 성향과 과거만 다룬다. 운(valueFor)은 여기 없다.
 *
 *   valueFor                  = 운
 *   getAttendanceProbability  = 성향 + 과거
 *   simulateMember            = 둘을 결합
 *
 * 원형은 결과를 결정하지 않고 경향만 만든다. steady 도 빠지는 날이 있어야
 * "각본대로 움직인다"가 아니라 "사람마다 성향이 있다"로 읽힌다.
 *
 * 이름은 UI 에 노출하지 않는다. 시뮬레이터 내부에만 존재한다.
 */

export type ArchetypeId =
  | 'steady'
  | 'ordinary'
  | 'deadline'
  | 'hotStart'
  | 'comeback'
  | 'atRisk';

export interface ArchetypeParams {
  /** 아무 맥락이 없을 때 오늘 인증할 기본 확률 */
  readonly baseAttendance: number;
  /** 연속이 쌓였을 때 오르는 정도. cap 이 있어 무한히 오르지 않는다 */
  readonly streakMomentum: number;
  /** 한 번 빠진 다음 날 또 빠지기 쉬워지는 정도. 이게 있어야 이탈이 덩어리로 생긴다 */
  readonly missDrag: number;
  /** 여러 번 빠진 뒤 돌아오는 힘. missDrag 의 반대 축 */
  readonly comebackStrength: number;
  /** 66일이 길어질수록 기본 확률이 내려가는 정도 */
  readonly fatigueSlope: number;
  /** 인증은 하되 마감을 넘겨서 할 성향 */
  readonly latePropensity: number;
  /** 사진 없이 한 줄만 남길 성향 */
  readonly simpleCheckinPropensity: number;
  /** 남의 인증에 응원을 보낼 성향 */
  readonly reactionPropensity: number;
}

/** 연속 momentum 이 최대가 되는 지점. 이 위로는 더 오르지 않는다 */
const STREAK_CAP = 14;
/** missDrag 가 최대가 되는 연속 미인증 수 */
const DRAG_CAP = 2;
/** comeback 이 작동하기 시작하는 연속 미인증 수 */
const COMEBACK_ONSET = 2;
const COMEBACK_RANGE = 4;

const MIN_P = 0.02;
const MAX_P = 0.97;

/**
 * 원형 수치.
 *
 * 차이를 baseAttendance 하나로만 벌리지 않는다. 평균 출석률이 비슷해도
 * 궤적 모양이 달라야 한다. deadline 은 참여를 못 하는 사람이 아니라
 * 잘 참여하되 항상 막판에 나타나는 사람이다.
 */
export const ARCHETYPES: Record<ArchetypeId, ArchetypeParams> = {
  steady: {
    baseAttendance: 0.80,
    streakMomentum: 0.14,
    missDrag: 0.06,
    comebackStrength: 0.20,
    fatigueSlope: 0.05,
    latePropensity: 0.05,
    simpleCheckinPropensity: 0.10,
    reactionPropensity: 0.30,
  },
  ordinary: {
    baseAttendance: 0.70,
    streakMomentum: 0.10,
    missDrag: 0.12,
    comebackStrength: 0.16,
    fatigueSlope: 0.10,
    latePropensity: 0.10,
    simpleCheckinPropensity: 0.22,
    reactionPropensity: 0.22,
  },
  deadline: {
    // 출석 패턴은 ordinary 와 비슷하고 늦는 성향만 크다
    baseAttendance: 0.72,
    streakMomentum: 0.10,
    missDrag: 0.11,
    comebackStrength: 0.18,
    fatigueSlope: 0.08,
    latePropensity: 0.42,
    simpleCheckinPropensity: 0.30,
    reactionPropensity: 0.14,
  },
  hotStart: {
    // 초반은 steady 급, 후반에 크게 꺾인다
    baseAttendance: 0.84,
    streakMomentum: 0.06,
    missDrag: 0.16,
    comebackStrength: 0.10,
    fatigueSlope: 0.34,
    latePropensity: 0.12,
    simpleCheckinPropensity: 0.24,
    reactionPropensity: 0.18,
  },
  comeback: {
    // 잘 빠지지만 아주 사라지지는 않는 사람
    baseAttendance: 0.58,
    streakMomentum: 0.08,
    missDrag: 0.26,
    comebackStrength: 0.40,
    fatigueSlope: 0.06,
    latePropensity: 0.18,
    simpleCheckinPropensity: 0.26,
    reactionPropensity: 0.20,
  },
  atRisk: {
    // comeback 과 missDrag 는 비슷하지만 돌아오는 힘이 약하다
    baseAttendance: 0.52,
    streakMomentum: 0.06,
    missDrag: 0.30,
    comebackStrength: 0.08,
    fatigueSlope: 0.14,
    latePropensity: 0.20,
    simpleCheckinPropensity: 0.34,
    reactionPropensity: 0.08,
  },
};

export interface AttendanceInput {
  readonly archetype: ArchetypeParams;
  readonly previousStreak: number;
  readonly consecutiveMisses: number;
  readonly cohortDay: number;
  readonly durationDays: number;
  /**
   * 어제 코호트 참여율(0~1)이 오늘 확률에 주는 영향.
   * Gate 2 첫 버전에서는 계수를 0 으로 둔다. 개인 원형만으로 궤적을 먼저 만든 뒤
   * 이 값만 켜서 가설 1 의 A/B 를 같은 seed 세계에서 비교한다.
   */
  readonly cohortMomentum?: number;
  readonly yesterdayParticipation?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 오늘 인증할 확률. 난수를 쓰지 않는 순수 함수라 단독으로 검증할 수 있다.
 */
export function getAttendanceProbability(input: AttendanceInput): number {
  const a = input.archetype;

  const momentum = a.streakMomentum * clamp(input.previousStreak / STREAK_CAP, 0, 1);

  // 1~2일 빠짐에서 끌어내리는 힘이 가장 크다. 이게 이탈을 덩어리로 만든다
  const drag = a.missDrag * clamp(input.consecutiveMisses / DRAG_CAP, 0, 1);

  // 3일 이상 빠지면 돌아오려는 힘이 붙는다. drag 와 반대 축
  const comeback =
    a.comebackStrength *
    clamp((input.consecutiveMisses - COMEBACK_ONSET) / COMEBACK_RANGE, 0, 1);

  const progress = input.durationDays > 1 ? (input.cohortDay - 1) / (input.durationDays - 1) : 0;
  const fatigue = a.fatigueSlope * progress;

  const cohort =
    (input.cohortMomentum ?? 0) * ((input.yesterdayParticipation ?? 0.5) - 0.5) * 2;

  return clamp(a.baseAttendance + momentum - drag + comeback - fatigue + cohort, MIN_P, MAX_P);
}
