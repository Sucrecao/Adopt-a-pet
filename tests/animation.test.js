import test from 'node:test';
import assert from 'node:assert/strict';
import { animationFrame, atlasPosition, CLIPS, turnPose, spriteBaselineOffset } from '../src/core/animation.js';

test('walking advances through eight distinct frames before looping', () => {
  const frames = Array.from({ length: 8 }, (_, i) => animationFrame({ walking: true, elapsed: i * 100 }).frame);
  assert.deepEqual(frames, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(animationFrame({ walking: true, elapsed: 800 }).frame, 0);
  assert.equal(animationFrame({ action: 'play', walking: true, elapsed: 300 }).clip, 'walk');
});

test('every frame resolves to a valid 6 by 4 atlas coordinate', () => {
  for (let frame = 0; frame < 24; frame++) {
    const position = atlasPosition(frame);
    assert.equal(position.column, frame % 6);
    assert.equal(position.row, Math.floor(frame / 6));
    assert.ok(position.x >= 0 && position.x <= 100);
    assert.ok(position.y >= 0 && position.y <= 100);
  }
});

test('one-shot stretch and trick finish while idle and walking loop', () => {
  for (const action of ['stretch', 'trick']) {
    assert.equal(animationFrame({ action, elapsed: 0 }).done, false);
    assert.equal(animationFrame({ action, elapsed: 4000 }).done, true);
    assert.equal(animationFrame({ action, elapsed: 4000 }).frame, CLIPS[action === 'trick' ? 'hop' : 'stretch'].frames.at(-1));
  }
  assert.equal(animationFrame({ elapsed: 99999 }).done, false);
});

test('rest and affection retain legacy poses and override walking', () => {
  const rest = animationFrame({ action: 'rest', walking: true, elapsed: 800 });
  assert.equal(rest.atlas, 'legacy');
  assert.equal(rest.frame, 3);
  assert.equal(rest.clip, 'rest');
  for (const action of ['pet', 'feed']) assert.equal(animationFrame({ action, walking: true }).frame, 5);
});

test('paused and reduced motion hold still and suppress ambient actions', () => {
  for (const stop of [{ paused: true }, { reducedMotion: true }]) {
    const first = animationFrame({ ...stop, walking: true, ambientAction: 'groom', elapsed: 0 });
    const later = animationFrame({ ...stop, walking: true, ambientAction: 'groom', elapsed: 8000 });
    assert.deepEqual(later, first);
    assert.equal(later.clip, 'idle');
    assert.equal(later.lift, 0);
  }
});

test('ambient actions yield immediately to walking and explicit actions', () => {
  assert.equal(animationFrame({ ambientAction: 'groom', elapsed: 300 }).clip, 'groom');
  assert.equal(animationFrame({ ambientAction: 'groom', walking: true }).clip, 'walk');
  assert.equal(animationFrame({ ambientAction: 'groom', action: 'stretch' }).clip, 'stretch');
});

test('turning keeps the baseline and switches facing only when the body is narrow', () => {
  assert.deepEqual(turnPose(1, 1, 90), { facing: 1, scale: 1 });
  assert.deepEqual(turnPose(1, -1, 0), { facing: 1, scale: 1 });
  assert.equal(turnPose(1, -1, 89).facing, 1);
  assert.equal(turnPose(1, -1, 90).facing, -1);
  assert.ok(turnPose(1, -1, 90).scale < .2);
  assert.deepEqual(turnPose(1, -1, 180), { facing: -1, scale: 1 });
});

test('idle holds neutral longer and blinks for only 120ms', () => {
  assert.equal(animationFrame({ elapsed: 2500 }).frame, 8);
  assert.equal(animationFrame({ elapsed: 2600 }).frame, 9);
  assert.equal(animationFrame({ elapsed: 3049 }).frame, 9);
  assert.equal(animationFrame({ elapsed: 3050 }).frame, 10);
  assert.equal(animationFrame({ elapsed: 3169 }).frame, 10);
  assert.equal(animationFrame({ elapsed: 3170 }).frame, 11);
  assert.equal(animationFrame({ elapsed: 3870 }).frame, 8);
});

test('idle and rest breathe gently without moving the feet and stop in quiet modes', () => {
  for (const action of ['idle', 'rest']) {
    const first = animationFrame({ action, elapsed: 0 });
    const middle = animationFrame({ action, elapsed: 2000 });
    assert.equal(first.scaleY, 1);
    assert.ok(middle.scaleY > 1 && middle.scaleY <= 1.008);
    assert.equal(first.lift, 0);
    assert.equal(middle.lift, 0);
    assert.equal(animationFrame({ action, elapsed: 2000, paused: true }).scaleY, 1);
    assert.equal(animationFrame({ action, elapsed: 2000, reducedMotion: true }).scaleY, 1);
  }
});

test('motion clips share a ground baseline while hop airtime and parrot flight are preserved', () => {
  const bottoms = { cat: [236,236,237,239,236,238,237,237,246,245,244,245,236,235,235,236,233,235,224,224,223,182,224,224], dog: [237,237,229,236,225,228,226,224,239,238,238,238,224,224,222,226,221,221,217,218,218,175,217,218] };
  for (const [species, baseline] of [['cat',246], ['dog',239]]) {
    for (let frame = 0; frame < 24; frame++) {
      const expected = frame === 21 ? baseline - (bottoms[species][20] - bottoms[species][21]) : baseline;
      assert.equal(bottoms[species][frame] + spriteBaselineOffset(species, frame), expected);
    }
  }
  for (let frame = 0; frame < 8; frame++) assert.equal(spriteBaselineOffset('parrot', frame), 0);
  assert.equal(spriteBaselineOffset('parrot', 21), spriteBaselineOffset('parrot', 20));
  assert.deepEqual(CLIPS.parrotStretch.frames, [16,17,16,15]);
  for (const elapsed of [0,650,1300,1950]) assert.ok(![18,19].includes(animationFrame({ species:'parrot', action:'stretch', elapsed }).frame));
});
