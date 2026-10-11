import { createLimbSkin } from './limb-skin.js';

/** Matching bitmap parts are attached to solved joints; support paws stay flat. */
export function createRigRenderer(canvas, { species, rigImage, rigMeta, legacyImage, perchImage, headImage, headMeta, limbImage, limbMeta }) {
  const context = canvas.getContext('2d');
  if (!context || !rigImage || rigMeta?.parts?.length !== 6) throw new Error('Incomplete pet rig');
  canvas.width = canvas.height = 256;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  canvas.dataset.renderer = 'rig-2d';
  const limbSkin = createLimbSkin(canvas.ownerDocument, limbImage, limbMeta, species);
  canvas.dataset.limbSkin = limbSkin ? 'connected-v2' : 'legacy-parts';
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
    if (limbSkin && limb.ankle) { if (layer !== 'lower') limbSkin.draw(context, limb); return; }
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
  const headRegistration = articulatedHead && ['dog', 'cat'].includes(species) && headMeta?.version === 2 ? headMeta.registration : null;
  const registeredTail = species === 'cat' ? headRegistration?.tail : null;
  const tailMeta = registeredTail ? {parts:[registeredTail.rect]} : null;
  canvas.dataset.headRig = headRegistration ? 'registered-v2' : 'legacy-parts';
  const headProfiles = new Map(), headGrids = new Map();
  const headProfileCanvas = canvas.ownerDocument.createElement('canvas');
  headProfileCanvas.width = headProfileCanvas.height = 256;
  const headProfileContext = headProfileCanvas.getContext('2d');
  function registeredHead(entries) {
    const views = entries.filter(entry => entry.alpha > 0);
    if (!views.length || views.some(view => !headRegistration.features?.[view.index])) { blendedParts(entries); return; }
    const rows = views.map(view => {
      const key = `${view.index}:${view.options.mirror}`;
      if (headGrids.has(key)) return headGrids.get(key);
      if (!headProfiles.has(view.index)) {
        const [sx,sy,width,height]=headMeta.parts[view.index],crop=canvas.ownerDocument.createElement('canvas');crop.width=width;crop.height=height;
        crop.getContext('2d').drawImage(headImage,sx,sy,width,height,0,0,width,height);
        const pixels=crop.getContext('2d').getImageData(0,0,width,height).data;
        const contours=Array.from({length:height},(_,y)=>{let left=width,right=-1;for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=16){left=Math.min(left,x);right=Math.max(right,x);}return right<left?null:[left/width,(right+1)/width];});
        headProfiles.set(view.index,{texture:crop,contours});
      }
      const {texture,contours}=headProfiles.get(view.index);
      const mark = headRegistration.features[view.index], anchor = headRegistration.anchors[view.index];
      const eyeY = (mark.eyes[0][1] + mark.eyes[1][1]) / 2;
      const featureRow = (point, halfWidth) => [0, Math.max(.001, point[0] - halfWidth), point[0], Math.min(.999, point[0] + halfWidth), 1].map(x => ({x,y:point[1]}));
      const grid = [
        [0,.25,.5,.75,1].map(x => ({x,y:0})),
        [{x:0,y:eyeY},{x:mark.eyes[0][0],y:mark.eyes[0][1]},{x:(mark.eyes[0][0]+mark.eyes[1][0])/2,y:eyeY},{x:mark.eyes[1][0],y:mark.eyes[1][1]},{x:1,y:eyeY}],
        featureRow(mark.nose,mark.noseHalfWidth), featureRow(mark.mouth,mark.mouthHalfWidth),
        [0,.25,anchor[0],.75,1].map(x => ({x,y:anchor[1]})),
        [0,.25,.5,.75,1].map(x => ({x,y:1})),
      ];
      const ears=species==='cat'?mark.ears:null;
      if(ears){const earY=(ears[0][1]+ears[1][1])/2;grid.splice(1,0,[{x:0,y:earY},{x:ears[0][0],y:ears[0][1]},{x:(ears[0][0]+ears[1][0])/2,y:earY},{x:ears[1][0],y:ears[1][1]},{x:1,y:earY}]);}
      const eyeRow=ears?2:1,noseRow=eyeRow+1,mouthRow=eyeRow+2,neckRow=eyeRow+3;
      // Opaque contour landmarks align the cheek/skull silhouette as well as
      // the face. Outer border columns retain every source pixel and margin.
      grid.forEach((row,index)=>{
        const y=row[2].y,at=Math.min(texture.height-1,Math.max(0,Math.round(y*texture.height)));
        let contour=contours[at];
        if(!contour)for(let d=1;d<texture.height&&!contour;d++)contour=contours[Math.max(0,at-d)]||contours[Math.min(texture.height-1,at+d)];
        const left=Math.min(contour?.[0]??0,(index===eyeRow||ears&&index===1?row[1].x:row[2].x)-.002),right=Math.max(contour?.[1]??1,(index===eyeRow||ears&&index===1?row[3].x:row[2].x)+.002);
        if(index===noseRow||index===mouthRow){row[1].x=Math.max(left+.001,Math.min(row[1].x,row[2].x-.001));row[3].x=Math.min(right-.001,Math.max(row[3].x,row[2].x+.001));}
        else if(index===eyeRow||ears&&index===1){ /* Eye and ear landmarks remain exact. */ }
        else if(index===neckRow){row[1].x=left+(anchor[0]-left)*.5;row[3].x=anchor[0]+(right-anchor[0])*.5;}
        if(index===0||index===grid.length-1){row[1].x=left+(right-left)*.25;row[2].x=left+(right-left)*.5;row[3].x=left+(right-left)*.75;}
        if(ears&&index===1){row[0].y=ears[0][1];row[4].y=ears[1][1];}
        row.splice(1,0,{x:Math.max(.0001,left),y:ears&&index===1?ears[0][1]:y});row.splice(row.length-1,0,{x:Math.min(.9999,right),y:ears&&index===1?ears[1][1]:y});
      });
      if (view.options.mirror < 0) grid.forEach(row => row.reverse());
      const sample = (values,index,u) => {
        const slope = at => {
          if(at===0)return values[1]-values[0];
          if(at===values.length-1)return values[at]-values[at-1];
          const before=values[at]-values[at-1],after=values[at+1]-values[at];
          return before*after<=0?0:2*before*after/(before+after);
        };
        return (2*u*u*u-3*u*u+1)*values[index]+(u*u*u-2*u*u+u)*slope(index)
          +(-2*u*u*u+3*u*u)*values[index+1]+(u*u*u-u*u)*slope(index+1);
      };
      // A monotone C1 surface removes the affine shear crease at facial rows.
      // Exact eye/nose/mouth/neck landmarks remain vertices of the fixed grid.
      const subdivisions=2;
      const sampled = Array.from({length:(grid.length-1)*subdivisions+1},(_,r)=>
        Array.from({length:(grid[0].length-1)*subdivisions+1},(_,c)=>{
          const row=Math.min(grid.length-2,Math.floor(r/subdivisions)),v=r/subdivisions-row;
          const column=Math.min(grid[0].length-2,Math.floor(c/subdivisions)),u=c/subdivisions-column;
          return Object.fromEntries(['x','y'].map(axis=>{const values=grid.map(points=>sample(points.map(point=>point[axis]),column,u));const smooth=v*v*(3-2*v);return [axis,axis==='x'?values[row]*(1-smooth)+values[row+1]*smooth:sample(values,row,v)];}));
        }));
      headGrids.set(key,sampled);return sampled;
    });
    // Register each facial view to the same interpolated eyes/nose/mouth and
    // neck root before mixing pixels. Full-profile endpoints remain untouched.
    const target = rows[0].map((row,r) => row.map((_,c) => {
      const point = views.reduce((sum,view,i) => {
        const source = rows[i][r][c], anchor = headRegistration.anchors[view.index];
        sum.x += (source.x-anchor[0])*view.width*view.options.mirror*view.alpha;
        sum.y += (source.y-anchor[1])*view.height*view.alpha; return sum;
      },{x:0,y:0});
      const angle=views[0].options.angle,cos=Math.cos(angle),sin=Math.sin(angle);
      return {x:views[0].x+point.x*cos-point.y*sin,y:views[0].y+point.x*sin+point.y*cos};
    }));
    function triangle(texture, source, destination) {
      const [s0,s1,s2]=source,[d0,d1,d2]=destination;
      const ux=s1.x-s0.x,uy=s1.y-s0.y,vx=s2.x-s0.x,vy=s2.y-s0.y,det=ux*vy-uy*vx;
      const dx=d1.x-d0.x,dy=d1.y-d0.y,ex=d2.x-d0.x,ey=d2.y-d0.y;
      const a=(dx*vy-ex*uy)/det,c=(ex*ux-dx*vx)/det,b=(dy*vy-ey*uy)/det,d=(ey*ux-dy*vx)/det;
      headProfileContext.save();headProfileContext.beginPath();
      const winding=Math.sign(dx*ey-dy*ex)||1;
      const normals=destination.map((point,i)=>{const next=destination[(i+1)%3],length=Math.hypot(next.x-point.x,next.y-point.y)||1;return {x:(next.y-point.y)/length*winding,y:-(next.x-point.x)/length*winding};});
      destination.forEach((point,i)=>{const previous=normals[(i+2)%3],next=normals[i],expansion=.35/Math.max(.02,1+previous.x*next.x+previous.y*next.y);let ox=(previous.x+next.x)*expansion,oy=(previous.y+next.y)*expansion;const bound=Math.min(1,.75/(Math.hypot(ox,oy)||1));ox*=bound;oy*=bound;const x=point.x+ox,y=point.y+oy;i?headProfileContext.lineTo(x,y):headProfileContext.moveTo(x,y);});
      headProfileContext.closePath();headProfileContext.clip();headProfileContext.transform(a,b,c,d,d0.x-a*s0.x-c*s0.y,d0.y-b*s0.x-d*s0.y);headProfileContext.drawImage(texture,0,0);headProfileContext.restore();
    }
    blendContext.clearRect(0,0,256,256);blendContext.globalCompositeOperation='lighter';
    views.forEach((view,i)=>{
      const texture=headProfiles.get(view.index).texture,source=rows[i].map(row=>row.map(point=>({x:point.x*texture.width,y:point.y*texture.height})));
      headProfileContext.clearRect(0,0,256,256);
      for(let r=0;r<source.length-1;r++)for(let c=0;c<source[r].length-1;c++){
        triangle(texture,[source[r][c],source[r][c+1],source[r+1][c]],[target[r][c],target[r][c+1],target[r+1][c]]);
        triangle(texture,[source[r][c+1],source[r+1][c+1],source[r+1][c]],[target[r][c+1],target[r+1][c+1],target[r+1][c]]);
      }
      blendContext.globalAlpha=view.alpha;blendContext.drawImage(headProfileCanvas,0,0);
    });
    blendContext.globalAlpha=1;context.drawImage(blendCanvas,0,0);
  }
  function head(pose, x, y, width, height) {
    const orientation = pose.orientation ?? pose.facing;
    const profile = Math.abs(orientation) * 2;
    const lower = Math.floor(profile), mix = profile - lower;
    const indices = [3, 2, 1];
    const expression = pose.clip === 'pet' ? 4 : pose.clip === 'feed' ? 5 : null;
    const expressionWeight = expression === null ? 0 : pose.expressionWeight * (headRegistration ? Math.abs(orientation) : 1);
    const entries=[];
    const draw = (index, alpha) => entries.push({index,x,y,width,height,alpha,options:{image:headImage,meta:headMeta,
      anchorX:headRegistration?.anchors?.[index]?.[0] ?? .5,anchorY:headRegistration?.anchors?.[index]?.[1] ?? .8,
      angle:pose.headAngle*(headRegistration ? orientation : orientation<0?-1:1),mirror:index===3?1:orientation<0?-1:1}});
    draw(indices[lower], (1 - mix) * (1 - expressionWeight));
    if (lower < 2) draw(indices[lower + 1], mix * (1 - expressionWeight));
    if (expression !== null) draw(expression, expressionWeight);
    if (headRegistration) registeredHead(entries); else blendedParts(entries);
  }
  function quadruped(pose) {
    context.save(); context.globalAlpha = .88;
    pose.legs.filter(limb => limb.side === 'far').forEach(leg);
    context.restore();
    bodyTransform(pose.body, () => {
      if (registeredTail) {
        orientedPart(0, 128 + registeredTail.offsetX * pose.orientation, registeredTail.y, registeredTail.width, registeredTail.height,
          { anchorX: registeredTail.anchorX, anchorY: registeredTail.anchorY, angle: pose.tailAngle, image: headImage, meta: tailMeta }, -pose.orientation);
      } else orientedPart(5, 128 - 62 * pose.orientation, 133, 48, 54,
        { anchorX: .15, anchorY: .86, angle: pose.tailAngle }, -pose.orientation);
    });
    const near = pose.legs.filter(limb => limb.side === 'near');
    near.forEach(limb => leg(limb, 'upper'));
    bodyTransform(pose.body, () => {
      if (articulatedHead) {
        const body = headRegistration?.body ?? {x:128,y:76,width:180,height:104};
        const face = headRegistration?.head ?? {offsetX:52,y:131,width:91,height:104};
        orientedPart(0, body.x + (body.offsetX ?? 0) * pose.orientation, body.y, body.width, body.height,
          {anchorX:.5,image:headImage,meta:headMeta}, pose.orientation);
        head(pose, 128 + face.offsetX * pose.orientation, face.y, face.width, face.height);
      } else {
        // A complete matching body is the fallback when supplemental parts fail.
        orientedPart(0, 128, 50, 180, 125, {anchorX:.5}, pose.orientation);
      }
    });
    near.forEach(limb => leg(limb, 'lower'));
    if (limbSkin && pose.clip === 'groom') {
      const elapsed = pose.elapsed || 0;
      const smooth = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
      context.save(); context.globalAlpha = smooth(elapsed / 300) * smooth((1800 - elapsed) / 300);
      near.filter(limb => limb.kind === 'fore').forEach(limb => {
        blendContext.clearRect(0,0,256,256); blendContext.globalCompositeOperation='source-over';
        limbSkin.draw(blendContext,limb,{foreground:true});
        context.drawImage(blendCanvas,0,0);
      });
      context.restore();
    }
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
