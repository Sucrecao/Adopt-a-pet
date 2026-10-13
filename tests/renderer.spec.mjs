import { test, expect } from '@playwright/test';

test('preview keeps the world root still while care connects to its first walking step',async({page})=>{
  await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.getByRole('button',{name:/在预览中领养/}).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas','whole');
  await page.getByRole('button',{name:'喂食',exact:true}).click();await page.waitForTimeout(850);
  await page.getByRole('button',{name:'玩耍',exact:true}).click();
  const area=await page.locator('.desktop-stage').boundingBox();await page.mouse.move(area.x+area.width*.9,area.y+20);
  const values=await page.evaluate(()=>new Promise(resolve=>{
    const rows=[],start=performance.now();function sample(now){const pet=document.querySelector('.stage-pet'),root=document.querySelector('.stage-pet-anchor').getBoundingClientRect();rows.push({x:root.x,distance:Number(pet.dataset.motionDistance),transition:pet.dataset.transition,ground:pet.dataset.ground});if(now-start<150)requestAnimationFrame(sample);else resolve(rows);}requestAnimationFrame(sample);
  }));
  expect(values.some(row=>row.transition==='walk.enter')).toBe(true);
  const preparation=values.filter(row=>row.transition==='walk.enter');
  expect(Math.max(...preparation.map(row=>row.x))-Math.min(...preparation.map(row=>row.x))).toBeLessThan(.25);
  expect(new Set(preparation.map(row=>row.distance)).size).toBe(1);
  const before=await page.locator('.stage-pet-anchor').boundingBox();
  await expect.poll(async()=>{const after=await page.locator('.stage-pet-anchor').boundingBox();return after.x-before.x;},{timeout:3000}).toBeGreaterThan(5);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('adopt a named dog, feed it, change its range, and retain preferences', async ({ page }) => {
  await expect(page.getByText('浏览器预览', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /选择小狗/ }).click();
  await page.getByLabel('给伙伴起个名字').fill('豆包');
  await page.getByRole('button', { name: '在预览中领养豆包' }).click();
  await expect(page.getByRole('heading', { name: '豆包的桌面' })).toBeVisible();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  const hunger = page.getByRole('progressbar', { name: '饱腹' });
  const initial = Number(await hunger.getAttribute('aria-valuenow'));
  await page.getByRole('button', { name: '喂食', exact: true }).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-clip', 'feed');
  const feedFrames = await page.evaluate(async () => {
    const { PETS } = await import('/src/core/pets.js');
    return (await (await fetch('/' + PETS.find(pet => pet.id === 'dog').wholeMetaAsset)).json()).clips.feed.frames;
  });
  await expect.poll(async () => feedFrames.includes(Number(await page.locator('.stage-pet').getAttribute('data-frame')))).toBe(true);
  await expect.poll(async () => Number(await hunger.getAttribute('aria-valuenow'))).toBeGreaterThan(initial);
  await page.getByRole('button', { name: '贴着屏幕边缘' }).click();
  await expect(page.getByRole('button', { name: '贴着屏幕边缘' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('switch', { name: '暂停活动' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '豆包的桌面' })).toBeVisible();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  await expect(page.getByRole('switch', { name: '暂停活动' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: '贴着屏幕边缘' })).toHaveAttribute('aria-pressed', 'true');
});

test('parrot play has feedback and the overlay exposes compact controls', async ({ page }) => {
  await page.getByRole('button', { name: /选择鹦鹉/ }).click();
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  await page.getByRole('button', { name: '玩耍', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /飞|玩|开心/ }).first()).toBeVisible();
  await page.goto('/?view=pet');
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
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-renderer', 'whole-frame-2d');
  await page.screenshot({ path: '/tmp/pawpal-desktop-panel.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '喂食', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/pawpal-mobile-panel.png', fullPage: true });
});

async function sampleSprite(page, duration = 1100, pixels = false) {
  return page.evaluate(({duration,pixels}) => new Promise(resolve => {
    const values = [], start = performance.now();
    function sample(now) {
      const sprite = document.querySelector('.stage-pet');
      values.push({ frame: sprite.dataset.frame, clip: sprite.dataset.clip, phase: sprite.dataset.phase,
        ...(pixels ? {pixels:sprite.querySelector('canvas').toDataURL()} : {}), left: sprite.parentElement.style.left, top: sprite.parentElement.style.top });
      if (now - start < duration) requestAnimationFrame(sample); else resolve(values);
    }
    requestAnimationFrame(sample);
  }), {duration,pixels});
}

test('stretch and trick have species feedback and remain stationary', async ({ page }) => {
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  await page.getByRole('button', { name: '伸懒腰', exact: true }).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-clip', 'stretch');
  const stretch = await sampleSprite(page);
  expect(new Set(stretch.map(item => item.left + item.top)).size).toBe(1);
  expect(new Set(stretch.map(item => item.frame)).size).toBeGreaterThan(2);
  await expect(page.getByRole('status').filter({ hasText: /爪爪|伸/ }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => Date.now() - JSON.parse(localStorage.getItem('pawpal.companion.v1')).lastInteraction)).toBeGreaterThanOrEqual(850);
  await page.getByRole('button', { name: '小把戏', exact: true }).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-clip', 'hop');
  await expect(page.getByRole('status').filter({ hasText: /跳|把戏/ }).first()).toBeVisible();
  await page.goto('/?view=pet');
  await page.locator('.overlay-sprite').hover({ force: true });
  await expect(page.getByRole('button', { name: '伸懒腰', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '小把戏', exact: true })).toBeVisible();
  await expect(page.locator('.overlay-toolbar button')).toHaveCount(8);
});

test('pointer play paints distance-driven paw poses and pause freezes pixels and position', async ({ page }) => {
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.getByRole('button', { name: '玩耍', exact: true }).click();
  const stage = await page.locator('.desktop-stage').boundingBox();
  await page.mouse.move(stage.x + stage.width * .83, stage.y + stage.height * .68);
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-clip', 'walk');
  const moving = await sampleSprite(page, 850, true);
  expect(new Set(moving.filter(item => item.clip === 'walk').map(item => item.pixels)).size).toBeGreaterThanOrEqual(6);
  expect(new Set(moving.filter(item => item.clip === 'walk').map(item => item.phase)).size).toBeGreaterThanOrEqual(6);
  await page.getByRole('switch', { name: '暂停活动' }).click();
  const paused = await sampleSprite(page, 300, true);
  expect(new Set(paused.map(item => item.frame)).size).toBe(1);
  expect(new Set(paused.map(item => item.pixels)).size).toBe(1);
  expect(new Set(paused.map(item => item.left + item.top)).size).toBe(1);
});

test('reduced motion stops whole playback and missing animation groups retain legacy art', async ({ page }) => {
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  const reduced = await sampleSprite(page);
  expect(new Set(reduced.map(item => item.frame)).size).toBe(1);
  expect(new Set(reduced.map(item => item.left + item.top)).size).toBe(1);
  await page.route('**/pets/*-whole-v*', route => route.abort());
  await page.route(/pets\/.*-(motion|rig)\.png$/, route => route.abort());
  await page.reload();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole-fallback');
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

test('fresh companion preserves distance phase through an in-place reversal and resumes walking', async ({ page }) => {
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await page.getByRole('button', { name: '玩耍', exact: true }).click();
  const stage = await page.locator('.desktop-stage').boundingBox();
  const pet = page.locator('.stage-pet');
  await expect(pet).toHaveAttribute('data-atlas', 'whole');
  await page.mouse.move(stage.x + stage.width * .88, stage.y + stage.height * .68);
  await expect(pet).toHaveAttribute('data-clip', 'walk');
  const before = await pet.evaluate(sprite => ({ elapsed: Number(sprite.dataset.elapsed), sequence: Number(sprite.dataset.sequence) }));
  await pet.evaluate(sprite=>{
    window.wholeTurnFrames=[];
    window.wholeTurnObserver=new MutationObserver(()=>{if(sprite.dataset.turning==='true')window.wholeTurnFrames.push(Number(sprite.dataset.frame));});
    window.wholeTurnObserver.observe(sprite,{attributes:true,attributeFilter:['data-frame']});
  });
  await page.mouse.move(stage.x + stage.width * .12, stage.y + stage.height * .68);
  await expect(pet).toHaveAttribute('data-turning', 'true');
  const values = await page.evaluate(() => new Promise(resolve => {
    const values = [], start = performance.now();
    function sample(now) {
      const sprite = document.querySelector('.stage-pet'), root = document.querySelector('.stage-pet-anchor').getBoundingClientRect();
      values.push({ frame: Number(sprite.dataset.frame), nextFrame:Number(sprite.dataset.nextFrame), ground:sprite.dataset.ground?JSON.parse(sprite.dataset.ground):null, transition:sprite.dataset.transition, elapsed: Number(sprite.dataset.elapsed), sequence: Number(sprite.dataset.sequence), phase: Number(sprite.dataset.phase), distance: Number(sprite.dataset.motionDistance), size: sprite.clientWidth, clip: sprite.dataset.clip, facing: sprite.dataset.facing, turning: sprite.dataset.turning === 'true', orientation: Number(sprite.dataset.orientation), x: root.x, y: root.y, canvas: Boolean(sprite.querySelector('canvas')) });
      if (now - start < 1600) requestAnimationFrame(sample); else resolve(values);
    }
    requestAnimationFrame(sample);
  }));
  const turn = values.filter(item => item.turning), walk = values.filter(item => item.clip === 'walk');
  const metadata = await page.evaluate(async () => {
    const { PETS } = await import('/src/core/pets.js');
    return (await (await fetch('/' + PETS.find(pet => pet.id === 'cat').wholeMetaAsset)).json());
  });
  expect(turn.length).toBeGreaterThan(10);
  expect(turn.every(item => item.clip === 'turn' && item.elapsed >= 0 && item.elapsed < 800)).toBe(true);
  const paintedTurnFrames=await page.evaluate(()=>{window.wholeTurnObserver.disconnect();return window.wholeTurnFrames;});
  expect(new Set(paintedTurnFrames.filter(frame=>metadata.clips.turn.frames.includes(frame))).size).toBe(16);
  expect(new Set(turn.map(item => item.phase)).size).toBe(1);
  expect(new Set(turn.map(item => item.distance)).size).toBe(1);
  expect(Math.max(...turn.map(item => item.x)) - Math.min(...turn.map(item => item.x))).toBeLessThan(.5);
  expect(Math.max(...turn.map(item => item.y)) - Math.min(...turn.map(item => item.y))).toBeLessThan(.5);
  expect(walk.length).toBeGreaterThan(10);
  expect(values.every(item => item.canvas)).toBe(true);
  expect(turn[0].sequence).toBeGreaterThan(before.sequence);
  expect(walk[0].sequence).toBeGreaterThan(turn[0].sequence);
  expect(walk.every(item => item.facing === '-1' && !item.turning)).toBe(true);
  expect(new Set(walk.map(item => item.phase)).size).toBeGreaterThan(10);
  const preparation=walk.filter(item=>item.transition||item.ground?.mode==='enter');
  expect(preparation.length).toBeGreaterThan(0);
  expect(new Set(preparation.map(item=>item.distance)).size).toBe(1);
  expect(Math.max(...preparation.map(item=>item.x))-Math.min(...preparation.map(item=>item.x))).toBeLessThan(.5);
  const first = turn[0], last = walk.at(-1);
  const stride = metadata.stride ?? 64;
  expect(last.phase - first.phase).toBeCloseTo((last.distance - first.distance) * 256 / last.size / stride, 6);
  await page.getByRole('switch', { name: '暂停活动' }).click();
  await page.waitForTimeout(60);
  const frozen = await pet.evaluate(sprite => ({ phase: sprite.dataset.phase, pixels: sprite.querySelector('canvas').toDataURL() }));
  await page.waitForTimeout(160);
  expect(await pet.evaluate(sprite => ({ phase: sprite.dataset.phase, pixels: sprite.querySelector('canvas').toDataURL() }))).toEqual(frozen);
});

test('complete character artwork loads the whole renderer', async ({ page }) => {
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-renderer', 'whole-frame-2d');
});

test('switching from missing animation groups recovers the next species whole artwork', async ({ page }) => {
  await page.route('**/pets/cat-whole-v*', route => route.abort());
  await page.route(/pets\/cat-(rig\.(png|json)|flow\.(bin|json))$/, route => route.abort());
  await page.reload();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole-fallback');
  await expect(page.locator('.stage-pet canvas')).toHaveCSS('visibility', 'hidden');
  await page.getByRole('button', { name: /选择小狗/ }).click();
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await expect(page.locator('.stage-pet')).toHaveCSS('background-image', /dog\.png/);
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-renderer', 'whole-frame-2d');
});
