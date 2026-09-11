/**
 * 데모 시드 — 「진행 중인 상태로 둘러보기」가 보는 내 기록.
 *
 * V1_D23_BASELINE 과 같은 모양이다.
 *   D+23 · 인증 20 · 면제권 1 · 채운 날 21 · 연속 9
 *   6일차는 면제권, 13일차는 미인증, 9·18일차는 늦은 인증
 *
 * P2-D: V1 은 온보딩 직후 곧바로 이 상태였고 안내 문구로 얼버무렸다.
 * V2 는 시작 지점을 고르게 한다 — 이 시드는 「둘러보기」쪽이다.
 */
import type { Checkin, PassUsage } from '../domain/types';
import { SERVICE_TIME_ZONE, epochForZonedTime } from '../infrastructure/timezone';
import { DEMO_COHORT, MY_MEMBERSHIP_ID } from './catalog';
import type { MyFacts } from './world';

const PASS_DAY = 6;
const MISS_DAY = 13;
const LATE_DAYS = new Set([9, 18]);
const PRIVATE_DAYS = new Set([12, 19]);
const SIMPLE_DAYS = new Set([4, 17, 21]);

const TEXTS: Record<number, string> = {
  1: '첫날. 프롤로그만 읽고 덮었다',
  2: '자기 전 15분, 생각보다 금방 지나감',
  3: '점심시간에 카페에서 20분',
  4: '오늘은 세 페이지. 그래도 폈다',
  5: '지하철에서 서서 읽으니 더 집중됨',
  7: '주말 아침에 커피 마시며 30분',
  8: '2장 끝. 인물 이름이 헷갈린다',
  9: '늦게 들어와서 자정 넘겨 읽음',
  10: '오늘 문장이 계속 남는다',
  11: '15분 타이머 맞추고 딱 그만큼',
  12: '조용한 밤, 혼자 읽기 좋은 날',
  14: '다시 시작. 어제 못 한 만큼 더',
  15: '출근 전에 미리 읽어두니 편하다',
  16: '9월 첫날, 새 책 시작',
  17: '오늘은 짧게. 그래도 이어감',
  18: '야근 끝나고 새벽에 겨우 폈다',
  19: '혼자 보려고 남기는 기록',
  20: '카페 자리 좋아서 40분 앉아 있었다',
  21: '한 챕터. 오늘은 여기까지',
  22: '내일이면 3주. 이제 습관 같다',
};

const PHOTOS = ['habit-reading', 'habit-journal', 'habit-english', 'habit-water', 'habit-stretch'];

/** 코호트 시작일 기준 day 일차의 시각. 서비스 시간대로 만든다. */
function at(day: number, hour: number, minute = 0): string {
  const [y, m, d] = DEMO_COHORT.startDate.split('-').map(Number) as [number, number, number];
  return new Date(epochForZonedTime(y, m, d + (day - 1), hour, minute, SERVICE_TIME_ZONE)).toISOString();
}

/** 늦은 인증은 다음 날 04:00 을 넘긴 시각이어야 한다 */
function lateAt(day: number): string {
  const [y, m, d] = DEMO_COHORT.startDate.split('-').map(Number) as [number, number, number];
  return new Date(epochForZonedTime(y, m, d + day, 6, 30, SERVICE_TIME_ZONE)).toISOString();
}

export function buildDemoSeed(throughDay = 22): MyFacts {
  const checkins: Checkin[] = [];
  const passUsages: PassUsage[] = [];

  for (let day = 1; day <= throughDay; day++) {
    if (day === MISS_DAY) continue;
    if (day === PASS_DAY) {
      passUsages.push({
        id: `pass-me-${day}`,
        membershipId: MY_MEMBERSHIP_ID,
        cohortDay: day,
        createdAt: at(day, 22, 0),
      });
      continue;
    }
    const late = LATE_DAYS.has(day);
    const simple = SIMPLE_DAYS.has(day);
    checkins.push({
      id: `ck-me-seed-${day}`,
      membershipId: MY_MEMBERSHIP_ID,
      cohortDay: day,
      createdAt: late ? lateAt(day) : at(day, 21, 10),
      text: TEXTS[day] ?? '오늘도 읽었다',
      visibility: PRIVATE_DAYS.has(day) ? 'private' : 'cohort',
      ...(simple ? {} : { photoRef: PHOTOS[day % PHOTOS.length]! }),
    });
  }

  return { checkins, passUsages };
}
