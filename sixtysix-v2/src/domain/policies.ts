/**
 * 코호트 정책. Cohort.policyVersion 으로 어느 판을 쓸지 고른다.
 * 규칙이 바뀌어도 기존 코호트의 과거 판단이 재해석되지 않게 하기 위한 장치다.
 */

export interface Policy {
  readonly version: number;
  readonly durationDays: number;
  readonly capacity: number;
  /** 66일 동안 쓸 수 있는 면제권 횟수 (정책 3) */
  readonly passLimit: number;
  /** 인증 마감 시각. 다음 날 이 시각까지 그날 인증으로 인정한다 (정책 1) */
  readonly deadlineHour: number;
  /** 마감 후 늦은 인증을 받아주는 시간 (정책 2) */
  readonly lateWindowHours: number;
  /** 연속 미인증이 이 일수에 도달하면 휴면 (정책 10) */
  readonly dormancyDays: number;
  readonly textMaxLength: number;
}

export const POLICY_V1: Policy = {
  version: 1,
  durationDays: 66,
  capacity: 30,
  passLimit: 3,
  deadlineHour: 4,
  lateWindowHours: 12,
  dormancyDays: 7,
  textMaxLength: 40,
};

const POLICIES: Record<number, Policy> = { 1: POLICY_V1 };

export function policyFor(policyVersion: number): Policy {
  const p = POLICIES[policyVersion];
  if (!p) throw new Error(`알 수 없는 policyVersion: ${policyVersion}`);
  return p;
}
