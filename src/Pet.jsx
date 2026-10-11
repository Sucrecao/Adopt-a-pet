import { useEffect, useRef, useState } from 'react';
import { animationFrame, atlasPosition, createAnimationController, spriteBaselineOffset } from './core/animation.js';
import { createSpriteRenderer } from './rendering/sprite-renderer.js';
import { createRigRenderer } from './rendering/rig-renderer.js';
import { createRigController } from './core/rig-motion.js';

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

function decodeImage(asset, signal) {
  return new Promise((resolve, reject) => {
    if (!asset) { reject(new Error('No atlas')); return; }
    const image = new Image();
    const cleanup = () => { image.onload = image.onerror = null; signal.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); image.src = ''; reject(new DOMException('Atlas loading cancelled', 'AbortError')); };
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    image.onload = async () => {
      try { await image.decode(); resolve(image); } catch (error) { reject(error); } finally { cleanup(); }
    };
    image.onerror = error => { cleanup(); reject(error); };
    image.src = `${import.meta.env.BASE_URL}${asset}`;
  });
}

async function loadFlow(species, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = setTimeout(cancel, 1500);
  try {
    const [meta, bytes] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}pets/${species}-flow.json`, { signal: controller.signal }),
      fetch(`${import.meta.env.BASE_URL}pets/${species}-flow.bin`, { signal: controller.signal }),
    ]);
    if (!meta.ok || !bytes.ok) return {};
    const [flowMeta, flowBytes] = await Promise.all([meta.json(), bytes.arrayBuffer()]);
    return { flowMeta, flowBytes };
  } catch { return {}; } finally { clearTimeout(timeout); signal.removeEventListener('abort', cancel); }
}

/** Props update the persistent playback, while each display frame paints imperatively. */
export default function Pet({ pet, size = 200, action = 'idle', walking = false, facing = 1, paused = false, ambient = true, actionStartedAt, locomotionRef, className = '', style, ...handlers }) {
  const reducedMotion = useReducedMotion();
  const elementRef = useRef(null), canvasRef = useRef(null), playbackRef = useRef(null);
  const propsRef = useRef(null);
  propsRef.current = { pet, action, walking, facing, paused, ambient, actionStartedAt, locomotionRef, reducedMotion, className, style, ariaLabel: handlers['aria-label'] };

  useEffect(() => {
    const element = elementRef.current, canvas = canvasRef.current;
    const controller = createAnimationController({ species: pet.id });
    const rigController = createRigController({ species: pet.id });
    const abort = new AbortController();
    let cancelled = false, request = null, renderer = null, images = null, motionLoaded = false, drawn = false, articulated = false;
    let actionToken, actionElapsed = 0;

    function paint(now) {
      if (cancelled) return;
      const props = propsRef.current;
      if (actionToken !== props.actionStartedAt) {
        actionToken = props.actionStartedAt;
        actionElapsed = actionToken ? Math.max(0, Date.now() - actionToken) : 0;
      }
      let sample = controller.sample({ ...props, actionElapsed }, now);
      if (articulated) {
        const locomotion = props.locomotionRef?.current || { epoch: 0, distanceDip: 0, spriteSizeDip: element.clientWidth, facing: props.facing, moving: props.walking };
        const automatic = props.action === 'idle' && !locomotion.moving;
        const action = automatic && ['groom', 'stretch', 'hop'].includes(sample.clip) ? sample.clip === 'hop' ? 'trick' : sample.clip : props.action;
        sample = rigController.sample({ ...props, action, actionElapsed: automatic ? sample.elapsed : actionElapsed, actionStartedAt: automatic ? sample.sequence : props.actionStartedAt, locomotion }, now);
      }
      const stopped = props.paused || props.reducedMotion || !props.ambient;
      if (renderer) {
        try {
          if (renderer.draw(articulated ? sample : { ...sample, stopped }, now) !== false) drawn = true;
        } catch {
          renderer.dispose(); renderer = null; drawn = false; articulated = false;
          sample = controller.sample({ ...props, actionElapsed }, now);
        }
      }
      const motion = !articulated && sample.atlas === 'motion' && motionLoaded;
      const frame = articulated ? sample.clip === 'walk' ? Math.floor((sample.phase % 1) * 64) : sample.frame : motion ? sample.frame : sample.atlas === 'legacy' ? sample.frame : sample.clip === 'walk' ? (sample.frame % 2 ? 1 : 2) : sample.clip === 'hop' ? 4 : 0;
      const position = atlasPosition(frame, !motion);
      const alignment = !drawn && motion ? spriteBaselineOffset(pet.id, frame) / 256 * 100 : 0;
      canvas.style.visibility = drawn ? 'visible' : 'hidden';
      element.style.backgroundImage = `url("${import.meta.env.BASE_URL}${motion ? pet.motionAsset : pet.asset}")`;
      element.style.backgroundSize = drawn ? '0% 0%' : motion ? '600% 400%' : '300% 200%';
      element.style.backgroundPosition = `${position.x}% ${position.y}%`;
      element.style.setProperty('--pet-facing', sample.facing);
      if (!props.style?.transform) element.style.transform = articulated ? 'none' : `translateY(calc(${sample.lift}px + ${alignment}%)) scale(${sample.facing * sample.scale}, ${sample.scaleY})`;
      element.dataset.frame = frame;
      element.dataset.nextFrame = motion ? sample.nextFrame : frame;
      element.dataset.mix = motion ? sample.mix : 0;
      element.dataset.elapsed = sample.elapsed;
      element.dataset.sequence = sample.sequence;
      element.dataset.turning = articulated ? String(sample.turning) : 'false';
      element.dataset.sampleTime = sample.sampleTime ?? now;
      element.dataset.facing = sample.facing;
      element.dataset.turnRemaining = sample.turnRemaining ?? 0;
      element.dataset.motionDistance = sample.motionDistance ?? '';
      element.dataset.motionEpoch = sample.motionEpoch ?? '';
      element.dataset.orientation = sample.orientation ?? sample.facing;
      element.dataset.phase = sample.phase ?? '';
      element.dataset.contacts = articulated ? JSON.stringify(sample.legs.filter(leg => leg.planted).map(leg => ({ id: leg.id, supportGeneration: leg.supportGeneration, x: leg.foot.x, y: leg.foot.y }))) : '';
      element.dataset.clip = sample.clip;
      element.dataset.atlas = articulated ? 'rig' : motion ? 'motion' : 'legacy';
      element.className = `pet-sprite ${sample.clip === 'walk' ? 'is-walking' : ''} ${pet.id === 'parrot' && sample.clip === 'walk' ? 'is-flying' : ''} ${props.action === 'rest' ? 'is-sleeping' : ''} ${props.className}`;
      if (!props.ariaLabel) element.setAttribute('aria-label', `${pet.label}${props.action === 'rest' ? '正在睡觉' : sample.clip === 'walk' ? '正在活动' : ''}`);
    }
    function tick(now) {
      request = null;
      paint(now);
      const props = propsRef.current;
      if (!cancelled && !props.paused && !props.reducedMotion && props.ambient) request = requestAnimationFrame(tick);
    }
    function refresh() {
      if (cancelled) return;
      paint(performance.now());
      const props = propsRef.current;
      const active = !props.paused && !props.reducedMotion && props.ambient;
      if (!active && request !== null) { cancelAnimationFrame(request); request = null; }
      if (active && request === null) request = requestAnimationFrame(tick);
    }
    function createRenderer() {
      if (cancelled || !images) return;
      renderer?.dispose(); renderer = null; drawn = false;
      try {
        articulated = Boolean(images.rigImage && images.rigMeta);
        renderer = articulated ? createRigRenderer(canvas, { species: pet.id, ...images }) : createSpriteRenderer(canvas, { species: pet.id, ...images, onContextLost: () => {
          if (cancelled) return;
          renderer?.dispose(); drawn = false; renderer = null;
          refresh();
        } });
      } catch { articulated = false; /* The decoded CSS atlas remains a usable fallback. */ }
      refresh();
    }
    const restored = () => createRenderer();
    canvas.addEventListener('webglcontextrestored', restored);
    playbackRef.current = { refresh };
    refresh();
    Promise.allSettled([decodeImage(pet.motionAsset, abort.signal), decodeImage(pet.asset, abort.signal),
      decodeImage(pet.rigAsset, abort.signal),
      fetch(`${import.meta.env.BASE_URL}pets/${pet.id}-rig.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null),
      decodeImage(pet.id === 'parrot' ? 'pets/parrot-perch-rig.png' : null, abort.signal),
      decodeImage(`pets/${pet.id}-head-rig.png`, abort.signal),
      fetch(`${import.meta.env.BASE_URL}pets/${pet.id}-head-rig.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null),
    ]).then(async ([motion, legacy, rig, meta, perch, head, headMeta]) => {
      if (cancelled) return;
      motionLoaded = motion.status === 'fulfilled';
      if (legacy.status === 'fulfilled' && (motionLoaded || rig.status === 'fulfilled')) {
        images = { motionImage: motionLoaded ? motion.value : undefined, legacyImage: legacy.value };
        refresh();
        const extra = rig.status === 'fulfilled' && meta.status === 'fulfilled' && meta.value
          ? { rigImage: rig.value, rigMeta: meta.value, headImage: head.status === 'fulfilled' ? head.value : undefined, headMeta: headMeta.status === 'fulfilled' ? headMeta.value : undefined, perchImage: perch.status === 'fulfilled' ? perch.value : undefined } : await loadFlow(pet.id, abort.signal);
        if (!cancelled) { images = { ...images, ...extra }; createRenderer(); }
      } else refresh();
    });
    return () => {
      cancelled = true;
      abort.abort();
      if (request !== null) cancelAnimationFrame(request);
      canvas.removeEventListener('webglcontextrestored', restored);
      renderer?.dispose();
      playbackRef.current = null;
    };
  }, [pet.id, pet.asset, pet.motionAsset, pet.rigAsset]);

  useEffect(() => { playbackRef.current?.refresh(); }, [action, walking, facing, paused, ambient, actionStartedAt, reducedMotion, className, style, handlers['aria-label']]);
  const initial = animationFrame({ action, paused, reducedMotion, species: pet.id });
  const frame = initial.atlas === 'legacy' ? initial.frame : 0;
  const position = atlasPosition(frame, true);
  return <div ref={elementRef}
    className={`pet-sprite ${className}`} data-frame={frame} data-clip={initial.clip} data-atlas="legacy"
    style={{ width: size, height: size, backgroundImage: `url("${import.meta.env.BASE_URL}${pet.asset}")`, backgroundSize: '300% 200%', backgroundPosition: `${position.x}% ${position.y}%`, '--pet-facing': facing, ...style }}
    role="img" aria-label={`${pet.label}${action === 'rest' ? '正在睡觉' : ''}`} {...handlers}
  ><canvas key={pet.id} ref={canvasRef} width={256} height={256} aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%', visibility: 'hidden', pointerEvents: 'none' }} /></div>;
}
