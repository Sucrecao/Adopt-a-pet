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

test('poses interpolate continuously inside a walking or slow action interval', () => {
  const walk = animationFrame({ walking: true, elapsed: 25 });
  assert.equal(walk.nextFrame, 1);
  assert.equal(walk.mix, .25);
  const stretch = animationFrame({ action: 'stretch', elapsed: 325 });
  assert.equal(stretch.frame, 16);
  assert.equal(stretch.nextFrame, 17);
  assert.equal(stretch.mix, .5);
});

test('loop neighbors wrap and completed one-shots hold their final pose', () => {
  const boundary = animationFrame({ walking: true, elapsed: 799 });
  assert.equal(boundary.frame, 7);
  assert.equal(boundary.nextFrame, 0);
  assert.ok(boundary.mix > .98 && boundary.mix < 1);
  const loop = animationFrame({ walking: true, elapsed: 800 });
  assert.equal(loop.mix, 0);
  assert.equal(loop.nextFrame, 1);
  const completed = animationFrame({ action: 'trick', elapsed: 2800 });
  assert.equal(completed.nextFrame, 23);
  assert.equal(completed.mix, 0);
  assert.equal(completed.done, true);
});

const controllerModule = await import('../src/core/animation.js');
function controller(options) {
  assert.equal(typeof controllerModule.createAnimationController, 'function', 'persistent animation controller exists');
  return controllerModule.createAnimationController(options);
}

test('turns and harmless updates keep the walking phase', () => {
  const playback = controller({ species: 'cat', random: () => .5 });
  playback.sample({ walking: true, facing: 1 }, 1000);
  const before = playback.sample({ walking: true, facing: 1 }, 1125);
  const turning = playback.sample({ walking: true, facing: -1, size: 250 }, 1150);
  assert.equal(before.frame, 1);
  assert.equal(turning.frame, 1);
  assert.equal(turning.mix, .5);
  assert.equal(turning.sequence, before.sequence);
  assert.equal(playback.sample({ walking: true, facing: -1 }, 1240).facing, -1);
});

test('pause freezes the clip clock and resume continues from its held pose', () => {
  const playback = controller({ species: 'dog', random: () => .5 });
  playback.sample({ walking: true }, 0);
  const held = playback.sample({ walking: true, paused: true }, 125);
  const paused = playback.sample({ walking: true, paused: true }, 9125);
  assert.equal(paused.frame, held.frame);
  assert.equal(paused.mix, held.mix);
  const resumed = playback.sample({ walking: true }, 9125);
  assert.equal(resumed.frame, 1);
  assert.equal(resumed.mix, .25);
  assert.equal(playback.sample({ walking: true }, 9175).mix, .75);
});

test('ambient scheduling survives facing changes and resumes idle after its one-shot', () => {
  const playback = controller({ species: 'cat', random: () => 0 });
  playback.sample({ facing: 1 }, 0);
  playback.sample({ facing: -1 }, 6000);
  assert.equal(playback.sample({ facing: -1 }, 6500).clip, 'groom');
  assert.equal(playback.sample({ facing: 1 }, 8700).clip, 'idle');
});

test('a repeated explicit action starts a new sequence while walking tokens do not reset gait', () => {
  const playback = controller({ species: 'cat', random: () => .5 });
  const first = playback.sample({ action: 'stretch', actionStartedAt: 1 }, 0);
  assert.equal(playback.sample({ action: 'stretch', actionStartedAt: 1 }, 325).mix, .5);
  const repeated = playback.sample({ action: 'stretch', actionStartedAt: 2 }, 350);
  assert.equal(repeated.mix, 0);
  assert.notEqual(repeated.sequence, first.sequence);
  playback.sample({ walking: true, actionStartedAt: 2 }, 500);
  assert.equal(playback.sample({ walking: true, actionStartedAt: 3 }, 650).mix, .5);
});

for (const mode of ['paused', 'reducedMotion']) {
  test(`${mode} settles a turn so resume cannot reverse the displayed facing`, () => {
    const playback = controller({ species: 'cat', random: () => .5 });
    playback.sample({ walking: true, facing: 1 }, 0);
    playback.sample({ walking: true, facing: -1 }, 100);
    const quiet = playback.sample({ walking: true, facing: -1, [mode]: true }, 125);
    assert.equal(quiet.facing, -1);
    assert.equal(quiet.scale, 1);
    const resumed = playback.sample({ walking: true, facing: -1 }, 9125);
    assert.equal(resumed.facing, quiet.facing);
    assert.equal(resumed.scale, 1);
    assert.equal(resumed.elapsed, quiet.elapsed);
    assert.equal(resumed.sequence, quiet.sequence);
  });

  test(`a facing change while ${mode} stays settled on resume`, () => {
    const playback = controller({ species: 'cat', random: () => .5 });
    playback.sample({ facing: 1, [mode]: true }, 0);
    const quiet = playback.sample({ facing: -1, [mode]: true }, 125);
    assert.equal(quiet.facing, -1);
    assert.equal(quiet.scale, 1);
    const resumed = playback.sample({ facing: -1 }, 9125);
    assert.equal(resumed.facing, quiet.facing);
    assert.equal(resumed.scale, 1);
    assert.equal(resumed.elapsed, quiet.elapsed);
    assert.equal(resumed.sequence, quiet.sequence);
  });
}
