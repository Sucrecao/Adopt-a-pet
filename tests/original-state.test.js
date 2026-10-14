import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, transition, normalizeState } from '../src/core/state.js';
import { createRequire } from 'node:module';
const { isValidCommand } = createRequire(import.meta.url)('../electron/security.cjs');

for (const species of ['maltese', 'golden']) {
  test(`${species} can select and replay original animations without fabricating care actions`, () => {
    const adopted = transition(createState(1000), { type: 'adopt', species, name: '原作伙伴' }, 1000);
    assert.deepEqual(adopted.originalAnimation, { clip: 7, startedAt: 0 });
    const next = transition(adopted, { type: 'original-animation', clip: 24 }, 2000);
    assert.deepEqual(next.originalAnimation, { clip: 24, startedAt: 2000 });
    assert.deepEqual(next.action, { type: 'idle', until: 0 });
    assert.deepEqual(transition(next, { type: 'original-animation', clip: 24 }, 2001).originalAnimation, { clip: 24, startedAt: 2001 });
    assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(next)), 3000).originalAnimation, next.originalAnimation);
    assert.deepEqual(adopted.originalAnimation, { clip: 7, startedAt: 0 });
  });
}

test('original animation commands reject invalid clips and non-original companions', () => {
  const adopted = transition(createState(1000), { type: 'adopt', species: 'maltese', name: '小白' }, 1000);
  for (const clip of [0, 25, -1, 1.5, '7', NaN, Infinity, undefined]) {
    assert.equal(isValidCommand({ type: 'original-animation', clip }), false);
    assert.throws(() => transition(adopted, { type: 'original-animation', clip }, 2000));
  }
  for (const clip of [1, 7, 24]) assert.equal(isValidCommand({ type: 'original-animation', clip }), true);
  for (const species of ['parrot']) {
    const legacy = transition(createState(1000), { type: 'adopt', species, name: '老朋友' }, 1000);
    assert.throws(() => transition(legacy, { type: 'original-animation', clip: 1 }, 2000));
  }
  assert.throws(() => transition(createState(1000), { type: 'original-animation', clip: 1 }, 2000));
});

test('pause holds original selection and corrupt persisted selection resets safely', () => {
  let state = transition(createState(1000), { type: 'adopt', species: 'golden', name: '金毛' }, 1000);
  state = transition(state, { type: 'original-animation', clip: 4 }, 2000);
  const paused = transition(state, { type: 'settings', patch: { paused: true } }, 3000);
  assert.deepEqual(transition(paused, { type: 'original-animation', clip: 8 }, 4000).originalAnimation, paused.originalAnimation);
  for (const originalAnimation of [null, { clip: 100, startedAt: 20 }, { clip: '4', startedAt: 20 }]) {
    assert.deepEqual(normalizeState({ ...state, originalAnimation }, 4000).originalAnimation, { clip: 7, startedAt: 0 });
  }
  assert.deepEqual(normalizeState({ ...state, originalAnimation: { clip: 3, startedAt: Infinity } }, 4000).originalAnimation, { clip: 3, startedAt: 0 });
});
