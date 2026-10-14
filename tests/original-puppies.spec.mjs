import { test, expect } from '@playwright/test';

const labels = ['爱心', '送心', '抱心', '鲜花', '贴贴', '拥抱', '招手', '疑问', '玩闹', '委屈', '探头', '紧张', '面壁', '难过', '撒娇', '开心', '惊讶', '哭哭', '零食', '运动', '开饭', '歇歇', '哈欠', '睡觉'];
const savedState = page => page.evaluate(() => JSON.parse(localStorage.getItem('pawpal.companion.v1')));
const picker = page => page.getByLabel('原作动画', { exact: true });
const clipButton = (page, clip) => picker(page).getByRole('button', { name: `播放${labels[clip - 1]}`, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function adopt(page, species) {
  await page.locator(`.animal-${species}`).click();
  await page.getByLabel('给伙伴起个名字').fill('原作伙伴');
  await page.getByRole('button', { name: '在预览中领养原作伙伴', exact: true }).click();
  await expect(page.getByRole('heading', { name: '原作伙伴的桌面', exact: true })).toBeVisible();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-renderer', 'original-whole-frame');
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-load-state', 'ready');
}

async function selectClip(page, clip) {
  await clipButton(page, clip).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-original-clip', String(clip));
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-load-state', 'ready');
  await expect(clipButton(page, clip)).toHaveAttribute('aria-pressed', 'true');
}

async function sampleStage(page, duration = 350) {
  return page.evaluate(duration => new Promise(resolve => {
    const samples = [], started = performance.now();
    function sample(now) {
      const sprite = document.querySelector('.stage-pet');
      const canvas = sprite.querySelector('canvas');
      const anchor = document.querySelector('.stage-pet-anchor').getBoundingClientRect();
      samples.push({ frame: Number(sprite.dataset.frame), clip: sprite.dataset.originalClip,
        pixels: canvas.toDataURL(), x: anchor.x, y: anchor.y });
      if (now - started < duration) requestAnimationFrame(sample); else resolve(samples);
    }
    requestAnimationFrame(sample);
  }), duration);
}

// Both canvases use the browser's same PNG decoding and color conversion. This
// compares every RGBA byte across the complete native cell, including props and
// transparent borders, without a screenshot rescale or a hand-selected crop.
async function compareNativeCrop(page, species, clipId) {
  return page.evaluate(async ({ species, clipId }) => {
    const meta = await (await fetch(`/pets/${species}-original-v1.json`)).json();
    const clip = meta.clips.find(clip => clip.id === clipId);
    const image = new Image();
    image.src = '/' + clip.asset.replace(/^\//, '');
    await image.decode();
    const sprite = document.querySelector('.stage-pet');
    const actualCanvas = sprite.querySelector('canvas');
    const frame = Number(sprite.dataset.frame);
    const expectedCanvas = document.createElement('canvas');
    expectedCanvas.width = 320; expectedCanvas.height = 300;
    const expectedContext = expectedCanvas.getContext('2d');
    expectedContext.drawImage(image, frame % clip.columns * 320, Math.floor(frame / clip.columns) * 300, 320, 300, 0, 0, 320, 300);
    const actual = actualCanvas.getContext('2d').getImageData(0, 0, 320, 300).data;
    const expected = expectedContext.getImageData(0, 0, 320, 300).data;
    let mismatches = 0, paintedPixels = 0;
    for (let index = 0; index < expected.length; index++) {
      if (actual[index] !== expected[index]) mismatches++;
      if (index % 4 === 3 && actual[index] > 0) paintedPixels++;
    }
    return { clip: Number(sprite.dataset.originalClip), frame, frameCount: clip.durations.length,
      size: [actualCanvas.width, actualCanvas.height], mismatches, paintedPixels };
  }, { species, clipId });
}

for (const species of ['maltese', 'golden']) {
  test(`${species}: all 24 original clips load, advance, and draw their complete native source cell`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await adopt(page, species);
    await expect(picker(page).getByRole('button')).toHaveCount(24);
    for (let clip = 1; clip <= 24; clip++) {
      await selectClip(page, clip);
      await expect.poll(async () => Number(await page.locator('.stage-pet').getAttribute('data-frame'))).toBeGreaterThan(0);
      const comparison = await compareNativeCrop(page, species, clip);
      expect(comparison.clip, `clip ${clip} is displayed`).toBe(clip);
      expect(comparison.size, `clip ${clip} uses native canvas dimensions`).toEqual([320, 300]);
      expect(comparison.frame).toBeLessThan(comparison.frameCount);
      expect(comparison.paintedPixels, `clip ${clip} paints visible artwork`).toBeGreaterThan(100);
      expect(comparison.mismatches, `clip ${clip} equals the full original atlas crop`).toBe(0);
    }
    expect(errors).toEqual([]);
  });

  test(`${species}: selection persists and replaying the same button restarts from source frame zero`, async ({ page }) => {
    await adopt(page, species);
    await selectClip(page, 4);
    await expect.poll(async () => Number(await page.locator('.stage-pet').getAttribute('data-frame'))).toBeGreaterThan(1);
    const firstSelection = (await savedState(page)).originalAnimation;
    await page.locator('.stage-pet').evaluate(sprite => {
      window.originalReplayFrames = [];
      window.originalReplayObserver = new MutationObserver(() => window.originalReplayFrames.push(Number(sprite.dataset.frame)));
      window.originalReplayObserver.observe(sprite, { attributes: true, attributeFilter: ['data-frame'] });
    });
    await clipButton(page, 4).click();
    await expect.poll(async () => (await savedState(page)).originalAnimation.startedAt).toBeGreaterThan(firstSelection.startedAt);
    await expect.poll(() => page.evaluate(() => window.originalReplayFrames.includes(0))).toBe(true);
    await page.evaluate(() => window.originalReplayObserver.disconnect());
    await page.reload();
    await expect(page.locator(`.animal-${species}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: '原作伙伴的桌面', exact: true })).toBeVisible();
    await expect(page.locator('.stage-pet')).toHaveAttribute('data-original-clip', '4');
    await expect(page.locator('.stage-pet')).toHaveAttribute('data-load-state', 'ready');
    await expect(clipButton(page, 4)).toHaveAttribute('aria-pressed', 'true');
    expect((await savedState(page)).originalAnimation.clip).toBe(4);
  });

  test(`${species}: pause holds both source pixels and selection, then resumes playback`, async ({ page }) => {
    await adopt(page, species);
    await selectClip(page, 7);
    await expect.poll(async () => Number(await page.locator('.stage-pet').getAttribute('data-frame'))).toBeGreaterThan(1);
    await page.getByRole('switch', { name: '暂停活动', exact: true }).click();
    const selection = (await savedState(page)).originalAnimation;
    // The picker may disable paused choices or let the command reducer ignore
    // them; both must retain the current persisted selection and painted clip.
    if (await clipButton(page, 19).isEnabled()) await clipButton(page, 19).click();
    expect((await savedState(page)).originalAnimation).toEqual(selection);
    const frozen = await sampleStage(page);
    expect(new Set(frozen.map(sample => sample.frame)).size).toBe(1);
    expect(new Set(frozen.map(sample => sample.pixels)).size).toBe(1);
    expect(new Set(frozen.map(sample => sample.clip))).toEqual(new Set(['7']));
    await page.getByRole('switch', { name: '暂停活动', exact: true }).click();
    await expect.poll(async () => Number(await page.locator('.stage-pet').getAttribute('data-frame')) !== frozen[0].frame).toBe(true);
  });

  test(`${species}: reduced motion holds native artwork and original playback never wanders`, async ({ page }) => {
    await adopt(page, species);
    await selectClip(page, 7);
    const playing = await sampleStage(page, 450);
    expect(new Set(playing.map(sample => sample.frame)).size).toBeGreaterThan(1);
    expect(Math.max(...playing.map(sample => sample.x)) - Math.min(...playing.map(sample => sample.x))).toBeLessThan(.25);
    expect(Math.max(...playing.map(sample => sample.y)) - Math.min(...playing.map(sample => sample.y))).toBeLessThan(.25);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('.stage-pet')).toHaveAttribute('data-load-state', 'ready');
    const held = await sampleStage(page, 450);
    expect(new Set(held.map(sample => sample.frame)).size).toBe(1);
    expect(new Set(held.map(sample => sample.pixels)).size).toBe(1);
    expect((await compareNativeCrop(page, species, 7)).mismatches).toBe(0);
  });
}

test('legacy cat keeps its authored whole renderer and care controls', async ({ page }) => {
  await page.locator('.animal-cat').click();
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-atlas', 'whole');
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-renderer', 'whole-frame-2d');
  for (const label of ['喂食', '抚摸', '玩耍', '休息', '伸懒腰', '小把戏']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  const hunger = Number(await page.getByRole('progressbar', { name: '饱腹' }).getAttribute('aria-valuenow'));
  await page.getByRole('button', { name: '喂食', exact: true }).click();
  await expect(page.locator('.stage-pet')).toHaveAttribute('data-clip', 'feed');
  await expect.poll(async () => Number(await page.getByRole('progressbar', { name: '饱腹' }).getAttribute('aria-valuenow'))).toBeGreaterThan(hunger);
});
