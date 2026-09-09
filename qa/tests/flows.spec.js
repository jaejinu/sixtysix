// 핵심 사용자 흐름 회귀 테스트
// sixtysix-project.md 15.7 자동 검증 시나리오 1~8, 10
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe('핵심 흐름', () => {
  test('1. 온보딩 → 습관 선택 → 코호트 확인 → 첫 인증 → 홈', async ({ page }) => {
    const errors = H.collectConsoleErrors(page);
    await page.goto('/index.html');
    await expect(page).toHaveURL(/#\/onboarding/);

    // 1단계: 습관을 고르기 전에는 진행할 수 없다
    await expect(page.locator('[data-action="onboard-next"]')).toBeDisabled();
    await page.click('[data-action="pick-habit"][data-id="running"]');
    await expect(page.locator('[data-action="onboard-next"]')).toBeEnabled();
    await page.click('[data-action="onboard-next"]');

    // 2단계: 고른 습관으로 코호트가 배정된다
    await expect(page.locator('.onboarding__title')).toContainText('아침 러닝');
    await page.click('[data-action="onboard-next"]');

    // 3단계: 규칙 요약 3개
    await expect(page.locator('.onboarding__title')).toHaveText('끊겨도 돌아올 수 있어요');
    await expect(page.locator('.note-card')).toHaveCount(3);
    await page.click('[data-action="onboard-next"]');

    // 인증 작성으로 이동하고, 고른 습관에 맞는 샘플 사진이 나온다
    await expect(page).toHaveURL(/#\/checkin/);
    await expect(page.locator('[data-action="pick-photo"]').first()).toHaveAttribute('data-id', 'running');

    await page.fill('#compose-text', '첫 러닝 인증. 한강 20분');
    await page.click('[data-action="submit-checkin"]');
    await expect(page.locator('.checkin-done__title')).toBeVisible();

    await H.gotoHash(page, '#/home');
    await expect(page.locator('.hero__title')).toHaveText('오늘 인증을 남겼어요');
    expect(errors).toEqual([]);
  });

  test('2. 인증 남기기 → 피드·기록·랭킹 동시 갱신, 66칸 +1', async ({ page }) => {
    await H.openApp(page);
    const before = await H.readState(page);
    expect(before.state).toBe('ongoing');

    await page.click('[data-action="go-checkin"]');
    await expect(page).toHaveURL(/#\/checkin/);

    // 입력 검증: 빈 값
    await page.click('[data-action="submit-checkin"]');
    await expect(page.locator('.error-inline')).toHaveText(/한 줄을 남겨야/);

    // 입력 검증: 40자 초과
    await page.fill('#compose-text', '가'.repeat(45));
    await expect(page.locator('.oneline')).toHaveClass(/oneline--error/);

    // 정상 제출
    await page.click('[data-action="pick-photo"][data-id="reading"]');
    await expect(page.locator('.photo-preview')).toBeVisible();
    await page.fill('#compose-text', '23일차. 오늘도 15분 읽었다');
    await page.click('[data-action="submit-checkin"]');
    await expect(page.locator('.checkin-done__title')).toContainText('인증을 남겼어요');

    const after = await H.readState(page);
    expect(after.filled).toBe(before.filled + 1);
    expect(after.streak).toBe(before.streak + 1);
    expect(after.remaining).toBe(before.remaining - 1);
    expect(after.todayChecked).toBe(true);

    // 기록의 66칸에 반영된다
    await H.gotoHash(page, '#/record');
    await expect(page.locator('.section-title').first()).toContainText(`66일 중 ${after.filled}일`);
    const filledCells = await page.evaluate(() =>
      document.querySelectorAll('.progress-grid .cell--done, .progress-grid .cell--late, .progress-grid .cell--pass').length);
    expect(filledCells).toBe(after.filled);

    // 새로고침 후에도 유지된다
    await page.reload();
    await page.waitForTimeout(200);
    const reloaded = await H.readState(page);
    expect(reloaded.filled).toBe(after.filled);
  });

  test('3. 끊김 → 면제권 사용 → 연속 복원·잔여 감소', async ({ page }) => {
    await H.openApp(page);
    await H.setDemoState(page, 'broken');
    const before = await H.readState(page);
    expect(before.state).toBe('broken');
    expect(before.streak).toBe(0);

    await expect(page.locator('.help-menu__item')).toHaveCount(2);
    await page.click('[data-action="use-pass"]');
    await expect(page.locator('.modal__title')).toHaveText('면제권을 쓸까요?');
    await page.click('[data-action="confirm-pass"]');

    const after = await H.readState(page);
    expect(after.streak).toBeGreaterThan(0);
    expect(after.passesLeft).toBe(before.passesLeft - 1);
    expect(after.filled).toBe(before.filled + 1);
    await expect(page.locator('.toast')).toContainText('면제권을 썼어요');
    await expect(page.locator('.modal')).toHaveCount(0);
  });

  test('4. 휴면 → 복귀 인증 → 복귀 배지', async ({ page }) => {
    await H.openApp(page);
    await H.setDemoState(page, 'dormant');
    const before = await H.readState(page);
    expect(before.state).toBe('dormant');

    // 휴면 상태에서는 면제권을 쓸 수 없다
    await expect(page.locator('[data-action="use-pass"]')).toBeDisabled();
    await expect(page.locator('.hero-cta button, .hero-cta a')).toHaveText(/복귀 인증하기/);

    await page.click('[data-action="go-checkin"]');
    await expect(page.locator('.composer__banner')).toContainText('다시 1일차');
    await page.fill('#compose-text', '8일 만에 복귀. 다시 시작');
    await page.click('[data-action="submit-checkin"]');
    await expect(page.locator('.checkin-done__title')).toBeVisible();

    const after = await H.readState(page);
    expect(after.streak).toBe(1);
    expect(after.checkins).toBe(before.checkins + 1);

    // 복귀 배지 획득
    const badges = await page.evaluate(() => earnedBadges());
    expect(badges['b-return']).toBe(true);
  });

  test('5. 탐색 검색·필터·초기화 → 챌린지 상세 → 참여 확인', async ({ page }) => {
    await H.openApp(page, '#/discover');
    const total = await page.locator('.lcard').count();
    expect(total).toBeGreaterThan(0);

    await page.fill('#discover-q', '러닝');
    await page.waitForTimeout(400);
    const searched = await page.locator('.lcard').count();
    expect(searched).toBeLessThan(total);

    // 결과가 없는 조건 → 빈 상태와 초기화 CTA
    await page.click('[data-action="discover-habit"][data-id="water"]');
    await expect(page.locator('.state-block__title')).toHaveText('조건에 맞는 코호트가 없어요');
    await page.click('[data-action="discover-reset"]');
    await expect(page.locator('.lcard')).toHaveCount(total);

    // 상세 진입 후 참여
    await page.click('.lcard >> nth=0');
    await expect(page).toHaveURL(/#\/challenge\//);
    await H.expectNoNavAndBarTogether(page);
    await expect(page.locator('.note-card')).toHaveCount(4); // 정책 요약 4개

    const join = page.locator('[data-action="join-cohort"]');
    if (await join.count()) {
      await join.click();
      await expect(page.locator('.modal__title')).toHaveText('이 코호트로 66일을 시작할까요?');
      await page.click('[data-action="confirm-join"]');
      await expect(page.locator('.toast')).toContainText('참여했어요');
    }
  });

  test('6. 피드 응원·저장 → 기록 저장 목록 → 해제 → 실행 취소', async ({ page }) => {
    await H.openApp(page, '#/feed');
    const cheer = page.locator('[data-action="cheer"][data-id="fc-1"]').first();
    await cheer.click();
    await expect(page.locator('[data-action="cheer"][data-id="fc-1"]').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.toast')).toContainText('응원을 보냈어요');

    await page.locator('[data-action="save"][data-id="fc-1"]').first().click();
    await expect(page.locator('[data-action="save"][data-id="fc-1"]').first()).toHaveAttribute('aria-pressed', 'true');

    // 필터가 실제로 걸러낸다
    const all = await page.locator('.post').count();
    await page.click('[data-action="feed-filter"][data-id="photo"]');
    expect(await page.locator('.post').count()).toBeLessThan(all);
    await page.click('[data-action="feed-filter"][data-id="all"]');

    // 기록 저장 목록에 나타난다
    await H.gotoHash(page, '#/record');
    await page.click('[data-action="record-filter"][data-id="saved"]');
    await expect(page.locator('.tile')).toHaveCount(1);

    // 전체 해제 후 실행 취소로 복구
    await page.click('[data-action="clear-saved"]');
    await expect(page.locator('.state-block__title')).toHaveText('저장한 인증이 아직 없어요');
    await page.click('[data-action="toast-undo"]');
    await expect(page.locator('.tile')).toHaveCount(1);
  });

  test('7. 데모 상태 6종 전환이 홈에 반영된다', async ({ page }) => {
    await H.openApp(page);
    const expected = {
      day0: '오늘이 첫날이에요',
      ongoing: '오늘 인증만 남았어요',
      done: '오늘 인증을 남겼어요',
      broken: '어제는 쉬었어요',
      dormant: '7일 동안 인증이 없었어요',
      graduated: '66일을 다 채웠어요'
    };
    for (const [id, title] of Object.entries(expected)) {
      await H.setDemoState(page, id);
      await expect(page.locator('.hero__title'), `${id} 상태`).toHaveText(title);
      const s = await H.readState(page);
      expect(s.state, `${id} 상태 계산`).toBe(id);
      await H.expectScreenSane(page);
    }
  });

  test('8. 완주 미리보기 → 졸업 화면 → 다음 코호트 예약', async ({ page }) => {
    await H.openApp(page, '#/graduation');
    await expect(page.locator('.composer__banner')).toContainText('미리보기');
    await expect(page.locator('.timeline__item')).toHaveCount(6);
    await page.locator('[data-action="reserve"]').first().click();
    await expect(page.locator('.toast')).toContainText('예약했어요');

    // 실제 완주 상태에서는 미리보기 안내가 사라진다
    await H.setDemoState(page, 'graduated', '#/graduation');
    await expect(page.locator('.composer__banner')).toHaveCount(0);
    const s = await H.readState(page);
    expect(s.checkins).toBe(62);
  });

  test('10. 손상된 localStorage · 없는 화면 · 없는 인증', async ({ page }) => {
    // 손상된 저장 데이터에서 기본값으로 복구한다
    await page.addInitScript(() => {
      try { localStorage.setItem('sixtysix', '{깨진 JSON'); } catch (e) { /* noop */ }
    });
    await page.goto('/index.html');
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/#\/onboarding/);
    expect(await page.evaluate(() => storageBroken)).toBe(true);

    // 없는 경로
    await page.evaluate(() => { Store.me.onboarded = true; saveStore(); location.hash = '#/없는화면'; render(); });
    await page.waitForTimeout(150);
    await expect(page.locator('.state-block__title')).toHaveText('찾는 화면이 없어요');

    // 없는 인증
    await H.gotoHash(page, '#/checkin/없는아이디');
    await expect(page.locator('.state-block__title')).toHaveText('찾는 인증이 없어요');
  });
});
