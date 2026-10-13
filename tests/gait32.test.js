import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWholeAtlas } from '../src/rendering/whole-renderer.js';
import { createWholeAnimationController } from '../src/core/whole-animation.js';
import { PETS } from '../src/core/pets.js';

const gaitMetadata = () => {
  const meta = JSON.parse(readFileSync(new URL('../public/pets/cat-whole-v2.json', import.meta.url)));
  meta.version = 3;
  meta.pages.push({ asset: 'pets/gait.png', sourceSize: [2048, 1024], columns: 8, rows: 4, scale: 1 });
  meta.frames.push(...Array.from({ length: 32 }, (_, i) => ({ page: 2, rect: [i % 8 * 256, Math.floor(i / 8) * 256, 256, 256], offsetX: 0, offsetY: 0 })));
  meta.clips.walk = { frames: Array.from({ length: 32 }, (_, i) => 96 + i), durations: Array(32).fill(1060 / 32), loop: true };
  return meta;
};
const decodedPages = meta => meta.pages.map(page => ({ width: page.sourceSize[0], height: page.sourceSize[1] }));

test('v3 accepts a complete third gait page with128 registered whole poses', () => {
  const meta = gaitMetadata();
  assert.equal(validateWholeAtlas(decodedPages(meta), meta), true);
});

test('v3 rejects missing or malformed third gait pages before rendering', () => {
  const changes = [
    m => m.pages[2].rows = 6,
    m => m.frames[127].page = 3,
    m => m.frames[127].rect[1] = 1024,
    m => m.frames.pop(),
    m => m.pages[2].sourceSize[0]++,
    m => m.pages[2].asset = '',
  ];
  for (const change of changes) {
    const meta = gaitMetadata(), images = decodedPages(meta); change(meta);
    assert.throws(() => validateWholeAtlas(images, meta));
  }
  const meta = gaitMetadata();
  assert.throws(() => validateWholeAtlas(decodedPages(meta).slice(0, 2), meta));
});

test('32 equal gait phases retain the64px accepted stride and wrap continuously', () => {
  const meta = gaitMetadata(); delete meta.transitions;
  const controller = createWholeAnimationController({ species: 'cat', meta, random: () => 1 });
  const props = distance => ({ action: 'play', locomotion: { moving: true, facing: 1, distanceDip: distance, spriteSizeDip: 256, epoch: 1 } });
  controller.sample(props(0), 0);
  const samples = Array.from({ length: 32 }, (_, i) => controller.sample(props(i * 2 + .01), (i + 1) * 16));
  assert.deepEqual(samples.map(sample => sample.frame), Array.from({ length: 32 }, (_, i) => 96 + i));
  const wrapped = controller.sample(props(64.01), 1000);
  assert.equal(wrapped.frame, 96); assert.equal(wrapped.phase, 64.01 / 64);
  assert.equal(meta.clips.walk.durations.reduce((sum, value) => sum + value, 0), 1060);
});

for (const pet of PETS) {
  test(`${pet.id} production v3 gait preserves existing clips and uses32 distinct equal phases`, () => {
    const old = JSON.parse(readFileSync(new URL(`../public/pets/${pet.id}-whole-v2.json`, import.meta.url)));
    const meta = JSON.parse(readFileSync(new URL(`../public/pets/${pet.id}-whole-v3.json`, import.meta.url)));
    const images = meta.pages.map(page => {
      const bytes = readFileSync(new URL(`../public/${page.asset}`, import.meta.url));
      return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
    });
    assert.equal(meta.version, 3);assert.equal(validateWholeAtlas(images,meta), true);
    assert.deepEqual(meta.pages.slice(0,2),old.pages);
    assert.deepEqual(meta.frames.slice(0,96),old.frames);
    for(const name of Object.keys(old.clips).filter(name=>name!=='walk'))assert.deepEqual(meta.clips[name],old.clips[name]);
    assert.deepEqual(meta.transitions,old.transitions);assert.equal(meta.stride,old.stride);
    assert.deepEqual(meta.clips.walk.frames,Array.from({length:32},(_,i)=>96+i));
    assert.deepEqual(meta.clips.walk.durations,Array(32).fill(33.125));
    assert.equal(new Set(meta.frames.slice(96).map(frame=>JSON.stringify(frame.rect))).size,32);
  });
}
