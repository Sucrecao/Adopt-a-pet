import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createCompanionRoutineController, getBeijingPeriod } from './core/companion-routine.js';
import { useReducedMotion } from './Pet.jsx';

export default function useCompanionRoutine({ pet, state, quiet = false, enabled = true, ready = true }) {
  const controller = useMemo(() => createCompanionRoutineController(), [pet.id]);
  const currentController = useRef(controller), completion = useRef(null), headCue = useRef(null);
  currentController.current = controller;
  const reducedMotion = useReducedMotion();
  const inputs = useRef({});
  inputs.current = {
    ready,
    playbackAware: true,
    enabled: enabled && pet.animationMode === 'original-apng-v1',
    paused: state.settings.paused || reducedMotion,
    quiet: quiet || Boolean(state.desktop?.hidden),
    manualClip: state.originalAnimation?.clip,
    manualToken: state.originalAnimation?.startedAt,
  };
  const initialRoutine = useMemo(() => {
    const period = getBeijingPeriod(Date.now());
    return { period, clip: period.clip, token: 0, speech: '', manual: false, headNuzzle: false };
  }, [controller]);
  const [snapshot, setSnapshot] = useState({ controller, value: initialRoutine });
  const refresh = useRef(null);
  const onPlaybackComplete = useCallback(packet => {
    if (currentController.current !== controller || packet.species !== pet.id) return;
    completion.current = packet;
    refresh.current?.();
  }, [controller, pet.id]);
  const onHeadNuzzle = useCallback(packet => {
    if (currentController.current !== controller || packet.species !== pet.id) return;
    headCue.current = packet;
    refresh.current?.();
  }, [controller, pet.id]);
  useEffect(() => {
    completion.current = null; headCue.current = null;
    function sample() {
      if (!inputs.current.ready) return;
      setSnapshot({ controller, value: controller.sample({ ...inputs.current,
        playback: completion.current, headCue: headCue.current,
        paused: inputs.current.paused || document.hidden, now: Date.now() }) });
    }
    refresh.current = sample;
    sample();
    const timer = setInterval(sample, 500);
    document.addEventListener('visibilitychange', sample);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sample); refresh.current = null; };
  }, [controller]);
  useEffect(() => { refresh.current?.(); }, [ready, quiet, enabled, state.settings.paused, reducedMotion, state.desktop?.hidden, state.originalAnimation?.clip, state.originalAnimation?.startedAt]);
  return { ...(snapshot.controller === controller ? snapshot.value : initialRoutine), onPlaybackComplete, onHeadNuzzle };
}
