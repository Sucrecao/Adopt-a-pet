import { createWholeHandoffController } from './whole-handoff.js';

const frames = (first, count) => Array.from({ length: count }, (_, index) => first + index);

export const WHOLE_CLIPS = {
  idle: { frames: frames(0, 6), durations: [1680,660,660,840,840,1920], loop: true },
  rest: { frames: [6,7], durations: [2800,2800], loop: true },
  walk: { frames: frames(8, 8), durations: [120,120,120,120,120,120,120,220], loop: true },
  turn: { frames: frames(16, 8), durations: Array(8).fill(100), loop: false },
  pet: { frames: frames(24, 4), durations: [300,600,500,400], loop: false },
  feed: { frames: frames(28, 4), durations: [300,350,350,500], loop: true },
  groom: { frames: frames(32, 4), durations: [300,500,500,400], loop: false },
  stretch: { frames: frames(36, 4), durations: [250,700,600,450], loop: false },
  hop: { frames: frames(40, 5), durations: [140,140,140,140,280], loop: false },
};
const duration = clip => clip.durations.reduce((sum, time) => sum + time, 0);
const mobileAction = action => action === 'idle' || action === 'play';

export function validateWholeClips(clips, frameCount = 48) {
  for (const name of Object.keys(WHOLE_CLIPS)) {
    const clip = clips?.[name];
    if (!clip || !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.some(frame => !Number.isInteger(frame) || frame < 0 || frame >= frameCount)) throw new Error(`Invalid whole ${name} frame selection`);
    if (!Array.isArray(clip.durations) || clip.durations.length !== clip.frames.length || clip.durations.some(time => !Number.isFinite(time) || time <= 0)) throw new Error(`Invalid whole ${name} durations`);
    if (typeof clip.loop !== 'boolean') throw new Error(`Invalid whole ${name} loop setting`);
  }
  if (duration(clips.turn) !== 800 || clips.turn.loop) throw new Error('Whole turn duration must be 800ms');
  return true;
}

export function validateWholeTransitions(transitions, frameCount = 48) {
  if (transitions === undefined) return true;
  if (!transitions || typeof transitions !== 'object' || Array.isArray(transitions)) throw new Error('Invalid whole transitions');
  for (const [name, paths] of Object.entries(transitions)) {
    if (!WHOLE_CLIPS[name] || !paths || typeof paths !== 'object' || Array.isArray(paths)) throw new Error('Invalid whole transition destination');
    for (const [kind, track] of Object.entries(paths)) {
      if (!['enter','exit'].includes(kind) || !track || !Array.isArray(track.frames) || !track.frames.length
        || track.frames.some(frame => !Number.isInteger(frame) || frame < 0 || frame >= frameCount)
        || !Array.isArray(track.durations) || track.durations.length !== track.frames.length
        || track.durations.some(time => !Number.isFinite(time) || time <= 0)) throw new Error('Invalid whole transition track');
    }
  }
  return true;
}

function frameAt(clip, elapsed, interpolate = false) {
  const total = duration(clip);
  let remaining = clip.loop ? Math.max(0, elapsed) % total : Math.min(Math.max(0, elapsed), total);
  let index = 0;
  while (index < clip.frames.length - 1 && remaining >= clip.durations[index]) remaining -= clip.durations[index++];
  const frame = clip.frames[index];
  const pose = { frame, done: !clip.loop && elapsed >= total };
  if (interpolate) {
    const nextFrame = clip.nextFrames?.[index] ?? clip.frames[index + 1] ?? (clip.loop ? clip.frames[0] : clip.successor ?? frame);
    const start = clip.mixStarts?.[index] ?? 0;
    const progress = Number.isFinite(remaining) ? Math.max(0, Math.min(1, remaining / clip.durations[index])) : 0;
    pose.nextFrame = nextFrame;
    pose.mix = nextFrame === frame ? 0 : start + (1 - start) * progress;
  }
  return pose;
}

function continueInterpolatedBridge(track, previous, pose, retracing) {
  const nextIndex = track.frames.indexOf(pose.frame);
  const sharedIndex = track.frames.indexOf(pose.nextFrame);
  const previousIndex = previous.track.frames.indexOf(pose.frame);
  if (previousIndex < 0 || (nextIndex < 0 && sharedIndex < 0)) return track;
  const suffix = nextIndex >= 0 ? nextIndex : sharedIndex + (retracing ? 1 : 0);
  const frames = track.frames.slice(suffix), durations = track.durations.slice(suffix);
  const spent = pose.elapsed - previous.track.durations.slice(0, previousIndex).reduce((sum, time) => sum + time, 0);
  const mix = pose.mix;
  if (retracing && mix > 0 && pose.nextFrame !== pose.frame) {
    const fullDuration = previous.track.durations[previousIndex] / (1 - (previous.track.mixStarts?.[previousIndex] ?? 0));
    return { frames: [pose.nextFrame, ...frames], durations: [mix * fullDuration, ...durations], mixStarts: [1 - mix], nextFrames: [pose.frame] };
  }
  if (!retracing) {
    const remaining = Math.max(Number.EPSILON, previous.track.durations[previousIndex] - spent);
    if (nextIndex < 0) return { frames: [pose.frame, ...frames], durations: [remaining, ...durations], mixStarts: [mix], nextFrames: [pose.nextFrame] };
    durations[0] = remaining;
    return { frames, durations, mixStarts: [mix], nextFrames: [pose.nextFrame] };
  }
  return { frames, durations };
}

/** One clock for intact poses; accepted displacement is the only walking clock. */
export function createWholeAnimationController({ species = 'cat', meta = {}, random = Math.random } = {}) {
  const discrete = meta.version === 7;
  if (discrete && (meta.renderMode !== 'discrete-whole-frame'
      || ['flow','handoffs','groundGait','groundRise'].some(key => meta[key] !== undefined))) {
    throw new Error('Invalid discrete whole-frame metadata');
  }
  const clips = { ...WHOLE_CLIPS, ...meta.clips };
  const frameCount = meta.frames?.length ?? 48;
  validateWholeClips(clips, frameCount);
  validateWholeTransitions(meta.transitions, frameCount);
  if ([5,6].includes(meta.version) && meta.handoffs?.version === 1) {
    return createWholeHandoffController({ species, meta, random, clips, frameAt,
      createLegacy: options => createWholeAnimationController(options) });
  }
  const transitions = meta.transitions ?? {};
  const interpolate = Boolean(meta.flow);
  const flowPairs = new Set((meta.flow?.pairs ?? []).map(([a,b]) => `${Math.min(a,b)}:${Math.max(a,b)}`));
  const sourcePairs = new Set((meta.flow?.sourcePairs ?? []).map(([a,b]) => `${Math.min(a,b)}:${Math.max(a,b)}`));
  const stride = meta.stride ?? 64;
  if (!Number.isFinite(stride) || stride <= 0) throw new Error('Invalid whole walking stride');
  const delay = () => 6500 + Math.max(0, Math.min(1, random())) * 6500;
  let clock = 0, lastNow, lastFrozen = false, lastDistance, lastEpoch, lastSize, lastMoving = false;
  let direction, turn, bridge, phase = 0, currentClip, clipStarted = 0, sequence = 0, previousAction, previousToken, lastPose;
  let automatic = 'idle', automaticStarted = 0, nextAutomatic = delay();
  let previousBusy = false;

  return {
    sample(props = {}, now = 0) {
      const locomotion = props.locomotion ?? {};
      const action = props.action ?? 'idle';
      const care = !mobileAction(action);
      const frozen = Boolean(props.paused || props.reducedMotion || props.ambient === false || locomotion.paused || locomotion.dragging);
      const facing = (locomotion.facing ?? props.facing) === -1 ? -1 : 1;
      const actualMoving = Boolean(locomotion.actualMoving ?? locomotion.moving ?? props.walking);
      const moving = discrete ? Boolean(locomotion.intentMoving ?? locomotion.moving ?? props.walking) : Boolean(locomotion.moving ?? props.walking);
      const distance = Number.isFinite(locomotion.distanceDip) ? locomotion.distanceDip : 0;
      const size = locomotion.spriteSizeDip > 0 ? locomotion.spriteSizeDip : 256;
      const epoch = locomotion.epoch;
      const rebase = lastDistance === undefined || epoch !== lastEpoch || size !== lastSize;
      const changedEpoch = lastDistance !== undefined && epoch !== lastEpoch;
      const dt = lastNow === undefined || frozen || lastFrozen ? 0 : Math.max(0, now - lastNow);
      const travel = rebase || frozen || lastFrozen ? 0 : Math.max(0, distance - lastDistance) * 256 / size;
      const wasMoving = lastMoving;
      lastNow = Math.max(lastNow ?? now, now);
      lastDistance = distance; lastEpoch = epoch; lastSize = size; lastMoving = moving;
      lastFrozen = frozen;
      if (frozen && lastPose) return { ...lastPose, stopped: true, ...(discrete ? { firstStepReady: false } : {}) };
      clock += dt;
      direction ??= facing;
      const reversed = facing !== (turn?.to ?? direction);
      if (reversed || changedEpoch) bridge = undefined;
      if (changedEpoch || species === 'parrot') { direction = facing; turn = undefined; }
      if (turn && facing !== turn.to) turn = undefined;
      if (!turn && facing !== direction && !frozen) {
        turn = { from: direction, to: facing, elapsed: 0 };
        automatic = 'idle'; nextAutomatic = clock + delay();
      } else if (turn && !care && mobileAction(previousAction ?? 'idle')) {
        turn.elapsed = Math.min(800, turn.elapsed + dt);
      }
      // A facing packet can reach playback after the scheduler's hold began.
      // Accepted moving travel proves that its stationary turn has finished.
      const acceptedMotion = !care && actualMoving && travel > 0;
      if (turn && (turn.elapsed >= 800 || acceptedMotion)) { direction = turn.to; turn = undefined; }
      if (!care && !turn && (moving || (wasMoving && mobileAction(previousAction ?? 'idle')))) phase += travel / stride;

      const busy = care || moving || Boolean(turn);
      if (busy) {
        if (automatic !== 'idle') nextAutomatic = clock + delay();
        automatic = 'idle';
      } else if (!frozen) {
        if (previousBusy) nextAutomatic = clock + delay();
        if (automatic !== 'idle' && clock - automaticStarted >= duration(clips[automatic])) {
          automatic = 'idle'; nextAutomatic = clock + delay();
        }
        if (automatic === 'idle' && clock >= nextAutomatic) {
          automatic = ['groom','stretch','hop','idle'][Math.min(3, Math.floor(Math.max(0, random()) * 4))];
          automaticStarted = clock;
          if (automatic === 'idle') nextAutomatic = clock + delay();
        }
      }
      previousBusy = busy;
      const requestedClip = action === 'trick' ? 'hop' : action;
      const clip = care ? (clips[requestedClip] ? requestedClip : 'idle') : turn ? 'turn' : moving ? 'walk' : automatic;
      const restarted = care && (previousAction !== action || previousToken !== props.actionStartedAt);
      if (currentClip !== clip || restarted) {
        const previousClip = currentClip;
        const previousBridge = bridge;
        currentClip = clip;
        clipStarted = clock - (care ? Math.max(0, Number(props.actionElapsed) || 0) : 0);
        bridge = undefined;
        // A bridge paints complete authored poses and belongs to the destination.
        // New care or movement replaces it immediately rather than queuing actions.
        let source, kind;
        const previousPaths = previousBridge?.name.split('+') ?? [];
        const exitFrames = transitions.rest?.exit?.frames;
        const waking = previousPaths.includes('rest.exit') && (exitFrames?.includes(lastPose?.frame) || (interpolate && exitFrames?.includes(lastPose?.nextFrame)));
        if (!turn && (!reversed || discrete)) {
          if ((clip === 'walk' && previousClip === 'rest') || (waking && ['walk','idle'].includes(clip))) { source = 'rest'; kind = 'exit'; }
          else if (clip === 'walk' || clip === 'rest') { source = clip; kind = 'enter'; }
          else if (clip === 'idle' && ['walk','rest'].includes(previousClip)) { source = previousClip; kind = 'exit'; }
        }
        let track = transitions[source]?.[kind];
        const retracing = previousPaths.includes(`${source}.${kind === 'enter' ? 'exit' : 'enter'}`);
        const continuing = previousPaths.includes(`${source}.${kind}`);
        const smoothBridge = interpolate && source === 'rest';
        if (track && (retracing || continuing) && smoothBridge && previousBridge.interpolated) {
          track = continueInterpolatedBridge(track, previousBridge, lastPose, retracing);
        } else if (track && (retracing || continuing)) {
          const nextIndex = track.frames.indexOf(lastPose?.frame), previousIndex = previousBridge.track.frames.indexOf(lastPose?.frame);
          if (nextIndex >= 0 && previousIndex >= 0) {
            const spent = lastPose.elapsed - previousBridge.track.durations.slice(0, previousIndex).reduce((sum,time) => sum + time, 0);
            const durations = track.durations.slice(nextIndex);
            // Retrace the part of this pose already displayed, retaining the
            // exact current frame even when reversal lands on its boundary.
            const remaining = continuing ? previousBridge.track.durations[previousIndex] - spent : spent;
            durations[0] = Math.max(1, Math.min(durations[0], remaining));
            track = { frames: track.frames.slice(nextIndex), durations };
          }
        }
        if (track) {
          let name = `${source}.${kind}`;
          if (clip === 'walk' && source === 'rest' && transitions.walk?.enter) {
            const enter = transitions.walk.enter;
            track = { ...track, frames: [...track.frames, ...enter.frames], durations: [...track.durations, ...enter.durations] };
            name += '+walk.enter';
          }
          bridge = { track: { ...track, loop: false, ...(smoothBridge ? { successor: clips[clip].frames[0] } : {}) }, started: clipStarted, name, interpolated: smoothBridge };
          if (clip !== 'walk') clipStarted += duration(track);
        }
        sequence++;
      }
      if (bridge && clock - bridge.started >= duration(bridge.track)) bridge = undefined;
      const elapsed = bridge ? Math.max(0, clock - bridge.started) : clip === 'turn' ? turn.elapsed : clip === 'walk' ? phase * duration(clips.walk) : Math.max(0, clock - clipStarted);
      const smooth = interpolate && (bridge ? bridge.interpolated : clip !== 'walk');
      const pose = frameAt(bridge?.track ?? clips[clip], elapsed, smooth);
      const pairKey = `${Math.min(pose.frame,pose.nextFrame)}:${Math.max(pose.frame,pose.nextFrame)}`;
      // Deliberate complete-source handoffs keep their reversible timing. The
      // renderer chooses one intact endpoint; unregistered walk bridges stay discrete.
      const missingBridgePair = bridge && smooth && !flowPairs.has(pairKey) && !sourcePairs.has(pairKey);
      if (interpolate && (!smooth || missingBridgePair)) { pose.nextFrame = pose.frame; pose.mix = 0; }
      if (discrete) { pose.nextFrame = pose.frame; pose.mix = 0; }
      previousAction = action; previousToken = props.actionStartedAt;
      lastPose = { ...pose, clip, facing: clip === 'turn' ? turn.from : direction, targetFacing: turn?.to ?? direction,
        elapsed, sequence, turning: Boolean(turn), turnRemaining: turn ? 800 - turn.elapsed : 0,
        transition: bridge?.name ?? '', transitionRemaining: bridge ? duration(bridge.track) - elapsed : 0,
        phase, motionDistance: distance, motionEpoch: epoch, sampleTime: now, stopped: frozen, species,
        ...(discrete ? { firstStepReady: moving && !care && !turn && !bridge && !frozen,
          preparing: moving && Boolean(care || turn || bridge || frozen) } : {}) };
      return lastPose;
    },
  };
}
