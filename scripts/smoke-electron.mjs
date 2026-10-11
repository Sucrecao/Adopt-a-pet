import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
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
  await overlay.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.atlas === 'rig');
  await overlay.waitForFunction(() => {
    const canvas = document.querySelector('.pet-sprite canvas');
    return canvas?.dataset.renderer === 'rig-2d' && getComputedStyle(canvas).visibility === 'visible';
  });
  assert.equal(await overlay.evaluate(() => document.querySelector('.pet-sprite canvas')?.dataset.renderer), 'rig-2d',
    'actual Electron companion uses the articulated rig renderer');
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
    await new Promise(resolve => setTimeout(resolve, 900));
    const dispatched = await panel.evaluate(action => window.companion.dispatch({ type: 'interact', action }), action);
    assert.equal(dispatched.action.type, action, `${action} is accepted by main process`);
    const expected = action === 'trick' ? 'hop' : 'stretch';
    await overlay.waitForFunction(clip => document.querySelector('.pet-sprite')?.dataset.clip === clip, expected);
    const before = await petBounds();
    console.log(action, before, (await panel.evaluate(() => window.companion.getState())).action);
    const [playback, stationary] = await Promise.all([overlay.evaluate(() => new Promise(resolve => {
      const frames = new Set(), callbacks = [], pixels = [], started = performance.now();
      let previousCapture = -Infinity;
      function sample(now) {
        const sprite = document.querySelector('.pet-sprite'), canvas = sprite.querySelector('canvas');
        callbacks.push(now);
        frames.add(sprite.dataset.frame);
        // Read composed PNG pixels without treating repaint counts as gait proof.
        if (now - previousCapture >= 50) {
          pixels.push({ now, frame: sprite.dataset.frame, clip: sprite.dataset.clip, backend: canvas.dataset.renderer, image: canvas.toDataURL('image/png') });
          previousCapture = now;
        }
        if (now - started < 700) requestAnimationFrame(sample); else resolve({ frames: [...frames], callbacks, pixels });
      }
      requestAnimationFrame(sample);
    })), app.evaluate(async ({ BrowserWindow }, until) => {
      const pet = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet'));
      const samples = [];
      const end = Math.min(until - 50, Date.now() + 650);
      while (Date.now() < end) {
        samples.push({ now: Date.now(), bounds: pet.getBounds() });
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return samples;
    }, dispatched.action.until)]);
    assert.ok(stationary.length >= 15, `${action} has substantial native samples within action lifetime`);
    assert.ok(stationary.every(sample => sample.now < dispatched.action.until), `${action} native samples stay inside explicit action lifetime`);
    for (const sample of stationary) assert.deepEqual(sample.bounds, before, `${action} keeps native window stationary during its active lifetime`);
    assert.ok(playback.pixels.length >= 10, `${action} supplies rendered pixel samples`);
    assert.ok(playback.pixels.every(sample => sample.clip === expected && sample.backend === 'rig-2d'));
    assert.ok(new Set(playback.pixels.map(sample => sample.image)).size >= 5, `${action} visibly articulates`);

  }
  await new Promise(resolve => setTimeout(resolve, 900));
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
    const record = { samples: [], journal: [], motionJournal: [], distance: 0, errors: [], cursor: { x: 0, y: 0 } };
    globalThis.pawpalBoundarySmoke = record;
    const send = pet.webContents.send.bind(pet.webContents);
    pet.webContents.send = (channel, ...args) => {
      if (channel === 'companion:motion') record.motionJournal.push({ motion: args[0], bounds: pet.getBounds(), monotonicMs: performance.now(), wallMs: Date.now() });
      return send(channel, ...args);
    };
    // Deterministic virtual display input, with the real native setPosition API.
    screen.getDisplayMatching = () => ({ workArea: { x: -800, y: -800, width: 2400, height: 2400 } });
    screen.getCursorScreenPoint = () => record.cursor;
    pet.setPosition = (x, y, ...args) => {
      record.samples.push({ x, y, negativeZero: Object.is(x, -0) || Object.is(y, -0) });
      try {
        const before = pet.getBounds();
        const result = setPosition(x, y, ...args);
        const bounds = pet.getBounds();
        record.distance += Math.abs(bounds.x - before.x);
        record.journal.push({ monotonicMs: performance.now(), wallMs: Date.now(), distance: record.distance, bounds });
        return result;
      }
      catch (error) { record.errors.push(error.message); }
    };
    record.restore = () => { screen.getDisplayMatching = matching; screen.getCursorScreenPoint = cursor; pet.setPosition = setPosition; pet.webContents.send = send; };
    setPosition(1, 1);
  });
  try {
    await panel.evaluate(() => window.companion.dispatch({ type: 'settings', patch: { paused: true } }));
    await panel.evaluate(() => window.companion.dispatch({ type: 'settings', patch: { paused: false } }));
    await new Promise(resolve => setTimeout(resolve, 900));
    await panel.evaluate(() => window.companion.dispatch({ type: 'interact', action: 'play' }));
    for (const direction of [-1, 1]) {
      await app.evaluate(({ BrowserWindow }, direction) => {
        const bounds = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet')).getBounds();
        globalThis.pawpalBoundarySmoke.cursor = { x: Math.round(bounds.width / 2 + direction * 5), y: Math.round(bounds.height * .6 + direction * 5) };
      }, direction);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    await new Promise(resolve => setTimeout(resolve, 900));
    assert.equal((await panel.evaluate(() => window.companion.dispatch({ type: 'interact', action: 'play' }))).action.type, 'play');
    // Pair renderer contact positions with actual native bounds; a planted foot
    // must remain at one world coordinate while the root advances underneath it.
    await app.evaluate(({ BrowserWindow }) => {
      const pet = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet'));
      const record = globalThis.pawpalBoundarySmoke;
      record.distance = 0; record.journal = [{ distance: 0, bounds: pet.getBounds(), monotonicMs: performance.now(), wallMs: Date.now() }];
      record.cursor = { x: -500, y: 500 };
    });
    await overlay.evaluate(() => {
      window.pawpalSmokeRafTimes = []; window.pawpalSmokeRafActive = true;
      const sample = now => { window.pawpalSmokeRafTimes.push(now); if (window.pawpalSmokeRafActive) requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
    });
    const gait = [], captureIntervals = [];
    for (let index = 0; index < 100; index++) {
      if (index === 38) await app.evaluate(() => { globalThis.pawpalBoundarySmoke.cursor = { x: 700, y: 500 }; });
      gait.push(await app.evaluate(async ({ BrowserWindow }) => {
        const pet = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet'));
        const rendered = await pet.webContents.executeJavaScript(`(() => {
          const sprite = document.querySelector('.pet-sprite'), rect = sprite.getBoundingClientRect();
          return { rendererMs: performance.now(), rendererWallMs: Date.now(), dataset: { ...sprite.dataset }, phase: Number(sprite.dataset.phase), facing: Number(sprite.style.getPropertyValue('--pet-facing')), contacts: JSON.parse(sprite.dataset.contacts || '[]'),
            left: rect.left, top: rect.top, size: rect.width, clip: sprite.dataset.clip };
        })()`);
        return { ...rendered, nativeMs: performance.now(), nativeWallMs: Date.now(), bounds: pet.getBounds() };
      }));
      if ([0, 35, 40, 55, 75, 95].includes(index)) {
        const start = await overlay.evaluate(() => performance.now());
        const png = await app.evaluate(async ({ BrowserWindow }) => {
          const pet = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet'));
          return (await pet.webContents.capturePage()).toPNG().toString('base64');
        });
        await writeFile(`.artifacts/grounded-native-${index}.png`, Buffer.from(png, 'base64'));
        captureIntervals.push([start, await overlay.evaluate(() => performance.now())]);
      }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    const rafTimes = await overlay.evaluate(() => { window.pawpalSmokeRafActive = false; return window.pawpalSmokeRafTimes; });
    const nativeJournal = await app.evaluate(() => globalThis.pawpalBoundarySmoke.journal);
    const motionJournal = await app.evaluate(() => globalThis.pawpalBoundarySmoke.motionJournal);
    await writeFile('.artifacts/grounded-native-trace.json', JSON.stringify({ gait, nativeJournal, motionJournal, rafTimes, captureIntervals }, null, 2));
    // Match each painted pose to the exact accepted native distance that drove
    // it, eliminating main/IPC/RAF sampling lag rather than widening drift.
    const packetLags = [], movingPacketLags = [], displayRootErrors = [];
    for (const sample of gait) {
      const distance = Number(sample.dataset.motionDistance);
      assert.ok(Number.isFinite(distance), 'painted pose exposes applied locomotion distance');
      const epoch = Number(sample.dataset.motionEpoch);
      const accepted = motionJournal.find(item => item.motion.epoch === epoch && item.motion.distanceDip === distance);
      assert.ok(accepted, `painted distance ${distance} has an actual accepted native root journal entry`);
      packetLags.push(sample.nativeMs - accepted.monotonicMs);
      const rootError = Math.abs(sample.bounds.x - accepted.bounds.x);
      displayRootErrors.push(rootError);
      if (rootError > 0) movingPacketLags.push(sample.nativeMs - accepted.monotonicMs);
      sample.observedBounds = sample.bounds; sample.bounds = accepted.bounds;
    }
    const percentile = (values, quantile) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * quantile))];
    const rafGaps = rafTimes.slice(1).flatMap((time, index) => captureIntervals.some(([start, end]) => rafTimes[index] <= end && time >= start) ? [] : [time - rafTimes[index]]);
    const timing = { rootDistanceAgeAllMs: { median: percentile(packetLags, .5), p95: percentile(packetLags, .95), max: Math.max(...packetLags) },
      movingPaintLagMs: { samples: movingPacketLags.length, median: percentile(movingPacketLags, .5) || 0, p95: percentile(movingPacketLags, .95) || 0, max: Math.max(0, ...movingPacketLags) },
      displayedRootErrorDip: { median: percentile(displayRootErrors, .5), p95: percentile(displayRootErrors, .95), max: Math.max(...displayRootErrors) },
      rafOutsideCaptureMs: { samples: rafGaps.length, median: percentile(rafGaps, .5), p95: percentile(rafGaps, .95), max: Math.max(...rafGaps) } };
    await writeFile('.artifacts/grounded-native-timing.json', JSON.stringify(timing, null, 2));
    console.log(`Native paint timing: ${JSON.stringify(timing)}`);
    assert.ok(timing.displayedRootErrorDip.max < 5, 'displayed planted pose stays within one native movement tick of current root');
    assert.ok(timing.movingPaintLagMs.max < 50, 'moving renderer does not accumulate a stale locomotion packet backlog');
    assert.ok(timing.rafOutsideCaptureMs.p95 < 35, 'native rig animation avoids sustained stutter outside screenshot readbacks');
    const planted = [], supportWorlds = new Map();
    let reversalSupports = 0;
    const world = (sample, foot) => [sample.bounds.x + sample.left + foot.x * sample.size / 256,
      sample.bounds.y + sample.top + foot.y * sample.size / 256];
    for (const sample of gait) for (const foot of sample.contacts) {
      assert.equal(typeof foot.supportGeneration, 'string', 'every planted contact has explicit support lifetime');
      const key = `${foot.id}:${foot.supportGeneration}`;
      const points = supportWorlds.get(key) || [];
      points.push(world(sample, foot)); supportWorlds.set(key, points);
    }
    for (let index = 1; index < gait.length; index++) {
      const before = gait[index - 1], after = gait[index];
      for (const contact of after.contacts) {
        const old = before.contacts.find(item => item.id === contact.id && item.supportGeneration === contact.supportGeneration);
        if (!old) continue; // Genuine lift/replant changes the support lifetime.
        const first = world(before, old), second = world(after, contact);
        planted.push({ index, id: contact.id, generation: contact.supportGeneration, facing: [before.facing, after.facing], root: [before.bounds.x, after.bounds.x], local: [old.x, contact.x], phase: [before.phase, after.phase], dx: Math.abs(second[0] - first[0]), dy: Math.abs(second[1] - first[1]) });
        if (before.facing !== after.facing) reversalSupports++;
      }
    }
    const rootDeltas = gait.slice(1).map((sample, index) => sample.bounds.x - gait[index].bounds.x);
    assert.ok(rootDeltas.some(delta => delta < -1) && rootDeltas.some(delta => delta > 1), 'native root travels in both directions during intentional chase reversal');
    assert.ok(rootDeltas.reduce((total, delta) => total + Math.abs(delta), 0) > 120, 'gait capture includes substantial accepted native root travel');
    assert.ok(gait.at(-1).phase - gait[0].phase > .5, 'accepted native distance advances a substantial gait cycle');
    assert.ok(reversalSupports > 0, 'capture proves continuing planted support across the actual facing reversal');
    assert.ok(planted.length > 80, 'capture includes substantial planted-contact support');
    assert.ok(planted.every(item => item.dx < 5 && item.dy < 2), `planted feet stay fixed across reversal: ${JSON.stringify(planted.filter(item => item.dx >= 5 || item.dy >= 2))}`);
    // Check an entire support lifetime as well as adjacent samples, so slow
    // accumulated sliding cannot hide behind small per-frame displacement.
    for (const [key, points] of supportWorlds) if (points.length >= 3) {
      const spread = axis => Math.max(...points.map(point => point[axis])) - Math.min(...points.map(point => point[axis]));
      assert.ok(spread(0) < 5 && spread(1) < 2, `${key} remains at one world position for its entire planted support (${spread(0).toFixed(2)}, ${spread(1).toFixed(2)} DIP)`);
    }
    console.log(`Grounded reversal gait: ${planted.length} contact pairs, ${reversalSupports} continuing reversal supports; max world drift ${Math.max(...planted.map(item => item.dx)).toFixed(2)} DIP.`);
    for (const setting of ['paused', 'reducedMotion']) {
      if (setting === 'paused') await panel.evaluate(() => window.companion.dispatch({ type: 'settings', patch: { paused: true } }));
      else await overlay.emulateMedia({ reducedMotion: 'reduce' });
      await overlay.waitForFunction(async () => (await window.companion.getState()).motion.paused);
      await new Promise(resolve => setTimeout(resolve, 100));
      const frozen = await overlay.evaluate(() => document.querySelector('.pet-sprite canvas').toDataURL());
      const bounds = await petBounds();
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal(await overlay.evaluate(() => document.querySelector('.pet-sprite canvas').toDataURL()), frozen, `${setting} freezes all rendered pixels`);
      assert.deepEqual(await petBounds(), bounds, `${setting} freezes the native root`);
      if (setting === 'paused') await panel.evaluate(() => window.companion.dispatch({ type: 'settings', patch: { paused: false } }));
      else await overlay.emulateMedia({ reducedMotion: 'no-preference' });
    }
    const record = await app.evaluate(() => ({ samples: globalThis.pawpalBoundarySmoke.samples, errors: globalThis.pawpalBoundarySmoke.errors }));
    assert.deepEqual(record.errors, [], 'native travel across zero does not throw');
    assert.ok(record.samples.length > 50, 'both zero-crossing journeys run through the native movement timer');
    assert.ok(record.samples.every(point => Number.isInteger(point.x) && Number.isInteger(point.y) && !point.negativeZero), 'every native coordinate is an integer with positive zero');
    assert.ok(record.samples.every(point => point.y === record.samples[0].y), 'dog keeps its ground Y during chase');
    for (const axis of ['x']) for (const sign of [-1, 0, 1]) {
      assert.ok(record.samples.some(point => Math.sign(point[axis]) === sign), `${axis} crosses negative, zero and positive positions`);
    }
    await panel.evaluate(() => window.companion.dispatch({ type: 'adopt', species: 'parrot', name: '团子' }));
    await app.evaluate(({ BrowserWindow }) => {
      const pet = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet'));
      pet.setPosition(1, 1); globalThis.pawpalBoundarySmoke.samples = [];
    });
    await panel.evaluate(() => window.companion.dispatch({ type: 'settings', patch: { paused: true } }));
    await panel.evaluate(() => window.companion.dispatch({ type: 'settings', patch: { paused: false } }));
    await new Promise(resolve => setTimeout(resolve, 900));
    await panel.evaluate(() => window.companion.dispatch({ type: 'interact', action: 'play' }));
    for (const direction of [-1, 1]) {
      await app.evaluate(({ BrowserWindow }, direction) => {
        const bounds = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('view=pet')).getBounds();
        globalThis.pawpalBoundarySmoke.cursor = { x: bounds.x + bounds.width / 2, y: Math.round(bounds.height * .6 + direction * 5) };
      }, direction);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    const bird = await app.evaluate(() => ({ samples: globalThis.pawpalBoundarySmoke.samples, errors: globalThis.pawpalBoundarySmoke.errors }));
    assert.deepEqual(bird.errors, []);
    assert.ok(bird.samples.every(point => Number.isInteger(point.y) && !point.negativeZero));
    for (const sign of [-1, 0, 1]) assert.ok(bird.samples.some(point => Math.sign(point.y) === sign), 'parrot crosses Y zero');
    await panel.evaluate(() => window.companion.dispatch({ type: 'adopt', species: 'dog', name: '团子' }));
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
  assert.equal(saved.settings.size, 0.8);
  assert.equal(saved.motion, undefined, 'runtime locomotion is never persisted');
  console.log('Electron smoke passed: desktop bridge, adoption, alpha transparency, articulated Canvas2D, grounded travel and rendered stretch/trick poses, stationary interaction, play, drag, signed-zero and fractional native coordinates, settings and persisted state.');
} finally {
  if (app) await app.close();
  await rm(userData, { recursive: true, force: true });
}
