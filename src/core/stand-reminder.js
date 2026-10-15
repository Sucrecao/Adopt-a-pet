export const STAND_REMINDER_INTERVAL = 30 * 60 * 1000;
export const STAND_REMINDER_DURATION = 12000;

/** One in-app reminder on an active clock; no persisted or overdue notifications. */
export function createStandReminderController() {
  let previousNow, previousAvailable = false, elapsed = 0, cue = null, sequence = 0;
  const snapshot = () => cue && { ...cue };
  const clear = now => {
    previousNow = now; previousAvailable = false; elapsed = 0; cue = null;
    return null;
  };
  return {
    sample({ now, enabled = true, available = true } = {}) {
      if (!Number.isFinite(now)) return clear(undefined);
      const delta = now - previousNow;
      if (!enabled || !available || delta < 0 || delta > 5000) return clear(now);
      if (previousAvailable && Number.isFinite(delta)) elapsed += delta;
      previousNow = now; previousAvailable = true;
      if (cue?.phase === 'visible' && now >= cue.until) cue = null;
      if (elapsed >= STAND_REMINDER_INTERVAL) {
        elapsed = 0;
        if (!cue) cue = { id: ++sequence, text: '陪我站起来一小会儿吧，伸伸腿再继续。', phase: 'pending' };
      }
      return snapshot();
    },
    present(id, now) {
      if (cue?.id === id && cue.phase === 'pending' && Number.isFinite(now)) {
        cue = { ...cue, phase: 'visible', until: now + STAND_REMINDER_DURATION };
      }
      return snapshot();
    },
    dismiss(id) {
      if (cue?.id === id) cue = null;
      return snapshot();
    },
    reset: clear,
  };
}
