/* 육십육 — 샘플 데이터
   sixtysix-project.md 10장. 모든 데이터는 샘플이며 sample: true 를 갖는다. */

const IMG = 'assets/images/';

/* ── 이미지 10장 ─────────────────────────────────────── */
const IMAGES = {
  hero:       { src: IMG + 'hero-morning-desk.webp', alt: '아침 창가 책상에 펼쳐 둔 책과 커피잔' },
  reading:    { src: IMG + 'habit-reading.webp',     alt: '지하철에서 책을 읽는 사람' },
  running:    { src: IMG + 'habit-running.webp',     alt: '새벽 한강길을 달리는 사람의 뒷모습' },
  english:    { src: IMG + 'habit-english.webp',     alt: '카페 테이블 위의 단어장과 이어폰' },
  water:      { src: IMG + 'habit-water.webp',       alt: '부엌 창가에서 물컵을 든 손' },
  journal:    { src: IMG + 'habit-journal.webp',     alt: '스탠드 아래 노트에 손글씨를 쓰는 손' },
  meetup:     { src: IMG + 'cohort-meetup.webp',     alt: '카페 긴 테이블에 모여 앉은 코호트 멤버들' },
  graduation: { src: IMG + 'graduation-66.webp',     alt: '체크 표시로 가득 찬 노트와 작은 케이크' },
  stretch:    { src: IMG + 'habit-stretch.webp',     alt: '거실 매트에서 아침 스트레칭을 하는 사람' },
  rest:       { src: IMG + 'rest-window.webp',       alt: '비 오는 창가의 소파와 담요' }
};

/* ── 습관 6종 ────────────────────────────────────────── */
const HABITS = [
  { id: 'reading', name: '독서 15분',      short: '독서',       goal: '하루 15분 읽기',   image: 'reading', tags: ['저녁 습관'], sample: true },
  { id: 'running', name: '아침 러닝',      short: '러닝',       goal: '하루 20분 달리기', image: 'running', tags: ['아침 습관'], sample: true },
  { id: 'english', name: '영어 단어 20개', short: '영어',       goal: '하루 단어 20개',   image: 'english', tags: ['저녁 습관'], sample: true },
  { id: 'water',   name: '물 2L',          short: '물 마시기',  goal: '하루 2리터',       image: 'water',   tags: ['아침 습관'], sample: true },
  { id: 'journal', name: '하루 기록',      short: '기록',       goal: '하루 세 줄',       image: 'journal', tags: ['저녁 습관'], sample: true },
  { id: 'stretch', name: '아침 스트레칭',  short: '스트레칭',   goal: '하루 10분',        image: 'stretch', tags: ['아침 습관'], sample: true }
];

/* ── 코호트 ──────────────────────────────────────────── */
/* 진행 중 코호트는 습관마다 하나씩 둔다.
   온보딩에서 고른 습관과 배정 코호트가 어긋나지 않게 하기 위한 것이다. */
const MY_COHORT_ID = 'c-reading-0817';

const COHORTS = [
  { id: MY_COHORT_ID,     habitId: 'reading', name: '독서 15분 · 9월 2기',     start: '2026-08-17', end: '2026-10-21', capacity: 30, joined: 30, running: true, sample: true },
  { id: 'c-running-0817', habitId: 'running', name: '아침 러닝 · 9월 2기',     start: '2026-08-17', end: '2026-10-21', capacity: 30, joined: 30, running: true, sample: true },
  { id: 'c-english-0817', habitId: 'english', name: '영어 단어 20개 · 9월 2기',     start: '2026-08-17', end: '2026-10-21', capacity: 30, joined: 30, running: true, sample: true },
  { id: 'c-water-0817',   habitId: 'water',   name: '물 2L · 9월 2기',         start: '2026-08-17', end: '2026-10-21', capacity: 30, joined: 30, running: true, sample: true },
  { id: 'c-journal-0817', habitId: 'journal', name: '하루 기록 · 9월 2기',     start: '2026-08-17', end: '2026-10-21', capacity: 30, joined: 30, running: true, sample: true },
  { id: 'c-stretch-0817', habitId: 'stretch', name: '아침 스트레칭 · 9월 2기', start: '2026-08-17', end: '2026-10-21', capacity: 30, joined: 30, running: true, sample: true },
  { id: 'c-running-0914', habitId: 'running', name: '아침 러닝 · 9월 3기',      start: '2026-09-14', end: '2026-11-18', capacity: 30, joined: 12, sample: true },
  { id: 'c-english-0914', habitId: 'english', name: '영어 단어 20개 · 9월 3기',      start: '2026-09-14', end: '2026-11-18', capacity: 30, joined: 27, sample: true },
  { id: 'c-water-1005',   habitId: 'water',   name: '물 2L · 10월 1기',         start: '2026-10-05', end: '2026-12-09', capacity: 30, joined: 3,  sample: true },
  { id: 'c-journal-1005', habitId: 'journal', name: '하루 기록 · 10월 1기',     start: '2026-10-05', end: '2026-12-09', capacity: 30, joined: 0,  sample: true },
  { id: 'c-reading-0914', habitId: 'reading', name: '독서 15분 · 9월 3기',      start: '2026-09-14', end: '2026-11-18', capacity: 30, joined: 21, sample: true },
  { id: 'c-stretch-0914', habitId: 'stretch', name: '아침 스트레칭 · 9월 3기',  start: '2026-09-14', end: '2026-11-18', capacity: 30, joined: 8,  sample: true },
  { id: 'c-running-1005', habitId: 'running', name: '아침 러닝 · 10월 1기',     start: '2026-10-05', end: '2026-12-09', capacity: 30, joined: 30, sample: true },
  { id: 'c-english-1005', habitId: 'english', name: '영어 단어 20개 · 10월 1기',     start: '2026-10-05', end: '2026-12-09', capacity: 30, joined: 5,  sample: true },
  { id: 'c-stretch-1005', habitId: 'stretch', name: '아침 스트레칭 · 10월 1기', start: '2026-10-05', end: '2026-12-09', capacity: 30, joined: 2,  sample: true },
  { id: 'c-journal-1102', habitId: 'journal', name: '하루 기록 · 11월 1기',     start: '2026-11-02', end: '2027-01-06', capacity: 30, joined: 1,  sample: true },
  { id: 'c-reading-1102', habitId: 'reading', name: '독서 15분 · 11월 1기',     start: '2026-11-02', end: '2027-01-06', capacity: 30, joined: 4,  sample: true }
];

/* ── 코호트 멤버 8명 ─────────────────────────────────── */
const MEMBERS = [
  { id: 'm-doyun', name: '도윤', avatar: 'reading', day: 23, streak: 23, total: 23, state: 'ongoing', checkedToday: true,  sample: true },
  { id: 'm-jiho',  name: '지호', avatar: 'journal', day: 23, streak: 23, total: 23, state: 'ongoing', checkedToday: true,  sample: true },
  { id: 'm-haeun', name: '하은', avatar: 'english', day: 23, streak: 15, total: 20, state: 'ongoing', checkedToday: true,  sample: true },
  { id: 'm-subin', name: '수빈', avatar: 'stretch', day: 23, streak: 6,  total: 19, state: 'late',    checkedToday: true,  sample: true },
  { id: 'm-nayeon',name: '나연', avatar: 'water',   day: 23, streak: 11, total: 18, state: 'ongoing', checkedToday: true,  sample: true },
  { id: 'm-yejun', name: '예준', avatar: 'reading', day: 23, streak: 1,  total: 12, state: 'return',  checkedToday: true,  sample: true },
  { id: 'm-seoa',  name: '서아', avatar: 'english', day: 23, streak: 4,  total: 11, state: 'ongoing', checkedToday: false, sample: true },
  { id: 'm-minjun',name: '민준', avatar: 'journal', day: 23, streak: 0,  total: 9,  state: 'dormant', checkedToday: false, sample: true }
];

/* ── 코호트 인증 6건 (피드) ──────────────────────────── */
const FEED_CHECKINS = [
  { id: 'fc-1', memberId: 'm-doyun',  time: '07:12', day: 23, text: '출근길 15분, 어제 멈춘 문장부터', photo: 'reading', cheers: 12, late: false, simple: false, returning: false, sample: true },
  { id: 'fc-2', memberId: 'm-haeun',  time: '08:40', day: 23, text: '오늘은 10분밖에 못 읽었지만 인증', photo: null,      cheers: 9,  late: false, simple: true,  returning: false, sample: true },
  { id: 'fc-3', memberId: 'm-subin',  time: '03:04', day: 23, text: '새벽 3시 인증. 늦었지만 안 빠졌다', photo: 'journal', cheers: 21, late: true,  simple: false, returning: false, sample: true },
  { id: 'fc-4', memberId: 'm-yejun',  time: '09:15', day: 23, text: '8일 만에 복귀. 다시 1일차',       photo: 'water',   cheers: 34, late: false, simple: false, returning: true,  sample: true },
  { id: 'fc-5', memberId: 'm-jiho',   time: '06:30', day: 23, text: '23일 연속. 반환점까지 열흘',      photo: 'journal', cheers: 18, late: false, simple: false, returning: false, sample: true },
  { id: 'fc-6', memberId: 'm-nayeon', time: '21:48', day: 23, text: '카페에서 30분, 책 한 권 끝',      photo: 'english', cheers: 15, late: false, simple: false, returning: false, sample: true }
];

/* ── 배지 7종 ────────────────────────────────────────── */
const BADGES = [
  { id: 'b-first',  name: '첫 인증',    cond: '첫 인증을 남기면',      icon: 'fa-seedling',      need: 1  },
  { id: 'b-7',      name: '7일 연속',   cond: '7일 연속 인증',         icon: 'fa-fire',          need: 7  },
  { id: 'b-return', name: '복귀',       cond: '끊긴 뒤 다시 인증',     icon: 'fa-rotate-right',  need: 0  },
  { id: 'b-21',     name: '21일 연속',  cond: '21일 연속 인증',        icon: 'fa-fire-flame-curved', need: 21 },
  { id: 'b-33',     name: '반환점',     cond: '33일차 인증',           icon: 'fa-flag-checkered', need: 33 },
  { id: 'b-50',     name: '50일',       cond: '50일차 인증',           icon: 'fa-mountain-sun',  need: 50 },
  { id: 'b-66',     name: '66일 완주',  cond: '66일 인증 완료',        icon: 'fa-trophy',        need: 66 }
];

/* ── 공지 3건 ────────────────────────────────────────── */
const NOTICES = [
  {
    id: 'n-1', title: '9월 2기 오프라인 모임 · 10/3(토) 성수', category: '모임',
    date: '2026-09-05', image: 'meetup', cohortId: 'c-reading-0914',
    body: '10월 3일 토요일 오후 2시, 성수동 카페에서 만나요. 지금까지 읽은 책 한 권만 들고 오면 됩니다. 참석은 자유예요.'
  },
  {
    id: 'n-2', title: '면제권은 3회예요 — 이렇게 써요', category: '안내',
    date: '2026-08-30', image: 'rest', cohortId: null,
    body: '못 한 날 면제권을 쓰면 연속 기록이 끊기지 않아요. 자동으로 쓰이지 않으니 홈에서 직접 골라야 합니다. 66일 동안 3번까지예요.'
  },
  {
    id: 'n-3', title: '10/21 졸업식 안내', category: '안내',
    date: '2026-08-20', image: 'graduation', cohortId: null,
    body: '10월 21일에 9월 2기가 끝나요. 그날 완주 배지와 66일 기록을 정리해서 보여드립니다. 다음 코호트 예약도 그때 열려요.'
  }
];

/* ── 내 인증 한 줄 (일차별) ──────────────────────────── */
const MY_TEXTS = {
  1:  '첫날. 프롤로그만 읽고 덮었다',
  2:  '자기 전 15분, 생각보다 금방 지나감',
  3:  '점심시간에 카페에서 20분',
  4:  '오늘은 세 페이지. 그래도 폈다',
  5:  '지하철에서 서서 읽으니 더 집중됨',
  7:  '주말 아침에 커피 마시며 30분',
  8:  '2장 끝. 인물 이름이 헷갈린다',
  9:  '늦게 들어와서 자정 넘겨 읽음',
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
  22: '내일이면 3주. 이제 습관 같다'
};

/* ── 내 인증 일차별 상태 (데모 기본값 · 마감된 1~22일) ──
   인증 20일(늦은 인증 2일 포함) + 면제권 1일 + 미인증 1일 = 채운 날 21일
   현재 연속 9일(14~22일), 남은 면제권 2회 */
const MY_DAYS_DEFAULT = (function () {
  const map = {};
  for (let d = 1; d <= 22; d++) map[d] = 'done';
  map[6] = 'pass';
  map[13] = 'miss';
  map[9] = 'late';
  map[18] = 'late';
  return map;
})();

const MY_SIMPLE_DAYS = [4, 17, 21];
const MY_PRIVATE_DAYS = [12, 19];
const MY_PHOTO_BY_DAY = { 1: 'reading', 2: 'journal', 3: 'english', 5: 'reading', 7: 'journal',
  8: 'reading', 9: 'journal', 10: 'english', 11: 'reading', 12: 'journal', 14: 'reading',
  15: 'english', 16: 'reading', 18: 'journal', 19: 'reading', 20: 'english', 22: 'reading' };

/* ── 인증 작성 샘플 사진 (습관별) ────────────────────── */
const PHOTO_CHOICES = {
  reading: ['reading', 'journal', 'english', 'water', 'stretch'],
  running: ['running', 'stretch', 'water', 'journal', 'english'],
  english: ['english', 'reading', 'journal', 'water', 'stretch'],
  water:   ['water', 'stretch', 'reading', 'journal', 'english'],
  journal: ['journal', 'reading', 'english', 'water', 'stretch'],
  stretch: ['stretch', 'running', 'water', 'reading', 'journal']
};

/* ── 데모 기준일 ─────────────────────────────────────── */
const DEMO_TODAY = '2026-09-08';
const COHORT_START = '2026-08-17';
const TOTAL_DAYS = 66;
