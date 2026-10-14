import { advanceMotion } from './motion.js';
import { clampWindow } from './geometry.js';

// This clock describes a browser paint commit, not native-window travel or
// hardware presentation. Sampling is a proposal; only a successful full-frame
// draw can commit the matching fractional root and its distance.
export function createVisualMotionDriver({ onCommit = () => {} } = {}) {
  let authority = null, rect = null, motion = null, distanceDip = 0;
  let previousNow = null, pending = null, token = 0, sequence = 0, failedGeneration = 0, failedDraws = 0;
  let wasAdvancing = false;
  function configure(next) {
    if (!next?.visual) return;
    const rebase = !authority || next.epoch !== authority.epoch
      || next.visual.geometrySeq !== authority.visual.geometrySeq;
    if (rebase) {
      rect = { ...next.visual.rectGlobal };
      motion = { x: rect.x, y: rect.y, vx: 0, vy: 0, arrived: true };
      distanceDip = next.distanceDip || 0;
      previousNow = null; pending = null; wasAdvancing = false; failedGeneration = 0;
    }
    authority = { ...next, visual: { ...next.visual } };
    if (!next.moving || next.paused || next.dragging) {
      motion = { ...motion, vx: 0, vy: 0 };
      previousNow = null; wasAdvancing = false; pending = null;
    }
  }
  function sample(now, ready = false, localBarrier = {}) {
    if (!authority || !rect) return null;
    const advancing = Boolean(ready && authority.moving && !authority.paused && !authority.dragging
      && !localBarrier.paused && !localBarrier.stationary
      && authority.visual.targetGlobal && authority.visual.speedDip > 0);
    const elapsed = advancing && wasAdvancing && previousNow !== null
      ? Math.min(.05, Math.max(0, (now - previousNow) / 1000)) : 0;
    previousNow = now; wasAdvancing = advancing;
    const proposed = advancing ? advanceMotion(motion, authority.visual.targetGlobal,
      authority.visual.speedDip, elapsed) : { ...motion, vx: 0, vy: 0 };
    const constrained = clampWindow({ ...rect, x: proposed.x, y: proposed.y }, authority.visual.host);
    const nextMotion = { ...proposed, x: constrained.x, y: constrained.y };
    if (nextMotion.x !== proposed.x) nextMotion.vx = 0;
    if (nextMotion.y !== proposed.y) nextMotion.vy = 0;
    const travel = advancing ? Math.abs(nextMotion.x - rect.x) : 0;
    const locomotion = { ...authority, clockKind: 'visual-root-v1',
      epoch: `${authority.epoch}:${failedGeneration}`, distanceDip: distanceDip + travel,
      paused: Boolean(authority.paused || localBarrier.paused),
      moving: advancing && !nextMotion.arrived, visualToken: ++token,
      rectGlobal: { ...constrained } };
    pending = { locomotion, motion: nextMotion, rect: constrained, distanceDip: distanceDip + travel };
    return locomotion;
  }
  function commit({ locomotion, sample: source, painted }) {
    if (!pending || locomotion !== pending.locomotion) return false;
    const candidate = pending; pending = null;
    if (!painted) {
      failedGeneration++; failedDraws++; motion = { ...motion, vx: 0, vy: 0 };
      previousNow = null; wasAdvancing = false;
      return false;
    }
    const packet = { clockKind: 'visual-root-v1', epoch: authority.epoch,
      geometrySeq: authority.visual.geometrySeq, sequence: ++sequence,
      rectGlobal: { ...candidate.rect }, distanceDip: candidate.distanceDip,
      originLocalDip: { x: candidate.rect.x - authority.visual.host.x, y: candidate.rect.y - authority.visual.host.y },
      selectedFrame: Number.isInteger(source?.frame) ? source.frame : 0,
      phase: Number.isFinite(source?.phase) ? source.phase : 0 };
    onCommit(packet);
    rect = candidate.rect; motion = candidate.motion; distanceDip = candidate.distanceDip;
    return true;
  }
  return { configure, sample, commit, authority: () => authority,
    snapshot: () => ({ rectGlobal: rect && { ...rect }, distanceDip, sequence, failedDraws,
      sourceEpoch: authority && `${authority.epoch}:${failedGeneration}` }) };
}
