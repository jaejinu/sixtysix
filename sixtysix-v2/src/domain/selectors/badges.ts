/** 배지 — 정의는 데이터, 획득 여부와 시점은 파생. */
import type { BadgeId, Ctx, EarnedBadge, Facts, MembershipId } from '../types.js';
import { getFilledDays } from './progress.js';
import { getCheckins } from './checkin.js';

export interface BadgeDef {
  readonly id: BadgeId;
  readonly name: string;
  readonly condition: string;
  readonly icon: string;
}

export const BADGES: readonly BadgeDef[] = [
  { id: 'first', name: '첫 인증', condition: '첫 인증을 남기면', icon: 'fa-seedling' },
  { id: 'streak7', name: '7일 연속', condition: '7일 연속 인증', icon: 'fa-fire' },
  { id: 'comeback', name: '복귀', condition: '끊긴 뒤 다시 인증', icon: 'fa-rotate-right' },
  { id: 'streak21', name: '21일 연속', condition: '21일 연속 인증', icon: 'fa-fire-flame-curved' },
  { id: 'turn33', name: '반환점', condition: '33일차 인증', icon: 'fa-flag-checkered' },
  { id: 'day50', name: '50일', condition: '50일차 인증', icon: 'fa-mountain-sun' },
  { id: 'complete66', name: '66일 완주', condition: '66칸을 모두 채우면', icon: 'fa-trophy' },
  { id: 'perfect66', name: '완벽 완주', condition: '면제권 없이 66일 전부 인증', icon: 'fa-crown' },
];

/**
 * 획득한 배지와 그 시점.
 * 홈의 "이번 주에 받은 배지"가 시점을 요구하므로 earnedAtDay 까지 파생한다.
 * 1일차부터 순회하며 조건이 처음 참이 되는 일차를 기록한다.
 */
export function getEarnedBadges(
  facts: Facts,
  membershipId: MembershipId,
  ctx: Ctx,
): EarnedBadge[] {
  const filled = getFilledDays(facts, membershipId);
  const checkinDays = new Set(getCheckins(facts, membershipId).map((c) => c.cohortDay));
  const today = Math.min(
    ctx.cohort.durationDays,
    Math.max(0, filled.size === 0 ? 0 : Math.max(...filled)),
  );

  const earned: EarnedBadge[] = [];
  const mark = (badgeId: BadgeId, day: number) => {
    if (!earned.some((e) => e.badgeId === badgeId)) earned.push({ badgeId, earnedAtDay: day });
  };

  let run = 0;
  let filledCount = 0;
  let checkinCount = 0;
  let sawMiss = false;

  for (let d = 1; d <= today; d++) {
    const isFilled = filled.has(d);
    if (isFilled) {
      run++;
      filledCount++;
      if (checkinDays.has(d)) {
        checkinCount++;
        if (checkinCount === 1) mark('first', d);
        if (sawMiss) mark('comeback', d);
      }
      if (run >= 7) mark('streak7', d);
      if (run >= 21) mark('streak21', d);
      if (d >= 33) mark('turn33', d);
      if (d >= 50) mark('day50', d);
      if (filledCount >= ctx.cohort.durationDays) {
        mark('complete66', d);
        // 면제권을 한 번도 쓰지 않았다면 완벽 완주
        if (checkinCount >= ctx.cohort.durationDays) mark('perfect66', d);
      }
    } else {
      run = 0;
      sawMiss = true;
    }
  }

  return earned;
}

export function getRecentBadges(
  facts: Facts,
  membershipId: MembershipId,
  ctx: Ctx,
  withinDays: number,
): EarnedBadge[] {
  const all = getEarnedBadges(facts, membershipId, ctx);
  const maxDay = all.reduce((m, b) => Math.max(m, b.earnedAtDay), 0);
  return all
    .filter((b) => b.earnedAtDay > maxDay - withinDays)
    .sort((a, b) => b.earnedAtDay - a.earnedAtDay);
}
