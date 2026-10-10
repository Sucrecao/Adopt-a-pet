/** Continuous 6 × 4 atlas clips. Explicit interactions are one-shot. */
export const CLIPS = {
  walk: { frames: [0, 1, 2, 3, 4, 5, 6, 7], duration: 800, loop: true },
  idle: { frames: [8, 9, 10, 11], dwell: [2600, 450, 120, 700], duration: 3870, loop: true },
  groom: { frames: [12, 13, 14, 15], duration: 2200, loop: false },
  stretch: { frames: [16, 17, 18, 19], duration: 2600, loop: false },
  parrotStretch: { frames: [16, 17, 16, 15], duration: 2600, loop: false },
  hop: { frames: [20, 21, 22, 23], duration: 2800, loop: false },
};

export function atlasPosition(frame, legacy = false) {
  const columns = legacy ? 3 : 6, rows = legacy ? 2 : 4;
  const column = frame % columns, row = Math.floor(frame / columns);
  return { column, row, x: column / (columns - 1) * 100, y: row / (rows - 1) * 100 };
}

export function animationFrame({ action = 'idle', walking = false, elapsed = 0, paused = false, reducedMotion = false, ambientAction = 'idle', species = 'cat' } = {}) {
  const stopped = paused || reducedMotion;
  const breathing = period => stopped ? 1 : 1 + .008 * (1 - Math.cos(Math.max(0, elapsed) / period * Math.PI * 2)) / 2;
  if (action === 'rest' || action === 'pet' || action === 'feed') {
    const frame = action === 'rest' ? 3 : 5;
    return { atlas: 'legacy', frame, nextFrame: frame, mix: 0, clip: action, done: false, lift: 0, scaleY: action === 'rest' ? breathing(5500) : 1 };
  }
  const clip = action === 'stretch' ? 'stretch' : action === 'trick' ? 'hop' : !stopped && walking ? 'walk' : !stopped && action === 'idle' && CLIPS[ambientAction] ? ambientAction : 'idle';
  const definition = species === 'parrot' && clip === 'stretch' ? CLIPS.parrotStretch : CLIPS[clip];
  const duration = clip === 'walk' && species === 'parrot' ? 640 : definition.duration;
  const time = stopped ? 0 : Math.max(0, elapsed);
  const progress = definition.loop ? time % duration / duration : Math.min(1, time / duration);
  let index = Math.min(definition.frames.length - 1, Math.floor(progress * definition.frames.length));
  let mix = progress * definition.frames.length - index;
  if (definition.dwell) {
    let remaining = time % duration;
    index = 0;
    while (index < definition.dwell.length - 1 && remaining >= definition.dwell[index]) { remaining -= definition.dwell[index]; index++; }
    mix = remaining / definition.dwell[index];
  }
  const nextIndex = definition.loop ? (index + 1) % definition.frames.length : Math.min(index + 1, definition.frames.length - 1);
  if (stopped || nextIndex === index) mix = 0;
  const lift = stopped ? 0 : clip === 'walk' ? -Math.abs(Math.sin(progress * Math.PI * 4)) * (species === 'parrot' ? 2 : .7) : clip === 'hop' ? -Math.sin(progress * Math.PI) * 3 : 0;
  return { atlas: 'motion', frame: definition.frames[index], nextFrame: definition.frames[nextIndex], mix: Math.max(0, Math.min(1, mix)), clip, done: !definition.loop && time >= duration, lift, scaleY: clip === 'idle' ? breathing(4300) : 1 };
}

/** One persistent monotonic clock; props select clips without restarting gait. */
export function createAnimationController({ species = 'cat', random = Math.random } = {}) {
  let previousNow, previousProps, clock = 0, clipStarted = 0, currentClip, sequence = 0;
  let ambientAction = 'idle', ambientStarted = 0, nextAmbient = 6500 + random() * 6500;
  let turn;
  const stopped = props => props.paused || props.reducedMotion || props.ambient === false;
  return {
    sample(props = {}, now = 0) {
      const action = props.action ?? 'idle', facing = props.facing ?? 1;
      if (previousNow !== undefined && !stopped(previousProps)) clock += Math.max(0, now - previousNow);
      previousNow = Math.max(previousNow ?? now, now);
      // Quiet modes display the destination immediately, so resume must start
      // from that same settled facing rather than replaying an unfinished turn.
      if (!turn || stopped(props)) turn = { from: facing, to: facing, started: clock };
      else if (turn.to !== facing) {
        turn = { from: turnPose(turn.from, turn.to, clock - turn.started).facing, to: facing, started: clock };
      }
      if (!stopped(props) && !props.walking && action === 'idle') {
        if (ambientAction !== 'idle' && clock - ambientStarted >= CLIPS[ambientAction].duration) {
          ambientAction = 'idle'; nextAmbient = clock + 6500 + random() * 6500;
        }
        if (ambientAction === 'idle' && clock >= nextAmbient) {
          ambientAction = ['groom', 'stretch', 'hop', 'idle'][Math.min(3, Math.floor(random() * 4))];
          ambientStarted = clock;
          if (ambientAction === 'idle') nextAmbient = clock + 5000 + random() * 6000;
        }
      } else if (props.walking || action !== 'idle') {
        if (ambientAction !== 'idle') nextAmbient = clock + 6500 + random() * 6500;
        ambientAction = 'idle';
      }
      // Pause retains the active clip; a never-started quiet pet uses the static idle pose.
      const quietInitially = stopped(props) && !currentClip;
      const selected = animationFrame({ ...props, species, ambientAction, paused: quietInitially, reducedMotion: false, elapsed: 0 });
      const clip = stopped(props) && currentClip && previousProps?.action === action ? currentClip : selected.clip;
      const repeated = previousProps && !['idle', 'play'].includes(action) && previousProps.actionStartedAt !== props.actionStartedAt;
      if (clip !== currentClip || repeated) {
        currentClip = clip;
        clipStarted = clock - (!['idle', 'play'].includes(action) ? Math.max(0, props.actionElapsed ?? 0) : 0);
        sequence++;
      }
      const elapsed = props.ambient === false ? 0 : Math.max(0, clock - clipStarted);
      const frame = animationFrame({ action: ['rest', 'pet', 'feed'].includes(clip) ? clip : 'idle', walking: clip === 'walk', ambientAction: clip, species, elapsed });
      const body = stopped(props) ? { facing, scale: 1 } : turnPose(turn.from, turn.to, clock - turn.started);
      previousProps = props;
      return { ...frame, ...body, elapsed, sequence, ...(stopped(props) ? { lift: 0, scaleY: 1 } : {}) };
    },
  };
}

/** Mirror at the narrow middle of a 180ms turn, keeping the feet baseline fixed. */
export function turnPose(from, to, elapsed) {
  if (from === to) return { facing: to, scale: 1 };
  const progress = Math.max(0, Math.min(1, elapsed / 180));
  return { facing: progress < .5 ? from : to, scale: progress === 0 || progress === 1 ? 1 : 1 - .84 * Math.sin(progress * Math.PI) };
}

// Registration across clips uses the common grounded baseline measured from
// alpha bounds. The airborne hop frame retains the takeoff offset.
const frameBottoms = {
  cat: [236,236,237,239,236,238,237,237,246,245,244,245,236,235,235,236,233,235,224,224,223,182,224,224],
  dog: [237,237,229,236,225,228,226,224,239,238,238,238,224,224,222,226,221,221,217,218,218,175,217,218],
  parrot: [0,0,0,0,0,0,0,0,224,223,224,223,216,217,217,217,220,220,189,192,192,184,190,192],
};
const groundBaseline = { cat: 246, dog: 239, parrot: 224 };
export function spriteBaselineOffset(species, frame) {
  if (species === 'parrot' && frame < 8) return 0;
  const bottom = frameBottoms[species]?.[frame === 21 ? 20 : frame];
  return bottom === undefined ? 0 : groundBaseline[species] - bottom;
}
