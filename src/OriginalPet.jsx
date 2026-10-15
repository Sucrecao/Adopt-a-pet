import { useEffect, useRef } from 'react';
import { createOriginalAnimationController } from './core/original-animation.js';
import useHeadNuzzle from './useHeadNuzzle.js';
import './head-nuzzle.css';

const assetUrl = asset => `${import.meta.env.BASE_URL}${asset}`;

async function loadAtlas(asset, signal) {
  const response = await fetch(assetUrl(asset), { signal });
  if (!response.ok) throw new Error('Original atlas unavailable');
  const image = await createImageBitmap(await response.blob());
  if (signal.aborted) {
    image.close();
    throw new DOMException('Original atlas loading cancelled', 'AbortError');
  }
  return image;
}

/** Paints a complete source picture, without gait, mirroring, or interpolation. */
export default function OriginalPet({ pet, originalClip = 7, originalStartedAt = 0,
  size = 200, paused = false, ambient = true, static: staticPose = false, reducedMotion = false,
  locomotionRef, motionPaintRef, visualMotionRef, onPlaybackReady, onPlaybackComplete,
  headNuzzleEnabled = false, nuzzling = false, onHeadNuzzle,
  action, walking, facing, actionStartedAt, className = '', style, ...handlers }) {
  const elementRef = useRef(null), canvasRef = useRef(null), playbackRef = useRef(null);
  const actualRef = useRef(null);
  const nuzzle = useHeadNuzzle({ pet, elementRef, canvasRef, actualRef, nuzzling, onHeadNuzzle,
    enabled: headNuzzleEnabled && !paused && !staticPose && ambient !== false && !reducedMotion });
  const propsRef = useRef(null);
  propsRef.current = { originalClip, originalStartedAt, paused,
    static: staticPose || ambient === false, reducedMotion,
    locomotionRef, visualMotionRef, onPlaybackReady, onPlaybackComplete };

  useEffect(() => {
    const element = elementRef.current, canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const metadataAbort = new AbortController();
    let disposed = false, meta, active, atlasAbort, pendingClip, generation = 0;
    let request = null, loadState = 'loading', readinessKey;
    const selectedId = () => Number.isInteger(propsRef.current.originalClip)
      && propsRef.current.originalClip >= 1 && propsRef.current.originalClip <= 24
      ? propsRef.current.originalClip : meta?.defaultClip ?? 7;

    function reportNotReady() {
      const props = propsRef.current;
      const epoch = props.locomotionRef?.current?.prepareEpoch ?? 0;
      const key = `${epoch}:${Boolean(props.onPlaybackReady)}`;
      if (key !== readinessKey) {
        readinessKey = key;
        props.onPlaybackReady?.({ ready: false, epoch });
      }
    }

    function paint(now) {
      if (disposed) return;
      reportNotReady();
      const props = propsRef.current;
      element.dataset.loadState = loadState;
      element.dataset.originalClip = selectedId();
      if (actualRef.current) actualRef.current.ready = false;
      if (!active || !context) return;
      if (loadState === 'ready') active.token = props.originalStartedAt;
      const sample = active.controller.sample({ clip: active.clip,
        token: active.token, paused: props.paused || loadState !== 'ready',
        static: props.static, reducedMotion: props.reducedMotion }, now);
      const driver = props.visualMotionRef?.current;
      // Even a stationary original picture must commit its native surface geometry.
      const locomotion = driver?.sample(now, false);
      let painted = false;
      try {
        const column = sample.frame % active.clip.columns;
        const row = Math.floor(sample.frame / active.clip.columns);
        context.clearRect(0, 0, 320, 300);
        context.drawImage(active.image, column * 320, row * 300, 320, 300, 0, 0, 320, 300);
        painted = true;
        canvas.style.visibility = 'visible';
        element.style.backgroundSize = '0% 0%';
        element.dataset.frame = sample.frame;
        element.dataset.clip = sample.clip;
        element.dataset.elapsed = sample.elapsed;
        element.dataset.done = sample.done;
        element.dataset.sequence = sample.sequence;
      } catch {
        loadState = 'error';
        element.dataset.loadState = loadState;
      }
      const committed = locomotion ? driver.commit({ now, locomotion, sample, painted }) : !driver;
      if (painted && committed) actualRef.current = { clip: sample.clip, token: active.token,
        ready: loadState === 'ready' && active.clip.id === selectedId() && active.token === props.originalStartedAt };
      if (painted && committed && loadState === 'ready' && sample.done
        && active.clip.id === selectedId() && active.token === props.originalStartedAt
        && active.completedSequence !== sample.sequence) {
        active.completedSequence = sample.sequence;
        props.onPlaybackComplete?.({ species: pet.id, clip: active.clip.id,
          token: active.token, sequence: sample.sequence });
      }
    }

    function running() {
      const props = propsRef.current;
      return active && loadState === 'ready' && !props.paused && !props.static
        && !props.reducedMotion && element.dataset.done !== 'true';
    }
    function tick(now) {
      request = null;
      paint(now);
      if (!disposed && running()) request = requestAnimationFrame(tick);
    }
    function refresh() {
      if (disposed) return;
      paint(performance.now());
      if (!running() && request !== null) { cancelAnimationFrame(request); request = null; }
      if (running() && request === null) request = requestAnimationFrame(tick);
    }
    function select() {
      if (disposed || !meta) return;
      const id = selectedId();
      if (pendingClip === id) return;
      if (active?.clip.id === id) {
        if (atlasAbort) { generation++; atlasAbort.abort(); atlasAbort = null; }
        pendingClip = undefined;
        loadState = 'ready';
        return;
      }
      const clip = meta.clips.find(candidate => candidate.id === id);
      if (!clip) { loadState = 'error'; refresh(); return; }
      // Validate source timing before requesting its atlas.
      let controller;
      try { controller = createOriginalAnimationController({ clip }); }
      catch { loadState = 'error'; refresh(); return; }
      const currentGeneration = ++generation;
      atlasAbort?.abort();
      const abort = new AbortController();
      atlasAbort = abort; pendingClip = id; loadState = 'loading'; refresh();
      loadAtlas(clip.asset, abort.signal).then(image => {
        if (disposed || currentGeneration !== generation) { image.close(); return; }
        if (image.width !== clip.sourceSize[0] || image.height !== clip.sourceSize[1]
          || clip.frameSize[0] !== 320 || clip.frameSize[1] !== 300) {
          image.close(); throw new Error('Original atlas dimensions do not match source metadata');
        }
        const previous = active;
        active = { clip, image, controller };
        previous?.image.close();
        pendingClip = undefined; atlasAbort = null; loadState = 'ready';
        refresh();
      }).catch(error => {
        if (disposed || currentGeneration !== generation || error.name === 'AbortError') return;
        pendingClip = undefined; atlasAbort = null; loadState = 'error'; refresh();
      });
    }
    playbackRef.current = { refresh, select };
    if (motionPaintRef) motionPaintRef.current = refresh;
    refresh();
    fetch(assetUrl(pet.originalMetaAsset), { signal: metadataAbort.signal }).then(async response => {
      if (!response.ok) throw new Error('Original metadata unavailable');
      const value = await response.json();
      if (value.version !== 1 || value.mode !== 'original-apng-v1'
        || value.sourceSize?.[0] !== 320 || value.sourceSize?.[1] !== 300
        || !Array.isArray(value.clips)) throw new Error('Invalid original metadata');
      if (disposed) return;
      meta = value; select();
    }).catch(error => {
      if (disposed || error.name === 'AbortError') return;
      loadState = 'error'; refresh();
    });
    return () => {
      disposed = true; generation++;
      metadataAbort.abort(); atlasAbort?.abort();
      if (request !== null) cancelAnimationFrame(request);
      active?.image.close(); active = null;
      actualRef.current = null;
      playbackRef.current = null;
      if (motionPaintRef?.current === refresh) motionPaintRef.current = null;
    };
  }, [pet.id, pet.originalMetaAsset, motionPaintRef]);

  useEffect(() => {
    playbackRef.current?.select();
    playbackRef.current?.refresh();
  }, [originalClip, originalStartedAt, paused, ambient, staticPose, reducedMotion, visualMotionRef, onPlaybackReady]);

  const pointerHandlers = {};
  for (const [name, handler] of Object.entries(nuzzle.handlers)) pointerHandlers[name] = event => {
    handler(event); handlers[name]?.(event);
  };

  return <div ref={elementRef} className={`pet-sprite ${className}`}
    data-renderer="original-whole-frame" data-animation-mode="original-apng-v1"
    data-original-clip={originalClip} data-frame="0" data-clip={originalClip} data-load-state="loading"
    data-nuzzling={nuzzle.active} data-head-contact={nuzzle.touching}
    style={{ width: size, height: typeof size === 'number' ? size * 300 / 320 : size,
      backgroundImage: `url("${assetUrl(pet.neutralAsset ?? pet.asset)}")`,
      backgroundSize: 'contain', backgroundPosition: 'center', ...style, transform: 'none',
      '--nuzzle-direction': nuzzle.direction }}
    role="img" aria-label={pet.label} {...handlers} {...pointerHandlers}>
    <canvas ref={canvasRef} width={320} height={300} aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', visibility: 'hidden', pointerEvents: 'none' }} />
  </div>;
}
