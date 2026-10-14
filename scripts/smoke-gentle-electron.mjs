import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PETS } from '../src/core/pets.js';
import { getBeijingPeriod } from '../src/core/companion-routine.js';

const require = createRequire(import.meta.url);
const { isValidHitRegions } = require('../electron/security.cjs');
const executablePath = process.env.PAWPAL_PACKAGED_EXECUTABLE;
const mode = executablePath ? 'packaged' : 'development';
const directory = '.artifacts/gentle-companion';
await mkdir(directory, { recursive: true });
const userData = await mkdtemp(path.join(tmpdir(), 'pawpal-gentle-native-'));
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const report = {
  mode, version, executablePath: executablePath ?? null,
  command: executablePath ? `PAWPAL_PACKAGED_EXECUTABLE=${JSON.stringify(executablePath)} node scripts/smoke-gentle-electron.mjs` : 'node scripts/smoke-gentle-electron.mjs',
  profile: 'Fresh owned temporary profile; removed after application closes.',
  rasterReadback: 'disable-accelerated-2d-canvas for consistent full source/canvas readback.',
  startedAt: new Date().toISOString(), species: [],
  limitations: 'This probe exercises real native Electron windows, DOM input and production IPC. CDP mouse events do not prove physical OS click-through. The production hit-region event has no success acknowledgement: its return is undefined for either outcome; sender/epoch/geometry guards and the production validator are checked against recorded packets. Representative source crops are checked here; all 741 source frames are covered separately by the importer test.',
};
let app, overlay;
const dispatch = (page, command) => page.evaluate(value => window.companion.dispatch(value), command);
const state = page => page.evaluate(() => window.companion.getState());
const sleep = (page, ms) => page.waitForTimeout(ms);
const snapshot = page => page.evaluate(() => {
  const root = document.querySelector('.pet-overlay'), pet = root?.querySelector('.pet-sprite');
  const canvas = pet?.querySelector('canvas'), bar = root?.querySelector('.overlay-toolbar');
  const rect = element => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  return {
    root: root && rect(root), sprite: pet && rect(pet),
    visible: root && getComputedStyle(root).visibility === 'visible',
    presentation: root?.dataset.presentation, renderer: pet?.dataset.renderer,
    clip: Number(pet?.dataset.clip), frame: Number(pet?.dataset.frame),
    sequence: Number(pet?.dataset.sequence), elapsed: Number(pet?.dataset.elapsed),
    done: pet?.dataset.done === 'true', mode: pet?.dataset.originalMode,
    documentHidden: document.hidden, visibilityState: document.visibilityState,
    rendererNow: Date.now(), pickerCount: root?.querySelectorAll('[role="dialog"]').length,
    canvasSize: canvas && [canvas.width, canvas.height], transform: pet?.style.transform,
    toolbar: bar && { ...rect(bar), columns: getComputedStyle(bar).gridTemplateColumns.split(' ').length,
      buttons: [...bar.querySelectorAll('button')].map(button => ({ label: button.getAttribute('aria-label'), text: button.textContent, ...rect(button) })) },
  };
});
const pixels = page => page.evaluate(() => document.querySelector('.pet-overlay .pet-sprite canvas').toDataURL('image/png'));

async function ready(page, clip) {
  await page.waitForFunction(clip => {
    const root = document.querySelector('.pet-overlay'), pet = root?.querySelector('.pet-sprite');
    return root && getComputedStyle(root).visibility === 'visible' && pet?.dataset.loadState === 'ready'
      && pet.dataset.renderer === 'original-whole-frame' && Number(pet.dataset.clip) === clip
      && pet.querySelector('canvas')?.style.visibility === 'visible';
  }, clip, { timeout: 15000 });
}

function inside(rect, root, message) {
  const tolerance = .1;
  assert.ok(rect.x >= root.x - tolerance && rect.y >= root.y - tolerance
    && rect.x + rect.width <= root.x + root.width + tolerance
    && rect.y + rect.height <= root.y + root.height + tolerance, message);
}

async function sourcePicture(page, metadata) {
  return page.evaluate(async metadata => {
    const pet = document.querySelector('.pet-overlay .pet-sprite');
    const source = metadata.clips.find(clip => clip.id === Number(pet.dataset.clip));
    const response = await fetch(new URL(source.asset, location.href));
    const bitmap = await createImageBitmap(await response.blob());
    const frame = Number(pet.dataset.frame), canvas = pet.querySelector('canvas');
    const reference = document.createElement('canvas'); reference.width = 320; reference.height = 300;
    const context = reference.getContext('2d');
    context.drawImage(bitmap, frame % source.columns * 320, Math.floor(frame / source.columns) * 300, 320, 300, 0, 0, 320, 300);
    const actual = canvas.getContext('2d').getImageData(0, 0, 320, 300).data;
    const expected = context.getImageData(0, 0, 320, 300).data;
    let exact = true, nontransparentPixels = 0;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) exact = false;
      if (i % 4 === 3 && actual[i]) nontransparentPixels++;
    }
    bitmap.close();
    return { clip: source.id, frame, exact, nontransparentPixels, png: canvas.toDataURL('image/png') };
  }, metadata);
}

async function openPicker(page) {
  await page.locator('.pet-overlay').hover();
  await page.getByRole('button', { name: '换个表情', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '换个表情', exact: true });
  await menu.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.expression-picker-thumbnail')]
    .length === 24 && [...document.querySelectorAll('.expression-picker-thumbnail')]
    .every(element => getComputedStyle(element).backgroundImage !== 'none'));
  await sleep(page, 200);
  return menu;
}

async function inspectMenu(page, metadata) {
  const result = await page.evaluate(metadata => {
    const root = document.querySelector('.pet-overlay'), menu = root.querySelector('[role="dialog"]');
    const scroll = menu.querySelector('.expression-picker-scroll');
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return { root: rect(root), menu: rect(menu), close: rect(menu.querySelector('.expression-picker-close')),
      scroll: { ...rect(scroll), height: scroll.clientHeight, contentHeight: scroll.scrollHeight },
      thumbnails: [...menu.querySelectorAll('.expression-picker-thumbnail')].map((element, index) => {
        const style = getComputedStyle(element), source = metadata.clips[index];
        return { clip: index + 1, firstFrame: ['0% 0%', '0px 0px'].includes(style.backgroundPosition),
          sourceAtlas: style.backgroundImage.includes(source.asset),
          scale: style.backgroundSize === `${source.columns * 100}% ${source.rows * 100}%`,
          animation: style.animationName };
      }) };
  }, metadata);
  assert.equal(result.thumbnails.length, 24);
  assert.ok(result.thumbnails.every(thumb => thumb.firstFrame && thumb.sourceAtlas && thumb.scale && thumb.animation === 'none'));
  inside(result.menu, result.root, 'compact picker fits the native logical root');
  inside(result.close, result.root, 'picker close button fits the native logical root');
  for (const label of ['播放爱心', '播放紧张', '播放睡觉']) {
    const button = page.getByRole('dialog', { name: '换个表情', exact: true }).getByRole('button', { name: label, exact: true });
    await button.scrollIntoViewIfNeeded();
    inside(await button.boundingBox(), result.root, `reachable ${label} button fits the logical root`);
  }
  await page.locator('.expression-picker-scroll').evaluate(element => { element.scrollTop = 0; });
  return result;
}

async function hitPacket(page) {
  const current = await state(page);
  const packets = await app.evaluate(() => globalThis.__gentleRegionPackets);
  const packet = [...packets].reverse().find(packet => packet.values?.epoch === current.motion.epoch
    && packet.values?.geometrySeq === current.motion.visual.geometrySeq && packet.values?.regions.length === 3);
  assert.ok(packet, 'production hit-region handler received the open-menu packet');
  assert.equal(packet.senderMatchesOverlay, true); assert.equal(packet.senderFrameMatchesMain, true);
  assert.equal(packet.productionReturn, 'undefined');
  assert.equal(isValidHitRegions(packet.values.regions, current.motion.visual.rectGlobal), true);
  assert.ok(packet.values.regions.length <= 16);
  return { ...packet, logicalRect: current.motion.visual.rectGlobal,
    validatorAccepted: true, epochAndGeometryMatch: true, acknowledgement: 'not available' };
}

try {
  const env = { ...process.env, PAWPAL_TEST_USER_DATA: userData }; delete env.VITE_DEV_SERVER_URL;
  const raster = ['--disable-accelerated-2d-canvas'];
  app = await electron.launch({ ...(executablePath ? { executablePath, args: raster } : { args: ['.', ...raster] }), env, timeout: 30000 });
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), Boolean(executablePath));
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
  const panel = await app.firstWindow(); await panel.waitForFunction(() => Boolean(window.companion));
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const production = ipcMain.listeners('companion:regions')[0];
    if (!production) throw new Error('Production hit-region handler unavailable');
    globalThis.__gentleRegionPackets = [];
    ipcMain.removeListener('companion:regions', production);
    ipcMain.on('companion:regions', (event, values) => {
      const result = production.call(ipcMain, event, values);
      const overlay = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
      globalThis.__gentleRegionPackets.push({ at: Date.now(), values,
        senderMatchesOverlay: event.sender === overlay?.webContents,
        senderFrameMatchesMain: event.senderFrame === event.sender.mainFrame,
        productionReturn: result === undefined ? 'undefined' : String(result) });
      if (globalThis.__gentleRegionPackets.length > 100) globalThis.__gentleRegionPackets.shift();
    });
  });

  for (const species of ['maltese', 'golden']) {
    const pet = PETS.find(pet => pet.id === species);
    const metadata = JSON.parse(await readFile(path.join('public', pet.originalMetaAsset), 'utf8'));
    const adoptedAt = Date.now();
    await dispatch(panel, { type: 'adopt', species, name: `Gentle ${species}` });
    overlay = app.windows().find(page => page.url().includes('view=pet')) ?? await app.waitForEvent('window', { predicate: page => page !== panel });
    await overlay.emulateMedia({ reducedMotion: 'no-preference' });
    const period = getBeijingPeriod(Date.now()); await ready(overlay, period.clip);
    const result = { species, actualBeijingPeriod: period, initial: await snapshot(overlay), captures: [] };
    report.species.push(result);
    assert.equal(result.initial.mode, 'automatic'); assert.deepEqual(result.initial.canvasSize, [320, 300]);
    assert.equal(result.initial.presentation, 'visual-root-v1'); assert.equal(result.initial.transform, 'none');
    assert.equal(result.initial.root.width, 340); assert.equal(result.initial.root.height, 360);
    assert.equal(result.initial.toolbar.columns, 5); assert.equal(result.initial.toolbar.buttons.length, 5);
    assert.ok(result.initial.toolbar.buttons.every(button => button.text === ''));
    const loaded = await overlay.evaluate(async asset => fetch(new URL(asset, location.href)).then(response => response.json()), pet.originalMetaAsset);
    assert.deepEqual(loaded, metadata, 'native app retains complete source timing metadata');

    if (species === 'maltese') {
      if (period.key === 'sleep') {
        const start = Date.now();
        while (Date.now() - start < 8500) {
          assert.equal(await overlay.locator('.overlay-speech').count(), 0, 'real night remains quiet');
          await sleep(overlay, 500);
        }
        report.nightQuiet = { observedMs: Date.now() - start, currentPeriod: period.key };
        // Daytime speech still uses a real eight-second timer; only its Beijing phase is injected.
        const base = Date.parse(`${period.dateKey}T19:00:00+08:00`);
        await overlay.addInitScript(base => {
          const actualNow = Date.now.bind(Date), started = actualNow();
          window.__gentleSpeechClock = base;
          Date.now = () => window.__gentleSpeechClock === null ? actualNow() : window.__gentleSpeechClock + actualNow() - started;
        }, base);
        await overlay.reload(); await ready(overlay, 6);
        const startSpeech = Date.now();
        await overlay.locator('.overlay-speech').waitFor({ timeout: 12000 });
        report.firstSpeech = { text: await overlay.locator('.overlay-speech').innerText(),
          observedMs: Date.now() - startSpeech, phaseClock: '19:00 injected for this night-only speech probe; timer runs in real time' };
        assert.ok(report.firstSpeech.observedMs >= 7000);
        await overlay.evaluate(() => { window.__gentleSpeechClock = null; });
        await ready(overlay, getBeijingPeriod(Date.now()).clip);
      } else {
        await overlay.locator('.overlay-speech').waitFor({ timeout: 12000 });
        report.firstSpeech = { text: await overlay.locator('.overlay-speech').innerText(), observedMs: Date.now() - adoptedAt, phaseClock: 'actual system wall time in Asia/Shanghai' };
        assert.ok(report.firstSpeech.observedMs >= 7000);
      }
      assert.ok(report.firstSpeech.text.length > 0);
      console.log(`${species}: real eight-second first speech and current Beijing pose passed.`);
    }

    for (const clip of [6, 22, 24]) {
      await dispatch(panel, { type: 'original-animation', clip }); await ready(overlay, clip);
      await dispatch(panel, { type: 'settings', patch: { paused: true } }); await sleep(overlay, 200);
      const picture = await sourcePicture(overlay, metadata);
      assert.equal(picture.exact, true); assert.ok(picture.nontransparentPixels > 1000);
      const file = path.join(directory, `${mode}-${species}-clip${clip}-canvas.png`);
      await writeFile(file, Buffer.from(picture.png.split(',')[1], 'base64')); delete picture.png;
      result.captures.push({ ...picture, path: file });
      await dispatch(panel, { type: 'settings', patch: { paused: false } });
    }

    if (species === 'maltese') {
      result.sizes = [];
      for (const size of [.65, 1, 1.5]) {
        await dispatch(panel, { type: 'settings', patch: { size } }); await sleep(overlay, 250);
        const menu = await openPicker(overlay);
        assert.equal(await menu.getByRole('button', { name: /^播放/ }).count(), 24);
        const geometry = await inspectMenu(overlay, metadata);
        const snap = await snapshot(overlay);
        assert.equal(snap.root.width, 340 * size); assert.equal(snap.root.height, 360 * size);
        assert.equal(snap.toolbar.columns, 5);
        for (const button of snap.toolbar.buttons) inside(button, snap.root, `${button.label} fits size ${size}`);
        const packet = await hitPacket(overlay);
        await menu.getByRole('button', { name: '播放抱心', exact: true }).click();
        await menu.waitFor({ state: 'detached' }); await ready(overlay, 3);
        result.sizes.push({ size, root: snap.root, toolbar: snap.toolbar, picker: geometry, hitRegions: packet });
      }
      await dispatch(panel, { type: 'settings', patch: { size: 1 } });
      const menu = await openPicker(overlay);
      await menu.getByRole('button', { name: '播放抱心', exact: true }).click();
      await menu.waitFor({ state: 'detached' }); await ready(overlay, 3);
      await overlay.mouse.up(); await overlay.mouse.move(1, 1);
      await overlay.evaluate(() => {
        window.__gentleRoutineTrace = [];
        const root = document.querySelector('.pet-overlay');
        let fiber = root[Object.keys(root).find(key => key.startsWith('__reactFiber$'))];
        while (fiber) {
          let hook = fiber.memoizedState;
          while (hook) {
            const controller = Array.isArray(hook.memoizedState) && hook.memoizedState[0];
            if (typeof controller?.sample === 'function') {
              const original = controller.sample;
              controller.sample = function (input) {
                const output = original.call(this, input);
                window.__gentleRoutineTrace.push({ ...input, result: { clip: output.clip, manual: output.manual, token: output.token }, documentHidden: document.hidden });
                if (window.__gentleRoutineTrace.length > 120) window.__gentleRoutineTrace.shift();
                return output;
              };
              return;
            }
            hook = hook.next;
          }
          fiber = fiber.return;
        }
      });
      await dispatch(panel, { type: 'original-animation', clip: 3 }); await ready(overlay, 3);
      const selected = await state(panel), startHold = Date.now(), samples = [], timing = metadata.clips.find(clip => clip.id === 3);
      report.manualHold = { selected: selected.originalAnimation, startedAt: startHold, samples };
      while (Date.now() - startHold < 31500) {
        const snap = await snapshot(overlay), elapsed = Date.now() - startHold;
        const motion = (await state(overlay)).motion;
        if (elapsed < 28000) { assert.equal(snap.clip, 3); assert.equal(snap.mode, 'manual'); }
        if (snap.clip === 3) {
          const duration = timing.durations.reduce((sum, delay) => sum + delay, 0);
          const done = timing.loopCount > 0 && snap.elapsed >= duration * timing.loopCount;
          const cycle = done ? duration : snap.elapsed % duration;
          let frame = 0, boundary = timing.durations[0];
          while (frame < timing.durations.length - 1 && cycle >= boundary) boundary += timing.durations[++frame];
          assert.equal(snap.frame, frame, 'native frame matches source cumulative delay boundaries');
          assert.equal(snap.done, done);
        }
        samples.push({ observedMs: elapsed, clip: snap.clip, frame: snap.frame, mode: snap.mode, sourceElapsed: snap.elapsed,
          rendererNow: snap.rendererNow, documentHidden: snap.documentHidden, pickerCount: snap.pickerCount,
          nativePaused: motion.paused, nativeDragging: motion.dragging });
        await sleep(overlay, elapsed < 5000 ? 150 : 1000);
      }
      await ready(overlay, getBeijingPeriod(Date.now()).clip);
      const returned = await snapshot(overlay); assert.equal(returned.mode, 'automatic');
      report.manualHold = { selected: selected.originalAnimation, observedMs: Date.now() - startHold, samples, returned };
      console.log(`${species}: picker selection, all 24 thumbnails, .65/1/1.5 geometry, production region packets and real 30-second return passed.`);

      await dispatch(panel, { type: 'original-animation', clip: 6 }); await ready(overlay, 6);
      await overlay.waitForFunction(() => document.querySelector('.pet-overlay .pet-sprite').dataset.originalMode === 'manual');
      await dispatch(panel, { type: 'settings', patch: { paused: true } }); await sleep(overlay, 150);
      const paused = await snapshot(overlay), held = await pixels(overlay), before = (await state(panel)).originalAnimation;
      await sleep(overlay, 600); assert.equal(await pixels(overlay), held);
      assert.equal((await snapshot(overlay)).elapsed, paused.elapsed);
      const pausedMenu = await openPicker(overlay);
      await pausedMenu.getByRole('button', { name: '播放睡觉', exact: true }).click();
      await pausedMenu.waitFor({ state: 'detached' }); await sleep(overlay, 200);
      assert.deepEqual((await state(panel)).originalAnimation, before, 'paused source choice is ignored through actual picker IPC');
      assert.equal(await pixels(overlay), held);
      await dispatch(panel, { type: 'settings', patch: { paused: false } });
      await overlay.waitForFunction(elapsed => Number(document.querySelector('.pet-overlay .pet-sprite').dataset.elapsed) > elapsed, paused.elapsed);
      report.pause = { before: paused, resumed: await snapshot(overlay), pixelsHeld: true, pickerSelectionIgnored: true };
    }

    result.surface = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
      const image = await window.webContents.capturePage();
      return { visible: window.isVisible(), bounds: window.getBounds(), imageSize: image.getSize(), cornerAlpha: image.toBitmap()[3] };
    });
    assert.equal(result.surface.visible, true); assert.equal(result.surface.cornerAlpha, 0);
    assert.deepEqual(result.surface.bounds, (await state(panel)).motion.visual.host);
    const screenshot = path.join(directory, `${mode}-${species}-native-root.png`);
    await overlay.locator('.pet-overlay').screenshot({ path: screenshot, omitBackground: true }); result.screenshot = screenshot;
    console.log(`${species}: native 320×300 full source crops 6/22/24 and transparent full-surface host passed.`);
  }
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.stack ?? String(error);
  if (overlay) { report.failureSnapshot = await snapshot(overlay).catch(() => null); report.failureState = await state(overlay).catch(() => null); }
  if (overlay) report.routineTrace = await overlay.evaluate(() => window.__gentleRoutineTrace ?? []).catch(() => []);
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  await rm(userData, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(directory, 'native-report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(directory, 'native-report.md'), `# Gentle native Electron probe\n\nMode: ${mode}. Version: ${version}. Passed: ${report.passed}.\n\nCommand: \`${report.command}\`\n\n${report.failure ?? 'Both original species showed the current Beijing pose and retained source metadata and complete 320×300 source crops for clips 6/22/24. Native speech used a real eight-second timer. The compact picker contained 24 static first-frame atlas thumbnails, closed on selection, fit the .65/1/1.5 logical roots and emitted valid production hit-region packets. A real 30-second manual selection returned to the daily pose. Pause held pixels and ignored a picker choice before resuming source playback. Transparent native full-surface hosts remained visible.'}\n\n${report.firstSpeech?.phaseClock ?? ''}\n\n${report.limitations}\n\nThe fresh owned temporary profile was removed after shutdown. Existing installed app and user profiles were not modified. JSON evidence: native-report.json.\n`);
}
