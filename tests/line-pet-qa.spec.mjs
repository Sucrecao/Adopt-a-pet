import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// A small complete-picture atlas isolates the production Pet drawing contract
// before the newly authored animal assets are activated.
const track = (frames, time = 10, loop = false) => ({ frames, durations: frames.map(() => time), loop });
const hookMeta = {
  version: 7, renderMode: 'discrete-whole-frame', authoring: 'line-pet-v1', stride: 64, neutralFrame: 0,
  pages: [{ asset: 'pets/qa-hook-atlas.png', sourceSize: [2048, 2048], columns: 8, rows: 8 }],
  frames: Array.from({ length: 64 }, (_, i) => ({ page: 0, rect: [(i % 8) * 256, Math.floor(i / 8) * 256, 256, 256] })),
  clips: {
    idle: track([0, 8, 0], 20, true), walk: track([0, 1, 2, 3, 4, 5, 6, 7], 10, true),
    rest: track([20, 21, 20], 10, true), turn: track([0, 40, 41, 42], 200),
    pet: track([0, 30, 31, 0]), feed: track([0, 32, 33, 0]), groom: track([0, 34, 35, 0]),
    stretch: track([0, 36, 37, 0]), hop: track([0, 38, 39, 0]),
  },
  transitions: { rest: { enter: track([0, 22, 20]), exit: track([20, 22, 0]) } },
  authoredStops: Array.from({ length: 8 }, (_, i) => track([i, 16 + i, 0])),
};
const atlas = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048">${Array.from({ length: 64 }, (_, i) => {
  const x = (i % 8) * 256, y = Math.floor(i / 8) * 256;
  return `<g transform="translate(${x} ${y})" fill="hsl(${i * 37},65%,48%)"><ellipse cx="116" cy="146" rx="70" ry="39"/><circle cx="185" cy="106" r="33"/><rect x="70" y="158" width="24" height="64"/><rect x="146" y="158" width="24" height="64"/></g>`;
}).join('')}</svg>`;

async function mountHookFixture(page) {
  await page.goto('about:blank');
  const source = await page.evaluate(async svg => {
    const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
    canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png');
  }, atlas);
  await page.route('**/pets/qa-hook-meta.json', route => route.fulfill({ json: hookMeta }));
  await page.route('**/pets/qa-hook-atlas.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(source.split(',')[1], 'base64') }));
  await page.route('**/src/core/line-animation.js*', async route => {
    const response = await route.fetch();
    const original = await response.text();
    const body = original.replace('export function createLineAnimationController(', 'function createOriginalLineAnimationController(')
      + '\nexport function createLineAnimationController(...args) { const value = createOriginalLineAnimationController(...args); const rollback = value.rollback.bind(value); value.rollback = () => { window.qaLineRollbackCalls = (window.qaLineRollbackCalls || 0) + 1; return rollback(); }; return value; }\n';
    await route.fulfill({ response, body });
  });
  await page.route('**/qa-hook-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/qa-hook-fixture');
  await page.evaluate(async () => {
    const { default: RefreshRuntime } = await import('/@react-refresh');
    RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const [{ default: React }, { default: ReactDOMClient }, { default: ReactDOM }, { default: Pet }, { PETS }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/node_modules/.vite/deps/react-dom.js'), import('/src/Pet.jsx'), import('/src/core/pets.js'),
    ]);
    let now = 0, nextId = 0, distance = 0, failNextDraw = false, failureSurface;
    const callbacks = new Map(), trace = [], readiness = [], commits = [];
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
    window.requestAnimationFrame = callback => { const id = ++nextId; callbacks.set(id, callback); return id; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    Math.random = () => .99;
    const getContext = HTMLCanvasElement.prototype.getContext, wrapped = new WeakSet();
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      const context = getContext.call(this, type, ...args);
      if (type === '2d' && context && !wrapped.has(context)) {
        wrapped.add(context); const draw = context.drawImage.bind(context);
        context.drawImage = (...values) => {
          const surface = context.canvas.parentElement ? 'presented' : 'staging';
          trace.push({ type: 'draw', now, surface });
          if (failNextDraw && (!failureSurface || surface === failureSurface)) { failNextDraw = false; throw new Error('QA injected full-picture draw failure'); }
          return draw(...values);
        };
      }
      return context;
    };
    const locomotionRef = { current: { epoch: 1, prepareEpoch: 1, distanceDip: 0, spriteSizeDip: 256, facing: 1,
      moving: false, actualMoving: false, intentMoving: false } };
    const motionPaintRef = { current: null };
    const visualMotionRef = { current: {
      sample(time, ready) {
        trace.push({ type: 'sample', now: time, ready });
        return { ...locomotionRef.current, distanceDip: distance, intentMoving: true, moving: ready, actualMoving: ready };
      },
      commit(packet) {
        const canvas = host.querySelector('canvas');
        const record = { type: 'commit', now: packet.now, painted: packet.painted, frame: packet.sample.frame,
          phase: packet.sample.phase, distance: packet.locomotion.distanceDip,
          pixels: canvas.toDataURL(), selected: canvas.parentElement.dataset.frame };
        trace.push(record); commits.push(record);
        if (packet.painted) host.style.transform = `translate3d(${packet.locomotion.distanceDip}px,0,0)`;
        return packet.painted;
      },
    } };
    const host = document.createElement('div'); host.className = 'qa-hook-fixture'; document.body.append(host);
    const root = ReactDOMClient.createRoot(host);
    ReactDOM.flushSync(() => root.render(React.createElement(Pet, {
      pet: { ...PETS.find(p => p.id === 'dog'), wholeMetaAsset: 'pets/qa-hook-meta.json', wholeRenderMode: 'discrete-whole-frame' },
      size: 256, locomotionRef, motionPaintRef, visualMotionRef, onPlaybackReady: packet => readiness.push(packet),
    })));
    const snapshot = () => ({ ...host.querySelector('.pet-sprite').dataset, pixels: host.querySelector('canvas').toDataURL(),
      rootOrigin: host.getBoundingClientRect().x, queuedRafs: callbacks.size, commits: commits.slice(), trace: trace.slice(), readiness: readiness.slice(), rollbacks: window.qaLineRollbackCalls || 0 });
    window.qaHookFixture = {
      snapshot,
      clear() { trace.length = 0; commits.length = 0; },
      step(time, proposedDistance = distance) { now = time; distance = proposedDistance; const jobs = [...callbacks.values()]; callbacks.clear(); jobs.forEach(job => job(now)); return snapshot(); },
      packet(time, proposedDistance = distance) { now = time; distance = proposedDistance; motionPaintRef.current?.(); return snapshot(); },
      failNext(surface) { failNextDraw = true; failureSurface = surface; },
    };
  });
  await expect(page.locator('.qa-hook-fixture canvas')).toHaveAttribute('data-renderer', 'whole-frame-2d');
}

test('Pet proposes visual travel before its controller and commits after the matching full-picture draw', async ({ page }) => {
  await mountHookFixture(page);
  const initial = await page.evaluate(() => window.qaHookFixture.snapshot());
  const sampleCalls = initial.trace.filter(item => item.type === 'sample');
  expect(sampleCalls.length).toBeGreaterThan(0);
  expect(sampleCalls[0].ready).toBe(false);
  const result = await page.evaluate(() => { const f = window.qaHookFixture; f.clear(); return f.step(16, 16); });
  expect(result.trace.map(item => item.type)).toEqual(['sample', 'draw', 'draw', 'commit']);
  expect(result.trace.filter(item => item.type === 'draw').map(item => item.surface)).toEqual(['staging', 'presented']);
  expect(result.trace[0]).toMatchObject({ now: 16, ready: true });
  expect(result.commits).toHaveLength(1);
  expect(result.commits[0]).toMatchObject({ now: 16, painted: true, frame: 2, phase: .25, distance: 16 });
  expect(result.phase).toBe('0.25');
  expect(result.frame).toBe('2');
  expect(result.commits[0].pixels).toBe(result.pixels);
  expect(result.queuedRafs).toBe(1);
});

test('Pet rejects a failed full-picture paint and rolls back the proposed line phase', async ({ page }) => {
  await mountHookFixture(page);
  const result = await page.evaluate(() => {
    const f = window.qaHookFixture; const before = f.step(16, 16); f.clear(); f.failNext();
    const failed = f.step(32, 32);
    return { before, failed, recovered: f.step(48, 16) };
  });
  expect(result.failed.commits).toHaveLength(1);
  expect(result.failed.commits[0]).toMatchObject({ painted: false, phase: .5, distance: 32 });
  expect(result.failed.rollbacks).toBe(1);
  expect(result.failed.pixels === result.before.pixels, 'A failed staging draw preserves the exact presented PNG').toBe(true);
  expect(result.failed.frame).toBe(result.before.frame);
  expect(result.failed.phase).toBe(result.before.phase);
  expect(result.failed.rootOrigin).toBe(result.before.rootOrigin);
  const recovery = result.recovered.commits.at(-1);
  expect(recovery).toMatchObject({ painted: true, phase: .25, frame: 2, distance: 16 });
});

test('a presented-surface draw failure preserves actual old pixels, root and source phase after successful staging', async ({ page }) => {
  await mountHookFixture(page);
  const result = await page.evaluate(() => {
    const f = window.qaHookFixture, before = f.step(16, 16);
    f.clear(); f.failNext('presented');
    const failed = f.step(32, 32);
    return { before, failed, recovered: f.step(48, 16) };
  });
  expect(result.failed.trace.map(item => item.type)).toEqual(['sample', 'draw', 'draw', 'commit']);
  expect(result.failed.trace.filter(item => item.type === 'draw').map(item => item.surface)).toEqual(['staging', 'presented']);
  expect(result.failed.commits[0]).toMatchObject({ painted: false, phase: .5, distance: 32 });
  expect(result.failed.rollbacks).toBe(1);
  expect(result.failed.rootOrigin).toBe(result.before.rootOrigin);
  expect(result.failed.frame).toBe(result.before.frame);
  expect(result.failed.phase).toBe(result.before.phase);
  expect(result.failed.pixels === result.before.pixels, 'A failed visible-surface draw preserves the exact presented PNG').toBe(true);
  expect(result.recovered.commits.at(-1)).toMatchObject({ painted: true, phase: .25, frame: 2, distance: 16 });
});

for (const species of ['dog', 'cat']) test(`${species}: real whole-picture clips, mirror, every stop junction and cadence use decoded source pixels`, async ({ page }) => {
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
  await mkdir('.artifacts/line-pets', { recursive: true });
  await writeFile(`.artifacts/line-pets/qa-${species}-browser-report.json`, JSON.stringify(report, null, 2) + '\n');
  expect(report.faults).toEqual([]);
  expect(report.distinctWalkPictures).toBe(128);
  expect(report.stopJunctions).toBe(128);
  expect(report.interruptions).toBe(5);
  expect(Object.keys(report.clips)).toHaveLength(9);
  expect(report.maximumDecodedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(report.stanceObservations).toBeGreaterThan(800);
  expect(report.maxWorldContactDrift).toBeLessThan(56 / 128 + 1e-7);
  const [at60, at120] = report.cadence.map(value => value.samples);
  expect(at60).toHaveLength(120); expect(at120).toHaveLength(120);
  for (let index = 0; index < at60.length; index++) {
    expect(at60[index].phase).toBeCloseTo(at120[index].phase, 12);
    expect(at60[index].frame).toBe(at120[index].frame);
    expect(at60[index].hash).toBe(at120[index].hash);
  }
});
