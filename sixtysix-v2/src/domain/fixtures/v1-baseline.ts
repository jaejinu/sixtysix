/**
 * V1_D23_BASELINE
 *
 * V1.1 이 만든 제품 의미의 기준점. 새 도메인이 같은 사실에서 같은 수치를 내야
 * 재설계 과정에서 정책을 바꾸지 않았다는 증거가 된다.
 *
 *   cohortDay 23 · checkins 20 · passes 1 · filled 21 · streak 9 · rank 4
 */
import type { Checkin, Cohort, Facts, Habit, Membership, PassUsage } from '../types.js';

export const BASELINE_NOW = new Date(2026, 8, 8, 9, 0, 0); // 2026-09-08 09:00
export const COHORT_START = '2026-08-17';
export const TODAY_DAY = 23;

const HABITS: Habit[] = [
  { id: 'reading', name: '독서 15분', shortName: '독서', goal: '하루 15분 읽기', imageRef: 'habit-reading', timeOfDay: 'evening' },
];

const COHORT: Cohort = {
  id: 'c-reading-0817',
  habitId: 'reading',
  generation: '9월 2기',
  startDate: COHORT_START,
  durationDays: 66,
  capacity: 30,
  policyVersion: 1,
};

/** 코호트 시작일 기준 day 일차의 특정 시각 */
function at(day: number, hour: number, minute = 0): string {
  const [y, m, d] = COHORT_START.split('-').map(Number) as [number, number, number];
  const base = new Date(y, m - 1, d + (day - 1), hour, minute, 0);
  return base.toISOString();
}

/** 늦은 인증은 다음 날 04:00 을 넘긴 시각에 만든다 */
function lateAt(day: number): string {
  const [y, m, d] = COHORT_START.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d + day, 6, 30, 0).toISOString();
}

let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

interface MemberSpec {
  readonly id: string;
  readonly name: string;
  /** 실제 인증 수 */
  readonly checkins: number;
  /** 오늘 기준 연속 */
  readonly streak: number;
  readonly checkedToday: boolean;
}

/** V1 MEMBERS 의 (총 인증, 연속) 을 그대로 재현한다 */
const MEMBER_SPECS: readonly MemberSpec[] = [
  { id: 'm-doyun',  name: '도윤', checkins: 23, streak: 23, checkedToday: true },
  { id: 'm-jiho',   name: '지호', checkins: 23, streak: 23, checkedToday: true },
  { id: 'm-haeun',  name: '하은', checkins: 20, streak: 15, checkedToday: true },
  { id: 'm-subin',  name: '수빈', checkins: 19, streak: 6,  checkedToday: true },
  { id: 'm-nayeon', name: '나연', checkins: 18, streak: 11, checkedToday: true },
  { id: 'm-yejun',  name: '예준', checkins: 12, streak: 1,  checkedToday: true },
  { id: 'm-seoa',   name: '서아', checkins: 11, streak: 4,  checkedToday: false },
  { id: 'm-minjun', name: '민준', checkins: 9,  streak: 0,  checkedToday: false },
];

/** 지정한 인증 수와 연속을 만족하는 인증 일차를 만든다 */
function daysFor(spec: MemberSpec): number[] {
  const lastDay = spec.checkedToday ? TODAY_DAY : TODAY_DAY - 1;
  const streakDays: number[] = [];
  for (let i = 0; i < spec.streak; i++) streakDays.push(lastDay - i);

  const gap = lastDay - spec.streak; // 연속을 끊는 날. 비워 둔다.
  const rest: number[] = [];
  let d = gap - 1;
  while (rest.length < spec.checkins - spec.streak && d >= 1) {
    rest.push(d);
    d--;
  }
  return [...streakDays, ...rest].filter((x) => x >= 1).sort((a, b) => a - b);
}

/** 나 — V1 데모 기본값을 그대로 옮긴 것 */
const MY_MEMBERSHIP_ID = 'ms-me';
const MY_PASS_DAY = 6;
const MY_MISS_DAY = 13;
const MY_LATE_DAYS = [9, 18];
const MY_SIMPLE_DAYS = [4, 17, 21];
const MY_PRIVATE_DAYS = [12, 19];

function buildMyCheckins(): Checkin[] {
  const out: Checkin[] = [];
  for (let day = 1; day <= TODAY_DAY - 1; day++) {
    if (day === MY_PASS_DAY || day === MY_MISS_DAY) continue;
    const late = MY_LATE_DAYS.includes(day);
    const simple = MY_SIMPLE_DAYS.includes(day);
    out.push({
      id: nextId('ck-me'),
      membershipId: MY_MEMBERSHIP_ID,
      cohortDay: day,
      createdAt: late ? lateAt(day) : at(day, 21),
      text: `${day}일차 인증`,
      ...(simple ? {} : { photoRef: 'habit-reading' }),
      visibility: MY_PRIVATE_DAYS.includes(day) ? 'private' : 'cohort',
    });
  }
  return out;
}

export function buildBaselineFacts(): Facts {
  seq = 0;
  const memberships: Membership[] = [
    { id: MY_MEMBERSHIP_ID, userId: 'u-me', cohortId: COHORT.id, joinedAt: at(1, 9) },
  ];
  const checkins: Checkin[] = buildMyCheckins();

  for (const spec of MEMBER_SPECS) {
    const membershipId = `ms-${spec.id}`;
    memberships.push({ id: membershipId, userId: spec.id, cohortId: COHORT.id, joinedAt: at(1, 9) });
    for (const day of daysFor(spec)) {
      checkins.push({
        id: nextId('ck'),
        membershipId,
        cohortDay: day,
        createdAt: at(day, 20),
        text: `${spec.name} ${day}일차`,
        photoRef: 'habit-reading',
        visibility: 'cohort',
      });
    }
  }

  const passUsages: PassUsage[] = [
    { id: 'pu-me-1', membershipId: MY_MEMBERSHIP_ID, cohortDay: MY_PASS_DAY, createdAt: at(MY_PASS_DAY, 23) },
  ];

  return {
    habits: HABITS,
    cohorts: [COHORT],
    memberships,
    checkins,
    passUsages,
    reactions: [],
  };
}

export const BASELINE = {
  cohort: COHORT,
  myMembershipId: MY_MEMBERSHIP_ID,
  now: BASELINE_NOW,
  expected: { day: 23, checkins: 20, passes: 1, filled: 21, streak: 9, rank: 4 },
} as const;
