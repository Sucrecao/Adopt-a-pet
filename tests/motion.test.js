import test from 'node:test';
import assert from 'node:assert/strict';

async function integrator() { return (await import('../src/core/motion.js')).advanceMotion; }
function travel(advance, interval, seconds, speed = 42) {
  let motion = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += interval) {
    motion = advance(motion, { x: 1000, y: 0 }, speed, Math.min(interval, seconds - elapsed));
  }
  return motion;
}

test('equal elapsed travel is close at 16ms and 33ms with gradual acceleration', async () => {
  const advance = await integrator();
  const fast = travel(advance, 0.016, 2), slow = travel(advance, 0.033, 2);
  assert.ok(Math.abs(fast.x - slow.x) < 0.2);
  assert.ok(fast.x > 70 && fast.x < 84);
  const first = advance({ x: 0, y: 0, vx: 0, vy: 0 }, { x: 100, y: 0 }, 42, 0.016);
  assert.ok(first.vx > 0 && first.vx < fast.vx);
});

test('fractional low-speed travel accumulates and inputs remain unchanged', async () => {
  const advance = await integrator();
  const original = Object.freeze({ x: 0, y: 0, vx: 0, vy: 0 });
  const target = Object.freeze({ x: 100, y: 0 });
  const first = advance(original, target, 0.4, 0.016);
  assert.ok(first.x > 0 && first.x < 1);
  assert.deepEqual(original, { x: 0, y: 0, vx: 0, vy: 0 });
  assert.ok(travel(advance, 0.016, 4, 0.4).x > 1);
});

test('arrival slows down, reaches the exact target and never overshoots', async () => {
  const advance = await integrator();
  const target = { x: 35, y: 15 };
  let motion = { x: 0, y: 0, vx: 0, vy: 0 }, peakSpeed = 0, slowed = false;
  for (let frame = 0; frame < 1000 && !motion.arrived; frame++) {
    motion = advance(motion, target, 42, 0.016);
    const velocity = Math.hypot(motion.vx, motion.vy);
    peakSpeed = Math.max(peakSpeed, velocity);
    if (!motion.arrived && motion.x > 30 && velocity < peakSpeed * 0.5) slowed = true;
    assert.ok(motion.x >= 0 && motion.x <= target.x && motion.y >= 0 && motion.y <= target.y);
  }
  assert.ok(slowed);
  assert.deepEqual(motion, { ...target, vx: 0, vy: 0, arrived: true });
});

test('a reversed chase target preserves inertia before slowing, reversing and arriving', async () => {
  const advance = await integrator();
  const target = { x: 0, y: 0 };
  let motion = advance({ x: 100, y: 0, vx: 58, vy: 0 }, target, 58, 0.016);
  assert.ok(motion.vx > 0 && motion.vx < 58, 'the first frame must decelerate without discarding forward velocity');
  assert.ok(motion.x > 100 && motion.x < 101, 'momentum allows a small forward step before reversing');
  let reversed = false;
  for (let frame = 0; frame < 1500 && !motion.arrived; frame++) {
    motion = advance(motion, target, 58, 0.016);
    if (motion.vx < 0 && motion.x > 0) reversed = true;
    assert.ok(motion.x >= 0 && motion.x < 104, 'the target must not be passed and forward inertia must remain bounded');
    assert.equal(motion.y, 0);
  }
  assert.ok(reversed, 'velocity must cross zero and head toward the new target');
  assert.deepEqual(motion, { ...target, vx: 0, vy: 0, arrived: true });
});

test('zero elapsed time and zero speed do not move', async () => {
  const advance = await integrator();
  for (const [speed, dt] of [[42, 0], [0, 0.016]]) {
    const next = advance({ x: 4, y: 2, vx: 12, vy: 0 }, { x: 100, y: 100 }, speed, dt);
    assert.equal(next.x, 4);
    assert.equal(next.y, 2);
  }
});
