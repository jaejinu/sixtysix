// 레이아웃·접근성·에셋 회귀 테스트
// sixtysix-project.md 15.1 화면과 레이아웃, 15.3 에셋, 15.5 상태와 접근성
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

const ROUTES = [
  ['#/home', '홈'],
  ['#/feed', '피드'],
  ['#/record', '기록'],
  ['#/my', '마이'],
  ['#/discover', '챌린지 탐색'],
  ['#/challenge/c-running-0914', '챌린지 상세(모집 중)'],
  ['#/challenge/c-reading-0817', '챌린지 상세(내 코호트)'],
  ['#/checkin', '인증 작성'],
  ['#/checkin/fc-1', '인증 상세(사진)'],
  ['#/checkin/fc-2', '인증 상세(간단 인증)'],
  ['#/ranking', '코호트 랭킹'],
  ['#/notice', '공지'],
  ['#/graduation', '졸업']
];

test.describe('화면 구조', () => {
  for (const [hash, name] of ROUTES) {
    test(`${name} — 구조·접근성·수평 스크롤`, async ({ page }) => {
      const errors = H.collectConsoleErrors(page);
      await H.openApp(page, hash);
      await H.expectScreenSane(page);
      expect(errors, '콘솔 오류').toEqual([]);
    });
  }

  test('온보딩 3단계 — 구조·접근성', async ({ page }) => {
    await page.goto('/index.html');
    for (const step of [1, 2, 3]) {
      await page.evaluate((s) => { View.onboardStep = s; View.onboardHabit = 'reading'; render(); }, step);
      await page.waitForTimeout(120);
      await H.expectScreenSane(page);
    }
  });
});

test.describe('앱 셸과 고정 UI', () => {
  test('셸 폭과 콘텐츠 폭이 규정과 맞는다', async ({ page }, testInfo) => {
    await H.openApp(page);
    const box = await page.evaluate(() => {
      const shell = document.querySelector('.app-shell').getBoundingClientRect();
      const cont = document.querySelector('.content-container');
      const cs = getComputedStyle(cont);
      // 콘텐츠 폭은 좌우 패딩을 뺀 안쪽 폭이다.
      const inner = cont.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const pad = getComputedStyle(document.documentElement).getPropertyValue('--space-page-x').trim();
      return { shell: Math.round(shell.width), content: Math.round(inner), pad };
    });
    const vw = testInfo.project.use.viewport.width;
    expect(box.shell).toBe(Math.min(vw, 430));
    // 360px 구간은 좌우 16px, 390px 이상은 18px
    expect(box.pad).toBe(vw <= 389 ? '16px' : '18px');
    const expectedPad = vw <= 389 ? 32 : 36;
    expect(box.content).toBe(box.shell - expectedPad);
    // 430px 기준 화면에서 콘텐츠 폭은 394px 이어야 한다
    if (vw >= 430) expect(box.content).toBe(394);
  });

  test('BottomNavigation 이 콘텐츠를 가리지 않는다', async ({ page }) => {
    await H.openApp(page, '#/record');
    const ok = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
      const last = document.querySelector('.sample-note').getBoundingClientRect();
      return last.bottom <= nav.top + 1;
    });
    expect(ok, '마지막 콘텐츠가 하단 내비게이션에 가립니다').toBe(true);
  });

  test('StickyActionBar 가 콘텐츠를 가리지 않는다', async ({ page }) => {
    await H.openApp(page, '#/challenge/c-running-0914');
    const ok = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const bar = document.querySelector('.sticky-bar').getBoundingClientRect();
      const last = document.querySelector('.sample-note').getBoundingClientRect();
      return last.bottom <= bar.top + 1;
    });
    expect(ok, '마지막 콘텐츠가 하단 CTA 에 가립니다').toBe(true);
  });

  test('현재 화면과 일치하는 탭 하나만 활성화된다', async ({ page }) => {
    await H.openApp(page);
    for (const [hash, label] of [['#/home', '홈'], ['#/feed', '피드'], ['#/record', '기록'], ['#/my', '마이']]) {
      await H.gotoHash(page, hash);
      const active = page.locator('.bottom-nav__item[aria-current="page"]');
      await expect(active).toHaveCount(1);
      await expect(active).toContainText(label);
    }
  });
});

test.describe('에셋', () => {
  test('생성 이미지 10장이 모두 화면에 연결되어 있다', async ({ page }) => {
    await H.openApp(page);
    const used = await page.evaluate(async () => {
      const set = new Set();
      const grab = () => document.querySelectorAll('#app img')
        .forEach((i) => set.add(i.getAttribute('src').split('/').pop()));
      const routes = ['#/home', '#/feed', '#/record', '#/my', '#/discover',
        '#/challenge/c-running-0914', '#/challenge/c-reading-0817', '#/checkin',
        '#/checkin/fc-1', '#/checkin/fc-3', '#/ranking', '#/notice', '#/graduation'];
      for (const r of routes) { location.hash = r; render(); await new Promise((s) => setTimeout(s, 60)); grab(); }
      Store.me.onboarded = false;
      for (const step of [1, 2, 3]) { View.onboardStep = step; location.hash = '#/onboarding'; render(); await new Promise((s) => setTimeout(s, 60)); grab(); }
      View.onboardStep = 1; Store.me.onboarded = true;
      Store.saved = ['fc-1']; Store.settings.recordFilter = 'saved';
      location.hash = '#/record'; render(); await new Promise((s) => setTimeout(s, 60)); grab();
      return [...set].sort();
    });
    expect(used).toEqual([
      'cohort-meetup.webp', 'graduation-66.webp', 'habit-english.webp', 'habit-journal.webp',
      'habit-reading.webp', 'habit-running.webp', 'habit-stretch.webp', 'habit-water.webp',
      'hero-morning-desk.webp', 'rest-window.webp'
    ]);
  });

  test('외부 이미지 URL 과 임시 placeholder 가 없다', async ({ page }) => {
    await H.openApp(page);
    const bad = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('img').forEach((i) => {
        const src = i.getAttribute('src') || '';
        if (/^https?:|^data:|placehold|placeholder|dummy/i.test(src)) out.push(src);
      });
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('모든 이미지에 alt 속성과 비율 컨테이너가 있다', async ({ page }) => {
    for (const [hash] of ROUTES) {
      await H.openApp(page, hash);
      const bad = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('#app img').forEach((i) => {
          if (i.getAttribute('alt') === null) out.push('alt 없음: ' + i.src);
          const box = i.closest('.media');
          if (!box) out.push('media 컨테이너 없음: ' + i.src);
          else if (getComputedStyle(i).objectFit !== 'cover') out.push('object-fit 아님: ' + i.src);
        });
        return [...new Set(out)];
      });
      expect(bad, hash).toEqual([]);
    }
  });

  test('이미지가 실패해도 레이아웃이 무너지지 않는다', async ({ page }) => {
    await page.route('**/assets/images/*.webp', (r) => r.abort());
    await H.openApp(page, '#/home');
    await H.expectNoHorizontalScroll(page);
    const heroH = await page.evaluate(() => Math.round(document.querySelector('.hero').getBoundingClientRect().height));
    expect(heroH).toBeGreaterThan(300);
    await expect(page.locator('.media--failed').first()).toBeVisible();
  });
});

test.describe('접근성', () => {
  test('66칸 진행판이 색 외 표시와 요약 라벨을 제공한다', async ({ page }) => {
    await H.openApp(page, '#/record');
    const grid = page.locator('.progress-grid');
    await expect(grid).toHaveAttribute('role', 'img');
    await expect(grid).toHaveAttribute('aria-label', /66일 중 \d+일을 채웠습니다/);
    await expect(page.locator('.progress-grid__cell')).toHaveCount(66);
    await expect(page.locator('.legend__item')).toHaveCount(5);
    // 표시 전용이어야 한다
    await expect(page.locator('.progress-grid button, .progress-grid a')).toHaveCount(0);
  });

  test('Modal 이 포커스를 가두고 Escape 로 닫히며 포커스가 복귀한다', async ({ page }) => {
    await H.openApp(page, '#/my');
    const trigger = page.locator('[data-action="pick-demo"]');
    await trigger.focus();
    await trigger.click();
    await expect(page.locator('.sheet')).toBeVisible();
    expect(await page.evaluate(() =>
      document.getElementById('overlay-layer').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet')).toHaveCount(0);
    expect(await page.evaluate(() =>
      document.activeElement.getAttribute('data-action'))).toBe('pick-demo');
  });

  test('키보드만으로 인증을 완료할 수 있다', async ({ page }) => {
    await H.openApp(page, '#/checkin');
    await page.locator('#compose-text').focus();
    await page.keyboard.type('키보드로만 남긴 인증');
    const submit = page.locator('[data-action="submit-checkin"]');
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.checkin-done__title')).toBeVisible();
  });

  test('상태가 색상만으로 전달되지 않는다', async ({ page }) => {
    await H.openApp(page, '#/feed');
    // 늦은 인증·간단 인증·복귀 배지는 아이콘과 라벨을 함께 갖는다
    const badges = await page.evaluate(() =>
      [...document.querySelectorAll('.badge')].map((b) => ({
        text: b.textContent.trim(), icon: !!b.querySelector('i')
      })));
    expect(badges.length).toBeGreaterThan(0);
    for (const b of badges) {
      expect(b.text.length, '라벨 없는 배지').toBeGreaterThan(0);
    }
  });

  test('브라우저 뒤로 가기가 화면 기록을 따른다', async ({ page }) => {
    await H.openApp(page, '#/home');
    await page.click('.bottom-nav__item >> nth=1');
    await expect(page).toHaveURL(/#\/feed/);
    await page.click('.bottom-nav__item >> nth=2');
    await expect(page).toHaveURL(/#\/record/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/feed/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/home/);
  });
});

test.describe('색상 규정', () => {
  test('확정한 세 색상과 파생 토큰만 사용한다', async ({ page }) => {
    await H.openApp(page);
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const names = ['--color-brand-primary', '--color-accent', '--color-bg-app',
        '--color-brand-pressed', '--color-text-on-brand', '--color-danger'];
      const out = {};
      names.forEach((n) => { out[n] = cs.getPropertyValue(n).trim().toLowerCase(); });
      return out;
    });
    expect(tokens['--color-brand-primary']).toBe('#f04e2c');
    expect(tokens['--color-accent']).toBe('#1f6f5f');
    expect(tokens['--color-bg-app']).toBe('#fbf8f2');
    expect(tokens['--color-brand-pressed']).toBe('#c63a1e');
    expect(tokens['--color-text-on-brand']).toBe('#1a1a1a');
    expect(tokens['--color-danger']).toBe('#b3261e');
  });

  test('대표 컬러 배경 위 텍스트는 검정이다', async ({ page }) => {
    await H.openApp(page);
    const btn = page.locator('.btn--primary').first();
    const colors = await btn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    expect(colors.bg).toBe('rgb(240, 78, 44)');
    expect(colors.fg).toBe('rgb(26, 26, 26)');
  });
});
