const kernel=(x,y)=>{const squared=x*x+y*y;return squared>1e-12?squared*Math.log(squared):0;};
function inverse(matrix) {
  const size=matrix.length,rows=matrix.map((row,i)=>[...row,...Array.from({length:size},(_,j)=>Number(i===j))]);
  for(let column=0;column<size;column++){
    let pivot=column;for(let r=column+1;r<size;r++)if(Math.abs(rows[r][column])>Math.abs(rows[pivot][column]))pivot=r;
    [rows[column],rows[pivot]]=[rows[pivot],rows[column]];
    const divisor=rows[column][column];if(Math.abs(divisor)<1e-12)throw new Error('Degenerate head landmarks');
    for(let c=0;c<size*2;c++)rows[column][c]/=divisor;
    for(let r=0;r<size;r++)if(r!==column){const factor=rows[r][column];for(let c=0;c<size*2;c++)rows[r][c]-=factor*rows[column][c];}
  }
  return rows.map(row=>row.slice(size));
}

/** A smooth skull deformation has no special shear seam at facial rows. */
export function createHeadViews(document,image,meta) {
  const registration=meta.registration,models=new Map(),profiles=new Map(),controlCache=new Map(),canvas=document.createElement('canvas'),profileCanvas=document.createElement('canvas');
  canvas.width=canvas.height=profileCanvas.width=profileCanvas.height=256;
  const context=canvas.getContext('2d'),profileContext=profileCanvas.getContext('2d');
  function profile(index) {
    if(profiles.has(index))return profiles.get(index);
    const [sx,sy,width,height]=meta.parts[index],texture=document.createElement('canvas');texture.width=width;texture.height=height;
    const ink=texture.getContext('2d');ink.drawImage(image,sx,sy,width,height,0,0,width,height);
    const pixels=ink.getImageData(0,0,width,height).data;
    const contours=Array.from({length:height},(_,y)=>{
      let left=width,right=-1;
      for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=32){left=Math.min(left,x);right=Math.max(right,x);}
      return right<left?null:[left/width,(right+1)/width];
    });
    const result={texture,contours};profiles.set(index,result);return result;
  }
  function controls(index,mirror) {
    const key=index+':'+mirror;if(controlCache.has(key))return controlCache.get(key);
    const mark=registration.features[index],anchor=registration.anchors[index];
    const points={eye0:mark.eyes[mirror<0?1:0],eye1:mark.eyes[mirror<0?0:1],nose:mark.nose,mouth:mark.mouth,neck:anchor,
      topLeft:[mirror<0?1:0,0],topRight:[mirror<0?0:1,0],bottomLeft:[mirror<0?1:0,1],bottomRight:[mirror<0?0:1,1]};
    const {texture,contours}=profile(index);
    const eyeY=(mark.eyes[0][1]+mark.eyes[1][1])/2;
    for(const [name,y]of [['Forehead',.18],['Ear',eyeY],['LowerEar',.67],['Chin',.84]]){
      let at=Math.min(texture.height-1,Math.max(0,Math.round(y*texture.height))),edges=contours[at];
      for(let distance=1;!edges&&distance<texture.height;distance++)edges=contours[Math.max(0,at-distance)]||contours[Math.min(texture.height-1,at+distance)];
      points['left'+name]=[edges[mirror<0?1:0],y];points['right'+name]=[edges[mirror<0?0:1],y];
    }
    controlCache.set(key,points);return points;
  }
  function model(index,mirror) {
    const key=index+':'+mirror;if(models.has(key))return models.get(key);
    const points={...controls(index,mirror)},mark=registration.features[index];
    // A strict side profile contains one visible pupil. It must not be
    // stretched into the far-eye landmark of a front-facing projection.
    if(Math.hypot(mark.eyes[0][0]-mark.eyes[1][0],mark.eyes[0][1]-mark.eyes[1][1])<.06)delete points[mirror<0?'eye0':'eye1'];
    const keys=Object.keys(points),source=Object.values(points),count=source.length;
    const matrix=source.map(([x,y])=>[...source.map(([u,v])=>kernel(x-u,y-v)),1,x,y]);
    matrix.push([...Array(count).fill(1),0,0,0],source.map(([x])=>x).concat([0,0,0]),source.map(([,y])=>y).concat([0,0,0]));
    const inverted=inverse(matrix),steps=14;
    const vertices=Array.from({length:steps+1},(_,r)=>Array.from({length:steps+1},(_,c)=>{
      const x=mirror<0?1-c/steps:c/steps,y=r/steps,basis=[...source.map(([u,v])=>kernel(x-u,y-v)),1,x,y];
      return {x,y,weights:source.map((_,i)=>basis.reduce((sum,value,j)=>sum+value*inverted[j][i],0))};
    }));
    const {texture}=profile(index);
    const result={vertices,keys,texture,steps};models.set(key,result);return result;
  }
  function triangle(texture,source,destination) {
    const [s0,s1,s2]=source,[d0,d1,d2]=destination,ux=s1.x-s0.x,uy=s1.y-s0.y,vx=s2.x-s0.x,vy=s2.y-s0.y,det=ux*vy-uy*vx;
    const dx=d1.x-d0.x,dy=d1.y-d0.y,ex=d2.x-d0.x,ey=d2.y-d0.y,a=(dx*vy-ex*uy)/det,c=(ex*ux-dx*vx)/det,b=(dy*vy-ey*uy)/det,d=(ey*ux-dy*vx)/det;
    profileContext.save();profileContext.beginPath();const winding=Math.sign(dx*ey-dy*ex)||1;
    const normals=destination.map((p,i)=>{const q=destination[(i+1)%3],length=Math.hypot(q.x-p.x,q.y-p.y)||1;return {x:(q.y-p.y)/length*winding,y:-(q.x-p.x)/length*winding};});
    destination.forEach((p,i)=>{const previous=normals[(i+2)%3],next=normals[i],expansion=.3/Math.max(.02,1+previous.x*next.x+previous.y*next.y);let x=(previous.x+next.x)*expansion,y=(previous.y+next.y)*expansion;const bound=Math.min(1,.7/(Math.hypot(x,y)||1));x=p.x+x*bound;y=p.y+y*bound;i?profileContext.lineTo(x,y):profileContext.moveTo(x,y);});
    profileContext.closePath();profileContext.clip();profileContext.transform(a,b,c,d,d0.x-a*s0.x-c*s0.y,d0.y-b*s0.x-d*s0.y);profileContext.drawImage(texture,0,0);profileContext.restore();
  }
  return {
    draw(target,entries) {
      const views=entries.filter(view=>view.alpha>0);
      if(views.length===1){
        const view=views[0],{anchorX,anchorY,mirror,angle}=view.options;
        target.save();target.translate(view.x,view.y);target.rotate(angle);target.scale(mirror,1);
        target.drawImage(image,...meta.parts[view.index],-view.width*anchorX,-view.height*anchorY,view.width,view.height);target.restore();return;
      }
      context.clearRect(0,0,256,256);context.globalCompositeOperation='lighter';
      const targets=Object.fromEntries(Object.keys(controls(views[0].index,views[0].options.mirror)).map(key=>{
        const point=views.reduce((sum,view)=>{
          const control=controls(view.index,view.options.mirror)[key],anchor=registration.anchors[view.index];
          sum.x+=(control[0]-anchor[0])*view.width*view.options.mirror*view.alpha;
          sum.y+=(control[1]-anchor[1])*view.height*view.alpha;return sum;
        },{x:0,y:0});
        const angle=views[0].options.angle,cos=Math.cos(angle),sin=Math.sin(angle);
        return [key,{x:views[0].x+point.x*cos-point.y*sin,y:views[0].y+point.x*sin+point.y*cos}];
      }));
      for(const view of views){
        const {vertices,keys,texture,steps}=model(view.index,view.options.mirror);
        const projected=vertices.map(row=>row.map(vertex=>({x:vertex.weights.reduce((sum,weight,i)=>sum+weight*targets[keys[i]].x,0),y:vertex.weights.reduce((sum,weight,i)=>sum+weight*targets[keys[i]].y,0)})));
        const anchor=registration.anchors[view.index],angle=view.options.angle,cos=Math.cos(angle),sin=Math.sin(angle);
        const baseline=vertices.map(row=>row.map(vertex=>{
          const x=(vertex.x-anchor[0])*view.width*view.options.mirror,y=(vertex.y-anchor[1])*view.height;
          return {x:view.x+x*cos-y*sin,y:view.y+x*sin+y*cos};
        }));
        const area=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
        const valid=points=>{
          for(let r=0;r<steps;r++)for(let c=0;c<steps;c++){
            if(area(points[r][c],points[r][c+1],points[r+1][c])<=1e-5||area(points[r][c+1],points[r+1][c+1],points[r+1][c])<=1e-5)return false;
          }
          return true;
        };
        let destination=projected;
        // Downward care portraits have a different projection. Bound their
        // deformation toward the exact, neck-anchored source instead of ever
        // drawing a folded face. The same smooth field remains over the skull.
        if(!valid(projected)){
          let lower=0,upper=1;destination=baseline;
          for(let attempt=0;attempt<12;attempt++){
            const strength=(lower+upper)/2,candidate=projected.map((row,r)=>row.map((point,c)=>({x:baseline[r][c].x+(point.x-baseline[r][c].x)*strength,
              y:baseline[r][c].y+(point.y-baseline[r][c].y)*strength})));
            if(valid(candidate)){lower=strength;destination=candidate;}else upper=strength;
          }
        }
        const source=vertices.map(row=>row.map(v=>({x:v.x*texture.width,y:v.y*texture.height})));
        profileContext.clearRect(0,0,256,256);
        for(let r=0;r<steps;r++)for(let c=0;c<steps;c++){
          triangle(texture,[source[r][c],source[r][c+1],source[r+1][c]],[destination[r][c],destination[r][c+1],destination[r+1][c]]);
          triangle(texture,[source[r][c+1],source[r+1][c+1],source[r+1][c]],[destination[r][c+1],destination[r+1][c+1],destination[r+1][c]]);
        }
        context.globalAlpha=view.alpha;context.drawImage(profileCanvas,0,0);
      }
      context.globalAlpha=1;target.drawImage(canvas,0,0);
    },
  };
}
