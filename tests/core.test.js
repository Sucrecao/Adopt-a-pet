import test from 'node:test';
import assert from 'node:assert/strict';
import { PETS } from '../src/core/pets.js';
import { createState, normalizeState, transition, decayState } from '../src/core/state.js';
import { clampWindow, chooseTarget } from '../src/core/geometry.js';

test('three species carry UI metadata and local assets', () => {
  assert.deepEqual(PETS.map(p => p.id), ['cat', 'dog', 'parrot']);
  for (const pet of PETS) {
    for (const key of ['label', 'defaultName', 'subtitle', 'description', 'personality', 'toyLabel', 'color']) assert.ok(pet[key]);
    assert.equal(pet.asset, `pets/${pet.id}.png`);
  }
});

test('fresh state uses deterministic defaults', () => {
  const state = createState(1000);
  assert.equal(state.species, 'cat');
  assert.equal(state.name, '奶糖');
  assert.equal(state.adopted, false);
  assert.deepEqual(state.stats, { hunger: 78, energy: 85, happiness: 80, bond: 0 });
  assert.deepEqual(state.settings, { size: 1, movement: 'free', sound: false, alwaysOnTop: true, paused: false });
  assert.equal(state.updatedAt, 1000);
});

test('normalize corrupt loaded state clamps values and removes unsupported fields', () => {
  const state = normalizeState({ species: 'dragon', name: ' ', adopted: 'yes', stats: { hunger: -5, energy: 200, happiness: NaN }, settings: { size: 10, movement: 'space', sound: 'yes' }, action: { type: 'unknown', until: Infinity }, updatedAt: 'old', extra: true }, 2000);
  assert.equal(state.species, 'cat');
  assert.equal(state.name, '奶糖');
  assert.equal(state.adopted, false);
  assert.deepEqual(state.stats, { hunger: 0, energy: 100, happiness: 80, bond: 0 });
  assert.equal(state.settings.size, 1.5);
  assert.equal(state.settings.sound, false);
  assert.equal(state.settings.movement, 'free');
  assert.deepEqual(state.action, { type: 'idle', until: 0 });
  assert.equal(state.updatedAt, 2000);
  assert.equal('extra' in state, false);
  assert.deepEqual(normalizeState(null, 2000), createState(2000));
});

test('adopt and rename sanitize names without mutating previous state', () => {
  const original = createState(1000);
  const adopted = transition(original, { type: 'adopt', species: 'dog', name: '  豆包  ' }, 2000);
  assert.equal(adopted.name, '豆包');
  assert.equal(adopted.species, 'dog');
  assert.equal(adopted.adopted, true);
  assert.equal(original.adopted, false);
  assert.equal(transition(adopted, { type: 'rename', name: ' 小狗 ' }, 2000).name, '小狗');
  assert.throws(() => transition(original, { type: 'adopt', species: 'dragon' }, 2000));
  assert.throws(() => transition(original, { type: 'rename', name: '' }, 2000));
  assert.throws(() => transition(original, { type: 'unknown' }, 2000));
  assert.throws(() => transition(original, { type: 'interact', action: 'attack' }, 2000));
});

test('interactions apply effects once during cooldown and remain bounded', () => {
  let state = transition(createState(1000), { type: 'interact', action: 'feed' }, 1000);
  assert.ok(state.stats.hunger > 78);
  assert.equal(state.action.type, 'feed');
  const repeated = transition(state, { type: 'interact', action: 'feed' }, 1200);
  assert.equal(repeated.lastInteraction, 1000);
  assert.ok(repeated.stats.hunger <= state.stats.hunger);
  state = transition(state, { type: 'interact', action: 'pet' }, 1800);
  assert.ok(state.stats.bond > 0);
  state = transition(state, { type: 'interact', action: 'play' }, 2600);
  assert.equal(state.action.type, 'play');
  for (let time = 4000; time < 100000; time += 1000) state = transition(state, { type: 'interact', action: 'feed' }, time);
  for (const value of Object.values(state.stats)) assert.ok(value >= 0 && value <= 100);
});

test('stretch and trick preserve duration, effects, cooldown and normalized action', () => {
  for (const [action, duration, energy, happiness, bond] of [
    ['stretch', 2600, -1, 4, 1], ['trick', 2800, -3, 7, 2],
  ]) {
    const initial = createState(1000);
    const next = transition(initial, { type: 'interact', action }, 1000);
    assert.deepEqual(next.action, { type: action, until: 1000 + duration });
    assert.equal(next.stats.energy, initial.stats.energy + energy);
    assert.equal(next.stats.happiness, initial.stats.happiness + happiness);
    assert.equal(next.stats.bond, initial.stats.bond + bond);
    assert.deepEqual(normalizeState(next, 1000).action, next.action);
    assert.equal(transition(next, { type: 'interact', action }, 1200).lastInteraction, 1000);
    assert.equal(decayState(next, 1000 + duration).action.type, 'idle');
    const paused = transition(initial, { type: 'settings', patch: { paused: true } }, 1000);
    assert.equal(transition(paused, { type: 'interact', action }, 1000).action.type, 'idle');
  }
});

test('decay uses elapsed time, caps offline loss and expires actions', () => {
  const state = createState(1000);
  const minute = decayState(state, 61000);
  assert.ok(minute.stats.hunger < state.stats.hunger);
  assert.deepEqual(decayState(decayState(state, 31000), 61000).stats, minute.stats);
  assert.deepEqual(decayState(state, 1000 + 86400000).stats, decayState(state, 1000 + 3600000).stats);
  assert.ok(decayState(state, 1000 + 86400000).stats.hunger > 0);
  assert.equal(decayState(transition(state, { type: 'interact', action: 'pet' }, 1000), 10000).action.type, 'idle');
  assert.deepEqual(decayState(state, 0).stats, state.stats);
});

test('rest restores energy only during action and pause prevents decay', () => {
  const state = normalizeState({ ...createState(1000), stats: { energy: 20 } }, 1000);
  const resting = transition(state, { type: 'interact', action: 'rest' }, 1000);
  assert.ok(decayState(resting, 6000).stats.energy > state.stats.energy);
  const paused = transition(state, { type: 'settings', patch: { paused: true, size: 0.7, movement: 'edge' } }, 1000);
  assert.deepEqual(transition(paused, { type: 'tick' }, 61000).stats, paused.stats);
  assert.equal(paused.settings.movement, 'edge');
  assert.throws(() => transition(state, { type: 'settings', patch: { size: -1 } }, 1000));
  assert.throws(() => transition(state, { type: 'settings', patch: { sound: 'yes' } }, 1000));
});

test('window clamps negative screen origins and oversized bounds', () => {
  const area = { x: -1920, y: -200, width: 1920, height: 1080 };
  assert.deepEqual(clampWindow({ x: -2000, y: 1000, width: 200, height: 150 }, area), { x: -1920, y: 730, width: 200, height: 150 });
  assert.deepEqual(clampWindow({ x: 0, y: 0, width: 4000, height: 2000 }, area), area);
});

test('movement targets stay inside screen and edge mode follows bottom', () => {
  const area = { x: -800, y: 40, width: 800, height: 600 };
  const bounds = { x: 0, y: 0, width: 100, height: 100 };
  assert.deepEqual(chooseTarget(bounds, area, 'free', () => 0), { x: -800, y: 40 });
  assert.deepEqual(chooseTarget(bounds, area, 'free', () => 1), { x: -100, y: 540 });
  assert.deepEqual(chooseTarget(bounds, area, 'edge', () => 0.5), { x: -450, y: 540 });
  assert.deepEqual(chooseTarget({ ...bounds, width: 2000 }, area, 'free', () => 1), { x: -800, y: 540 });
});
