import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getBeijingPeriod } from '../src/core/companion-routine.js';

const executablePath = process.env.PAWPAL_PACKAGED_EXECUTABLE;
const directory = '.artifacts/natural-endings';
await mkdir(directory, { recursive: true });
const userData = await mkdtemp(path.join(tmpdir(), 'pawpal-natural-endings-'));
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const report = { version, mode: executablePath ? 'packaged' : 'development', executablePath: executablePath ?? null,
  startedAt: new Date().toISOString(), clock: 'Real wall time; Beijing phase uses Asia/Shanghai. No injected clock.',
  profile: 'Fresh owned temporary profile; removed after shutdown.', species: [],
  limitations: 'Native DOM/canvas and production IPC probe; this does not measure physical display scanout. Final-frame polling has up to 50 ms observation latency and routine transitions sample every 500 ms. Existing geometry and hit-region coverage remains in the previous native probe.' };
let app, overlay;
const dispatch = (page, command) => page.evaluate(value => window.companion.dispatch(value), command);
const state = page => page.evaluate(() => window.companion.getState());
const sleep = ms => overlay.waitForTimeout(ms);
const snapshot = () => overlay.evaluate(() => {
  const root = document.querySelector('.pet-overlay'), pet = root?.querySelector('.pet-sprite');
  return { now: Date.now(), clip: Number(pet?.dataset.clip), frame: Number(pet?.dataset.frame),
    done: pet?.dataset.done === 'true', elapsed: Number(pet?.dataset.elapsed), sequence: Number(pet?.dataset.sequence),
    mode: pet?.dataset.originalMode, renderer: pet?.dataset.renderer, loadState: pet?.dataset.loadState,
    visualSequence: Number(root?.dataset.visualSequence), visible: root && getComputedStyle(root).visibility === 'visible',
    canvasVisible: pet?.querySelector('canvas')?.style.visibility === 'visible', documentHidden: document.hidden };
});
const ready = clip => overlay.waitForFunction(clip => {
  const pet = document.querySelector('.pet-overlay .pet-sprite');
  return pet?.dataset.loadState === 'ready' && Number(pet.dataset.clip) === clip
    && pet.querySelector('canvas')?.style.visibility === 'visible';
}, clip, { timeout: 10000 });

async function manualEnding(panel, metadata, clip, { pauseAtEnd = false, rejectStaleCompletion = false } = {}) {
  const result = { clip, selectedAt: Date.now(), samples: [] }, timing = metadata.clips.find(item => item.id === clip);
  result.sourceDurationMs = timing.durations.reduce((sum, delay) => sum + delay, 0) * timing.loopCount;
  await dispatch(panel, { type: 'original-animation', clip }); await ready(clip);
  const initial = await snapshot(), period = getBeijingPeriod(Date.now());
  let doneAt, pausedMs = 0;
  while (Date.now() - result.selectedAt < 11000) {
    const snap = await snapshot(); result.samples.push(snap);
    if (snap.sequence !== initial.sequence || snap.clip !== clip) {
      assert.ok(doneAt, 'the source is never replaced before its completed final frame');
      const currentPeriod = getBeijingPeriod(Date.now());
      assert.equal(currentPeriod.key, period.key, 'probe must remain in one Beijing period');
      assert.equal(snap.clip, currentPeriod.key === 'sleep' ? 24 : 22); assert.equal(snap.mode, 'automatic');
      result.returned = snap; result.observedEndingHoldMs = snap.now - doneAt - pausedMs;
      assert.ok(result.observedEndingHoldMs >= 790, 'final frame receives about 900 active milliseconds before returning');
      return result;
    }
    assert.equal(snap.mode, 'manual');
    if (rejectStaleCompletion && snap.now - result.selectedAt >= 1300 && !result.staleCompletionIgnored) {
      assert.equal(snap.done, false); result.staleCompletionIgnored = true;
    }
    if (snap.done && !doneAt) {
      doneAt = snap.now; result.completed = snap;
      assert.equal(snap.frame, timing.durations.length - 1);
      assert.ok(Math.abs(snap.elapsed - result.sourceDurationMs) < .01, 'source durations and repeat count finish in full');
      const motion = (await state(panel)).motion;
      assert.equal(motion.moving, false); assert.equal(motion.intentMoving, false);
      assert.ok(motion.visual.committedSequence >= snap.visualSequence && snap.visualSequence > 0, 'native surface accepted the drawn final frame');
      if (pauseAtEnd) {
        const pauseStart = Date.now();
        await dispatch(panel, { type: 'settings', patch: { paused: true } }); await sleep(100);
        const paused = await snapshot(); await sleep(600); const held = await snapshot();
        assert.equal(held.clip, paused.clip); assert.equal(held.frame, paused.frame);
        assert.equal(held.elapsed, paused.elapsed); assert.equal(held.sequence, paused.sequence); assert.equal(held.mode, 'manual');
        await dispatch(panel, { type: 'settings', patch: { paused: false } });
        pausedMs = Date.now() - pauseStart; result.pause = { paused, held, pausedMs };
      }
    }
    await sleep(50);
  }
  throw new Error(`Clip ${clip} did not finish and settle within eleven seconds`);
}

try {
  const env = { ...process.env, PAWPAL_TEST_USER_DATA: userData }; delete env.VITE_DEV_SERVER_URL;
  const args = ['--disable-accelerated-2d-canvas'];
  app = await electron.launch({ ...(executablePath ? { executablePath, args } : { args: ['.', ...args] }), env, timeout: 30000 });
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), Boolean(executablePath));
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
  const panel = await app.firstWindow(); await panel.waitForFunction(() => Boolean(window.companion));
  for (const species of ['maltese', 'golden']) {
    const metadata = JSON.parse(await readFile(`public/pets/${species}-original-v1.json`, 'utf8'));
    await dispatch(panel, { type: 'adopt', species, name: `Natural ${species}` });
    overlay = app.windows().find(page => page.url().includes('view=pet')) ?? await app.waitForEvent('window', { predicate: page => page !== panel });
    await overlay.emulateMedia({ reducedMotion: 'no-preference' }); await ready(getBeijingPeriod(Date.now()).clip);
    const result = { species, initial: await snapshot(), ending: await manualEnding(panel, metadata, 4, { pauseAtEnd: species === 'maltese' }) };
    assert.equal(result.initial.renderer, 'original-whole-frame'); assert.equal(result.initial.visible, true);
    report.species.push(result);
    console.log(`${species}: native complete source, final-frame hold and automatic relaxed return passed.`);
    if (species === 'golden') report.quickReselection = await manualEnding(panel, metadata, 3, { rejectStaleCompletion: true });
  }
  const period = getBeijingPeriod(Date.now()), idle = await snapshot(), started = Date.now();
  const samples = [], night = period.key === 'sleep'; let completedAt, changed;
  while (Date.now() - started < (night ? 8000 : 31000)) {
    const snap = await snapshot(); samples.push(snap);
    if (snap.sequence !== idle.sequence) { changed = snap; break; }
    if (snap.done && !completedAt) completedAt = snap.now;
    if (night) assert.equal(await overlay.locator('.overlay-speech').count(), 0);
    await sleep(night ? 250 : 1000);
  }
  if (night) { assert.equal(changed, undefined); assert.equal(idle.clip, 24); }
  else {
    assert.ok(changed && completedAt, 'completed relaxed source offers a small reaction');
    assert.ok([22, 16, ...(period.key === 'affection' ? [1, 6] : [])].includes(changed.clip));
    assert.ok(changed.now - completedAt >= 13800 && changed.now - completedAt <= 27000, 'small reaction follows the 14–24 second idle interval plus ending hold and polling tolerance');
  }
  report.idle = { actualBeijingPeriod: period, periodicReactionSkippedForNight: night, initial: idle, completedAt, changed, observedMs: Date.now() - started, samples };
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
  await writeFile(path.join(directory, 'native-report.md'), `# Natural ending native probe\n\nVersion: ${version}. Mode: ${report.mode}. Passed: ${report.passed}.\n\n${report.failure ?? 'Both dogs completed their original source timing and final frame before returning to the relaxed pose. Native pause held the final frame and quick reselection ignored the old completion. The idle probe used the actual Beijing phase.'}\n\n${report.clock}\n\n${report.limitations}\n\n${report.profile}\n\nEvidence: native-report.json.\n`);
}
