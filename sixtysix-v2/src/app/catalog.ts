/** 습관 6종과 코호트. V1 data.js 를 옮기되 형태는 Gate 1 타입을 따른다. */
import type { Habit, Cohort } from '../domain/types';

export const HABITS: readonly Habit[] = [
  { id: 'h-reading', name: '독서 15분',      shortName: '독서',   goal: '하루 15분 읽기',   imageRef: 'habit-reading',  timeOfDay: 'evening' },
  { id: 'h-running', name: '아침 러닝',      shortName: '러닝',   goal: '하루 20분 달리기', imageRef: 'habit-running',  timeOfDay: 'morning' },
  { id: 'h-english', name: '영어 단어 20개', shortName: '영어',   goal: '하루 단어 20개',   imageRef: 'habit-english',  timeOfDay: 'evening' },
  { id: 'h-water',   name: '물 2L',          shortName: '물',     goal: '하루 2리터',       imageRef: 'habit-water',    timeOfDay: 'morning' },
  { id: 'h-journal', name: '하루 기록',      shortName: '기록',   goal: '하루 세 줄',       imageRef: 'habit-journal',  timeOfDay: 'evening' },
  { id: 'h-stretch', name: '아침 스트레칭',  shortName: '스트레칭', goal: '하루 10분',      imageRef: 'habit-stretch',  timeOfDay: 'morning' },
];

/** 데모 기준 코호트. 2026-08-17 시작 · 66일 · 30명. */
export const DEMO_COHORT: Cohort = {
  id: 'c-reading-0817',
  habitId: 'h-reading',
  generation: '9월 2기',
  startDate: '2026-08-17',
  durationDays: 66,
  capacity: 30,
  policyVersion: 1,
};

export const PHOTO_REFS = [
  'habit-reading', 'habit-journal', 'habit-english', 'habit-water', 'habit-stretch',
] as const;

/** 시뮬레이터가 멤버 인증 문구로 돌려 쓰는 문장. */
export const CHECKIN_TEXTS = [
  '출근길 15분, 어제 멈춘 문장부터',
  '오늘은 10분밖에 못 읽었지만 인증',
  '새벽에 겨우 폈다. 늦었지만 안 빠졌다',
  '카페 자리 좋아서 40분 앉아 있었다',
  '한 챕터. 오늘은 여기까지',
  '자기 전 15분, 생각보다 금방 지나감',
  '지하철에서 서서 읽으니 더 집중됨',
  '오늘 문장이 계속 남는다',
  '2장 끝. 인물 이름이 헷갈린다',
  '다시 시작. 어제 못 한 만큼 더',
] as const;

export const MY_USER_ID = 'u-me';
export const MY_MEMBERSHIP_ID = 'ms-me';
