import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PETS } from '../src/core/pets.js';

// A development checkout or explicitly supplied build uses a newly owned
// temporary profile. Neither path installs or modifies the user's app/profile.
const executablePath=process.env.PAWPAL_PACKAGED_EXECUTABLE;
const mode=executablePath?'packaged':'development';
const artifactPrefix=process.env.PAWPAL_SMOKE_ARTIFACT_PREFIX ?? (executablePath?'whole-frame-packaged-native':'whole-frame-native');
assert.match(artifactPrefix, /^[a-z0-9-]+$/);
// Exact pixel readback needs one raster path: frequent reference reads can
// switch its backend while the held complete photo retains earlier GPU pixels.
// This diagnostic switch does not change production rendering or FPS probes.
const rasterArgs=['--disable-accelerated-2d-canvas'];
const speciesList = process.env.PAWPAL_SMOKE_SPECIES ? [process.env.PAWPAL_SMOKE_SPECIES] : ['cat', 'dog', 'parrot'];
assert.ok(speciesList.every(species => ['cat', 'dog', 'parrot'].includes(species)));
const productVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
const reports = [];
const artifact = (species, name) => path.join('.artifacts', `${artifactPrefix}-${species}-${name}`);
await mkdir('.artifacts', { recursive: true });

const dispatch = (panel, command) => panel.evaluate(command => window.companion.dispatch(command), command);
const bounds = app => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet')).getBounds());
const pixels = overlay => overlay.evaluate(() => document.querySelector('.pet-sprite canvas').toDataURL('image/png'));

async function interact(panel, action) {
  const state = await panel.evaluate(() => window.companion.getState());
  const cooldown = Math.max(0, state.lastInteraction + 850 - Date.now());
  if (cooldown) await panel.waitForTimeout(cooldown);
  const result = await dispatch(panel, { type: 'interact', action });
  assert.equal(result.action.type, action, `${action} is accepted by the native process`);
  return result;
}

async function waitMotion(overlay, predicate, timeout = 4000) {
  const end = Date.now() + timeout;
  do {
    const motion = (await overlay.evaluate(() => window.companion.getState())).motion;
    if (predicate(motion)) return motion;
    await overlay.waitForTimeout(20);
  } while (Date.now() < end);
  assert.fail('native motion did not reach the requested state');
}

async function collect(app, overlay, milliseconds) {
  const [painted, native] = await Promise.all([
    overlay.evaluate(milliseconds => new Promise(resolve => {
      const started = performance.now(), samples = [], captures = [];
      let previousCapture = -Infinity;
      function sample(now) {
        const snapshot = window.pawpalDiscreteSmoke.snapshot();
        if (now - previousCapture >= 80) {
          const image = window.pawpalDiscreteSmoke.picture();
          captures.push({ sampleIndex: samples.length, ...image });
          previousCapture = now;
        }
        samples.push({ now, wallNow: Date.now(), ...snapshot });
        if (now - started < milliseconds) requestAnimationFrame(sample);
        else resolve({ samples, captures });
      }
      requestAnimationFrame(sample);
    }), milliseconds),
    app.evaluate(async ({ BrowserWindow }, milliseconds) => {
      const pet = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
      const end = Date.now() + milliseconds, samples = [];
      while (Date.now() < end) {
        samples.push({ wallNow: Date.now(), bounds: pet.getBounds() });
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      return samples;
    }, milliseconds),
  ]);
  assert.ok(painted.samples.length >= 5 && native.length >= 5, 'actual native and painted samples were observed');
  assertDiscrete(painted.samples);
  assert.ok(painted.captures.every(capture => capture.sourceExact), 'every captured canvas equals its intact source crop, uniform registration, and whole mirror');
  return { painted, native };
}

function assertDiscrete(samples) {
  assert.ok(samples.every(sample => sample.atlas === 'whole' && sample.renderer === 'whole-frame-2d'
    && sample.frame === sample.nextFrame && sample.mix === 0 && sample.ground === '' && sample.groundRenderer === ''
    && sample.transform === 'none' && sample.loadState === 'ready'), 'all observed poses use one complete authored frame');
}

async function saveRecord(species, name, record) {
  const captures = record.painted.captures;
  for (const [index, capture] of captures.entries()) {
    const sample = record.painted.samples[capture.sampleIndex];
    if (index === 0 || index === Math.floor(captures.length / 2) || index === captures.length - 1) {
      await writeFile(artifact(species, `${name}-${String(index).padStart(3, '0')}.png`), Buffer.from(capture.png.split(',')[1], 'base64'));
    }
    capture.frame = sample.frame;
    delete capture.png;
  }
  return { frames: [...new Set(record.painted.samples.map(sample => sample.frame))],
    distinctSourcePictures: new Set(captures.map(capture => capture.hash)).size,
    sourceExactCaptures: captures.length,
    observedMs: record.painted.samples.at(-1).now - record.painted.samples[0].now };
}

async function aim(app, direction, flying) {
  await app.evaluate(({ BrowserWindow }, { direction, flying }) => {
    const pet = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
    const bounds = pet.getBounds();
    globalThis.pawpalDiscreteSmoke.cursor = { x: Math.round(bounds.x + bounds.width / 2 + direction * 450),
      y: Math.round(bounds.y + bounds.height * .6 + (flying ? -direction * 170 : 0)) };
  }, { direction, flying });
}

async function installObservers(app, overlay, meta) {
  await app.evaluate(({ BrowserWindow, screen }) => {
    const pet = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
    const record = { cursor: { x: -500, y: 0 }, journal: [] };
    globalThis.pawpalDiscreteSmoke = record;
    screen.getCursorScreenPoint = () => record.cursor;
    Math.random = () => .99;
    const send = pet.webContents.send.bind(pet.webContents);
    pet.webContents.send = (channel, ...args) => {
      if (channel === 'companion:motion') record.journal.push({ wallNow: Date.now(), motion: args[0], bounds: pet.getBounds() });
      return send(channel, ...args);
    };
  });
  await overlay.evaluate(async meta => {
    const sources = await Promise.all(meta.pages.map(page => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject;
      image.src = new URL(page.asset, location.href).href;
    })));
    const reference = document.createElement('canvas'); reference.width = reference.height = 256;
    const context = reference.getContext('2d');
    const record = { packets: [], armed: true };
    const snapshot = () => {
      const pet = document.querySelector('.pet-sprite'), canvas = pet.querySelector('canvas');
      return { frame: Number(pet.dataset.frame), nextFrame: Number(pet.dataset.nextFrame), mix: Number(pet.dataset.mix),
        phase: Number(pet.dataset.phase), distance: Number(pet.dataset.motionDistance), epoch: Number(pet.dataset.motionEpoch),
        facing: Number(pet.dataset.facing), orientation: Number(pet.dataset.orientation), size: pet.getBoundingClientRect().width,
        clip: pet.dataset.clip, transition: pet.dataset.transition, transitionRemaining: Number(pet.dataset.transitionRemaining),
        turning: pet.dataset.turning === 'true', turnRemaining: Number(pet.dataset.turnRemaining),
        atlas: pet.dataset.atlas, renderer: canvas.dataset.renderer, ground: pet.dataset.ground,
        groundRenderer: canvas.dataset.groundRenderer ?? '', transform: pet.style.transform, loadState: pet.dataset.loadState };
    };
    const picture = () => {
      const sample = snapshot(), canvas = document.querySelector('.pet-sprite canvas');
      const frame = meta.frames[sample.frame], page = meta.pages[frame.page];
      const scale = 256 / Math.max(page.sourceSize[0] / page.columns, page.sourceSize[1] / page.rows) * (page.scale ?? 1);
      const [x, y, width, height] = frame.rect;
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, 256, 256); context.save();
      if (sample.orientation * (frame.mirror ?? 1) === -1) { context.translate(256, 0); context.scale(-1, 1); }
      context.drawImage(sources[frame.page], x, y, width, height,
        (256 - width * scale) / 2 + (frame.offsetX ?? 0), (256 - height * scale) / 2 + (frame.offsetY ?? 0), width * scale, height * scale);
      context.restore();
      const actual = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
      const expected = context.getImageData(0, 0, 256, 256).data;
      let sourceExact = true, opaquePixels = 0, hash = 2166136261;
      for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) sourceExact = false;
        hash = Math.imul(hash ^ actual[i], 16777619) >>> 0;
        if (i % 4 === 3 && actual[i] > 230) opaquePixels++;
      }
      return { sourceExact, opaquePixels, hash, png: canvas.toDataURL('image/png') };
    };
    // The application registered its motion listener first. This second listener
    // observes the DOM in the same IPC delivery, after its imperative paint.
    record.remove = window.companion.onMotion(packet => {
      if (record.armed) record.packets.push({ wallNow: Date.now(), packet, ...snapshot() });
    });
    record.snapshot = snapshot; record.picture = picture;
    window.pawpalDiscreteSmoke = record;
  }, meta);
}

async function freeze(app, panel, overlay, mode) {
  if (mode === 'paused') await dispatch(panel, { type: 'settings', patch: { paused: true } });
  else if (mode === 'dragging') await overlay.evaluate(() => window.companion.beginDrag());
  else await overlay.emulateMedia({ reducedMotion: 'reduce' });
  await waitMotion(overlay, motion => mode === 'dragging' ? motion.dragging : motion.paused);
  await overlay.waitForTimeout(70);
  const beforePixels = await pixels(overlay), beforeBounds = await bounds(app);
  const before = await overlay.evaluate(() => window.pawpalDiscreteSmoke.snapshot());
  await overlay.waitForTimeout(280);
  assert.equal(await pixels(overlay), beforePixels, `${mode} freezes exact canvas pixels`);
  assert.deepEqual(await bounds(app), beforeBounds, `${mode} freezes accepted native position`);
  const after = await overlay.evaluate(() => window.pawpalDiscreteSmoke.snapshot());
  assert.equal(after.phase, before.phase, `${mode} freezes phase`);
  assert.equal(after.frame, before.frame, `${mode} freezes the displayed source frame`);
  if (mode === 'paused') await dispatch(panel, { type: 'settings', patch: { paused: false } });
  else if (mode === 'dragging') await overlay.evaluate(() => window.companion.endDrag());
  else await overlay.emulateMedia({ reducedMotion: 'no-preference' });
  await waitMotion(overlay, motion => !motion.paused && !motion.dragging);
  return { mode, exactPixels: true, nativePosition: true, phase: before.phase, frame: before.frame };
}

for (const species of speciesList) {
  const definition = PETS.find(pet => pet.id === species);
  const meta = JSON.parse(await readFile(path.join('public', definition.wholeMetaAsset), 'utf8'));
  assert.equal(definition.wholeRenderMode, 'discrete-whole-frame');
  assert.equal(meta.version, 7); assert.equal(meta.renderMode, 'discrete-whole-frame');
  assert.equal(meta.pages.length, 3); assert.equal(meta.frames.length, 128); assert.equal(meta.clips.walk.frames.length, 32);
  assert.equal(meta.stride, species === 'parrot' ? 80 : 32);
  for (const key of ['flow', 'handoffs', 'groundGait', 'groundRise']) assert.equal(meta[key], undefined);
  const userData = await mkdtemp(path.join(tmpdir(), `pawpal-discrete-${species}-`));
  const report = { species, productVersion, metadataVersion: meta.version, renderMode: meta.renderMode, stride: meta.stride,
    profile: 'fresh owned temporary profile', mode, sourceFrames: meta.frames.length, sourcePages: meta.pages.length,
    rasterReadbackMode: 'software-2d',
    scope: 'sampled live native playback; no claim that every authored frame was visually reviewed', startedAt: new Date().toISOString() };
  let app, overlay;
  try {
    const env = { ...process.env, PAWPAL_TEST_USER_DATA: userData }; delete env.VITE_DEV_SERVER_URL;
    app = await electron.launch({ ...(executablePath?{executablePath,args:rasterArgs}:{args:['.',...rasterArgs]}), env, timeout: 30000 });
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), Boolean(executablePath));
    assert.equal(await app.evaluate(({ app }) => app.getVersion()), productVersion);
    const panel = await app.firstWindow(); await panel.waitForFunction(() => Boolean(window.companion));
    await app.evaluate(({ screen }) => { screen.getCursorScreenPoint = () => ({ x: -500, y: 0 }); });
    await app.context().addInitScript(() => { Math.random = () => .99; });
    const overlayPromise = app.waitForEvent('window', { predicate: page => page !== panel });
    await dispatch(panel, { type: 'adopt', species, name: `Whole ${species}` }); overlay = await overlayPromise;
    await overlay.emulateMedia({ reducedMotion: 'no-preference' });
    await overlay.waitForFunction(() => {
      const pet = document.querySelector('.pet-sprite'), canvas = pet?.querySelector('canvas');
      return pet?.dataset.atlas === 'whole' && pet.dataset.loadState === 'ready' && canvas?.dataset.renderer === 'whole-frame-2d'
        && canvas.style.visibility === 'visible';
    }, null, { timeout: 15000 });
    report.rasterReadback = await app.evaluate(({ app }) => ({
      controlledSoftware2d: app.commandLine.hasSwitch('disable-accelerated-2d-canvas'),
      gpuFeatureStatus: app.getGPUFeatureStatus(),
    }));
    assert.equal(report.rasterReadback.controlledSoftware2d, true);
    const loadedMeta = await overlay.evaluate(async asset => fetch(new URL(asset, location.href)).then(response => response.json()), definition.wholeMetaAsset);
    assert.deepEqual(loadedMeta, meta, 'native app loads the activated metadata');
    await installObservers(app, overlay, meta);
    const idlePicture = await overlay.evaluate(() => window.pawpalDiscreteSmoke.picture());
    assert.equal(idlePicture.sourceExact, true); assert.ok(idlePicture.opaquePixels > 3000);
    await writeFile(artifact(species, 'idle.png'), Buffer.from(idlePicture.png.split(',')[1], 'base64'));
    report.nativeTransparency = await app.evaluate(async ({ BrowserWindow }) => {
      const pet = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
      const bitmap = (await pet.webContents.capturePage()).toBitmap();
      return pet.isVisible() && bitmap.length > 0 && bitmap[3] === 0;
    });
    assert.equal(report.nativeTransparency, true);
    await dispatch(panel, { type: 'settings', patch: { paused: true, size: .8, movement: 'edge' } });
    await app.evaluate(({ BrowserWindow, screen }) => {
      const pet = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
      const area = screen.getPrimaryDisplay().workArea, size = pet.getBounds();
      pet.setPosition(Math.round(area.x + (area.width - size.width) / 2), Math.round(area.y + (area.height - size.height) / 2));
    });
    const centered = await bounds(app); await overlay.evaluate(point => window.companion.movePet(point), { x: centered.x, y: centered.y });
    await aim(app, 1, species === 'parrot');
    await app.evaluate(() => { globalThis.pawpalDiscreteSmoke.journal = []; });
    await overlay.evaluate(() => { window.pawpalDiscreteSmoke.packets = []; });
    const startupPromise = collect(app, overlay, 900);
    await dispatch(panel, { type: 'settings', patch: { paused: false } });
    await interact(panel, 'play');
    const startup = await startupPromise;
    report.startup = await saveRecord(species, 'startup', startup);
    await waitMotion(overlay, motion => motion.moving && motion.distanceDip > 0);
    const startupJournal = await app.evaluate(() => globalThis.pawpalDiscreteSmoke.journal);
    const preparing = startupJournal.find(entry => entry.motion.intentMoving && !entry.motion.moving);
    const started = startupJournal.find(entry => entry.motion.moving && entry.motion.distanceDip > 0);
    assert.ok(preparing && started, 'native journal brackets preparation and first accepted travel');
    const preparationMs = started.wallNow - preparing.wallNow;
    assert.ok(preparationMs >= 110, `whole entry holds travel through its120ms preparation (${preparationMs}ms observed)`);
    for(const frame of meta.transitions.walk.enter.frames)assert.ok(startup.painted.samples.some(sample=>sample.frame===frame),'native startup actually paints each authored entry picture');
    const startupHold = startup.native.filter(sample => sample.wallNow >= preparing.wallNow && sample.wallNow < started.wallNow);
    assert.ok(startupHold.length >= 4); for (const sample of startupHold) assert.deepEqual(sample.bounds, preparing.bounds);
    report.preparationMs = preparationMs;
    const walking = await collect(app, overlay, 1500);
    report.walking = await saveRecord(species, 'walking', walking);
    const first = walking.painted.samples[0], last = walking.painted.samples.at(-1);
    assert.ok(walking.painted.samples.every(sample => sample.clip === 'walk' && !sample.turning && !sample.transition));
    const normalizer = (await overlay.evaluate(() => window.companion.getState())).motion.spriteSizeDip;
    assert.ok(Math.abs(normalizer - first.size) < .05, 'native normalizer matches the padded rendered sprite width');
    const phaseDelta = last.phase - first.phase, distancePhase = (last.distance - first.distance) * 256 / normalizer / meta.stride;
    assert.ok(phaseDelta > .5); assert.ok(Math.abs(phaseDelta - distancePhase) < 1e-6, 'painted phase follows every accepted native displacement with the sprite normalizer');
    assert.ok(walking.native.at(-1).bounds.x > walking.native[0].bounds.x + 5, 'the actual native window travels right');
    if (species === 'parrot') assert.ok(Math.abs(walking.native.at(-1).bounds.y - walking.native[0].bounds.y) > 5, 'actual native flight also travels vertically');
    report.walking.phaseDelta = phaseDelta; report.walking.distancePhase = distancePhase;
    report.walking.spriteSizeDip = normalizer; report.walking.renderedSizeDip = first.size;
    await app.evaluate(() => { globalThis.pawpalDiscreteSmoke.journal = []; });
    const reversalPromise = collect(app, overlay, species === 'parrot' ? 500 : 1350);
    await aim(app, -1, species === 'parrot');
    const reversal = await reversalPromise;
    report.reversal = await saveRecord(species, 'reversal', reversal);
    if (species === 'parrot') {
      assert.ok(reversal.painted.samples.some(sample => sample.facing === -1));
      assert.ok(reversal.painted.samples.every(sample => !sample.turning));
    } else {
      const turnSamples = reversal.painted.samples.filter(sample => sample.turning);
      const entrySamples = reversal.painted.samples.filter(sample => sample.transition === 'walk.enter' && sample.facing === -1);
      assert.ok(turnSamples.length >= 30 && entrySamples.length >= 3, 'reversal paints its turn and following whole entry before travel');
      const journal = await app.evaluate(() => globalThis.pawpalDiscreteSmoke.journal);
      const began = journal.find(entry => entry.motion.facing === -1 && !entry.motion.moving);
      assert.ok(began, 'native journal observes the start of grounded reversal');
      const resumed = journal.find(entry => entry.motion.facing === -1 && entry.motion.moving && entry.motion.distanceDip > began.motion.distanceDip);
      assert.ok(began && resumed, 'native journal brackets grounded reversal');
      const holdMs = resumed.wallNow - began.wallNow;
      assert.ok(holdMs >= 900 && holdMs <= 1250, `native reversal holds its800ms turn and120ms whole entry (${holdMs}ms)`);
      const stationary = reversal.native.filter(sample => sample.wallNow >= began.wallNow && sample.wallNow < resumed.wallNow);
      assert.ok(stationary.length >= 40); for (const sample of stationary) assert.deepEqual(sample.bounds, began.bounds);
      const visibleTurnMs = turnSamples.at(-1).now - turnSamples[0].now;
      assert.ok(visibleTurnMs >= 730 && visibleTurnMs <= 900, `visible authored turn spans800ms (${visibleTurnMs}ms)`);
      report.reversal.holdMs = holdMs; report.reversal.visibleTurnMs = visibleTurnMs;
      report.reversal.followingEntryFrames = [...new Set(entrySamples.map(sample => sample.frame))];
    }
    report.freezes = [];
    for (const mode of ['paused', 'dragging', 'reducedMotion']) report.freezes.push(await freeze(app, panel, overlay, mode));
    report.care = [];
    for (const action of ['pet', 'feed', 'stretch', 'trick', 'rest']) {
      const result = await interact(panel, action), clip = action === 'trick' ? 'hop' : action;
      await overlay.waitForFunction(clip => document.querySelector('.pet-sprite')?.dataset.clip === clip, clip);
      const before = await bounds(app), record = await collect(app, overlay, action === 'rest' ? 900 : 1050);
      for (const sample of record.native) assert.deepEqual(sample.bounds, before, `${action} holds the actual native window stationary`);
      assert.ok(record.native.every(sample => sample.wallNow < result.action.until), 'care samples stay inside the accepted action lifetime');
      assert.ok(record.painted.samples.every(sample => sample.clip === clip));
      const allowed = new Set([...meta.clips[clip].frames, ...(meta.transitions[clip]?.enter?.frames ?? [])]);
      assert.ok(record.painted.samples.every(sample => allowed.has(sample.frame)), 'care selects only authored complete source frames');
      assert.ok(new Set(record.painted.samples.map(sample => sample.frame)).size >= 2, 'sampled care advances through authored source pictures');
      report.care.push({ action, ...await saveRecord(species, `care-${action}`, record) });
    }
    const packetSamples = await overlay.evaluate(() => window.pawpalDiscreteSmoke.packets);
    assertDiscrete(packetSamples);
    assert.ok(packetSamples.length >= 80);
    // Freeze deliberately retains the prior picture through stationary epoch
    // resets. Accepted travel is the synchronous-paint contract being checked.
    const activePackets = packetSamples.filter(sample => sample.packet.moving && !sample.packet.paused && !sample.packet.dragging);
    assert.ok(activePackets.every(sample => sample.distance === sample.packet.distanceDip && sample.epoch === sample.packet.epoch), 'every observed accepted travel IPC paints its distance and epoch synchronously');
    const walkingPackets = packetSamples.filter(sample => sample.clip === 'walk' && !sample.transition && !sample.turning && sample.packet.moving);
    assert.ok(walkingPackets.length >= 40);
    const clipDuration = meta.clips.walk.durations.reduce((sum, duration) => sum + duration, 0);
    for (const sample of walkingPackets) {
      let remaining = (sample.phase % 1) * clipDuration, index = 0;
      while (index < meta.clips.walk.frames.length - 1 && remaining >= meta.clips.walk.durations[index]) remaining -= meta.clips.walk.durations[index++];
      assert.equal(sample.frame, meta.clips.walk.frames[index], 'accepted travel packet paints the distance-selected complete walk frame');
    }
    report.synchronousMotionPackets = activePackets.length; report.synchronousWalkPackets = walkingPackets.length;
    report.passed = true;
    report.trace = { startup, walking, reversal, packets: packetSamples, nativeJournal: await app.evaluate(() => globalThis.pawpalDiscreteSmoke.journal) };
    console.log(`${species}: ${mode} whole-frame native check passed (${activePackets.length} synchronous accepted-travel packets, ${preparationMs}ms preparation).`);
  } catch (error) {
    report.passed = false; report.failure = error.stack ?? String(error);
    if (overlay) {
      report.failureSnapshot = await overlay.evaluate(() => ({ snapshot: window.pawpalDiscreteSmoke?.snapshot?.(), packets: window.pawpalDiscreteSmoke?.packets })).catch(() => null);
      await writeFile(artifact(species, 'failure.png'), Buffer.from((await pixels(overlay).catch(() => '')).split(',')[1] ?? '', 'base64'));
    }
    if (app) report.failureNativeJournal = await app.evaluate(() => globalThis.pawpalDiscreteSmoke?.journal).catch(() => null);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(artifact(species, 'report.json'), JSON.stringify(report, null, 2));
    if (app) await app.close();
    await rm(userData, { recursive: true, force: true });
  }
  const { trace, ...summary } = report; reports.push(summary);
}
await writeFile(path.join('.artifacts', `${artifactPrefix}-report.json`), JSON.stringify(reports, null, 2));
console.log(`${mode} whole-frame native checks passed for ${reports.map(report => report.species).join(', ')}.`);
