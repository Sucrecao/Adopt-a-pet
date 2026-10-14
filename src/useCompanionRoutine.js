import { useEffect, useMemo, useRef, useState } from 'react';
import { createCompanionRoutineController, getBeijingPeriod } from './core/companion-routine.js';
import { useReducedMotion } from './Pet.jsx';

export default function useCompanionRoutine({ pet, state, quiet = false, enabled = true, ready = true }) {
  const controller = useMemo(() => createCompanionRoutineController(), [pet.id]);
  const reducedMotion = useReducedMotion();
  const inputs = useRef({});
  inputs.current = {
    ready,
    enabled: enabled && pet.animationMode === 'original-apng-v1',
    paused: state.settings.paused || reducedMotion,
    quiet: quiet || Boolean(state.desktop?.hidden),
    manualClip: state.originalAnimation?.clip,
    manualToken: state.originalAnimation?.startedAt,
  };
  const [routine, setRoutine] = useState(() => {
    const period = getBeijingPeriod(Date.now());
    return { period, clip: period.clip, token: 0, speech: '', manual: false };
  });
  const refresh = useRef(null);
  useEffect(() => {
    function sample() {
      if (!inputs.current.ready) return;
      setRoutine(controller.sample({ ...inputs.current, paused: inputs.current.paused || document.hidden, now: Date.now() }));
    }
    refresh.current = sample;
    sample();
    const timer = setInterval(sample, 500);
    document.addEventListener('visibilitychange', sample);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sample); refresh.current = null; };
  }, [controller]);
  useEffect(() => { refresh.current?.(); }, [ready, quiet, enabled, state.settings.paused, reducedMotion, state.desktop?.hidden, state.originalAnimation?.clip, state.originalAnimation?.startedAt]);
  return routine;
}
