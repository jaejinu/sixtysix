/* 육십육 — 상태 모델
   sixtysix-project.md 10.7 로컬 상태, 11장 인터랙션 규칙 */

const STORAGE_KEY = 'sixtysix';
const STORAGE_VERSION = 1;
const PASS_LIMIT = 3;

/* ── 기본 상태 ───────────────────────────────────────── */
function defaultState() {
  return {
    version: STORAGE_VERSION,
    me: {
      nickname: '재진',
      habitId: 'reading',
      cohortId: MY_COHORT_ID,
      onboarded: false,
      dayCount: 23,
      passesUsed: 1,
      demoState: 'ongoing',
      graduated: false,
      nextCohortId: null
    },
    days: Object.assign({}, MY_DAYS_DEFAULT),
    texts: Object.assign({}, MY_TEXTS),
    simpleDays: MY_SIMPLE_DAYS.slice(),
    privateDays: MY_PRIVATE_DAYS.slice(),
    photoDays: Object.assign({}, MY_PHOTO_BY_DAY),
    cheers: [],
    saved: [],
    reports: [],
    readNotices: [],
    settings: {
      alarmHour: '오전 7시',
      defaultScope: 'cohort',
      feedFilter: 'all',
      recordFilter: 'mine',
      discover: { q: '', habit: 'all', conds: [], sort: 'start' }
    }
  };
}

let Store = defaultState();
let storageBroken = false;

/* ── 저장과 복구 ─────────────────────────────────────── */
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STORAGE_VERSION) {
      storageBroken = true;
      return;
    }
    const base = defaultState();
    Store = {
      version: STORAGE_VERSION,
      me: Object.assign(base.me, parsed.me || {}),
      days: parsed.days || base.days,
      texts: Object.assign(base.texts, parsed.texts || {}),
      simpleDays: parsed.simpleDays || base.simpleDays,
      privateDays: parsed.privateDays || base.privateDays,
      photoDays: Object.assign(base.photoDays, parsed.photoDays || {}),
      cheers: parsed.cheers || [],
      saved: parsed.saved || [],
      reports: parsed.reports || [],
      readNotices: parsed.readNotices || [],
      settings: Object.assign(base.settings, parsed.settings || {})
    };
  } catch (e) {
    storageBroken = true;
    Store = defaultState();
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Store));
    return true;
  } catch (e) {
    return false;
  }
}

function resetStore() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 저장소 접근 불가 */ }
  Store = defaultState();
  storageBroken = false;
}

/* ── 데모 상태 프리셋 (기획 3장 사용자 상태 6개) ─────── */
const DEMO_STATES = [
  { id: 'day0',      label: '0일차',    desc: '코호트 시작 당일, 아직 인증 전' },
  { id: 'ongoing',   label: '연속 중',  desc: '어제 인증, 오늘 미인증 (기본값)' },
  { id: 'done',      label: '오늘 완료', desc: '오늘 인증까지 끝낸 상태' },
  { id: 'broken',    label: '끊김',      desc: '어제 인증을 놓친 상태' },
  { id: 'dormant',   label: '휴면',      desc: '7일 연속 인증이 없는 상태' },
  { id: 'graduated', label: '완주',      desc: '66일을 모두 지난 상태' }
];

function applyDemoState(id) {
  const me = Store.me;
  me.demoState = id;
  me.graduated = false;

  if (id === 'day0') {
    me.dayCount = 1;
    me.passesUsed = 0;
    Store.days = {};
  } else if (id === 'ongoing') {
    me.dayCount = 23;
    me.passesUsed = 1;
    Store.days = Object.assign({}, MY_DAYS_DEFAULT);
  } else if (id === 'done') {
    me.dayCount = 23;
    me.passesUsed = 1;
    Store.days = Object.assign({}, MY_DAYS_DEFAULT, { 23: 'done' });
    Store.texts[23] = '3주하고 이틀째. 오늘도 15분';
    Store.photoDays[23] = 'reading';
  } else if (id === 'broken') {
    me.dayCount = 23;
    me.passesUsed = 1;
    Store.days = Object.assign({}, MY_DAYS_DEFAULT, { 22: 'miss' });
  } else if (id === 'dormant') {
    me.dayCount = 23;
    me.passesUsed = 1;
    const d = Object.assign({}, MY_DAYS_DEFAULT);
    for (let i = 16; i <= 22; i++) d[i] = 'miss';
    Store.days = d;
  } else if (id === 'graduated') {
    me.dayCount = 66;
    me.passesUsed = 3;
    me.graduated = true;
    const d = {};
    for (let i = 1; i <= 66; i++) d[i] = 'done';
    /* 인증 62일(늦은 인증 5일 포함) + 면제권 3일 + 미인증 1일, 최장 연속 31일 */
    [6, 30, 47].forEach(function (n) { d[n] = 'pass'; });
    d[35] = 'miss';
    [9, 18, 41, 52, 58].forEach(function (n) { d[n] = 'late'; });
    Store.days = d;
  }
  saveStore();
}

/* ── 파생 값 ─────────────────────────────────────────── */
function dayStatus(n) {
  return Store.days[n] || null;
}

function isFilled(status) {
  return status === 'done' || status === 'late' || status === 'pass';
}

function isCheckin(status) {
  return status === 'done' || status === 'late';
}

function derived() {
  const me = Store.me;
  const today = me.dayCount;
  let filled = 0, checkins = 0, lates = 0, simples = 0, passes = 0, misses = 0;

  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const s = dayStatus(d);
    if (!s) continue;
    if (isFilled(s)) filled++;
    if (isCheckin(s)) checkins++;
    if (s === 'late') lates++;
    if (s === 'pass') passes++;
    if (s === 'miss') misses++;
    if (Store.simpleDays.indexOf(d) >= 0 && isCheckin(s)) simples++;
  }

  const todayStatus = dayStatus(today);
  const todayChecked = isFilled(todayStatus);

  /* 현재 연속: 가장 최근 채운 날부터 거꾸로 센다 */
  let streak = 0;
  let cursor = todayChecked ? today : today - 1;
  while (cursor >= 1 && isFilled(dayStatus(cursor))) {
    streak++;
    cursor--;
  }

  /* 최장 연속 */
  let best = 0, run = 0;
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    if (isFilled(dayStatus(d))) { run++; if (run > best) best = run; }
    else if (dayStatus(d) === 'miss') { run = 0; }
  }

  /* 휴면: 마지막 7일이 모두 미인증 */
  let dormant = today >= 8;
  for (let d = today - 7; d < today; d++) {
    if (isFilled(dayStatus(d))) { dormant = false; break; }
  }
  if (today < 8) dormant = false;

  const yesterdayMissed = today > 1 && dayStatus(today - 1) === 'miss';

  let state;
  if (me.graduated) state = 'graduated';
  else if (todayChecked) state = 'done';
  else if (dormant) state = 'dormant';
  else if (yesterdayMissed) state = 'broken';
  else if (checkins === 0) state = 'day0';
  else state = 'ongoing';

  return {
    day: today,
    filled: filled,
    checkins: checkins,
    lates: lates,
    simples: simples,
    passes: passes,
    misses: misses,
    passesLeft: Math.max(0, PASS_LIMIT - me.passesUsed),
    streak: streak,
    bestStreak: best,
    todayChecked: todayChecked,
    todayStatus: todayStatus,
    state: state,
    remaining: Math.max(0, TOTAL_DAYS - filled),
    percent: Math.round((filled / TOTAL_DAYS) * 100)
  };
}

/* ── 배지 판정 ───────────────────────────────────────── */
function earnedBadges() {
  const d = derived();
  const out = {};
  out['b-first'] = d.checkins >= 1;
  out['b-7'] = d.bestStreak >= 7;
  out['b-21'] = d.bestStreak >= 21;
  out['b-33'] = isFilled(dayStatus(33));
  out['b-50'] = isFilled(dayStatus(50));
  out['b-66'] = d.filled >= TOTAL_DAYS || Store.me.graduated;

  /* 복귀: 미인증 다음에 인증이 있으면 획득 */
  let missSeen = false, returned = false;
  for (let i = 1; i <= TOTAL_DAYS; i++) {
    const s = dayStatus(i);
    if (s === 'miss') missSeen = true;
    else if (missSeen && isCheckin(s)) { returned = true; break; }
  }
  out['b-return'] = returned;
  return out;
}

/* ── 인증 추가 ───────────────────────────────────────── */
function addCheckin(opts) {
  const me = Store.me;
  const day = me.dayCount;
  if (isFilled(dayStatus(day))) return { ok: false, reason: 'already' };

  Store.days[day] = opts.late ? 'late' : 'done';
  Store.texts[day] = opts.text;
  if (opts.photo) Store.photoDays[day] = opts.photo;
  else if (Store.simpleDays.indexOf(day) < 0) Store.simpleDays.push(day);
  if (opts.isPrivate && Store.privateDays.indexOf(day) < 0) Store.privateDays.push(day);

  const before = earnedBadges();
  saveStore();
  const after = earnedBadges();
  const newBadges = BADGES.filter(function (b) { return !before[b.id] && after[b.id]; });
  return { ok: true, day: day, newBadges: newBadges };
}

/* ── 면제권 사용 ─────────────────────────────────────── */
function usePass() {
  const d = derived();
  if (d.passesLeft <= 0) return { ok: false, reason: 'none' };
  if (d.state === 'dormant') return { ok: false, reason: 'dormant' };

  /* 가장 최근 미인증일 하나를 면제 처리한다 */
  let target = null;
  for (let i = Store.me.dayCount - 1; i >= 1; i--) {
    if (dayStatus(i) === 'miss') { target = i; break; }
  }
  if (target === null) return { ok: false, reason: 'nomiss' };

  Store.days[target] = 'pass';
  Store.me.passesUsed += 1;
  saveStore();
  return { ok: true, day: target };
}

/* ── 응원 · 저장 · 신고 · 공지 ───────────────────────── */
function toggleIn(list, id) {
  const i = list.indexOf(id);
  if (i >= 0) { list.splice(i, 1); saveStore(); return false; }
  list.push(id); saveStore(); return true;
}

function isCheered(id) { return Store.cheers.indexOf(id) >= 0; }
function isSaved(id) { return Store.saved.indexOf(id) >= 0; }
function isReported(id) { return Store.reports.indexOf(id) >= 0; }
function isNoticeRead(id) { return Store.readNotices.indexOf(id) >= 0; }

function markNoticeRead(id) {
  if (!isNoticeRead(id)) { Store.readNotices.push(id); saveStore(); }
}

/* ── 랭킹 ────────────────────────────────────────────── */
function ranking() {
  const d = derived();
  const rows = MEMBERS.map(function (m) {
    return {
      id: m.id, name: m.name, avatar: m.avatar,
      total: m.total, streak: m.streak, state: m.state, me: false
    };
  });
  rows.push({
    id: 'me', name: Store.me.nickname, avatar: 'reading',
    total: d.filled, streak: d.streak, state: d.state, me: true
  });
  rows.sort(function (a, b) {
    if (b.total !== a.total) return b.total - a.total;
    return b.streak - a.streak;
  });
  let rank = 0, prevTotal = null, prevStreak = null;
  rows.forEach(function (r, i) {
    if (r.total !== prevTotal || r.streak !== prevStreak) rank = i + 1;
    r.rank = rank;
    prevTotal = r.total; prevStreak = r.streak;
  });
  return rows;
}

/* ── 내 인증 목록 ────────────────────────────────────── */
function myCheckins() {
  const out = [];
  for (let d = TOTAL_DAYS; d >= 1; d--) {
    const s = dayStatus(d);
    if (!isCheckin(s)) continue;
    out.push({
      id: 'my-' + d,
      day: d,
      date: dayToDate(d),
      text: Store.texts[d] || '',
      photo: Store.photoDays[d] || null,
      late: s === 'late',
      simple: Store.simpleDays.indexOf(d) >= 0,
      isPrivate: Store.privateDays.indexOf(d) >= 0
    });
  }
  return out;
}

/* ── 날짜 유틸 ───────────────────────────────────────── */
function dayToDate(n) {
  const base = new Date(COHORT_START + 'T00:00:00');
  base.setDate(base.getDate() + (n - 1));
  return base;
}

function formatDate(date) {
  return (date.getMonth() + 1) + '월 ' + date.getDate() + '일';
}

function formatFullDate(date) {
  return date.getFullYear() + '년 ' + (date.getMonth() + 1) + '월 ' + date.getDate() + '일';
}

function isoDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + m + '-' + d;
}

function daysUntil(isoStr) {
  const target = new Date(isoStr + 'T00:00:00');
  const today = new Date(DEMO_TODAY + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function habitById(id) {
  return HABITS.filter(function (h) { return h.id === id; })[0] || HABITS[0];
}

function cohortById(id) {
  return COHORTS.filter(function (c) { return c.id === id; })[0] || COHORTS[0];
}

function memberById(id) {
  return MEMBERS.filter(function (m) { return m.id === id; })[0] || null;
}

function checkinById(id) {
  const feed = FEED_CHECKINS.filter(function (c) { return c.id === id; })[0];
  if (feed) return feed;
  const mine = myCheckins().filter(function (c) { return c.id === id; })[0];
  return mine || null;
}
