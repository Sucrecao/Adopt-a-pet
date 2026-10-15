import { test, expect } from '@playwright/test';

const sprite = page => page.locator('.stage-pet');
const picker = page => page.getByRole('dialog', { name: '换个表情', exact: true });

async function prepare(page, { species = 'maltese', time = '2026-10-14T11:30:00Z' } = {}) {
  const date = new Date(time);
  await page.clock.install({ time: date });
  await page.clock.pauseAt(date);
  await page.addInitScript(({ species, now }) => {
    Math.random = () => 0;
    localStorage.setItem('pawpal.companion.v1', JSON.stringify({
      species, name: '小伙伴', adopted: true,
      stats: { hunger: 78, energy: 85, happiness: 80, bond: 0 },
      settings: { size: 1, movement: 'free', sound: false, alwaysOnTop: true, paused: false },
      action: { type: 'idle', until: 0 }, originalAnimation: { clip: 7, startedAt: 0 },
      lastInteraction: 0, updatedAt: now,
    }));
  }, { species, now: date.getTime() });
  await page.goto('/');
  await ready(page);
}

async function ready(page, clip) {
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return { state: await sprite(page).getAttribute('data-load-state'), clip: await sprite(page).getAttribute('data-clip') };
  }).toEqual({ state: 'ready', clip: String(clip ?? await sprite(page).getAttribute('data-original-clip')) });
}

async function select(page, label, clip) {
  await page.locator('[data-expression-trigger]').click();
  await picker(page).getByRole('button', { name: `播放${label}`, exact: true }).click();
  await ready(page, clip);
}

async function advance(page, milliseconds) {
  // Yield between short clock runs so an atlas can decode and RAF paints the
  // actual final source frame before the routine receives its completion.
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) await page.clock.runFor(Math.min(100, milliseconds - elapsed));
}

async function finish(page, clip) {
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return { clip: await sprite(page).getAttribute('data-clip'), done: await sprite(page).getAttribute('data-done') };
  }, { intervals: [0], timeout: 15_000 }).toEqual({ clip: String(clip), done: 'true' });
}

for (const species of ['maltese', 'golden']) test(`${species}: a complete manual original holds its last frame briefly, then settles into relaxed idle`, async ({ page }) => {
  await prepare(page, { species });
  await select(page, '鲜花', 4);
  await expect(sprite(page)).toHaveAttribute('data-original-mode', 'manual');
  await advance(page, 200);
  await expect.poll(() => sprite(page).getAttribute('data-frame')).not.toBe('0');
  await finish(page, 4);
  const finalFrame = await sprite(page).getAttribute('data-frame');
  await advance(page, 700);
  await expect(sprite(page)).toHaveAttribute('data-clip', '4');
  await expect(sprite(page)).toHaveAttribute('data-frame', finalFrame);
  await advance(page, 1_000);
  await ready(page, 22);
  await expect(sprite(page)).toHaveAttribute('data-original-mode', 'automatic');
});

test('evening greeting settles, and a quiet original idle reaction restarts only after its breathing room', async ({ page }) => {
  await prepare(page);
  await expect(sprite(page)).toHaveAttribute('data-clip', '6');
  await finish(page, 6);
  await advance(page, 1_600);
  await ready(page, 22);
  await finish(page, 22);
  const firstSequence = Number(await sprite(page).getAttribute('data-sequence'));
  await page.evaluate(() => {
    const element = document.querySelector('.stage-pet');
    window.idleSequenceFrames = [];
    window.idleSequenceObserver = new MutationObserver(() => {
      window.idleSequenceFrames.push({ sequence: Number(element.dataset.sequence), frame: Number(element.dataset.frame) });
    });
    window.idleSequenceObserver.observe(element, { attributes: true, attributeFilter: ['data-sequence', 'data-frame'] });
  });
  // The first short greeting has faded; an occasional original motion should
  // not itself trigger more speech or replay continuously.
  await advance(page, 13_000);
  await expect(sprite(page)).toHaveAttribute('data-sequence', String(firstSequence));
  await expect(page.locator('.gentle-speech[role="status"]')).toHaveCount(0);
  await advance(page, 2_500);
  await expect.poll(async () => Number(await sprite(page).getAttribute('data-sequence'))).toBeGreaterThan(firstSequence);
  const recorded = await page.evaluate(() => window.idleSequenceFrames);
  expect(recorded.some(sample => sample.sequence > firstSequence && sample.frame === 0)).toBe(true);
  expect(recorded.some(sample => sample.sequence > firstSequence && sample.frame > 0)).toBe(true);
  await expect(page.locator('.gentle-speech[role="status"]')).toHaveCount(0);
  await page.evaluate(() => window.idleSequenceObserver.disconnect());
});

test('pausing the final source frame freezes the settling hold, then resumes it', async ({ page }) => {
  await prepare(page);
  await select(page, '鲜花', 4);
  await finish(page, 4);
  await page.getByRole('switch', { name: '暂停活动', exact: true }).click();
  const frame = await sprite(page).getAttribute('data-frame');
  const elapsed = await sprite(page).getAttribute('data-elapsed');
  await page.clock.runFor(60_000);
  await expect(sprite(page)).toHaveAttribute('data-clip', '4');
  await expect(sprite(page)).toHaveAttribute('data-frame', frame);
  await expect(sprite(page)).toHaveAttribute('data-elapsed', elapsed);
  await page.getByRole('switch', { name: '暂停活动', exact: true }).click();
  await advance(page, 600);
  await expect(sprite(page)).toHaveAttribute('data-clip', '4');
  await advance(page, 1_000);
  await ready(page, 22);
});

test('the expression chooser preserves a completed original and its settling time', async ({ page }) => {
  await prepare(page);
  await select(page, '鲜花', 4);
  await finish(page, 4);
  await page.locator('[data-expression-trigger]').click();
  await expect(picker(page)).toBeVisible();
  const frame = await sprite(page).getAttribute('data-frame');
  await page.clock.runFor(60_000);
  await expect(sprite(page)).toHaveAttribute('data-clip', '4');
  await expect(sprite(page)).toHaveAttribute('data-frame', frame);
  await page.keyboard.press('Escape');
  await advance(page, 600);
  await expect(sprite(page)).toHaveAttribute('data-clip', '4');
  await advance(page, 1_000);
  await ready(page, 22);
});

test('a rapid new manual choice cannot be displaced by completion from the previous original', async ({ page }) => {
  await prepare(page);
  await select(page, '鲜花', 4);
  await finish(page, 4);
  await select(page, '拥抱', 6);
  await advance(page, 200);
  await select(page, '开饭', 21);
  await advance(page, 1_500);
  await expect(sprite(page)).toHaveAttribute('data-clip', '21');
  await expect(sprite(page)).toHaveAttribute('data-original-mode', 'manual');
  await finish(page, 21);
  await advance(page, 1_600);
  await ready(page, 22);
});

test('bedtime keeps its complete sleeping original without idle replays or speech', async ({ page }) => {
  await prepare(page, { time: '2026-10-14T15:30:00Z' });
  await finish(page, 24);
  const sequence = await sprite(page).getAttribute('data-sequence');
  const elapsed = await sprite(page).getAttribute('data-elapsed');
  const history = [];
  for (let elapsed = 0; elapsed < 60_000; elapsed += 500) {
    await page.clock.runFor(500);
    const sample = await sprite(page).evaluate(element => ({
      at: Date.now(), clip: element.dataset.clip, requested: element.dataset.originalClip,
      frame: element.dataset.frame, sequence: element.dataset.sequence, mode: element.dataset.originalMode,
      selection: JSON.parse(localStorage.getItem('pawpal.companion.v1')).originalAnimation,
      hidden: document.hidden,
      menuOpen: Boolean(document.querySelector('.expression-picker')),
    }));
    if (!history.length || history.at(-1).sequence !== sample.sequence) history.push(sample);
  }
  await expect(sprite(page)).toHaveAttribute('data-clip', '24');
  expect(await sprite(page).getAttribute('data-sequence'), JSON.stringify(history)).toBe(sequence);
  await expect(sprite(page)).toHaveAttribute('data-elapsed', elapsed);
  await expect(page.locator('.gentle-speech[role="status"]')).toHaveCount(0);
});
