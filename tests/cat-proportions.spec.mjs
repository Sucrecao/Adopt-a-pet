import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import {useLegacyPetResources} from './legacy-pet-fixture.mjs';
test.beforeEach(async({page})=>useLegacyPetResources(page));

async function saveEvidence(name, value) {
  await mkdir('.artifacts', { recursive: true });
  await writeFile(`.artifacts/cat-proportions-${name}`, typeof value === 'string' && value.startsWith('data:image/')
    ? Buffer.from(value.split(',')[1], 'base64') : JSON.stringify(value, null, 2));
}

test('actual cat source has a low hock and a slender complete distal paw', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createLimbSkin } = await import('/src/rendering/limb-skin.js');
    const { createRigController } = await import('/src/core/rig-motion.js');
    const load = async path => { const image = new Image(); image.src = path; await image.decode(); return image; };
    const image = await load('/pets/cat-limbs-v3.png');
    const meta = await (await fetch('/pets/cat-limb-rig-v3.json')).json();
    const legacyImage = await load('/pets/cat-cohesive-v2.png');
    const legacyMeta = await (await fetch('/pets/cat-limb-rig-v2.json')).json();
    const sourceHind = meta.parts[meta.species.cat.hind], sourceHip = sourceHind.joints[0], hock = sourceHind.joints[2], sole = sourceHind.joints[3];
    const actual = createLimbSkin(document, image, meta, 'cat'), legacy = createLimbSkin(document, legacyImage, legacyMeta, 'cat');
    const sheet = document.createElement('canvas'); sheet.width = sheet.height = 1024;
    const ink = sheet.getContext('2d'); ink.fillStyle = '#f5f6fb'; ink.fillRect(0, 0, sheet.width, sheet.height);
    const samples = [];
    for (const [row, facing] of [1, -1].entries()) {
      const pose = createRigController({ species: 'cat', random: () => 0 }).sample({ locomotion: { epoch: 1, distanceDip: 0, spriteSizeDip: 256, facing, moving: false } }, 0);
      const leg = pose.legs.find(limb => limb.id === 'nearHind');
      for (const [column, [name, skin]] of [['legacy', legacy], ['actual', actual]].entries()) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const context = canvas.getContext('2d'); skin.draw(context, leg);
        const pixels = context.getImageData(0, 0, 256, 256).data, widths = [];
        for (let y = Math.round(leg.ankle.y); y < leg.foot.y; y++) {
          let left = 256, right = -1;
          for (let x = 0; x < 256; x++) if (pixels[(y * 256 + x) * 4 + 3] > 200) { left = Math.min(left, x); right = Math.max(right, x); }
          widths.push(right < left ? 0 : right - left + 1);
        }
        samples.push({ name, facing, distalHeight: leg.foot.y - leg.ankle.y, meanWidth: widths.reduce((sum, width) => sum + width, 0) / widths.length,
          soleAlpha: pixels[(Math.round(leg.foot.y - 3) * 256 + Math.round(leg.foot.x)) * 4 + 3], foot: leg.foot, ankle: leg.ankle });
        ink.drawImage(canvas, column * 512, row * 512, 512, 512);
        ink.fillStyle = '#303440'; ink.font = '12px sans-serif'; ink.fillText(`${name} facing ${facing}`, column * 512 + 8, row * 512 + 16);
      }
    }
    return { sourceSize: [image.width, image.height], declaredSize: meta.sourceSize, hockFraction: (hock[1] - sourceHip[1]) / (sole[1] - sourceHip[1]), samples, sheet: sheet.toDataURL() };
  });
  await saveEvidence('distal.png', result.sheet);
  await saveEvidence('distal.json', { ...result, sheet: undefined });
  expect(result.sourceSize).toEqual([1536, 1024]); expect(result.declaredSize).toEqual(result.sourceSize);
  expect(result.hockFraction).toBeGreaterThanOrEqual(.8);
  for (const facing of [1, -1]) {
    const actual = result.samples.find(sample => sample.name === 'actual' && sample.facing === facing);
    const legacy = result.samples.find(sample => sample.name === 'legacy' && sample.facing === facing);
    expect(actual.distalHeight).toBe(17);
    expect(actual.meanWidth, JSON.stringify(actual)).toBeLessThan(20);
    expect(actual.meanWidth).toBeLessThan(legacy.meanWidth);
    expect(actual.soleAlpha, JSON.stringify(actual)).toBeGreaterThan(200);
    expect(actual.foot).toEqual(legacy.foot); expect(actual.ankle).toEqual(legacy.ankle);
  }
});

test('actual complete cat stays grounded and inside its canvas across gait, real reversal and care', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createRigRenderer } = await import('/src/rendering/rig-renderer.js');
    const { createRigController } = await import('/src/core/rig-motion.js');
    const load = async path => { const image = new Image(); image.src = path; await image.decode(); return image; };
    const json = async path => (await fetch(path)).json();
    const [rigImage, rigMeta, headImage, headMeta, limbImage, limbMeta, legacyImage] = await Promise.all([
      load('/pets/cat-rig.png'), json('/pets/cat-rig.json'), load('/pets/cat-cohesive-v2.png'), json('/pets/cat-head-rig-v3.json'),
      load('/pets/cat-limbs-v3.png'), json('/pets/cat-limb-rig-v3.json'), load('/pets/cat.png'),
    ]);
    const canvas = document.createElement('canvas');
    const renderer = createRigRenderer(canvas, { species: 'cat', rigImage, rigMeta, headImage, headMeta, limbImage, limbMeta, legacyImage });
    const makeSheet = (columns, rows) => {
      const sheet = document.createElement('canvas'); sheet.width = columns * 256; sheet.height = rows * 284;
      const context = sheet.getContext('2d'); context.fillStyle = '#f5f6fb'; context.fillRect(0, 0, sheet.width, sheet.height); return sheet;
    };
    const gait = makeSheet(5, 2), turn = makeSheet(5, 2), care = makeSheet(10, 12), backgrounds = makeSheet(6, 3);
    const samples = [], frozen = [], turns = [], backgroundFrames = [];
    let finite = true, transforms = 0, maxEdge = 0, maxRigEdge = 0, maxLegacySleepEdge = 0, unchangedSleepPixels = true;
    const sleepBaseline = document.createElement('canvas'); sleepBaseline.width = sleepBaseline.height = 256;
    sleepBaseline.getContext('2d').drawImage(legacyImage, 0, legacyImage.height / 2, legacyImage.width / 3, legacyImage.height / 2, 0, 0, 256, 256);
    const sleepPixels = sleepBaseline.getContext('2d').getImageData(0, 0, 256, 256).data;
    const prototype = CanvasRenderingContext2D.prototype, originalTransform = prototype.transform;
    prototype.transform = function (...matrix) { finite &&= matrix.every(Number.isFinite); transforms++; return originalTransform.apply(this, matrix); };
    const draw = (pose, name, sheet, column, row) => {
      renderer.draw(pose, pose.sampleTime);
      const pixels = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
      let edgeAlpha = 0;
      for (let n = 0; n < 256; n++) for (const [x, y] of [[n, 0], [n, 255], [0, n], [255, n]]) edgeAlpha = Math.max(edgeAlpha, pixels[(y * 256 + x) * 4 + 3]);
      maxEdge = Math.max(maxEdge, edgeAlpha);
      if (pose.clip === 'rest') {
        maxLegacySleepEdge = Math.max(maxLegacySleepEdge, edgeAlpha);
        unchangedSleepPixels &&= pixels.every((value, i) => value === sleepPixels[i]);
      } else maxRigEdge = Math.max(maxRigEdge, edgeAlpha);
      samples.push({ name, phase: pose.phase, orientation: pose.orientation, clip: pose.clip, elapsed: pose.elapsed, edgeAlpha,
        contacts: pose.legs.filter(leg => leg.planted).map(leg => ({ id: leg.id, x: leg.foot.x, y: leg.foot.y,
          alpha: pixels[(Math.round(leg.foot.y - 3) * 256 + Math.round(leg.foot.x)) * 4 + 3] })) });
      if (sheet) {
        const ink = sheet.getContext('2d'); ink.drawImage(canvas, column * 256, row * 284 + 24);
        ink.fillStyle = '#303440'; ink.font = '12px sans-serif'; ink.fillText(name, column * 256 + 6, row * 284 + 16);
      }
      return pixels;
    };
    const careTimes = [
      ['groom', [0, 120, 300, 600, 1200, 1500, 1800, 2200]],
      ['stretch', [0, 300, 650, 1000, 1300, 1950, 2300, 2600]],
      ['trick', [0, 120, 260, 400, 500, 650, 740, 900, 1040, 1200]],
      ['pet', [0, 200, 600, 1200, 1800, 2200, 2400]],
      ['feed', [0, 200, 800, 1600, 2400, 3000, 3200]],
      ['rest', [0, 400, 1200, 2400]],
    ];
    try {
      for (const [row, facing] of [1, -1].entries()) {
        const locomotion = { epoch: 1, distanceDip: 0, spriteSizeDip: 256, facing, moving: true };
        const controller = createRigController({ species: 'cat', random: () => 0 });
        for (let distance = 0; distance <= 64; distance += 2) {
          const pose = controller.sample({ locomotion: { ...locomotion, distanceDip: distance } }, distance * 16);
          if (distance % 16 === 0) draw(pose, `gait ${facing} distance ${distance}`, gait, distance / 16, row);
          else draw(pose, `gait-check ${facing} distance ${distance}`);
        }
        const reversal = createRigController({ species: 'cat', random: () => 0 });
        locomotion.moving = false;
        const initial = reversal.sample({ locomotion }, 0); renderer.draw(initial, 0);
        const before = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
        locomotion.facing = -facing;
        const orientations = [];
        let initialDelta = 0;
        for (let time = 0; time <= 800; time += 8) {
          const pose = reversal.sample({ locomotion }, time);
          const selected = time % 200 === 0;
          const pixels = draw(pose, `turn ${facing} time ${time}`, selected ? turn : null, time / 200, row);
          if (selected) orientations.push({ time, orientation: pose.orientation, turning: pose.turning });
          if (time === 0) initialDelta = pixels.reduce((sum, value, i) => sum + Math.abs(value - before[i]), 0) / pixels.length;
          if (time === 400 && row === 0) backgroundFrames.push({ label: 'actual turn 400', pixels: canvas.toDataURL() });
        }
        turns.push({ facing, initialDelta, orientations });
        for (const [actionRow, [action, times]] of careTimes.entries()) {
          const careController = createRigController({ species: 'cat', random: () => 0 });
          locomotion.facing = facing;
          const end = times.at(-1);
          const timeline = [...new Set([...Array.from({ length: Math.floor(end / 20) + 1 }, (_, i) => i * 20), ...times])].sort((a, b) => a - b);
          for (const elapsed of timeline) {
            const pose = careController.sample({ action, actionStartedAt: action, locomotion }, elapsed);
            const column = times.indexOf(elapsed);
            draw(pose, `${action} ${facing} time ${elapsed}`, column >= 0 ? care : null, column, actionRow * 2 + row);
            if (row === 0 && ((action === 'groom' && elapsed === 600) || (action === 'pet' && elapsed === 1200) || (action === 'feed' && elapsed === 1600))) backgroundFrames.push({ label: `${action} ${elapsed}`, pixels: canvas.toDataURL() });
          }
          for (const mode of ['paused', 'dragging', 'reducedMotion']) {
            const freezeController = createRigController({ species: 'cat', random: () => 0 });
            let pose;
            for (let now = 0; now <= 600; now += 20) pose = freezeController.sample({ action, actionStartedAt: action, locomotion }, now);
            renderer.draw(pose, 600); const pixels = canvas.toDataURL();
            const props = { action, actionStartedAt: action, locomotion: { ...locomotion, distanceDip: 50 } };
            if (mode === 'dragging') props.locomotion.dragging = true; else props[mode] = true;
            const frozenPose = freezeController.sample(props, 1600); renderer.draw(frozenPose, 1600);
            frozen.push({ action, facing, mode, samePose: frozenPose === pose, samePixels: canvas.toDataURL() === pixels });
          }
        }
        const idleController = createRigController({ species: 'cat', random: () => 0 });
        const idlePose = idleController.sample({ locomotion: { ...locomotion, facing } }, 0); renderer.draw(idlePose, 0);
        backgroundFrames.unshift({ label: `idle ${facing}`, pixels: canvas.toDataURL() });
      }
      const chosen = [backgroundFrames.find(frame => frame.label === 'idle 1'), backgroundFrames.find(frame => frame.label === 'idle -1'),
        ...['actual turn 400', 'groom 600', 'pet 1200', 'feed 1600'].map(label => backgroundFrames.find(frame => frame.label === label))];
      for (const [row, color] of ['#f5f6fb', '#16191f', '#ffffff'].entries()) {
        const ink = backgrounds.getContext('2d'); ink.fillStyle = color; ink.fillRect(0, row * 284, backgrounds.width, 284);
        for (const [column, frame] of chosen.entries()) {
          const image = await load(frame.pixels); ink.drawImage(image, column * 256, row * 284 + 24);
          ink.fillStyle = row === 1 ? '#ffffff' : '#303440'; ink.font = '12px sans-serif'; ink.fillText(frame.label, column * 256 + 6, row * 284 + 16);
        }
      }
    } finally { prototype.transform = originalTransform; }
    return { sheets: { gait: gait.toDataURL(), turn: turn.toDataURL(), care: care.toDataURL(), backgrounds: backgrounds.toDataURL() }, finite, transforms, maxEdge, maxRigEdge, maxLegacySleepEdge, unchangedSleepPixels, samples, frozen, turns };
  });
  for (const [name, sheet] of Object.entries(result.sheets)) await saveEvidence(`${name}.png`, sheet);
  await saveEvidence('motion.json', { ...result, sheets: undefined });
  expect(result.finite).toBeTruthy(); expect(result.transforms).toBeGreaterThan(10000); expect(result.maxRigEdge).toBe(0);
  expect(result.unchangedSleepPixels).toBeTruthy();
  expect(result.samples.filter(sample => sample.name.startsWith('gait ') && !sample.name.startsWith('gait-check'))).toHaveLength(10);
  for (const sample of result.samples.filter(sample => sample.clip !== 'rest')) for (const contact of sample.contacts) expect(contact.alpha, JSON.stringify({ name: sample.name, contact })).toBeGreaterThan(200);
  for (const turn of result.turns) {
    expect(turn.initialDelta).toBeLessThan(.1);
    expect(turn.orientations.map(sample => sample.time)).toEqual([0, 200, 400, 600, 800]);
    expect(turn.orientations[0].orientation).toBe(turn.facing);
    expect(turn.orientations[2].orientation).toBeCloseTo(0, 8);
    expect(turn.orientations[4].orientation).toBe(-turn.facing);
    expect(turn.orientations[4].turning).toBe(false);
  }
  expect(result.frozen).toHaveLength(36);
  for (const sample of result.frozen) { expect(sample.samePose, JSON.stringify(sample)).toBeTruthy(); expect(sample.samePixels, JSON.stringify(sample)).toBeTruthy(); }
});

for (const failure of [null, 'cat-limbs-v3.png', 'cat-head-rig-v3.json', 'cat-limb-rig-v3.json', 'cat-cohesive-v2.png']) {
  test(`live fallback cat rig loader ${failure ? `restores the usable matching group on ${failure} failure` : 'uses the actual v3 head and complete limbs'}`, async ({ page }) => {
    await page.route('**/pets/*-whole-v*', route => route.abort());
    if (failure) await page.route(`**/pets/${failure}`, route => route.abort());
    await page.addInitScript(() => {
      window.catSourceDraws = [];
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (image instanceof HTMLImageElement) window.catSourceDraws.push({ asset: image.src.split('/').at(-1), target: [this.canvas.width, this.canvas.height], crop: args.slice(0, 4) });
        return original.call(this, image, ...args);
      };
    });
    await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.getByRole('button', { name: /选择猫咪/ }).click();
    await page.getByRole('button', { name: /在预览中领养/ }).click();
    const canvas = page.locator('.stage-pet canvas');
    await expect(canvas).toHaveAttribute('data-limb-skin', 'connected-v2');
    const expected = failure === 'cat-cohesive-v2.png' ? 'quadruped-legs-v2.png' : failure ? 'cat-cohesive-v2.png' : 'cat-limbs-v3.png';
    await expect.poll(() => page.evaluate(asset => window.catSourceDraws.some(draw => draw.asset === asset && draw.target.every(size => size !== 256)), expected)).toBeTruthy();
    const draws = await page.evaluate(() => window.catSourceDraws);
    if (failure) expect(draws.some(draw => draw.asset === 'cat-limbs-v3.png')).toBe(false);
    else {
      expect(new Set(draws.filter(draw => draw.asset === 'cat-limbs-v3.png').map(draw => JSON.stringify(draw.crop))).size).toBe(2);
      expect(draws.some(draw => draw.asset === 'cat-cohesive-v2.png')).toBe(true);
    }
    await expect(canvas).toHaveAttribute('data-head-rig', failure === 'cat-cohesive-v2.png' ? 'legacy-parts' : 'registered-v2');
    await saveEvidence(`loader-${failure || 'success'}.json`, { failure, draws });
  });
}
