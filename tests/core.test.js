import test from 'node:test';
import assert from 'node:assert/strict';
import { PETS } from '../src/core/pets.js';
import { createState, normalizeState, transition, decayState } from '../src/core/state.js';
import { clampWindow, chooseTarget } from '../src/core/geometry.js';
import { desktopSpriteSize, gaitSpeedDip } from '../src/core/gait.js';

test('catalog contains the two original puppies and parrot', () => {
  assert.deepEqual(PETS.map(p => p.id), ['maltese', 'golden', 'parrot']);
  for (const pet of PETS) {
    for (const key of ['label', 'defaultName', 'subtitle', 'description', 'personality', 'toyLabel', 'color']) assert.ok(pet[key]);
    const original = ['maltese', 'golden'].includes(pet.id);
    assert.equal(pet.asset, pet.id==='parrot'?`pets/${pet.id}.png`:`pets/${pet.id}-${original ? 'original' : 'line'}-v1-neutral.png`);
    if(pet.id!=='parrot') {
      assert.equal(pet.neutralAsset,pet.asset);
      if (original) {
        assert.equal(pet.originalMetaAsset, `pets/${pet.id}-original-v1.json`);
        assert.equal(pet.animationMode, 'original-apng-v1');
      } else assert.equal(pet.wholeMetaAsset,`pets/${pet.id}-line-v1.json`);
      assert.equal(pet.presentation,'visual-root-v1');
    }
  }
  for (const id of ['maltese', 'golden']) assert.equal(PETS.find(pet => pet.id === id).kind, 'dog');
});

for (const species of ['maltese', 'golden']) {
  test(`${species} adoption survives persisted reload without losing name or preferences`, () => {
    const initial = transition(createState(1000), { type: 'settings', patch: { movement: 'edge', size: .85, sound: true } }, 1000);
    const adopted = transition(initial, { type: 'adopt', species, name: '  我的伙伴  ' }, 2000);
    const reloaded = normalizeState(JSON.parse(JSON.stringify(adopted)), 2000);
    assert.equal(reloaded.species, species);
    assert.equal(reloaded.name, '我的伙伴');
    assert.equal(reloaded.adopted, true);
    assert.deepEqual(reloaded.settings, adopted.settings);
    assert.deepEqual(reloaded.stats, adopted.stats);
    assert.equal(initial.adopted, false);
    assert.equal(transition(reloaded, { type: 'interact', action: 'pet' }, 3000).action.type, 'pet');
  });

  test(`${species} uses the existing dog travel cadence at every pet size`, () => {
    for (const size of [.65, 1, 1.5]) {
      for (const action of ['idle', 'play']) {
        const visibleSize = desktopSpriteSize(340 * size);
        assert.equal(gaitSpeedDip(species, action, visibleSize), gaitSpeedDip('dog', action, visibleSize));
      }
    }
  });
}

test('parrot adoption reloads with the same identity', () => {
  for (const species of ['parrot']) {
    const saved = { ...createState(1000), species, name: '老朋友', adopted: true };
    const reloaded = normalizeState(JSON.parse(JSON.stringify(saved)), 1000);
    assert.equal(reloaded.species, species);
    assert.equal(reloaded.name, '老朋友');
    assert.equal(reloaded.adopted, true);
  }
});

test('fresh state uses deterministic defaults', () => {
  const state = createState(1000);
  assert.equal(state.species, 'maltese');
  assert.equal(state.name, '马尔济斯');
  assert.equal(state.adopted, false);
  assert.deepEqual(state.stats, { hunger: 78, energy: 85, happiness: 80, bond: 0 });
  assert.deepEqual(state.settings, { size: 1, movement: 'free', sound: false, alwaysOnTop: true, paused: false });
  assert.equal(state.updatedAt, 1000);
});

test('normalize corrupt loaded state clamps values and removes unsupported fields', () => {
  const state = normalizeState({ species: 'dragon', name: ' ', adopted: 'yes', stats: { hunger: -5, energy: 200, happiness: NaN }, settings: { size: 10, movement: 'space', sound: 'yes' }, action: { type: 'unknown', until: Infinity }, updatedAt: 'old', extra: true }, 2000);
  assert.equal(state.species, 'maltese');
  assert.equal(state.name, '马尔济斯');
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
  const adopted = transition(original, { type: 'adopt', species: 'golden', name: '  金毛  ' }, 2000);
  assert.equal(adopted.name, '金毛');
  assert.equal(adopted.species, 'golden');
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

test('stretch and trick retain full action time plus a bounded connection budget, effects and cooldown', () => {
  for (const [action, duration, energy, happiness, bond] of [
    ['stretch', 3400, -1, 4, 1], ['trick', 3600, -3, 7, 2],
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

test('care expiry cannot truncate its authored clip after an800ms lead-in',()=>{
  for(const [action,authored] of [['pet',2400],['feed',3200],['stretch',2600],['trick',2800]]){
    const state=transition(createState(1000),{type:'interact',action},1000);
    assert.equal(state.action.until,1000+800+authored);
    assert.equal(decayState(state,1000+800+authored-1).action.type,action);
    assert.equal(decayState(state,1000+800+authored).action.type,'idle');
  }
  assert.equal(transition(createState(1000),{type:'interact',action:'play'},1000).action.until,7000);
  assert.equal(transition(createState(1000),{type:'interact',action:'rest'},1000).action.until,31000);
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
