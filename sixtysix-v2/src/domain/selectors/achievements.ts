/**
 * 성취 — 코호트 생애주기(MembershipStatus)와 분리한다.
 *
 *   membershipStatus === 'ended'  66일 기간이 끝남      (생애주기)
 *   stayedToEnd                   마지막까지 이탈하지 않음 (가설 1 의 핵심 지표)
 *   filled66                      Checkin + PassUsage 로 66일을 모두 채움
 *   perfect66                     실제 인증 66회, 면제권 0회
 *
 * completed 라는 이름을 쓰지 않는다. ended 와 다시 섞이기 때문이다.
 */
import type { Ctx, Facts, MembershipId } from '../types.js';
import { getCheckins } from './checkin.js';
import { getFilledDays, getPassUsages } from './progress.js';
import { getMembershipStatus, getMembership } from './membership.js';

/** 마지막으로 직접 행동(인증 또는 면제권)한 일차. 응원만 누른 것은 세지 않는다. */
export function getLastEngagementDay(facts: Facts, membershipId: MembershipId): number {
  let last = 0;
  for (const d of getFilledDays(facts, membershipId)) if (d > last) last = d;
  return last;
}

/** 끝까지 참여 흐름에 남았는가. 마지막 7일 안에 직접 행동이 있어야 한다. */
export function stayedToEnd(facts: Facts, membershipId: MembershipId, ctx: Ctx): boolean {
  const membership = getMembership(facts, membershipId);
  if (getMembershipStatus(membership, ctx.cohort, ctx.now) !== 'ended') return false;
  return getLastEngagementDay(facts, membershipId) >= ctx.cohort.durationDays - 6;
}

/** 66칸을 모두 채웠는가. 면제권도 인정한다. 서비스가 공식으로 제공하는 완주 장치이기 때문이다. */
export function filled66(facts: Facts, membershipId: MembershipId, ctx: Ctx): boolean {
  return getFilledDays(facts, membershipId).size >= ctx.cohort.durationDays;
}

/** 면제권 없이 66일을 전부 인증했는가. 30명 중 0명이어도 이상하지 않다. */
export function perfect66(facts: Facts, membershipId: MembershipId, ctx: Ctx): boolean {
  return (
    getCheckins(facts, membershipId).length >= ctx.cohort.durationDays &&
    getPassUsages(facts, membershipId).length === 0
  );
}

export interface CohortOutcome {
  readonly members: number;
  readonly stayedToEnd: number;
  readonly filled66: number;
  readonly perfect66: number;
  readonly meanFilled: number;
}

export function getCohortOutcome(facts: Facts, ctx: Ctx): CohortOutcome {
  const members = facts.memberships.filter((m) => m.cohortId === ctx.cohort.id);
  let stayed = 0;
  let full = 0;
  let perfect = 0;
  let filledSum = 0;
  for (const m of members) {
    if (stayedToEnd(facts, m.id, ctx)) stayed++;
    if (filled66(facts, m.id, ctx)) full++;
    if (perfect66(facts, m.id, ctx)) perfect++;
    filledSum += getFilledDays(facts, m.id).size;
  }
  return {
    members: members.length,
    stayedToEnd: stayed,
    filled66: full,
    perfect66: perfect,
    meanFilled: members.length ? filledSum / members.length : 0,
  };
}
