import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getBeijingPeriod } from '../src/core/companion-routine.js';

const executablePath = process.env.PAWPAL_PACKAGED_EXECUTABLE;
const directory = '.artifacts/hover-stand';
await mkdir(directory, { recursive: true });
const userData = await mkdtemp(path.join(tmpdir(), 'pawpal-hover-stand-'));
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const actualPeriod = getBeijingPeriod(Date.now());
const report = { version, mode: executablePath ? 'packaged' : 'development', executablePath: executablePath ?? null,
  startedAt: new Date().toISOString(), actualBeijingPeriod: actualPeriod,
  clock: actualPeriod.key === 'sleep'
    ? 'Only overlay renderer Date is shifted to Beijing 15:00, advancing at real speed, to exercise an awake head. Native main-process clock and reminder timer remain real.'
    : 'Real native and renderer wall clocks; Beijing phase uses Asia/Shanghai. No clock injection.',
  profile: 'Fresh owned temporary profile; removed after shutdown. Existing user profile was not changed.',
  limitations: 'Native DOM/canvas and production IPC probe, not physical display scanout. This native probe does not wait thirty minutes or inject a pending reminder. Thirty-minute cadence and single-owner delivery are covered separately by controller/VM and browser tests.', species: [] };
let app, overlay;
const dispatch = (page, command) => page.evaluate(value => window.companion.dispatch(value), command);
const state = page => page.evaluate(() => window.companion.getState());
const sleep = ms => overlay.waitForTimeout(ms);

const snapshot = () => overlay.evaluate(() => {
  const root = document.querySelector('.pet-overlay'), pet = root?.querySelector('.pet-sprite'), canvas = pet?.querySelector('canvas');
  const box = root?.getBoundingClientRect();
  return { now: Date.now(), clip: Number(pet?.dataset.clip), frame: Number(pet?.dataset.frame),
    elapsed: Number(pet?.dataset.elapsed), sequence: Number(pet?.dataset.sequence), done: pet?.dataset.done === 'true',
    mode: pet?.dataset.originalMode, nuzzling: pet?.dataset.nuzzling === 'true', headContact: pet?.dataset.headContact === 'true',
    renderer: pet?.dataset.renderer, loadState: pet?.dataset.loadState,
    canvasTransform: canvas && getComputedStyle(canvas).transform,
    visible: root && getComputedStyle(root).visibility === 'visible', canvasVisible: canvas?.style.visibility === 'visible',
    rootRect: box && { x: box.x, y: box.y, width: box.width, height: box.height },
    speech: root?.querySelector('.overlay-speech')?.textContent ?? '', documentHidden: document.hidden };
});

async function relaxedReady() {
  await overlay.waitForFunction(() => {
    const root = document.querySelector('.pet-overlay'), pet = root?.querySelector('.pet-sprite');
    return pet?.dataset.loadState === 'ready' && pet.dataset.clip === '22' && pet.dataset.originalMode === 'automatic'
      && pet.querySelector('canvas')?.style.visibility === 'visible' && getComputedStyle(root).visibility === 'visible';
  }, undefined, { timeout: 16000 });
}

async function sourcePoint(point) {
  return overlay.evaluate(([x, y]) => {
    const pet = document.querySelector('.pet-overlay .pet-sprite'), rect = pet.getBoundingClientRect();
    const scale = Math.min(rect.width / 320, rect.height / 300);
    const sourceAlpha = pet.querySelector('canvas').getContext('2d').getImageData(x, y, 1, 1).data[3];
    return { x: rect.x + (rect.width - 320 * scale) / 2 + x * scale,
      y: rect.y + (rect.height - 300 * scale) / 2 + y * scale, source: [x, y], sourceAlpha };
  }, point);
}

async function exactSource(metadata) {
  return overlay.evaluate(async metadata => {
    const pet = document.querySelector('.pet-overlay .pet-sprite');
    const clip = metadata.clips.find(clip => clip.id === Number(pet.dataset.clip));
    const image = await createImageBitmap(await (await fetch(new URL(clip.asset, location.href))).blob());
    // After the asynchronous decode, frame and canvas are read in one task.
    const frame = Number(pet.dataset.frame), canvas = pet.querySelector('canvas');
    const reference = document.createElement('canvas'); reference.width = 320; reference.height = 300;
    const context = reference.getContext('2d');
    context.drawImage(image, frame % clip.columns * 320, Math.floor(frame / clip.columns) * 300, 320, 300, 0, 0, 320, 300);
    const actual = canvas.getContext('2d').getImageData(0, 0, 320, 300).data;
    const expected = context.getImageData(0, 0, 320, 300).data;
    let differingChannels = 0, nontransparentPixels = 0;
    for (let index = 0; index < actual.length; index++) {
      if (actual[index] !== expected[index]) differingChannels++;
      if (index % 4 === 3 && actual[index]) nontransparentPixels++;
    }
    image.close();
    return { clip: clip.id, frame, canvasSize: [canvas.width, canvas.height], differingChannels, nontransparentPixels };
  }, metadata);
}

async function savedSetting(expected) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const saved = await readFile(path.join(userData, 'companion.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (saved?.settings.standReminder === expected) return saved;
    await sleep(100);
  }
  throw new Error(`Stand reminder setting ${expected} was not persisted`);
}

try {
  const env = { ...process.env, PAWPAL_TEST_USER_DATA: userData }; delete env.VITE_DEV_SERVER_URL;
  const raster = ['--disable-accelerated-2d-canvas'];
  app = await electron.launch({ ...(executablePath ? { executablePath, args: raster } : { args: ['.', ...raster] }), env, timeout: 30000 });
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), Boolean(executablePath));
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
  const panel = await app.firstWindow(); await panel.waitForFunction(() => Boolean(window.companion));
  report.defaultSettings = (await state(panel)).settings;
  assert.equal(report.defaultSettings.standReminder, true, 'a fresh profile enables the requested standing reminder');

  for (const species of ['maltese', 'golden']) {
    const metadata = JSON.parse(await readFile(`public/pets/${species}-original-v1.json`, 'utf8'));
    await dispatch(panel, { type: 'adopt', species, name: `Hover ${species}` });
    overlay = app.windows().find(page => page.url().includes('view=pet'))
      ?? await app.waitForEvent('window', { predicate: page => page !== panel });
    await overlay.emulateMedia({ reducedMotion: 'no-preference' });
    if (actualPeriod.key === 'sleep') {
      await overlay.addInitScript(() => {
        const NativeDate = Date, realStart = NativeDate.now();
        const awakeStart = NativeDate.parse('2026-10-15T15:00:00+08:00');
        class AwakeProbeDate extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [awakeStart + NativeDate.now() - realStart])); }
          static now() { return awakeStart + NativeDate.now() - realStart; }
        }
        window.Date = AwakeProbeDate;
      });
      await overlay.reload();
    }
    await relaxedReady();
    await overlay.evaluate(() => {
      window.__nativePointerEvidence = [];
      for (const type of ['pointermove', 'pointerenter', 'pointerleave']) {
        document.addEventListener(type, event => {
          const evidence = window.__nativePointerEvidence;
          evidence.push({ type, x: event.clientX, y: event.clientY, buttons: event.buttons, pointerType: event.pointerType,
            target: String(event.target?.className ?? ''), time: Date.now() });
          if (evidence.length > 24) evidence.shift();
        }, true);
      }
    });
    await overlay.mouse.move(2, 2); await sleep(300);
    const result = { species, initial: await snapshot() }, nativeRect = (await state(panel)).motion.visual.rectGlobal;
    report.species.push(result);
    result.nativeRect = nativeRect;
    assert.equal(result.initial.renderer, 'original-whole-frame'); assert.equal(result.initial.visible, true);
    assert.equal(result.initial.mode, 'automatic'); assert.equal(result.initial.nuzzling, false);

    result.body = await sourcePoint(species === 'maltese' ? [120, 200] : [160, 225]);
    assert.ok(result.body.sourceAlpha > 0, 'body negative control is drawn artwork');
    const before = await snapshot();
    await overlay.mouse.move(result.body.x, result.body.y); await sleep(650);
    const body = await snapshot(); assert.equal(body.nuzzling, false); assert.equal(body.sequence, before.sequence);
    result.transparent = await sourcePoint(species === 'maltese' ? [180, 155] : [160, 120]);
    assert.equal(result.transparent.sourceAlpha, 0);
    await overlay.mouse.move(result.transparent.x, result.transparent.y); await sleep(650);
    assert.equal((await snapshot()).nuzzling, false);

    result.head = await sourcePoint(species === 'maltese' ? [190, 200] : [160, 160]);
    assert.ok(result.head.sourceAlpha > 0, 'head positive control is drawn artwork');
    const sourceBeforeHover = await snapshot();
    await overlay.mouse.move(result.head.x, result.head.y);
    const headObserved = () => overlay.waitForFunction(sequence => {
      const pet = document.querySelector('.pet-overlay .pet-sprite');
      return pet.dataset.nuzzling === 'true' && Number(pet.dataset.sequence) !== sequence;
    }, sourceBeforeHover.sequence, { timeout: 2500 });
    try { await headObserved(); }
    catch (error) {
      result.unmodifiedPointerDelivery = await overlay.evaluate(() => ({
        evidence: window.__nativePointerEvidence, innerSize: [innerWidth, innerHeight],
        elementAtHead: document.elementFromPoint(window.__nativePointerEvidence.at(-1)?.x ?? 0,
          window.__nativePointerEvidence.at(-1)?.y ?? 0)?.className ?? '',
      }));
      result.unmodifiedPointerDelivery.cursorGlobal = await app.evaluate(({ screen }) => screen.getCursorScreenPoint());
      // CDP mouse events do not move the physical OS cursor. Electron's native
      // click-through gate may therefore drop them before the DOM receives them.
      // This is a test-only window override; no cue, timer, or app state is injected.
      const overridden = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
        if (!window) return false;
        window.setIgnoreMouseEvents(false); return true;
      });
      assert.equal(overridden, true);
      report.cdpNativePointerOverride = 'CDP input did not reach the transparent native window while the physical OS cursor was outside its hit region. Probe disabled ignoreMouseEvents on its owned temporary window solely to deliver CDP events; production native hit-gate behavior requires the separate physical-cursor UI check.';
      await overlay.mouse.move(2, 2); await sleep(300);
      await overlay.mouse.move(result.head.x, result.head.y);
      await headObserved();
    }
    result.deliveredPointerEvents = await overlay.evaluate(() => window.__nativePointerEvidence);
    assert.ok(result.deliveredPointerEvents.some(event => event.type === 'pointermove' && event.target.includes('pet-sprite')
      && Math.abs(event.x - result.head.x) < 1 && Math.abs(event.y - result.head.y) < 1), 'the native renderer received the actual pointer event at the source head');
    result.nuzzle = await snapshot();
    assert.equal(result.nuzzle.clip, 22); assert.equal(result.nuzzle.mode, 'automatic');
    assert.equal(result.nuzzle.speech, '蹭蹭～最喜欢你摸摸头啦。');
    assert.ok(result.nuzzle.elapsed < sourceBeforeHover.elapsed + 500, 'the source restart begins from its own frame clock');
    await overlay.waitForFunction(() => {
      const canvas = document.querySelector('.pet-overlay .pet-sprite canvas');
      const transform = getComputedStyle(canvas).transform;
      return transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
    }, undefined, { timeout: 2000 });
    result.presentation = await snapshot();
    const matrix = result.presentation.canvasTransform.match(/^matrix\((.+)\)$/)?.[1].split(',').map(Number);
    assert.ok(matrix && matrix.length === 6, 'only the rendered presentation has a small CSS transform');
    assert.ok(Math.abs(matrix[4]) <= 3 && Math.abs(matrix[5]) <= 2 && Math.abs(matrix[1]) < .02);
    result.sourceEquality = await exactSource(metadata);
    assert.equal(result.sourceEquality.differingChannels, 0, 'all 320×300 RGBA source pixels remain unchanged while nudging');
    assert.deepEqual(result.sourceEquality.canvasSize, [320, 300]);

    // Cancel an already active presentation, rather than relying on the cooldown
    // to make a fresh blocked hover look like a successful guard check.
    assert.equal(result.presentation.nuzzling, true);
    await dispatch(panel, { type: 'settings', patch: { paused: true } }); await sleep(100);
    result.paused = await snapshot(); assert.equal(result.paused.nuzzling, false);
    await sleep(250); result.pauseHeld = await snapshot();
    assert.equal(result.pauseHeld.frame, result.paused.frame); assert.equal(result.pauseHeld.elapsed, result.paused.elapsed);
    assert.equal(result.pauseHeld.sequence, result.paused.sequence);
    await dispatch(panel, { type: 'settings', patch: { paused: false } });
    await overlay.mouse.move(result.head.x + .01, result.head.y);
    await overlay.waitForFunction(() => document.querySelector('.pet-overlay .pet-sprite')?.dataset.nuzzling === 'true');
    await overlay.emulateMedia({ reducedMotion: 'reduce' }); await sleep(100);
    result.reducedMotion = await snapshot(); assert.equal(result.reducedMotion.nuzzling, false);
    assert.equal(result.reducedMotion.canvasTransform, 'none');
    await sleep(200); assert.equal((await snapshot()).frame, result.reducedMotion.frame);
    await overlay.emulateMedia({ reducedMotion: 'no-preference' });

    const heldSequence = result.nuzzle.sequence;
    result.continuousHover = [];
    const started = Date.now();
    while (Date.now() - started < 6200) {
      const sample = await snapshot(); result.continuousHover.push(sample);
      assert.equal(sample.sequence, heldSequence, 'holding the mouse in one entry does not repeatedly trigger another source');
      assert.deepEqual(sample.rootRect, result.initial.rootRect, 'nuzzling never moves or resizes the logical root');
      await sleep(100);
    }
    assert.equal((await snapshot()).nuzzling, false, 'the short gesture settles after its original source and ending hold');
    assert.deepEqual((await state(panel)).motion.visual.rectGlobal, nativeRect);
    result.unchangedPersistedSelection = (await state(panel)).originalAnimation;
    assert.equal(result.unchangedPersistedSelection.startedAt, 0, 'hover cues do not dispatch persisted manual animation commands');

    await overlay.mouse.move(2, 2);
    result.finalPointerEvents = await overlay.evaluate(() => window.__nativePointerEvidence);
    // Screenshots may move Playwright's pointer during scroll preparation, so
    // capture only after the uninterrupted-hover and active-guard assertions.
    await overlay.locator('.pet-overlay').screenshot({ path: path.join(directory, `native-${species}-nuzzle.png`) });
    console.log(`${species}: native head dwell, unchanged source pixels, subtle presentation, one-entry behavior, pause and reduced motion passed.`);
  }

  await dispatch(panel, { type: 'settings', patch: { standReminder: false } });
  assert.equal((await state(panel)).settings.standReminder, false);
  const persistedDisabled = await savedSetting(false);
  assert.equal(Object.hasOwn(persistedDisabled, 'standReminder'), false, 'transient reminder snapshots are not saved');
  await panel.reload(); await panel.waitForFunction(() => Boolean(window.companion));
  assert.equal((await state(panel)).settings.standReminder, false);
  assert.equal(await panel.evaluate(() => window.companion.presentStandReminder(1)), false, 'panel cannot claim native reminder ownership');
  assert.equal(await panel.evaluate(() => window.companion.dismissStandReminder(1)), false, 'panel cannot dismiss the native owner reminder');
  const rejected = await overlay.evaluate(async () => {
    const results = [];
    for (const id of [0, -1, 1.5, '1', null, {}]) {
      for (const method of ['presentStandReminder', 'dismissStandReminder']) {
        try { await window.companion[method](id); results.push({ id, method, rejected: false }); }
        catch (error) { results.push({ id, method, rejected: /操作参数无效/.test(error.message) }); }
      }
    }
    return results;
  });
  assert.ok(rejected.every(item => item.rejected), 'native reminder owner validates every reminder id');
  assert.equal(await overlay.evaluate(() => window.companion.presentStandReminder(1)), null, 'a valid id cannot create a reminder before thirty minutes');
  assert.equal((await state(panel)).standReminder, null);
  await dispatch(panel, { type: 'settings', patch: { standReminder: true } });
  const persistedEnabled = await savedSetting(true);
  assert.equal(persistedEnabled.settings.standReminder, true);
  report.standingReminder = { defaultEnabled: true, disabledPersistedAcrossReload: true, reenabledPersisted: true,
    panelCannotPresentOrDismiss: true, invalidIdsRejected: rejected, unearnedValidIdCannotCreateReminder: true,
    actualThirtyMinuteWaitPerformed: false, pendingReminderInjected: false };
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.stack ?? String(error);
  if (overlay) { report.failureSnapshot = await snapshot().catch(() => null); report.failureState = await state(overlay).catch(() => null); }
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  await rm(userData, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(directory, 'native-report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(directory, 'native-report.md'), `# Hover and standing reminder native probe\n\nVersion: ${version}. Mode: ${report.mode}. Passed: ${report.passed}.\n\n${report.failure ?? 'Both original dogs passed true head-pixel contact, a short dwell, one cue during a continuous entry, slight CSS presentation motion, unchanged complete source RGBA, fixed logical geometry, pause and reduced-motion guards. Standing reminder settings persisted; the native owner and id checks rejected unauthorized or invalid reminder requests.'}\n\n${report.clock}\n\n${report.cdpNativePointerOverride ?? ''}\n\n${report.limitations}\n\n${report.profile}\n\nEvidence: native-report.json.\n`);
}
