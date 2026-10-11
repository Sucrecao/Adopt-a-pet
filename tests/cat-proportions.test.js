import test from 'node:test';
import assert from 'node:assert/strict';
import { createRigController, RIG_GEOMETRY } from '../src/core/rig-motion.js';

const locomotion = (distanceDip = 0, facing = 1, moving = true) => ({
  epoch: 1, distanceDip, spriteSizeDip: 256, facing, moving,
});
const near = (actual, expected, message = '') => assert.ok(
  Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`,
);
const catAnatomy = {
  fore: { hip: { x: 170, y: 145 }, lengths: [40, 40], paw: { x: 2, y: 9 } },
  hind: { hip: { x: 80, y: 151 }, lengths: [32, 34], paw: { x: 7, y: 17 } },
};

test('cat uses its lower shoulders and hips with short feline limb proportions', () => {
  for (const facing of [1, -1]) {
    const pose = createRigController({ species: 'cat', random: () => 0 })
      .sample({ locomotion: locomotion(0, facing, false) }, 0);
    assert.notEqual(pose.geometry, RIG_GEOMETRY, 'cat requires its own anatomy');
    for (const leg of pose.legs) {
      const anatomy = catAnatomy[leg.kind], farOffset = leg.side === 'far' ? 4 : 0;
      near(leg.hip.x, 128 + facing * (anatomy.hip.x + farOffset - 128), `${leg.id} hip x`);
      near(leg.hip.y, anatomy.hip.y, `${leg.id} hip y`);
      near(leg.upperLength, anatomy.lengths[0], `${leg.id} upper length`);
      near(leg.lowerLength, anatomy.lengths[1], `${leg.id} lower length`);
      near(leg.skinLength, anatomy.lengths[0] + anatomy.lengths[1], `${leg.id} complete skin`);
      near(leg.foot.x - leg.ankle.x, anatomy.paw.x * facing, `${leg.id} distal x`);
      near(leg.foot.y - leg.ankle.y, anatomy.paw.y, `${leg.id} distal y`);
      near(leg.pawLength, Math.hypot(anatomy.paw.x, anatomy.paw.y), `${leg.id} distal length`);
      near(leg.foot.y, 226, `${leg.id} unchanged floor`);
    }
  }
});

test('parrot retains the accepted default hips, bone lengths and paw offsets', () => {
  for (const species of ['parrot']) for (const facing of [1, -1]) {
    const pose = createRigController({ species, random: () => 0 })
      .sample({ locomotion: locomotion(0, facing, false) }, 0);
    assert.equal(pose.geometry, RIG_GEOMETRY);
    for (const leg of pose.legs) {
      const hind = leg.kind === 'hind', hip = hind ? { x: 80, y: 147 } : { x: 170, y: 135 };
      near(leg.hip.x, 128 + facing * (hip.x + (leg.side === 'far' ? 4 : 0) - 128));
      near(leg.hip.y, hip.y);
      near(leg.upperLength, hind ? 35 : 44.5);
      near(leg.lowerLength, hind ? 40 : 44.5);
      near(leg.foot.x - leg.ankle.x, (hind ? 8 : 2) * facing);
      near(leg.foot.y - leg.ankle.y, hind ? 21 : 9);
    }
  }
});

function reachable(pose, scenario, checkBones = true) {
  for (const leg of pose.legs) {
    for (const joint of ['hip', 'knee', 'ankle', 'foot']) {
      assert.ok(Number.isFinite(leg[joint].x) && Number.isFinite(leg[joint].y), `${scenario} ${leg.id} ${joint}`);
    }
    const distance = Math.hypot(leg.ankle.x - leg.hip.x, leg.ankle.y - leg.hip.y);
    assert.ok(distance <= leg.upperLength + leg.lowerLength + 1e-7,
      `${scenario} ${leg.id} reach ${distance} exceeds ${leg.upperLength + leg.lowerLength}`);
    assert.ok(distance + 1e-7 >= Math.abs(leg.upperLength - leg.lowerLength), `${scenario} ${leg.id} minimum reach`);
    if (checkBones) {
      near(Math.hypot(leg.knee.x - leg.hip.x, leg.knee.y - leg.hip.y), leg.upperLength, `${scenario} ${leg.id} upper bone`);
      near(Math.hypot(leg.knee.x - leg.ankle.x, leg.knee.y - leg.ankle.y), leg.lowerLength, `${scenario} ${leg.id} lower bone`);
    }
  }
}

test('short cat hind chains remain reachable through full gait while planted soles retain world contacts', () => {
  for (const facing of [1, -1]) {
    const controller = createRigController({ species: 'cat', random: () => 0 });
    const contacts = new Map();
    for (let distance = 0; distance <= 192; distance++) {
      const pose = controller.sample({ locomotion: locomotion(distance, facing) }, distance * 12);
      reachable(pose, `gait facing ${facing} distance ${distance}`);
      for (const leg of pose.legs.filter(leg => leg.planted)) {
        near(leg.foot.y, 226, `${leg.id} contact floor`);
        const key = `${leg.id}:${leg.supportGeneration}`, worldX = leg.foot.x + distance * facing;
        if (contacts.has(key)) near(worldX, contacts.get(key), `${key} world contact`);
        else contacts.set(key, worldX);
      }
    }
    assert.ok(contacts.size >= 12, 'exercise multiple complete support lifetimes');
  }
});

test('cat reversal starts continuously and keeps every shorter chain within reach', () => {
  for (const facing of [1, -1]) for (const moving of [true, false]) {
    const controller = createRigController({ species: 'cat', random: () => 0 });
    controller.sample({ locomotion: locomotion(0, facing) }, 0);
    const before = controller.sample({ locomotion: locomotion(16, facing) }, 100);
    const reversed = { locomotion: locomotion(16, -facing, moving) };
    const first = controller.sample(reversed, 100.001);
    assert.equal(first.turning, true);
    assert.ok(Math.abs(first.orientation - before.orientation) < 1e-7, 'initial orientation must not snap');
    for (let i = 0; i < before.legs.length; i++) {
      const old = before.legs[i], leg = first.legs[i];
      for (const joint of ['hip', 'knee', 'ankle', 'foot']) {
        assert.ok(Math.hypot(leg[joint].x - old[joint].x, leg[joint].y - old[joint].y) < 1e-3,
          `${leg.id} ${joint} must not snap on reversal`);
      }
      if (old.planted && leg.planted) assert.equal(leg.supportGeneration, old.supportGeneration);
    }
    let end;
    for (let elapsed = 8; elapsed <= 1000; elapsed += 8) {
      end = controller.sample(reversed, 100 + elapsed);
      reachable(end, `turn facing ${facing} moving ${moving} elapsed ${elapsed}`, Math.abs(end.orientation) === 1);
    }
    assert.equal(end.turning, false);
    assert.equal(end.orientation, -facing);
  }
});

test('cat moving reversals release supports before shorter hind chains exceed reach', () => {
  for (const initialFacing of [1, -1]) for (const speed of [0, .02, .05, .15]) {
    const controller = createRigController({ species: 'cat', random: () => 0 });
    const contacts = new Map();
    let worldRoot = 0, previousDistance = 0, previous;
    for (let now = 0; now <= 2500; now += 8) {
      const facing = now < 400 ? initialFacing : -initialFacing, distance = speed * now;
      worldRoot += (distance - previousDistance) * facing;
      previousDistance = distance;
      const pose = controller.sample({ locomotion: locomotion(distance, facing, speed > 0) }, now);
      reachable(pose, `moving reversal facing ${initialFacing} speed ${speed} time ${now}`,
        pose.legs.every(leg => Math.abs(leg.orientation) === 1));
      for (const leg of pose.legs) {
        if (previous) {
          const old = previous.legs.find(old => old.id === leg.id);
          assert.ok(Math.hypot(leg.foot.x - old.foot.x, leg.foot.y - old.foot.y) < 9,
            `${leg.id} support release remains continuous at speed ${speed} time ${now}`);
        }
        if (!leg.planted) continue;
        near(leg.foot.y, 226, `${leg.id} turn contact floor`);
        const key = `${leg.id}:${leg.supportGeneration}`, worldX = leg.foot.x + worldRoot;
        if (contacts.has(key)) near(worldX, contacts.get(key), `${key} turn world contact`);
        else contacts.set(key, worldX);
      }
      previous = pose;
    }
    assert.ok(contacts.size >= 4, 'exercise planted support lifetimes during reversal');
  }
});

test('cat care during early and late stationary turns remains within both chain reach bounds', () => {
  for (const facing of [1, -1]) for (const turnTime of [0, 48, 336, 592, 688]) {
    for (const action of ['pet', 'feed', 'stretch', 'groom', 'trick']) {
      const controller = createRigController({ species: 'cat', random: () => 0 });
      controller.sample({ locomotion: locomotion(0, facing, false) }, 0);
      const input = locomotion(0, turnTime ? -facing : facing, false);
      for (let now = 8; now <= turnTime; now += 8) controller.sample({ locomotion: input }, now);
      for (let elapsed = 0; elapsed <= 3200; elapsed += 16) {
        const pose = controller.sample({ locomotion: input, action, actionStartedAt: 1 }, turnTime + elapsed);
        reachable(pose, `care facing ${facing} turn ${turnTime} ${action} elapsed ${elapsed}`,
          pose.legs.every(leg => Math.abs(leg.orientation) === 1));
      }
    }
  }
});

test('cat care and an unfinished reversal freeze the complete pose without telemetry catch-up', () => {
  for (const action of ['groom', 'stretch', 'trick', 'pet', 'feed']) {
    const controller = createRigController({ species: 'cat', random: () => 0 });
    controller.sample({ locomotion: locomotion(0, 1, false) }, 0);
    const reversed = { locomotion: locomotion(0, -1, false) };
    for (let now = 8; now <= 336; now += 8) controller.sample(reversed, now);
    const props = { ...reversed, action, actionStartedAt: 1, actionElapsed: 600 };
    const before = controller.sample(props, 352), snapshot = structuredClone(before);
    for (const now of [1000, 3000, 8000]) {
      const paused = controller.sample({ ...props, paused: true, locomotion: locomotion(500, 1) }, now);
      assert.equal(paused, before, `${action} pause retains complete pose identity`);
      assert.deepEqual(paused, snapshot, `${action} pause cannot mutate its stored pose`);
    }
    const resumed = controller.sample(props, 8016);
    near(resumed.elapsed, before.elapsed, `${action} resumes without clock catch-up`);
    near(resumed.phase, before.phase, `${action} resumes without distance catch-up`);
    assert.deepEqual(resumed.legs, before.legs, `${action} resume retains endpoints and supports`);
  }
});

test('cat care remains reachable at fractional stance boundaries and their immediate neighbors', () => {
  const actions = [['feed', 3200, 1600], ['stretch', 2600, 1300], ['trick', 1200, 380]];
  for (const facing of [1, -1]) for (const boundary of [9.6, 41.6]) for (const offset of [-.1, 0, .1]) {
    for (const [action, duration, peak] of actions) {
      const controller = createRigController({ species: 'cat', random: () => 0 });
      controller.sample({ locomotion: locomotion(0, facing), action }, 0);
      const input = { locomotion: locomotion(boundary + offset, facing), action };
      const times = [...new Set([peak, duration, ...Array.from({ length: Math.floor(duration / 8) + 1 }, (_, i) => i * 8)])]
        .sort((a, b) => a - b);
      for (const elapsed of times) {
        reachable(controller.sample(input, elapsed),
          `${action} facing ${facing} stance ${boundary + offset} elapsed ${elapsed}`);
      }
    }
  }
});
