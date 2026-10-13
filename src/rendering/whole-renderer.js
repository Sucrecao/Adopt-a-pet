import { validateWholeClips, validateWholeTransitions } from '../core/whole-animation.js';
import { createWholeFlowRenderer,validateWholeContours } from './whole-flow-renderer.js';
import { createWholeGroundRenderer } from './whole-ground-renderer.js';
import { validateGroundPoseConfig } from '../core/ground-surface-pose.js';
import { createWholeSurfaceGroundRenderer } from './whole-surface-ground-renderer.js';
import { createWholeCanonicalFrames } from './whole-canonical-frames.js';

const SIZE = 256;

/** Decode and metadata must agree before the optional primary renderer is used. */
export function validateWholeAtlas(imageOrImages, meta) {
  const images = Array.isArray(imageOrImages) ? imageOrImages : [imageOrImages];
  const discrete = meta?.version === 7;
  if (discrete && (meta.renderMode !== 'discrete-whole-frame'
      || ['flow','handoffs','groundGait','groundRise'].some(key => meta[key] !== undefined))) {
    throw new Error('Invalid discrete whole-frame metadata');
  }
  const surface = meta?.version === 6;
  const rise = surface && Boolean(meta.groundRise);
  const extra = surface ? meta.extraFrameCount ?? 0 : 0;
  const gaitPages = [3,4,5,6].includes(meta?.version);
  const multiPage = meta?.version === 2 || gaitPages || discrete;
  const pages = meta?.version === 1 ? [meta] : multiPage && Array.isArray(meta.pages) ? meta.pages : [];
  const frameCount = discrete ? meta.frames?.length : surface ? 130 + extra : meta?.version===5 && meta.handoffs?.mirroredNeutralFrame===128 ? 129 : gaitPages ? 128 : meta?.version === 2 ? 96 : 48;
  if (discrete && (!Array.isArray(meta.frames) || frameCount < 1 || frameCount > 1024)) throw new Error('Invalid discrete whole-frame count');
  if (surface && (!Number.isInteger(extra) || extra < 0 || extra > 64)) throw new Error('Invalid whole atlas extra frame count');
  if (!pages.length || images.length !== pages.length || (multiPage && (discrete
      ? pages.length > 96 : surface
      ? pages.length < 4 || pages.length > 4 + extra
      : pages.length !== (gaitPages ? 3 : 2)))) throw new Error('Invalid whole atlas pages');
  for (const [index, page] of pages.entries()) {
    const width = images[index]?.naturalWidth ?? images[index]?.width, height = images[index]?.naturalHeight ?? images[index]?.height;
    const additional=surface&&index>=4;
    if((additional||discrete)&&(!Number.isInteger(page.columns)||page.columns<1||page.columns>8
        ||!Number.isInteger(page.rows)||page.rows<1||page.rows>8))throw new Error('Invalid whole atlas intermediate page layout');
    const columns=additional||discrete?page.columns:surface&&index===3?1:8;
    const rows=additional||discrete?page.rows:surface&&index===3?1:gaitPages&&index===2?4:6;
    if (!width || !height || (discrete && (!Number.isFinite(width) || width < 1 || !Number.isFinite(height) || height < 1))
        || page.columns !== columns || page.rows !== rows) throw new Error('Invalid whole atlas image or layout');
    if (!Array.isArray(page.sourceSize) || page.sourceSize.length !== 2 || page.sourceSize[0] !== width || page.sourceSize[1] !== height) throw new Error('Whole atlas source dimensions do not match the image');
    if (multiPage && (typeof page.asset !== 'string' || !page.asset)) throw new Error('Invalid whole atlas page asset');
    if (page.scale !== undefined && (!Number.isFinite(page.scale) || page.scale <= 0 || page.scale > 4)) throw new Error('Invalid whole atlas uniform scale');
  }
  if (!Array.isArray(meta.frames) || meta.frames.length !== frameCount) throw new Error(`Whole atlas must register ${frameCount} frames`);
  if (multiPage && (!Number.isInteger(meta.neutralFrame) || meta.neutralFrame < 0 || meta.neutralFrame >= frameCount)) throw new Error('Invalid whole atlas neutral frame');
  if (meta.stride !== undefined && (!Number.isFinite(meta.stride) || meta.stride <= 0)) throw new Error('Invalid whole atlas walking stride');
  for (const [index,frame] of meta.frames.entries()) {
    const pageIndex = multiPage ? frame?.page : 0;
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pages.length) throw new Error('Invalid whole atlas frame page');
    if(surface&&index>=130&&pageIndex<4)throw new Error('Intermediate pose must use its own source page');
    const [width,height] = pages[pageIndex].sourceSize;
    const rect = frame?.rect;
    if (!Array.isArray(rect) || rect.length !== 4 || rect.some(value => !Number.isFinite(value)) || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0 || rect[0] + rect[2] > width || rect[1] + rect[3] > height) throw new Error('Invalid whole atlas source rectangle');
    if (![frame.offsetX ?? 0, frame.offsetY ?? 0].every(Number.isFinite)) throw new Error('Invalid whole atlas registration offset');
    if (discrete && ['offsetX','offsetY'].some(key => frame[key] !== undefined && !Number.isFinite(frame[key]))) throw new Error('Invalid whole atlas registration offset');
    if (frame.mirror !== undefined && frame.mirror !== 1 && frame.mirror !== -1) throw new Error('Invalid whole atlas frame mirror');
  }
  validateWholeClips(meta.clips, meta.frames.length);
  validateWholeTransitions(meta.transitions, meta.frames.length);
  if (!discrete) validateWholeContours(meta);
  if(surface) {
    validateGroundPoseConfig(meta.groundGait);
    const first=meta.frames[0],mirrored=meta.frames[128];
    if(meta.neutralFrame!==0||meta.handoffs?.neutralFrame!==0||meta.handoffs?.mirroredNeutralFrame!==128
        ||pages[3].sourceSize.some(v=>v!==SIZE)||first.page!==3||first.rect.some((v,i)=>v!==[0,0,SIZE,SIZE][i])
        ||(first.offsetX??0)!==0||(first.offsetY??0)!==0||(first.mirror??1)!==1
        ||mirrored.page!==3||mirrored.mirror!==-1||mirrored.rect.some((v,i)=>v!==first.rect[i])
        ||(mirrored.offsetX??0)!==0||(mirrored.offsetY??0)!==0)throw new Error('Invalid ground neutral atlas endpoint');
    if(pages.slice(4).some((_,index)=>!meta.frames.slice(130).some(f=>f.page===index+4)))throw new Error('Unused whole atlas intermediate source page');
    if(rise) {
      const sequence=meta.groundRise.frames,duration=meta.groundRise.pairDuration;
      const hasField=(a,b)=>(meta.flow?.pairs??[]).some(p=>p[0]===a&&p[1]===b||p[0]===b&&p[1]===a);
      if(meta.groundGait.species!=='dog'||!Array.isArray(sequence)||sequence.length<3
          ||sequence[0]!==90||sequence.at(-1)!==0||new Set(sequence).size!==sequence.length
          ||sequence.slice(1,-1).some(v=>!Number.isInteger(v)||v<130||v>=frameCount)
          ||sequence.slice(1).some((v,i)=>!hasField(sequence[i],v))
          ||!Number.isFinite(duration)||duration<=0||duration>800)throw new Error('Invalid grounded rise source sequence');
    }
  }
  return true;
}

/** Paint a single whole rectangular crop, retaining its aspect ratio and alpha. */
export function createWholeRenderer(canvas, { image, images, meta, flowBytes, surfaceImages, contourImages=[] }) {
  const sources = images ?? [image];
  validateWholeAtlas(sources, meta);
  const discrete = meta.version === 7;
  if (!discrete) validateWholeContours(meta,contourImages);
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Whole atlas needs a 2D canvas context');
  const canonicalFrames=meta.version===6?createWholeCanonicalFrames(sources,meta):null;
  let flow = discrete ? null : createWholeFlowRenderer({ images:sources,meta,flowBytes,contourImages,
    canonicalFrame:canonicalFrames?index=>canonicalFrames.get(index):undefined });
  let ground = discrete ? null : meta.version===6 ? createWholeSurfaceGroundRenderer({meta,surfaceImages})
    : createWholeGroundRenderer({ images:sources,meta });
  canvas.dataset.groundRenderer = ground ? meta.version===6 ? 'jointed-surface-webgl' : 'whole-ground-webgl' : '';
  canvas.dataset.renderer = discrete ? 'whole-frame-2d' : flow ? 'whole-flow-2d' : 'whole-2d';
  const pages = meta.version === 1 ? [meta] : meta.pages;
  const scales = pages.map(page => SIZE / Math.max(page.sourceSize[0] / page.columns, page.sourceSize[1] / page.rows) * (page.scale ?? 1));
  let disposed = false, drawnFrame, drawnFacing;
  return {
    draw(sample) {
      if (disposed || !Number.isInteger(sample?.frame) || !meta.frames[sample.frame]) return false;
      const facing = sample.facing === -1 ? -1 : 1;
      if (discrete && drawnFrame === sample.frame && drawnFacing === facing) return true;
      // A replacement can fail after clearing; only a completed draw is held.
      if (discrete) drawnFrame = drawnFacing = undefined;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, SIZE, SIZE);
      if(ground&&sample.ground){
        try {if(ground.draw(sample,context))return true;if(!ground.available){ground.dispose();ground=null;}}
        catch {ground.dispose();ground=null;}
        if(!ground)canvas.dataset.groundRenderer='';
      }
      if (flow) {
        try {
          if (flow.draw(sample,context)) return true;
          if (!flow.available) { flow.dispose(); flow = null; }
        } catch { flow.dispose(); flow = null; }
        if (!flow) canvas.dataset.renderer = 'whole-2d';
      }
      let index = sample.frame;
      if ([4,5,6].includes(meta.version) && meta.flow && Number.isInteger(sample.nextFrame)
          && meta.frames[sample.nextFrame] && Number.isFinite(sample.mix)) {
        // A rejected field or unavailable GPU still has the same endpoint
        // identity after (A,B,t) becomes (B,A,1-t) during cancellation.
        if (sample.mix > .5) index = sample.nextFrame;
        else if (sample.mix === .5) index = Math.min(sample.frame, sample.nextFrame);
      }
      const frame = meta.frames[index], [x, y, width, height] = frame.rect;
      const page = meta.version === 1 ? 0 : frame.page, scale = scales[page];
      context.save();
      if ((sample.facing === -1 ? -1 : 1) * (canonicalFrames?1:frame.mirror??1) === -1) { context.translate(SIZE, 0); context.scale(-1, 1); }
      if(canonicalFrames)context.drawImage(canonicalFrames.get(index),0,0);
      else context.drawImage(sources[page], x, y, width, height,
        (SIZE - width * scale) / 2 + (frame.offsetX ?? 0), (SIZE - height * scale) / 2 + (frame.offsetY ?? 0), width * scale, height * scale);
      context.restore();
      if (discrete) { drawnFrame = sample.frame; drawnFacing = facing; }
      return true;
    },
    dispose() {
      if (disposed) return;
      flow?.dispose(); flow = null;
      ground?.dispose(); ground = null;
      canonicalFrames?.dispose();
      disposed = true;
      drawnFrame = drawnFacing = undefined;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, SIZE, SIZE);
    },
  };
}
