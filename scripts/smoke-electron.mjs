import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const userData = await mkdtemp(path.join(tmpdir(), 'pawpal-smoke-'));
await mkdir('.artifacts', { recursive: true });
let app;
try {
  const executablePath = process.env.PAWPAL_PACKAGED_EXECUTABLE;
  app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env: { ...process.env, PAWPAL_TEST_USER_DATA: userData }, timeout: 30000 });
  const panel = await app.firstWindow();
  await panel.waitForFunction(() => Boolean(window.companion));
  assert.equal(await panel.evaluate(() => window.companion.isDesktop), true);
  const overlayPromise = app.waitForEvent('window', { predicate: page => page !== panel });
  await panel.evaluate(() => window.companion.dispatch({ type: 'adopt', species: 'dog', name: '团子' }));
  await panel.waitForFunction(async () => (await window.companion.getState()).adopted);
  const overlay = await overlayPromise;
  await overlay.waitForFunction(() => Boolean(document.querySelector('.pet-sprite')));
  await overlay.evaluate(async () => {
    const sprite = document.querySelector('.pet-sprite');
    const asset = getComputedStyle(sprite).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    if (!asset) throw new Error('Pet sprite has no image asset');
    const image = new Image();
    image.src = asset;
    await image.decode();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await overlay.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.atlas === 'motion');
  await overlay.waitForFunction(() => {
    const canvas = document.querySelector('.pet-sprite canvas');
    return canvas?.dataset.renderer === 'webgl' && getComputedStyle(canvas).visibility === 'visible';
  });
  assert.equal(await overlay.evaluate(() => document.querySelector('.pet-sprite canvas')?.dataset.renderer), 'webgl',
    'actual Electron companion uses the GPU canvas renderer');
  const transparent = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet'));
    if (!window?.isVisible()) return false;
    // getBackgroundColor deliberately omits alpha; inspect the captured native bitmap instead.
    const pixels = (await window.webContents.capturePage()).toBitmap();
    return pixels.length > 0 && pixels[3] === 0;
  });
  assert.equal(transparent, true, 'pet is in its own visible transparent window');
  const petBounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet')).getBounds());
  for (const action of ['stretch', 'trick']) {
    await panel.waitForFunction(async () => Date.now() - (await window.companion.getState()).lastInteraction >= 850);
    await panel.evaluate(action => window.companion.dispatch({ type: 'interact', action }), action);
    const expected = action === 'trick' ? 'hop' : 'stretch';
    await overlay.waitForFunction(clip => document.querySelector('.pet-sprite')?.dataset.clip === clip, expected);
    const before = await petBounds();
    const playback = await overlay.evaluate(() => new Promise(resolve => {
      const frames = new Set(), callbacks = [], pixels = [], started = performance.now();
      let previousCapture = -Infinity;
      function sample(now) {
        const sprite = document.querySelector('.pet-sprite'), canvas = sprite.querySelector('canvas');
        callbacks.push(now);
        frames.add(sprite.dataset.frame);
        // Read actual rendered PNG pixels at a modest cadence. Sampling each
        // rAF with a GPU readback would itself distort the playback cadence.
        if (now - previousCapture >= 50) {
          pixels.push({ now, frame: sprite.dataset.frame, clip: sprite.dataset.clip, backend: canvas.dataset.renderer, image: canvas.toDataURL('image/png') });
          previousCapture = now;
        }
        if (now - started < 1100) requestAnimationFrame(sample); else resolve({ frames: [...frames], callbacks, pixels });
      }
      requestAnimationFrame(sample);
    }));
    assert.ok(playback.frames.length >= 2, `${action} plays a multi-frame animation`);
    assert.ok(playback.callbacks.length >= 15, `${action} keeps requestAnimationFrame playback active`);
    assert.ok(playback.pixels.length >= 10, `${action} supplies enough rendered pixel samples`);
    const intervals = new Map();
    const hashes = playback.pixels.map(sample => {
      assert.equal(sample.clip, expected, `${action} retains its clip throughout sampling`);
      assert.equal(sample.backend, 'webgl', `${action} remains on the actual GPU canvas`);
      const hash = createHash('sha256').update(sample.image).digest('hex');
      if (!intervals.has(sample.frame)) intervals.set(sample.frame, new Set());
      intervals.get(sample.frame).add(hash);
      return hash;
    });
    const unique = new Set(hashes).size;
    const repeated = hashes.filter((hash, index) => index > 0 && hash === hashes[index - 1]).length;
    assert.ok(unique >= Math.max(8, Math.ceil(hashes.length * .6)), `${action} renders continuous intermediate pixels (${unique}/${hashes.length} distinct, ${repeated} consecutive repeats)`);
    assert.ok([...intervals.values()].filter(values => values.size >= 3).length >= 2,
      `${action} changes rendered pixels within at least two original pose intervals`);
    const gaps = playback.callbacks.slice(1).map((now, index) => now - playback.callbacks[index]).sort((a, b) => a - b);
    const medianGap = gaps[Math.floor(gaps.length / 2)], p95Gap = gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * .95))];
    console.log(`${action} canvas continuity: ${playback.callbacks.length} rAF callbacks, median ${medianGap.toFixed(1)}ms / p95 ${p95Gap.toFixed(1)}ms; ${unique}/${hashes.length} distinct PNG hashes, ${repeated} repeats; pose intervals ${JSON.stringify([...intervals].map(([frame, values]) => [frame, values.size]))}.`);
    assert.deepEqual(await petBounds(), before, `${action} keeps its native window stationary`);
  }
  await panel.waitForFunction(async () => Date.now() - (await window.companion.getState()).lastInteraction >= 850);
  await panel.evaluate(() => window.companion.dispatch({ type: 'interact', action: 'play' }));
  const snapshot = await panel.evaluate(() => window.companion.getState());
  assert.equal(snapshot.action.type, 'play');
  assert.ok(snapshot.stats.bond > 0);
  await panel.evaluate(() => window.companion.dispatch({ type: 'settings', patch: { movement: 'edge', size: 0.8 } }));
  assert.equal((await panel.evaluate(() => window.companion.getState())).settings.movement, 'edge');
  await overlay.evaluate(() => window.companion.beginDrag());
  await overlay.waitForFunction(async () => (await window.companion.getState()).motion.dragging);
  await overlay.evaluate(() => window.companion.endDrag());
  await overlay.waitForFunction(async () => !(await window.companion.getState()).motion.dragging);
  assert.equal(await overlay.evaluate(() => window.companion.movePet({ x: -.2, y: -.2 })), true,
    'fractional signed-zero inputs are converted before native display lookup');
  await app.evaluate(({ BrowserWindow, screen }) => {
    const pet = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet'));
    const matching = screen.getDisplayMatching, cursor = screen.getCursorScreenPoint;
    const setPosition = pet.setPosition.bind(pet);
    const record = { samples: [], errors: [], cursor: { x: 0, y: 0 } };
    globalThis.pawpalBoundarySmoke = record;
    // Deterministic virtual display input, with the real native setPosition API.
    screen.getDisplayMatching = () => ({ workArea: { x: -800, y: -800, width: 2400, height: 2400 } });
    screen.getCursorScreenPoint = () => record.cursor;
    pet.setPosition = (x, y, ...args) => {
      record.samples.push({ x, y, negativeZero: Object.is(x, -0) || Object.is(y, -0) });
      try { return setPosition(x, y, ...args); }
      catch (error) { record.errors.push(error.message); }
    };
    record.restore = () => { screen.getDisplayMatching = matching; screen.getCursorScreenPoint = cursor; pet.setPosition = setPosition; };
    setPosition(1, 1);
  });
  try {
    await panel.evaluate(() => window.companion.dispatch({ type: 'settings', patch: { paused: true } }));
    await panel.evaluate(() => window.companion.dispatch({ type: 'settings', patch: { paused: false } }));
    await panel.waitForFunction(async () => Date.now() - (await window.companion.getState()).lastInteraction >= 850);
    await panel.evaluate(() => window.companion.dispatch({ type: 'interact', action: 'play' }));
    for (const direction of [-1, 1]) {
      await app.evaluate(({ BrowserWindow }, direction) => {
        const bounds = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet')).getBounds();
        globalThis.pawpalBoundarySmoke.cursor = { x: Math.round(bounds.width / 2 + direction * 5), y: Math.round(bounds.height * .6 + direction * 5) };
      }, direction);
      await overlay.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.clip === 'walk');
      const started = Date.now();
      while (Date.now() - started < 2000) await new Promise(resolve => setTimeout(resolve, 100));
    }
    const record = await app.evaluate(() => ({ samples: globalThis.pawpalBoundarySmoke.samples, errors: globalThis.pawpalBoundarySmoke.errors }));
    assert.deepEqual(record.errors, [], 'native travel across zero does not throw');
    assert.ok(record.samples.length > 50, 'both zero-crossing journeys run through the native movement timer');
    assert.ok(record.samples.every(point => Number.isInteger(point.x) && Number.isInteger(point.y) && !point.negativeZero), 'every native coordinate is an integer with positive zero');
    for (const axis of ['x', 'y']) for (const sign of [-1, 0, 1]) {
      assert.ok(record.samples.some(point => Math.sign(point[axis]) === sign), `${axis} crosses negative, zero and positive positions`);
    }
  } finally {
    await app.evaluate(() => { globalThis.pawpalBoundarySmoke.restore(); delete globalThis.pawpalBoundarySmoke; });
  }
  await panel.screenshot({ path: '.artifacts/desktop-panel.png' });
  await overlay.screenshot({ path: '.artifacts/desktop-pet.png', omitBackground: true });
  await app.close();
  app = null;
  const saved = JSON.parse(await readFile(path.join(userData, 'companion.json'), 'utf8'));
  assert.equal(saved.species, 'dog');
  assert.equal(saved.name, '团子');
  assert.equal(saved.settings.movement, 'edge');
  console.log('Electron smoke passed: desktop bridge, adoption, alpha transparency, actual WebGL canvas, rAF cadence, continuous rendered-pixel stretch/trick poses, stationary interaction, play, drag, signed-zero and fractional native coordinates, settings and persisted state.');
} finally {
  if (app) await app.close();
  await rm(userData, { recursive: true, force: true });
}
