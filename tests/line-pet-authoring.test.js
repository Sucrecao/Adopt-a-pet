import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const author = await import('../scripts/line-pets/poses.mjs').catch(() => ({}));

test('walk authoring exposes a measurable complete pose', () => {
  assert.equal(typeof author.walkPose, 'function');
});

test('each planted toe cancels exactly the accepted root travel', () => {
  assert.equal(typeof author.walkPose, 'function');
  for (const species of ['dog', 'cat']) {
    for (let leg = 0; leg < 4; leg++) {
      let worldX = null;
      let previous = null;
      for (let i = 0; i <= 2048; i++) {
        const phase = i / 2048;
        const foot = author.walkPose(species, phase).feet[leg];
        if (foot.contact && previous?.contact && foot.cycle === previous.cycle) {
          assert.ok(Math.abs(foot.x + phase * author.STRIDE - worldX) < 1e-8);
          assert.equal(foot.y, author.GROUND);
        } else worldX = foot.x + phase * author.STRIDE;
        previous = foot;
      }
    }
  }
});

test('four-beat walking never has fewer than two planted feet and closes exactly', () => {
  assert.equal(typeof author.walkPose, 'function');
  for (const species of ['dog', 'cat']) {
    assert.deepEqual(author.walkPose(species, 0), author.walkPose(species, 1));
    for (let i = 0; i < 1024; i++) {
      assert.ok(author.walkPose(species, i / 1024).feet.filter(f => f.contact).length >= 2);
    }
    const starts = author.LEGS.map(leg => (author.STANCE - leg.phase + 1) % 1).sort();
    for (let i = 0; i < 4; i++) assert.ok(Math.abs((starts[(i + 1) % 4] - starts[i] + 1) % 1 - .25) < 1e-9);
  }
});

test('swing joins the planted world-space toe with zero velocity and acceleration', () => {
  assert.equal(typeof author.walkPose, 'function');
  const h = 1e-5, x = p => author.walkPose('dog', p).feet[0].x + p * author.STRIDE;
  for (const boundary of [author.STANCE, 1]) {
    const leftVelocity = (x(boundary) - x(boundary - h)) / h;
    const rightVelocity = (x(boundary + h) - x(boundary)) / h;
    assert.ok(Math.abs(leftVelocity) < .01, `left touchdown/liftoff velocity ${leftVelocity}`);
    assert.ok(Math.abs(rightVelocity) < .01, `right touchdown/liftoff velocity ${rightVelocity}`);
    const acceleration = (x(boundary + h) - 2 * x(boundary) + x(boundary - h)) / h ** 2;
    assert.ok(Math.abs(acceleration) < 2, `contact acceleration ${acceleration}`);
  }
});

test('all 128 phase-specific stationary stops preserve contact until a visible lifted step', () => {
  assert.equal(typeof author.stopPose, 'function');
  for (const species of ['dog', 'cat']) {
    for (let slot = 0; slot < 128; slot++) {
      const initial = author.walkPose(species, slot / 128);
      assert.deepEqual(author.stopPose(species, slot / 128, 0), initial);
      assert.deepEqual(author.stopPose(species, slot / 128, 1), author.walkPose(species, 0));
      let previous = initial;
      for (let frame = 1; frame < 40; frame++) {
        const pose = author.stopPose(species, slot / 128, frame / 39);
        pose.feet.forEach((foot, leg) => {
          if (foot.contact && previous.feet[leg].contact) {
            assert.ok(Math.abs(foot.x - previous.feet[leg].x) < 1e-8, `${species} ${slot} leg${leg} slides`);
            assert.equal(foot.y, author.GROUND);
          }
          assert.ok(Math.hypot(foot.x - previous.feet[leg].x, foot.y - previous.feet[leg].y) < 9, 'stop must not teleport');
        });
        previous = pose;
      }
    }
  }
});

test('stopping at the already neutral walk phase holds the whole animal still', () => {
  for (const species of ['dog', 'cat']) {
    const neutral = author.walkPose(species, 0);
    for (let sample = 0; sample <= 100; sample++) {
      assert.deepEqual(author.stopPose(species, 0, sample / 100), neutral, `${species}: a neutral stationary stop must not march`);
    }
  }
});

test('care clips return exactly to the same neutral animal', () => {
  assert.equal(typeof author.actionPose, 'function');
  for (const species of ['dog', 'cat']) {
    for (const clip of ['idle', 'pet', 'feed', 'groom', 'stretch', 'hop']) {
      assert.deepEqual(author.actionPose(species, clip, 0), author.walkPose(species, 0));
      assert.deepEqual(author.actionPose(species, clip, 1), author.walkPose(species, 0));
    }
  }
});

test('exported turn endpoint is exactly the mirrored neutral whole-frame pixels', async () => {
  const require = createRequire(import.meta.url);
  let sharp;
  try { sharp = require('sharp'); } catch { sharp = require('/Users/sucrecao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'); }
  for (const species of ['dog', 'cat']) {
    const meta = JSON.parse(readFileSync(`public/pets/${species}-line-v1.json`));
    const crop = async (index, flip = false) => {
      const frame = meta.frames[index], r = frame.rect;
      let image = sharp(`public/${meta.pages[frame.page].asset}`).extract({ left: r[0], top: r[1], width: r[2], height: r[3] });
      if (flip) image = image.flop();
      return image.raw().toBuffer();
    };
    assert.ok((await crop(meta.clips.turn.frames.at(-1))).equals(await crop(meta.neutralFrame, true)), `${species} turn must hand off with zero pixel jump`);
    assert.equal(meta.neutralAsset, `pets/${species}-line-v1-neutral.png`);
    assert.ok((await sharp(`public/${meta.neutralAsset}`).raw().toBuffer()).equals(await crop(meta.neutralFrame)), `${species} loading fallback must be the same complete neutral animal`);
  }
});

test('both actual frontal turn pictures retain two separated broad visible feet', async () => {
  const require = createRequire(import.meta.url);
  let sharp;
  try { sharp = require('sharp'); } catch { sharp = require('/Users/sucrecao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'); }
  for (const species of ['dog', 'cat']) {
    const meta = JSON.parse(readFileSync(`public/pets/${species}-line-v1.json`));
    for (const slot of [38, 39, 40, 41]) {
      const frame = meta.frames[meta.clips.turn.frames[slot]], r = frame.rect;
      const { data, info } = await sharp(`public/${meta.pages[frame.page].asset}`)
        .extract({ left: r[0], top: r[1], width: r[2], height: r[3] }).raw().toBuffer({ resolveWithObject: true });
      const occupied = Array.from({ length: info.width }, (_, x) => {
        for (let y = 109; y <= 112; y++) if (data[(y * info.width + x) * 4 + 3] > 32) return true;
        return false;
      });
      const bands = [];
      occupied.forEach((ink, x) => {
        if (ink && !occupied[x - 1]) bands.push({ left: x, right: x });
        else if (ink) bands.at(-1).right = x;
      });
      const broadFeet = bands.filter(band => band.right - band.left >= 3);
      assert.ok(broadFeet.length >= 2, `${species} turn${slot}: only ${broadFeet.length} broad visible feet`);
      assert.ok(broadFeet.at(-1).left - broadFeet[0].right >= 3, `${species} turn${slot}: frontal feet overlap`);
    }
  }
});
