import { useEffect, useMemo, useRef, useState } from 'react';
import { createHeadNuzzleController, getHeadContact } from './core/head-nuzzle.js';

export default function useHeadNuzzle({ pet, elementRef, canvasRef, actualRef, enabled, nuzzling, onHeadNuzzle }) {
  const controller = useMemo(() => createHeadNuzzleController(), [pet.id]);
  const inputs = useRef({}), pointer = useRef(null), pressed = useRef(false), latchedHead = useRef(null);
  inputs.current = { enabled, nuzzling, onHeadNuzzle };
  const refresh = useRef(null);
  const [contactState, setContactState] = useState({ touching: false, active: false, direction: 1 });

  useEffect(() => {
    pointer.current = null; pressed.current = false; latchedHead.current = null;
    let timer = null;
    function sample() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      const current = inputs.current, actual = actualRef.current;
      const allowed = Boolean(current.enabled && actual?.ready && !document.hidden);
      const rect = allowed && pointer.current ? elementRef.current?.getBoundingClientRect() : null;
      // Keep the original entry region during the short gesture. In particular,
      // switching an upright 7 to 16 must not instantly lose the resting pointer.
      const latched = current.nuzzling && latchedHead.current;
      const clip = latched ? latchedHead.current.clip : actual?.clip;
      const alphaAt = latched ? () => 255 : (x, y) => {
        try { return canvasRef.current?.getContext('2d').getImageData(x, y, 1, 1).data[3] ?? 0; }
        catch { return 0; }
      };
      const contact = allowed && pointer.current ? getHeadContact({ species: pet.id, clip,
        rect, point: pointer.current, alphaAt }) : null;
      const result = controller.sample({ now: performance.now(), species: pet.id,
        clip: actual?.clip, token: actual?.token, contact, enabled: allowed, pressed: pressed.current });
      if (result.cue) {
        latchedHead.current = { clip: result.cue.clip };
        current.onHeadNuzzle?.(result.cue);
      }
      const active = Boolean(current.nuzzling && result.touching && [16, 22].includes(actual?.clip));
      setContactState(previous => previous.touching === result.touching && previous.active === active
        && previous.direction === result.direction ? previous
        : { touching: result.touching, active, direction: result.direction });
      // Only an enabled, present mouse needs polling to finish a stationary dwell
      // or track contact as the source moves. Card previews and quiet pets sleep.
      if (current.enabled && pointer.current && !pressed.current && !document.hidden) timer = setTimeout(sample, 50);
    }
    refresh.current = sample;
    sample();
    document.addEventListener('visibilitychange', sample);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', sample);
      refresh.current = null;
    };
  }, [controller, pet.id, elementRef, canvasRef, actualRef]);
  useEffect(() => { refresh.current?.(); }, [enabled, nuzzling]);

  function track(event) {
    if (event.pointerType === 'touch') { pointer.current = null; pressed.current = false; }
    else { pointer.current = { x: event.clientX, y: event.clientY }; pressed.current = event.buttons !== 0; }
    refresh.current?.();
  }
  function leave() { pointer.current = null; refresh.current?.(); }
  function press() { pressed.current = true; refresh.current?.(); }
  function cancel() { pointer.current = null; pressed.current = false; refresh.current?.(); }
  return { ...contactState, handlers: {
    onPointerEnter: track, onPointerMove: track, onPointerUp: track,
    onPointerLeave: leave, onPointerDown: press, onPointerCancel: cancel,
  } };
}
