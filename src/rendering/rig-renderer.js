/** Matching bitmap parts are attached to solved joints; support paws stay flat. */
export function createRigRenderer(canvas, { species, rigImage, rigMeta, legacyImage, perchImage, headImage, headMeta }) {
  const context = canvas.getContext('2d');
  if (!context || !rigImage || rigMeta?.parts?.length !== 6) throw new Error('Incomplete pet rig');
  canvas.width = canvas.height = 256;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  canvas.dataset.renderer = 'rig-2d';
  let disposed = false, birdFlight = 0, previousNow, previousPose;

  function part(index, x, y, width, height, { angle = 0, anchorX = .5, anchorY = 0, mirror = 1, section, image = rigImage, meta = rigMeta } = {}) {
    const [sx, sy, sw, sh] = meta.parts[index];
    const crop = section || [0, 0, 1, 1];
    context.save();
    context.translate(x, y); context.rotate(angle); context.scale(mirror, 1);
    context.drawImage(image, sx + sw * crop[0], sy + sh * crop[1], sw * crop[2], sh * crop[3],
      -width * anchorX, -height * anchorY, width, height);
    context.restore();
  }
  function segment(index, start, end, width, section) {
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    part(index, start.x, start.y, width, distance / .76,
      { angle: Math.atan2(end.y - start.y, end.x - start.x) - Math.PI / 2, anchorY: .13, section });
  }
  function leg(limb, layer = 'all') {
    const fore = limb.kind === 'fore', upper = fore ? 1 : 3, lower = fore ? 2 : 4;
    const ankle = { x: limb.foot.x, y: limb.foot.y - 8 };
    if (layer !== 'lower') segment(upper, limb.hip, limb.knee, fore ? 23 : 29);
    if (layer === 'upper') return;
    segment(lower, limb.knee, ankle, fore ? 17 : 19, [0, 0, 1, .8]);
    // The paw is independent of the shin rotation so planted soles stay level.
    part(lower, limb.foot.x, limb.foot.y, fore ? 23 : 25, 16,
      { anchorY: 1, section: [0, .77, 1, .23] });
  }
  function bodyTransform(body, draw) {
    const { pivot = { x: 128, y: 140 }, x = 0, y = 0, angle = 0 } = body || {};
    context.save(); context.translate(pivot.x + x, pivot.y + y); context.rotate(angle);
    context.translate(-pivot.x, -pivot.y); draw(); context.restore();
  }
  const blendCanvas = canvas.ownerDocument.createElement('canvas');
  blendCanvas.width = blendCanvas.height = 256;
  const blendContext = blendCanvas.getContext('2d');
  function blendedParts(entries) {
    blendContext.clearRect(0, 0, 256, 256);
    blendContext.globalCompositeOperation = 'lighter';
    for (const {index,x,y,width,height,options={},alpha} of entries) {
      if (alpha <= 0) continue;
      const {image=rigImage,meta=rigMeta,anchorX=.5,anchorY=0,angle=0,mirror=1,section=[0,0,1,1]}=options;
      const [sx,sy,sw,sh]=meta.parts[index];
      blendContext.save();blendContext.globalAlpha=alpha;
      blendContext.translate(x,y);blendContext.rotate(angle);blendContext.scale(mirror,1);
      blendContext.drawImage(image,sx+sw*section[0],sy+sh*section[1],sw*section[2],sh*section[3],-width*anchorX,-height*anchorY,width,height);
      blendContext.restore();
    }
    context.drawImage(blendCanvas,0,0);
  }
  function orientedPart(index, x, y, width, height, options, orientation) {
    // Blend matching anatomical layers in premultiplied color, preserving opacity.
    const blend = (1 - orientation) / 2;
    blendedParts([{index,x,y,width,height,options:{...options,mirror:1},alpha:1-blend},
      {index,x,y,width,height,options:{...options,mirror:-1},alpha:blend}]);
  }
  const articulatedHead = headImage && headMeta?.parts?.length === 6;
  function head(pose, x, y, width, height) {
    const orientation = pose.orientation ?? pose.facing;
    const profile = Math.abs(orientation) * 2;
    const lower = Math.floor(profile), mix = profile - lower;
    const indices = [3, 2, 1];
    const expression = pose.clip === 'pet' ? 4 : pose.clip === 'feed' ? 5 : null;
    const expressionWeight = expression === null ? 0 : pose.expressionWeight;
    const entries=[];
    const draw = (index, alpha) => entries.push({index,x,y,width,height,alpha,options:{image:headImage,meta:headMeta,anchorY:.8,
      angle:pose.headAngle*(orientation<0?-1:1),mirror:index===3?1:orientation<0?-1:1}});
    draw(indices[lower], (1 - mix) * (1 - expressionWeight));
    if (lower < 2) draw(indices[lower + 1], mix * (1 - expressionWeight));
    if (expression !== null) draw(expression, expressionWeight);
    blendedParts(entries);
  }
  function quadruped(pose) {
    context.save(); context.globalAlpha = .88;
    pose.legs.filter(limb => limb.side === 'far').forEach(leg);
    context.restore();
    bodyTransform(pose.body, () => {
      orientedPart(5, 128 - 62 * pose.orientation, 133, 48, 54,
        { anchorX: .15, anchorY: .86, angle: pose.tailAngle }, -pose.orientation);
    });
    const near = pose.legs.filter(limb => limb.side === 'near');
    near.forEach(limb => leg(limb, 'upper'));
    bodyTransform(pose.body, () => {
      if (articulatedHead) {
        orientedPart(0, 128, 76, 180, 104,
          {anchorX:.5,image:headImage,meta:headMeta}, pose.orientation);
        head(pose, 128 + 52 * pose.orientation, 131, 91, 104);
      } else {
        // A complete matching body is the fallback when supplemental parts fail.
        orientedPart(0, 128, 50, 180, 125, {anchorX:.5}, pose.orientation);
      }
    });
    near.forEach(limb => leg(limb, 'lower'));
  }
  function bird(pose) {
    const flying = pose.clip === 'walk' || pose.airborne;
    const stretching = pose.clip === 'stretch';
    const flap = Math.sin(pose.wingPhase * Math.PI * 2);
    const preen = pose.preen || 0;
    const spread = preen ? .1 + .36 * preen : stretching ? .1 + .9 * Math.sin(Math.PI * Math.min(1, pose.elapsed / 2600)) : .1 + .9 * birdFlight;
    const down = birdFlight > .05 ? flap : .8;
    const recovery = flying ? .8 + .2 * Math.max(0, Math.cos(pose.wingPhase * Math.PI * 2)) : 1;
    bodyTransform(pose.body, () => {
      const left = { x: 120, y: 128 }, right = { x: 142, y: 126 };
      let nearElbow = { x: left.x - 33 * spread, y: left.y + 28 * down * spread + 23 * (1 - spread) };
      let nearTip = { x: nearElbow.x - 37 * spread * recovery, y: nearElbow.y + 29 * down * spread + 36 * (1 - spread) };
      const farElbow = { x: right.x + 29 * spread, y: right.y + 24 * down * spread + 21 * (1 - spread) };
      const farTip = { x: farElbow.x + 34 * spread * recovery, y: farElbow.y + 27 * down * spread + 33 * (1 - spread) };
      if (preen) {
        nearElbow = { x: nearElbow.x * (1 - preen) + 96 * preen, y: nearElbow.y * (1 - preen) + 108 * preen };
        nearTip = { x: nearTip.x * (1 - preen) + 151 * preen, y: nearTip.y * (1 - preen) + 110 * preen };
      }
      segment(3, right, farElbow, 25);
      segment(4, farElbow, farTip, 30);
      part(5, 122, 165, 24, 59, { angle: .35 + pose.tailAngle * .4 });
      if (articulatedHead) {
        part(0, 96, 78, 90, 148, {anchorX:0,image:headImage,meta:headMeta});
        head({...pose,orientation:pose.orientation*(1-.8*preen),headAngle:pose.headAngle+.15*preen}, 141, 128, 82, 105);
      } else if (perchImage && rigMeta.perchRect) {
        const [x, y, w, h] = rigMeta.perchRect;
        context.drawImage(perchImage, x, y, w, h * .87, 96, 43, 90, 156);
      } else part(0, 99, 43, 83, 137, { anchorX: 0 });
      segment(1, left, nearElbow, 29);
      segment(2, nearElbow, nearTip, 35);
    });
    if (!articulatedHead && perchImage && rigMeta.perchRect) {
      const [x, y, w, h] = rigMeta.perchRect;
      context.drawImage(perchImage, x, y + h * .85, w, h * .15,
        96, 196 - birdFlight * 12 + (flying ? pose.bodyY : 0), 90, 30 - birdFlight * 7);
    }
  }
  return {
    draw(pose, now = 0) {
      if (disposed) return false;
      const dt = previousNow === undefined ? 0 : Math.min(50, Math.max(0, now - previousNow));
      previousNow = now;
      if (pose === previousPose) return true;
      previousPose = pose;
      birdFlight += (Number(pose.clip === 'walk' || pose.airborne) - birdFlight) * (1 - Math.exp(-dt / 110));
      context.clearRect(0, 0, 256, 256);
      context.save();
      if (species === 'parrot') {
        // Bird wings/head retain full width throughout a bounded turn.
        context.translate(128, 140); context.rotate((1 - pose.orientation) * .08); context.translate(-128, -140);
      }
      if (pose.clip === 'rest' && legacyImage) {
        const width = legacyImage.width / 3, height = legacyImage.height / 2;
        context.drawImage(legacyImage, 0, height, width, height, 0, 0, 256, 256);
      } else if (species === 'parrot') bird(pose);
      else quadruped(pose);
      context.restore();
      return true;
    },
    dispose() { disposed = true; },
  };
}
