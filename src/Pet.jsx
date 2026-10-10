import { useEffect, useRef, useState } from 'react';
import { animationFrame, atlasPosition, CLIPS, turnPose, spriteBaselineOffset } from './core/animation.js';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return reduced;
}

/** Keeps the original interaction surface; sprites swap only after successful decoding. */
export default function Pet({ pet, size = 200, action = 'idle', walking = false, facing = 1, paused = false, ambient = true, actionStartedAt, className = '', style, ...handlers }) {
  const reducedMotion = useReducedMotion();
  const [decodedAsset, setDecodedAsset] = useState(null);
  const [sample, setSample] = useState(() => ({ ...animationFrame({ action, paused, reducedMotion }), facing, scale: 1, opacity: 1 }));
  const clipTransition = useRef({ clip: null, started: 0 });
  const turn = useRef({ from: facing, to: facing, started: 0 });
  useEffect(() => {
    let cancelled = false;
    if (!pet.motionAsset) return;
    const image = new Image();
    image.onload = async () => {
      try {
        await image.decode();
        if (!cancelled) setDecodedAsset(pet.motionAsset);
      } catch { /* Retain the legacy atlas if decoding fails. */ }
    };
    image.src = `${import.meta.env.BASE_URL}${pet.motionAsset}`;
    return () => { cancelled = true; image.onload = null; };
  }, [pet.motionAsset]);
  useEffect(() => {
    const current = turnPose(turn.current.from, turn.current.to, performance.now() - turn.current.started);
    turn.current = { from: current.facing, to: facing, started: performance.now() };
  }, [facing]);
  useEffect(() => {
    let request;
    const started = performance.now() - (actionStartedAt ? Math.max(0, Date.now() - actionStartedAt) : 0);
    let ambientAction = 'idle', ambientStarted = started;
    let nextAmbient = performance.now() + 6500 + Math.random() * 6500;
    function tick(now) {
      const stopped = paused || reducedMotion;
      if (ambient && !stopped && !walking && action === 'idle') {
        if (ambientAction !== 'idle' && now - ambientStarted >= CLIPS[ambientAction].duration) {
          ambientAction = 'idle'; nextAmbient = now + 6500 + Math.random() * 6500;
        }
        if (ambientAction === 'idle' && now >= nextAmbient) {
          ambientAction = ['groom', 'stretch', 'hop', 'idle'][Math.floor(Math.random() * 4)];
          ambientStarted = now;
          if (ambientAction === 'idle') nextAmbient = now + 5000 + Math.random() * 6000;
        }
      }
      const frame = animationFrame({ action, walking, paused, reducedMotion, ambientAction, species: pet.id, elapsed: !ambient ? 0 : now - (ambientAction !== 'idle' ? ambientStarted : started) });
      if (clipTransition.current.clip !== frame.clip) {
        clipTransition.current = { clip: frame.clip, started: clipTransition.current.clip ? now : now - 140 };
      }
      const body = stopped ? { facing, scale: 1 } : turnPose(turn.current.from, turn.current.to, now - turn.current.started);
      setSample({ ...frame, ...body, opacity: stopped ? 1 : .82 + .18 * Math.min(1, (now - clipTransition.current.started) / 140) });
      if (!stopped && ambient) request = requestAnimationFrame(tick);
    }
    tick(performance.now());
    return () => cancelAnimationFrame(request);
  }, [pet.id, action, actionStartedAt, walking, facing, paused, ambient, reducedMotion]);
  const motion = sample.atlas === 'motion' && decodedAsset === pet.motionAsset;
  const legacyFrame = sample.atlas === 'legacy' ? sample.frame : walking && !paused && !reducedMotion ? (sample.frame % 2 ? 1 : 2) : action === 'trick' ? 4 : 0;
  const frame = motion ? sample.frame : legacyFrame;
  const position = atlasPosition(frame, !motion);
  const alignment = motion ? spriteBaselineOffset(pet.id, frame) / 256 * 100 : 0;
  return <div
    className={`pet-sprite ${sample.clip === 'walk' ? 'is-walking' : ''} ${pet.id === 'parrot' && sample.clip === 'walk' ? 'is-flying' : ''} ${action === 'rest' ? 'is-sleeping' : ''} ${className}`}
    data-frame={frame} data-clip={sample.clip} data-atlas={motion ? 'motion' : 'legacy'}
    style={{ width: size, height: size, backgroundImage: `url("${import.meta.env.BASE_URL}${motion ? pet.motionAsset : pet.asset}")`, backgroundSize: motion ? '600% 400%' : '300% 200%', backgroundPosition: `${position.x}% ${position.y}%`, '--pet-facing': sample.facing, transform: `translateY(calc(${sample.lift}px + ${alignment}%)) scale(${sample.facing * sample.scale}, ${sample.scaleY})`, opacity: sample.opacity, ...style }}
    role="img" aria-label={`${pet.label}${action === 'rest' ? '正在睡觉' : sample.clip === 'walk' ? '正在活动' : ''}`}
    {...handlers}
  />;
}
