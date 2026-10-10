import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:5173');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('adopt a named dog, feed it, change its range, and retain preferences', async ({ page }) => {
  await expect(page.getByText('浏览器预览', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /选择小狗/ }).click();
  await page.getByLabel('给伙伴起个名字').fill('豆包');
  await page.getByRole('button', { name: '在预览中领养豆包' }).click();
  await expect(page.getByRole('heading', { name: '豆包的桌面' })).toBeVisible();
  const hunger = page.getByRole('progressbar', { name: '饱腹' });
  const initial = Number(await hunger.getAttribute('aria-valuenow'));
  await page.getByRole('button', { name: '喂食', exact: true }).click();
  await expect.poll(async () => Number(await hunger.getAttribute('aria-valuenow'))).toBeGreaterThan(initial);
  await page.getByRole('button', { name: '贴着屏幕边缘' }).click();
  await expect(page.getByRole('button', { name: '贴着屏幕边缘' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('switch', { name: '暂停活动' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '豆包的桌面' })).toBeVisible();
  await expect(page.getByRole('switch', { name: '暂停活动' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: '贴着屏幕边缘' })).toHaveAttribute('aria-pressed', 'true');
});

test('parrot play has feedback and the overlay exposes compact controls', async ({ page }) => {
  await page.getByRole('button', { name: /选择鹦鹉/ }).click();
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.getByRole('button', { name: '玩耍', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /飞|玩|开心/ }).first()).toBeVisible();
  await page.goto('http://127.0.0.1:5173/?view=pet');
  await page.getByRole('button', { name: /抚摸/ }).hover();
  await expect(page.getByRole('button', { name: '打开伙伴面板' })).toBeVisible();
});

test('rename preserves care stats and paused pets do not perform interactions', async ({ page }) => {
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.getByRole('button', { name: '喂食', exact: true }).click();
  const hunger = Number(await page.getByRole('progressbar', { name: '饱腹' }).getAttribute('aria-valuenow'));
  await page.getByLabel('给伙伴起个名字').fill('小年糕');
  await page.getByRole('button', { name: '为伙伴改名为小年糕' }).click();
  await expect(page.getByRole('heading', { name: '小年糕的桌面' })).toBeVisible();
  expect(Number(await page.getByRole('progressbar', { name: '饱腹' }).getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(hunger - 1);
  await page.getByRole('switch', { name: '暂停活动' }).click();
  await page.getByRole('button', { name: '玩耍', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /先关闭暂停/ })).toBeVisible();
});

test('desktop and phone layouts fit the viewport with loaded companions', async ({ page }) => {
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.waitForFunction(() => {
    const sprite = document.querySelector('.pet-sprite');
    const url = getComputedStyle(sprite).backgroundImage.slice(5, -2);
    return new Promise(resolve => { const image = new Image(); image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = url; });
  });
  await page.screenshot({ path: '/tmp/pawpal-desktop-panel.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '喂食', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/pawpal-mobile-panel.png', fullPage: true });
});
