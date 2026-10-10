// Positions remain fractional until the native window boundary. Small integration
// steps keep acceleration and arrival consistent across display refresh rates.
export function advanceMotion(motion, target, speed, elapsedSeconds) {
  let { x, y, vx = 0, vy = 0 } = motion;
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  if (elapsed === 0 || speed <= 0) return { x, y, vx, vy, arrived: x === target.x && y === target.y };
  const steps = Math.max(1, Math.ceil(elapsed / (1 / 240)));
  const dt = elapsed / steps;
  const response = 1 - Math.exp(-8 * dt);
  for (let step = 0; step < steps; step++) {
    const dx = target.x - x, dy = target.y - y, distance = Math.hypot(dx, dy);
    if (distance <= 0.05) return { x: target.x, y: target.y, vx: 0, vy: 0, arrived: true };
    const desiredSpeed = Math.min(speed, distance * 4);
    const nextVx = vx + (dx / distance * desiredSpeed - vx) * response;
    const nextVy = vy + (dy / distance * desiredSpeed - vy) * response;
    const nextX = x + (vx + nextVx) * 0.5 * dt;
    const nextY = y + (vy + nextVy) * 0.5 * dt;
    // Clamp only a step that crosses the target. A new chase target may be
    // behind the current velocity: preserve that inertia while slowing down.
    const boundedX = dx * (target.x - nextX) < 0 ? target.x : nextX;
    const boundedY = dy * (target.y - nextY) < 0 ? target.y : nextY;
    vx = boundedX === nextX ? nextVx : 0;
    vy = boundedY === nextY ? nextVy : 0;
    x = boundedX; y = boundedY;
  }
  const arrived = Math.hypot(target.x - x, target.y - y) <= 0.05;
  return arrived ? { x: target.x, y: target.y, vx: 0, vy: 0, arrived: true } : { x, y, vx, vy, arrived: false };
}
