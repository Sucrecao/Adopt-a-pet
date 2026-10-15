import test from 'node:test';
import assert from 'node:assert/strict';

const feature = await import('../src/core/head-nuzzle.js').catch(() => ({}));
const rect = { x: 10, y: 20, width: 320, height: 300 };
const contact = { direction: 1 };
const inputs = { species: 'maltese', clip: 7, token: 1, contact };

test('head contact uses the drawn source head and rejects the body and transparent head pixels', () => {
  assert.equal(typeof feature.getHeadContact, 'function');
  const check = point => feature.getHeadContact({ species: 'maltese', clip: 7, rect, point, alphaAt: () => 255 });
  assert.ok(check({ x: 170, y: 150 }));
  assert.equal(check({ x: 170, y: 230 }), null);
  assert.equal(check({ x: 30, y: 50 }), null);
  assert.equal(feature.getHeadContact({ species: 'maltese', clip: 7, rect, point: { x: 170, y: 150 }, alphaAt: () => 0 }), null);
});

test('square overlay letterboxing and arbitrary display scaling map back to the same source pixel', () => {
  assert.equal(typeof feature.getHeadContact, 'function');
  const pixels = [];
  const hit = feature.getHeadContact({ species: 'golden', clip: 16,
    rect: { x: 100, y: 200, width: 640, height: 640 }, point: { x: 420, y: 440 },
    alphaAt: (x, y) => { pixels.push([x, y]); return 255; } });
  assert.ok(hit);
  assert.deepEqual(pixels, [[160, 110]]);
});

test('relaxed source 22 has a separate head region for each dog', () => {
  assert.equal(typeof feature.getHeadContact, 'function');
  assert.ok(feature.getHeadContact({ species: 'maltese', clip: 22, rect,
    point: { x: 200, y: 220 }, alphaAt: () => 255 }));
  assert.ok(feature.getHeadContact({ species: 'golden', clip: 22, rect,
    point: { x: 170, y: 180 }, alphaAt: () => 255 }));
  assert.equal(feature.getHeadContact({ species: 'golden', clip: 22, rect,
    point: { x: 170, y: 250 }, alphaAt: () => 255 }), null);
});

test('props, sleeping scenes, unsupported pets, and an unavailable image cannot trigger contact', () => {
  assert.equal(typeof feature.getHeadContact, 'function');
  for (const invalid of [{ clip: 6 }, { clip: 24 }, { species: 'parrot' }, { rect: { ...rect, width: 0 } }, { alphaAt: undefined }]) {
    assert.equal(feature.getHeadContact({ species: 'maltese', clip: 7, rect,
      point: { x: 170, y: 150 }, alphaAt: () => 255, ...invalid }), null);
  }
});

test('a stationary mouse triggers one head cue after 400 milliseconds', () => {
  assert.equal(typeof feature.createHeadNuzzleController, 'function');
  const controller = feature.createHeadNuzzleController();
  assert.equal(controller.sample({ ...inputs, now: 0 }).cue, null);
  assert.equal(controller.sample({ ...inputs, now: 399 }).cue, null);
  assert.deepEqual(controller.sample({ ...inputs, now: 400 }).cue,
    { species: 'maltese', clip: 7, token: 1, gestureId: 1, direction: 1 });
  assert.equal(controller.sample({ ...inputs, now: 20000 }).cue, null);
});

test('leaving for 250 milliseconds and a ten second cooldown are both required for another cue', () => {
  assert.equal(typeof feature.createHeadNuzzleController, 'function');
  const controller = feature.createHeadNuzzleController();
  controller.sample({ ...inputs, now: 0 }); controller.sample({ ...inputs, now: 400 });
  controller.sample({ ...inputs, contact: null, now: 500 });
  controller.sample({ ...inputs, now: 749 });
  assert.equal(controller.sample({ ...inputs, now: 11000 }).cue, null, 'short departures do not rearm');
  controller.sample({ ...inputs, contact: null, now: 11100 });
  controller.sample({ ...inputs, contact: null, now: 11350 });
  controller.sample({ ...inputs, now: 11400 });
  const next = controller.sample({ ...inputs, now: 11800 });
  assert.equal(next.cue?.gestureId, 2);
});

test('reentering during cooldown cannot bypass it by accumulating head dwell', () => {
  assert.equal(typeof feature.createHeadNuzzleController, 'function');
  const controller = feature.createHeadNuzzleController();
  controller.sample({ ...inputs, now: 0 }); controller.sample({ ...inputs, now: 400 });
  controller.sample({ ...inputs, contact: null, now: 500 });
  controller.sample({ ...inputs, contact: null, now: 750 });
  controller.sample({ ...inputs, now: 1000 });
  assert.equal(controller.sample({ ...inputs, now: 10399 }).cue, null);
  assert.equal(controller.sample({ ...inputs, now: 10400 }).cue?.gestureId, 2);
});

test('a sufficiently long departure rearms even without intermediate timer samples', () => {
  assert.equal(typeof feature.createHeadNuzzleController, 'function');
  const controller = feature.createHeadNuzzleController();
  controller.sample({ ...inputs, now: 0 }); controller.sample({ ...inputs, now: 400 });
  controller.sample({ ...inputs, contact: null, now: 500 });
  controller.sample({ ...inputs, now: 11000 });
  assert.equal(controller.sample({ ...inputs, now: 11400 }).cue?.gestureId, 2);
});

test('pressing, disabling, or losing head contact cancels pending dwell', () => {
  assert.equal(typeof feature.createHeadNuzzleController, 'function');
  for (const blocked of [{ pressed: true }, { enabled: false }, { contact: null }]) {
    const controller = feature.createHeadNuzzleController();
    controller.sample({ ...inputs, now: 0 });
    assert.equal(controller.sample({ ...inputs, now: 300, ...blocked }).touching, false);
    assert.equal(controller.sample({ ...inputs, now: 600 }).cue, null);
    assert.equal(controller.sample({ ...inputs, now: 999 }).cue, null);
    assert.ok(controller.sample({ ...inputs, now: 1000 }).cue);
  }
});

test('a different successfully drawn source or replay token starts a fresh dwell', () => {
  assert.equal(typeof feature.createHeadNuzzleController, 'function');
  for (const changed of [{ clip: 16 }, { token: 2 }]) {
    const controller = feature.createHeadNuzzleController();
    controller.sample({ ...inputs, now: 0 });
    controller.sample({ ...inputs, ...changed, now: 300 });
    assert.equal(controller.sample({ ...inputs, ...changed, now: 699 }).cue, null);
    assert.ok(controller.sample({ ...inputs, ...changed, now: 700 }).cue);
  }
});

test('direction is derived from the touched side of the source head', () => {
  assert.equal(typeof feature.getHeadContact, 'function');
  const check = x => feature.getHeadContact({ species: 'maltese', clip: 16, rect,
    point: { x: x + 10, y: 120 }, alphaAt: () => 255 });
  assert.equal(check(145)?.direction, -1);
  assert.equal(check(190)?.direction, 1);
});
