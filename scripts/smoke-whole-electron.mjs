import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PETS } from '../src/core/pets.js';

const speciesList = process.env.PAWPAL_SMOKE_SPECIES ? [process.env.PAWPAL_SMOKE_SPECIES] : ['cat', 'dog', 'parrot'];
assert.ok(speciesList.every(species => ['cat', 'dog', 'parrot'].includes(species)), 'PAWPAL_SMOKE_SPECIES must be cat, dog or parrot');
const executablePath = process.env.PAWPAL_PACKAGED_EXECUTABLE;
const expectedVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
const expectSurface=process.argv.includes('--expect-surface');
const captureSurface=process.argv.includes('--capture-surface');
const summaries = [];
await mkdir('.artifacts', { recursive: true });

async function launch(userData) {
  const env = { ...process.env, PAWPAL_TEST_USER_DATA: userData };
  delete env.VITE_DEV_SERVER_URL;
  const app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env, timeout: 30000 });
  try {
    const panel = await app.firstWindow();
    assert.equal(await app.evaluate(({ app }) => app.getVersion()), expectedVersion, 'native executable matches the current product version');
    await panel.waitForFunction(() => Boolean(window.companion));
    assert.equal(await panel.evaluate(() => window.companion.isDesktop), true);
    return { app, panel };
  } catch (error) {
    await app.close();
    throw error;
  }
}

async function waitForWhole(overlay) {
  await overlay.emulateMedia({ reducedMotion: 'no-preference' });
  await overlay.waitForFunction(() => {
    const pet = document.querySelector('.pet-sprite'), canvas = pet?.querySelector('canvas');
    return pet?.dataset.atlas === 'whole' && canvas?.dataset.renderer === 'whole-flow-2d' && getComputedStyle(canvas).visibility === 'visible';
  }, null, { timeout: 15000 });
  assert.equal(await overlay.evaluate(() => document.querySelector('.pet-sprite').style.transform), 'none', 'whole animal has no external body transform');
}

const nativeBounds = app => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet')).getBounds());
const canvasPixels = overlay => overlay.evaluate(() => document.querySelector('.pet-sprite canvas').toDataURL('image/png'));
const dispatch = (panel, command) => panel.evaluate(command => window.companion.dispatch(command), command);
async function waitForNativeMotion(overlay,predicate,timeout=3000) {
  const until=Date.now()+timeout;
  do {
    const motion=(await overlay.evaluate(()=>window.companion.getState())).motion;
    if(predicate(motion))return motion;
    await overlay.waitForTimeout(20);
  } while(Date.now()<until);
  assert.fail('native motion did not reach the required state before timeout');
}

async function interact(panel, action) {
  const state = await panel.evaluate(() => window.companion.getState());
  const cooldown = Math.max(0, state.lastInteraction + 850 - Date.now());
  if (cooldown) await panel.waitForTimeout(cooldown);
  const result = await dispatch(panel, { type: 'interact', action });
  assert.equal(result.action.type, action, `${action} is accepted by the native process`);
  return result;
}

async function collect(app, overlay, milliseconds, captureFrames=false) {
  const [playback, native] = await Promise.all([
    overlay.evaluate(({milliseconds,captureFrames}) => new Promise(resolve => {
      const frames = new Set(), images = new Set(), samples = [], captures=[], started = performance.now();
      let lastCapture = -Infinity;
      function sample(now) {
        const pet = document.querySelector('.pet-sprite'), canvas = pet.querySelector('canvas');
        frames.add(Number(pet.dataset.frame));
        if (now - lastCapture >= 16) {
          const png=canvas.toDataURL('image/png');images.add(png);lastCapture=now;
          if(captureFrames)captures.push({sampleIndex:samples.length,png});
        }
        const rect=pet.getBoundingClientRect();
        samples.push({ now, wallNow:Date.now(), clip: pet.dataset.clip, atlas: pet.dataset.atlas, renderer: canvas.dataset.renderer,
          frame: Number(pet.dataset.frame), nextFrame: Number(pet.dataset.nextFrame), mix: Number(pet.dataset.mix), phase: Number(pet.dataset.phase), facing: Number(pet.dataset.facing),
          distance: Number(pet.dataset.motionDistance), epoch: pet.dataset.motionEpoch, size: rect.width,
          localBounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
          transition: pet.dataset.transition, transitionRemaining: Number(pet.dataset.transitionRemaining),
          ground: pet.dataset.ground ? JSON.parse(pet.dataset.ground) : null, groundRenderer: canvas.dataset.groundRenderer,
          turning: pet.dataset.turning === 'true', turnRemaining: Number(pet.dataset.turnRemaining), transform: pet.style.transform });
        if (now - started < milliseconds) requestAnimationFrame(sample);
        else resolve({ frames: [...frames], images: images.size, samples, captures });
      }
      requestAnimationFrame(sample);
    }), {milliseconds,captureFrames}),
    app.evaluate(async ({ BrowserWindow }, milliseconds) => {
      const pet = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
      const samples = [], until = Date.now() + milliseconds;
      while (Date.now() < until) { samples.push({ now: Date.now(), bounds: pet.getBounds() }); await new Promise(resolve => setTimeout(resolve, 20)); }
      return samples;
    }, milliseconds),
  ]);
  assert.ok(playback.samples.length >= 5 && native.length >= 5, 'capture contains actual native and renderer samples');
  assert.ok(playback.samples.every(sample => sample.atlas === 'whole' && sample.renderer === 'whole-flow-2d' && sample.transform === 'none'), 'native playback retains the whole-character inbetween renderer');
  return { playback, native };
}

async function saveCapturedFrames(species,name,record,journal=[]) {
  if(!record.playback.captures.length)return;
  const directory=path.join('.artifacts','realistic-native-frames',species,name);
  await mkdir(directory,{recursive:true});
  const frames=[];
  for(const [index,capture] of record.playback.captures.entries()) {
    const sample=record.playback.samples[capture.sampleIndex],file=`${String(index).padStart(4,'0')}.png`;
    const packet=journal.findLast(entry=>String(entry.motion.epoch)===sample.epoch&&entry.motion.distanceDip===sample.distance);
    const current=journal.findLast(entry=>entry.now<=sample.wallNow);
    await writeFile(path.join(directory,file),Buffer.from(capture.png.split(',')[1],'base64'));
    frames.push({file,...sample,...(packet?{acceptedNativeBounds:packet.bounds,acceptedMotion:packet.motion}:{}),
      ...(current?{observedNativeBounds:current.bounds,observedMotion:current.motion,nativeMotionAgeMs:sample.wallNow-current.now}:{})});
  }
  await writeFile(path.join(directory,'capture.json'),JSON.stringify({species,name,productVersion:expectedVersion,frames,nativeSamples:record.native},null,2));
}

async function aim(app, direction, flying = false, distance = 180) {
  await app.evaluate(({ BrowserWindow }, { direction, flying, distance }) => {
    const bounds = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet')).getBounds();
    globalThis.pawpalWholeSmoke.cursor = { x: Math.round(bounds.x + bounds.width / 2 + direction * distance),
      y: Math.round(bounds.y + bounds.height * .6 + (flying ? direction * -80 : 0)) };
  }, { direction, flying, distance });
}

async function assertFrozen(app, panel, overlay, mode) {
  if (mode === 'paused') await dispatch(panel, { type: 'settings', patch: { paused: true } });
  else if (mode === 'dragging') await overlay.evaluate(() => window.companion.beginDrag());
  else await overlay.emulateMedia({ reducedMotion: 'reduce' });
  await waitForNativeMotion(overlay,motion=>mode==='dragging'?motion.dragging:motion.paused);
  await overlay.waitForTimeout(80);
  const pixels = await canvasPixels(overlay), bounds = await nativeBounds(app);
  await overlay.waitForTimeout(300);
  assert.equal(await canvasPixels(overlay), pixels, `${mode} freezes every whole-frame canvas pixel`);
  assert.deepEqual(await nativeBounds(app), bounds, `${mode} freezes the native position when the fixture cursor is held`);
  if (mode === 'paused') await dispatch(panel, { type: 'settings', patch: { paused: false } });
  else if (mode === 'dragging') await overlay.evaluate(() => window.companion.endDrag());
  else await overlay.emulateMedia({ reducedMotion: 'no-preference' });
  await waitForNativeMotion(overlay,motion=>!motion.paused&&!motion.dragging);
}

for (const species of speciesList) {
  const metaAsset = PETS.find(pet => pet.id === species).wholeMetaAsset;
  const meta = JSON.parse(await readFile(`public/${metaAsset}`, 'utf8'));
  const metadataVersion=expectSurface&&species!=='parrot'?6:5;
  assert.equal(meta.version,metadataVersion);
  assert.equal(meta.frames.length,metadataVersion===6?130+(meta.extraFrameCount??0):species==='parrot'?128:129);
  if(metadataVersion===5)assert.equal(meta.pages.length,3);
  else assert.ok(meta.pages.length>=4);
  const groundBackend=metadataVersion===6?'jointed-surface-webgl':'whole-ground-webgl';
  assert.equal(meta.clips.walk.frames.length, 32);
  const poseCounts = Object.fromEntries(Object.entries(meta.clips).map(([name, clip]) => [name, new Set(clip.frames).size]));
  const userData = await mkdtemp(path.join(tmpdir(), `pawpal-whole-${species}-`));
  let app;
  try {
    let panel;
    ({ app, panel } = await launch(userData));
    await app.evaluate(({ screen }) => { screen.getCursorScreenPoint = () => ({ x: -500, y: 0 }); });
    const overlayPromise = app.waitForEvent('window', { predicate: page => page !== panel });
    const adopted = await dispatch(panel, { type: 'adopt', species, name: `Whole ${species}` });
    assert.equal(adopted.species, species); assert.equal(adopted.adopted, true);
    const overlay = await overlayPromise;
    await waitForWhole(overlay);
    const packagedMeta = await overlay.evaluate(async asset => {
      const response = await fetch(new URL(asset, location.href));
      return response.json();
    }, metaAsset);
    assert.deepEqual(packagedMeta, meta, `${species} native app contains every current registered source page`);
    const transparent = await app.evaluate(async ({ BrowserWindow }) => {
      const pet = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
      const bitmap = (await pet.webContents.capturePage()).toBitmap();
      return pet.isVisible() && bitmap.length > 0 && bitmap[3] === 0;
    });
    assert.equal(transparent, true, `${species} has a visible transparent native companion window`);
    await writeFile(path.join('.artifacts', `whole-native-${species}.png`), Buffer.from((await canvasPixels(overlay)).split(',')[1], 'base64'));

    const care = [];
    for (const action of ['pet', 'feed', 'stretch', 'trick', 'rest']) {
      const result = await interact(panel, action), clip = action === 'trick' ? 'hop' : action;
      await overlay.waitForFunction(clip => document.querySelector('.pet-sprite')?.dataset.clip === clip, clip);
      const before = await nativeBounds(app), duration = action === 'rest' ? 6000 : result.action.until - Date.now() - 100;
      assert.ok(duration > 0, `${action} retains time to observe its accepted native clip`);
      const record = await collect(app, overlay, duration);
      assert.ok(record.native.every(sample => sample.now < result.action.until), `${action} capture stays in its accepted native lifetime`);
      for (const sample of record.native) assert.deepEqual(sample.bounds, before, `${species} ${action} never translates the native window`);
      assert.ok(record.playback.samples.every(sample => sample.clip === clip), `${action} paints its whole-body clip`);
      assert.ok(record.playback.frames.length >= 2, `${species} ${action} advances through discrete authored frames`);
      assert.ok(record.playback.images >= poseCounts[clip] * 2, `${species} ${action} displays at least twice its authored pose count`);
      assert.ok(record.playback.samples.some(sample => sample.frame !== sample.nextFrame && sample.mix > 0 && sample.mix < 1), `${species} ${action} paints measured intermediate poses`);
      const authored = record.playback.frames.filter(frame => meta.clips[clip].frames.includes(frame));
      assert.equal(authored.length, poseCounts[clip], `${species} ${action} displays every refined authored pose`);
      care.push({ action, nativeActionDurationMs: result.action.until - result.lastInteraction,
        observedPlaybackMs: record.playback.samples.at(-1).now - record.playback.samples[0].now,
        observedNativeMs: record.native.at(-1).now - record.native[0].now,
        frames: record.playback.frames, authoredFrames: authored, distinctImages: record.playback.images });
    }
    const sized = await dispatch(panel, { type: 'settings', patch: { size: .8, movement: 'edge' } });
    assert.equal(sized.settings.size, .8); assert.equal(sized.settings.movement, 'edge');
    const bounds = await nativeBounds(app); assert.equal(bounds.width, 272); assert.equal(bounds.height, 288);
    await app.evaluate(({ BrowserWindow, screen }) => {
      const pet = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
      const area = screen.getPrimaryDisplay().workArea, bounds = pet.getBounds();
      pet.setPosition(Math.round(area.x + (area.width - bounds.width) / 2), Math.round(area.y + (area.height - bounds.height) / 2));
      const record = { cursor: { x: -500, y: 0 }, journal: [] };
      globalThis.pawpalWholeSmoke = record;
      screen.getCursorScreenPoint = () => record.cursor;
      const send = pet.webContents.send.bind(pet.webContents);
      pet.webContents.send = (channel, ...args) => {
        if (channel === 'companion:motion') record.journal.push({ now: Date.now(), motion: args[0], bounds: pet.getBounds() });
        return send(channel, ...args);
      };
    });
    // The bridge rebases its floating movement state after the fixture placement.
    const centered = await nativeBounds(app);
    assert.equal(await overlay.evaluate(point => window.companion.movePet(point), { x: centered.x, y: centered.y }), true);
    await aim(app, 1, species === 'parrot', 500);
    const startupRecording=captureSurface?collect(app,overlay,1200,true):null;
    await interact(panel, 'play');
    const startup=startupRecording?await startupRecording:null;
    await overlay.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.clip === 'walk', null, { timeout: 5000 });
    await overlay.waitForFunction(species => {
      const pet = document.querySelector('.pet-sprite');
      return !pet.dataset.transition && (species === 'parrot' || JSON.parse(pet.dataset.ground || 'null')?.mode === 'walk');
    }, species, { timeout: 5000 });
    // Capture actual painted paws and accepted native travel after preparation.
    const walking = await collect(app, overlay, 2500,captureSurface), start = walking.native[0].bounds, end = walking.native.at(-1).bounds;
    assert.ok(end.x > start.x + 5, `${species} play moves the actual native window`);
    if (species === 'parrot') assert.ok(Math.abs(end.y - start.y) > 5, 'parrot actually flies vertically');
    assert.ok(walking.playback.images >= 32, `${species} displacement advances visible whole walking poses`);
    assert.ok(walking.playback.samples.every(sample => sample.clip === 'walk' && !sample.turning),
      `${species} stays in one moving stride capture: ${JSON.stringify(walking.playback.samples.filter(sample=>sample.clip!=='walk'||sample.turning).slice(0,3))}`);
    const authoredWalking = walking.playback.frames.filter(frame => meta.clips.walk.frames.includes(frame));
    if (species === 'parrot') assert.equal(authoredWalking.length, poseCounts.walk, 'actual flight displays every authored wing pose');
    else {
      assert.ok(walking.playback.samples.some(sample => sample.ground?.mode === 'walk'), `${species} uses the grounded walking renderer`);
      assert.ok(walking.playback.samples.every(sample => sample.groundRenderer === groundBackend), `${species} ground backend is available in the packaged app`);
      const phases = new Set(walking.playback.samples.filter(sample => sample.ground?.mode === 'walk').map(sample => Math.floor((sample.ground.phase % 1) * 32)));
      assert.ok(phases.size >= 30, `${species} renders a complete distance-driven support cycle (${phases.size} phases)`);
    }
    const firstWalking = walking.playback.samples[0], lastWalking = walking.playback.samples.at(-1);
    assert.ok(walking.playback.samples.every(sample => sample.epoch === firstWalking.epoch && sample.size === firstWalking.size), 'walking capture has one telemetry epoch and sprite size');
    const walkingJournal = await app.evaluate(() => globalThis.pawpalWholeSmoke.journal);
    await saveCapturedFrames(species,'walk',walking,walkingJournal);
    if(startup)await saveCapturedFrames(species,'startup',startup,walkingJournal);
    const preparing = walkingJournal.filter(entry => entry.motion.intentMoving && !entry.motion.moving && entry.motion.prepareEpoch > 0);
    assert.ok(preparing.length > 0, `${species} native process observes a stationary movement preparation`);
    const initialEpoch = preparing[0].motion.prepareEpoch;
    const initialPreparation = preparing.filter(entry => entry.motion.prepareEpoch === initialEpoch);
    for (const entry of initialPreparation) assert.deepEqual(entry.bounds, initialPreparation[0].bounds, `${species} preparation holds its native world root`);
    const walkingPackets = walking.playback.samples.map(sample => {
      const packet = walkingJournal.findLast(entry => String(entry.motion.epoch) === sample.epoch && entry.motion.distanceDip === sample.distance)?.motion;
      assert.ok(packet, 'each painted walking distance has an accepted native motion packet');
      return packet;
    });
    const nativeSpriteSize = walkingPackets[0].spriteSizeDip;
    assert.ok(walkingPackets.every(packet => packet.spriteSizeDip === nativeSpriteSize), 'walking capture uses one native sprite normalizer');
    const phaseDelta = lastWalking.phase - firstWalking.phase;
    assert.ok(Math.abs(nativeSpriteSize - firstWalking.size) < .05, 'native normalizer matches the padded rendered sprite width');
    const distancePhase = (lastWalking.distance - firstWalking.distance) * 256 / nativeSpriteSize / (meta.stride ?? 64);
    const observedCyclesPerSecond = phaseDelta * 1000 / (lastWalking.now - firstWalking.now);
    const nominalSpeed = { cat: 42, dog: 58, parrot: 85 }[species] * 1.7 * (272 - 12) / (340 - 12);
    const nominalCyclesPerSecond = nominalSpeed * 256 / nativeSpriteSize / meta.stride;
    // Initial preparation/acceleration may reduce the short capture average.
    assert.ok(observedCyclesPerSecond > nominalCyclesPerSecond * .7 && observedCyclesPerSecond < nominalCyclesPerSecond * 1.2,
      `${species} support cycle follows accepted travel (${observedCyclesPerSecond} vs ${nominalCyclesPerSecond})`);
    console.log(`${species} native gait normalizer: ${nativeSpriteSize} DIP; rendered sprite: ${firstWalking.size} DIP; phase: ${phaseDelta}; distance phase: ${distancePhase}.`);
    assert.ok(Math.abs(phaseDelta - distancePhase) < 1e-6, `${species} native gait accepts every displacement delta (${phaseDelta} vs ${distancePhase})`);

    await app.evaluate(() => { globalThis.pawpalWholeSmoke.journal = []; });
    await aim(app, -1, species === 'parrot');
    let turn;
    if (species === 'parrot') {
      await overlay.waitForFunction(() => { const pet = document.querySelector('.pet-sprite'); return pet?.dataset.clip === 'walk' && pet.dataset.facing === '-1'; }, null, { timeout: 3000 });
      turn = await collect(app, overlay, 350,captureSurface);
      assert.ok(turn.playback.samples.every(sample => !sample.turning && sample.facing === -1), 'parrot mirrors its whole flight immediately without a grounded turn');
    } else {
      await overlay.waitForFunction(() => document.querySelector('.pet-sprite')?.dataset.turning === 'true', null, { timeout: 3000 });
      const before = await nativeBounds(app);
      turn = await collect(app, overlay, 740,captureSurface);
      for (const sample of turn.native) assert.deepEqual(sample.bounds, before, `${species} reversal holds the native root stationary`);
      assert.ok(turn.playback.samples.every(sample => sample.clip === 'turn' && sample.turning), `${species} reversal stays inside the native turn hold`);
      const authoredTurn = new Set(turn.playback.samples.flatMap(sample=>[sample.frame,sample.nextFrame]).filter(frame=>meta.clips.turn.frames.includes(frame)));
      assert.equal(authoredTurn.size, poseCounts.turn, `${species} reversal uses the complete intact authored turn track`);
      assert.ok(turn.playback.images >= poseCounts.turn * 2, `${species} native reversal includes measured intermediate poses`);
      await overlay.waitForFunction(() => { const pet = document.querySelector('.pet-sprite'); return pet?.dataset.clip === 'walk' && pet.dataset.turning === 'false' && pet.dataset.facing === '-1'; }, null, { timeout: 2000 });
      await waitForNativeMotion(overlay,motion=>motion.moving&&motion.facing===-1);
      const journal = await app.evaluate(() => globalThis.pawpalWholeSmoke.journal);
      await saveCapturedFrames(species,'turn',turn,journal);
      await writeFile(`.artifacts/contact-native-turn-${species}.json`,JSON.stringify(journal,null,2));
      const began = journal.find(sample => sample.motion.facing === -1 && !sample.motion.moving);
      const resumed = journal.find(sample => sample.motion.facing === -1 && sample.motion.moving);
      assert.ok(began && resumed, `native motion journal brackets the stationary reversal (began=${Boolean(began)},resumed=${Boolean(resumed)},packets=${journal.length})`);
      const hold = resumed.now - began.now;
      assert.ok(hold >= 750 && hold <= 1100, `${species} native reversal hold matches 800ms (${hold}ms)`);
      turn.hold = hold;
    }
    for (const mode of ['paused', 'dragging', 'reducedMotion']) await assertFrozen(app, panel, overlay, mode);
    await dispatch(panel, { type: 'settings', patch: { paused: true } });
    await app.close(); app = null;
    const saved = JSON.parse(await readFile(path.join(userData, 'companion.json'), 'utf8'));
    assert.equal(saved.species, species); assert.equal(saved.name, `Whole ${species}`); assert.equal(saved.adopted, true);
    assert.equal(saved.settings.size, .8); assert.equal(saved.settings.movement, 'edge'); assert.equal(saved.settings.paused, true);
    assert.equal(saved.motion, undefined, 'runtime locomotion is not persisted');
    ({ app, panel } = await launch(userData));
    const restored = await panel.evaluate(() => window.companion.getState());
    assert.equal(restored.species, species); assert.equal(restored.name, saved.name); assert.equal(restored.settings.size, .8); assert.equal(restored.settings.paused, true);
    let restoredOverlay = app.windows().find(page => page !== panel);
    if (!restoredOverlay) restoredOverlay = await app.waitForEvent('window', { predicate: page => page !== panel });
    await waitForWhole(restoredOverlay);
    assert.equal((await nativeBounds(app)).width, 272, 'saved size restores the actual native window');
    await app.close(); app = null;
    summaries.push({ species, version: expectedVersion, metadataVersion: meta.version, pages: meta.pages.length, totalWholePoses: meta.frames.length,
      poseCounts, care, walkingFrames: walking.playback.frames, authoredWalkingFrames: authoredWalking, walkingPhaseDelta: phaseDelta,
      walkingRenderer: species === 'parrot' ? 'authored-whole-flight' : groundBackend, stationaryPreparationPackets: initialPreparation.length,
      walkingObservedCyclesPerSecond: observedCyclesPerSecond, walkingNominalCyclesPerSecond: nominalCyclesPerSecond,
      walkingDistancePhase: distancePhase, walkingNativeSpriteSizeDip: nativeSpriteSize, walkingRenderedSpriteSizeDip: firstWalking.size,
      turnFrames: turn.playback.frames, turnHoldMs: turn.hold ?? 0, persistence: true });
    console.log(`${species} whole native smoke passed: care, movement, reversal, freeze, size and restored profile.`);
  } finally {
    if (app) await app.close();
    await rm(userData, { recursive: true, force: true });
  }
}
await writeFile(path.join('.artifacts', 'whole-native-smoke.json'), JSON.stringify(summaries, null, 2));
console.log(`Whole native smoke passed for ${summaries.map(summary => summary.species).join(', ')}.`);
