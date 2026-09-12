/**
 * 저장 사실이 지켜야 하는 불변식.
 *
 * UI 검증이 아니라 도메인 불변식으로 둔다. 더블클릭·이벤트 중복·저장 복구가
 * 일어나도 깨진 사실이 들어가면 안 된다.
 */
import type { Facts } from './types.js';
import { policyFor } from './policies.js';
import { getMembershipStatus } from './selectors/membership.js';

export interface Violation {
  readonly rule: string;
  readonly detail: string;
}

export function validateFacts(facts: Facts, now: Date): Violation[] {
  const v: Violation[] = [];
  const cohortById = new Map(facts.cohorts.map((c) => [c.id, c]));

  // 15. 동일 Membership + cohortDay 에 Checkin 은 최대 1개
  const checkinKeys = new Set<string>();
  for (const c of facts.checkins) {
    const key = `${c.membershipId}#${c.cohortDay}`;
    if (checkinKeys.has(key)) {
      v.push({ rule: 'unique-checkin-per-day', detail: key });
    }
    checkinKeys.add(key);
  }

  // 16. 같은 날에 Checkin 과 PassUsage 가 동시에 존재할 수 없다
  const passKeys = new Set<string>();
  for (const p of facts.passUsages) {
    const key = `${p.membershipId}#${p.cohortDay}`;
    if (passKeys.has(key)) {
      v.push({ rule: 'unique-pass-per-day', detail: key });
    }
    passKeys.add(key);

  }

  // 4. 한 사용자에게 동시에 active 인 Membership 은 최대 하나 (정책 7)
  const activeByUser = new Map<string, number>();
  for (const m of facts.memberships) {
    const cohort = cohortById.get(m.cohortId);
    if (!cohort) {
      v.push({ rule: 'membership-cohort-exists', detail: m.id });
      continue;
    }
    if (getMembershipStatus(m, cohort, now) === 'active') {
      const n = (activeByUser.get(m.userId) ?? 0) + 1;
      activeByUser.set(m.userId, n);
      if (n > 1) v.push({ rule: 'single-active-membership', detail: m.userId });
    }
  }

  // 면제권은 정책 한도를 넘을 수 없다
  const passCount = new Map<string, number>();
  for (const p of facts.passUsages) {
    passCount.set(p.membershipId, (passCount.get(p.membershipId) ?? 0) + 1);
  }
  for (const [membershipId, n] of passCount) {
    const m = facts.memberships.find((x) => x.id === membershipId);
    const cohort = m ? cohortById.get(m.cohortId) : undefined;
    if (cohort && n > policyFor(cohort.policyVersion).passLimit) {
      v.push({ rule: 'pass-limit', detail: `${membershipId} used ${n}` });
    }
  }

  // cohortDay 는 1..durationDays 안에 있어야 한다
  for (const c of facts.checkins) {
    const m = facts.memberships.find((x) => x.id === c.membershipId);
    const cohort = m ? cohortById.get(m.cohortId) : undefined;
    if (cohort && (c.cohortDay < 1 || c.cohortDay > cohort.durationDays)) {
      v.push({ rule: 'cohort-day-range', detail: `${c.id} day ${c.cohortDay}` });
    }
  }

  return v;
}

export function assertValid(facts: Facts, now: Date): void {
  const v = validateFacts(facts, now);
  if (v.length > 0) {
    throw new Error(`불변식 위반 ${v.length}건: ${v.map((x) => `${x.rule}(${x.detail})`).join(', ')}`);
  }
}
