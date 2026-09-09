// 스크린샷 회귀 테스트
// sixtysix-design-rull.md 21.5 자동 검증: 390px 과 430px 화면 비교
// 이미지 10장이 아직 없으면 기준 스크린샷에 회색 대체 면이 굳어지므로 건너뛴다.
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

/**
 * 촬영 조건을 고정한다.
 * 가로 슬라이더의 스크롤 위치와 lazy 이미지 로딩 시점이 실행마다 달라져
 * 픽셀 차이가 생기므로, 모든 이미지를 즉시 로드시키고 슬라이더를 처음 위치로 되돌린다.
 */
async function settle(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('.slider, .chip-row, .tile-grid').forEach((el) => { el.scrollLeft = 0; });
    const imgs = [...document.images];
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.all(imgs.map((i) => (i.complete ? null : i.decode().catch(() => null))));
  });
  await page.waitForTimeout(400);
}

const SCREENS = [
  ['home', '#/home'],
  ['feed', '#/feed'],
  ['record', '#/record'],
  ['my', '#/my'],
  ['discover', '#/discover'],
  ['challenge', '#/challenge/c-running-0914'],
  ['compose', '#/checkin'],
  ['checkin-detail', '#/checkin/fc-1'],
  ['ranking', '#/ranking'],
  ['notice', '#/notice'],
  ['graduation', '#/graduation']
];

test.describe('스크린샷 회귀', () => {
  test.beforeEach(async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/assets/images/hero-morning-desk.webp`);
    test.skip(!res.ok(), '생성 이미지 10장을 넣은 뒤 실행하세요. `npm run update-snapshots` 로 기준을 만듭니다.');
  });

  for (const [name, hash] of SCREENS) {
    test(`${name}`, async ({ page }) => {
      await H.openApp(page, hash);
      await settle(page);
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
        animations: 'disabled'
      });
    });
  }

  test('홈 — 사용자 상태 6개', async ({ page }) => {
    await H.openApp(page);
    for (const id of ['day0', 'ongoing', 'done', 'broken', 'dormant', 'graduated']) {
      await H.setDemoState(page, id);
      await settle(page);
      await expect(page.locator('.hero').first()).toHaveScreenshot(`home-${id}.png`, {
        maxDiffPixelRatio: 0.01,
        animations: 'disabled'
      });
    }
  });
});
