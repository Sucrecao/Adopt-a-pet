import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PETS } from '../src/core/pets.js';
import { createState, normalizeState, transition } from '../src/core/state.js';
const { isValidCommand } = createRequire(import.meta.url)('../electron/security.cjs');

test('only Maltese, Golden Retriever and parrot remain available', () => {
  assert.deepEqual(PETS.map(pet => pet.id), ['maltese', 'golden', 'parrot']);
  assert.equal(createState(1000).species, 'maltese');
  assert.equal(createState(1000).name, '马尔济斯');
  for (const species of ['cat', 'dog']) {
    assert.equal(isValidCommand({ type: 'adopt', species, name: '旧伙伴' }), false);
    assert.throws(() => transition(createState(1000), { type: 'adopt', species, name: '旧伙伴' }, 1000));
  }
});

for (const [species, name] of [['cat', '奶糖'], ['dog', '豆包']]) {
  test(`saved ${species} migrates to a valid original pet while preserving preferences`, () => {
    const saved = { ...createState(1000), species, name, adopted: true,
      stats: { hunger: 50, happiness: 60, energy: 70, bond: 80 },
      settings: { size: .8, movement: 'edge', sound: true, alwaysOnTop: false, paused: true },
      action: { type: 'feed', until: 4000 }, originalAnimation: { clip: 24, startedAt: 900 } };
    const migrated = normalizeState(saved, 2000);
    assert.equal(migrated.species, 'maltese');
    assert.equal(migrated.name, '马尔济斯');
    assert.equal(migrated.adopted, true);
    assert.deepEqual(migrated.stats, saved.stats);
    assert.deepEqual(migrated.settings, saved.settings);
    assert.deepEqual(migrated.action, { type: 'idle', until: 0 });
    assert.deepEqual(migrated.originalAnimation, { clip: 7, startedAt: 0 });
    assert.equal(normalizeState({ ...saved, name: '我的老朋友' }, 2000).name, '我的老朋友');
    assert.deepEqual(normalizeState(migrated, 2000), migrated);
    assert.equal(saved.species, species);
  });
}
