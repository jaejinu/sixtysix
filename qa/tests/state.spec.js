// 저장 상태 정합성 테스트
// V1 진단에서 드러난 문제: 기존 테스트가 "화면에 무엇이 보이는가"만 검사해
// 표시는 맞고 저장된 상태는 틀린 버그를 잡지 못했다. 이 파일이 그 층을 담당한다.
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

function readMe(page) {
  return page.evaluate(() => ({
    habitId: Store.me.habitId,
    cohortId: Store.me.cohortId,
    nextCohortId: Store.me.nextCohortId,
    joinedAt: Store.me.joinedAt,
    graduated: Store.me.graduated,
    cohortName: cohortById(Store.me.cohortId).name,
    cohortHabitId: cohortById(Store.me.cohortId).habitId,
    habitName: habitById(Store.me.habitId).name
  }));
}

test.describe('온보딩 — 습관과 코호트 정합성', () => {
  for (const habitId of ['reading', 'running', 'english', 'water', 'journal', 'stretch']) {
    test(`${habitId} 선택 시 같은 습관의 코호트가 배정된다`, async ({ page }) => {
      await page.goto('/index.html');
      await page.click(`[data-action="pick-habit"][data-id="${habitId}"]`);
      await page.click('[data-action="onboard-next"]');

      const me = await readMe(page);
      // 저장된 습관과 코호트의 습관이 일치해야 한다
      expect(me.habitId).toBe(habitId);
      expect(me.cohortHabitId, '배정된 코호트의 습관이 다름').toBe(habitId);

      // 화면에 보이는 코호트 이름이 실제 배정 코호트여야 한다 (문자열 조합 금지)
      const shown = await page.locator('.cohort-summary__name').textContent();
      expect(shown.trim()).toBe(me.cohortName);

      // 코호트명은 습관명으로 시작해야 한다. 이름 규칙이 어긋나면 화면마다 다른 이름이 보인다.
      expect(me.cohortName.startsWith(me.habitName),
        `코호트명 "${me.cohortName}" 이 습관명 "${me.habitName}" 으로 시작하지 않음`).toBe(true);

      // 마이 화면에는 실제 배정 코호트명과 하루 목표가 보인다
      await page.click('[data-action="onboard-next"]');
      await page.click('[data-action="onboard-next"]');
      await H.gotoHash(page, '#/my');
      const meta = await page.locator('.profile-head__meta').textContent();
      expect(meta).toContain(me.cohortName);
      expect(meta).toContain(await page.evaluate(() => habitById(Store.me.habitId).goal));
    });
  }

  test('건너뛰기도 습관에 맞는 코호트를 배정한다', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('[data-action="pick-habit"][data-id="journal"]');
    await page.click('[data-action="onboard-skip"]');
    const me = await readMe(page);
    expect(me.cohortHabitId).toBe(me.habitId);
  });
});

test.describe('코호트 참여 — 화면 이동이 아니라 상태가 바뀌는가', () => {
  test('진행 중이면 참여가 아니라 다음 코호트 예약이 된다', async ({ page }) => {
    await H.openApp(page, '#/challenge/c-running-0914');
    const before = await readMe(page);
    expect(before.cohortId, '데모는 진행 중 코호트를 갖는다').toBeTruthy();

    await expect(page.locator('[data-action="join-cohort"]')).toHaveText(/다음 코호트로 예약하기/);
    await page.click('[data-action="join-cohort"]');
    await expect(page.locator('.modal__title')).toHaveText('다음 코호트로 예약할까요?');
    await page.click('[data-action="confirm-join"]');

    const after = await readMe(page);
    // 예약만 되고 진행 중 코호트는 그대로여야 한다
    expect(after.nextCohortId).toBe('c-running-0914');
    expect(after.cohortId).toBe(before.cohortId);
    await expect(page.locator('.toast')).toContainText('예약했어요');

    // 새로고침 후에도 유지된다
    await page.reload();
    await page.waitForTimeout(200);
    expect((await readMe(page)).nextCohortId).toBe('c-running-0914');
  });

  test('예약한 코호트는 마이 화면에서 다시 찾을 수 있다', async ({ page }) => {
    // 저장만 되고 화면 어디에도 보이지 않으면 상태가 없는 것과 같다
    await H.openApp(page, '#/challenge/c-running-0914');
    await page.click('[data-action="join-cohort"]');
    await page.click('[data-action="confirm-join"]');

    await H.gotoHash(page, '#/my');
    const row = page.locator('.settings-row', { hasText: '예약한 다음 코호트' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('아침 러닝 · 9월 3기');
    await expect(row).toContainText('시작');

    // 그 행을 따라가면 예약한 코호트 상세로 간다
    await row.click();
    await expect(page).toHaveURL(/#\/challenge\/c-running-0914/);
    await expect(page.locator('.sticky-bar .btn').first()).toContainText('시작 예정');
  });

  test('예약이 없으면 마이 화면에 그 행이 없다', async ({ page }) => {
    await H.openApp(page, '#/my');
    await expect(page.locator('.settings-row', { hasText: '예약한 다음 코호트' })).toHaveCount(0);
  });

  test('예약을 취소하면 상태가 지워진다', async ({ page }) => {
    await H.openApp(page, '#/challenge/c-running-0914');
    await page.click('[data-action="join-cohort"]');
    await page.click('[data-action="confirm-join"]');
    await expect(page.locator('[data-action="cancel-reserve"]')).toBeVisible();
    await page.click('[data-action="cancel-reserve"]');
    expect((await readMe(page)).nextCohortId).toBeFalsy();
  });

  test('완주 후에는 실제로 새 코호트에 배정된다', async ({ page }) => {
    await H.openApp(page);
    await H.setDemoState(page, 'graduated');
    await H.gotoHash(page, '#/challenge/c-running-0914');

    await expect(page.locator('[data-action="join-cohort"]')).toHaveText(/코호트 참여하기/);
    await page.click('[data-action="join-cohort"]');
    await page.click('[data-action="confirm-join"]');

    const me = await readMe(page);
    expect(me.cohortId).toBe('c-running-0914');
    expect(me.habitId).toBe('running');       // 코호트의 습관으로 함께 바뀐다
    expect(me.cohortHabitId).toBe(me.habitId);
    expect(me.joinedAt).toBeTruthy();
    expect(me.graduated).toBe(false);
    const d = await H.readState(page);
    expect(d.filled, '새 코호트는 0일차부터').toBe(0);
  });

  test('이미 시작한 남의 코호트는 참여할 수 없고 탐색에도 없다', async ({ page }) => {
    await H.openApp(page, '#/challenge/c-running-0817');
    await expect(page.locator('.sticky-bar .btn').first()).toBeDisabled();
    await expect(page.locator('.sticky-bar .btn').first()).toHaveText(/이미 시작한 코호트/);

    await H.gotoHash(page, '#/discover');
    const names = await page.locator('.lcard__title').allTextContents();
    const started = names.filter((n) => n.includes('9월 2기') && !n.includes('독서 15분'));
    expect(started, '시작한 남의 코호트가 탐색에 노출됨').toEqual([]);
  });
});

test.describe('랭킹 — 모든 멤버가 같은 기준으로 계산되는가', () => {
  test('내 순위는 면제권을 뺀 실제 인증 수로 매겨진다', async ({ page }) => {
    await H.openApp(page, '#/ranking');
    const info = await page.evaluate(() => {
      const d = derived();
      const rows = ranking();
      const me = rows.filter((r) => r.me)[0];
      return { checkins: d.checkins, passes: d.passes, filled: d.filled, myTotal: me.total, myRank: me.rank };
    });
    expect(info.passes, '데모 기본값은 면제권 1회 사용 상태').toBeGreaterThan(0);
    expect(info.myTotal, '순위 기준이 실제 인증 수여야 한다').toBe(info.checkins);
    expect(info.myTotal, '면제권 포함 값을 쓰면 안 된다').not.toBe(info.filled);
  });

  test('같은 인증 수면 연속 기록이 앞선다', async ({ page }) => {
    await H.openApp(page, '#/ranking');
    const rows = await page.evaluate(() => ranking().map((r) => ({ n: r.name, t: r.total, s: r.streak, rank: r.rank })));
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      expect(a.t >= b.t, `${a.n}(${a.t}) 다음에 ${b.n}(${b.t})`).toBe(true);
      if (a.t === b.t) expect(a.s >= b.s, `동률에서 연속 기록 역전: ${a.n} ${b.n}`).toBe(true);
    }
  });

  test('화면 문구와 실제 계산 기준이 일치한다', async ({ page }) => {
    await H.openApp(page, '#/ranking');
    const body = await page.locator('.note-card__body').first().textContent();
    const d = await page.evaluate(() => derived());
    expect(body).toContain('실제 인증 일수');
    expect(body).toContain(`내 인증 ${d.checkins}일`);
  });
});

test.describe('인증 — 공개 범위가 저장 상태에 반영되는가', () => {
  test('나만 보기로 남기면 비공개로 기록된다', async ({ page }) => {
    await H.openApp(page, '#/checkin');
    await page.click('[data-action="toggle-scope"]');
    await page.fill('#compose-text', '나만 보는 인증');
    await page.click('[data-action="submit-checkin"]');
    await expect(page.locator('.checkin-done__title')).toBeVisible();
    const isPrivate = await page.evaluate(() =>
      Store.privateDays.indexOf(Store.me.dayCount) >= 0);
    expect(isPrivate).toBe(true);
  });

  test('사진 없이 남기면 간단 인증으로 기록된다', async ({ page }) => {
    await H.openApp(page, '#/checkin');
    await page.fill('#compose-text', '사진 없이 한 줄만');
    await page.click('[data-action="submit-checkin"]');
    await expect(page.locator('.checkin-done__title')).toBeVisible();
    const isSimple = await page.evaluate(() =>
      Store.simpleDays.indexOf(Store.me.dayCount) >= 0);
    expect(isSimple).toBe(true);
  });
});
