import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'pawpal.companion.v1';
const REMINDER_INTERVAL = 30 * 60 * 1000;
const sprite = page => page.locator('.stage-pet, .overlay-sprite');
const reminder = page => page.getByRole('status', { name: '起身提醒', exact: true });
const reminderSwitch = page => page.getByRole('switch', { name: '每30分钟提醒起身', exact: true });

async function prepare(page, { species = 'maltese', time = '2026-10-15T07:00:00Z', paused = false,
  standReminder, overlay = false, size = 1, reducedMotion = false } = {}) {
  const date = new Date(time);
  await page.clock.install({ time: date });
  await page.clock.pauseAt(date);
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await page.addInitScript(({ species, now, paused, standReminder, size }) => {
    Math.random = () => 0;
    // Set the fixture only once so a subsequent reload verifies persistence.
    if (sessionStorage.getItem('hover-stand-prepared')) return;
    sessionStorage.setItem('hover-stand-prepared', 'true');
    localStorage.setItem('pawpal.companion.v1', JSON.stringify({
      species, name: '小伙伴', adopted: true,
      stats: { hunger: 78, energy: 85, happiness: 80, bond: 0 },
      settings: { size, movement: 'free', sound: false, alwaysOnTop: true, paused, standReminder },
      action: { type: 'idle', until: 0 }, originalAnimation: { clip: 7, startedAt: 0 },
      lastInteraction: 0, updatedAt: now,
    }));
  }, { species, now: date.getTime(), paused, standReminder, size });
  await page.goto(overlay ? '/?view=pet' : '/');
  if (species === 'parrot') {
    await expect.poll(async () => {
      await page.clock.runFor(100);
      return sprite(page).locator('canvas').getAttribute('data-renderer');
    }).toBe('whole-frame-2d');
    return;
  }
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return sprite(page).getAttribute('data-load-state');
  }).toBe('ready');
}

async function moveToSource(page, [x, y]) {
  const point = await sprite(page).locator('canvas').evaluate((canvas, [x, y]) => {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / 320, rect.height / 300);
    return { x: rect.left + (rect.width - 320 * scale) / 2 + x * scale,
      y: rect.top + (rect.height - 300 * scale) / 2 + y * scale };
  }, [x, y]);
  await page.mouse.move(point.x, point.y);
}

async function reachReminder(page) {
  // Each gap stays below 5s, so the real bridge clock keeps counting. A single
  // half-hour jump would correctly be treated as computer sleep and reset it.
  for (let elapsed = 0; elapsed < REMINDER_INTERVAL - 4_000; elapsed += 4_000) await page.clock.fastForward(4_000);
  await page.clock.runFor(2_000);
  await expect(reminder(page)).toHaveCount(0);
  await page.clock.runFor(3_000);
  await expect(reminder(page)).toBeVisible();
}

async function desktopFixture(page, { overlay = true, size = 1, species = 'maltese' } = {}) {
  await page.addInitScript(() => {
    let state, cue = null;
    const listeners = new Set();
    const snapshot = () => ({ ...(state ||= JSON.parse(localStorage.getItem('pawpal.companion.v1'))),
      desktop: { hidden: false }, standReminder: cue });
    const notify = () => { const value = snapshot(); listeners.forEach(listener => listener(value)); return value; };
    window.__standTest = {
      push: () => { cue = { id: 1, text: '陪我起来站一会儿，伸伸懒腰吧。', phase: 'pending' }; notify(); },
      snapshot,
      hitRegions: [],
    };
    // This fixture delivers the same IPC snapshots as the main process so UI
    // ownership and geometry can be tested without another real 30-minute run.
    window.companion = {
      isDesktop: true,
      getState: async () => snapshot(),
      onState: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      dispatch: async command => {
        state ||= snapshot();
        const { transition } = await import('/src/core/state.js');
        state = transition(state, command, Date.now());
        if (!state.settings.standReminder) cue = null;
        return notify();
      },
      presentStandReminder: async id => {
        if (cue?.id === id && cue.phase === 'pending') cue = { ...cue, phase: 'visible', until: Date.now() + 12_000 };
        notify(); return cue;
      },
      dismissStandReminder: async id => { if (cue?.id === id) cue = null; notify(); return cue; },
      onMotion: () => () => {}, setReducedMotion: async () => true, setPlaybackReady: async () => true,
      setHitRegions: regions => { window.__standTest.hitRegions = regions; },
      showPanel: () => {}, hidePet: () => {}, beginDrag: () => {}, endDrag: () => {}, movePet: () => {},
      getDisplays: async () => [],
    };
  });
  await prepare(page, { overlay, size, species, reducedMotion: true, standReminder: true });
}

for (const [species, head, body, transparent] of [
  ['maltese', [190, 200], [120, 200], [180, 155]],
  ['golden', [160, 160], [160, 225], [160, 120]],
]) test(`${species}: only a deliberate head hover earns a nuzzle, once per visit`, async ({ page }) => {
  await prepare(page, { species });
  await expect(sprite(page)).toHaveAttribute('data-original-clip', '22');
  const initialSequence = await sprite(page).getAttribute('data-sequence');
  await moveToSource(page, transparent);
  await page.clock.runFor(550);
  await expect(sprite(page)).not.toHaveAttribute('data-nuzzling', 'true');
  await moveToSource(page, body);
  await page.clock.runFor(550);
  await expect(sprite(page)).not.toHaveAttribute('data-nuzzling', 'true');
  await moveToSource(page, head);
  await page.clock.runFor(200);
  await expect(sprite(page)).not.toHaveAttribute('data-nuzzling', 'true');
  await page.clock.runFor(300);
  await expect(sprite(page)).toHaveAttribute('data-nuzzling', 'true');
  await expect(page.getByRole('status').filter({ hasText: '蹭蹭～最喜欢你摸摸头啦。' })).toBeVisible();
  if (species === 'maltese') await page.locator('.desktop-stage').screenshot({ path: '.artifacts/hover-stand/head-nuzzle.png' });
  const nuzzleSequence = Number(await sprite(page).getAttribute('data-sequence'));
  expect(nuzzleSequence).toBeGreaterThan(Number(initialSequence));
  await page.clock.runFor(2_000);
  await expect(sprite(page)).toHaveAttribute('data-sequence', String(nuzzleSequence));
  await page.mouse.move(0, 0);
  await page.clock.runFor(500);
  await expect(sprite(page)).not.toHaveAttribute('data-nuzzling', 'true');
});

for (const blocked of ['paused', 'reduced motion', 'manual expression', 'dragging', 'open chooser']) {
  test(`head hovering stays quiet during ${blocked}`, async ({ page }) => {
    await prepare(page, { paused: blocked === 'paused', reducedMotion: blocked === 'reduced motion' });
    if (blocked === 'manual expression') {
      await page.locator('[data-expression-trigger]').click();
      await page.getByRole('dialog', { name: '换个表情', exact: true })
        .getByRole('button', { name: '播放歇歇', exact: true }).click();
      await expect(sprite(page)).toHaveAttribute('data-original-mode', 'manual');
    }
    if (blocked === 'open chooser') await page.locator('[data-expression-trigger]').click();
    await moveToSource(page, [190, 200]);
    if (blocked === 'dragging') {
      await page.mouse.down();
      await page.mouse.move(20, 20);
    }
    const sequence = await sprite(page).getAttribute('data-sequence');
    await page.clock.runFor(1_000);
    await expect(sprite(page)).not.toHaveAttribute('data-nuzzling', 'true');
    await expect(page.getByRole('status').filter({ hasText: '蹭蹭～最喜欢你摸摸头啦。' })).toHaveCount(0);
    await expect(sprite(page)).toHaveAttribute('data-sequence', sequence);
    if (blocked === 'dragging') await page.mouse.up();
  });
}

test('the optional half-hour standing reminder is enabled by default and its choice survives reload', async ({ page }) => {
  await prepare(page);
  await expect(reminderSwitch(page)).toHaveAttribute('aria-checked', 'true');
  await reminderSwitch(page).click();
  await expect(reminderSwitch(page)).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).settings.standReminder, STORAGE_KEY)).toBe(false);
  await page.reload();
  await expect(reminderSwitch(page)).toHaveAttribute('aria-checked', 'false');
});

test('an awake idle companion offers one gentle standing reminder after 30 active minutes', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page, { reducedMotion: true });
  await reachReminder(page);
  await expect(reminder(page)).toContainText(/站|起身/);
  await page.clock.runFor(10_000);
  await expect(reminder(page)).toBeVisible();
  await page.clock.runFor(3_000);
  await expect(reminder(page)).toHaveCount(0);
  await page.clock.runFor(30_000);
  await expect(reminder(page)).toHaveCount(0);
});

test('interacting with the parrot immediately dismisses its standing reminder and responds', async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 360 });
  await desktopFixture(page, { species: 'parrot' });
  await page.evaluate(() => window.__standTest.push());
  await expect(reminder(page)).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await sprite(page).hover();
  await page.getByRole('button', { name: '喂食', exact: true }).click();
  await expect(reminder(page)).toHaveCount(0);
  await expect(page.locator('.overlay-speech[role="status"]').filter({ hasText: '种子真好吃' })).toBeVisible();
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return sprite(page).getAttribute('data-clip');
  }).toBe('feed');
  expect(await page.evaluate(() => window.__standTest.snapshot().standReminder)).toBeNull();
});

test('a preview parrot stops walking for its reminder and resumes a requested care action', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page, { species: 'parrot' });
  await reachReminder(page);
  const position = await page.locator('.stage-pet-anchor').getAttribute('style');
  await page.clock.runFor(1_000);
  await expect(page.locator('.stage-pet-anchor')).toHaveAttribute('style', position);
  await page.getByRole('button', { name: '喂食', exact: true }).click();
  await expect(reminder(page)).toHaveCount(0);
  await expect(page.locator('.speech-bubble[role="status"]').filter({ hasText: '种子真好吃' })).toBeVisible();
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return sprite(page).getAttribute('data-clip');
  }).toBe('feed');
});

test('a pending reminder waits for the expression chooser, then can be acknowledged', async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 360 });
  await desktopFixture(page);
  await sprite(page).hover();
  await page.getByRole('button', { name: '换个表情', exact: true }).click();
  await page.evaluate(() => window.__standTest.push());
  await page.clock.runFor(1_000);
  await expect(reminder(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__standTest.snapshot().standReminder.phase)).toBe('pending');
  await page.keyboard.press('Escape');
  await expect(reminder(page)).toBeVisible();
  await reminder(page).getByRole('button', { name: '知道啦', exact: true }).click();
  await expect(reminder(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__standTest.snapshot().standReminder)).toBeNull();
});

test('opening the chooser dismisses an already visible standing reminder', async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 360 });
  await desktopFixture(page);
  await page.evaluate(() => window.__standTest.push());
  await expect(reminder(page)).toBeVisible();
  await sprite(page).hover();
  await page.getByRole('button', { name: '换个表情', exact: true }).click();
  await expect(reminder(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__standTest.snapshot().standReminder)).toBeNull();
});

test('the native control panel leaves reminders to its desktop companion', async ({ page }) => {
  await desktopFixture(page, { overlay: false });
  await page.evaluate(() => window.__standTest.push());
  await page.clock.runFor(1_000);
  await expect(reminder(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__standTest.snapshot().standReminder.phase)).toBe('pending');
  await reminderSwitch(page).click();
  await expect(reminderSwitch(page)).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => window.__standTest.snapshot().standReminder)).toBeNull();
});

for (const size of [.65, 1, 1.5]) test(`the ${size} desktop standing bubble stays inside its logical root and accepts pointer input`, async ({ page }) => {
  await page.setViewportSize({ width: Math.round(340 * size), height: Math.round(360 * size) });
  await desktopFixture(page, { size });
  await page.evaluate(() => window.__standTest.push());
  await expect(reminder(page)).toBeVisible();
  const bounds = await reminder(page).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const root = document.querySelector('.pet-overlay').getBoundingClientRect();
    const hitRegions = window.__standTest.hitRegions;
    return { contained: rect.left >= root.left && rect.right <= root.right && rect.top >= root.top && rect.bottom <= root.bottom,
      hitRegions, button: (() => { const button = element.querySelector('button').getBoundingClientRect();
        return { x: (button.left + button.right) / 2, y: (button.top + button.bottom) / 2 }; })() };
  });
  expect(bounds.contained).toBe(true);
  expect(bounds.hitRegions.length).toBeLessThanOrEqual(16);
  expect(bounds.hitRegions.some(region => region.type === 'rect' && bounds.button.x >= region.x
    && bounds.button.x <= region.x + region.width && bounds.button.y >= region.y && bounds.button.y <= region.y + region.height)).toBe(true);
  if (size === .65) await page.screenshot({ path: '.artifacts/hover-stand/standing-reminder-small.png' });
  await reminder(page).getByRole('button', { name: '知道啦', exact: true }).click();
  await expect(reminder(page)).toHaveCount(0);
});
