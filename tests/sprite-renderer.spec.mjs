import { test, expect } from '@playwright/test';

async function rendererProbe(page, mode = 'webgl', localFlow = false, encoding = 'signed-half-pixel-rgba') {
  await page.goto('/');
  return page.evaluate(async ({ mode, localFlow, encoding }) => {
    const { createSpriteRenderer } = await import('/src/rendering/sprite-renderer.js');
    const source = document.createElement('canvas');
    source.width = 1536; source.height = 1024;
    const ink = source.getContext('2d');
    ink.fillStyle = '#e0523d';
    for (const [frame, x] of [[0, 100], [1, 140], [16, 180]]) {
      ink.beginPath(); ink.arc(frame % 6 * 256 + x, Math.floor(frame / 6) * 256 + 120, 8, 0, Math.PI * 2); ink.fill();
    }
    const image = new Image(); image.src = source.toDataURL(); await image.decode();
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    if (mode === '2d') {
      const getContext = canvas.getContext.bind(canvas);
      canvas.getContext = (type, ...args) => type.startsWith('webgl') ? null : getContext(type, ...args);
    }
    const tile = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const source = !localFlow || Math.abs(x * 4 + 2 - 100) < 14 && Math.abs(y * 4 + 2 - 130) < 14;
      const target = !localFlow || Math.abs(x * 4 + 2 - 140) < 14 && Math.abs(y * 4 + 2 - 130) < 14;
      const delta = encoding === 'signed-one-pixel-rgba' ? 40 : 80;
      tile.set([source ? 128 + delta : 128, 128, target ? 128 - delta : 128, 128], (y * 64 + x) * 4);
    }
    const renderer = createSpriteRenderer(canvas, {
      species: 'cat', motionImage: image, legacyImage: image,
      flowMeta: { version: 1, size: 64, frameSize: 256, encoding, pairs: [[0, 1]] }, flowBytes: tile,
    });
    const pose = mix => ({ atlas: 'motion', frame: 0, nextFrame: 1, mix, clip: 'walk' });
    function pixels() {
      const copy = document.createElement('canvas'); copy.width = copy.height = 256;
      const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0, 256, 256);
      const bytes = ctx.getImageData(0, 0, 256, 256).data;
      const at = (x, y) => Array.from(bytes.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4));
      return { hash: canvas.toDataURL(), corner: at(0, 0), old: at(100, 130), middle: at(120, 130), next: at(140, 130) };
    }
    renderer.draw(pose(0), 0); const first = pixels();
    renderer.draw(pose(.5), 16); const middle = pixels();
    renderer.draw(pose(1), 32); const last = pixels();
    const hashes = [];
    for (let i = 0; i <= 20; i++) { renderer.draw(pose(i / 20), 40 + i * 16); hashes.push(pixels().hash); }
    renderer.draw(pose(0), 500); const before = pixels().hash;
    const stretch = { atlas: 'motion', frame: 16, nextFrame: 16, mix: 0, clip: 'stretch' };
    renderer.draw(stretch, 516); const transitionStart = pixels().hash;
    renderer.draw(stretch, 606); const transitionMiddle = pixels().hash;
    renderer.draw(stretch, 716); const transitionEnd = pixels().hash;
    const rest = { atlas: 'legacy', frame: 0, nextFrame: 0, mix: 0, clip: 'rest', stopped: true };
    renderer.draw(rest, 732); const frozen = pixels().hash;
    renderer.draw(rest, 1732); const frozenLater = pixels().hash;
    const backend = canvas.dataset.renderer;
    renderer.dispose(); canvas.remove();
    return { backend, first, middle, last, distinct: new Set(hashes).size, before, transitionStart, transitionMiddle, transitionEnd, frozen, frozenLater };
  }, { mode, localFlow, encoding });
}

test('GPU interpolation moves a single opaque silhouette between registered endpoints', async ({ page }) => {
  const result = await rendererProbe(page);
  expect(result.backend).toBe('webgl');
  expect(result.first.old[3]).toBeGreaterThan(245);
  expect(result.first.middle[3]).toBe(0);
  expect(result.middle.middle[3]).toBeGreaterThan(245);
  expect(result.middle.old[3]).toBe(0);
  expect(result.middle.next[3]).toBe(0);
  expect(result.last.next[3]).toBeGreaterThan(245);
  expect(result.middle.corner[3]).toBe(0);
  expect(result.distinct).toBeGreaterThanOrEqual(20);
});

test('localized displacement reaches the intermediate silhouette without sampling empty background', async ({ page }) => {
  const result = await rendererProbe(page, 'webgl', true);
  expect(result.middle.middle[3]).toBeGreaterThan(245);
  expect(result.middle.old[3]).toBe(0);
  expect(result.middle.next[3]).toBe(0);
});

test('clip transitions begin at the previously rendered image and progress continuously', async ({ page }) => {
  const result = await rendererProbe(page);
  expect(result.transitionStart).toBe(result.before);
  expect(result.transitionMiddle).not.toBe(result.transitionStart);
  expect(result.transitionEnd).not.toBe(result.transitionMiddle);
  expect(result.frozenLater).toBe(result.frozen);
  expect(result.frozen).not.toBe(result.transitionEnd);
});

test('software fallback still interpolates transparent images and handles clip transitions', async ({ page }) => {
  const result = await rendererProbe(page, '2d');
  expect(result.backend).toBe('2d');
  expect(result.first.old[3]).toBeGreaterThan(245);
  expect(result.last.next[3]).toBeGreaterThan(245);
  expect(result.middle.old[3]).toBeGreaterThan(100);
  expect(result.middle.old[3]).toBeLessThan(160);
  expect(result.middle.corner[3]).toBe(0);
  expect(result.distinct).toBeGreaterThanOrEqual(20);
  expect(result.transitionStart).toBe(result.before);
  expect(result.transitionMiddle).not.toBe(result.before);
  expect(result.frozenLater).toBe(result.frozen);
  expect(result.frozen).not.toBe(result.transitionEnd);
});

test('overlapping deformed triangles retain the original pose color', async ({ page }) => {
  await page.goto('/');
  const brightest = await page.evaluate(async () => {
    const { createSpriteRenderer } = await import('/src/rendering/sprite-renderer.js');
    const atlas = document.createElement('canvas'); atlas.width = 1536; atlas.height = 1024;
    const ink = atlas.getContext('2d'); ink.fillStyle = 'rgb(70,130,180)';
    ink.fillRect(70, 70, 110, 110); ink.fillRect(326, 70, 110, 110);
    const image = new Image(); image.src = atlas.toDataURL(); await image.decode();
    const canvas = document.createElement('canvas');
    const bytes = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const shift = Math.round(Math.sin(x * .8) * 48);
      bytes.set([128 + shift * 2, 128, 128 + shift * 2, 128], (y * 64 + x) * 4);
    }
    const renderer = createSpriteRenderer(canvas, { species: 'parrot', motionImage: image, legacyImage: image,
      flowMeta: { version: 1, size: 64, frameSize: 256, encoding: 'signed-half-pixel-rgba', pairs: [[0, 1]] }, flowBytes: bytes });
    renderer.draw({ atlas: 'motion', frame: 0, nextFrame: 1, mix: .5, clip: 'walk' }, 0);
    const copy = document.createElement('canvas'); copy.width = copy.height = 256;
    const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    const pixels = ctx.getImageData(0, 0, 256, 256).data;
    let brightest = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 240) brightest = Math.max(brightest, pixels[i + 2]);
    renderer.dispose();
    return brightest;
  });
  expect(brightest).toBeGreaterThan(170);
  expect(brightest).toBeLessThan(185);
});

test('one-pixel flow encoding preserves the same registered intermediate pose', async ({ page }) => {
  const result = await rendererProbe(page, 'webgl', false, 'signed-one-pixel-rgba');
  expect(result.backend).toBe('webgl');
  expect(result.middle.middle[3]).toBeGreaterThan(245);
  expect(result.middle.old[3]).toBe(0);
  expect(result.middle.next[3]).toBe(0);
});
