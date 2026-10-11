import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('cat hind width registration narrows the actual hock skin while retaining its solved sole', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createLimbSkin } = await import('/src/rendering/limb-skin.js'), { createRigController } = await import('/src/core/rig-motion.js');
    const image = new Image(); image.src = '/pets/cat-cohesive-v2.png'; await image.decode();
    const base = await (await fetch('/pets/cat-limb-rig-v2.json')).json();
    const results = [];
    for (const facing of [1, -1]) {
      const controller = createRigController({ species: 'cat' }), pose = controller.sample({ locomotion: { epoch: 1, distanceDip: 0, spriteSizeDip: 256, facing, moving: false } }, 0), leg = pose.legs.find(leg => leg.id === 'nearHind');
      for (const factor of [1, .8, 0, -1, null, 'invalid', NaN, Infinity]) {
        const meta = structuredClone(base), part = meta.parts[meta.species.cat.hind];
        part.joints[2] = [(638 - part.rect[0]) / part.rect[2], (1070 - part.rect[1]) / part.rect[3]]; part.widthScale = factor;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        createLimbSkin(document, image, meta, 'cat').draw(canvas.getContext('2d'), leg);
        const bytes = canvas.getContext('2d').getImageData(0, 0, 256, 256).data, widths = [];
        for (let y = Math.round(leg.ankle.y); y < leg.foot.y; y++) { const xs = []; for (let x = 0; x < 256; x++) if (bytes[(y * 256 + x) * 4 + 3] > 200) xs.push(x); widths.push(xs.length ? xs.at(-1) - xs[0] + 1 : 0); }
        results.push({ facing, factor, width: widths.reduce((sum, width) => sum + width, 0) / widths.length, soleAlpha: bytes[(Math.round(leg.foot.y - 3) * 256 + Math.round(leg.foot.x)) * 4 + 3], pixels: canvas.toDataURL(), foot: leg.foot, ankle: leg.ankle });
      }
    }
    return results;
  });
  await mkdir('.superpowers/sdd/evidence', { recursive: true }); await writeFile('.superpowers/sdd/evidence/cohesive-cat-hind-widths.json', JSON.stringify(result.map(({ pixels, ...value }) => value), null, 2));
  for (const facing of [1, -1]) {
    const samples = result.filter(sample => sample.facing === facing), original = samples[0], narrow = samples[1];
    expect(narrow.width, JSON.stringify({ original: original.width, narrow: narrow.width })).toBeLessThan(original.width * .9);
    expect(narrow.soleAlpha).toBeGreaterThan(200); expect(narrow.foot).toEqual(original.foot); expect(narrow.ankle).toEqual(original.ankle);
    for (const invalid of samples.slice(2)) expect(invalid.pixels).toBe(original.pixels);
  }
});

test('corrected actual hind skins keep ground alpha and finite transforms through complete gait, turn and care', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createLimbSkin } = await import('/src/rendering/limb-skin.js'), { createRigController } = await import('/src/core/rig-motion.js');
    const image = new Image(); image.src = '/pets/cat-cohesive-v2.png'; await image.decode(); const meta = await (await fetch('/pets/cat-limb-rig-v2.json')).json(), skin = createLimbSkin(document, image, meta, 'cat');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const context = canvas.getContext('2d'), prototype = CanvasRenderingContext2D.prototype, original = prototype.transform;
    let finite = true, transforms = 0; const soles = [], frozen = [], scenarios = [];
    prototype.transform = function (...matrix) { finite &&= matrix.every(Number.isFinite); transforms++; return original.apply(this, matrix); };
    const draw = (pose, scenario) => {
      context.clearRect(0, 0, 256, 256); for (const leg of pose.legs.filter(leg => leg.kind === 'hind')) skin.draw(context, leg);
      const pixels = context.getImageData(0, 0, 256, 256).data; for (const leg of pose.legs.filter(leg => leg.kind === 'hind' && leg.planted)) soles.push({ scenario, id: leg.id, alpha: pixels[(Math.round(leg.foot.y - 3) * 256 + Math.round(leg.foot.x)) * 4 + 3] });
    };
    try {
      for (const facing of [1, -1]) {
        const locomotion = { epoch: 1, distanceDip: 0, spriteSizeDip: 256, facing, moving: true }, gait = createRigController({ species: 'cat', random: () => 0 });
        for (let distance = 0; distance <= 160; distance += 2) draw(gait.sample({ locomotion: { ...locomotion, distanceDip: distance } }, distance * 16), `gait:${facing}:${distance}`);
        const turn = createRigController({ species: 'cat', random: () => 0 }); locomotion.moving = false; turn.sample({ locomotion }, 0); locomotion.facing = -facing;
        for (let time = 0; time <= 800; time += 8) draw(turn.sample({ locomotion }, time), `turn:${facing}:${time}`);
        for (const [action, duration] of [['groom', 1800], ['stretch', 2600], ['trick', 1200], ['pet', 1800], ['feed', 1800]]) {
          const controller = createRigController({ species: 'cat', random: () => 0 }); let pose;
          for (let elapsed = 0; elapsed <= duration; elapsed += 40) { pose = controller.sample({ action, actionElapsed: elapsed, actionStartedAt: 1, locomotion }, elapsed); draw(pose, `${action}:${facing}:${elapsed}`); }
          const before = canvas.toDataURL(), paused = controller.sample({ action, paused: true, locomotion }, duration + 1000); draw(paused, `${action}:frozen`); frozen.push({ action, facing, samePose: paused === pose, pixelsEqual: canvas.toDataURL() === before }); scenarios.push(`${action}:${facing}`);
        }
      }
    } finally { prototype.transform = original; }
    return { finite, transforms, soles, frozen, scenarios };
  });
  await mkdir('.superpowers/sdd/evidence', { recursive: true }); await writeFile('.superpowers/sdd/evidence/cohesive-cat-hind-complete-motion.json', JSON.stringify(result, null, 2));
  expect(result.finite).toBeTruthy(); expect(result.transforms).toBeGreaterThan(10000); expect(result.soles.length).toBeGreaterThan(1000);
  for (const sole of result.soles) expect(sole.alpha, JSON.stringify(sole)).toBeGreaterThan(200);
  for (const sample of result.frozen) { expect(sample.samePose).toBeTruthy(); expect(sample.pixelsEqual).toBeTruthy(); }
});
