// Shared first derivatives keep the source-relative deformation smooth at
// anatomical landmarks. Monotone slopes prevent overshoot into adjacent joints.
function smoothSample(knots, values, segment, u) {
  const slopes=values.slice(1).map((value,i)=>(value-values[i])/(knots[i+1]-knots[i]));
  const tangent=index=>{
    if(index===0)return slopes[0];if(index===3)return slopes[2];
    const before=slopes[index-1],after=slopes[index];
    if(before*after<=0)return 0;
    const left=knots[index]-knots[index-1],right=knots[index+1]-knots[index];
    return (left+right)/(left/before+right/after);
  };
  const width=knots[segment+1]-knots[segment],start=values[segment],end=values[segment+1];
  if(u<0)return start+u*width*tangent(segment);
  if(u>1)return end+(u-1)*width*tangent(segment+1);
  return (2*u*u*u-3*u*u+1)*start+(u*u*u-2*u*u+u)*width*tangent(segment)
    +(-2*u*u*u+3*u*u)*end+(u*u*u-u*u)*width*tangent(segment+1);
}

/** A connected bitmap skin: every source row, including the complete paw, is retained. */
export function createLimbSkin(document, image, meta, species) {
  const mapping = meta?.species?.[species];
  if (!image || !mapping) return null;
  const textures = new Map();
  for (const kind of ['fore', 'hind']) {
    const part = meta.parts?.[mapping[kind]];
    if (!part?.rect || part.joints?.length !== 4 || part.joints.some((point, i) => i && point[1] <= part.joints[i - 1][1])) return null;
    const [, , width, height] = part.rect;
    const source = document.createElement('canvas'); source.width = width; source.height = height;
    source.getContext('2d').drawImage(image, ...part.rect, 0, 0, width, height);
    // Read source alpha once while preparing the skin; frames never read pixels.
    const pixels = source.getContext('2d').getImageData(0, 0, width, height).data;
    const hull = Array.from({length:height}, (_, y) => {
      let left=width,right=0; for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>16){left=Math.min(left,x);right=Math.max(right,x+1);}
      return [left,right];
    });
    const foreground = document.createElement('canvas'); foreground.width=width;foreground.height=height;
    const foregroundContext=foreground.getContext('2d');foregroundContext.drawImage(source,0,0);
    const gradient=foregroundContext.createLinearGradient(0,0,0,height);
    gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(part.joints[1][1],'rgba(0,0,0,0)');
    gradient.addColorStop(part.joints[2][1],'rgba(0,0,0,1)');gradient.addColorStop(1,'rgba(0,0,0,1)');
    foregroundContext.globalCompositeOperation='destination-in';foregroundContext.fillStyle=gradient;foregroundContext.fillRect(0,0,width,height);
    const widthScale = species === 'cat' && Number.isFinite(part.widthScale) && part.widthScale > 0 ? part.widthScale : 1;
    textures.set(kind, { source, foreground, part, hull, widthScale });
  }
  const profileCanvas=document.createElement('canvas');profileCanvas.width=profileCanvas.height=256;
  const profileContext=profileCanvas.getContext('2d');
  const composedCanvas=document.createElement('canvas');composedCanvas.width=composedCanvas.height=256;
  const composedContext=composedCanvas.getContext('2d');
  function triangle(context, texture, source, target) {
    const [s0, s1, s2] = source, [d0, d1, d2] = target;
    const ux=s1.x-s0.x, uy=s1.y-s0.y, vx=s2.x-s0.x, vy=s2.y-s0.y, determinant=ux*vy-uy*vx;
    const dx=d1.x-d0.x, dy=d1.y-d0.y, ex=d2.x-d0.x, ey=d2.y-d0.y;
    const a=(dx*vy-ex*uy)/determinant, c=(ex*ux-dx*vx)/determinant;
    const b=(dy*vy-ey*uy)/determinant, d=(ey*ux-dy*vx)/determinant;
    context.save();context.beginPath();
    // Slight overlapping clips avoid antialiased cracks along internal strip edges.
    const winding=Math.sign((d1.x-d0.x)*(d2.y-d0.y)-(d1.y-d0.y)*(d2.x-d0.x))||1;
    const normals=target.map((p,i)=>{const q=target[(i+1)%3],length=Math.hypot(q.x-p.x,q.y-p.y)||1;return {x:(q.y-p.y)/length*winding,y:-(q.x-p.x)/length*winding};});
    for(let i=0;i<3;i++){
      const p=target[i],previous=normals[(i+2)%3],next=normals[i];
      const expansion=.35/Math.max(.02,1+previous.x*next.x+previous.y*next.y);
      const ex=(previous.x+next.x)*expansion,ey=(previous.y+next.y)*expansion;
      const limit=Math.min(1,.75/(Math.hypot(ex,ey)||1));
      const x=p.x+ex*limit,y=p.y+ey*limit;
      i?context.lineTo(x,y):context.moveTo(x,y);
    }
    context.closePath();context.clip();context.transform(a,b,c,d,d0.x-a*s0.x-c*s0.y,d0.y-b*s0.x-d*s0.y);context.drawImage(texture,0,0);context.restore();
  }
  return {
    draw(context, limb, { foreground = false } = {}) {
      if (!limb.ankle) return false;
      const item=textures.get(limb.kind), {source,part,hull,widthScale:partWidth}=item;
      const orientation=Math.max(-1,Math.min(1,limb.orientation??1));
      const texture=foreground?item.foreground:source;
      const points=[limb.hip,limb.knee,limb.ankle,limb.foot], joints=part.joints;
      const proximal=Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y)+Math.hypot(points[2].x-points[1].x,points[2].y-points[1].y);
      const scale=(limb.skinLength ?? proximal)/((joints[2][1]-joints[0][1])*source.height);
      const lift=Math.max(0,Math.min(1,(limb.hip.y-limb.foot.y+16)/32));
      const raisedWeight=lift*lift*(3-2*lift);
      const rows=[0,joints[0][1]];
      const divisions=limb.kind==='hind'?24:6;
      for(let i=0;i<3;i++)for(let step=1;step<=divisions;step++)rows.push(step===divisions?joints[i+1][1]:joints[i][1]+(joints[i+1][1]-joints[i][1])*step/divisions);
      // The source's sole landmark is its floor: keep any transparent bottom margin above that floor.
      if(joints[3][1]<1)rows.push(1);
      const unique=[...new Set(rows)];
      const vertices=unique.map(y=>{
        let segment=0;while(segment<2&&y>joints[segment+1][1])segment++;
        const u=(y-joints[segment][1])/(joints[segment+1][1]-joints[segment][1]);
        const p=points[segment],q=points[segment+1];
        const center={x:p.x+(q.x-p.x)*u,y:p.y+(q.y-p.y)*u};
        let curvedTangent;
        if(raisedWeight>0 && u>=0 && u<=1){
          const previous=points[Math.max(0,segment-1)],next=points[Math.min(3,segment+2)];
          const t0={x:(q.x-previous.x)*.5,y:(q.y-previous.y)*.5};
          const t1={x:(next.x-p.x)*.5,y:(next.y-p.y)*.5};
          const a=2*u*u*u-3*u*u+1,b=u*u*u-2*u*u+u,c=-2*u*u*u+3*u*u,d=u*u*u-u*u;
          center.x+=(a*p.x+b*t0.x+c*q.x+d*t1.x-center.x)*raisedWeight;center.y+=(a*p.y+b*t0.y+c*q.y+d*t1.y-center.y)*raisedWeight;
          const da=6*u*u-6*u,db=3*u*u-4*u+1,dc=-da,dd=3*u*u-2*u;
          curvedTangent={x:da*p.x+db*t0.x+dc*q.x+dd*t1.x,y:da*p.y+db*t0.y+dc*q.y+dd*t1.y};
        }
        let cx=joints[segment][0]+(joints[segment+1][0]-joints[segment][0])*u;
        if(limb.kind==='hind'){
          const knots=joints.map(point=>point[1]);
          center.x=smoothSample(knots,points.map(point=>point.x),segment,u);
          center.y=smoothSample(knots,points.map(point=>point.y),segment,u);
          cx=smoothSample(knots,joints.map(point=>point[0]),segment,u);
        }
        if(y>joints[3][1])center.y=limb.foot.y;
        const sourceCenter=cx*source.width;
        // Average the adjacent bone tangents at each joint so the skin does not
        // acquire a sharp cuff where one axial span meets the next.
        const normalAt = index => {
          if(index===3)return {x:1,y:0};
          const before=points[Math.max(0,index-1)],after=points[Math.min(3,index+1)];
          const dx=after.x-before.x,dy=after.y-before.y,length=Math.hypot(dx,dy)||1;
          return {x:dy/length,y:-dx/length};
        };
        const n0=normalAt(segment),n1=normalAt(segment+1),weight=Math.max(0,Math.min(1,u));
        let nx=n0.x+(n1.x-n0.x)*weight,ny=n0.y+(n1.y-n0.y)*weight;
        if(curvedTangent){nx=curvedTangent.y;ny=-curvedTangent.x;}
        const wristWeight=segment===2?0:segment===1?1-Math.max(0,Math.min(1,u))**3:1;
        const angle=Math.atan2(ny,nx)*raisedWeight*wristWeight;nx=Math.cos(angle);ny=Math.sin(angle);
        let edges=[0,source.width];
        if(raisedWeight>0){
          let left=source.width,right=0;
          const radius=Math.ceil(source.height*.035),cy=Math.round(y*source.height);
          for(let r=Math.max(0,cy-radius);r<Math.min(source.height,cy+radius+1);r++){left=Math.min(left,hull[r][0]);right=Math.max(right,hull[r][1]);}
          const mirroredLeft=source.width-right,mirroredRight=source.width-left;
          const hullEdges=[Math.max(0,Math.min(left,mirroredLeft)-3),Math.min(source.width,Math.max(right,mirroredRight)+3)];
          edges=[hullEdges[0]*raisedWeight,source.width+(hullEdges[1]-source.width)*raisedWeight];
        }
        const rootWeight=Math.max(0,Math.min(1,(y-joints[0][1])/(joints[1][1]-joints[0][1])));
        const pawWeight=Math.max(0,Math.min(1,(y-joints[2][1])/(joints[3][1]-joints[2][1])));
        const perspectiveWidth=1+((limb.perspectiveFactor??1)-1)*(1-pawWeight);
        const widthScale=scale*(1+(.4+.6*rootWeight-1)*raisedWeight)*perspectiveWidth*partWidth;
        return edges.map(x=>({source:{x,y:y*source.height},segment,u,center,offset:{x:(x-sourceCenter)*widthScale*nx,y:(x-sourceCenter)*widthScale*ny}}));
      });
      // Skin both complete profiles onto the same solved joints before blending.
      // Mirroring the raw atlas would separate off-center sole landmarks.
      composedContext.clearRect(0,0,256,256);composedContext.globalCompositeOperation='lighter';
      for(const mirror of [1,-1]){
        const weight=(1+orientation*mirror)/2;if(weight<=0)continue;
        profileContext.clearRect(0,0,256,256);
        const target=vertex=>({x:vertex.center.x+vertex.offset.x*mirror,y:vertex.center.y+vertex.offset.y*mirror});
        for(let i=0;i<vertices.length-1;i++){
          const [a,b]=vertices[i],[c,d]=vertices[i+1];
          triangle(profileContext,texture,[a.source,b.source,c.source],[target(a),target(b),target(c)]);
          triangle(profileContext,texture,[b.source,d.source,c.source],[target(b),target(d),target(c)]);
        }
        composedContext.globalAlpha=weight;composedContext.drawImage(profileCanvas,0,0);
      }
      composedContext.globalAlpha=1;context.drawImage(composedCanvas,0,0);
      return true;
    },
  };
}
