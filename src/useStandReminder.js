import { useEffect } from 'react';
import { bridge } from './bridge.js';

export default function useStandReminder({ state, ready, owner, blocked, interrupted }) {
  const cue = state.standReminder;
  const enabled = state.adopted && state.settings.standReminder && !state.settings.paused && !state.desktop?.hidden;
  useEffect(() => {
    if (!ready || !owner || !enabled || !cue) return;
    if (cue.phase === 'pending' && !blocked) bridge.presentStandReminder(cue.id).catch(() => {});
    else if (cue.phase === 'visible' && interrupted) bridge.dismissStandReminder(cue.id).catch(() => {});
  }, [ready, owner, enabled, cue?.id, cue?.phase, blocked, interrupted]);
  return ready && owner && enabled && cue?.phase === 'visible' && !interrupted ? cue : null;
}
