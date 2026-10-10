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

async function sampleSprite(page, duration = 1100) {
  return page.evaluate(duration => new Promise(resolve => {
    const values = [], start = performance.now();
    function sample(now) {
      const sprite = document.querySelector('.stage-pet');
      values.push({ frame: sprite.dataset.frame, clip: sprite.dataset.clip, left: sprite.parentElement.style.left, top: sprite.parentElement.style.top });
      if (now - start < duration) requestAnimationFrame(sample); else resolve(values);
    }
    requestAnimationFrame(sample);
  }), duration);
}

test('stretch and trick have species feedback and remain stationary', async ({ page }) => {
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.getByRole('button', { name: '伸懒腰', exact: true }).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-clip', 'stretch');
  const stretch = await sampleSprite(page);
  expect(new Set(stretch.map(item => item.left + item.top)).size).toBe(1);
  await expect(page.getByRole('status').filter({ hasText: /爪爪|伸/ }).first()).toBeVisible();
  await page.getByRole('button', { name: '小把戏', exact: true }).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-clip', 'hop');
  await expect(page.getByRole('status').filter({ hasText: /跳|把戏/ }).first()).toBeVisible();
  await page.goto('/?view=pet');
  await page.locator('.overlay-sprite').hover({ force: true });
  await expect(page.getByRole('button', { name: '伸懒腰', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '小把戏', exact: true })).toBeVisible();
  await expect(page.locator('.overlay-toolbar button')).toHaveCount(8);
});

test('pointer play uses many walking frames and pause freezes animation and position', async ({ page }) => {
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'motion');
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.getByRole('button', { name: '玩耍', exact: true }).click();
  const stage = await page.locator('.desktop-stage').boundingBox();
  await page.mouse.move(stage.x + stage.width * .83, stage.y + stage.height * .68);
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-clip', 'walk');
  const moving = await sampleSprite(page, 850);
  expect(new Set(moving.filter(item => item.clip === 'walk').map(item => item.frame)).size).toBeGreaterThanOrEqual(6);
  await page.getByRole('switch', { name: '暂停活动' }).click();
  const paused = await sampleSprite(page);
  expect(new Set(paused.map(item => item.frame)).size).toBe(1);
  expect(new Set(paused.map(item => item.left + item.top)).size).toBe(1);
});

test('reduced motion stops automatic playback and missing motion atlas retains legacy art', async ({ page }) => {
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'motion');
  const reduced = await sampleSprite(page);
  expect(new Set(reduced.map(item => item.frame)).size).toBe(1);
  expect(new Set(reduced.map(item => item.left + item.top)).size).toBe(1);
  await page.route('**/pets/*-motion.png', route => route.abort());
  await page.reload();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'legacy');
  await expect(page.locator('.stage-pet')).toHaveCSS('background-image', /cat\.png/);
});

async function expectStageContained(page, duration = 500) {
  const violations = await page.evaluate(duration => new Promise(resolve => {
    const violations = [], start = performance.now();
    function sample(now) {
      const stage = document.querySelector('.desktop-stage').getBoundingClientRect();
      const sprite = document.querySelector('.stage-pet').getBoundingClientRect();
      if (sprite.left < stage.left || sprite.right > stage.right || sprite.top < stage.top || sprite.bottom > stage.bottom) if (violations.length < 3) violations.push({ stage: stage.toJSON(), sprite: sprite.toJSON() });
      if (now - start < duration) requestAnimationFrame(sample); else resolve(violations);
    }
    requestAnimationFrame(sample);
  }), duration);
  expect(violations).toEqual([]);
}

test('maximum phone pet stays inside the stage when dragged, chased, and resized at corners', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.getByRole('slider', { name: '伙伴大小' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('slider', { name: '伙伴大小' })).toHaveValue('1.5');
  await page.locator('.desktop-stage').scrollIntoViewIfNeeded();
  const stage = await page.locator('.desktop-stage').boundingBox();
  for (const [x, y] of [[1, 1], [.01, .99], [.99, .01], [.99, .99]]) {
    const sprite = await page.locator('.stage-pet').boundingBox();
    await page.mouse.move(sprite.x + sprite.width / 2, sprite.y + sprite.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width * x, stage.y + stage.height * y, { steps: 3 });
    await expectStageContained(page);
    await page.mouse.up();
  }
  await page.getByRole('button', { name: '玩耍', exact: true }).click();
  await page.locator('.desktop-stage').scrollIntoViewIfNeeded();
  const chaseStage = await page.locator('.desktop-stage').boundingBox();
  await page.mouse.move(chaseStage.x + 1, chaseStage.y + 1);
  await expectStageContained(page, 1200);
  await page.mouse.move(chaseStage.x + chaseStage.width - 1, chaseStage.y + chaseStage.height - 1);
  await expectStageContained(page, 1200);
  await page.setViewportSize({ width: 340, height: 844 });
  await expectStageContained(page);
});

test('maximum pet fits desktop and tablet stages across a mobile resize round-trip', async ({ page }) => {
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.getByRole('slider', { name: '伙伴大小' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('slider', { name: '伙伴大小' })).toHaveValue('1.5');
  await expectStageContained(page);
  await page.setViewportSize({ width: 700, height: 1000 });
  await expectStageContained(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectStageContained(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectStageContained(page);
});

test('fresh companion keeps its gait phase through a turn and interpolates each pose', async ({ page }) => {
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.getByRole('button', { name: '玩耍', exact: true }).click();
  const stage = await page.locator('.desktop-stage').boundingBox();
  await page.mouse.move(stage.x + stage.width * .88, stage.y + stage.height * .68);
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-clip', 'walk');
  const before = await page.locator('.stage-pet').evaluate(sprite => ({ elapsed: Number(sprite.dataset.elapsed), sequence: sprite.dataset.sequence }));
  await page.mouse.move(stage.x + stage.width * .12, stage.y + stage.height * .68);
  const values = await page.evaluate(() => new Promise(resolve => {
    const values = [], start = performance.now();
    function sample(now) {
      const sprite = document.querySelector('.stage-pet');
      values.push({ elapsed: Number(sprite.dataset.elapsed), sequence: sprite.dataset.sequence, mix: Number(sprite.dataset.mix), clip: sprite.dataset.clip, facing: sprite.style.getPropertyValue('--pet-facing'), canvas: Boolean(sprite.querySelector('canvas')) });
      if (now - start < 650) requestAnimationFrame(sample); else resolve(values);
    }
    requestAnimationFrame(sample);
  }));
  const walk = values.filter(item => item.clip === 'walk');
  expect(walk.length).toBeGreaterThan(10);
  expect(walk.every(item => item.elapsed >= before.elapsed && item.sequence === before.sequence)).toBe(true);
  expect(walk.some(item => item.facing === '-1')).toBe(true);
  expect(walk.every(item => item.canvas)).toBe(true);
  expect(new Set(walk.filter(item => item.mix > 0 && item.mix < 1).map(item => item.mix)).size).toBeGreaterThan(10);
});

test('available flow reaches the GPU after asynchronous atlas loading', async ({ page }) => {
  const gpuAvailable = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl')));
  test.skip(!gpuAvailable, 'Browser does not support WebGL');
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-renderer', 'webgl');
});

test('switching from a companion without flow releases its 2D canvas for the next species', async ({ page }) => {
  const gpuAvailable = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl')));
  test.skip(!gpuAvailable, 'Browser does not support WebGL');
  await page.route('**/pets/cat-flow.*', route => route.abort());
  await page.reload();
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-renderer', '2d');
  await page.getByRole('button', { name: /选择小狗/ }).click();
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await expect(page.locator('.stage-pet')).toHaveCSS('background-image', /dog-motion\.png/);
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-renderer', 'webgl');
});
