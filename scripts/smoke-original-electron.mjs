import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PETS } from '../src/core/pets.js';

const executablePath = process.env.PAWPAL_PACKAGED_EXECUTABLE;
const mode = executablePath ? 'packaged' : 'development';
const directory = '.artifacts/couple-puppies-exact';
await mkdir(directory, { recursive: true });
const userData = await mkdtemp(path.join(tmpdir(), 'pawpal-original-native-'));
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const report = { mode, version, executablePath: executablePath ?? null,
  command: executablePath ? `PAWPAL_PACKAGED_EXECUTABLE=${JSON.stringify(executablePath)} node scripts/smoke-original-electron.mjs` : 'node scripts/smoke-original-electron.mjs',
  profile: 'fresh owned temporary profile; removed after application closes',
  rasterReadback: 'disable-accelerated-2d-canvas for consistent source/canvas readback',
  startedAt: new Date().toISOString(), species: [], limitations: 'Representative native clips/frames and >=8 second stationary checks per species. All 741 raw source frames are separately verified by the Python importer test; this probe does not assert every frame appeared on the physical display.' };
let app, overlay;
const dispatch = (panel, command) => panel.evaluate(value => window.companion.dispatch(value), command);
const state = page => page.evaluate(() => window.companion.getState());
const snapshot = page => page.evaluate(() => {
  const root = document.querySelector('.pet-overlay'), pet = root?.querySelector('.pet-sprite'), canvas = pet?.querySelector('canvas');
  const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  return { root: root && rect(root), sprite: pet && rect(pet), visible: root && getComputedStyle(root).visibility === 'visible',
    presentation: root?.dataset.presentation, renderer: pet?.dataset.renderer, loadState: pet?.dataset.loadState,
    clip: Number(pet?.dataset.clip), frame: Number(pet?.dataset.frame), sequence: Number(pet?.dataset.sequence),
    canvasSize: canvas && [canvas.width, canvas.height], transform: pet?.style.transform };
});
const pixels = page => page.evaluate(() => document.querySelector('.pet-overlay .pet-sprite canvas').toDataURL('image/png'));

async function sourcePicture(page, meta) {
  return page.evaluate(async meta => {
    const pet = document.querySelector('.pet-overlay .pet-sprite');
    const clip = meta.clips.find(clip => clip.id === Number(pet.dataset.clip));
    const response = await fetch(new URL(clip.asset, location.href));
    const image = await createImageBitmap(await response.blob());
    const frame = Number(pet.dataset.frame), canvas = pet.querySelector('canvas');
    const reference = document.createElement('canvas'); reference.width = 320; reference.height = 300;
    const context = reference.getContext('2d');
    context.drawImage(image, frame % clip.columns * 320, Math.floor(frame / clip.columns) * 300, 320, 300, 0, 0, 320, 300);
    const actual = canvas.getContext('2d').getImageData(0, 0, 320, 300).data;
    const expected = context.getImageData(0, 0, 320, 300).data;
    let exact = true, opaque = 0;
    for (let i = 0; i < actual.length; i++) { if (actual[i] !== expected[i]) exact = false; if (i % 4 === 3 && actual[i]) opaque++; }
    image.close();
    return { clip: clip.id, frame, exact, nontransparentPixels: opaque, png: canvas.toDataURL('image/png') };
  }, meta);
}

async function ready(page, clip, original = true) {
  await page.waitForFunction(({ clip, original }) => {
    const pet = document.querySelector('.pet-overlay .pet-sprite'), canvas = pet?.querySelector('canvas');
    return pet?.dataset.loadState === 'ready' && canvas?.style.visibility === 'visible'
      && (!original || pet.dataset.renderer === 'original-whole-frame' && Number(pet.dataset.clip) === clip)
      && getComputedStyle(document.querySelector('.pet-overlay')).visibility === 'visible';
  }, { clip, original }, { timeout: 15000 });
}

try {
  const env = { ...process.env, PAWPAL_TEST_USER_DATA: userData }; delete env.VITE_DEV_SERVER_URL;
  const raster = ['--disable-accelerated-2d-canvas'];
  app = await electron.launch({ ...(executablePath ? { executablePath, args: raster } : { args: ['.', ...raster] }), env, timeout: 30000 });
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), Boolean(executablePath));
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
  const panel = await app.firstWindow(); await panel.waitForFunction(() => Boolean(window.companion));
  for (const species of ['maltese', 'golden']) {
    const pet = PETS.find(pet => pet.id === species);
    const meta = JSON.parse(await readFile(path.join('public', pet.originalMetaAsset), 'utf8'));
    const result = { species, captures: [] }; report.species.push(result);
    const adopted = await dispatch(panel, { type: 'adopt', species, name: `Original ${species}` });
    assert.equal(adopted.species, species);
    overlay = app.windows().find(page => page.url().includes('view=pet')) ?? await app.waitForEvent('window', { predicate: page => page !== panel });
    await overlay.emulateMedia({ reducedMotion: 'no-preference' }); await ready(overlay, 7);
    const loaded = await overlay.evaluate(async asset => fetch(new URL(asset, location.href)).then(response => response.json()), pet.originalMetaAsset);
    assert.deepEqual(loaded, meta, 'actual app metadata matches source exports');
    for (const clip of [7, 3, 24]) {
      const selected = await dispatch(panel, { type: 'original-animation', clip });
      assert.equal(selected.originalAnimation.clip, clip); await ready(overlay, clip);
      await dispatch(panel, { type: 'settings', patch: { paused: true } });
      await overlay.waitForTimeout(100);
      const picture = await sourcePicture(overlay, meta);
      assert.equal(picture.exact, true, `${species} clip${clip}: complete native canvas equals source atlas crop`);
      assert.ok(picture.nontransparentPixels > 1000);
      const file = `${mode}-${species}-clip${clip}-canvas.png`;
      await writeFile(path.join(directory, file), Buffer.from(picture.png.split(',')[1], 'base64'));
      delete picture.png; result.captures.push({ ...picture, path: path.join(directory, file) });
      const snap = await snapshot(overlay);
      assert.deepEqual(snap.canvasSize, [320, 300]); assert.equal(snap.transform, 'none');
      assert.equal(snap.presentation, 'visual-root-v1'); assert.equal(snap.visible, true);
      const held = await pixels(overlay); await overlay.waitForTimeout(300);
      assert.equal(await pixels(overlay), held, 'pause holds complete canvas pixels');
      const blocked = await dispatch(panel, { type: 'original-animation', clip: clip === 24 ? 1 : 24 });
      assert.deepEqual(blocked.originalAnimation, selected.originalAnimation, 'paused selection leaves state unchanged');
      await dispatch(panel, { type: 'settings', patch: { paused: false } });
    }
    const beforeReplay = (await state(panel)).originalAnimation;
    await overlay.waitForTimeout(50);
    const replay = await dispatch(panel, { type: 'original-animation', clip: beforeReplay.clip });
    assert.ok(replay.originalAnimation.startedAt > beforeReplay.startedAt, 'repeat clip command changes restart token');
    await ready(overlay, beforeReplay.clip);
    await overlay.waitForTimeout(150);
    result.restart = { before: beforeReplay, after: replay.originalAnimation };
    const initial = await state(panel), started = Date.now(), samples = [];
    while (Date.now() - started < 8200) {
      const current = await state(panel);
      assert.deepEqual(current.motion.visual.rectGlobal, initial.motion.visual.rectGlobal, 'original pet remains stationary');
      assert.equal(current.motion.moving, false); assert.equal(current.motion.intentMoving, false);
      samples.push({ at: Date.now(), rectGlobal: current.motion.visual.rectGlobal });
      await overlay.waitForTimeout(250);
    }
    result.stationary = { observedMs: Date.now() - started, sampleCount: samples.length, rectGlobal: initial.motion.visual.rectGlobal };
    const area = initial.motion.visual.host, rect = initial.motion.visual.rectGlobal;
    const point = { x: area.x + Math.max(5, (area.width - rect.width) / 3), y: area.y + Math.max(5, (area.height - rect.height) / 3) };
    assert.equal(await overlay.evaluate(point => window.companion.movePet(point), point), true);
    await overlay.waitForTimeout(150); const moved = await state(panel);
    assert.notDeepEqual(moved.motion.visual.rectGlobal, rect); assert.equal((await snapshot(overlay)).visible, true);
    result.manualMove = { before: rect, after: moved.motion.visual.rectGlobal };
    result.sizes = [];
    for (const size of [.8, 1.2]) {
      await dispatch(panel, { type: 'settings', patch: { size } }); await overlay.waitForTimeout(150);
      const snap = await snapshot(overlay);
      assert.equal(snap.visible, true);
      result.sizes.push({ size, sprite: snap.sprite, canvasRatio: snap.sprite.width / snap.sprite.height });
    }
    assert.ok(Math.abs(result.sizes[0].canvasRatio - result.sizes[1].canvasRatio) < .01, 'resizing preserves display proportions');
    assert.ok(result.sizes[1].sprite.width > result.sizes[0].sprite.width);
    result.surface = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('view=pet'));
      const image = await window.webContents.capturePage(); const bitmap = image.toBitmap();
      return { visible: window.isVisible(), bounds: window.getBounds(), imageSize: image.getSize(), cornerAlpha: bitmap[3] };
    });
    assert.equal(result.surface.visible, true); assert.equal(result.surface.cornerAlpha, 0);
    assert.deepEqual(result.surface.bounds, (await state(panel)).motion.visual.host, 'overlay occupies full native host');
    const screenshot = path.join(directory, `${mode}-${species}-overlay.png`);
    await overlay.screenshot({ path: screenshot, omitBackground: true }); result.screenshot = screenshot;
    console.log(`${species}: native source crops, IPC, >=8s stationary, pause, move, size, transparent surface passed.`);
  }
  await dispatch(panel, { type: 'adopt', species: 'parrot', name: 'Parrot' }); await ready(overlay, null, false);
  report.parrot = await snapshot(overlay);
  assert.equal(await overlay.locator('.pet-overlay canvas').getAttribute('data-renderer'), 'whole-frame-2d');
  assert.ok(await overlay.evaluate(() => document.querySelector('.pet-overlay canvas').getContext('2d').getImageData(0, 0, 256, 256).data.some((v, i) => i % 4 === 3 && v > 0)));
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.stack ?? String(error);
  if (overlay) { report.failureSnapshot = await snapshot(overlay).catch(() => null); report.failureState = await state(overlay).catch(() => null); }
  throw error;
} finally {
  if (app) await app.close();
  await rm(userData, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(directory, 'native-report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(directory, 'native-report.md'), `# Original native Electron probe\n\nMode: ${mode}. Version: ${version}. Passed: ${report.passed}.\n\nCommand: \`${report.command}\`\n\n${report.failure ?? 'Both original species passed source crop equality, selection/restart IPC, pause holds, >=8 second stationary checks, manual placement, proportional size changes, and visible transparent full-surface overlays. Parrot loaded its authored whole-frame-2d renderer.'}\n\n${report.limitations}\n\nFresh owned temporary profile was removed after application shutdown. No installed app or existing user profile was modified. JSON evidence: native-report.json.\n`);
}
