import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../src/core/visual-motion.js').catch(() => ({}));
function driver(extra = {}) {
  assert.equal(typeof module.createVisualMotionDriver, 'function', 'fractional visual motion driver exists');
  const commits = [];
  const value = module.createVisualMotionDriver({ onCommit: packet => commits.push(packet) });
  value.configure({ epoch: 2, prepareEpoch: 1, facing: 1, intentMoving: true, moving: true, spriteSizeDip: 256,
    visual: { geometrySeq: 1, host: { x: -1400, y: 20, width: 2000, height: 1000 },
      rectGlobal: { x: -300, y: 500, width: 340, height: 360 }, targetGlobal: { x: 100, y: 500 }, speedDip: 30.25 }, ...extra });
  return { value, commits };
}
function paint(value, now, ready = true, painted = true) {
  const locomotion = value.sample(now, ready);
  const accepted = value.commit({ now, locomotion, sample: { frame: 7, phase: .2 }, painted });
  return { locomotion, accepted };
}

test('visual distance and fractional root are committed by the same successful whole-frame paint', () => {
  const { value, commits } = driver();
  paint(value, 0); const initial = value.snapshot();
  const candidate = value.sample(1000 / 120, true);
  assert.ok(candidate.distanceDip > 0 && candidate.distanceDip < 1);
  assert.equal(value.snapshot().distanceDip, initial.distanceDip, 'sampling does not commit root or distance');
  assert.equal(value.commit({ locomotion: candidate, sample: { frame: 8, phase: .25 }, painted: true }), true);
  const next = value.snapshot();
  assert.equal(next.distanceDip, next.rectGlobal.x - initial.rectGlobal.x);
  assert.equal(commits.at(-1).rectGlobal.x, next.rectGlobal.x);
  assert.equal(commits.at(-1).selectedFrame, 8);
  assert.equal(commits.at(-1).clockKind, 'visual-root-v1');
});

test('failed draws discard travel and rebase the source epoch before the next sample', () => {
  const { value } = driver(); paint(value, 0);
  const before = value.snapshot(), candidate = value.sample(16, true);
  assert.equal(value.commit({ locomotion: candidate, painted: false }), false);
  assert.deepEqual(value.snapshot().rectGlobal, before.rectGlobal);
  assert.equal(value.snapshot().distanceDip, before.distanceDip);
  assert.equal(value.snapshot().failedDraws, 1);
  const after = value.sample(32, false);
  assert.notEqual(after.epoch, candidate.epoch);
  assert.equal(after.distanceDip, before.distanceDip);
});

test('readiness, stop, pause, reduced motion and dragging freeze root without catch-up', () => {
  for (const barrier of [{ moving: false }, { paused: true }, { dragging: true }, { paused: true, reducedMotion: true }]) {
    const { value } = driver(); paint(value, 0); paint(value, 16);
    const before = value.snapshot();
    value.configure({ ...value.authority(), ...barrier }); paint(value, 10000);
    assert.deepEqual(value.snapshot().rectGlobal, before.rectGlobal);
    assert.equal(value.snapshot().distanceDip, before.distanceDip);
    value.configure({ ...value.authority(), moving: true, paused: false, dragging: false });
    paint(value, 20000); assert.deepEqual(value.snapshot().rectGlobal, before.rectGlobal);
  }
  const { value } = driver(); paint(value, 0, false); paint(value, 5000, false);
  assert.equal(value.snapshot().distanceDip, 0);
  paint(value, 10000, true); assert.equal(value.snapshot().distanceDip, 0);
});

test('geometry migration changes origin and size without charging gait distance', () => {
  const { value } = driver(); paint(value, 0); paint(value, 16);
  const authority = value.authority();
  value.configure({ ...authority, epoch: 3, visual: { ...authority.visual, geometrySeq: 2,
    host: { x: 0, y: 0, width: 1200, height: 900 }, rectGlobal: { x: 30, y: 200, width: 510, height: 540 } } });
  const sample = paint(value, 10000, false).locomotion;
  assert.equal(sample.distanceDip, 0);
  assert.deepEqual(value.snapshot().rectGlobal, { x: 30, y: 200, width: 510, height: 540 });
});

test('120 Hz samples advance fractional origins without overshoot or reverse steps', () => {
  const { value } = driver(); paint(value, 0);
  let previous = value.snapshot().rectGlobal.x, distinct = 0;
  for (let frame = 1; frame < 3000; frame++) {
    paint(value, frame * 1000 / 120);
    const x = value.snapshot().rectGlobal.x;
    assert.ok(x >= previous && x <= 100);
    if (x !== previous) distinct++;
    previous = x;
  }
  assert.ok(distinct > 1200);
  assert.equal(previous, 100);
});

test('a superseded sample cannot move the root or publish a stale sequence', () => {
  const { value, commits } = driver(); paint(value, 0);
  const old = value.sample(16, true), next = value.sample(24, true);
  assert.equal(value.commit({ locomotion: old, painted: true }), false);
  assert.equal(value.commit({ locomotion: next, painted: true }), true);
  assert.equal(commits.length, 2);
});

test('local pointer and care barriers never overwrite the native movement authority', () => {
  const { value } = driver(); paint(value,0);paint(value,16);
  const before=value.snapshot();
  const frozen=value.sample(32,true,{paused:true});
  assert.equal(frozen.distanceDip,before.distanceDip);
  value.commit({locomotion:frozen,painted:true});
  assert.equal(value.authority().paused,undefined);
  assert.equal(value.authority().moving,true);
  paint(value,48);assert.deepEqual(value.snapshot().rectGlobal,before.rectGlobal);
  paint(value,64);assert.ok(value.snapshot().distanceDip>before.distanceDip);
});
