function validateClip(clip) {
  if (!clip || !Array.isArray(clip.durations) || !clip.durations.length
    || clip.durations.some(delay => !Number.isFinite(delay) || delay <= 0)
    || !Number.isInteger(clip.loopCount) || clip.loopCount < 0) {
    throw new Error('Invalid original animation clip');
  }
}

/** Source APNG timing: whole frames, original delays, and original repeat count. */
export function createOriginalAnimationController({ clip } = {}) {
  validateClip(clip);
  let selected = clip, token, previousNow, previousStopped = true, elapsed = 0, sequence = 0;
  return {
    sample(props = {}, now = 0) {
      const next = props.clip ?? selected;
      const stopped = Boolean(props.paused || props.static || props.reducedMotion);
      const timestamp = Math.max(previousNow ?? now, now);
      if (!sequence || next.id !== selected.id || props.token !== token) {
        validateClip(next);
        selected = next; token = props.token; elapsed = 0; sequence++;
      } else if (!stopped && !previousStopped) {
        elapsed += timestamp - previousNow;
      }
      previousNow = timestamp;
      previousStopped = stopped;
      const duration = selected.durations.reduce((sum, delay) => sum + delay, 0);
      const done = selected.loopCount > 0 && elapsed >= duration * selected.loopCount;
      if (done) elapsed = duration * selected.loopCount;
      const cycleTime = done ? duration : elapsed % duration;
      let frame = 0, boundary = selected.durations[0];
      while (frame < selected.durations.length - 1 && cycleTime >= boundary) {
        boundary += selected.durations[++frame];
      }
      return { clip: selected.id, frame, elapsed, done, sequence };
    },
  };
}
