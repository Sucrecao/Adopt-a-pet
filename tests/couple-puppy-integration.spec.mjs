import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

for (const width of [1440, 390]) test(`Maltese is the fresh onboarding selection at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await expect(page.locator('.adoption-card')).toHaveCount(5);
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
