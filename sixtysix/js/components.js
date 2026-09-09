/* 육십육 — 컴포넌트 렌더러
   sixtysix-design-rull.md 6~12장 컴포넌트 계약을 HTML 문자열로 구현한다. */

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 이미지: aspect-ratio 는 컨테이너가 갖고, 실패 시 레이아웃을 유지한 대체 면을 보여준다 */
function media(key, opts) {
  opts = opts || {};
  const im = IMAGES[key];
  if (!im) return '<div class="media media--failed" aria-hidden="true"></div>';
  const alt = opts.alt !== undefined ? opts.alt : im.alt;
  const cls = 'media' + (opts.className ? ' ' + opts.className : '');
  const loading = opts.eager ? 'eager' : 'lazy';
  const pos = opts.position ? ' style="object-position:' + esc(opts.position) + '"' : '';
  return '<div class="' + cls + '">' +
    '<img src="' + esc(im.src) + '" alt="' + esc(alt) + '" loading="' + loading + '"' +
    ' width="' + (opts.w || 400) + '" height="' + (opts.h || 400) + '"' + pos +
    ' onerror="onImageFail(this)">' +
    '</div>';
}

function icon(name, extra) {
  return '<i class="fa-solid ' + name + '"' + (extra || ' aria-hidden="true"') + '></i>';
}

/* 눌림 상태를 색상만으로 구분하지 않기 위해 채운 아이콘과 빈 아이콘을 구분한다 */
function iconOutline(name) {
  return '<i class="fa-regular ' + name + '" aria-hidden="true"></i>';
}

/* ── 상태 배지 ───────────────────────────────────────── */
const BADGE_DEFS = {
  done:    { cls: 'badge--done',   icon: 'fa-circle-check',   label: '인증 완료' },
  late:    { cls: '',              icon: 'fa-moon',           label: '늦은 인증' },
  simple:  { cls: '',              icon: 'fa-align-left',     label: '간단 인증' },
  private: { cls: '',              icon: 'fa-lock',           label: '나만 보기' },
  return:  { cls: 'badge--return', icon: 'fa-rotate-right',   label: '복귀' },
  dormant: { cls: '',              icon: 'fa-pause',          label: '휴면' },
  pass:    { cls: 'badge--pass',   icon: 'fa-shield-halved',  label: '면제권' },
  reported:{ cls: '',              icon: 'fa-flag',           label: '신고 접수됨' }
};

function statusBadge(type, labelOverride) {
  const d = BADGE_DEFS[type];
  if (!d) return '';
  return '<span class="badge ' + d.cls + '">' + icon(d.icon) +
    esc(labelOverride || d.label) + '</span>';
}

function dayBadge(n) {
  return '<span class="badge badge--day">D+' + n + '</span>';
}

/* ── SectionHeader ───────────────────────────────────── */
function sectionHeader(title, more) {
  let right = '';
  if (more) {
    right = '<a class="section-header__more" href="' + esc(more.href) + '">' +
      esc(more.label || '전체 보기') + icon('fa-chevron-right') + '</a>';
  }
  return '<div class="section-header"><h2 class="section-title">' + esc(title) + '</h2>' + right + '</div>';
}

/* ── AppHeader / DetailHeader ────────────────────────── */
function appHeader() {
  return '<header class="app-header">' +
    '<span class="app-header__logo">육십육</span>' +
    '<div class="app-header__actions">' +
      '<a class="icon-btn" href="#/discover" aria-label="챌린지 찾기">' + icon('fa-magnifying-glass') + '</a>' +
      '<a class="icon-btn" href="#/notice" aria-label="공지 보기">' + icon('fa-bullhorn') + '</a>' +
    '</div></header>';
}

function detailHeader(title, opts) {
  opts = opts || {};
  const right = opts.action
    ? '<button type="button" class="icon-btn" data-action="' + esc(opts.action.name) + '" aria-label="' + esc(opts.action.label) + '">' + icon(opts.action.icon) + '</button>'
    : '<span></span>';
  return '<header class="detail-header">' +
    '<button type="button" class="icon-btn" data-action="back" aria-label="뒤로 가기">' + icon('fa-chevron-left') + '</button>' +
    '<p class="detail-header__title">' + esc(title) + '</p>' + right +
    '</header>';
}

/* ── BottomNavigation ────────────────────────────────── */
const NAV_TABS = [
  { href: '#/home',   icon: 'fa-house',           label: '홈',   match: ['home'] },
  { href: '#/feed',   icon: 'fa-layer-group',     label: '피드', match: ['feed'] },
  { href: '#/record', icon: 'fa-calendar-check',  label: '기록', match: ['record'] },
  { href: '#/my',     icon: 'fa-user',            label: '마이', match: ['my', 'ranking'] }
];

function bottomNav(active) {
  const items = NAV_TABS.map(function (t) {
    const on = t.match.indexOf(active) >= 0;
    return '<a class="bottom-nav__item" href="' + t.href + '"' +
      (on ? ' aria-current="page"' : '') + '>' + icon(t.icon) +
      '<span>' + t.label + '</span></a>';
  }).join('');
  return '<nav class="bottom-nav" aria-label="주요 화면">' + items + '</nav>';
}

function stickyBar(buttons) {
  return '<div class="sticky-bar">' + buttons.join('') + '</div>';
}

/* ── 버튼 ────────────────────────────────────────────── */
function button(label, opts) {
  opts = opts || {};
  const cls = 'btn btn--' + (opts.variant || 'primary') + (opts.block === false ? '' : ' btn--block') +
    (opts.compact ? ' btn--compact' : '');
  const attrs = [];
  if (opts.action) attrs.push('data-action="' + esc(opts.action) + '"');
  if (opts.id) attrs.push('data-id="' + esc(opts.id) + '"');
  if (opts.disabled) attrs.push('disabled');
  if (opts.pressed !== undefined) attrs.push('aria-pressed="' + opts.pressed + '"');
  const inner = (opts.icon ? icon(opts.icon) : '') + esc(label);
  if (opts.href) {
    return '<a class="' + cls + '" href="' + esc(opts.href) + '" ' + attrs.join(' ') + '>' + inner + '</a>';
  }
  return '<button type="button" class="' + cls + '" ' + attrs.join(' ') + '>' + inner + '</button>';
}

/* ── FilterChip ──────────────────────────────────────── */
function chipRow(items, activeId, action, bleed) {
  const chips = items.map(function (it) {
    return '<button type="button" class="chip" data-action="' + esc(action) + '" data-id="' + esc(it.id) + '"' +
      ' aria-pressed="' + (it.id === activeId) + '">' +
      (it.icon ? icon(it.icon) : '') + esc(it.label) + '</button>';
  }).join('');
  return '<div class="chip-row' + (bleed ? ' chip-row--bleed' : '') + '" role="group">' + chips + '</div>';
}

function multiChipRow(items, activeIds, action, bleed) {
  const chips = items.map(function (it) {
    return '<button type="button" class="chip" data-action="' + esc(action) + '" data-id="' + esc(it.id) + '"' +
      ' aria-pressed="' + (activeIds.indexOf(it.id) >= 0) + '">' + esc(it.label) + '</button>';
  }).join('');
  return '<div class="chip-row' + (bleed ? ' chip-row--bleed' : '') + '" role="group">' + chips + '</div>';
}

/* ── 세로형 카드 180×250 ─────────────────────────────── */
function storyCard(c) {
  const m = memberById(c.memberId);
  let flag;
  if (c.simple) flag = statusBadge('simple');
  else if (c.late) flag = statusBadge('late');
  else if (c.returning) flag = statusBadge('return');
  else flag = statusBadge('done');

  const body =
    '<span class="vcard__body">' +
      '<span class="vcard__title">' + esc(m.name) + '</span>' +
      '<span class="vcard__meta">D+' + c.day + ' · 스트릭 ' + m.streak + '</span>' +
    '</span>';

  // 간단 인증은 사진이 없다. 다른 사진으로 채우지 않고 남긴 한 줄을 그대로 보여준다.
  if (c.simple || !c.photo) {
    return '<a class="vcard vcard--text" href="#/checkin/' + esc(c.id) + '">' +
      '<span class="vcard__flag">' + flag + '</span>' +
      '<span class="vcard__quote">' + esc(c.text) + '</span>' +
      body + '</a>';
  }

  return '<a class="vcard" href="#/checkin/' + esc(c.id) + '">' +
    media(c.photo, { alt: m.name + ' 님이 남긴 인증 사진', w: 180, h: 250 }) +
    '<span class="scrim"></span>' +
    '<span class="vcard__flag">' + flag + '</span>' +
    body + '</a>';
}

function habitCard(cohort) {
  const h = habitById(cohort.habitId);
  const dd = daysUntil(cohort.start);
  const meta = dd > 0 ? ('D-' + dd + ' 시작 · ' + cohort.joined + '/' + cohort.capacity + '명')
                      : (cohort.joined + '/' + cohort.capacity + '명 참여 중');
  return '<a class="vcard" href="#/challenge/' + esc(cohort.id) + '">' +
    media(h.image, { alt: h.name + ' 코호트 이미지', w: 180, h: 250 }) +
    '<span class="scrim"></span>' +
    '<span class="vcard__body">' +
      '<span class="vcard__title">' + esc(cohort.name) + '</span><br>' +
      '<span class="vcard__meta">' + esc(meta) + '</span>' +
    '</span></a>';
}

/* ── 카운트다운 카드 250×320 ─────────────────────────── */
function countdownCard(cohort) {
  const h = habitById(cohort.habitId);
  const dd = daysUntil(cohort.start);
  const d = new Date(cohort.start + 'T00:00:00');
  return '<a class="ccard" href="#/challenge/' + esc(cohort.id) + '">' +
    media(h.image, { alt: h.name + ' 코호트 이미지', w: 250, h: 320 }) +
    '<span class="scrim"></span>' +
    '<span class="ccard__body">' +
      '<span class="num num--count ccard__dday">D-' + dd + '</span>' +
      '<span class="ccard__title" style="display:block;margin-top:8px">' + esc(cohort.name) + '</span>' +
      '<span class="ccard__meta">' + esc(formatDate(d)) + ' 시작 · ' + cohort.joined + '/' + cohort.capacity + '명</span>' +
    '</span></a>';
}

/* ── 가로형 카드 394×102 ─────────────────────────────── */
function cohortListCard(cohort) {
  const h = habitById(cohort.habitId);
  const dd = daysUntil(cohort.start);
  const full = cohort.joined >= cohort.capacity;
  const start = new Date(cohort.start + 'T00:00:00');
  const end = new Date(cohort.end + 'T00:00:00');
  const badges = [];
  if (cohort.mine) badges.push('<span class="badge badge--day">내 코호트</span>');
  else if (full) badges.push('<span class="badge">' + icon('fa-user-group') + '정원 마감</span>');
  else if (dd > 0) badges.push('<span class="badge badge--return">' + icon('fa-clock') + 'D-' + dd + '</span>');
  return '<li><a class="lcard" href="#/challenge/' + esc(cohort.id) + '">' +
    media(h.image, { alt: '', w: 78, h: 78 }) +
    '<span>' +
      '<span class="lcard__title clamp-1">' + esc(cohort.name) + '</span>' +
      '<span class="lcard__meta">' + esc(formatDate(start)) + ' ~ ' + esc(formatDate(end)) +
        ' · ' + cohort.joined + '/' + cohort.capacity + '명 · ' + esc(h.goal) + '</span>' +
      (badges.length ? '<span class="lcard__badges">' + badges.join('') + '</span>' : '') +
    '</span></a></li>';
}

function noticeCard(n) {
  const read = isNoticeRead(n.id);
  const d = new Date(n.date + 'T00:00:00');
  return '<li><button type="button" class="lcard' + (read ? ' lcard--read' : '') + '"' +
    ' data-action="notice-open" data-id="' + esc(n.id) + '" style="width:100%;text-align:left">' +
    media(n.image, { alt: '', w: 78, h: 78 }) +
    '<span>' +
      '<span class="lcard__title clamp-2">' + esc(n.title) + '</span>' +
      '<span class="lcard__meta">' + esc(n.category) + ' · ' + esc(formatDate(d)) +
        (read ? ' · 읽음' : '') + '</span>' +
    '</span></button></li>';
}

/* ── 멤버 아바타 ─────────────────────────────────────── */
function memberAvatar(m) {
  const dormant = m.state === 'dormant';
  return '<div class="avatar' + (dormant ? ' avatar--dormant' : '') + '">' +
    '<div class="avatar__ring' + (m.checkedToday ? ' avatar__ring--active' : '') + '">' +
      media(m.avatar, { alt: '', w: 68, h: 68 }) +
    '</div>' +
    '<span class="avatar__name">' + esc(m.name) + '</span>' +
    (dormant ? statusBadge('dormant') : '') +
    '</div>';
}

function memberCard(m) {
  let badge = '';
  if (m.state === 'dormant') badge = statusBadge('dormant');
  else if (m.state === 'late') badge = statusBadge('late', '늦은 인증 2회');
  else if (m.state === 'return') badge = statusBadge('return', '복귀 1회');
  else badge = statusBadge('done');
  const cheered = isCheered('cheer-' + m.id);
  return '<li class="mcard">' +
    media(m.avatar, { alt: '', w: 48, h: 48 }) +
    '<span class="mcard__name">' + esc(m.name) + '</span>' +
    '<span class="mcard__meta">D+' + m.day + ' · 스트릭 ' + m.streak + '</span>' +
    badge +
    '<button type="button" class="btn btn--outline btn--compact" data-action="cheer-member" data-id="' + esc(m.id) + '"' +
    ' aria-pressed="' + cheered + '">' + icon('fa-heart') + (cheered ? '응원함' : '응원 보내기') + '</button>' +
    '</li>';
}

/* ── 정보 카드 ───────────────────────────────────────── */
function infoCard(label, value, desc) {
  return '<div class="info-card">' +
    '<div class="info-card__label">' + esc(label) + '</div>' +
    '<div class="info-card__value">' + esc(value) + '</div>' +
    (desc ? '<div class="info-card__desc">' + esc(desc) + '</div>' : '') +
    '</div>';
}

function statCard(label, value, unit, desc) {
  return '<div class="stat-card">' +
    '<div class="stat-card__label">' + esc(label) + '</div>' +
    '<div class="stat-card__value"><span class="num num--inline">' + esc(value) + '</span>' +
      '<span class="stat-card__unit">' + esc(unit) + '</span></div>' +
    (desc ? '<div class="stat-card__desc">' + esc(desc) + '</div>' : '') +
    '</div>';
}

function noteCard(title, body) {
  return '<div class="note-card">' +
    '<h3 class="note-card__title">' + esc(title) + '</h3>' +
    '<p class="note-card__body">' + esc(body) + '</p></div>';
}

/* ── 상태 블록 ───────────────────────────────────────── */
function emptyBlock(iconName, title, desc, cta) {
  return '<div class="state-block">' +
    '<div class="state-block__icon">' + icon(iconName) + '</div>' +
    '<p class="state-block__title">' + esc(title) + '</p>' +
    '<p class="state-block__desc">' + esc(desc) + '</p>' +
    (cta ? button(cta.label, { variant: 'secondary', action: cta.action, href: cta.href, block: false }) : '') +
    '</div>';
}

function skeletonList(n, height) {
  let out = '<div class="stack" aria-hidden="true">';
  for (let i = 0; i < n; i++) out += '<div class="skeleton" style="height:' + height + 'px"></div>';
  return out + '</div>';
}

/* ── 66칸 진행판 ─────────────────────────────────────── */
function progressGrid() {
  const d = derived();
  let cells = '';
  for (let i = 1; i <= TOTAL_DAYS; i++) {
    const s = dayStatus(i);
    let cls = 'cell--future';
    if (s === 'done') cls = 'cell--done';
    else if (s === 'late') cls = 'cell--late';
    else if (s === 'pass') cls = 'cell--pass';
    else if (s === 'miss') cls = 'cell--miss';
    else if (i < d.day) cls = 'cell--miss';
    if (i === d.day) cls += ' cell--today';
    cells += '<span class="progress-grid__cell ' + cls + '"></span>';
  }
  const label = '66일 중 ' + d.filled + '일을 채웠습니다. 인증 ' + d.checkins + '일, 늦은 인증 ' + d.lates +
    '일 포함, 면제권 ' + d.passes + '일 사용, 미인증 ' + d.misses + '일, 오늘은 ' + d.day + '일차입니다.';
  return '<div class="progress-grid" role="img" aria-label="' + esc(label) + '">' + cells + '</div>';
}

function progressLegend() {
  const items = [
    { cls: 'cell--done', label: '인증 완료' },
    { cls: 'cell--late', label: '늦은 인증' },
    { cls: 'cell--pass', label: '면제권' },
    { cls: 'cell--miss', label: '아직' },
    { cls: 'cell--future', label: '남은 날' }
  ];
  return '<div class="legend">' + items.map(function (i) {
    return '<span class="legend__item"><span class="legend__swatch ' + i.cls + '"></span>' + i.label + '</span>';
  }).join('') + '</div>';
}

/* ── 피드 인증 카드 ──────────────────────────────────── */
function checkinPost(c) {
  const m = memberById(c.memberId);
  const cheered = isCheered(c.id);
  const saved = isSaved(c.id);
  const badges = [];
  if (c.late) badges.push(statusBadge('late'));
  if (c.simple) badges.push(statusBadge('simple'));
  if (c.returning) badges.push(statusBadge('return'));

  const mediaBlock = c.simple
    ? '<p class="post__simple">' + esc(c.text) + '</p>'
    : '<div class="post__media">' + media(c.photo, { alt: m.name + ' 님이 남긴 인증 사진', w: 430, h: 336 }) +
      '<span class="scrim"></span><span class="post__day num num--inline">D+' + c.day + '</span></div>';

  return '<article class="post">' +
    '<div class="post__head">' +
      media(m.avatar, { alt: '', className: 'avatar-sm', w: 44, h: 44 }) +
      '<div><p class="post__name">' + esc(m.name) + '</p>' +
      '<p class="post__meta">오늘 ' + esc(c.time) + ' · D+' + c.day + ' · 스트릭 ' + m.streak + '</p></div>' +
    '</div>' +
    mediaBlock +
    '<div class="post__body">' +
      (badges.length ? '<div class="post__badges">' + badges.join('') + '</div>' : '') +
      (c.simple ? '' : '<p class="post__text">' + esc(c.text) + '</p>') +
      '<div class="post__actions">' +
        '<button type="button" class="post__action" data-action="cheer" data-id="' + esc(c.id) + '" aria-pressed="' + cheered + '">' +
          (cheered ? icon('fa-heart') : iconOutline('fa-heart')) + '<span>응원 ' + (c.cheers + (cheered ? 1 : 0)) + '</span></button>' +
        '<button type="button" class="post__action" data-action="save" data-id="' + esc(c.id) + '" aria-pressed="' + saved + '">' +
          (saved ? icon('fa-bookmark') : iconOutline('fa-bookmark')) + '<span>' + (saved ? '저장함' : '저장') + '</span></button>' +
        '<a class="post__action post__action--link" href="#/checkin/' + esc(c.id) + '">자세히 보기' + icon('fa-chevron-right') + '</a>' +
      '</div>' +
    '</div></article>';
}

/* ── 샘플 데이터 고지 ────────────────────────────────── */
function sampleNote(text) {
  return '<p class="sample-note">' + icon('fa-circle-info') + '<span>' + esc(text) + '</span></p>';
}
