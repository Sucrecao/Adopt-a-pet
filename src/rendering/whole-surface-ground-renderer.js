import {createGroundPoseModel} from '../core/ground-surface-pose.js';
import {createGroundSurfaceRenderer} from './ground-surface-renderer.js';

/** Adapts distance-owned handoff state to the fixed-source GPU skin. */
export function createWholeSurfaceGroundRenderer({meta,surfaceImages}) {
  if(meta?.version!==6||meta.groundGait?.version!==2||!surfaceImages)return null;
  const model=createGroundPoseModel(meta.groundGait);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const renderer=createGroundSurfaceRenderer(canvas,{...surfaceImages,neutralPose:model.neutral});
  if(!renderer.available){renderer.dispose();canvas.width=canvas.height=0;return null;}
  return {
    get available(){return renderer.available;},
    draw(sample,context){
      if(!sample?.ground)return false;
      const pose=model.resolve(sample.ground);
      // The atlas owns the exact decoded neutral pixels. Passing a WebGL
      // framebuffer through 2D uses a different premultiplication rounding
      // path than decoding its PNG, even when the geometry is identical.
      if(pose===model.neutral)return false;
      return renderer.drawToContext(pose,context,sample.facing??1);
    },
    dispose(){renderer.dispose();canvas.width=canvas.height=0;},
  };
}
