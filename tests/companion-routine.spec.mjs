import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'pawpal.companion.v1';
const picker = page => page.getByRole('dialog', { name: '换个表情', exact: true });
const sprite = page => page.locator('.stage-pet, .overlay-sprite');
const gentleSpeech = page => page.locator('.gentle-speech[role="status"]');

async function prepare(page, time, { species = 'maltese', paused = false, size = 1, overlay = false, random } = {}) {
  const date = new Date(time);
  await page.clock.install({ time: date });
  await page.clock.pauseAt(date);
  await page.addInitScript(({ key, species, paused, size, now, random }) => {
    if (typeof random === 'number') Math.random = () => random;
    localStorage.setItem(key, JSON.stringify({
      species, name: '小伙伴', adopted: true,
      stats: { hunger: 78, energy: 85, happiness: 80, bond: 0 },
      settings: { size, movement: 'free', sound: false, alwaysOnTop: true, paused },
      action: { type: 'idle', until: 0 }, originalAnimation: { clip: 7, startedAt: 0 },
      lastInteraction: 0, updatedAt: now,
    }));
  }, { key: STORAGE_KEY, species, paused, size, now: date.getTime(), random });
  await page.goto(overlay ? '/?view=pet' : '/');
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return sprite(page).getAttribute('data-load-state');
  }).toBe('ready');
}

async function openPicker(page) {
  const trigger = page.locator('[data-expression-trigger]');
  if (await page.locator('.pet-overlay').count()) await sprite(page).hover();
  await trigger.click();
  await expect(picker(page)).toBeVisible();
}

async function selectClip(page, label, clip) {
  await openPicker(page);
  await picker(page).getByRole('button', { name: `播放${label}`, exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return sprite(page).getAttribute('data-original-clip');
  }).toBe(String(clip));
}

test('expression choices stay tucked away and keyboard dismissal restores the trigger', async ({ page }) => {
  await prepare(page, '2026-10-14T03:00:00Z');
  await expect(picker(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^播放/ })).toHaveCount(0);
  await openPicker(page);
  await expect(picker(page).getByRole('button', { name: /^播放/ })).toHaveCount(24);
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  await expect(page.locator('[data-expression-trigger]')).toBeFocused();
  await openPicker(page);
  await page.getByRole('heading', { name: '小伙伴的桌面', exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
});

test('Beijing 19:00 changes to a tender evening pose even in a New York browser', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' });
  const page = await context.newPage();
  try {
    await prepare(page, '2026-10-14T10:59:59Z', { random: 0 });
    await expect(sprite(page)).toHaveAttribute('data-original-clip', '22');
    await expect(page.locator('.routine-clock')).toContainText('北京时间 18:59');
    await page.clock.runFor(1_500);
    await expect(sprite(page)).toHaveAttribute('data-original-clip', '6');
    await expect(page.locator('.routine-clock')).toContainText('北京时间 19:00');
    await expect(sprite(page)).toHaveAttribute('data-original-mode', 'automatic');
    // Crossing into the evening is a deliberate greeting; later idle speech
    // remains several minutes apart.
    await expect(gentleSpeech(page)).toBeVisible();
    await expect(gentleSpeech(page)).toContainText(/抱|辛苦|歇|努力|忙/);
    await page.clock.runFor(6_100);
    await expect(gentleSpeech(page)).toHaveCount(0);
    await page.clock.runFor(120_000);
    await expect(gentleSpeech(page)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('morning, lunch, work, and bedtime use different complete original clips', async ({ page }) => {
  await prepare(page, '2026-10-13T23:00:00Z'); // Beijing 07:00
  await expect(sprite(page)).toHaveAttribute('data-original-clip', '7');
  for (const [time, clip, clock] of [
    ['2026-10-14T02:00:00Z', 22, '10:00'],
    ['2026-10-14T04:00:00Z', 21, '12:00'],
    ['2026-10-14T06:00:00Z', 22, '14:00'],
    ['2026-10-14T15:00:00Z', 24, '23:00'],
  ]) {
    await page.clock.setSystemTime(new Date(time));
    await page.clock.runFor(600);
    await expect(sprite(page)).toHaveAttribute('data-original-clip', String(clip));
    await expect(page.locator('.routine-clock')).toContainText(`北京时间 ${clock}`);
  }
});

test('a manual expression returns to the time-of-day pose after 30 active seconds', async ({ page }) => {
  await prepare(page, '2026-10-14T11:30:00Z');
  await expect(sprite(page)).toHaveAttribute('data-original-clip', '6');
  await selectClip(page, '鲜花', 4);
  await expect(sprite(page)).toHaveAttribute('data-original-mode', 'manual');
  await page.clock.runFor(20_000);
  await page.getByRole('switch', { name: '暂停活动', exact: true }).click();
  const frame = await sprite(page).getAttribute('data-frame');
  await page.clock.runFor(60_000);
  await expect(sprite(page)).toHaveAttribute('data-original-clip', '4');
  await expect(sprite(page)).toHaveAttribute('data-frame', frame);
  await page.getByRole('switch', { name: '暂停活动', exact: true }).click();
  await page.clock.runFor(9_000);
  await expect(sprite(page)).toHaveAttribute('data-original-clip', '4');
  await page.clock.runFor(2_000);
  await expect(sprite(page)).toHaveAttribute('data-original-clip', '6');
  await expect(sprite(page)).toHaveAttribute('data-original-mode', 'automatic');
});

test('the open chooser keeps idle speech quiet and does not rush its next greeting', async ({ page }) => {
  await prepare(page, '2026-10-14T11:30:00Z');
  await openPicker(page);
  await page.clock.runFor(120_000);
  await expect(gentleSpeech(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.clock.runFor(7_000);
  await expect(gentleSpeech(page)).toHaveCount(0);
  await page.clock.runFor(1_500);
  await expect(gentleSpeech(page)).toBeVisible();
});

test('idle greetings last six seconds and remain several minutes apart', async ({ page }) => {
  await prepare(page, '2026-10-14T11:30:00Z', { random: 0 });
  await page.clock.runFor(7_000);
  await expect(gentleSpeech(page)).toHaveCount(0);
  await page.clock.runFor(1_500);
  await expect(gentleSpeech(page)).toContainText('辛苦啦');
  await page.clock.runFor(6_000);
  await expect(gentleSpeech(page)).toHaveCount(0);
  await page.clock.runFor(120_000);
  await expect(gentleSpeech(page)).toHaveCount(0);
  await page.clock.runFor(54_000);
  await expect(gentleSpeech(page)).toBeVisible();
  // Adjacent greetings do not repeat the same phrase.
  await expect(gentleSpeech(page)).not.toContainText('辛苦啦');
});

test('dragging holds the dog and suppresses an unsolicited greeting', async ({ page }) => {
  await prepare(page, '2026-10-14T11:30:00Z');
  const rect = await sprite(page).boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 15, rect.y + rect.height / 2);
  await page.clock.runFor(120_000);
  await expect(gentleSpeech(page)).toHaveCount(0);
  await expect(sprite(page)).toHaveAttribute('data-original-clip', '6');
  await page.mouse.up();
  await page.clock.runFor(7_000);
  await expect(gentleSpeech(page)).toHaveCount(0);
  await page.clock.runFor(1_500);
  await expect(gentleSpeech(page)).toBeVisible();
});

test('pause and reduced motion suppress unsolicited idle speech', async ({ page }) => {
  await prepare(page, '2026-10-14T11:30:00Z', { paused: true });
  await page.clock.runFor(120_000);
  await expect(gentleSpeech(page)).toHaveCount(0);
  await page.getByRole('switch', { name: '暂停活动', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(120_000);
  await expect(gentleSpeech(page)).toHaveCount(0);
});

test('a native hug never delays a subsequent manual expression', async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 360 });
  await prepare(page, '2026-10-14T11:30:00Z', { overlay: true });
  await sprite(page).hover();
  await page.getByRole('button', { name: '抱一下', exact: true }).click();
  await expect(gentleSpeech(page)).toContainText('抱抱');
  await page.clock.runFor(100);
  await selectClip(page, '鲜花', 4);
  await expect(sprite(page)).toHaveAttribute('data-original-mode', 'manual');
  await expect(gentleSpeech(page)).toHaveCount(0);
  expect(await page.evaluate(() => Date.now())).toBeLessThan(new Date('2026-10-14T11:30:01Z').getTime());
});

test('mobile choices remain inside the viewport and close after a selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page, '2026-10-14T11:30:00Z');
  await openPicker(page);
  const bounds = await picker(page).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await picker(page).getByRole('button', { name: '播放睡觉', exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
});

for (const size of [.65, 1, 1.5]) test(`native-sized ${size} chooser scrolls inside the pet root`, async ({ page }) => {
  const width = Math.round(340 * size), height = Math.round(360 * size);
  await page.setViewportSize({ width, height });
  await prepare(page, '2026-10-14T11:30:00Z', { species: 'golden', size, overlay: true });
  await expect(picker(page)).toHaveCount(0);
  await openPicker(page);
  const layout = await picker(page).evaluate(dialog => {
    const root = document.querySelector('.pet-overlay').getBoundingClientRect();
    const menu = dialog.getBoundingClientRect();
    const grid = dialog.querySelector('.expression-picker-grid');
    const scroll = dialog.querySelector('.expression-picker-scroll');
    const buttons = [...grid.querySelectorAll('button')];
    return {
      contained: menu.left >= root.left && menu.top >= root.top && menu.right <= root.right && menu.bottom <= root.bottom,
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      count: buttons.length,
      overflow: scroll.scrollHeight > scroll.clientHeight,
      buttonsHaveOneLineLabels: buttons.every(button => {
        const label = button.querySelector('.expression-picker-label');
        return !label || label.getBoundingClientRect().height < 25;
      }),
    };
  });
  expect(layout.contained).toBe(true);
  expect(layout.columns).toBe(4);
  expect(layout.count).toBe(24);
  expect(layout.buttonsHaveOneLineLabels).toBe(true);
  if (size === .65) expect(layout.overflow).toBe(true);
  await picker(page).getByRole('button', { name: '播放睡觉', exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return sprite(page).getAttribute('data-original-clip');
  }).toBe('24');
});
