/* 육십육 — 라우팅과 화면 렌더링
   sixtysix-project.md 6장 화면 명세, 11장 인터랙션 규칙 */

const app = document.getElementById('app');
const toastLayer = document.getElementById('toast-layer');
const overlayLayer = document.getElementById('overlay-layer');
const liveRegion = document.getElementById('live-region');

/* 화면 안에서만 쓰는 임시 상태 (저장하지 않는다) */
const View = {
  onboardStep: 1,
  onboardHabit: null,
  compose: { photo: null, text: '', isPrivate: false, done: false, submitting: false, error: '' },
  openNotice: null,
  lastToastTimer: null,
  undo: null,
  loading: false
};

function onImageFail(el) {
  const box = el.closest('.media');
  if (box) box.classList.add('media--failed');
}

/* ── 라우팅 ──────────────────────────────────────────── */
function currentRoute() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  return { name: parts[0] || 'home', param: parts[1] || null };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

const SCREENS = {
  onboarding: screenOnboarding,
  home: screenHome,
  discover: screenDiscover,
  challenge: screenChallenge,
  checkin: screenCheckinRouter,
  feed: screenFeed,
  record: screenRecord,
  my: screenMy,
  ranking: screenRanking,
  notice: screenNotice,
  graduation: screenGraduation
};

function render() {
  const r = currentRoute();

  if (!Store.me.onboarded && r.name !== 'onboarding') {
    location.replace('#/onboarding');
    return;
  }

  const fn = SCREENS[r.name] || screenNotFound;
  app.innerHTML = fn(r.param);
  app.scrollTop = 0;
  window.scrollTo(0, 0);

  const heading = app.querySelector('h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
  bindScreenInputs();
}

window.addEventListener('hashchange', render);

/* ── 공통 알림 ───────────────────────────────────────── */
function toast(message, undoAction) {
  clearTimeout(View.lastToastTimer);
  const undoBtn = undoAction
    ? '<button type="button" class="toast__action" data-action="toast-undo">실행 취소</button>' : '';
  toastLayer.innerHTML = '<div class="toast">' + '<span>' + esc(message) + '</span>' + undoBtn + '</div>';
  liveRegion.textContent = message;
  View.undo = undoAction || null;
  View.lastToastTimer = setTimeout(function () {
    toastLayer.innerHTML = '';
    View.undo = null;
  }, undoAction ? 5000 : 3000);
}

/* ── Modal / BottomSheet ─────────────────────────────── */
let lastFocused = null;

function openOverlay(html, isSheet) {
  lastFocused = document.activeElement;
  overlayLayer.innerHTML = '<div class="overlay' + (isSheet ? ' overlay--sheet' : '') +
    '" role="dialog" aria-modal="true" data-action="overlay-backdrop">' + html + '</div>';
  const focusable = overlayLayer.querySelector('button, [href], input');
  if (focusable) focusable.focus();
}

function closeOverlay() {
  overlayLayer.innerHTML = '';
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  lastFocused = null;
}

function confirmModal(opts) {
  openOverlay(
    '<div class="modal">' +
      '<h2 class="modal__title">' + esc(opts.title) + '</h2>' +
      '<p class="modal__desc">' + esc(opts.desc) + '</p>' +
      '<div class="modal__actions">' +
        button(opts.primary.label, { variant: opts.primary.variant || 'primary', action: opts.primary.action }) +
        button(opts.secondary.label, { variant: 'text', action: opts.secondary.action }) +
      '</div></div>'
  );
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && overlayLayer.innerHTML) closeOverlay();
  if (e.key === 'Tab' && overlayLayer.innerHTML) {
    const nodes = overlayLayer.querySelectorAll('button, [href], input, select, textarea');
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/* ══════════════════════════════════════════════════════
   6.1 온보딩
   ══════════════════════════════════════════════════════ */
function screenOnboarding() {
  const step = View.onboardStep;
  const habitId = View.onboardHabit;
  const cohort = cohortById(MY_COHORT_ID);

  let mediaKey = 'hero', eyebrow, title, desc, content, cta, ctaDisabled = false;

  if (step === 1) {
    eyebrow = '66일 습관 챌린지';
    title = '어떤 습관을 66일 동안 이어볼까요?';
    desc = '하나만 고르면 같은 날 시작하는 코호트에 들어갑니다.';
    content = HABITS.map(function (h) {
      return '<button type="button" class="hitem" data-action="pick-habit" data-id="' + h.id + '"' +
        ' aria-pressed="' + (habitId === h.id) + '">' +
        media(h.image, { alt: '', w: 100, h: 80 }) +
        '<span><span class="hitem__title">' + esc(h.name) + '</span>' +
        '<span class="hitem__meta">' + esc(h.goal) + '</span></span>' +
        '<span class="hitem__check">' + icon('fa-circle-check') + '</span></button>';
    }).join('');
    cta = '이 습관으로 시작하기';
    ctaDisabled = !habitId;
  } else if (step === 2) {
    mediaKey = 'meetup';
    const h = habitById(habitId || 'reading');
    const assigned = runningCohortFor(h.id);
    eyebrow = '코호트 배정';
    title = assigned.name + '에 들어왔어요';
    desc = '같은 날 시작한 30명이 함께 66일을 갑니다. 인증 마감은 다음 날 새벽 4시예요.';
    content = '<div class="cohort-summary">' +
      '<p class="cohort-summary__name">' + esc(assigned.name) + '</p>' +
      '<p class="cohort-summary__meta">8월 17일 시작 · 10월 21일 종료 · 30/30명</p>' +
      '<div class="cohort-summary__avatars">' +
        MEMBERS.map(function (m) { return media(m.avatar, { alt: '', w: 36, h: 36 }); }).join('') +
      '</div></div>';
    cta = '규칙 확인하기';
  } else {
    mediaKey = 'rest';
    eyebrow = '규칙 요약';
    title = '끊겨도 돌아올 수 있어요';
    desc = '면제권 3회를 직접 쓸 수 있고, 며칠 빠져도 인증 한 번이면 다시 이어집니다.';
    content =
      noteCard('인증은 다음 날 새벽 4시까지', '밤에 하는 습관도 그날 인증으로 인정돼요. 새벽 4시가 지나면 12시간 안에 늦은 인증으로 남길 수 있어요.') +
      noteCard('면제권은 66일 동안 3번', '쓸지 말지는 직접 고르면 돼요. 면제권을 쓴 날은 연속 기록이 끊기지 않아요.') +
      noteCard('7일 넘게 쉬면 휴면이에요', '사라지지 않아요. 인증 한 번 남기면 그날부터 다시 이어집니다.');
    cta = '오늘 인증 남기기';
  }

  return '<div class="onboarding">' +
    '<div class="onboarding__media">' +
      media(mediaKey, { eager: true, w: 430, h: 320 }) +
      (step < 3 ? '<div class="onboarding__skip">' + button('건너뛰기', { variant: 'text', action: 'onboard-skip', block: false }) + '</div>' : '') +
      '<div class="onboarding__indicator" role="img" aria-label="3단계 중 ' + step + '단계">' +
        [1, 2, 3].map(function (n) {
          return '<span class="onboarding__dot' + (n === step ? ' onboarding__dot--on' : '') + '"></span>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<div class="onboarding__body">' +
      '<p class="onboarding__eyebrow">' + esc(eyebrow) + '</p>' +
      '<h1 class="onboarding__title">' + esc(title) + '</h1>' +
      '<p class="onboarding__desc">' + esc(desc) + '</p>' +
      '<div class="onboarding__content">' + content + '</div>' +
      sampleNote('샘플 데이터로 만든 데모입니다. 실제 코호트 매칭과 알림은 동작하지 않아요. 데모는 23일차부터 시작해요. 처음부터 보려면 마이 화면의 데모 상태 전환에서 0일차를 고르세요.') +
    '</div>' +
    '<div class="onboarding__foot">' +
      button(cta, { action: 'onboard-next', disabled: ctaDisabled }) +
    '</div></div>';
}

/* ══════════════════════════════════════════════════════
   6.2 홈
   ══════════════════════════════════════════════════════ */
const HERO_COPY = {
  day0:      { badge: ['done', '오늘 시작'], title: '오늘이 첫날이에요', desc: '독서 15분 · 9월 2기, 30명이 같은 날 시작했어요.', cta: '첫 인증 남기기', img: 'hero' },
  ongoing:   { badge: null, title: '오늘 인증만 남았어요', desc: '', cta: '인증 남기기', img: 'hero' },
  done:      { badge: ['done', '인증 완료'], title: '오늘 인증을 남겼어요', desc: '코호트 30명 중 18명이 오늘 함께했어요.', cta: '코호트 피드 보기', img: 'hero' },
  broken:    { badge: ['late', '어제 미인증'], title: '어제는 쉬었어요', desc: '오늘 인증하면 다시 이어져요. 면제권을 쓰면 연속 기록도 지킬 수 있어요.', cta: '오늘 인증 남기기', img: 'rest' },
  dormant:   { badge: ['dormant', '휴면'], title: '7일 동안 인증이 없었어요', desc: '기록은 그대로 있어요. 오늘 한 번이면 다시 시작이에요.', cta: '복귀 인증하기', img: 'rest' },
  graduated: { badge: ['done', '완주'], title: '66일을 다 채웠어요', desc: '8월 17일에 시작해 마지막 인증까지 끝냈어요.', cta: '졸업 화면 보기', img: 'graduation' }
};

function screenHome() {
  const d = derived();
  const me = Store.me;
  const habit = habitById(me.habitId);
  const cohort = cohortById(me.cohortId);
  const copy = HERO_COPY[d.state] || HERO_COPY.ongoing;

  const doneCount = 18 + (d.todayChecked ? 1 : 0);
  let desc = copy.desc;
  if (d.state === 'ongoing') {
    desc = d.streak + '일 연속 이어가는 중이에요. 오늘 남기면 ' + (d.streak + 1) + '일째예요.';
  } else if (d.state === 'done') {
    desc = '코호트 30명 중 ' + doneCount + '명이 오늘 함께했어요.';
  }

  const heroNum = d.state === 'graduated' ? '66' : 'D+' + d.day;
  const heroUnit = d.state === 'graduated' ? '일 완주' : '/ 66일';

  const metrics = d.state === 'graduated'
    ? [['총 인증', d.checkins, '일'], ['늦은 인증', d.lates, '일'], ['면제권 사용', d.passes, '회']]
    : [['연속', d.streak, '일'], ['채운 날', d.filled, '일'], ['남은 날', d.remaining, '일']];

  const ctaHref = d.state === 'done' ? '#/feed' : (d.state === 'graduated' ? '#/graduation' : null);

  let html = appHeader() + '<main class="screen screen--nav content-container">' +
    '<h1 class="sr-only">오늘 · ' + esc(habit.name) + ' 66일 챌린지</h1>' +
    '<section class="section--tight" style="margin-top:27px">' +
      '<div class="hero">' +
        media(copy.img, { eager: true, w: 394, h: 426 }) +
        '<span class="scrim"></span>' +
        (copy.badge ? '<span class="hero__badge">' + statusBadge(copy.badge[0], copy.badge[1]) + '</span>' : '') +
        '<div class="hero__body">' +
          '<p><span class="num num--count hero__num">' + heroNum + '</span>' +
            '<span class="hero__num-unit">' + heroUnit + '</span></p>' +
          '<p class="hero__title">' + esc(copy.title) + '</p>' +
          '<p class="hero__desc">' + esc(desc) + '</p>' +
          '<div class="hero__metrics">' + metrics.map(function (m) {
            return '<div><p class="hero__metric-label">' + m[0] + '</p>' +
              '<p class="hero__metric-value"><span class="num num--inline">' + m[1] + '</span>' +
              '<span class="hero__num-unit">' + m[2] + '</span></p></div>';
          }).join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="hero-cta">' +
        button(copy.cta, ctaHref ? { href: ctaHref, icon: 'fa-arrow-right' } : { action: 'go-checkin', icon: 'fa-pen-to-square' }) +
      '</div>';

  /* 끊김·휴면 상태의 도움 메뉴 */
  if (d.state === 'broken' || d.state === 'dormant') {
    const passDisabled = d.state === 'dormant' || d.passesLeft <= 0;
    const passDesc = d.state === 'dormant' ? '휴면 상태에서는 쓸 수 없어요'
      : (d.passesLeft > 0 ? d.passesLeft + '회 남았어요' : '면제권을 모두 썼어요');
    html += '<div class="help-menu">' +
      '<button type="button" class="help-menu__item" data-action="use-pass"' + (passDisabled ? ' disabled' : '') + '>' +
        '<span class="help-menu__icon">' + icon('fa-shield-halved') + '</span>' +
        '<span><span class="help-menu__title">면제권 쓰기</span>' +
        '<span class="help-menu__desc">' + esc(passDesc) + '</span></span></button>' +
      '<button type="button" class="help-menu__item" data-action="go-checkin">' +
        '<span class="help-menu__icon">' + icon('fa-rotate-right') + '</span>' +
        '<span><span class="help-menu__title">다시 시작하기</span>' +
        '<span class="help-menu__desc">연속 기록은 0부터</span></span></button>' +
      '</div>';
  }
  html += '</section>';

  /* 코호트 오늘 현황 */
  const todayDone = doneCount;
  html += '<section class="section">' +
    sectionHeader('오늘 코호트 현황', { href: '#/ranking' }) +
    '<div class="cohort-today">' +
      '<p class="cohort-today__figure"><span class="num num--stat">' + todayDone + '</span>' +
        '<span class="cohort-today__label">' + cohort.capacity + '명 중 오늘 인증</span></p>' +
      '<div class="progress-bar"><span class="progress-bar__fill" style="width:' +
        Math.round((todayDone / cohort.capacity) * 100) + '%"></span></div>' +
      '<p class="cohort-today__meta">' + Math.round((todayDone / cohort.capacity) * 100) +
        '% · 늦은 인증 2명 · 휴면 1명. 늦게 인증한 사람도 오늘 인증으로 함께 세요.</p>' +
    '</div></section>';

  /* 오늘 인증한 사람들 */
  const todayCheckins = FEED_CHECKINS.slice(0, 5);
  html += '<section class="section">' + sectionHeader('오늘 인증한 사람들', { href: '#/feed' });
  if (todayCheckins.length) {
    html += '<div class="slider">' + todayCheckins.map(storyCard).join('') + '</div>';
  } else {
    html += emptyBlock('fa-users', '아직 오늘 인증한 사람이 없어요', '첫 번째로 남겨볼까요?', { label: '인증 남기기', action: 'go-checkin' });
  }
  html += '</section>';

  /* 이번 주 배지 */
  const badges = earnedBadges();
  const latest = BADGES.filter(function (b) { return badges[b.id]; }).pop();
  html += '<section class="section">' + sectionHeader('이번 주에 받은 배지', { href: '#/my' });
  if (latest) {
    html += '<a class="badge-card" href="#/my">' +
      media('graduation', { alt: latest.name + ' 배지 이미지', w: 394, h: 250 }) +
      '<span class="scrim"></span>' +
      '<span class="badge-card__body"><span class="badge-card__name">' + esc(latest.name) + '</span>' +
      '<span class="badge-card__cond">' + esc(latest.cond) + '</span></span></a>';
  } else {
    html += emptyBlock('fa-award', '이번 주에 받은 배지는 아직 없어요', '첫 인증을 남기면 바로 하나 생겨요.', { label: '인증 남기기', action: 'go-checkin' });
  }
  html += '</section>';

  /* 공지 배너 */
  html += '<section class="section">' + sectionHeader('공지', { href: '#/notice' }) +
    '<ul class="stack">' + noticeCard(NOTICES[0]) + '</ul></section>';

  /* 추천 습관 */
  const upcoming = COHORTS.filter(function (c) { return !c.mine && daysUntil(c.start) > 0 && c.joined < c.capacity; }).slice(0, 4);
  html += '<section class="section">' + sectionHeader('곧 시작하는 습관', { href: '#/discover' }) +
    '<div class="slider">' + upcoming.map(habitCard).join('') + '</div></section>';

  html += sampleNote('샘플 데이터로 만든 데모예요. 인원과 인증 내용은 실제가 아닙니다.');
  html += '</main>' + bottomNav('home');
  return html;
}

/* ══════════════════════════════════════════════════════
   6.3 챌린지 탐색
   ══════════════════════════════════════════════════════ */
const DISCOVER_HABITS = [{ id: 'all', label: '전체' }].concat(
  HABITS.map(function (h) { return { id: h.id, label: h.short }; })
);
const DISCOVER_CONDS = [
  { id: 'thisweek', label: '이번 주 시작' },
  { id: 'nextmonth', label: '다음 달 시작' },
  { id: 'room', label: '정원 여유 있음' },
  { id: 'morning', label: '아침 습관' },
  { id: 'evening', label: '저녁 습관' }
];
const DISCOVER_SORTS = [
  { id: 'start', label: '시작일 빠른 순' },
  { id: 'room', label: '정원 여유 많은 순' },
  { id: 'popular', label: '인기순' }
];

function filteredCohorts() {
  const f = Store.settings.discover;
  // 이미 시작한 코호트는 참여할 수 없다. 내 코호트만 남긴다.
  let list = COHORTS.filter(function (c) {
    return !c.running || c.id === Store.me.cohortId;
  });

  if (f.habit !== 'all') list = list.filter(function (c) { return c.habitId === f.habit; });

  if (f.q) {
    const q = f.q.trim().toLowerCase();
    list = list.filter(function (c) {
      const h = habitById(c.habitId);
      return (c.name + ' ' + h.name + ' ' + h.goal).toLowerCase().indexOf(q) >= 0;
    });
  }

  f.conds.forEach(function (cond) {
    list = list.filter(function (c) {
      const dd = daysUntil(c.start);
      const h = habitById(c.habitId);
      if (cond === 'thisweek') return dd > 0 && dd <= 7;
      if (cond === 'nextmonth') return dd > 7 && dd <= 40;
      if (cond === 'room') return c.joined < c.capacity;
      if (cond === 'morning') return h.tags.indexOf('아침 습관') >= 0;
      if (cond === 'evening') return h.tags.indexOf('저녁 습관') >= 0;
      return true;
    });
  });

  if (f.sort === 'start') list.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  else if (f.sort === 'room') list.sort(function (a, b) { return (b.capacity - b.joined) - (a.capacity - a.joined); });
  else list.sort(function (a, b) { return b.joined - a.joined; });

  return list;
}

function screenDiscover() {
  const f = Store.settings.discover;
  const list = filteredCohorts();
  const soon = COHORTS.filter(function (c) { return !c.mine && daysUntil(c.start) > 0; })
    .sort(function (a, b) { return a.start < b.start ? -1 : 1; }).slice(0, 4);

  let html = detailHeader('챌린지 찾기') + '<main class="screen screen--nav content-container">' +
    '<h1 class="sr-only">챌린지 찾기</h1>' +
    '<div style="margin-top:27px">' +
      '<div class="search-field">' + icon('fa-magnifying-glass') +
        '<input type="search" id="discover-q" value="' + esc(f.q) + '" placeholder="습관이나 코호트 이름으로 찾기" aria-label="코호트 검색">' +
      '</div>' +
    '</div>' +
    '<div style="margin-top:16px">' + chipRow(DISCOVER_HABITS, f.habit, 'discover-habit', true) + '</div>' +
    '<div style="margin-top:8px">' + multiChipRow(DISCOVER_CONDS, f.conds, 'discover-cond', true) + '</div>' +
    '<p class="result-count" style="margin-top:16px">' + list.length + '개 코호트를 찾았어요</p>' +
    '<div style="margin-top:8px">' + chipRow(DISCOVER_SORTS, f.sort, 'discover-sort', true) + '</div>';

  if (soon.length) {
    html += '<section class="section--tight" style="margin-top:24px">' +
      sectionHeader('곧 시작하는 코호트') +
      '<div class="slider">' + soon.map(countdownCard).join('') + '</div></section>';
  }

  html += '<section class="section--tight" style="margin-top:32px">' + sectionHeader('전체 코호트');
  if (list.length) {
    html += '<ul class="stack">' + list.map(cohortListCard).join('') + '</ul>';
  } else {
    html += emptyBlock('fa-magnifying-glass', '조건에 맞는 코호트가 없어요',
      '조건을 하나 풀어보면 더 많이 보입니다.', { label: '조건 초기화', action: 'discover-reset' });
  }
  html += '</section>';

  html += sampleNote('샘플 코호트예요. 실제 모집과 매칭은 동작하지 않습니다.');
  html += '</main>' + bottomNav('home');
  return html;
}

/* ══════════════════════════════════════════════════════
   6.4 챌린지 상세
   ══════════════════════════════════════════════════════ */
function screenChallenge(id) {
  const cohort = cohortById(id || MY_COHORT_ID);
  const habit = habitById(cohort.habitId);
  const d = derived();
  const dd = daysUntil(cohort.start);
  const start = new Date(cohort.start + 'T00:00:00');
  const end = new Date(cohort.end + 'T00:00:00');
  const full = cohort.joined >= cohort.capacity && !cohort.mine;

  const badges = [];
  if (cohort.mine) badges.push('<span class="badge badge--day">진행 중 · D+' + d.day + '</span>');
  else if (dd > 0) badges.push('<span class="badge badge--return">' + icon('fa-clock') + '모집 중 · D-' + dd + '</span>');
  if (full) badges.push('<span class="badge">' + icon('fa-user-group') + '정원 마감</span>');

  const isMine = cohort.id === Store.me.cohortId;
  const isReserved = cohort.id === Store.me.nextCohortId;
  let cta;
  if (isMine) {
    cta = [button('내 코호트예요', { disabled: true }), button('오늘 인증 남기기', { variant: 'primary', action: 'go-checkin' })];
  } else if (cohort.running) {
    cta = [button('이미 시작한 코호트예요', { disabled: true }), button('비슷한 코호트 보기', { variant: 'secondary', href: '#/discover' })];
  } else if (full) {
    cta = [button('정원이 찼어요', { disabled: true }), button('비슷한 코호트 보기', { variant: 'secondary', href: '#/discover' })];
  } else if (isReserved) {
    cta = [button('예약했어요', { disabled: true }), button('예약 취소하기', { variant: 'secondary', action: 'cancel-reserve' })];
  } else if (hasRunningCohort()) {
    // 정책 7: 한 번에 한 코호트. 진행 중이면 다음 코호트로 예약한다.
    cta = [button('다음 코호트로 예약하기', { action: 'join-cohort', id: cohort.id, icon: 'fa-calendar-plus' })];
  } else {
    cta = [button('코호트 참여하기', { action: 'join-cohort', id: cohort.id, icon: 'fa-user-plus' })];
  }

  let html = detailHeader(habit.name, { action: { name: 'share', icon: 'fa-share-nodes', label: '공유하기' } }) +
    '<main class="screen screen--bar content-container">' +
    '<section style="margin-top:27px">' +
      '<div class="detail-hero">' + media('meetup', { eager: true, alt: habit.name + ' 코호트 소개 이미지', w: 394, h: 250 }) +
        '<span class="scrim"></span>' +
        '<div class="detail-hero__body"><h1 class="detail-hero__title">' + esc(cohort.name) + '</h1>' +
        '<p class="detail-hero__meta">' + esc(habit.goal) + ' · 하루 한 번 인증</p></div>' +
      '</div>' +
    '</section>' +
    '<section class="section--tight"><div class="schedule-card">' +
      '<div class="schedule-card__badges">' + badges.join('') + '</div>' +
      '<p class="schedule-card__title">' + esc(cohort.name) + '</p>' +
      '<p class="schedule-card__meta">' + esc(formatFullDate(start)) + ' ~ ' + esc(formatFullDate(end)) + '</p>' +
      '<p class="schedule-card__stat">' + cohort.joined + '/' + cohort.capacity + '명 참여 · 66일 동안 매일 인증</p>' +
    '</div></section>' +
    '<section class="section--tight">' + sectionHeader('규칙 한눈에 보기') +
      '<div class="info-grid">' +
        infoCard('인증 마감', '다음 날 04:00', '밤 습관도 그날로 인정') +
        infoCard('면제권', '3회', '직접 골라서 사용') +
        infoCard('정원', cohort.capacity + '명', '같은 날 시작') +
        infoCard('기간', '66일', formatDate(start) + ' ~ ' + formatDate(end)) +
      '</div>' +
    '</section>' +
    '<section class="section--tight"><div class="stack">' +
      noteCard('늦어도 괜찮아요', '새벽 4시가 지나면 12시간 안에 늦은 인증으로 남길 수 있어요. 연속 기록은 이어지고, 피드에는 늦은 인증으로 표시돼요.') +
      noteCard('면제권은 직접 써요', '자동으로 쓰이지 않아요. 못 한 날 면제권을 쓰면 연속 기록이 끊기지 않고 남은 횟수가 하나 줄어요.') +
      noteCard('사진이 없어도 인증이에요', '한 줄만 남겨도 인증으로 세요. 피드에서는 간단 인증으로 보입니다.') +
      noteCard('순위보다 완주예요', '순위는 총 인증 일수로 매겨요. 같으면 연속 기록이 앞섭니다. 목적은 66일을 끝까지 가는 거예요.') +
    '</div></section>' +
    '<section class="section--tight">' + sectionHeader('함께하는 사람들');

  if (cohort.mine || cohort.joined > 0) {
    html += '<ul class="member-grid">' + MEMBERS.slice(0, 4).map(memberCard).join('') + '</ul>';
  } else {
    html += emptyBlock('fa-user-group', '아직 참여한 사람이 없어요', '첫 번째로 시작해도 66일은 같이 갑니다.');
  }
  html += '</section>';
  html += sampleNote('샘플 코호트와 가상 멤버예요. 실제 참여자 정보가 아닙니다.');
  html += '</main>' + stickyBar(cta);
  return html;
}

/* ══════════════════════════════════════════════════════
   6.5 오늘 인증 작성 / 6.7 인증 상세 (경로 분기)
   ══════════════════════════════════════════════════════ */
function screenCheckinRouter(param) {
  if (param) return screenCheckinDetail(param);
  return screenCompose();
}

function screenCompose() {
  const d = derived();
  const habit = habitById(Store.me.habitId);
  const date = dayToDate(d.day);
  const c = View.compose;

  if (c.done) {
    const todayDone = 18 + (d.todayChecked ? 1 : 0);
    return detailHeader('인증 완료') + '<main class="screen screen--bar content-container composer">' +
      '<div class="checkin-done">' +
        '<div class="checkin-done__icon">' + icon('fa-circle-check') + '</div>' +
        '<h1 class="checkin-done__title">' + d.day + '일차 인증을 남겼어요</h1>' +
        '<p class="checkin-done__desc">오늘 코호트 ' + todayDone + '명이 함께했어요. 연속 ' + d.streak + '일째예요.</p>' +
        '<div class="checkin-done__card">' +
          '<div class="stat-grid">' +
            statCard('연속', d.streak, '일') +
            statCard('채운 날', d.filled, '일', '66일 중') +
            statCard('남은 날', d.remaining, '일') +
          '</div>' +
        '</div>' +
      '</div></main>' +
      stickyBar([
        button('홈으로 돌아가기', { variant: 'secondary', href: '#/home' }),
        button('코호트 피드 보기', { href: '#/feed' })
      ]);
  }

  if (d.todayChecked) {
    return detailHeader('오늘 인증') + '<main class="screen screen--nav content-container">' +
      '<h1 class="sr-only">오늘 인증</h1>' +
      '<div style="margin-top:32px">' +
      emptyBlock('fa-circle-check', '오늘 인증은 이미 남겼어요',
        '내용을 고치려면 기록에서 확인하세요.', { label: '기록 보기', href: '#/record' }) +
      '</div></main>' + bottomNav('home');
  }

  const choices = PHOTO_CHOICES[habit.id] || PHOTO_CHOICES.reading;
  const isReturn = d.state === 'dormant';
  const isBroken = d.state === 'broken';

  let banner;
  if (isReturn) {
    banner = { icon: 'fa-rotate-right', text: '8일 만이에요. 이번 인증부터 다시 1일차로 이어집니다.' };
  } else if (isBroken) {
    banner = { icon: 'fa-circle-info', text: '어제는 인증이 없었어요. 오늘 남기면 연속 기록이 1일부터 다시 시작돼요.' };
  } else {
    banner = { icon: 'fa-circle-info', text: '오늘 ' + formatDate(date) + ' 인증이에요. 마감은 내일 새벽 4시입니다.' };
  }

  const remaining = 40 - c.text.length;

  return detailHeader('오늘 인증') + '<main class="screen screen--bar content-container composer">' +
    '<h1 class="sr-only">오늘 인증 남기기</h1>' +
    '<div class="composer__day">' +
      '<span class="num num--hero">D+' + d.day + '</span>' +
      '<span class="composer__date">' + esc(formatFullDate(date)) + ' · ' + esc(habit.name) + '</span>' +
    '</div>' +
    '<p class="composer__banner">' + icon(banner.icon) + '<span>' + esc(banner.text) + '</span></p>' +

    '<section class="section--tight">' + sectionHeader('사진 고르기') +
      '<p class="meta">샘플 사진 중에서 고릅니다. 고르지 않으면 간단 인증으로 남아요.</p>' +
      '<div class="photo-grid">' + choices.map(function (key) {
        return '<button type="button" class="photo-option" data-action="pick-photo" data-id="' + key + '"' +
          ' aria-pressed="' + (c.photo === key) + '" aria-label="' + esc(IMAGES[key].alt) + ' 선택">' +
          media(key, { alt: '', w: 110, h: 110 }) +
          '<span class="photo-option__check">' + icon('fa-check') + '</span></button>';
      }).join('') + '</div>' +
      (c.photo ? '<div class="photo-preview">' + media(c.photo, { w: 394, h: 250 }) + '</div>' +
        '<div style="margin-top:8px">' + button('선택 해제', { variant: 'text', action: 'clear-photo', block: false }) + '</div>' : '') +
    '</section>' +

    '<section class="section--tight">' + sectionHeader('한 줄 남기기') +
      '<div class="oneline' + (c.error ? ' oneline--error' : '') + '">' +
        '<input type="text" id="compose-text" maxlength="60" value="' + esc(c.text) + '"' +
        ' placeholder="오늘 무엇을 했는지 한 줄로 남겨보세요" aria-label="오늘의 한 줄">' +
        '<span class="oneline__count">' + remaining + '</span>' +
      '</div>' +
      (c.error ? '<p class="error-inline">' + icon('fa-circle-exclamation') + '<span>' + esc(c.error) + '</span></p>' : '') +
    '</section>' +

    '<section class="section--tight">' + sectionHeader('공개 범위') +
      '<div class="scope-row">' +
        '<span><span class="body">' + (c.isPrivate ? '나만 보기' : '코호트에 공개') + '</span>' +
        '<span class="scope-row__desc">' + (c.isPrivate ? '피드에는 안 보이고 기록과 순위에는 들어가요' : '우리 코호트 30명이 볼 수 있어요') + '</span></span>' +
        '<button type="button" class="toggle" role="switch" data-action="toggle-scope"' +
        ' aria-checked="' + (!c.isPrivate) + '" aria-label="코호트에 공개"></button>' +
      '</div>' +
    '</section>' +

    sampleNote('사진은 샘플 이미지 중에서 고릅니다. 실제 촬영과 업로드는 이 데모에 없어요.') +
    '</main>' +
    stickyBar([button(c.submitting ? '남기는 중' : '인증 남기기',
      { action: 'submit-checkin', disabled: c.submitting, icon: c.submitting ? null : 'fa-pen-to-square' })]);
}

/* ══════════════════════════════════════════════════════
   6.7 인증 상세
   ══════════════════════════════════════════════════════ */
function screenCheckinDetail(id) {
  const c = checkinById(id);
  if (!c) {
    return detailHeader('인증') + '<main class="screen screen--nav content-container">' +
      '<h1 class="sr-only">인증을 찾을 수 없어요</h1><div style="margin-top:32px">' +
      emptyBlock('fa-circle-exclamation', '찾는 인증이 없어요', '피드에서 다시 골라주세요.',
        { label: '피드로 가기', href: '#/feed' }) + '</div></main>' + bottomNav('feed');
  }

  const mine = !c.memberId;
  const m = mine ? { name: Store.me.nickname, avatar: 'reading', streak: derived().streak } : memberById(c.memberId);
  const cheered = isCheered(c.id);
  const saved = isSaved(c.id);
  const reported = isReported(c.id);

  const badges = [];
  if (c.late) badges.push(statusBadge('late'));
  if (c.simple) badges.push(statusBadge('simple'));
  if (c.returning) badges.push(statusBadge('return'));
  if (c.isPrivate) badges.push(statusBadge('private'));
  if (reported) badges.push(statusBadge('reported'));

  let hint = '';
  if (c.late) hint = '새벽에 남긴 인증이에요. 연속 기록은 이어졌어요.';
  else if (c.returning) hint = '8일 만에 돌아온 인증이에요.';

  const others = FEED_CHECKINS.filter(function (x) { return x.id !== c.id; }).slice(0, 2);

  const mediaBlock = (c.simple || !c.photo)
    ? '<p class="post__simple" style="margin-inline:0">' + esc(c.text) + '</p>'
    : '<div class="checkin-media">' + media(c.photo, { eager: true, alt: m.name + ' 님이 남긴 인증 사진', w: 430, h: 336 }) + '</div>';

  let html = detailHeader('인증', { action: { name: 'share', icon: 'fa-share-nodes', label: '공유하기' } }) +
    '<main class="screen screen--bar">' +
    (c.simple || !c.photo ? '<div class="content-container" style="margin-top:24px">' + mediaBlock + '</div>' : mediaBlock) +
    '<div class="content-container">' +
      '<div class="post__head" style="padding-inline:0">' +
        media(m.avatar, { alt: '', className: 'avatar-sm', w: 44, h: 44 }) +
        '<div><h1 class="post__name">' + esc(m.name) + '</h1>' +
        '<p class="post__meta">' + (mine ? esc(formatDate(c.date)) : '오늘 ' + esc(c.time)) +
          ' · D+' + c.day + ' · 스트릭 ' + m.streak + '</p></div>' +
      '</div>' +
      (badges.length ? '<div class="post__badges">' + badges.join('') + '</div>' : '') +
      (c.simple || !c.photo ? '' : '<p class="post__text">' + esc(c.text) + '</p>') +
      (hint ? '<p class="meta" style="margin-top:8px">' + esc(hint) + '</p>' : '') +
      '<div class="post__actions">' +
        '<button type="button" class="post__action" data-action="cheer" data-id="' + esc(c.id) + '" aria-pressed="' + cheered + '">' +
          (cheered ? icon('fa-heart') : iconOutline('fa-heart')) + '<span>응원 ' + ((c.cheers || 0) + (cheered ? 1 : 0)) + '</span></button>' +
        '<button type="button" class="post__action" data-action="save" data-id="' + esc(c.id) + '" aria-pressed="' + saved + '">' +
          (saved ? icon('fa-bookmark') : iconOutline('fa-bookmark')) + '<span>' + (saved ? '저장함' : '저장') + '</span></button>' +
        (mine ? '' : '<button type="button" class="post__action post__action--link" data-action="report" data-id="' + esc(c.id) + '"' +
          (reported ? ' disabled' : '') + '>' + icon('fa-flag') + '<span>' + (reported ? '신고 접수됨' : '신고') + '</span></button>') +
      '</div>' +
      '<section class="section--tight">' + sectionHeader('같은 날 다른 인증');
  if (others.length) {
    html += '<div class="slider">' + others.map(storyCard).join('') + '</div>';
  } else {
    html += '<p class="meta">이 날은 이 인증 하나예요.</p>';
  }
  html += '</section>' + sampleNote('가상 멤버가 남긴 샘플 인증이에요.') + '</div></main>' +
    stickyBar([button(cheered ? '응원 취소' : '응원 보내기',
      { action: 'cheer', id: c.id, variant: cheered ? 'secondary' : 'primary', icon: 'fa-heart' })]);
  return html;
}

/* ══════════════════════════════════════════════════════
   6.6 코호트 피드
   ══════════════════════════════════════════════════════ */
const FEED_FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'today', label: '오늘' },
  { id: 'noLate', label: '늦은 인증 제외' },
  { id: 'photo', label: '사진 인증만' }
];

function screenFeed() {
  const f = Store.settings.feedFilter;
  let list = FEED_CHECKINS.slice();
  if (f === 'noLate') list = list.filter(function (c) { return !c.late; });
  else if (f === 'photo') list = list.filter(function (c) { return !c.simple; });

  let html = appHeader() + '<main class="screen screen--nav">' +
    '<div class="content-container"><h1 class="sr-only">코호트 피드</h1>' +
    '<div style="margin-top:20px">' + chipRow(FEED_FILTERS, f, 'feed-filter', true) + '</div>' +
    '<section class="section--tight">' + sectionHeader('오늘 인증한 사람들') +
      '<div class="slider">' + FEED_CHECKINS.slice(0, 5).map(storyCard).join('') + '</div>' +
    '</section></div>';

  if (!list.length) {
    html += '<div class="content-container" style="margin-top:32px">' +
      emptyBlock('fa-layer-group', '이 조건에 맞는 인증이 없어요',
        '전체로 보면 오늘 인증 ' + FEED_CHECKINS.length + '개가 있어요.',
        { label: '전체 보기', action: 'feed-reset' }) + '</div>';
  } else {
    html += '<div style="margin-top:48px">' + list.slice(0, 2).map(checkinPost).join('') + '</div>' +
      '<section class="section content-container">' + sectionHeader('같이 하는 사람들', { href: '#/ranking', label: '순위 보기' }) +
        '<ul class="member-grid">' + MEMBERS.slice(0, 2).map(memberCard).join('') + '</ul></section>' +
      '<div style="margin-top:48px">' + list.slice(2).map(checkinPost).join('') + '</div>';
  }

  html += '<div class="content-container">' + sampleNote('가상 멤버가 남긴 샘플 인증이에요. 응원과 저장만 실제로 동작합니다.') + '</div>';
  html += '</main>' + bottomNav('feed');
  return html;
}

/* ══════════════════════════════════════════════════════
   6.8 기록
   ══════════════════════════════════════════════════════ */
const RECORD_FILTERS = [
  { id: 'mine', label: '내 인증' },
  { id: 'saved', label: '저장한 인증' },
  { id: 'badge', label: '배지' }
];

function screenRecord() {
  const d = derived();
  const f = Store.settings.recordFilter;
  const list = myCheckins();

  let html = appHeader() + '<main class="screen screen--nav content-container">' +
    '<h1 class="sr-only">기록</h1>' +
    '<section style="margin-top:27px">' +
      '<h2 class="section-title">66일 중 ' + d.filled + '일을 채웠어요</h2>' +
      '<p class="meta" style="margin-top:6px">' +
        (d.todayChecked ? '오늘 칸까지 채웠어요.' : '오늘 인증하면 ' + (d.filled + 1) + '칸이 돼요.') + '</p>' +
      progressGrid() + progressLegend();

  if (!d.todayChecked && !Store.me.graduated) {
    html += '<div style="margin-top:16px">' + button('인증 남기기', { action: 'go-checkin', icon: 'fa-pen-to-square' }) + '</div>';
  }
  html += '</section>';

  html += '<section class="section--tight" style="margin-top:32px"><div class="stat-grid">' +
    statCard('현재 연속', d.streak, '일') +
    statCard('채운 날', d.filled, '일', '인증 ' + d.checkins + ' · 면제권 ' + d.passes) +
    statCard('남은 면제권', d.passesLeft, '회', '3회 중') +
    '</div></section>';

  html += '<section class="section--tight"><div class="metric-card">' +
    '<h2 class="card-title">9월 기록</h2>' +
    '<div class="metric-grid">' +
      metricItem('인증 일수', septCount('checkin')) +
      metricItem('늦은 인증', septCount('late')) +
      metricItem('간단 인증', septCount('simple')) +
      metricItem('면제권 사용', septCount('pass')) +
      metricItem('나만 보기', septCount('private')) +
      metricItem('받은 응원', 34) +
    '</div></div></section>';

  html += '<section class="section--tight">' + chipRow(RECORD_FILTERS, f, 'record-filter', true) + '</section>';

  if (f === 'mine') {
    html += '<section class="section--tight">';
    if (list.length) {
      html += '<ul class="stack stack--tight">' + list.map(function (c) {
        const badges = [];
        if (c.late) badges.push(statusBadge('late'));
        if (c.simple) badges.push(statusBadge('simple'));
        if (c.isPrivate) badges.push(statusBadge('private'));
        return '<li><a class="record-item" href="#/checkin/' + esc(c.id) + '">' +
          '<span class="record-item__day"><span class="num num--sm">' + c.day + '</span>' +
          '<span class="meta" style="display:block">일차</span></span>' +
          '<span><span class="record-item__text">' + esc(c.text) + '</span>' +
          (badges.length ? '<span class="record-item__badges">' + badges.join('') + '</span>' : '') +
          '</span></a></li>';
      }).join('') + '</ul>';
    } else {
      html += emptyBlock('fa-calendar-check', '아직 남긴 인증이 없어요', '오늘 첫 인증을 남겨보세요.',
        { label: '인증 남기기', action: 'go-checkin' });
    }
    html += '</section>';
  } else if (f === 'saved') {
    const saved = FEED_CHECKINS.filter(function (c) { return isSaved(c.id); });
    html += '<section class="section--tight">';
    if (saved.length) {
      html += '<div class="tile-grid">' + saved.map(function (c) {
        const m = memberById(c.memberId);
        if (c.simple) {
          return '<a class="tile" href="#/checkin/' + esc(c.id) + '"><span class="tile__text">' +
            '<span class="clamp-2">' + esc(c.text) + '</span>' +
            '<span class="num num--sm">' + esc(m.name) + '</span></span></a>';
        }
        return '<a class="tile" href="#/checkin/' + esc(c.id) + '">' +
          media(c.photo, { alt: m.name + ' 님의 인증 사진', w: 142, h: 142 }) +
          '<span class="scrim"></span><span class="tile__date num num--sm">D+' + c.day + '</span></a>';
      }).join('') + '</div>' +
      '<div style="margin-top:16px">' + button('저장 전체 해제', { variant: 'text', action: 'clear-saved', block: false }) + '</div>';
    } else {
      html += emptyBlock('fa-bookmark', '저장한 인증이 아직 없어요',
        '피드에서 마음에 남는 인증을 저장해 보세요.', { label: '피드 보기', href: '#/feed' });
    }
    html += '</section>';
  } else {
    const earned = earnedBadges();
    html += '<section class="section--tight"><ul class="badge-grid">' + BADGES.map(function (b) {
      const on = earned[b.id];
      return '<li class="badge-tile' + (on ? '' : ' badge-tile--locked') + '">' + icon(b.icon) +
        '<span class="badge-tile__name">' + esc(b.name) + '</span>' +
        '<span class="badge-tile__cond">' + esc(on ? b.cond : '아직') + '</span></li>';
    }).join('') + '</ul></section>';
  }

  html += sampleNote('내 인증은 이 브라우저에만 저장됩니다. 서버로 보내지 않아요.');
  html += '</main>' + bottomNav('record');
  return html;
}

function metricItem(label, value) {
  return '<div><span class="num num--sm">' + esc(value) + '</span>' +
    '<p class="metric-grid__label">' + esc(label) + '</p></div>';
}

function septCount(kind) {
  let n = 0;
  for (let d = 16; d <= Store.me.dayCount; d++) {
    const s = dayStatus(d);
    if (kind === 'checkin' && isCheckin(s)) n++;
    if (kind === 'late' && s === 'late') n++;
    if (kind === 'pass' && s === 'pass') n++;
    if (kind === 'simple' && isCheckin(s) && Store.simpleDays.indexOf(d) >= 0) n++;
    if (kind === 'private' && isCheckin(s) && Store.privateDays.indexOf(d) >= 0) n++;
  }
  return n;
}

/* ══════════════════════════════════════════════════════
   6.9 마이
   ══════════════════════════════════════════════════════ */
function screenMy() {
  const d = derived();
  const me = Store.me;
  const habit = habitById(me.habitId);
  const cohort = cohortById(me.cohortId);
  const earned = earnedBadges();
  const earnedCount = BADGES.filter(function (b) { return earned[b.id]; }).length;
  const demo = DEMO_STATES.filter(function (s) { return s.id === me.demoState; })[0] || DEMO_STATES[1];

  return appHeader() + '<main class="screen screen--nav content-container">' +
    '<h1 class="sr-only">마이</h1>' +
    '<section style="margin-top:27px"><div class="profile-head">' +
      media('reading', { alt: '', w: 64, h: 64 }) +
      '<div><p class="profile-head__name">' + esc(me.nickname) + '</p>' +
      // 코호트명에 이미 습관명이 들어 있으므로 겹쳐 쓰지 않는다
      '<p class="profile-head__meta">' + esc(cohort.name) + '<br>' + esc(habit.goal) +
        ' · ' + esc(formatFullDate(new Date(cohort.start + 'T00:00:00'))) + ' 시작</p></div>' +
    '</div></section>' +

    '<section class="section--tight"><div class="profile-stats">' +
      '<div class="profile-stats__row">' +
        ['채운 날 ' + d.filled, '현재 연속 ' + d.streak, '배지 ' + earnedCount].map(function (t) {
          const parts = t.split(' ');
          const val = parts.pop();
          return '<div class="profile-stats__item"><span class="num num--inline">' + val + '</span>' +
            '<p class="profile-stats__label">' + parts.join(' ') + '</p></div>';
        }).join('') +
      '</div>' +
      '<div class="profile-stats__divider"></div>' +
      '<p class="profile-stats__goal">66일 중 ' + d.filled + '일 완료 · ' + d.percent + '%</p>' +
      '<div class="progress-bar"><span class="progress-bar__fill" style="width:' + d.percent + '%"></span></div>' +
    '</div></section>' +

    '<section class="section--tight"><div class="shortcut-row">' +
      '<a class="shortcut" href="#/ranking">' + icon('fa-ranking-star') + '코호트 랭킹</a>' +
      '<a class="shortcut" href="#/record">' + icon('fa-award') + '배지</a>' +
      '<a class="shortcut" href="#/notice">' + icon('fa-bullhorn') + '공지</a>' +
    '</div></section>' +

    '<section class="section--tight">' + sectionHeader('내 배지') +
      '<ul class="badge-grid">' + BADGES.map(function (b) {
        const on = earned[b.id];
        return '<li class="badge-tile' + (on ? '' : ' badge-tile--locked') + '">' + icon(b.icon) +
          '<span class="badge-tile__name">' + esc(b.name) + '</span>' +
          '<span class="badge-tile__cond">' + esc(on ? b.cond : '아직') + '</span></li>';
      }).join('') + '</ul></section>' +

    '<section class="section--tight" style="margin-top:32px">' +
      '<div class="settings-group"><p class="settings-group__label">인증</p><div class="settings-card">' +
        '<button type="button" class="settings-row" data-action="pick-alarm">알림 시간' +
          '<span class="settings-row__value">' + esc(Store.settings.alarmHour) + icon('fa-chevron-right') + '</span></button>' +
        '<div class="settings-row settings-row--toggle"><span>공개 기본값<span class="scope-row__desc">' +
          (Store.settings.defaultScope === 'cohort' ? '코호트에 공개' : '나만 보기') + '</span></span>' +
          '<button type="button" class="toggle" role="switch" data-action="toggle-default-scope"' +
          ' aria-checked="' + (Store.settings.defaultScope === 'cohort') + '" aria-label="공개 기본값을 코호트 공개로"></button></div>' +
      '</div></div>' +

      '<div class="settings-group"><p class="settings-group__label">코호트</p><div class="settings-card">' +
        '<a class="settings-row" href="#/challenge/' + esc(cohort.id) + '">내 코호트' +
          '<span class="settings-row__value">' + esc(cohort.name) + icon('fa-chevron-right') + '</span></a>' +
        '<a class="settings-row" href="#/graduation">완주 미리보기' +
          '<span class="settings-row__value">' + icon('fa-chevron-right') + '</span></a>' +
      '</div></div>' +

      '<div class="settings-group"><p class="settings-group__label">데모</p><div class="settings-card">' +
        '<button type="button" class="settings-row" data-action="pick-demo">데모 상태 전환' +
          '<span class="settings-row__value">' + esc(demo.label) + icon('fa-chevron-right') + '</span></button>' +
        '<button type="button" class="settings-row" data-action="restart-onboarding">온보딩 다시 보기' +
          '<span class="settings-row__value">' + icon('fa-chevron-right') + '</span></button>' +
        '<button type="button" class="settings-row settings-row--danger" data-action="reset-data">저장 데이터 초기화' +
          '<span class="settings-row__value">' + icon('fa-chevron-right') + '</span></button>' +
      '</div></div>' +
    '</section>' +

    sampleNote('샘플 데이터로 만든 데모입니다. 로그인과 실제 알림은 없어요.') +
    '</main>' + bottomNav('my');
}

/* ══════════════════════════════════════════════════════
   6.10 코호트 랭킹
   ══════════════════════════════════════════════════════ */
function screenRanking() {
  const d = derived();
  const rows = ranking();
  const meRow = rows.filter(function (r) { return r.me; })[0];
  const todayDone = 18 + (d.todayChecked ? 1 : 0);
  const pace = rows.filter(function (r) { return r.total >= 18; }).length + 12;
  const avg = Math.round(rows.reduce(function (s, r) { return s + r.total; }, 0) / rows.length);

  return detailHeader('코호트 현황') + '<main class="screen screen--nav content-container">' +
    '<h1 class="sr-only">코호트 현황과 순위</h1>' +
    '<section style="margin-top:27px"><div class="rank-summary">' +
      '<p class="cohort-today__figure"><span class="num num--stat">' + todayDone + '</span>' +
        '<span class="cohort-today__label">30명 중 오늘 인증 완료</span></p>' +
      '<div class="progress-bar"><span class="progress-bar__fill" style="width:' +
        Math.round((todayDone / 30) * 100) + '%"></span></div>' +
      '<p class="cohort-today__meta">늦은 인증 2명 · 휴면 1명 · 아직 ' + (30 - todayDone - 2) + '명</p>' +
    '</div></section>' +

    '<section class="section--tight"><div class="note-card">' +
      '<h2 class="note-card__title">' + pace + '명이 완주 페이스예요</h2>' +
      '<p class="note-card__body">평균 인증 ' + avg + '일 · 내 인증 ' + d.checkins + '일. ' +
        '순위는 실제 인증 일수로 매겨요. 같으면 연속 기록이 앞섭니다. ' +
        '면제권을 쓴 날은 연속 기록만 이어지고 인증 수에는 들어가지 않아요.</p>' +
    '</div></section>' +

    '<section class="section--tight"><div class="note-card" style="border-left-color:var(--color-accent)">' +
      '<h2 class="note-card__title">내 위치</h2>' +
      '<p class="note-card__body">' + d.checkins + '일 인증 · ' + meRow.rank + '위 · 완주까지 ' + d.remaining + '일</p>' +
    '</div></section>' +

    '<section class="section--tight">' + sectionHeader('코호트 순위') +
      '<ul class="stack stack--tight">' + rows.map(function (r) {
        let badge = '';
        if (r.me) badge = '<span class="badge badge--me">나</span>';
        else if (r.state === 'dormant') badge = statusBadge('dormant');
        else if (r.state === 'late') badge = statusBadge('late', '늦은 인증 2회');
        else if (r.state === 'return') badge = statusBadge('return', '복귀');
        const target = r.me ? null : (FEED_CHECKINS.filter(function (c) { return c.memberId === r.id; })[0] || null);
        const tag = target ? 'a' : 'div';
        const href = target ? ' href="#/checkin/' + esc(target.id) + '"' : '';
        return '<li><' + tag + ' class="rank-item' + (r.me ? ' rank-item--me' : '') + '"' + href +
          ' style="text-decoration:none">' +
          '<span class="rank-item__no">' + r.rank + '</span>' +
          media(r.avatar, { alt: '', className: 'avatar-sm', w: 44, h: 44 }) +
          '<span><span class="rank-item__name">' + esc(r.name) + '</span>' +
          '<span class="rank-item__meta">연속 ' + r.streak + '일</span>' + (badge ? ' ' + badge : '') + '</span>' +
          '<span class="rank-item__value"><span class="num num--sm">' + r.total + '</span>' +
          '<span class="rank-item__unit">일</span></span>' +
          '</' + tag + '></li>';
      }).join('') + '</ul></section>' +

    '<p class="sample-note">' + icon('fa-circle-info') +
      '<span>순위보다 66일을 끝까지 가는 게 목표예요. 휴면 중인 사람도 목록에 남습니다. 가상 멤버 기준 샘플입니다.</span></p>' +
    '</main>' + bottomNav('ranking');
}

/* ══════════════════════════════════════════════════════
   6.11 공지
   ══════════════════════════════════════════════════════ */
function screenNotice() {
  let html = detailHeader('공지') + '<main class="screen screen--nav content-container">' +
    '<h1 class="sr-only">공지</h1><section style="margin-top:27px">';

  if (!NOTICES.length) {
    html += emptyBlock('fa-bullhorn', '아직 올라온 공지가 없어요', '코호트 소식이 생기면 여기에 표시돼요.');
  } else {
    html += '<ul class="stack">' + NOTICES.map(function (n) {
      let item = noticeCard(n);
      if (View.openNotice === n.id) {
        item += '<li style="margin-top:-4px">' + noteCard('', n.body).replace('<h3 class="note-card__title"></h3>', '') +
          '<div style="margin-top:8px;display:flex;gap:8px">' +
          (n.cohortId ? button('코호트 보기', { variant: 'secondary', compact: true, block: false, href: '#/challenge/' + n.cohortId }) : '') +
          button('접기', { variant: 'text', compact: true, block: false, action: 'notice-close' }) +
          '</div></li>';
      }
      return item;
    }).join('') + '</ul>';
  }

  html += '</section>' + sampleNote('운영 공지 샘플이에요. 실제 모임과 졸업식은 열리지 않습니다.') +
    '</main>' + bottomNav('home');
  return html;
}

/* ══════════════════════════════════════════════════════
   6.12 졸업
   ══════════════════════════════════════════════════════ */
const TIMELINE = [
  { step: '1일',  title: '시작',              desc: '8월 17일, 30명이 같은 날 시작했어요' },
  { step: '7일',  title: '첫 배지',           desc: '일주일을 한 번도 빠지지 않았어요' },
  { step: '21일', title: '습관이 붙기 시작',  desc: '21일 연속 배지를 받았어요' },
  { step: '33일', title: '반환점',            desc: '절반을 넘었어요' },
  { step: '50일', title: '50일',              desc: '남은 16일이 가장 짧게 느껴지는 구간이에요' },
  { step: '66일', title: '완주',              desc: '10월 21일, 22명이 함께 끝냈어요' }
];

function screenGraduation() {
  const d = derived();
  const preview = !Store.me.graduated;
  const next = [
    { kind: '같은 습관 재도전', cohort: cohortById('c-reading-1102'), image: 'reading' },
    { kind: '새 습관', cohort: cohortById('c-journal-1102'), image: 'journal' }
  ];
  const saved = FEED_CHECKINS.filter(function (c) { return isSaved(c.id); }).slice(0, 3);

  let html = detailHeader('66일 완주', { action: { name: 'share', icon: 'fa-share-nodes', label: '공유하기' } }) +
    '<main class="screen screen--bar content-container">';

  if (preview) {
    html += '<p class="composer__banner" style="margin-top:20px">' + icon('fa-circle-info') +
      '<span>완주 화면 미리보기예요. 실제 완주는 66일차 인증 후에 열려요.</span></p>';
  }

  html += '<section style="margin-top:24px">' +
    '<div class="badge-card">' + media('graduation', { eager: true, alt: '66일 완주를 기념하는 책상 사진', w: 394, h: 250 }) +
      '<span class="scrim"></span>' +
      '<span class="badge-card__body"><span class="badge-card__name">66일 완주</span>' +
      '<span class="badge-card__cond">2026년 8월 17일부터 10월 21일까지</span></span>' +
    '</div></section>' +

    '<section class="section--tight">' +
      '<h1 class="section-title">66일을 다 채웠어요</h1>' +
      '<p class="secondary-text" style="margin-top:8px">8월 17일에 시작해 10월 21일에 끝냈어요. ' +
        '같이 시작한 30명 중 22명이 함께 완주했어요.</p>' +
      '<p style="margin-top:20px"><span class="num num--count" style="color:var(--color-brand-primary)">66</span>' +
        '<span class="hero__num-unit" style="color:var(--color-text-muted)">일 중 ' +
        (Store.me.graduated ? d.checkins : 62) + '일 인증</span></p>' +
      '<div class="stat-grid" style="margin-top:20px">' +
        statCard('최장 연속', Store.me.graduated ? d.bestStreak : 34, '일') +
        statCard('늦은 인증', Store.me.graduated ? d.lates : 5, '일') +
        statCard('면제권 사용', Store.me.graduated ? d.passes : 3, '회') +
      '</div>' +
    '</section>' +

    '<section class="section--tight">' + sectionHeader('66일의 흐름') +
      '<div class="timeline">' + TIMELINE.map(function (t, i) {
        const on = i === TIMELINE.length - 1;
        return '<div class="timeline__item' + (on ? ' timeline__item--on' : '') + '">' +
          '<span class="timeline__dot"></span>' +
          '<p class="timeline__step">' + esc(t.step) + (on ? ' · 진행 중' : '') + '</p>' +
          '<p class="timeline__title">' + esc(t.title) + '</p>' +
          '<p class="timeline__desc">' + esc(t.desc) + '</p></div>';
      }).join('') + '</div>' +
    '</section>';

  html += '<section class="section--tight">' + sectionHeader('기억에 남은 인증');
  if (saved.length) {
    html += '<div class="slider">' + saved.map(storyCard).join('') + '</div>';
  } else {
    html += '<p class="meta">저장한 인증이 없어 대표 인증을 고르지 못했어요.</p>';
  }
  html += '</section>';

  html += '<section class="section--tight">' + sectionHeader('다음 코호트') +
    '<div class="next-row">' + next.map(function (n) {
      const start = new Date(n.cohort.start + 'T00:00:00');
      return '<div class="next-card">' + media(n.image, { alt: '', w: 180, h: 110 }) +
        '<div class="next-card__body">' +
          '<p class="next-card__kind">' + esc(n.kind) + '</p>' +
          '<p class="next-card__name clamp-2">' + esc(n.cohort.name) + '</p>' +
          '<p class="next-card__date">' + esc(formatDate(start)) + ' 시작</p>' +
        '</div>' +
        '<div class="next-card__foot">' + button('예약하기', { variant: 'primary', compact: true, action: 'reserve', id: n.cohort.id }) + '</div>' +
      '</div>';
    }).join('') + '</div></section>';

  html += sampleNote('완주 기록은 데모 값이에요. 이미지 저장과 공유는 동작하지 않습니다.');
  html += '</main>' + stickyBar([
    button('기록 다시 보기', { variant: 'secondary', href: '#/record' }),
    button('다음 코호트 찾기', { href: '#/discover' })
  ]);
  return html;
}

function screenNotFound() {
  return detailHeader('화면 없음') + '<main class="screen screen--nav content-container">' +
    '<h1 class="sr-only">화면을 찾을 수 없어요</h1><div style="margin-top:32px">' +
    emptyBlock('fa-circle-exclamation', '찾는 화면이 없어요', '홈으로 돌아가서 다시 시작해 보세요.',
      { label: '홈으로 가기', href: '#/home' }) + '</div></main>' + bottomNav('home');
}

/* ══════════════════════════════════════════════════════
   입력 바인딩
   ══════════════════════════════════════════════════════ */
let searchTimer = null;

function bindScreenInputs() {
  const q = document.getElementById('discover-q');
  if (q) {
    q.addEventListener('input', function () {
      clearTimeout(searchTimer);
      const val = q.value;
      searchTimer = setTimeout(function () {
        Store.settings.discover.q = val;
        saveStore();
        const pos = q.selectionStart;
        render();
        const next = document.getElementById('discover-q');
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      }, 250);
    });
  }

  const t = document.getElementById('compose-text');
  if (t) {
    t.addEventListener('input', function () {
      View.compose.text = t.value;
      const left = 40 - t.value.length;
      const box = t.closest('.oneline');
      const counter = box.querySelector('.oneline__count');
      counter.textContent = left;
      if (t.value.length > 40) {
        box.classList.add('oneline--error');
        View.compose.error = '40자까지만 쓸 수 있어요. ' + (t.value.length - 40) + '자를 줄여주세요.';
      } else {
        box.classList.remove('oneline--error');
        View.compose.error = '';
      }
    });
  }
}

/* ══════════════════════════════════════════════════════
   행동 처리
   ══════════════════════════════════════════════════════ */
const ACTIONS = {
  back: function () { history.back(); },

  'overlay-backdrop': function (el, e) {
    if (e.target === el) closeOverlay();
  },

  'toast-undo': function () {
    if (View.undo) { View.undo(); View.undo = null; }
    toastLayer.innerHTML = '';
  },

  share: function () { toast('공유 기능은 이 데모에 없어요.'); },

  /* 온보딩 */
  'pick-habit': function (el) {
    View.onboardHabit = el.dataset.id;
    render();
  },
  'onboard-next': function () {
    if (View.onboardStep === 1) {
      const habitId = View.onboardHabit || 'reading';
      Store.me.habitId = habitId;
      // 고른 습관의 진행 중 코호트를 함께 배정한다. 둘이 어긋나면 안 된다.
      Store.me.cohortId = runningCohortFor(habitId).id;
      View.onboardStep = 2;
      render();
    } else if (View.onboardStep === 2) {
      View.onboardStep = 3;
      render();
    } else {
      Store.me.onboarded = true;
      saveStore();
      View.onboardStep = 1;
      go('#/checkin');
    }
  },
  'onboard-skip': function () {
    Store.me.onboarded = true;
    Store.me.habitId = Store.me.habitId || 'reading';
    Store.me.cohortId = runningCohortFor(Store.me.habitId).id;
    saveStore();
    View.onboardStep = 1;
    go('#/home');
  },

  /* 홈 */
  'go-checkin': function () {
    View.compose = { photo: null, text: '', isPrivate: Store.settings.defaultScope === 'private', done: false, submitting: false, error: '' };
    go('#/checkin');
  },
  'use-pass': function () {
    const d = derived();
    confirmModal({
      title: '면제권을 쓸까요?',
      desc: '면제권을 쓰면 연속 기록은 이어지고, 남은 면제권은 ' + (d.passesLeft - 1) + '회예요.',
      primary: { label: '면제권 쓰기', action: 'confirm-pass' },
      secondary: { label: '그냥 둘게요', action: 'close-overlay' }
    });
  },
  'confirm-pass': function () {
    const r = usePass();
    closeOverlay();
    if (!r.ok) {
      toast(r.reason === 'dormant' ? '휴면 상태에서는 면제권을 쓸 수 없어요.' : '지금은 면제권을 쓸 날이 없어요.');
      return;
    }
    const d = derived();
    render();
    toast(r.day + '일차에 면제권을 썼어요. 연속 ' + d.streak + '일이 이어집니다.');
  },
  'close-overlay': function () { closeOverlay(); },

  /* 인증 작성 */
  'pick-photo': function (el) {
    View.compose.photo = View.compose.photo === el.dataset.id ? null : el.dataset.id;
    render();
  },
  'clear-photo': function () { View.compose.photo = null; render(); },
  'toggle-scope': function () {
    View.compose.isPrivate = !View.compose.isPrivate;
    render();
  },
  'submit-checkin': function () {
    const c = View.compose;
    if (c.submitting) return;
    const text = (c.text || '').trim();
    if (!text) {
      c.error = '한 줄을 남겨야 인증할 수 있어요.';
      render();
      return;
    }
    if (text.length > 40) {
      c.error = '40자까지만 쓸 수 있어요. ' + (text.length - 40) + '자를 줄여주세요.';
      render();
      return;
    }
    c.submitting = true;
    render();
    setTimeout(function () {
      const r = addCheckin({ text: text, photo: c.photo, isPrivate: c.isPrivate, late: false });
      c.submitting = false;
      if (!r.ok) { toast('오늘 인증은 이미 남겼어요.'); go('#/home'); return; }
      c.done = true;
      render();
      liveRegion.textContent = r.day + '일차 인증을 남겼어요. 66칸이 한 칸 늘었습니다.';
      if (r.newBadges.length) {
        setTimeout(function () { toast('배지를 받았어요 — ' + r.newBadges[0].name); }, 600);
      }
    }, 300);
  },

  /* 피드 · 인증 상세 */
  cheer: function (el) {
    const id = el.dataset.id;
    const on = toggleIn(Store.cheers, id);
    render();
    const c = checkinById(id);
    const name = c && c.memberId ? memberById(c.memberId).name : '내';
    toast(on ? name + ' 님에게 응원을 보냈어요.' : '응원을 취소했어요.');
  },
  save: function (el) {
    const id = el.dataset.id;
    const on = toggleIn(Store.saved, id);
    render();
    if (on) toast('인증을 기록에 저장했어요.', function () { toggleIn(Store.saved, id); render(); });
    else toast('저장을 해제했어요.', function () { toggleIn(Store.saved, id); render(); });
  },
  'cheer-member': function (el) {
    const id = 'cheer-' + el.dataset.id;
    const on = toggleIn(Store.cheers, id);
    render();
    const m = memberById(el.dataset.id);
    toast(on ? m.name + ' 님에게 응원을 보냈어요.' : '응원을 취소했어요.');
  },
  report: function (el) {
    const id = el.dataset.id;
    openOverlay('<div class="modal">' +
      '<h2 class="modal__title">이 인증을 신고할까요?</h2>' +
      '<p class="modal__desc">운영진이 확인합니다. 신고한 사실은 작성자에게 알려지지 않아요.</p>' +
      '<div class="modal__actions">' +
        button('신고 접수하기', { variant: 'danger', action: 'confirm-report', id: id }) +
        button('그만둘게요', { variant: 'text', action: 'close-overlay' }) +
      '</div></div>');
  },
  'confirm-report': function (el) {
    Store.reports.push(el.dataset.id);
    saveStore();
    closeOverlay();
    render();
    toast('신고를 접수했어요. 확인까지 하루 정도 걸려요.');
  },

  /* 필터 */
  'feed-filter': function (el) { Store.settings.feedFilter = el.dataset.id; saveStore(); render(); },
  'feed-reset': function () { Store.settings.feedFilter = 'all'; saveStore(); render(); },
  'record-filter': function (el) { Store.settings.recordFilter = el.dataset.id; saveStore(); render(); },
  'clear-saved': function () {
    const backup = Store.saved.slice();
    Store.saved = [];
    saveStore();
    render();
    toast('저장한 인증을 모두 해제했어요.', function () { Store.saved = backup; saveStore(); render(); });
  },

  'discover-habit': function (el) { Store.settings.discover.habit = el.dataset.id; saveStore(); render(); },
  'discover-sort': function (el) { Store.settings.discover.sort = el.dataset.id; saveStore(); render(); },
  'discover-cond': function (el) {
    const conds = Store.settings.discover.conds;
    const i = conds.indexOf(el.dataset.id);
    if (i >= 0) conds.splice(i, 1); else conds.push(el.dataset.id);
    saveStore(); render();
  },
  'discover-reset': function () {
    Store.settings.discover = { q: '', habit: 'all', conds: [], sort: 'start' };
    saveStore(); render();
    toast('검색어와 조건을 모두 지웠어요.');
  },

  /* 챌린지 */
  'join-cohort': function (el) {
    const cohort = cohortById(el.dataset.id);
    const start = new Date(cohort.start + 'T00:00:00');
    const end = new Date(cohort.end + 'T00:00:00');
    const reserving = hasRunningCohort();
    confirmModal({
      title: reserving ? '다음 코호트로 예약할까요?' : '이 코호트로 66일을 시작할까요?',
      desc: reserving
        ? '지금 코호트를 끝낸 뒤 ' + formatFullDate(start) + '에 시작해요. 한 번에 하나의 코호트만 진행할 수 있어요.'
        : formatFullDate(start) + '에 시작해서 ' + formatFullDate(end) + '에 끝나요. 시작하면 코호트는 바꿀 수 없어요.',
      primary: { label: reserving ? '예약하기' : '참여하기', action: 'confirm-join' },
      secondary: { label: '조금 더 볼게요', action: 'close-overlay' }
    });
    View.joinTarget = cohort.id;
  },
  'confirm-join': function () {
    const cohort = cohortById(View.joinTarget);
    closeOverlay();
    if (hasRunningCohort()) {
      Store.me.nextCohortId = cohort.id;
      saveStore();
      render();
      toast(cohort.name + objectParticle(cohort.name) + ' 다음 코호트로 예약했어요.');
      return;
    }
    // 진행 중인 코호트가 없을 때만 실제로 배정한다.
    Store.me.cohortId = cohort.id;
    Store.me.habitId = cohort.habitId;
    Store.me.joinedAt = isoDate(new Date(DEMO_TODAY + 'T00:00:00'));
    Store.me.graduated = false;
    Store.me.nextCohortId = null;
    Store.me.dayCount = 1;
    Store.me.passesUsed = 0;
    Store.days = {};
    saveStore();
    render();
    toast(cohort.name + '에 참여했어요. 시작일에 첫 인증을 남기면 돼요.');
  },
  'cancel-reserve': function () {
    Store.me.nextCohortId = null;
    saveStore();
    render();
    toast('예약을 취소했어요.');
  },

  /* 공지 */
  'notice-open': function (el) {
    View.openNotice = View.openNotice === el.dataset.id ? null : el.dataset.id;
    markNoticeRead(el.dataset.id);
    render();
  },
  'notice-close': function () { View.openNotice = null; render(); },

  /* 마이 */
  'toggle-default-scope': function () {
    Store.settings.defaultScope = Store.settings.defaultScope === 'cohort' ? 'private' : 'cohort';
    saveStore(); render();
    toast('공개 기본값을 ' + (Store.settings.defaultScope === 'cohort' ? '코호트 공개' : '나만 보기') + '로 바꿨어요.');
  },
  'pick-alarm': function () {
    const hours = ['오전 6시', '오전 7시', '오전 8시', '오후 9시', '오후 10시'];
    openOverlay('<div class="sheet">' +
      '<h2 class="sheet__title">인증 알림 시간</h2>' +
      '<p class="sheet__desc">데모에서는 실제 알림이 오지 않아요. 설정값만 저장됩니다.</p>' +
      '<div class="sheet__list">' + hours.map(function (h) {
        return '<button type="button" class="sheet__option" data-action="set-alarm" data-id="' + h + '"' +
          ' aria-pressed="' + (Store.settings.alarmHour === h) + '">' + h + '</button>';
      }).join('') + '</div>' +
      '<div style="margin-top:16px">' + button('닫기', { variant: 'secondary', action: 'close-overlay' }) + '</div>' +
      '</div>', true);
  },
  'set-alarm': function (el) {
    Store.settings.alarmHour = el.dataset.id;
    saveStore(); closeOverlay(); render();
    toast('알림 시간을 ' + el.dataset.id + '로 바꿨어요.');
  },
  'pick-demo': function () {
    openOverlay('<div class="sheet">' +
      '<h2 class="sheet__title">데모 상태 전환</h2>' +
      '<p class="sheet__desc">데모용 기능이에요. 홈과 기록이 상태에 따라 어떻게 보이는지 확인할 수 있어요.</p>' +
      '<div class="sheet__list">' + DEMO_STATES.map(function (s) {
        return '<button type="button" class="sheet__option" data-action="set-demo" data-id="' + s.id + '"' +
          ' aria-pressed="' + (Store.me.demoState === s.id) + '"><span>' + s.label +
          '<span class="sheet__option-desc">' + s.desc + '</span></span>' + icon('fa-chevron-right') + '</button>';
      }).join('') + '</div>' +
      '<div style="margin-top:16px">' + button('닫기', { variant: 'secondary', action: 'close-overlay' }) + '</div>' +
      '</div>', true);
  },
  'set-demo': function (el) {
    applyDemoState(el.dataset.id);
    closeOverlay();
    const s = DEMO_STATES.filter(function (x) { return x.id === el.dataset.id; })[0];
    go('#/home');
    render();
    toast('데모 상태를 "' + s.label + '"으로 바꿨어요.');
  },
  'restart-onboarding': function () {
    Store.me.onboarded = false;
    View.onboardStep = 1;
    View.onboardHabit = Store.me.habitId;
    saveStore();
    go('#/onboarding');
  },
  'reset-data': function () {
    confirmModal({
      title: '저장한 기록을 모두 지울까요?',
      desc: '인증, 응원, 저장, 설정이 처음 상태로 돌아가요. 되돌릴 수 없어요.',
      primary: { label: '그대로 둘게요', action: 'close-overlay' },
      secondary: { label: '모두 지우기', action: 'confirm-reset' }
    });
  },
  'confirm-reset': function () {
    resetStore();
    closeOverlay();
    go('#/onboarding');
    render();
    toast('저장한 기록을 모두 지웠어요.');
  },

  reserve: function (el) {
    const c = cohortById(el.dataset.id);
    Store.me.nextCohortId = c.id;
    saveStore();
    render();
    toast(c.name + objectParticle(c.name) + ' 다음 코호트로 예약했어요.');
  }
};

document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const name = el.dataset.action;
  const fn = ACTIONS[name];
  if (!fn) return;
  if (el.tagName === 'BUTTON' && el.disabled) return;
  if (el.tagName === 'A' && !name.startsWith('overlay')) e.preventDefault();
  fn(el, e);
});

/* ── 시작 ────────────────────────────────────────────── */
loadStore();
if (storageBroken) {
  setTimeout(function () {
    toast('저장된 기록을 불러오지 못해 기본값으로 시작했어요.');
  }, 400);
}
if (!location.hash) location.replace(Store.me.onboarded ? '#/home' : '#/onboarding');
render();
