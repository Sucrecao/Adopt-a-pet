import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../src/core/whole-animation.js').catch(() => ({}));
const create = options => {
  assert.equal(typeof module.createWholeAnimationController, 'function', 'whole-character playback controller exists');
  return module.createWholeAnimationController({ random: () => 1, ...options });
};
const motion = (distanceDip = 0, extra = {}) => ({ epoch: 1, distanceDip, spriteSizeDip: 256, facing: 1, moving: true, ...extra });
const sampleMotion = (controller, distance, now, extra = {}, props = {}) => controller.sample({ ...props, locomotion: motion(distance, extra) }, now);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('idle follows the calm native six-frame timing and loops at 6.6 seconds', () => {
  const c = create(); c.sample({}, 0);
  for (const [now, frame] of [[1679,0],[1680,1],[2339,1],[2340,2],[2999,2],[3000,3],[3839,3],[3840,4],[4679,4],[4680,5],[6599,5],[6600,0]]) {
    const pose = c.sample({}, now); assert.equal(pose.frame, frame); assert.equal(pose.clip, 'idle');
  }
});

test('walking takes one eight-frame cycle per 64 accepted pixels, independently of time', () => {
  const c = create(); sampleMotion(c, 0, 0);
  const frames = [];
  for (let i = 0; i < 8; i++) frames.push(sampleMotion(c, i * 8, i * 10).frame);
  assert.deepEqual(frames, [8,9,10,11,12,13,14,15]);
  const held = sampleMotion(c, 56, 20000); assert.equal(held.frame, 15); near(held.phase, 56 / 64);
  const wrapped = sampleMotion(c, 64, 20001); assert.equal(wrapped.frame, 8); near(wrapped.phase, 1);
});

test('metadata stride and sprite size normalize walking displacement', () => {
  const c = create({ meta: { stride: 80 } });
  sampleMotion(c, 0, 0, { spriteSizeDip: 128 });
  near(sampleMotion(c, 20, 100, { spriteSizeDip: 128 }).phase, .5);
});

test('epoch and size changes rebase telemetry without advancing gait', () => {
  const c = create(); sampleMotion(c, 0, 0); const before = sampleMotion(c, 16, 10);
  const rebased = sampleMotion(c, 10000, 20, { epoch: 2 }); near(rebased.phase, before.phase); assert.equal(rebased.frame, before.frame);
  near(sampleMotion(c, 10008, 30, { epoch: 2 }).phase, .375);
  near(sampleMotion(c, 11000, 40, { epoch: 2, spriteSizeDip: 128 }).phase, .375);
  near(sampleMotion(c, 11004, 50, { epoch: 2, spriteSizeDip: 128 }).phase, .5);
});

test('a final arrival delta completes the stride, and later stationary telemetry cannot advance it', () => {
  const c = create(); sampleMotion(c, 0, 0); sampleMotion(c, 60, 20);
  near(sampleMotion(c, 64, 30, { moving: false }).phase, 1);
  near(sampleMotion(c, 500, 40, { moving: false }).phase, 1);
});

for (const mode of [{ paused: true }, { reducedMotion: true }, { ambient: false }, { dragging: true }]) {
  const name = Object.keys(mode)[0];
  test(`${name} freezes exact walking frame and consumes distance before resuming`, () => {
    const c = create(); sampleMotion(c, 0, 0); const before = sampleMotion(c, 16, 100);
    const props = name === 'dragging' ? {} : mode;
    const extra = name === 'dragging' ? mode : {};
    const held = sampleMotion(c, 100, 200, { ...extra, facing: -1 }, props);
    const later = sampleMotion(c, 900, 5000, { ...extra, facing: -1 }, props);
    for (const key of ['frame','clip','facing','elapsed','phase','sequence','sampleTime']) { assert.equal(held[key], before[key]); assert.equal(later[key], before[key]); }
    assert.equal(later.stopped, true);
    const resumed = sampleMotion(c, 900, 5000); near(resumed.phase, before.phase); assert.equal(resumed.frame, before.frame);
    near(sampleMotion(c, 908, 5010).phase, .375);
  });
}

test('right to left plays the intact row for exactly 800ms and settles facing left', () => {
  const c = create(); sampleMotion(c, 0, 0, { moving: false });
  for (let i = 0; i < 8; i++) {
    const pose = sampleMotion(c, 0, 100 + i * 100, { moving: false, facing: -1 });
    assert.equal(pose.clip, 'turn'); assert.equal(pose.frame, 16 + i); assert.equal(pose.facing, 1); assert.equal(pose.targetFacing, -1);
    assert.equal(pose.turning, true); assert.equal(pose.turnRemaining, 800 - i * 100);
  }
  const settled = sampleMotion(c, 0, 900, { moving: false, facing: -1 });
  assert.equal(settled.turning, false); assert.equal(settled.turnRemaining, 0); assert.equal(settled.facing, -1); assert.equal(settled.clip, 'idle');
});

test('accepted movement after a scheduler turn settles delayed playback without losing the first distance packet', () => {
  const c = create(); sampleMotion(c, 0, 0); const before = sampleMotion(c, 16, 100);
  // The scheduler begins its 800ms hold at 100ms; its facing packet reaches
  // the display one frame later, so the local turn clock ends at 916ms.
  const start = sampleMotion(c, 16, 116, { moving: false, facing: -1 });
  assert.equal(start.turnRemaining, 800); assert.equal(start.phase, before.phase);
  sampleMotion(c, 16, 884, { moving: false, facing: -1 });
  const resumed = sampleMotion(c, 16.076, 900, { moving: true, facing: -1 });
  assert.equal(resumed.clip, 'walk'); assert.equal(resumed.turning, false); assert.equal(resumed.turnRemaining, 0); assert.equal(resumed.facing, -1);
  near(resumed.phase - before.phase, .076 / 64);
  const later = sampleMotion(c, 24, 916, { moving: true, facing: -1 });
  near(later.phase - before.phase, (24 - 16) / 64);
});

test('parrot flight mirrors immediately on reversal without a grounded turn or stalled wingbeats', () => {
  const c = create({ species: 'parrot' }); sampleMotion(c, 0, 0);
  const before = sampleMotion(c, 8, 100);
  const reversed = sampleMotion(c, 16, 200, { facing: -1 });
  assert.equal(reversed.clip, 'walk'); assert.equal(reversed.facing, -1); assert.equal(reversed.turning, false);
  assert.equal(reversed.turnRemaining, 0); assert.equal(reversed.sequence, before.sequence); near(reversed.phase, .25);
});

test('left to right mirrors the whole turn row and holds the same frame through pause', () => {
  const c = create(); sampleMotion(c, 0, 0, { moving: false, facing: -1 });
  sampleMotion(c, 0, 100, { moving: false }); const before = sampleMotion(c, 0, 400, { moving: false });
  assert.equal(before.frame, 19); assert.equal(before.facing, -1); assert.equal(before.turnRemaining, 500);
  const held = sampleMotion(c, 0, 1000, { moving: false }, { paused: true });
  const later = sampleMotion(c, 0, 9000, { moving: false }, { paused: true });
  for (const key of ['frame','facing','elapsed','turnRemaining']) { assert.equal(held[key], before[key]); assert.equal(later[key], before[key]); }
  const resumed = sampleMotion(c, 0, 9000, { moving: false }); assert.equal(resumed.frame, before.frame);
  const settled = sampleMotion(c, 0, 9500, { moving: false }); assert.equal(settled.turning, false); assert.equal(settled.facing, 1);
});

test('explicit care interrupts walking, repeats by token, and holds a one-shot final whole pose', () => {
  const c = create(); sampleMotion(c, 0, 0);
  const p = { action: 'pet', actionStartedAt: 1900000000000 };
  const start = sampleMotion(c, 16, 100, {}, p); assert.equal(start.frame, 24); assert.equal(start.clip, 'pet'); near(start.phase, 0);
  assert.equal(sampleMotion(c, 32, 1000, {}, p).frame, 26);
  const final = sampleMotion(c, 48, 5000, {}, p); assert.equal(final.frame, 27); assert.equal(final.done, true);
  const repeated = sampleMotion(c, 64, 5100, {}, { ...p, actionStartedAt: p.actionStartedAt + 1 });
  assert.equal(repeated.frame, 24); assert.equal(repeated.elapsed, 0); assert.notEqual(repeated.sequence, start.sequence);
  const walking = sampleMotion(c, 64, 5200); assert.equal(walking.clip, 'walk'); near(walking.phase, 0);
  near(sampleMotion(c, 72, 5300).phase, .125);
});

test('actionElapsed seeds explicit clips without mixing timestamp domains or restarting on updates', () => {
  const c = create(); const p = { action: 'stretch', actionStartedAt: 1900000000000, actionElapsed: 600 };
  const first = c.sample(p, 20); assert.equal(first.elapsed, 600); assert.equal(first.frame, 37);
  const second = c.sample({ ...p, actionElapsed: 0, facing: 1 }, 120); assert.equal(second.elapsed, 700); assert.equal(second.sequence, first.sequence);
});

test('care pauses an unfinished turn and returning to idle resumes its remaining hold', () => {
  const c = create(); sampleMotion(c, 0, 0, { moving: false });
  sampleMotion(c, 0, 100, { moving: false, facing: -1 }); const before = sampleMotion(c, 0, 300, { moving: false, facing: -1 });
  const care = { action: 'feed', actionStartedAt: 1 };
  const feeding = sampleMotion(c, 0, 400, { moving: false, facing: -1 }, care); assert.equal(feeding.clip, 'feed'); assert.equal(feeding.turnRemaining, before.turnRemaining);
  assert.equal(sampleMotion(c, 0, 4000, { moving: false, facing: -1 }, care).turnRemaining, 600);
  const resumed = sampleMotion(c, 0, 5000, { moving: false, facing: -1 }); assert.equal(resumed.frame, before.frame); assert.equal(resumed.turnRemaining, 600);
  const settled = sampleMotion(c, 0, 5600, { moving: false, facing: -1 }); assert.equal(settled.turning, false); assert.equal(settled.facing, -1);
});

test('automatic ambient care returns to idle and yields immediately to a reversal', () => {
  const c = create({ random: () => 0 }); sampleMotion(c, 0, 0, { moving: false });
  const groom = sampleMotion(c, 0, 6500, { moving: false }); assert.equal(groom.clip, 'groom');
  assert.equal(sampleMotion(c, 0, 8200, { moving: false }).clip, 'idle');
  assert.equal(sampleMotion(c, 0, 14700, { moving: false }).clip, 'groom');
  const turn = sampleMotion(c, 0, 14800, { moving: false, facing: -1 }); assert.equal(turn.clip, 'turn'); assert.equal(turn.turnRemaining, 800);
  assert.equal(sampleMotion(c, 0, 15600, { moving: false, facing: -1 }).turning, false);
});

test('explicit care restarts when it matches the currently playing automatic clip', () => {
  const c = create({ random: () => 0 }); c.sample({}, 0); c.sample({}, 6500);
  const automatic = c.sample({}, 6900); assert.equal(automatic.clip, 'groom'); assert.equal(automatic.frame, 33);
  const explicit = c.sample({ action: 'groom', actionStartedAt: 1 }, 7000);
  assert.equal(explicit.frame, 32); assert.equal(explicit.elapsed, 0); assert.notEqual(explicit.sequence, automatic.sequence);
});

test('custom clip timing is respected and invalid frame selections are rejected', () => {
  const c = create({ meta: { clips: { idle: { frames: [2,3], durations: [100,200], loop: true } } } }); c.sample({}, 0);
  assert.equal(c.sample({}, 100).frame, 3); assert.equal(c.sample({}, 300).frame, 2);
  assert.throws(() => create({ meta: { clips: { idle: { frames: [48], durations: [100], loop: true } } } }), /frame/i);
  assert.throws(() => create({ meta: { clips: { idle: { frames: [0,1], durations: [100], loop: true } } } }), /duration/i);
});

const denseMeta = () => {
  const clip = (first, count, total, loop = false) => ({ frames: Array.from({ length: count }, (_, i) => first + i), durations: Array(count).fill(total / count), loop });
  return { version: 2, frames: Array(96).fill({}), clips: {
    idle: clip(0, 12, 6600, true), rest: clip(12, 4, 5600, true), walk: clip(16, 16, 1060, true), turn: clip(32, 16, 800),
    pet: clip(48, 8, 2400), feed: clip(56, 8, 1600, true), groom: clip(64, 8, 1700), stretch: clip(72, 8, 2600), hop: clip(80, 10, 2800),
  }, transitions: {
    walk: { enter: { frames: [95,94], durations: [60,60] }, exit: { frames: [94,95], durations: [60,60] } },
    rest: { enter: { frames: [90,91,92,93], durations: [100,100,100,100] }, exit: { frames: [93,92,91,90], durations: [100,100,100,100] } },
  } };
};

test('v2 walks through authored neutral poses while accepting every displacement delta', () => {
  const c = create({ meta: denseMeta() }); sampleMotion(c, 0, 0, { moving: false });
  const entering = sampleMotion(c, 0, 100); assert.equal(entering.clip, 'walk'); assert.equal(entering.frame, 95);
  const middle = sampleMotion(c, 4, 160); assert.equal(middle.frame, 94); near(middle.phase, 4 / 64);
  const walking = sampleMotion(c, 8, 220); assert.equal(walking.frame, 18); near(walking.phase, .125);
  const held = sampleMotion(c, 8, 10000); assert.equal(held.frame, walking.frame); near(held.phase, walking.phase);
  const exiting = sampleMotion(c, 64, 10010, { moving: false }); assert.equal(exiting.clip, 'idle'); assert.equal(exiting.frame, 94); near(exiting.phase, 1);
  assert.equal(sampleMotion(c, 64, 10070, { moving: false }).frame, 95);
  assert.equal(sampleMotion(c, 64, 10130, { moving: false }).frame, 0);
});

test('v2 rest enters and wakes with whole frames while retaining destination clip telemetry', () => {
  const c = create({ meta: denseMeta() }); c.sample({}, 0);
  const rest = { action: 'rest', actionStartedAt: 1 };
  for (const [now, frame] of [[100,90],[200,91],[300,92],[400,93],[500,12]]) {
    const pose = c.sample(rest, now); assert.equal(pose.frame, frame); assert.equal(pose.clip, 'rest');
  }
  for (const [now, frame] of [[600,93],[700,92],[800,91],[900,90],[1000,0]]) {
    const pose = c.sample({}, now); assert.equal(pose.frame, frame); assert.equal(pose.clip, 'idle');
  }
});

test('v2 bridge freezes exactly and discards paused travel before resuming', () => {
  const c = create({ meta: denseMeta() }); sampleMotion(c, 0, 0, { moving: false });
  sampleMotion(c, 0, 100); const before = sampleMotion(c, 4, 160);
  const held = sampleMotion(c, 100, 500, {}, { paused: true });
  const later = sampleMotion(c, 200, 5000, {}, { paused: true });
  for (const key of ['frame','facing','elapsed','phase','sequence']) { assert.equal(held[key], before[key]); assert.equal(later[key], before[key]); }
  const resumed = sampleMotion(c, 200, 5000); assert.equal(resumed.frame, before.frame); near(resumed.phase, before.phase);
  const walk = sampleMotion(c, 204, 5060); assert.equal(walk.frame, 18); near(walk.phase, .125);
});

test('new care, reversal and accepted walking supersede obsolete bridges immediately', () => {
  const c = create({ meta: denseMeta() }); c.sample({}, 0);
  c.sample({ action: 'rest', actionStartedAt: 1 }, 100);
  assert.equal(c.sample({ action: 'pet', actionStartedAt: 2 }, 200).frame, 48);
  const repeatedRest = c.sample({ action: 'rest', actionStartedAt: 3 }, 300); assert.equal(repeatedRest.frame, 90);
  c.sample({ action: 'rest', actionStartedAt: 3 }, 700);
  assert.equal(sampleMotion(c, 0, 800, { moving: false }).frame, 93);
  const moving = sampleMotion(c, 4, 850); assert.equal(moving.clip, 'walk'); assert.equal(moving.frame, 93); near(moving.phase, 4 / 64);
  const reversal = sampleMotion(c, 4, 900, { moving: false, facing: -1 }); assert.equal(reversal.clip, 'turn'); assert.equal(reversal.frame, 32); assert.equal(reversal.turnRemaining, 800);
});

test('v2 turn retains sixteen distinct poses inside the native 800ms hold', () => {
  const c = create({ meta: denseMeta() }); sampleMotion(c, 0, 0, { moving: false });
  for (let i = 0; i < 16; i++) {
    const pose = sampleMotion(c, 0, 100 + i * 50, { moving: false, facing: -1 });
    assert.equal(pose.frame, 32 + i); assert.equal(pose.turnRemaining, 800 - i * 50);
  }
  assert.equal(sampleMotion(c, 0, 900, { moving: false, facing: -1 }).facing, -1);
});

test('parrot preserves its takeoff bridge until an actual reversal and mirrors immediately', () => {
  const c = create({ species: 'parrot', meta: denseMeta() }); sampleMotion(c, 0, 0, { moving: false });
  assert.equal(sampleMotion(c, 0, 100).frame, 95);
  assert.equal(sampleMotion(c, 4, 160).frame, 94);
  const reversed = sampleMotion(c, 8, 180, { facing: -1 });
  assert.equal(reversed.clip, 'walk'); assert.equal(reversed.frame, 18); assert.equal(reversed.facing, -1); assert.equal(reversed.turning, false); near(reversed.phase, .125);
});

test('late rest mounts seed the sleep bridge and invalid transition tracks are rejected', () => {
  const c = create({ meta: denseMeta() });
  assert.equal(c.sample({ action: 'rest', actionStartedAt: 1, actionElapsed: 200 }, 0).frame, 92);
  assert.equal(c.sample({ action: 'rest', actionStartedAt: 1 }, 200).frame, 12);
  for (const change of [m => m.transitions.walk.enter.frames[0] = 96, m => m.transitions.rest.exit.durations.pop(), m => m.transitions.walk.exit.durations[0] = 0]) {
    const meta = denseMeta(); change(meta); assert.throws(() => create({ meta }), /transition/i);
  }
});

test('the first accepted movement after explicit care advances gait without queuing a stale wake', () => {
  const c = create({ meta: denseMeta() }); sampleMotion(c, 0, 0, { moving: false });
  sampleMotion(c, 0, 100, { moving: false }, { action: 'rest', actionStartedAt: 1 });
  sampleMotion(c, 0, 500, { moving: false }, { action: 'rest', actionStartedAt: 1 });
  const resumed = sampleMotion(c, 4, 600);
  assert.equal(resumed.clip, 'walk'); assert.equal(resumed.frame, 93); near(resumed.phase, 4 / 64);
  const walking = sampleMotion(c, 8, 1120); assert.equal(walking.frame, 18); near(walking.phase, 8 / 64);
});

test('partial sleep bridges reverse from the exact last whole pose and its elapsed dwell', () => {
  const c=create({meta:denseMeta()});c.sample({},0);const rest={action:'rest',actionStartedAt:1};
  c.sample(rest,100);assert.equal(c.sample(rest,250).frame,91);
  const wake=c.sample({},251);assert.equal(wake.clip,'idle');assert.equal(wake.frame,91);
  assert.equal(c.sample({},300).frame,91);assert.equal(c.sample({},301).frame,90);assert.equal(c.sample({},401).frame,0);
  c.sample({...rest,actionStartedAt:2},500);c.sample({...rest,actionStartedAt:2},900);
  c.sample({},1000);assert.equal(c.sample({},1150).frame,92);
  const sleeping=c.sample({...rest,actionStartedAt:3},1151);assert.equal(sleeping.clip,'rest');assert.equal(sleeping.frame,92);
  assert.equal(c.sample({...rest,actionStartedAt:3},1201).frame,93);assert.equal(c.sample({...rest,actionStartedAt:3},1301).frame,12);
});

test('partial locomotion bridges reverse through their shared whole pose without dropping distance', () => {
  const c=create({meta:denseMeta()});sampleMotion(c,0,0,{moving:false});sampleMotion(c,0,100);
  assert.equal(sampleMotion(c,2,130).frame,95);
  const stopped=sampleMotion(c,2,131,{moving:false});assert.equal(stopped.clip,'idle');assert.equal(stopped.frame,95);
  assert.equal(sampleMotion(c,2,161,{moving:false}).frame,0);
  sampleMotion(c,2,200);sampleMotion(c,8,320);
  assert.equal(sampleMotion(c,8,330,{moving:false}).frame,94);sampleMotion(c,8,350,{moving:false});
  const restarted=sampleMotion(c,12,351);assert.equal(restarted.clip,'walk');assert.equal(restarted.frame,94);near(restarted.phase,12/64);
  const walking=sampleMotion(c,12,371);assert.equal(walking.frame,19);near(walking.phase,12/64);
});

for(const version of [1,2]) {
  test(`v${version} ending a long walk resets ambient eligibility and retains the final arrival delta`,()=>{
    const c=create({random:()=>0,...(version===2?{meta:denseMeta()}:{})});sampleMotion(c,0,0,{moving:false});
    sampleMotion(c,0,100);sampleMotion(c,300,7000);
    const stopped=sampleMotion(c,304,7010,{moving:false});assert.equal(stopped.clip,'idle');near(stopped.phase,304/64);
    if(version===2){assert.equal(stopped.frame,94);assert.equal(stopped.transition,'walk.exit');assert.equal(sampleMotion(c,304,7070,{moving:false}).frame,95);}
    assert.equal(sampleMotion(c,304,7130,{moving:false}).clip,'idle');
    assert.equal(sampleMotion(c,304,13509,{moving:false}).clip,'idle');
    assert.equal(sampleMotion(c,304,13510,{moving:false}).clip,'groom');
  });
}

test('care and turn completion also begin a fresh idle interval before ambient gestures',()=>{
  const c=create({random:()=>0,meta:denseMeta()});sampleMotion(c,0,0,{moving:false});
  sampleMotion(c,0,100,{moving:false},{action:'pet',actionStartedAt:1});
  sampleMotion(c,0,8000,{moving:false},{action:'pet',actionStartedAt:1});
  assert.equal(sampleMotion(c,0,8010,{moving:false}).clip,'idle');
  sampleMotion(c,0,9000,{moving:false,facing:-1});assert.equal(sampleMotion(c,0,9800,{moving:false,facing:-1}).clip,'idle');
  assert.equal(sampleMotion(c,0,16299,{moving:false,facing:-1}).clip,'idle');
  assert.equal(sampleMotion(c,0,16300,{moving:false,facing:-1}).clip,'groom');
});

test('sleep to walking joins authored wake and walk entry in one destination track with exact gait distance',()=>{
  const c=create({meta:denseMeta()});sampleMotion(c,0,0,{moving:false});const rest={action:'rest',actionStartedAt:1};
  sampleMotion(c,0,100,{moving:false},rest);assert.equal(sampleMotion(c,0,500,{moving:false},rest).frame,12);
  for(const [time,frame,distance] of [[600,93,4],[700,92,8],[800,91,12],[900,90,16],[1000,95,20],[1060,94,24],[1120,23,28]]) {
    const pose=sampleMotion(c,distance,time);assert.equal(pose.clip,'walk');assert.equal(pose.frame,frame);near(pose.phase,distance/64);
  }
  assert.equal(sampleMotion(c,28,1121).transition,'');
});

test('partial sleep entry or wake continues from its visible pose before walking, with newer actions still taking priority',()=>{
  const c=create({meta:denseMeta()});sampleMotion(c,0,0,{moving:false});const rest={action:'rest',actionStartedAt:1};
  sampleMotion(c,0,100,{moving:false},rest);assert.equal(sampleMotion(c,0,250,{moving:false},rest).frame,91);
  assert.equal(sampleMotion(c,4,251).frame,91);assert.equal(sampleMotion(c,8,301).frame,90);
  assert.equal(sampleMotion(c,12,401).frame,95);assert.equal(sampleMotion(c,16,461).frame,94);
  assert.equal(sampleMotion(c,20,521).frame,21);near(sampleMotion(c,20,522).phase,20/64);
  sampleMotion(c,20,600,{moving:false},rest);sampleMotion(c,20,1000,{moving:false},rest);
  sampleMotion(c,20,1100,{moving:false});const waking=sampleMotion(c,20,1250,{moving:false});assert.equal(waking.frame,92);
  const moving=sampleMotion(c,24,1251);assert.equal(moving.clip,'walk');assert.equal(moving.frame,92);near(moving.phase,24/64);
  const care=sampleMotion(c,28,1300,{}, {action:'pet',actionStartedAt:2});assert.equal(care.clip,'pet');assert.equal(care.frame,48);near(care.phase,24/64);
  const reverse=create({meta:denseMeta()});sampleMotion(reverse,0,0,{moving:false});sampleMotion(reverse,0,100,{moving:false},rest);sampleMotion(reverse,0,500,{moving:false},rest);
  sampleMotion(reverse,4,600);const turn=sampleMotion(reverse,4,650,{moving:false,facing:-1});assert.equal(turn.clip,'turn');assert.equal(turn.turnRemaining,800);assert.equal(turn.frame,32);
});

const flowMeta = () => {
  const meta = denseMeta();
  meta.version = 4;
  meta.frames = Array(128).fill({});
  meta.flow = { version: 1, size: 32, frameSize: 256, encoding: 'signed-one-pixel-rgba', pairs: [[90,91],[91,92],[92,93],[93,12],[90,0],[90,95]], asset: '/pets/test-whole-flow.bin' };
  meta.clips.walk = { frames: Array.from({ length: 32 }, (_, i) => 96 + i), durations: Array(32).fill(1060 / 32), loop: true };
  meta.clips.pet.durations = [180,220,320,480,480,320,220,180];
  return meta;
};
const interval = (pose, frame, nextFrame, mix) => {
  assert.equal(pose.frame, frame);
  assert.equal(pose.nextFrame, nextFrame);
  assert.ok(Number.isFinite(pose.mix));
  near(pose.mix, mix);
};

test('flow opt-in samples quarter and half intervals without changing legacy metadata', () => {
  const c = create({ meta: flowMeta() }); c.sample({}, 0);
  interval(c.sample({}, 137.5), 0, 1, .25);
  interval(c.sample({}, 275), 0, 1, .5);
  interval(c.sample({}, 550), 1, 2, 0);
  const legacy = create({ meta: denseMeta() }); legacy.sample({}, 0);
  const discrete = legacy.sample({}, 275);
  assert.equal(discrete.frame, 0);
  assert.equal(discrete.nextFrame, undefined);
  assert.equal(discrete.mix, undefined);
});

test('flow loops interpolate their last pose to the first without extending a cycle', () => {
  const idle = create({ meta: flowMeta() }); idle.sample({}, 0);
  interval(idle.sample({}, 6325), 11, 0, .5);
  interval(idle.sample({}, 6600), 0, 1, 0);
  const feed = create({ meta: flowMeta() }); const care = { action: 'feed', actionStartedAt: 1 };
  feed.sample(care, 0);
  interval(feed.sample(care, 1550), 63, 56, .75);
  interval(feed.sample(care, 1600), 56, 57, 0);
  interval(feed.sample(care, 3200), 56, 57, 0);
  const rest = create({ meta: flowMeta() }); const sleeping = { action: 'rest', actionStartedAt: 1 };
  rest.sample(sleeping, 0);
  interval(rest.sample(sleeping, 400 + 4900), 15, 12, .5);
  interval(rest.sample(sleeping, 400 + 5600), 12, 13, 0);
});

test('every nonwalking clip exposes interpolation and each one-shot keeps its terminal dwell', () => {
  const meta = flowMeta();
  for (const name of ['pet','feed','groom','stretch','hop']) {
    const track = meta.clips[name];
    const c = create({ meta }); const care = { action: name === 'hop' ? 'trick' : name, actionStartedAt: 1 };
    c.sample(care, 0);
    interval(c.sample(care, track.durations[0] / 2), track.frames[0], track.frames[1], .5);
    if (!track.loop) {
      const total = track.durations.reduce((sum, time) => sum + time, 0);
      const last = track.frames.at(-1);
      const terminal = c.sample(care, total - track.durations.at(-1) + 1);
      interval(terminal, last, last, 0); assert.equal(terminal.done, false);
      const done = c.sample(care, total);
      interval(done, last, last, 0); assert.equal(done.done, true);
      interval(c.sample(care, total + 10000), last, last, 0);
    }
  }
});

for (const mode of [{ paused: true }, { reducedMotion: true }, { ambient: false }, { dragging: true }]) {
  test(`flow ${Object.keys(mode)[0]} freezes the exact interpolated care pose and resumes without catchup`, () => {
    const c = create({ meta: flowMeta() }); const care = { action: 'pet', actionStartedAt: 1 };
    sampleMotion(c, 0, 0, { moving: false }, care);
    const before = sampleMotion(c, 0, 90, { moving: false }, care); interval(before, 48, 49, .5);
    const props = mode.dragging ? care : { ...care, ...mode };
    const extra = mode.dragging ? mode : {};
    for (const time of [500,5000]) {
      const held = sampleMotion(c, 100, time, { ...extra, facing: -1 }, props);
      for (const key of ['frame','nextFrame','mix','facing','elapsed','phase','sequence','sampleTime']) assert.equal(held[key], before[key]);
      assert.equal(held.stopped, true);
    }
    interval(sampleMotion(c, 100, 5000, { moving: false }, care), 48, 49, .5);
    interval(sampleMotion(c, 100, 5045, { moving: false }, care), 48, 49, .75);
  });
}

test('flow turn interpolates fifteen edges inside the same native 800ms hold', () => {
  const c = create({ meta: flowMeta() }); sampleMotion(c, 0, 0, { moving: false });
  sampleMotion(c, 0, 100, { moving: false, facing: -1 });
  for (let i = 0; i < 16; i++) {
    const pose = sampleMotion(c, 0, 125 + i * 50, { moving: false, facing: -1 });
    interval(pose, 32 + i, Math.min(47, 33 + i), i === 15 ? 0 : .5);
    assert.equal(pose.turnRemaining, 775 - i * 50); assert.equal(pose.facing, 1);
  }
  const settled = sampleMotion(c, 0, 900, { moving: false, facing: -1 });
  assert.equal(settled.turning, false); assert.equal(settled.turnRemaining, 0); assert.equal(settled.facing, -1);
  const delayed = create({ meta: flowMeta() }); sampleMotion(delayed, 0, 0, { moving: false });
  sampleMotion(delayed, 0, 117, { moving: false, facing: -1 });
  const moving = sampleMotion(delayed, .08, 909, { facing: -1 });
  assert.equal(moving.turning, false); near(moving.phase, .08 / 64); interval(moving, 95, 95, 0);
});

test('flow care preserves a paused partial turn, repeated tokens restart only the requested care', () => {
  const c = create({ meta: flowMeta() }); sampleMotion(c, 0, 0, { moving: false });
  sampleMotion(c, 0, 100, { moving: false, facing: -1 });
  const turn = sampleMotion(c, 0, 175, { moving: false, facing: -1 }); interval(turn, 33, 34, .5);
  const care = { action: 'pet', actionStartedAt: 1 };
  sampleMotion(c, 0, 200, { moving: false, facing: -1 }, care);
  const petted = sampleMotion(c, 0, 290, { moving: false, facing: -1 }, care); interval(petted, 48, 49, .5);
  const repeated = sampleMotion(c, 0, 300, { moving: false, facing: -1 }, { ...care, actionStartedAt: 2 });
  interval(repeated, 48, 49, 0); assert.notEqual(repeated.sequence, petted.sequence);
  const resumed = sampleMotion(c, 0, 5000, { moving: false, facing: -1 });
  interval(resumed, 33, 34, .5); assert.equal(resumed.turnRemaining, turn.turnRemaining);
  assert.equal(sampleMotion(c, 0, 5725, { moving: false, facing: -1 }).turning, false);
});

test('flow sleep bridges interpolate their last authored pose to the destination endpoint', () => {
  const c = create({ meta: flowMeta() }); c.sample({}, 0); const rest = { action: 'rest', actionStartedAt: 1 };
  c.sample(rest, 100); interval(c.sample(rest, 150), 90, 91, .5);
  interval(c.sample(rest, 450), 93, 12, .5);
  interval(c.sample(rest, 500), 12, 13, 0);
  c.sample({}, 600); interval(c.sample({}, 950), 90, 0, .5);
  interval(c.sample({}, 1000), 0, 1, 0);
  const late = create({ meta: flowMeta() }); interval(late.sample({ ...rest, actionElapsed: 350 }, 0), 93, 12, .5);
});

test('flow partial sleep cancellation reverses the exact current pair and traversed fraction', () => {
  const c = create({ meta: flowMeta() }); c.sample({}, 0); const rest = { action: 'rest', actionStartedAt: 1 };
  c.sample(rest, 100); interval(c.sample(rest, 225), 91, 92, .25);
  const wake = c.sample({}, 225); interval(wake, 92, 91, .75); assert.equal(wake.transition, 'rest.exit');
  interval(c.sample({}, 237.5), 92, 91, .875);
  interval(c.sample({}, 250), 91, 90, 0);
  interval(c.sample({}, 300), 91, 90, .5);
  const sleep = c.sample({ ...rest, actionStartedAt: 2 }, 300); interval(sleep, 90, 91, .5);
  interval(c.sample({ ...rest, actionStartedAt: 2 }, 350), 91, 92, 0);
  const newer = c.sample({ action: 'feed', actionStartedAt: 3 }, 375); interval(newer, 56, 57, 0); assert.equal(newer.transition, '');
});

test('flow sleep endpoint cancellation remains symmetric and bridge pause retains its exact progress', () => {
  const c = create({ meta: flowMeta() }); c.sample({}, 0); const rest = { action: 'rest', actionStartedAt: 1 };
  c.sample(rest, 100); const before = c.sample(rest, 450); interval(before, 93, 12, .5);
  const held = c.sample({ ...rest, paused: true }, 5000);
  for (const key of ['frame','nextFrame','mix','elapsed','transitionRemaining']) assert.equal(held[key], before[key]);
  interval(c.sample(rest, 5000), 93, 12, .5);
  interval(c.sample({}, 5000), 12, 93, .5);
  interval(c.sample({}, 5050), 93, 92, 0);
  interval(c.sample({}, 5400), 90, 0, .5);
  interval(c.sample({ ...rest, actionStartedAt: 2 }, 5400), 0, 90, .5);
});

test('flow keeps accepted walking displacement and locomotion bridges discrete', () => {
  const c = create({ meta: flowMeta() }); sampleMotion(c, 0, 0, { moving: false });
  interval(sampleMotion(c, 0, 100), 95, 95, 0);
  const entering = sampleMotion(c, 4, 160); interval(entering, 94, 94, 0); near(entering.phase, 4 / 64);
  const walking = sampleMotion(c, 8, 220); interval(walking, 100, 100, 0); near(walking.phase, 8 / 64);
  const stopped = sampleMotion(c, 12, 230, { moving: false }); interval(stopped, 94, 94, 0); near(stopped.phase, 12 / 64);
});

test('flow waking to walk reverses a mixed sleep pose and keeps its rest prefix continuous', () => {
  const c = create({ meta: flowMeta() }); sampleMotion(c, 0, 0, { moving: false }); const rest = { action: 'rest', actionStartedAt: 1 };
  sampleMotion(c, 0, 100, { moving: false }, rest); interval(sampleMotion(c, 0, 225, { moving: false }, rest), 91, 92, .25);
  const waking = sampleMotion(c, 4, 225); interval(waking, 92, 91, .75); near(waking.phase, 4 / 64);
  assert.equal(waking.transition, 'rest.exit+walk.enter');
  interval(sampleMotion(c, 8, 250), 91, 90, 0);
  interval(sampleMotion(c, 12, 400), 90, 95, .5);
  interval(sampleMotion(c, 16, 450), 95, 95, 0);
  interval(sampleMotion(c, 20, 510), 94, 94, 0);
  const walking = sampleMotion(c, 24, 570); interval(walking, 108, 108, 0); near(walking.phase, 24 / 64);
  const stopped = sampleMotion(c, 28, 580, { moving: false }); assert.equal(stopped.transition, 'walk.exit'); near(stopped.phase, 28 / 64);
});

test('flow moving during the final wake interval preserves its current endpoint and remaining progress', () => {
  const c = create({ meta: flowMeta() }); sampleMotion(c, 0, 0, { moving: false }); const rest = { action: 'rest', actionStartedAt: 1 };
  sampleMotion(c, 0, 100, { moving: false }, rest); sampleMotion(c, 0, 500, { moving: false }, rest);
  sampleMotion(c, 0, 600, { moving: false }); interval(sampleMotion(c, 0, 950, { moving: false }), 90, 0, .5);
  interval(sampleMotion(c, 4, 950), 90, 0, .5);
  interval(sampleMotion(c, 8, 975), 90, 0, .75);
  interval(sampleMotion(c, 12, 1000), 95, 95, 0);
  const care = sampleMotion(c, 16, 1010, {}, { action: 'pet', actionStartedAt: 2 });
  interval(care, 48, 49, 0); assert.equal(care.transition, ''); near(care.phase, 12 / 64);
});

test('flow unsupported bridge pairs stay discrete and cannot invent a geometric transition', () => {
  const meta = flowMeta(); meta.flow.pairs = meta.flow.pairs.filter(pair => pair[0] !== 90 || pair[1] !== 91);
  const c = create({ meta }); c.sample({}, 0); const rest = { action: 'rest', actionStartedAt: 1 };
  c.sample(rest, 100); interval(c.sample(rest, 150), 90, 90, 0);
  interval(c.sample(rest, 250), 91, 92, .5);
});

test('declared complete-source bridge handoffs retain reversible fractional timing', () => {
  const meta = flowMeta();
  meta.flow.pairs = meta.flow.pairs.filter(pair => pair[0] !== 91 || pair[1] !== 92);
  meta.flow.sourcePairs = [[91,92]];
  const c = create({ meta }), rest = { action: 'rest', actionStartedAt: 1 };
  c.sample({}, 0); c.sample(rest, 100);
  interval(c.sample(rest, 237.5), 91, 92, .375);
  interval(c.sample({ ...rest, paused: true }, 5000), 91, 92, .375);
  interval(c.sample(rest, 5000), 91, 92, .375);
  interval(c.sample({}, 5000), 92, 91, .625);
  interval(c.sample({ ...rest, actionStartedAt: 2 }, 5000), 91, 92, .375);
  // The walk-only authored bridge still uses its original discrete poses.
  const walk = create({ meta }); sampleMotion(walk, 0, 0, { moving: false });
  interval(sampleMotion(walk, 0, 100), 95, 95, 0);
});

test('flow repeated sleep preserves even a submillisecond bridge remainder', () => {
  const c = create({ meta: flowMeta() }); c.sample({}, 0); const rest = { action: 'rest', actionStartedAt: 1 };
  c.sample(rest, 100); interval(c.sample(rest, 199.75), 90, 91, .9975);
  const repeated = { ...rest, actionStartedAt: 2 };
  interval(c.sample(repeated, 199.75), 90, 91, .9975);
  interval(c.sample(repeated, 200), 91, 92, 0);
  interval(c.sample(repeated, 250), 91, 92, .5);
});

test('flow repeatedly reverses the sleep endpoint through its shared curled pose without snapping', () => {
  const c = create({ meta: flowMeta() }); c.sample({}, 0); const rest = { action: 'rest', actionStartedAt: 1 };
  c.sample(rest, 0); interval(c.sample(rest, 350), 93, 12, .5);
  interval(c.sample({}, 350), 12, 93, .5);
  interval(c.sample({}, 360), 12, 93, .6);
  const repeated = { ...rest, actionStartedAt: 2 };
  interval(c.sample(repeated, 360), 93, 12, .4);
  const before = c.sample(repeated, 380); interval(before, 93, 12, .6);
  const held = c.sample({ ...repeated, paused: true }, 5000);
  for (const key of ['frame','nextFrame','mix','elapsed','transitionRemaining']) assert.equal(held[key], before[key]);
  interval(c.sample(repeated, 5000), 93, 12, .6);
  interval(c.sample({}, 5000), 12, 93, .4);
  interval(c.sample({ ...rest, actionStartedAt: 3 }, 5000), 93, 12, .6);
  interval(c.sample({ ...rest, actionStartedAt: 3 }, 5040), 12, 13, 0);
});

test('flow repeatedly reverses the idle endpoint through its shared standing pose without snapping', () => {
  const c = create({ meta: flowMeta() }); c.sample({}, 0); const rest = { action: 'rest', actionStartedAt: 1 };
  c.sample(rest, 0); c.sample(rest, 400); c.sample({}, 500);
  interval(c.sample({}, 850), 90, 0, .5);
  const repeated = { ...rest, actionStartedAt: 2 };
  interval(c.sample(repeated, 850), 0, 90, .5);
  interval(c.sample(repeated, 860), 0, 90, .6);
  const before = c.sample({}, 860); interval(before, 90, 0, .4);
  const held = c.sample({ paused: true }, 5000);
  for (const key of ['frame','nextFrame','mix','elapsed','transitionRemaining']) assert.equal(held[key], before[key]);
  interval(c.sample({}, 5000), 90, 0, .4);
  interval(c.sample({ ...rest, actionStartedAt: 3 }, 5000), 0, 90, .6);
  interval(c.sample({}, 5000), 90, 0, .4);
  interval(c.sample({}, 5060), 0, 1, 0);
});

test('flow repeating sleep while its reverse prefix is outside the authored track retains the exact pose', () => {
  const c = create({ meta: flowMeta() }); c.sample({}, 0); const rest = { action: 'rest', actionStartedAt: 1 };
  c.sample(rest, 0); c.sample(rest, 400); c.sample({}, 500); c.sample({}, 850);
  c.sample({ ...rest, actionStartedAt: 2 }, 850);
  interval(c.sample({ ...rest, actionStartedAt: 2 }, 860), 0, 90, .6);
  const repeated = { ...rest, actionStartedAt: 3 };
  interval(c.sample(repeated, 860), 0, 90, .6);
  interval(c.sample(repeated, 900), 90, 91, 0);
});

test('flow walking during a reverse sleep endpoint keeps that mixed wake prefix and its accepted distance', () => {
  const c = create({ meta: flowMeta() }); sampleMotion(c, 0, 0, { moving: false }); const rest = { action: 'rest', actionStartedAt: 1 };
  sampleMotion(c, 0, 0, { moving: false }, rest); sampleMotion(c, 0, 350, { moving: false }, rest);
  sampleMotion(c, 0, 350, { moving: false }); interval(sampleMotion(c, 0, 360, { moving: false }), 12, 93, .6);
  const walking = sampleMotion(c, 4, 360); interval(walking, 12, 93, .6); near(walking.phase, 4 / 64);
  interval(sampleMotion(c, 8, 400), 93, 92, 0);
});

test('flow repeatedly reverses the compound walk endpoint through its shared standing pose', () => {
  const c = create({ meta: flowMeta() }); sampleMotion(c, 0, 0, { moving: false }); const rest = { action: 'rest', actionStartedAt: 1 };
  sampleMotion(c, 0, 0, { moving: false }, rest); sampleMotion(c, 0, 400, { moving: false }, rest);
  sampleMotion(c, 4, 500); interval(sampleMotion(c, 8, 850), 90, 95, .5);
  const repeated = { ...rest, actionStartedAt: 2 };
  interval(sampleMotion(c, 8, 850, { moving: false }, repeated), 95, 90, .5);
  interval(sampleMotion(c, 8, 860, { moving: false }, repeated), 95, 90, .6);
  const before = sampleMotion(c, 8, 860, { moving: false }); interval(before, 90, 95, .4);
  const held = sampleMotion(c, 100, 5000, { dragging: true });
  for (const key of ['frame','nextFrame','mix','elapsed','transitionRemaining','phase']) assert.equal(held[key], before[key]);
  interval(sampleMotion(c, 100, 5000, { moving: false }), 90, 95, .4);
  interval(sampleMotion(c, 100, 5000, { moving: false }, { ...rest, actionStartedAt: 3 }), 95, 90, .6);
  near(sampleMotion(c, 100, 5000, { moving: false }).phase, 8 / 64);
});
