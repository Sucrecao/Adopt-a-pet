import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

for (const species of ['maltese', 'golden']) test(`${species}: real whole-picture clips, mirror, every stop junction and cadence use decoded source pixels`, async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/qa-source-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/qa-source-fixture');
  const report = await page.evaluate(async species => {
    const [{ createWholeRenderer }, { createWholeAnimationController }, { createLinePageCache }] = await Promise.all([
      import('/src/rendering/whole-renderer.js'), import('/src/core/whole-animation.js'), import('/src/rendering/line-pages.js'),
    ]);
    const response = await fetch(`/pets/${species}-line-v1.json`);
    if (!response.ok) throw new Error(`No authored ${species} atlas`);
    const meta = await response.json();
    const cache = createLinePageCache({ meta, maxBytes: 8 * 1024 * 1024, loadImage: async asset => {
      const source = await fetch('/' + asset); return createImageBitmap(await source.blob());
    } });
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const images = meta.pages.map(page => ({ width: page.sourceSize[0], height: page.sourceSize[1] }));
    const renderer = createWholeRenderer(canvas, { images, meta, sourceProvider: page => cache.get(page) });
    const context = canvas.getContext('2d'), reference = document.createElement('canvas'); reference.width = reference.height = 256;
    const referenceContext = reference.getContext('2d');
    const faults = [], clips = {}, walkHashes = [], walkPixels = new Map();
    let maximumDecodedBytes = 0, renderedPictures = 0, mirrorChecks = 0;
    const hash = data => { let value = 2166136261; for (const byte of data) value = Math.imul(value ^ byte, 16777619) >>> 0; return value; };
    const draw = async (frame, facing = 1) => {
      cache.pinFrames([frame]); await cache.load(meta.frames[frame].page);
      if (!renderer.draw({ frame, nextFrame: frame, mix: 0, facing })) throw new Error(`Full-picture draw failed at ${frame}`);
      maximumDecodedBytes = Math.max(maximumDecodedBytes, cache.stats().bytes); renderedPictures++;
      const data = context.getImageData(0, 0, 256, 256).data;
      let left = 256, top = 256, right = -1, bottom = -1, area = 0;
      for (let offset = 3; offset < data.length; offset += 4) if (data[offset] > 8) {
        const pixel = offset >> 2, x = pixel % 256, y = Math.floor(pixel / 256);
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); area++;
      }
      if (area === 0 || left === 0 || top === 0 || right === 255 || bottom === 255) faults.push({ frame, facing, bounds: [left, top, right, bottom], area });
      return { data, hash: hash(data), bounds: [left, top, right, bottom], area };
    };
    for (const [name, clip] of Object.entries(meta.clips)) {
      const values = [];
      for (const frame of clip.frames) {
        const right = await draw(frame, 1); values.push(right.hash);
        referenceContext.setTransform(1, 0, 0, 1, 0, 0); referenceContext.clearRect(0, 0, 256, 256);
        referenceContext.save(); referenceContext.translate(256, 0); referenceContext.scale(-1, 1); referenceContext.drawImage(canvas, 0, 0); referenceContext.restore();
        const expected = referenceContext.getImageData(0, 0, 256, 256).data;
        const left = await draw(frame, -1);
        if (!left.data.every((value, index) => value === expected[index])) faults.push({ frame, name, reason: 'whole mirror changed raster shape' });
        mirrorChecks++;
        if (name === 'walk') { walkHashes.push(right.hash); walkPixels.set(frame, right.hash); }
      }
      clips[name] = { indexedPictures: clip.frames.length, uniqueRasterPictures: new Set(values).size };
    }
    const neutralHash = (await draw(meta.neutralFrame)).hash;
    const loc = (distance = 0, wanted = false, facing = 1) => ({ epoch: 1, prepareEpoch: 1, spriteSizeDip: 256,
      distanceDip: distance, facing, moving: wanted, actualMoving: wanted, intentMoving: wanted });
    const properties = (distance = 0, wanted = false, extra = {}) => ({ action: 'idle', locomotion: loc(distance, wanted), ...extra });
    let stopJunctions = 0, interruptions = 0;
    for (let slot = 0; slot < meta.authoredStops.length; slot++) {
      const controller = createWholeAnimationController({ species, meta, random: () => .99 });
      controller.sample(properties(), 0); controller.sample(properties(0, true), 1);
      const distance = meta.stride * (slot + .25) / meta.clips.walk.frames.length;
      const walking = controller.sample(properties(distance, true), 10);
      const before = await draw(walking.frame);
      const stopping = controller.sample(properties(distance), 10);
      const after = await draw(stopping.frame);
      if (before.hash !== after.hash || before.hash !== walkPixels.get(meta.clips.walk.frames[slot])) faults.push({ slot, reason: 'same-time stop changes the actual whole picture' });
      const duration = meta.authoredStops[slot].durations.reduce((sum, ms) => sum + ms, 0);
      const landed = controller.sample(properties(distance), 10 + duration);
      if ((await draw(landed.frame)).hash !== neutralHash) faults.push({ slot, reason: 'stop endpoint does not render neutral' });
      stopJunctions++;
    }
    for (const name of ['pet', 'feed', 'groom', 'stretch', 'hop']) {
      const controller = createWholeAnimationController({ species, meta, random: () => .99 });
      controller.sample(properties(), 0);
      const action = name === 'hop' ? 'trick' : name;
      controller.sample(properties(0, false, { action, actionStartedAt: 1 }), 1);
      const time = meta.clips[name].durations.reduce((sum, ms) => sum + ms, 0) * .43;
      const original = controller.sample(properties(0, false, { action, actionStartedAt: 1 }), time);
      const before = await draw(original.frame);
      const interrupted = controller.sample(properties(0, false, { action: name === 'feed' ? 'pet' : 'feed', actionStartedAt: 2 }), time);
      if ((await draw(interrupted.frame)).hash !== before.hash) faults.push({ name, reason: 'care interruption changes the displayed whole picture at the same time' });
      interruptions++;
    }
    const cadence = [];
    let stanceObservations = 0, maxWorldContactDrift = 0;
    for (const hz of [60, 120]) {
      const controller = createWholeAnimationController({ species, meta, random: () => .99 });
      controller.sample(properties(), 0); controller.sample(properties(0, true), 0);
      const observed = [], priorContacts = new Map(), worldAnchors = new Map();
      for (let tick = 1; tick <= hz * 2; tick++) {
        const time = tick * 1000 / hz, distance = meta.stride * time / 1000;
        const source = controller.sample(properties(distance, true), time);
        const actual = await draw(source.frame), duplicate = controller.sample(properties(distance, true), time);
        if (![source.phase, source.motionDistance, source.sampleTime].every(Number.isFinite) || source.frame !== duplicate.frame || source.phase !== duplicate.phase) faults.push({ hz, tick, reason: 'nonfinite or duplicate cadence phase' });
        for (const foot of source.contacts ?? []) {
          const prior = priorContacts.get(foot.id), world = distance + foot.x;
          if (foot.planted && prior?.planted) {
            if (foot.supportGeneration !== prior.supportGeneration) faults.push({ hz, tick, foot: foot.id, reason: 'planted support generation changes across the loop seam' });
            const drift = Math.abs(world - worldAnchors.get(foot.id));
            maxWorldContactDrift = Math.max(maxWorldContactDrift, drift); stanceObservations++;
          } else if (foot.planted) worldAnchors.set(foot.id, world);
          priorContacts.set(foot.id, foot);
        }
        if (tick % (hz / 60) === 0) observed.push({ time, phase: source.phase, frame: source.frame, hash: actual.hash });
      }
      cadence.push({ hz, samples: observed });
    }
    renderer.dispose(); cache.dispose();
    return { species, pageCount: meta.pages.length, registeredFrames: meta.frames.length, sourceCellSize: meta.sourceCellSize,
      clips, distinctWalkPictures: new Set(walkHashes).size, stopJunctions, interruptions, mirrorChecks, renderedPictures,
      maximumDecodedBytes, cadence, faults,
      stanceObservations, maxWorldContactDrift,
      scope: 'actual production whole renderer readback with bounded decoded pages; deterministic 60/120Hz timestamps are not a hardware display-rate claim' };
  }, species);
  await mkdir('.artifacts/couple-puppies', { recursive: true });
  await writeFile(`.artifacts/couple-puppies/qa-${species}-browser-report.json`, JSON.stringify(report, null, 2) + '\n');
  expect(report.faults).toEqual([]);
  expect(report.distinctWalkPictures).toBe(128);
  expect(report.stopJunctions).toBe(128);
  expect(report.interruptions).toBe(5);
  expect(Object.keys(report.clips)).toHaveLength(9);
  expect(report.maximumDecodedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(report.stanceObservations).toBeGreaterThan(400);
  expect(report.maxWorldContactDrift).toBeLessThan(40 / 128 + 1e-7);
  const [at60, at120] = report.cadence.map(value => value.samples);
  expect(at60).toHaveLength(120); expect(at120).toHaveLength(120);
  for (let index = 0; index < at60.length; index++) {
    expect(at60[index].phase).toBeCloseTo(at120[index].phase, 12);
    expect(at60[index].frame).toBe(at120[index].frame);
    expect(at60[index].hash).toBe(at120[index].hash);
  }
});
