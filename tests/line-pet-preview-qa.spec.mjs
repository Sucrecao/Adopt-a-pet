import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('actual review playback exercises nine clips at normal and quarter speed for both pets', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/.artifacts/line-pets/index.html');
  await expect(page.locator('#anchor .pet-sprite')).toHaveAttribute('data-load-state', 'ready');
  const runs = [];
  for (const species of ['dog', 'cat']) {
    await page.locator(`[data-pet="${species}"]`).click();
    await expect(page.locator('#anchor .pet-sprite')).toHaveAttribute('data-load-state', 'ready');
    for (const speed of ['1', '.25']) {
      await page.locator('#speed').selectOption(speed);
      for (const action of ['walk', 'idle', 'pet', 'feed', 'groom', 'stretch', 'trick', 'rest', 'turn']) {
        const clip = action === 'trick' ? 'hop' : action;
        if (action === 'turn') {
          await page.locator('[data-action="walk"]').click();
          await expect(page.locator('#anchor .pet-sprite')).toHaveAttribute('data-clip', 'walk', { timeout: 15000 });
          await page.locator('#turn').click();
          await expect(page.locator('#anchor .pet-sprite')).toHaveAttribute('data-turning', 'true', { timeout: 15000 });
        } else {
          await page.locator(`[data-action="${action}"]`).click();
          await expect(page.locator('#anchor .pet-sprite')).toHaveAttribute('data-clip', clip, { timeout: 15000 });
        }
        const run = await page.evaluate(async ({ species, speed, clip }) => {
          const start = Date.now(), samples = [];
          await new Promise(resolve => {
            const record = () => {
              const sprite = document.querySelector('#anchor .pet-sprite'), canvas = sprite.querySelector('canvas');
              const bytes = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
              let hash = 2166136261;
              for (const value of bytes) hash = Math.imul(hash ^ value, 16777619) >>> 0;
              const snap = window.linePetPreview.snapshot();
              samples.push({ wall: Date.now(), clip: sprite.dataset.clip, transition: sprite.dataset.transition,
                frame: Number(sprite.dataset.frame), phase: Number(sprite.dataset.phase), distance: Number(sprite.dataset.motionDistance),
                hash, root: snap.rectGlobal, renderer: canvas.dataset.renderer });
              if (Date.now() - start >= 900) resolve(); else requestAnimationFrame(record);
            };
            requestAnimationFrame(record);
          });
          const accepted = samples.filter(sample => sample.clip === clip);
          const intervals = samples.slice(1).map((sample, index) => sample.wall - samples[index].wall).sort((a, b) => a - b);
          return { species, speed: Number(speed), clip, actualSamples: samples.length, acceptedSamples: accepted.length,
            uniqueActualPictures: new Set(accepted.map(sample => sample.hash)).size,
            p95IntervalMs: intervals[Math.floor(intervals.length * .95)] ?? 0, maxIntervalMs: intervals.at(-1) ?? 0,
            samples };
        }, { species, speed, clip });
        runs.push(run);
        expect(run.actualSamples).toBeGreaterThan(15);
        expect(run.acceptedSamples).toBeGreaterThan(8);
        expect(run.uniqueActualPictures).toBeGreaterThan(1);
        expect(run.samples.every(sample => sample.renderer === 'whole-frame-2d'
          && [sample.frame, sample.phase, sample.distance, sample.root?.x, sample.root?.y].every(Number.isFinite))).toBe(true);
      }
    }
    await page.locator('#pause').click();
    const frozen = await page.locator('#anchor canvas').evaluate(canvas => canvas.toDataURL());
    await page.waitForTimeout(180);
    expect(await page.locator('#anchor canvas').evaluate(canvas => canvas.toDataURL())).toBe(frozen);
    await page.screenshot({ path: `.artifacts/line-pets/qa-preview-${species}.png`, fullPage: true });
    await page.locator('#step').click();
    await expect(page.locator('#pause')).toHaveText('继续');
    await page.locator('#pause').click();
  }
  await page.setViewportSize({ width: 328, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await mkdir('.artifacts/line-pets', { recursive: true });
  await writeFile('.artifacts/line-pets/qa-preview-live-report.json', JSON.stringify({ runs, errors,
    scope: 'finite actual browser rAF playback sampled for 900ms per clip/rate/species; every authored source picture was audited separately; hardware scanout is not measured' }, null, 2) + '\n');
});
