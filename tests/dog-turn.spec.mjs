import {test,expect} from '@playwright/test';

// Synthetic opaque contours isolate view coordination from fur color and atlas
// variations. All assertions read actual renderer pixels.
async function inspectViews(page) {
 return page.evaluate(async()=>{
  const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');
  const blank=document.createElement('canvas');blank.width=blank.height=32;
  const atlas=document.createElement('canvas');atlas.width=384;atlas.height=64;
  const ink=atlas.getContext('2d');
  ink.fillStyle='#ff0000';ink.fillRect(0,0,32,32); // Legacy side torso.
  for(let i=1;i<6;i++){ink.fillStyle='#0000ff';ink.fillRect(i*32,0,32,32);}
  for(let i=0;i<3;i++){ink.fillStyle='#00cc00';ink.fillRect(192+i*32,0,32,32);}
  const headMeta={version:2,revision:3,parts:Array.from({length:6},(_,i)=>[i*32,0,32,32]),registration:{
   body:{x:128,y:76,width:180,height:104},head:{offsetX:52,y:119,width:104,height:92},
   anchors:Array.from({length:6},()=>[.5,.8]),
   bodyViews:[{rect:[192,0,32,32],x:128,y:82,width:80,height:104,neck:{x:128,y:108}},
    {rect:[224,0,32,32],x:128,y:84,width:136,height:100,neck:{x:158,y:108}},
    {rect:[256,0,32,32],x:128,y:86,width:180,height:94,neck:{x:180,y:108}}],
   headViews:[null,{width:72,height:64},{width:48,height:64},{width:64,height:64},{width:72,height:64},{width:56,height:64}],
  }};
  const canvas=document.createElement('canvas'),renderer=createRigRenderer(canvas,{species:'dog',rigImage:blank,rigMeta:{parts:Array(6).fill([0,0,32,32])},headImage:atlas,headMeta});
  const results=[];
  for(const orientation of [-1,-.75,-.5,-.25,-1e-6,0,1e-6,.25,.5,.75,1]){
   const pose={legs:[],body:{},orientation,facing:orientation<0?-1:1,tailAngle:0,headAngle:0,expressionWeight:0,clip:'idle'};
   renderer.draw(pose,0);const pixels=canvas.getContext('2d').getImageData(0,0,256,256).data;
   const at=(x,y)=>Array.from(pixels.slice((y*256+x)*4,(y*256+x)*4+4));
   let left=256,right=-1,headLeft=256,headRight=-1,headTop=256,headBottom=-1;
   for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const p=at(x,y);if(y===160&&p[3]>240){left=Math.min(left,x);right=Math.max(right,x);}
    if(p[2]>220&&p[0]<20&&p[1]<20&&p[3]>240){headLeft=Math.min(headLeft,x);headRight=Math.max(headRight,x);headTop=Math.min(headTop,y);headBottom=Math.max(headBottom,y);}
   }
   const before=canvas.toDataURL();renderer.draw(pose,99);
   results.push({orientation,left,right,headLeft,headRight,headTop,headBottom,frozen:before===canvas.toDataURL(),pixels:orientation===-1e-6||orientation===1e-6?Array.from(pixels):undefined});
  }
  return results;
 });
}

test('dog v3 uses one matched frontal torso instead of two full side silhouettes',async({page})=>{
 await page.goto('/');const results=await inspectViews(page);
 for(const sample of results){
  const p=Math.abs(sample.orientation)*2,lower=Math.floor(p),mix=p-lower,widths=[80,136,180];
  const width=widths[lower]*(1-mix)+(widths[Math.min(2,lower+1)])*mix;
  // Chromium's filtered atlas crop can lose at most one edge pixel per side.
  expect(Math.abs(sample.right-sample.left+1-width),JSON.stringify({...sample,pixels:undefined})).toBeLessThanOrEqual(2);
 }
});

test('dog v3 heads preserve each view aspect and attach to the matching neck root',async({page})=>{
 await page.goto('/');const results=await inspectViews(page);
 for(const sample of results.filter(s=>[0,.5,1].includes(s.orientation))){
  const width=sample.orientation===0?64:sample.orientation===.5?48:72;
  const neck=sample.orientation===0?128:sample.orientation===.5?158:180;
  expect(Math.abs(sample.headRight-sample.headLeft+1-width)).toBeLessThanOrEqual(2);
  expect(Math.abs(sample.headBottom-sample.headTop+1-64)).toBeLessThanOrEqual(1);
  expect(Math.abs((sample.headLeft+sample.headRight+1)/2-neck)).toBeLessThanOrEqual(1);
  expect(sample.headTop).toBe(57); // 108 - .8 * 64, rasterized.
  expect(sample.frozen).toBeTruthy();
 }
 const before=results.find(s=>s.orientation===-1e-6).pixels,after=results.find(s=>s.orientation===1e-6).pixels;
 expect(before.reduce((maximum,v,i)=>Math.max(maximum,Math.abs(v-after[i])),0)).toBeLessThanOrEqual(1);
});

test('actual dog v3 keeps one connected head and chest through turns and expressions',async({page})=>{
 await page.goto('/');const results=await page.evaluate(async()=>{
  const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');
  const load=async src=>{const im=new Image();im.src=src;await im.decode();return im;};
  const [headImage,headMeta,rigImage,rigMeta]=await Promise.all([load('/pets/dog-cohesive-v3.png'),fetch('/pets/dog-head-rig-v3.json').then(r=>r.json()),load('/pets/dog-rig.png'),fetch('/pets/dog-rig.json').then(r=>r.json())]);
  const blank=document.createElement('canvas');blank.width=blank.height=32;
  const canvas=document.createElement('canvas'),renderer=createRigRenderer(canvas,{species:'dog',rigImage:blank,rigMeta,headImage,headMeta});
  const results=[],prototype=CanvasRenderingContext2D.prototype,original=prototype.transform,read=prototype.getImageData,matrices=[],scans={};
  prototype.transform=function(...matrix){matrices.push(matrix);return original.apply(this,matrix);};
  prototype.getImageData=function(...args){
   const key=this.canvas.width+'x'+this.canvas.height;
   if(headMeta.parts.slice(1).some(([, ,w,h])=>w===this.canvas.width&&h===this.canvas.height))scans[key]=(scans[key]||0)+1;
   return read.apply(this,args);
  };
  try{
   for(const orientation of [-1,-.75,-.5,-.25,0,.25,.5,.75,1])for(const clip of ['idle','pet','feed']){
    matrices.length=0;const pose={legs:[],body:{},orientation,facing:orientation<0?-1:1,tailAngle:0,headAngle:clip==='idle'?0:.15,clip,expressionWeight:clip==='idle'?0:1};
    renderer.draw(pose,0);const bytes=canvas.getContext('2d').getImageData(0,0,256,256).data,visited=new Uint8Array(256*256),sizes=[];
    const opaque=index=>bytes[index*4+3]>=64;
    for(let index=0;index<visited.length;index++)if(!visited[index]&&opaque(index)){
     const stack=[index];visited[index]=1;let size=0;
     while(stack.length){const at=stack.pop();size++;const x=at%256,y=Math.floor(at/256);for(const next of [x?at-1:-1,x<255?at+1:-1,y?at-256:-1,y<255?at+256:-1])if(next>=0&&!visited[next]&&opaque(next)){visited[next]=1;stack.push(next);}}
     if(size>=24)sizes.push(size);
    }
    let torsoWidth=0;for(let x=0;x<256;x++)if(bytes[(153*256+x)*4+3]>220)torsoWidth++;
    const frozen=canvas.toDataURL();renderer.draw(pose,50);
    let folds=0;
    for(let i=0;i<matrices.length;i+=392){
     const determinants=matrices.slice(i,i+392).map(([a,b,c,d])=>a*d-b*c),sign=Math.sign(determinants.find(v=>Math.abs(v)>1e-10));
     folds+=determinants.filter(v=>v*sign<=0).length;
    }
    results.push({orientation,clip,components:sizes.length,torsoWidth,frozen:frozen===canvas.toDataURL(),finite:matrices.every(m=>m.every(Number.isFinite)),triangles:matrices.length,folds});
   }
  }finally{prototype.transform=original;prototype.getImageData=read;}
  return {samples:results,scans,bodyRig:canvas.dataset.bodyRig,aspects:headMeta.parts.slice(1).map(([, ,w,h],i)=>({source:w/h,destination:headMeta.registration.headViews[i+1].width/headMeta.registration.headViews[i+1].height}))};
 });
 expect(results.bodyRig).toBe('matched-views-v3');
 for(const sample of results.samples){
  expect(sample.components,JSON.stringify(sample)).toBe(1);
  expect(sample.finite,JSON.stringify(sample)).toBeTruthy();
  expect(sample.folds,JSON.stringify(sample)).toBe(0);
  if([.25,.75].includes(Math.abs(sample.orientation)))expect(sample.triangles,JSON.stringify(sample)).toBeGreaterThanOrEqual(240);
  expect(sample.frozen,JSON.stringify(sample)).toBeTruthy();
  if(sample.orientation===0)expect(sample.torsoWidth,JSON.stringify(sample)).toBeLessThanOrEqual(84);
 }
 for(const aspect of results.aspects)expect(Math.abs(aspect.destination/aspect.source-1)).toBeLessThan(.025);
 expect(Object.values(results.scans)).toEqual([1,1,1,1,1]);
});


test('new dog tail points outward from the rump at both side endpoints',async({page})=>{
 await page.goto('/');const results=await page.evaluate(async()=>{
  const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');const im=new Image();im.src='/pets/dog-cohesive-v3.png';await im.decode();const meta=await fetch('/pets/dog-head-rig-v3.json').then(r=>r.json()),blank=document.createElement('canvas');blank.width=blank.height=32;
  const c=document.createElement('canvas'),r=createRigRenderer(c,{species:'dog',rigImage:blank,rigMeta:{parts:Array(6).fill([0,0,32,32])},headImage:im,headMeta:meta}),results=[];
  for(const orientation of [-1,1]){r.draw({legs:[],body:{},orientation,facing:orientation,tailAngle:0,headAngle:0,clip:'idle',expressionWeight:0},0);const p=c.getContext('2d').getImageData(0,0,256,256).data;let visible=0;for(let y=90;y<137;y++)for(let x=16;x<37;x++)if(p[(y*256+(orientation===1?x:255-x))*4+3]>=200)visible++;results.push({orientation,visible});}
  return results;
 });
 for(const result of results)expect(result.visible,JSON.stringify(result)).toBeGreaterThan(40);
});

test('actual blended dog faces avoid the extreme local shear behind horizontal facial shelves',async({page})=>{
 await page.goto('/');const results=await page.evaluate(async()=>{
  const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');const im=new Image();im.src='/pets/dog-cohesive-v3.png';await im.decode();const m=await fetch('/pets/dog-head-rig-v3.json').then(r=>r.json()),b=document.createElement('canvas');b.width=b.height=32;
  const c=document.createElement('canvas'),r=createRigRenderer(c,{species:'dog',rigImage:b,rigMeta:{parts:Array(6).fill([0,0,32,32])},headImage:im,headMeta:m}),proto=CanvasRenderingContext2D.prototype,original=proto.transform,matrices=[];
  proto.transform=function(...matrix){matrices.push(matrix);return original.apply(this,matrix);};const results=[];
  try{for(const orientation of [-.75,-.25,.25,.75]){matrices.length=0;r.draw({legs:[],body:{},orientation,facing:1,tailAngle:0,headAngle:0,clip:'idle',expressionWeight:0},0);
   const stretch=matrices.map(([a,b,c,d])=>{const sum=a*a+b*b+c*c+d*d,det=a*d-b*c;return Math.sqrt((sum+Math.sqrt(Math.max(0,sum*sum-4*det*det)))/2);});
   results.push({orientation,maximum:Math.max(...stretch),triangles:matrices.length});
  }}finally{proto.transform=original;}
  return results;
 });
 for(const result of results){expect(result.triangles).toBeGreaterThan(0);expect(result.maximum,JSON.stringify(result)).toBeLessThan(1.25);}
});

test('mixed dog head views register their opaque ear and cheek silhouettes',async({page})=>{
 await page.goto('/');const results=await page.evaluate(async()=>{
  const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');const im=new Image();im.src='/pets/dog-cohesive-v3.png';await im.decode();const meta=await fetch('/pets/dog-head-rig-v3.json').then(r=>r.json()),blank=document.createElement('canvas');blank.width=blank.height=32;
  const m={...meta,registration:{...meta.registration,tail:null,bodyViews:meta.registration.bodyViews.map(v=>({...v,rect:[0,0,1,1]}))}},c=document.createElement('canvas'),r=createRigRenderer(c,{species:'dog',rigImage:blank,rigMeta:{parts:Array(6).fill([0,0,32,32])},headImage:im,headMeta:m}),proto=CanvasRenderingContext2D.prototype,original=proto.drawImage,profiles=[];
  proto.drawImage=function(image,...args){if(this.globalCompositeOperation==='lighter'&&image instanceof HTMLCanvasElement&&image.width===256&&image.height===256&&this.globalAlpha>0&&this.globalAlpha<1)profiles.push(image.getContext('2d').getImageData(0,0,256,256).data);return original.call(this,image,...args);};const results=[];
  try{for(const orientation of [-.25,.25]){profiles.length=0;r.draw({legs:[],body:{},orientation,facing:1,tailAngle:0,headAngle:0,clip:'idle',expressionWeight:0},0);let disagreement=0;const[a,b]=profiles;for(let i=3;i<a.length;i+=4)if(a[i]>=200&&b[i]<=32||b[i]>=200&&a[i]<=32)disagreement++;results.push({orientation,disagreement});}}finally{proto.drawImage=original;}
  return results;
 });
 for(const result of results)expect(result.disagreement,JSON.stringify(result)).toBeLessThan(300);
});

test('adjacent feeding turn and expression poses deform the face continuously',async({page})=>{
 await page.goto('/');const results=await page.evaluate(async()=>{
  const {createRigRenderer}=await import('/src/rendering/rig-renderer.js'),im=new Image();im.src='/pets/dog-cohesive-v3.png';await im.decode();
  const m=await fetch('/pets/dog-head-rig-v3.json').then(r=>r.json()),b=document.createElement('canvas');b.width=b.height=32;
  const c=document.createElement('canvas'),r=createRigRenderer(c,{species:'dog',rigImage:b,rigMeta:{parts:Array(6).fill([0,0,32,32])},headImage:im,headMeta:m}),proto=CanvasRenderingContext2D.prototype,original=proto.transform,matrices=[];
  proto.transform=function(...matrix){matrices.push(matrix);return original.apply(this,matrix);};const results=[];
  try{
   for(const [axis,sign,start]of [['orientation',-1,.030],['orientation',1,.024],['orientation',1,.643],['orientation',-1,.655],['expressionWeight',1,.783],['expressionWeight',-1,.816]]){
    let previous;
    for(const value of [start,start+.001]){
     const orientation=axis==='orientation'?value*sign:.75*sign,expressionWeight=axis==='expressionWeight'?value:1;
     matrices.length=0;r.draw({legs:[],body:{},orientation,facing:sign,tailAngle:0,headAngle:.15,clip:'feed',expressionWeight},0);
     const lower=Math.floor(Math.abs(orientation)*2),indices=[...[3,2,1].slice(lower,lower+2),5],points=matrices.map(([a,b,c,d,e,f],index)=>{
      const part=indices[Math.floor(index/392)],mirror=part===3?1:sign,[,,w,h]=m.parts[part],at=index%392,row=Math.floor(at/28),col=Math.floor(at%28/2)+(at%2),x=(mirror<0?1-col/14:col/14)*w,y=row/14*h;
      return {x:a*x+c*y+e,y:b*x+d*y+f};
     });
     if(previous){let jump=0;for(let index=0;index<points.length;index++)jump=Math.max(jump,Math.hypot(points[index].x-previous[index].x,points[index].y-previous[index].y));results.push({axis,sign,start,jump});}
     previous=points;
    }
   }
  }finally{proto.transform=original;}
  return results;
 });
 for(const result of results)expect(result.jump,JSON.stringify(result)).toBeLessThan(.75);
});
