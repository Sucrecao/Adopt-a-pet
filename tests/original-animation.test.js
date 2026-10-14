import test from 'node:test';
import assert from 'node:assert/strict';
import { createOriginalAnimationController } from '../src/core/original-animation.js';

const clip = { id: 7, durations: [50, 100, 200], loopCount: 2 };
const create = source => createOriginalAnimationController({ clip: source ?? clip });

test('original playback uses unequal delays and exact cumulative boundaries', () => {
  const controller = create();
  for (const [now, frame] of [[0,0],[49.999,0],[50,1],[149.999,1],[150,2],[349.999,2],[350,0],[400,1],[500,2],[699.999,2]]) {
    const sample = controller.sample({}, now);
    assert.equal(sample.frame, frame, `at ${now}ms`);
    assert.equal(sample.elapsed, now);
    assert.equal(sample.done, false);
  }
});

test('finite source repeats finish at the exact boundary and hold the final picture', () => {
  const controller = create(); controller.sample({}, 0);
  assert.deepEqual(controller.sample({}, 700), { clip: 7, frame: 2, elapsed: 700, done: true, sequence: 1 });
  assert.equal(controller.sample({}, 50000).frame, 2);
  assert.equal(controller.sample({}, 50000).elapsed, 700);
});

test('APNG loop count zero repeats indefinitely, including exact cycle boundaries', () => {
  const controller = create({ ...clip, loopCount: 0 }); controller.sample({}, 0);
  for (const now of [350,700,350000]) {
    const sample = controller.sample({}, now);
    assert.equal(sample.frame, 0); assert.equal(sample.done, false); assert.equal(sample.elapsed, now);
  }
});

for (const quiet of [{ paused: true }, { static: true }, { reducedMotion: true }]) {
  test(`${Object.keys(quiet)[0]} holds the last picture and resumes without catching up`, () => {
    const controller = create(); controller.sample({}, 0);
    const before = controller.sample({}, 75);
    assert.deepEqual(controller.sample(quiet, 1000), before);
    assert.deepEqual(controller.sample(quiet, 5000), before);
    assert.deepEqual(controller.sample({}, 9000), before);
    assert.equal(controller.sample({}, 9075).frame, 2);
    assert.equal(controller.sample({}, 9075).elapsed, 150);
  });
  test(`${Object.keys(quiet)[0]} initially holds frame zero`, () => {
    const controller = create(); controller.sample(quiet, 1234);
    assert.equal(controller.sample(quiet, 50000).frame, 0);
    assert.equal(controller.sample(quiet, 50000).elapsed, 0);
  });
}

test('selecting another clip or repeating its token restarts at frame zero', () => {
  const controller = create(); controller.sample({ token: 1 }, 0);
  const previous = controller.sample({ token: 1 }, 160);
  assert.equal(previous.frame, 2);
  const repeated = controller.sample({ token: 2 }, 200);
  assert.equal(repeated.frame, 0); assert.equal(repeated.elapsed, 0); assert.equal(repeated.sequence, 2);
  const other = { ...clip, id: 8, durations: [25,75], loopCount: 1 };
  assert.equal(controller.sample({ clip: other, token: 2 }, 300).clip, 8);
  assert.equal(controller.sample({ clip: other, token: 2 }, 325).frame, 1);
});

test('source clock ignores backwards timestamps', () => {
  const controller = create(); controller.sample({}, 100);
  assert.equal(controller.sample({}, 175).elapsed, 75);
  assert.equal(controller.sample({}, 150).elapsed, 75);
  assert.equal(controller.sample({}, 200).elapsed, 100);
});

test('source metadata cannot produce undefined frames or invalid loop semantics', () => {
  for (const source of [{ ...clip, durations: [] }, { ...clip, durations: [0] }, { ...clip, durations: [-1] }, { ...clip, loopCount: -1 }, { ...clip, loopCount: 1.5 }]) {
    assert.throws(() => create(source), /Invalid original/);
  }
});

test('fractional APNG delays select the next source frame at each exact cumulative boundary', () => {
  const durations = Array(12).fill(1000 / 30);
  const controller = create({ ...clip, durations, loopCount: 1 });
  controller.sample({}, 0);
  let boundary = 0;
  for (let frame = 1; frame < durations.length; frame++) {
    boundary += durations[frame - 1];
    assert.equal(controller.sample({}, boundary).frame, frame, `source boundary ${frame}`);
  }
});
