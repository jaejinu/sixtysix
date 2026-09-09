// 에셋 존재 검사
// sixtysix-project.md 16장 완료 정의: assets/images/ 에 생성 이미지 10장이 있고 모두 화면에 쓰인다.
// 이미지를 아직 넣지 않았다면 이 파일의 테스트만 실패한다. 파일을 넣으면 그대로 통과한다.
const { test, expect } = require('@playwright/test');

const IMAGES = [
  'hero-morning-desk.webp',
  'habit-reading.webp',
  'habit-running.webp',
  'habit-english.webp',
  'habit-water.webp',
  'habit-journal.webp',
  'cohort-meetup.webp',
  'graduation-66.webp',
  'habit-stretch.webp',
  'rest-window.webp'
];

test.describe('생성 이미지 10장', () => {
  test('assets/images/ 에 10장이 모두 존재한다', async ({ request, baseURL }) => {
    const missing = [];
    for (const name of IMAGES) {
      const res = await request.get(`${baseURL}/assets/images/${name}`);
      if (!res.ok()) missing.push(name);
    }
    expect(missing, 'IMAGE-PROMPTS.md 의 프롬프트로 생성해 넣어야 하는 파일').toEqual([]);
  });

  test('10장이 모두 정상적으로 그려진다', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('sixtysix', JSON.stringify({ version: 1, me: { onboarded: true } })); } catch (e) { /* noop */ }
    });
    await page.goto('/index.html#/home');
    await page.waitForTimeout(200);
    const broken = await page.evaluate(async () => {
      const out = [];
      const routes = ['#/home', '#/feed', '#/record', '#/my', '#/discover',
        '#/challenge/c-reading-0817', '#/checkin', '#/checkin/fc-1', '#/ranking', '#/notice', '#/graduation'];
      for (const r of routes) {
        location.hash = r; render();
        await new Promise((s) => setTimeout(s, 80));
        document.querySelectorAll('#app img').forEach((i) => {
          if (i.complete && i.naturalWidth === 0) out.push(i.getAttribute('src'));
        });
      }
      return [...new Set(out)];
    });
    expect(broken, '깨진 이미지').toEqual([]);
  });
});
