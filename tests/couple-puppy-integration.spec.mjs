import { test, expect } from '@playwright/test';
import { getBeijingPeriod } from '../src/core/companion-routine.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

for (const width of [1440, 390]) test(`Maltese is the fresh onboarding selection at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await expect(page.locator('.adoption-card')).toHaveCount(3);
  await expect(page.locator('.animal-maltese')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('给伙伴起个名字')).toHaveValue('马尔济斯');
  await expect(page.locator('.animal-maltese .card-trait')).toHaveText('Moonlab · 原作动画');
  await expect(page.locator('.animal-golden .card-trait')).toHaveText('Moonlab · 原作动画');
  const layout = await page.evaluate(() => {
    const grid = document.querySelector('.adoption-grid').getBoundingClientRect();
    return { scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      cards: [...document.querySelectorAll('.adoption-card')].map(card => {
        const rect = card.getBoundingClientRect();
        return rect.left >= grid.left - .5 && rect.right <= grid.right + .5;
      }) };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
  expect(layout.cards.every(Boolean)).toBe(true);
});

for (const species of ['maltese', 'golden']) test(`${species} adopts, selects an original animation and survives reload`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator(`.animal-${species}`).click();
  await page.getByLabel('给伙伴起个名字').fill('我的线条伙伴');
  await page.getByRole('button', { name: '在预览中领养我的线条伙伴', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的线条伙伴的桌面' })).toBeVisible();
  await page.getByRole('button', { name: '换个表情', exact: true }).click();
  await page.getByRole('button', { name: '播放拥抱', exact: true }).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-original-clip', '6');
  await page.getByRole('switch', { name: '暂停活动', exact: true }).click();
  await page.reload();
  await expect(page.locator(`.animal-${species}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: '我的线条伙伴的桌面' })).toBeVisible();
  await expect(page.getByRole('switch', { name: '暂停活动', exact: true })).toHaveAttribute('aria-checked', 'true');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pawpal.companion.v1')));
  expect(saved.species).toBe(species);
  expect(saved.name).toBe('我的线条伙伴');
  expect(saved.adopted).toBe(true);
  expect(errors).toEqual([]);
});

for (const species of ['cat', 'dog']) test(`saved ${species} migrates to Maltese and preserves custom name and preferences`, async ({ page }) => {
  const settings = { size: .85, movement: 'edge', sound: true, alwaysOnTop: false, paused: true };
  const stats = { hunger: 62, energy: 73, happiness: 84, bond: 15 };
  await page.evaluate(({ species, settings, stats }) => localStorage.setItem('pawpal.companion.v1', JSON.stringify({
    species, name: '老朋友', adopted: true, settings, stats,
    action: { type: 'feed', until: Date.now() + 4000 },
    originalAnimation: { clip: 24, startedAt: Date.now() }, updatedAt: Date.now(), lastInteraction: 0,
  })), { species, settings, stats });
  await page.reload();
  await expect(page.locator('.adoption-card')).toHaveCount(3);
  await expect(page.locator('.animal-maltese')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.adoption-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label')))).toEqual(['选择Maltese 马尔济斯', '选择Golden Retriever 金毛', '选择鹦鹉 青柠']);
  await expect(page.getByRole('heading', { name: '老朋友的桌面', exact: true })).toBeVisible();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-renderer', 'original-whole-frame');
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-original-clip', String(getBeijingPeriod(Date.now()).clip));
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-load-state', 'ready');
  // Loading normalizes the in-memory state; the next normal tick persists it.
  await page.evaluate(async () => (await import('/src/bridge.js')).bridge.dispatch({ type: 'tick' }));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pawpal.companion.v1')));
  expect(saved.species).toBe('maltese');
  expect(saved.name).toBe('老朋友');
  expect(saved.adopted).toBe(true);
  expect(saved.settings).toEqual(settings);
  expect(saved.stats).toEqual(stats);
  expect(saved.action).toEqual({ type: 'idle', until: 0 });
  expect(saved.originalAnimation).toEqual({ clip: 7, startedAt: 0 });
});
