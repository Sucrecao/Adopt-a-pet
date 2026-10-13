import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopSpriteSize, gaitSpeedDip } from '../src/core/gait.js';

test('native sprite normalizer uses the actual padded overlay content width', () => {
  assert.equal(desktopSpriteSize(340), 249.28);
  assert.equal(desktopSpriteSize(272), 197.6);
});

for (const [species, stride, speed] of [['cat',96,42],['dog',112,58],['parrot',80,85]]) {
  test(`${species} walk cadence is stable across pet sizes and preview surfaces`, () => {
    const baseline = speed * 256 / desktopSpriteSize(340) / stride;
    for (const size of [168, desktopSpriteSize(272), desktopSpriteSize(340), desktopSpriteSize(408)]) {
      assert.ok(Math.abs(gaitSpeedDip(species, 'idle', size) * 256 / size / stride - baseline) < 1e-12);
      assert.ok(Math.abs(gaitSpeedDip(species, 'play', size) * 256 / size / stride - baseline * 1.7) < 1e-12);
    }
    assert.ok(baseline > 0 && baseline * 1.7 < 1.9);
  });
}
