// 공통 헬퍼
const { expect } = require('@playwright/test');

/** 온보딩을 건너뛴 상태로 앱을 연다. */
async function openApp(page, hash = '#/home') {
  await page.addInitScript(() => {
    // 온보딩 완료 상태를 미리 심어 둔다. 나머지는 앱 기본값을 그대로 쓴다.
    // 이미 저장된 값이 있으면 덮어쓰지 않는다. 새로고침 후 상태 유지를 검증해야 하기 때문이다.
    try {
      if (!localStorage.getItem('sixtysix')) {
        localStorage.setItem('sixtysix', JSON.stringify({ version: 1, me: { onboarded: true } }));
      }
    } catch (e) { /* 저장소 없음 */ }
  });
  await page.goto('/index.html' + hash);
  await page.waitForFunction(() => typeof window.render === 'function' || document.querySelector('#app').children.length > 0);
  await page.waitForTimeout(120);
}

/** 데모 상태를 바꾸고 지정한 화면을 다시 그린다. */
async function setDemoState(page, id, hash = '#/home') {
  await page.evaluate(([s, h]) => {
    applyDemoState(s);
    location.hash = h;
    render();
  }, [id, hash]);
  await page.waitForTimeout(150);
}

async function gotoHash(page, hash) {
  await page.evaluate((h) => { location.hash = h; render(); }, hash);
  await page.waitForTimeout(150);
}

/** 앱의 파생 상태를 읽는다. */
function readState(page) {
  return page.evaluate(() => {
    const d = derived();
    return {
      state: d.state, day: d.day, streak: d.streak, filled: d.filled,
      checkins: d.checkins, passesLeft: d.passesLeft, remaining: d.remaining,
      todayChecked: d.todayChecked
    };
  });
}

/** 페이지 전체에 의도하지 않은 가로 스크롤이 없어야 한다. */
async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow, '페이지 전체 수평 스크롤이 발생했습니다').toBe(false);
}

/** 논리 화면마다 H1 은 하나여야 한다. */
async function expectSingleH1(page) {
  await expect(page.locator('#app h1')).toHaveCount(1);
}

/** BottomNavigation 과 StickyActionBar 는 동시에 보이면 안 된다. */
async function expectNoNavAndBarTogether(page) {
  const both = await page.evaluate(() =>
    document.querySelectorAll('.bottom-nav').length > 0 &&
    document.querySelectorAll('.sticky-bar').length > 0);
  expect(both, 'BottomNavigation 과 StickyActionBar 가 함께 보입니다').toBe(false);
}

/** 모든 터치 대상이 44px 이상이어야 한다. Chip·Compact·Toggle 은 투명 hit area 를 포함해 계산한다. */
async function expectTouchTargets(page) {
  const small = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#app a, #app button, #app [role="switch"]').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0) return;
      let w = b.width, h = b.height;
      if (el.matches('.chip, .btn--compact, .toggle')) { w = Math.max(w, 44); h = Math.max(h, 44); }
      if (w < 44 || h < 44) out.push((el.className || el.tagName) + ' ' + Math.round(w) + 'x' + Math.round(h));
    });
    return [...new Set(out)];
  });
  expect(small, '44px 미만 터치 대상').toEqual([]);
}

/** 아이콘만 있는 버튼에도 접근 가능한 이름이 있어야 한다. */
async function expectAccessibleNames(page) {
  const unnamed = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#app a, #app button').forEach((el) => {
      if (!el.textContent.trim() && !el.getAttribute('aria-label')) out.push(el.className || el.tagName);
    });
    return [...new Set(out)];
  });
  expect(unnamed, '접근 가능한 이름이 없는 컨트롤').toEqual([]);
}

/** 화면 하나에 대한 공통 구조 검사 */
async function expectScreenSane(page) {
  await expectSingleH1(page);
  await expectNoHorizontalScroll(page);
  await expectNoNavAndBarTogether(page);
  await expectTouchTargets(page);
  await expectAccessibleNames(page);
}

// 아직 생성하지 않은 이미지 10장의 404 는 별도 테스트(에셋 › 생성 이미지 10장이 실제로 존재한다)에서
// 다루므로 콘솔 오류 집계에서 제외한다. 이미지가 채워지면 이 항목은 자연히 사라진다.
const PENDING_ASSET = /assets\/images\/[\w-]+\.webp/;

/** 콘솔 오류를 수집한다. 미생성 이미지 404 는 제외한다. */
function collectConsoleErrors(page) {
  const errors = [];
  const keep = (text) => { if (!PENDING_ASSET.test(text)) errors.push(text); };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // 404 콘솔 메시지는 본문에 URL 이 없다. location 의 URL 로 판정한다.
    const loc = (m.location && m.location().url) || '';
    if (PENDING_ASSET.test(loc)) return;
    keep(m.text() + (loc ? ' @ ' + loc : ''));
  });
  page.on('pageerror', (e) => keep(String(e)));
  page.on('requestfailed', (r) => {
    const url = r.url();
    if (!PENDING_ASSET.test(url)) errors.push('요청 실패: ' + url);
  });
  return errors;
}

module.exports = {
  openApp, setDemoState, gotoHash, readState,
  expectNoHorizontalScroll, expectSingleH1, expectNoNavAndBarTogether,
  expectTouchTargets, expectAccessibleNames, expectScreenSane, collectConsoleErrors
};
