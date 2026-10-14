import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const author = await import('../scripts/couple-puppies/poses.mjs').catch(() => ({}));

test('reference puppies expose upright complete poses with two supporting feet', () => {
  assert.equal(typeof author.walkPose, 'function');
  for (const species of ['maltese', 'golden']) {
    const p = author.walkPose(species, 0);
    assert.equal(p.feet.length, 2);
    assert.ok(p.headY < p.bodyY - 40);
    assert.deepEqual(p, author.walkPose(species, 1));
    for (let i = 0; i < 1024; i++) assert.ok(author.walkPose(species, i / 1024).feet.some(f => f.contact));
  }
});

test('planted puppy feet cancel actual root displacement through multiple cycles', () => {
  assert.equal(typeof author.walkPose, 'function');
  for (const species of ['maltese', 'golden']) for (let leg = 0; leg < 2; leg++) {
    let previous, anchor;
    for (let i = 0; i <= 6144; i++) {
      const phase = i / 2048, foot = author.walkPose(species, phase).feet[leg];
      const world = foot.x + phase * author.STRIDE;
      const generation = Math.floor(phase) + foot.cycle;
      if (previous?.contact && foot.contact && previous.generation === generation) assert.ok(Math.abs(world - anchor) < 1e-8);
      else anchor = world;
      if (foot.contact) assert.equal(foot.y, author.GROUND);
      previous = { ...foot, generation };
    }
  }
});

test('every puppy stop starts at its actual walk pose and lands with stationary feet', () => {
  assert.equal(typeof author.stopPose, 'function');
  for (const species of ['maltese', 'golden']) for (let slot = 0; slot < 128; slot++) {
    const phase = slot / 128;
    assert.deepEqual(author.stopPose(species, phase, 0), author.walkPose(species, phase));
    assert.deepEqual(author.stopPose(species, phase, 1), author.walkPose(species, 0));
    let before = author.stopPose(species, phase, 0);
    for (let i = 1; i <= 39; i++) {
      const pose = author.stopPose(species, phase, i / 39);
      pose.feet.forEach((foot, j) => {
        if (foot.contact && before.feet[j].contact) assert.ok(Math.abs(foot.x - before.feet[j].x) < 1e-8);
        assert.ok(Math.hypot(foot.x - before.feet[j].x, foot.y - before.feet[j].y) < 7);
      });
      before = pose;
    }
  }
});

test('all puppy care and rest junctions reuse the same complete neutral pose', () => {
  assert.equal(typeof author.actionPose, 'function');
  for (const species of ['maltese', 'golden']) {
    const neutral = author.walkPose(species, 0);
    for (const name of ['idle', 'pet', 'feed', 'groom', 'stretch', 'hop']) {
      assert.deepEqual(author.actionPose(species, name, 0), neutral);
      assert.deepEqual(author.actionPose(species, name, 1), neutral);
    }
    assert.deepEqual(author.restPose(species, 0), neutral);
    assert.equal(author.turnPose(species, 0).orientation, 1);
    assert.equal(author.turnPose(species, 1).orientation, -1);
  }
});

test('puppy toe liftoff and touchdown meet stationary world-space velocity', () => {
  assert.equal(typeof author.walkPose, 'function');
  const h = 1e-5, x = p => author.walkPose('maltese', p).feet[0].x + p * author.STRIDE;
  for (const t of [author.STANCE, 1]) {
    assert.ok(Math.abs((x(t) - x(t - h)) / h) < .01);
    assert.ok(Math.abs((x(t + h) - x(t)) / h) < .01);
  }
});

test('every turning puppy retains two ordered planted support centers', () => {
  for (const species of ['maltese', 'golden']) for (let slot = 0; slot < 80; slot++) {
    const pose = author.turnPose(species, slot / 79);
    const positions = pose.feet.map((foot, index) => author.projectLegX(pose, index, foot.x));
    assert.ok(positions[1] - positions[0] >= 29.9999, `${species} turn ${slot} merges its feet`);
    pose.feet.forEach(foot => assert.equal(foot.y, author.GROUND));
  }
});

test('new source pictures hand off to the exact neutral and mirrored neutral pixels', async () => {
  const require = createRequire(import.meta.url);
  let sharp;
  try { sharp = require('sharp'); } catch { sharp = require('/Users/sucrecao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'); }
  for (const species of ['maltese', 'golden']) {
    const meta = JSON.parse(readFileSync(`public/pets/${species}-line-v1.json`));
    const crop = async (index, flip = false) => {
      const frame = meta.frames[index], r = frame.rect;
      let image = sharp(`public/${meta.pages[frame.page].asset}`).extract({ left: r[0], top: r[1], width: r[2], height: r[3] });
      if (flip) image = image.flop();
      return image.raw().toBuffer();
    };
    const neutral = await crop(meta.neutralFrame), reflected = await crop(meta.neutralFrame, true);
    assert.ok((await crop(meta.clips.turn.frames.at(-1))).equals(reflected));
    assert.ok((await sharp(`public/${meta.neutralAsset}`).raw().toBuffer()).equals(neutral));
    for (const track of meta.authoredStops) assert.ok((await crop(track.frames.at(-1))).equals(neutral));
    const preceding = await crop(meta.clips.turn.frames.at(-2));
    let difference = 0;
    for (let i = 0; i < reflected.length; i++) difference += Math.abs(reflected[i] - preceding[i]);
    assert.ok(difference < 15_000, `${species}: a last-picture silhouette swap ${difference}`);
  }
});
