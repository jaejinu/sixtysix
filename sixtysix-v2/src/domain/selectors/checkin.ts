/** 인증 분류 — late · simple · returning 은 저장하지 않고 여기서 파생한다. */
import type { Checkin, CheckinKind, Cohort, CohortDay, MembershipId, Facts } from '../types.js';
import { getDeadline } from './time.js';

/**
 * 내 인증 목록.
 *
 * throughDay 를 주면 그 일차까지만 보여준다.
 * 시뮬레이터가 66일을 미리 만들어 두므로 시계가 가리키는 오늘 이후는
 * 데이터에 있어도 노출되면 안 된다. Clock 은 커튼이지 생성 장치가 아니다.
 */
export function getCheckins(
  facts: Facts, membershipId: MembershipId, throughDay?: number,
): Checkin[] {
  return facts.checkins
    .filter((c) => c.membershipId === membershipId && (throughDay === undefined || c.cohortDay <= throughDay))
    .slice()
    .sort((a, b) => a.cohortDay - b.cohortDay);
}

export function getCheckinByDay(
  facts: Facts,
  membershipId: MembershipId,
  day: CohortDay,
): Checkin | undefined {
  return facts.checkins.find((c) => c.membershipId === membershipId && c.cohortDay === day);
}

/** createdAt 이 그 일차의 마감을 넘겼는가. cohort.policyVersion 의 규칙만 쓴다. */
export function isLate(checkin: Checkin, cohort: Cohort): boolean {
  return new Date(checkin.createdAt).getTime() > getDeadline(cohort, checkin.cohortDay).getTime();
}

export function isSimple(checkin: Checkin): boolean {
  return checkin.photoRef == null;
}

/**
 * 끊겼다 돌아온 인증인가.
 * 직전 일차가 비어 있으면 복귀로 본다. 1일차는 복귀가 아니다.
 */
export function isReturning(checkin: Checkin, filledDays: ReadonlySet<CohortDay>): boolean {
  if (checkin.cohortDay <= 1) return false;
  return !filledDays.has(checkin.cohortDay - 1);
}

export function getCheckinKind(
  checkin: Checkin,
  cohort: Cohort,
  filledDays: ReadonlySet<CohortDay>,
): CheckinKind {
  return {
    late: isLate(checkin, cohort),
    simple: isSimple(checkin),
    returning: isReturning(checkin, filledDays),
  };
}
