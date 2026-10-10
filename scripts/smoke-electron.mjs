import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
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
    const frames = await overlay.evaluate(() => new Promise(resolve => {
      const frames = new Set(), started = performance.now();
      function sample(now) {
        frames.add(document.querySelector('.pet-sprite').dataset.frame);
        if (now - started < 1000) requestAnimationFrame(sample); else resolve([...frames]);
      }
      requestAnimationFrame(sample);
    }));
    assert.ok(frames.length >= 2, `${action} plays a multi-frame animation`);
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
  await panel.screenshot({ path: '.artifacts/desktop-panel.png' });
  await overlay.screenshot({ path: '.artifacts/desktop-pet.png', omitBackground: true });
  await app.close();
  app = null;
  const saved = JSON.parse(await readFile(path.join(userData, 'companion.json'), 'utf8'));
  assert.equal(saved.species, 'dog');
  assert.equal(saved.name, '团子');
  assert.equal(saved.settings.movement, 'edge');
  console.log('Electron smoke passed: desktop bridge, adoption, alpha transparency, decoded motion atlas, multi-frame stretch/trick, stationary interaction, play, drag lifecycle, settings and persisted state.');
} finally {
  if (app) await app.close();
  await rm(userData, { recursive: true, force: true });
}
