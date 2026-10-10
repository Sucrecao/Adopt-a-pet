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
    return { atlas: 'legacy', frame: action === 'rest' ? 3 : 5, clip: action, done: false, lift: 0, scaleY: action === 'rest' ? breathing(5500) : 1 };
  }
  const clip = action === 'stretch' ? 'stretch' : action === 'trick' ? 'hop' : !stopped && walking ? 'walk' : !stopped && action === 'idle' && CLIPS[ambientAction] ? ambientAction : 'idle';
  const definition = species === 'parrot' && clip === 'stretch' ? CLIPS.parrotStretch : CLIPS[clip];
  const duration = clip === 'walk' && species === 'parrot' ? 640 : definition.duration;
  const time = stopped ? 0 : Math.max(0, elapsed);
  const progress = definition.loop ? time % duration / duration : Math.min(1, time / duration);
  let index = Math.min(definition.frames.length - 1, Math.floor(progress * definition.frames.length));
  if (definition.dwell) {
    let remaining = time % duration;
    index = 0;
    while (index < definition.dwell.length - 1 && remaining >= definition.dwell[index]) { remaining -= definition.dwell[index]; index++; }
  }
  const lift = stopped ? 0 : clip === 'walk' ? -Math.abs(Math.sin(progress * Math.PI * 4)) * (species === 'parrot' ? 2 : .7) : clip === 'hop' ? -Math.sin(progress * Math.PI) * 3 : 0;
  return { atlas: 'motion', frame: definition.frames[index], clip, done: !definition.loop && time >= duration, lift, scaleY: clip === 'idle' ? breathing(4300) : 1 };
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
