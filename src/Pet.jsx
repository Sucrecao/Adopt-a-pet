import { useEffect, useRef, useState } from 'react';
import OriginalPet from './OriginalPet.jsx';
import { animationFrame, atlasPosition, createAnimationController, spriteBaselineOffset } from './core/animation.js';
import { createSpriteRenderer } from './rendering/sprite-renderer.js';
import { createRigRenderer } from './rendering/rig-renderer.js';
import { createRigController } from './core/rig-motion.js';
import { createWholeAnimationController } from './core/whole-animation.js';
import { createWholeRenderer, validateWholeAtlas } from './rendering/whole-renderer.js';
import { validateWholeContours } from './rendering/whole-flow-renderer.js';
import { createLinePageCache } from './rendering/line-pages.js';

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

async function decodeBitmap(asset,signal) {
  const response=await fetch(`${import.meta.env.BASE_URL}${asset}`,{signal});
  if(!response.ok)throw new Error('Whole source image unavailable');
  const bitmap=await createImageBitmap(await response.blob());
  if(signal.aborted){bitmap.close();throw new DOMException('Atlas loading cancelled','AbortError');}
  return bitmap;
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

async function loadWholeFlow(meta, signal) {
  if (!meta?.flow?.asset) return undefined;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = setTimeout(cancel, 1500);
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${meta.flow.asset}`, { signal: controller.signal });
    return response.ok ? await response.arrayBuffer() : undefined;
  } catch { return undefined; }
  finally { clearTimeout(timeout); signal.removeEventListener('abort', cancel); }
}

/** Props update the persistent playback, while each display frame paints imperatively. */
function AuthoredPet({ pet, size = 200, action = 'idle', walking = false, facing = 1, paused = false, ambient = true, actionStartedAt, locomotionRef, motionPaintRef, visualMotionRef, onPlaybackReady, className = '', style, ...handlers }) {
  const wholeFrameMode = pet.wholeRenderMode === 'discrete-whole-frame';
  const reducedMotion = useReducedMotion();
  const elementRef = useRef(null), canvasRef = useRef(null), playbackRef = useRef(null);
  const propsRef = useRef(null);
  propsRef.current = { pet, action, walking, facing, paused, ambient, actionStartedAt, locomotionRef, visualMotionRef, onPlaybackReady, reducedMotion, className, style, ariaLabel: handlers['aria-label'] };

  useEffect(() => {
    const element = elementRef.current, canvas = canvasRef.current;
    const controller = createAnimationController({ species: pet.id });
    const rigController = createRigController({ species: pet.id });
    const abort = new AbortController();
    let cancelled = false, request = null, renderer = null, images = null, motionLoaded = false, drawn = false, articulated = false, whole = false, wholePending = true, wholeFailed = false, wholeController;
    let actionToken, actionElapsed = 0, previousRigPose, readinessKey, presentedStepReady = false, lastPresentedSample, lineWaitingPage;
    let linePages;

    function setValue(target, key, value) {
      if (!wholeFrameMode || target[key] !== String(value)) target[key] = value;
    }

    function paint(now) {
      if (cancelled) return;
      const props = propsRef.current;
      if (actionToken !== props.actionStartedAt) {
        actionToken = props.actionStartedAt;
        actionElapsed = actionToken ? Math.max(0, Date.now() - actionToken) : 0;
      }
      const visualDriver=whole?props.visualMotionRef?.current:null;
      const candidate=visualDriver?.sample(now, presentedStepReady && !props.paused && !props.reducedMotion && props.ambient);
      const locomotion = candidate || props.locomotionRef?.current || { epoch: 0, distanceDip: 0, spriteSizeDip: element.clientWidth, facing: props.facing, moving: props.walking };
      // Ambient care must not outlast the movement controller's turn hold.
      // The walking scheduler cancels it; explicit care still pauses the rig.
      const dogTurn = Boolean(articulated && pet.id === 'dog' && props.action === 'idle' && previousRigPose
        && (previousRigPose.turning || locomotion.facing !== previousRigPose.facing));
      let sample = whole ? wholeController.sample({ ...props, actionElapsed, locomotion }, now)
        : controller.sample({ ...props, walking: props.walking || dogTurn, actionElapsed }, now);
      if (articulated) {
        const automatic = props.action === 'idle' && !locomotion.moving && !dogTurn;
        const action = automatic && ['groom', 'stretch', 'hop'].includes(sample.clip) ? sample.clip === 'hop' ? 'trick' : sample.clip : props.action;
        sample = rigController.sample({ ...props, action, actionElapsed: automatic ? sample.elapsed : actionElapsed, actionStartedAt: automatic ? sample.sequence : props.actionStartedAt, locomotion }, now);
        previousRigPose = sample;
      }
      const stopped = props.paused || props.reducedMotion || !props.ambient;
      if(linePages&&whole) {
        const meta=images.wholeMeta;
        const needed=props.ambient===false?[meta.neutralFrame]:sample.transition==='walk.settle'?meta.authoredStops[sample.stopSlot]?.frames??[sample.frame]:meta.clips[sample.clip]?.frames??[sample.frame];
        const pinned=[meta.neutralFrame,sample.frame,...needed];
        if(sample.clip==='walk')pinned.push(...meta.clips.walk.frames);
        linePages.pinFrames(pinned);
        linePages.prefetchFrames(pinned);
        if(sample.clip==='walk'&&!sample.transition) {
          const slot=Math.floor((sample.phase%1)*meta.clips.walk.frames.length);
          const nearby=Array.from({length:5},(_,i)=>meta.authoredStops[(slot+i)%meta.authoredStops.length].frames[1]);
          linePages.prefetchFrames(nearby);
        }
        const stats=linePages.stats();setValue(element.dataset,'decodedBytes',stats.bytes);setValue(element.dataset,'decodedPages',stats.pages);
      }
      let painted = false, paintedErrorRollback = false;
      if (renderer) {
        try {
          painted = renderer.draw(articulated || whole ? sample : { ...sample, stopped }, now) !== false;
          if (painted) drawn = true;
          else if (wholeFrameMode && !linePages) drawn = false;
        } catch {
          wholeController?.rollback?.();
          paintedErrorRollback=true;
          if(images.wholeMeta?.authoring!=='line-pet-v1') {
            renderer.dispose(); renderer = null; drawn = false; articulated = false; whole = false;
            if (wholeFrameMode) wholeFailed = true;
            sample = controller.sample({ ...props, actionElapsed }, now);
          }
        }
      }
      if (whole && !painted && !paintedErrorRollback) wholeController?.rollback?.();
      if (candidate) visualDriver.commit({now,locomotion,sample,painted:whole&&painted});
      presentedStepReady=Boolean(whole&&painted&&sample.firstStepReady);
      if(whole&&painted)lastPresentedSample=sample;
      else if(whole&&lastPresentedSample)sample=lastPresentedSample;
      const motion = !wholeFrameMode && !articulated && !whole && sample.atlas === 'motion' && motionLoaded;
      const frame = whole ? sample.frame : wholeFrameMode ? 0 : articulated ? sample.clip === 'walk' ? Math.floor((sample.phase % 1) * 64) : sample.frame : motion ? sample.frame : sample.atlas === 'legacy' ? sample.frame : sample.clip === 'walk' ? (sample.frame % 2 ? 1 : 2) : sample.clip === 'hop' ? 4 : 0;
      const position = atlasPosition(frame, !motion);
      const alignment = !drawn && motion ? spriteBaselineOffset(pet.id, frame) / 256 * 100 : 0;
      setValue(canvas.style, 'visibility', drawn ? 'visible' : 'hidden');
      setValue(element.style, 'backgroundImage', `url("${import.meta.env.BASE_URL}${motion ? pet.motionAsset : pet.asset}")`);
      setValue(element.style, 'backgroundSize', drawn ? '0% 0%' : pet.neutralAsset ? '100% 100%' : motion ? '600% 400%' : '300% 200%');
      setValue(element.style, 'backgroundPosition', pet.neutralAsset?'50% 50%':`${position.x}% ${position.y}%`);
      if (!wholeFrameMode || element.style.getPropertyValue('--pet-facing') !== String(sample.facing)) element.style.setProperty('--pet-facing', sample.facing);
      if (!props.style?.transform) setValue(element.style, 'transform', articulated || whole ? 'none' : wholeFrameMode ? `scaleX(${locomotion.facing === -1 ? -1 : 1})` : `translateY(calc(${sample.lift}px + ${alignment}%)) scale(${sample.facing * sample.scale}, ${sample.scaleY})`);
      setValue(element.dataset, 'frame', frame);
      setValue(element.dataset, 'nextFrame', motion || whole ? sample.nextFrame ?? frame : frame);
      setValue(element.dataset, 'mix', motion || whole ? sample.mix ?? 0 : 0);
      setValue(element.dataset, 'elapsed', sample.elapsed);
      setValue(element.dataset, 'sequence', sample.sequence);
      setValue(element.dataset, 'turning', articulated || whole ? String(sample.turning) : 'false');
      setValue(element.dataset, 'sampleTime', sample.sampleTime ?? now);
      setValue(element.dataset, 'facing', sample.targetFacing ?? sample.facing);
      setValue(element.dataset, 'turnRemaining', sample.turnRemaining ?? 0);
      setValue(element.dataset, 'transition', sample.transition ?? '');
      setValue(element.dataset, 'transitionRemaining', sample.transitionRemaining ?? 0);
      setValue(element.dataset, 'motionDistance', sample.motionDistance ?? '');
      setValue(element.dataset, 'motionEpoch', sample.motionEpoch ?? '');
      setValue(element.dataset, 'orientation', sample.orientation ?? sample.facing);
      setValue(element.dataset, 'phase', sample.phase ?? '');
      setValue(element.dataset, 'ground', sample.ground ? JSON.stringify(sample.ground) : '');
      setValue(element.dataset, 'contacts', articulated ? JSON.stringify(sample.legs.filter(leg => leg.planted).map(leg => ({ id: leg.id, supportGeneration: leg.supportGeneration, x: leg.foot.x, y: leg.foot.y }))) : whole && sample.contacts ? JSON.stringify(sample.contacts) : '');
      setValue(element.dataset, 'clip', sample.clip);
      setValue(element.dataset, 'atlas', whole ? 'whole' : wholeFrameMode ? 'whole-fallback' : articulated ? 'rig' : motion ? 'motion' : 'legacy');
      setValue(element.dataset, 'loadState', wholeFailed ? 'failed' : wholePending ? 'pending' : whole && drawn ? 'ready' : 'fallback');
      if(props.onPlaybackReady) {
        const preparing = wholePending || whole && [5,6].includes(images.wholeMeta.version)
          && ((sample.turning && locomotion?.intentMoving)
            || (sample.clip === 'walk' && (Boolean(sample.transition) || sample.ground?.mode === 'enter')));
        const ready = wholeFrameMode ? Boolean(whole && drawn && !wholeFailed && (!locomotion?.intentMoving || sample.firstStepReady)) : !preparing;
        const epoch = locomotion?.prepareEpoch ?? 0, key = `${epoch}:${ready}`;
        if(key !== readinessKey) { readinessKey = key; props.onPlaybackReady({ready,epoch}); }
      }
      setValue(element, 'className', `pet-sprite ${sample.clip === 'walk' ? 'is-walking' : ''} ${pet.id === 'parrot' && sample.clip === 'walk' ? 'is-flying' : ''} ${props.action === 'rest' ? 'is-sleeping' : ''} ${props.className}`);
      if (!props.ariaLabel) {
        const label = `${pet.label}${props.action === 'rest' ? '正在睡觉' : sample.clip === 'walk' ? '正在活动' : ''}`;
        if (!wholeFrameMode || element.getAttribute('aria-label') !== label) element.setAttribute('aria-label', label);
      }
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
        whole = Boolean(images.wholeImages && images.wholeMeta);
        articulated = !wholeFrameMode && !whole && Boolean(images.rigImage && images.rigMeta);
        if (whole) {
          wholeController ||= createWholeAnimationController({ species: pet.id, meta: images.wholeMeta });
          renderer = createWholeRenderer(canvas, { image: images.wholeImages[0], images: images.wholeImages, meta: images.wholeMeta, flowBytes: images.wholeFlowBytes, surfaceImages: images.wholeSurfaceImages,contourImages:images.wholeContourImages,
            sourceProvider:linePages?page=>{const source=linePages.get(page);if(!source){lineWaitingPage=page;linePages.load(page).catch(()=>{});}return source;}:undefined });
          delete canvas.dataset.limbSkin; delete canvas.dataset.headRig; delete canvas.dataset.bodyRig;
        } else if (!wholeFrameMode) renderer = articulated ? createRigRenderer(canvas, { species: pet.id, ...images }) : createSpriteRenderer(canvas, { species: pet.id, ...images, onContextLost: () => {
          if (cancelled) return;
          renderer?.dispose(); drawn = false; renderer = null;
          refresh();
        } });
      } catch { articulated = false; whole = false; if (wholeFrameMode) wholeFailed = true; /* The complete CSS photograph remains visible. */ }
      refresh();
    }
    const restored = () => createRenderer();
    canvas.addEventListener('webglcontextrestored', restored);
    playbackRef.current = { refresh };
    // Native window travel and the planted paws consume the same packet before
    // the next display tick. rAF still advances stationary care and handoffs.
    if (motionPaintRef) motionPaintRef.current = refresh;
    refresh();
    // Complete-frame artwork can paint before the older optional rig group finishes loading.
    const wholeAbort=new AbortController();
    const cancelWhole=()=>wholeAbort.abort();
    abort.signal.addEventListener('abort',cancelWhole,{once:true});
    const wholeTimeout=setTimeout(cancelWhole,3000);
    fetch(`${import.meta.env.BASE_URL}${pet.wholeMetaAsset}`, { signal: wholeAbort.signal }).then(response => response.ok ? response.json() : null).then(async meta => {
      if (wholeFrameMode && (meta?.version !== 7 || meta.renderMode !== 'discrete-whole-frame')) throw new Error('Complete-frame resource mode does not match');
      const assets = [2,3,4,5,6,7].includes(meta?.version) ? meta.pages?.map(page => page.asset) : [pet.wholeAsset];
      if (!assets?.length) throw new Error('No whole atlas pages');
      if(meta.authoring==='line-pet-v1') {
        clearTimeout(wholeTimeout);
        const placeholders=meta.pages.map(page=>({width:page.sourceSize[0],height:page.sourceSize[1]}));
        validateWholeAtlas(placeholders,meta);
        linePages=createLinePageCache({meta,loadImage:asset=>decodeBitmap(asset,wholeAbort.signal),onReady:page=>{if(!cancelled&&lineWaitingPage===page){lineWaitingPage=undefined;refresh();}}});
        linePages.pinFrames([meta.neutralFrame]);
        await linePages.load(meta.frames[meta.neutralFrame].page);
        if(cancelled)return;
        images={...images,wholeImages:placeholders,wholeMeta:meta};createRenderer();return;
      }
      const surface=meta?.version===6?meta.groundGait:null;
      const [decoded, wholeFlowBytes,wholeSurfaceImages,wholeContourImages] = await Promise.all([
        Promise.all(assets.map(asset => decodeImage(asset, wholeAbort.signal))), wholeFrameMode ? undefined : loadWholeFlow(meta, wholeAbort.signal),
        surface?Promise.all([decodeImage(surface.skinAsset,wholeAbort.signal),decodeImage(surface.bodyAsset,wholeAbort.signal)])
          .then(([skinImage,bodyImage])=>{
            if(skinImage.naturalWidth!==surface.sourceSize[0]||skinImage.naturalHeight!==surface.sourceSize[1]
                ||bodyImage.naturalWidth!==256||bodyImage.naturalHeight!==256)throw new Error('Ground surface dimensions do not match');
            return {skinImage,bodyImage};
          }):undefined,
        Promise.all((meta.flow?.contours??[]).map(c=>decodeImage(c.asset,wholeAbort.signal))),
      ]);
      if (cancelled) return;
      if (!validateWholeAtlas(decoded, meta)) throw new Error('Invalid complete-frame atlas');
      validateWholeContours(meta,wholeContourImages);
      images = { ...images, wholeImages: decoded, wholeMeta: meta, wholeFlowBytes,wholeSurfaceImages,wholeContourImages };
      createRenderer();
    }).catch(() => { if (!cancelled && wholeFrameMode) wholeFailed = true; }).finally(() => {
      wholePending = false;
      clearTimeout(wholeTimeout);
      abort.signal.removeEventListener('abort',cancelWhole);
      if (!cancelled && !whole && images) createRenderer();
      if(!cancelled)refresh();
    });
    if (!wholeFrameMode) Promise.allSettled([decodeImage(pet.motionAsset, abort.signal), decodeImage(pet.asset, abort.signal),
      decodeImage(pet.rigAsset, abort.signal),
      fetch(`${import.meta.env.BASE_URL}pets/${pet.id}-rig.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null),
      decodeImage(pet.id === 'parrot' ? 'pets/parrot-perch-rig.png' : null, abort.signal),
      decodeImage(`pets/${pet.id}-head-rig.png`, abort.signal),
      fetch(`${import.meta.env.BASE_URL}pets/${pet.id}-head-rig.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null),
      decodeImage(pet.id === 'parrot' ? null : 'pets/quadruped-legs-v2.png', abort.signal),
      pet.id === 'parrot' ? Promise.resolve(null) : fetch(`${import.meta.env.BASE_URL}pets/quadruped-legs-v2.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null),
      decodeImage(pet.id === 'dog' ? 'pets/dog-head-rig-v2.png' : null, abort.signal),
      pet.id === 'dog' ? fetch(`${import.meta.env.BASE_URL}pets/dog-head-rig-v2.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null) : Promise.resolve(null),
      decodeImage(pet.id === 'cat' ? 'pets/cat-cohesive-v2.png' : null, abort.signal),
      pet.id === 'cat' ? fetch(`${import.meta.env.BASE_URL}pets/cat-head-rig-v2.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null) : Promise.resolve(null),
      pet.id === 'cat' ? fetch(`${import.meta.env.BASE_URL}pets/cat-limb-rig-v2.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null) : Promise.resolve(null),
      decodeImage(pet.id === 'cat' ? 'pets/cat-limbs-v3.png' : null, abort.signal),
      pet.id === 'cat' ? fetch(`${import.meta.env.BASE_URL}pets/cat-head-rig-v3.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null) : Promise.resolve(null),
      pet.id === 'cat' ? fetch(`${import.meta.env.BASE_URL}pets/cat-limb-rig-v3.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null) : Promise.resolve(null),
      decodeImage(pet.id === 'dog' ? 'pets/dog-cohesive-v3.png' : null, abort.signal),
      pet.id === 'dog' ? fetch(`${import.meta.env.BASE_URL}pets/dog-head-rig-v3.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null) : Promise.resolve(null),
      pet.id === 'dog' ? fetch(`${import.meta.env.BASE_URL}pets/dog-limb-rig-v3.json`, { signal: abort.signal }).then(response => response.ok ? response.json() : null) : Promise.resolve(null),
    ]).then(async ([motion, legacy, rig, meta, perch, head, headMeta, limb, limbMeta, dogHead, dogHeadMeta, catImage, catHeadMeta, catLimbMeta, catLegs, catHeadV3, catLimbsV3, dogImageV3, dogHeadV3, dogLimbsV3]) => {
      if (cancelled) return;
      motionLoaded = motion.status === 'fulfilled';
      if (legacy.status === 'fulfilled' && (motionLoaded || rig.status === 'fulfilled')) {
        images = { ...images, motionImage: motionLoaded ? motion.value : undefined, legacyImage: legacy.value };
        refresh();
        const registeredDogHead = dogHead.status === 'fulfilled' && dogHead.value && dogHeadMeta.status === 'fulfilled' && dogHeadMeta.value?.version === 2 && dogHeadMeta.value?.parts?.length === 6 && dogHeadMeta.value?.registration;
        const dogSourceRect = rect => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite)
          && rect[0] >= 0 && rect[1] >= 0 && rect[2] > 0 && rect[3] > 0
          && rect[0] + rect[2] <= dogImageV3.value?.width && rect[1] + rect[3] <= dogImageV3.value?.height;
        const dogSourcePoint = point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1);
        const dogDimensions = view => view && [view.width, view.height].every(value => Number.isFinite(value) && value > 0);
        const coherentDog = dogImageV3.status === 'fulfilled' && dogImageV3.value && dogHeadV3.status === 'fulfilled' && dogLimbsV3.status === 'fulfilled'
          && dogHeadV3.value?.version === 2 && dogHeadV3.value?.revision === 3 && dogHeadV3.value?.parts?.length === 6
          && dogHeadV3.value.parts.every(dogSourceRect)
          && dogHeadV3.value?.registration?.anchors?.length === 6 && dogHeadV3.value?.registration?.bodyViews?.length === 3
          && dogHeadV3.value.registration.anchors.every(dogSourcePoint)
          && dogHeadV3.value.registration.headViews?.length === 6 && dogHeadV3.value.registration.headViews.slice(1).every(dogDimensions)
          && dogHeadV3.value.registration.bodyViews.every(view => view && dogSourceRect(view.rect) && dogDimensions(view) && [view.x, view.y, view.neck?.x, view.neck?.y].every(Number.isFinite))
          && dogSourceRect(dogHeadV3.value.registration.tail?.rect) && dogDimensions(dogHeadV3.value.registration.tail)
          && dogSourcePoint([dogHeadV3.value.registration.tail.anchorX, dogHeadV3.value.registration.tail.anchorY])
          && dogHeadV3.value.registration.features?.length === 6 && dogHeadV3.value.registration.features.slice(1).every(mark => mark?.eyes?.length === 2 && mark.eyes.every(dogSourcePoint) && dogSourcePoint(mark.nose) && dogSourcePoint(mark.mouth))
          && dogLimbsV3.value?.version === 2 && dogLimbsV3.value?.revision === 3
          && ['fore', 'hind'].every(kind => { const part = dogLimbsV3.value.parts?.[dogLimbsV3.value.species?.dog?.[kind]]; return dogSourceRect(part?.rect) && part.joints?.length === 4 && part.joints.every(dogSourcePoint) && part.joints.every((point, i) => !i || point[1] > part.joints[i - 1][1]); })
          && [dogHeadV3.value, dogLimbsV3.value].every(value => value.sourceSize?.[0] === dogImageV3.value.width && value.sourceSize?.[1] === dogImageV3.value.height);
        const coherentCat = catImage.status === 'fulfilled' && catImage.value && catHeadMeta.status === 'fulfilled' && catLimbMeta.status === 'fulfilled'
          && catHeadMeta.value?.version === 2 && catHeadMeta.value?.parts?.length === 6 && catHeadMeta.value?.registration?.anchors?.length === 6 && catHeadMeta.value?.registration?.tail?.rect?.length === 4
          && catLimbMeta.value?.version === 2 && ['fore', 'hind'].every(kind => { const part = catLimbMeta.value.parts?.[catLimbMeta.value.species?.cat?.[kind]]; return part?.rect?.length === 4 && part.joints?.length === 4 && part.joints.every((point, i) => !i || point[1] > part.joints[i - 1][1]); })
          && [catHeadMeta.value, catLimbMeta.value].every(value => value.sourceSize?.[0] === catImage.value.width && value.sourceSize?.[1] === catImage.value.height);
        const naturalCat = coherentCat && catLegs.status === 'fulfilled' && catHeadV3.status === 'fulfilled' && catLimbsV3.status === 'fulfilled'
          && catHeadV3.value?.version === 2 && catHeadV3.value?.revision === 3 && catHeadV3.value?.parts?.length === 6 && catHeadV3.value?.registration?.anchors?.length === 6 && catHeadV3.value?.registration?.tail?.rect?.length === 4
          && catHeadV3.value.sourceSize?.[0] === catImage.value.width && catHeadV3.value.sourceSize?.[1] === catImage.value.height
          && catLimbsV3.value?.version === 2 && ['fore', 'hind'].every(kind => { const part = catLimbsV3.value.parts?.[catLimbsV3.value.species?.cat?.[kind]]; return part?.rect?.length === 4 && part.joints?.length === 4 && part.joints.every((point, i) => !i || point[1] > part.joints[i - 1][1]); })
          && catLimbsV3.value.sourceSize?.[0] === catLegs.value.width && catLimbsV3.value.sourceSize?.[1] === catLegs.value.height;
        const extra = rig.status === 'fulfilled' && meta.status === 'fulfilled' && meta.value
          ? { rigImage: rig.value, rigMeta: meta.value, limbImage: coherentDog ? dogImageV3.value : naturalCat ? catLegs.value : coherentCat ? catImage.value : limb.status === 'fulfilled' ? limb.value : undefined, limbMeta: coherentDog ? dogLimbsV3.value : naturalCat ? catLimbsV3.value : coherentCat ? catLimbMeta.value : limbMeta.status === 'fulfilled' ? limbMeta.value : undefined, headImage: coherentDog ? dogImageV3.value : coherentCat ? catImage.value : registeredDogHead ? dogHead.value : head.status === 'fulfilled' ? head.value : undefined, headMeta: coherentDog ? dogHeadV3.value : naturalCat ? catHeadV3.value : coherentCat ? catHeadMeta.value : registeredDogHead ? dogHeadMeta.value : headMeta.status === 'fulfilled' ? headMeta.value : undefined, perchImage: perch.status === 'fulfilled' ? perch.value : undefined } : await loadFlow(pet.id, abort.signal);
        // A WebGL fallback cannot later become a 2D whole canvas. The CSS atlas
        // stays visible while the optional complete-frame group is pending.
        if (!cancelled) { images = { ...images, ...extra }; if (!whole && !wholePending) createRenderer(); }
      } else refresh();
    });
    return () => {
      cancelled = true;
      abort.abort();
      if (request !== null) cancelAnimationFrame(request);
      canvas.removeEventListener('webglcontextrestored', restored);
      renderer?.dispose();
      linePages?.dispose();
      playbackRef.current = null;
      if (motionPaintRef?.current === refresh) motionPaintRef.current = null;
    };
  }, [pet.id, pet.asset, pet.motionAsset, pet.rigAsset, pet.wholeAsset, pet.wholeMetaAsset, wholeFrameMode, motionPaintRef]);

  useEffect(() => { playbackRef.current?.refresh(); }, [action, walking, facing, paused, ambient, actionStartedAt, reducedMotion, className, style, handlers['aria-label']]);
  const initial = animationFrame({ action, paused, reducedMotion, species: pet.id });
  const frame = initial.atlas === 'legacy' ? initial.frame : 0;
  const position = atlasPosition(frame, true);
  return <div ref={elementRef}
    className={`pet-sprite ${className}`} data-frame={frame} data-clip={initial.clip} data-atlas={wholeFrameMode ? 'whole-fallback' : 'legacy'}
    style={{ width: size, height: size, backgroundImage: `url("${import.meta.env.BASE_URL}${pet.asset}")`, backgroundSize: pet.neutralAsset?'100% 100%':'300% 200%', backgroundPosition: pet.neutralAsset?'50% 50%':`${position.x}% ${position.y}%`, '--pet-facing': facing, ...style }}
    role="img" aria-label={`${pet.label}${action === 'rest' ? '正在睡觉' : ''}`} {...handlers}
  ><canvas key={pet.id} ref={canvasRef} width={256} height={256} aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%', visibility: 'hidden', pointerEvents: 'none' }} /></div>;
}

function OriginalPetRoute(props) {
  const reducedMotion = useReducedMotion();
  return <OriginalPet {...props} reducedMotion={reducedMotion} />;
}

export default function Pet(props) {
  return props.pet.animationMode === 'original-apng-v1'
    ? <OriginalPetRoute {...props} /> : <AuthoredPet {...props} />;
}
