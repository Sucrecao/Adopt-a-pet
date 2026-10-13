import { test, expect } from '@playwright/test';

async function probe(page, mode = 'normal') {
  await page.goto('/');
  return page.evaluate(async mode => {
    const { createWholeRenderer, validateWholeAtlas } = await import('/src/rendering/whole-renderer.js');
    const images = [6,6,4].map(rows => {
      const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = rows * 256;
      return canvas;
    });
    const ink = images[0].getContext('2d');
    for (const [frame,x] of mode==='scale'?[[0,64],[1,80]]:[[0,40],[1,120]]) {
      const scale=mode==='scale'&&frame===1?1.25:1;
      const y=mode==='diagonal'?56+frame*80:96;
      ink.fillStyle = '#e0523d'; ink.fillRect(frame * 256 + x,y,32*scale,48);
      ink.fillStyle = '#00a060'; ink.fillRect(frame * 256 + x,y,8*scale,8);
    }
    const clip = (first,count,total,loop=false) => ({ frames:Array.from({length:count},(_,i)=>first+i), durations:Array(count).fill(total/count), loop });
    const meta = { version:4, neutralFrame:0, stride:64,
      pages:images.map((image,index)=>({asset:`page-${index}.png`,sourceSize:[image.width,image.height],columns:8,rows:index===2?4:6,scale:1})),
      frames:Array.from({length:128},(_,i)=>({page:i<48?0:i<96?1:2,rect:[i%8*256,Math.floor((i<96?i%48:i-96)/8)*256,256,256],offsetX:0,offsetY:0})),
      clips:{idle:clip(0,12,6600,true),rest:clip(12,4,5600,true),walk:clip(96,32,1060,true),turn:clip(32,16,800),pet:clip(48,8,2400),feed:clip(56,8,1600,true),groom:clip(64,8,1700),stretch:clip(72,8,2600),hop:clip(80,10,2800)},
      flow:{version:1,size:32,frameSize:256,encoding:'signed-one-pixel-rgba',pairs:[[0,1]],asset:'fixture-flow.bin'} };
    if (mode === 'registeredMirror') { meta.frames[0].mirror = -1; meta.frames[1].mirror = -1; }
    if (mode === 'invalidDescriptor') meta.flow.size=16;
    if (mode === 'rejectedPair') meta.flow.pairs=[[2,3]];
    if (mode === 'legacyV3') { meta.version=3; delete meta.flow; }
    const bytes = new Uint8Array(32*32*4);
    const shift = mode === 'registeredMirror' ? -80 : 80;
    for(let i=0;i<bytes.length;i+=4) bytes.set([128+shift,128,128-shift,128],i);
    if (mode === 'diagonal') for(let i=0;i<bytes.length;i+=4) bytes.set([208,208,48,48],i);
    if (mode === 'scale') for(let y=0;y<32;y++) for(let x=0;x<32;x++) bytes.set([128+2*x+1,128,128-Math.round((x+.5)*8/5),128],(y*32+x)*4);
    if (mode === 'backgroundFold') for(let y=8;y<22;y++) for(let x=17;x<27;x++) bytes[(y*32+x)*4]=0;
    let gpuContext;
    if (mode === 'noGpu' || mode === 'contextLoss') {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type,...args) {
        if (mode === 'noGpu' && type.startsWith('webgl')) return null;
        const context=getContext.call(this,type,...args); if(type==='webgl') gpuContext=context; return context;
      };
    }
    const canvas = document.createElement('canvas');
    let renderer;
    try { renderer=createWholeRenderer(canvas,{images,meta,flowBytes:mode==='invalidBytes'?bytes.subarray(4):mode==='missingBytes'?undefined:bytes}); }
    catch(error) { return { available:false,error:String(error) }; }
    const pixels=()=>{
      const data=canvas.getContext('2d').getImageData(0,0,256,256).data;
      let alpha=0,count=0,weightedX=0,weightedY=0,left=256,top=256,right=-1,bottom=-1;
      const components=new Set();
      for(let i=0;i<256*256;i++) if(data[i*4+3]>0) {const x=i%256,y=Math.floor(i/256),a=data[i*4+3];alpha+=a;weightedX+=(x+.5)*a;weightedY+=(y+.5)*a;if(a===255)count++;if(a>=128){components.add(i);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}
      let regions=0;
      while(components.size){regions++;const stack=[components.values().next().value];components.delete(stack[0]);while(stack.length){const p=stack.pop();for(const n of [p-1,p+1,p-256,p+256])if(n>=0&&n<65536&&Math.abs(n%256-p%256)<=1&&components.delete(n))stack.push(n);}}
      return {hash:canvas.toDataURL(),centroid:[weightedX/alpha,weightedY/alpha],opaque:count,alpha,regions,bounds:[left,top,right-left+1,bottom-top+1],corner:Array.from(data.slice(0,4)),marker:Array.from(data.slice((100*256+83)*4,(100*256+83)*4+4)),mirroredMarker:Array.from(data.slice((100*256+172)*4,(100*256+172)*4+4))};
    };
    const draw=(frame,nextFrame,mix,facing=1,stopped=false)=>{renderer.draw({frame,nextFrame,mix,facing,clip:'idle',stopped},100);return pixels();};
    const first=draw(0,1,0),quarter=draw(0,1,.25),middle=draw(0,1,.5),threeQuarter=draw(0,1,.75),last=draw(0,1,1);
    const reverse=draw(1,0,.75),mirrored=draw(0,1,.5,-1);
    const reverseThreeQuarter=draw(1,0,.25),reverseTie=draw(1,0,.5),reverseEnd=draw(1,0,1);
    const canceledFrom=draw(0,1,.375),canceledTo=draw(1,0,.625);
    const frozen=draw(0,1,.25,1,true);renderer.draw({frame:0,nextFrame:1,mix:.25,facing:1,clip:'idle',stopped:true},100000);const later=pixels();
    const noPair=draw(0,2,.5),backend=canvas.dataset.renderer;
    const rejected=change=>{const value=structuredClone(meta);change(value);try{validateWholeAtlas(images,value);return false;}catch{return true;}};
    const valid=validateWholeAtlas(images,meta),invalid=[rejected(m=>m.frames.pop()),rejected(m=>m.pages.pop()),rejected(m=>m.pages[2].rows=6),rejected(m=>m.frames[127].page=3)];
    let lost;
    if(mode==='contextLoss') {
      gpuContext.getExtension('WEBGL_lose_context').loseContext();
      await new Promise(resolve=>setTimeout(resolve,30));
      const pose=draw(0,1,.5);lost={pose,backend:canvas.dataset.renderer};
    }
    renderer.dispose();const cleared=pixels(),afterDispose=renderer.draw({frame:0,nextFrame:1,mix:.5,facing:1});renderer.dispose();
    return {available:true,backend,first,quarter,middle,threeQuarter,last,reverse,reverseThreeQuarter,reverseTie,reverseEnd,canceledFrom,canceledTo,mirrored,frozen,later,noPair,valid,invalid,cleared,afterDispose,lost};
  },mode);
}

test('whole flow midpoint is one opaque silhouette at its measured translated location',async({page})=>{
  const r=await probe(page);expect(r.available).toBe(true);expect(r.backend).toBe('whole-flow-2d');
  expect(r.middle.regions).toBe(1);expect(r.middle.bounds).toEqual([80,96,32,48]);expect(r.middle.centroid[0]).toBeCloseTo(96,5);expect(r.middle.centroid[1]).toBeCloseTo(120,5);
  expect(r.middle.opaque).toBe(32*48);expect(r.middle.alpha).toBe(32*48*255);expect(r.middle.corner).toEqual([0,0,0,0]);expect(r.middle.marker).toEqual([0,160,96,255]);
});

test('flow endpoints retain exact complete source bounds and reverse interpolation is pixel symmetric',async({page})=>{
  const r=await probe(page);expect(r.available).toBe(true);
  expect(r.first.bounds).toEqual([40,96,32,48]);expect(r.last.bounds).toEqual([120,96,32,48]);expect(r.quarter.bounds).toEqual([60,96,32,48]);expect(r.reverse.hash).toBe(r.quarter.hash);
  expect(r.noPair.hash).toBe(r.first.hash);
});

test('whole-facing mirror preserves interpolated alpha and colored fur landmarks',async({page})=>{
  const r=await probe(page);expect(r.available).toBe(true);expect(r.mirrored.bounds).toEqual([144,96,32,48]);expect(r.mirrored.mirroredMarker).toEqual([0,160,96,255]);expect(r.mirrored.opaque).toBe(r.middle.opaque);
});

test('canonical registered source mirrors compose with final facing mirrors before flow is displayed',async({page})=>{
  const r=await probe(page,'registeredMirror');expect(r.available).toBe(true);expect(r.backend).toBe('whole-flow-2d');
  expect(r.middle.bounds).toEqual([144,96,32,48]);expect(r.mirrored.bounds).toEqual([80,96,32,48]);expect(r.mirrored.marker).toEqual([0,160,96,255]);expect(r.reverse.hash).toBe(r.quarter.hash);
});

test('repeated paused interpolated samples freeze pixels and resource disposal clears the visible canvas',async({page})=>{
  const r=await probe(page);expect(r.available).toBe(true);expect(r.frozen.hash).toBe(r.later.hash);expect(r.cleared.alpha).toBe(0);expect(r.afterDispose).toBe(false);
});

for(const mode of ['invalidBytes','invalidDescriptor','missingBytes','noGpu']) test(`${mode} safely retains the complete-frame 2D renderer`,async({page})=>{
  const r=await probe(page,mode);expect(r.available).toBe(true);expect(r.backend).toBe('whole-2d');expect(r.middle.hash).toBe(r.first.hash);expect(r.middle.regions).toBe(1);
});

test('v4 validation retains exactly three registered pages and128 whole frames',async({page})=>{
  const r=await probe(page);expect(r.available).toBe(true);expect(r.valid).toBe(true);expect(r.invalid).toEqual([true,true,true,true]);
});

test('a lost offscreen GPU context keeps the visible 2D canvas and falls back to a complete source frame',async({page})=>{
  const r=await probe(page,'contextLoss');expect(r.available).toBe(true);expect(r.backend).toBe('whole-flow-2d');expect(r.lost.backend).toBe('whole-2d');expect(r.lost.pose.hash).toBe(r.first.hash);expect(r.lost.pose.opaque).toBe(32*48);
});

test('transparent background triangles cannot overwrite an opaque warped silhouette',async({page})=>{
  const r=await probe(page,'backgroundFold');expect(r.available).toBe(true);expect(r.backend).toBe('whole-flow-2d');expect(r.middle.bounds).toEqual([80,96,32,48]);expect(r.middle.opaque).toBe(32*48);expect(r.middle.alpha).toBe(32*48*255);
});

test('a measured global scale moves both endpoints into the same intermediate geometry',async({page})=>{
  const r=await probe(page,'scale');expect(r.available).toBe(true);expect(r.backend).toBe('whole-flow-2d');expect(r.middle.regions).toBe(1);expect(r.middle.bounds).toEqual([72,96,36,48]);expect(r.middle.centroid[0]).toBeCloseTo(90,4);expect(r.middle.centroid[1]).toBeCloseTo(120,4);
  // Resampled outer columns have filtered alpha; total silhouette mass and
  // every interior column still agree with the measured 1.125x geometry.
  expect(r.middle.opaque).toBe(34*48);expect(r.middle.alpha).toBe(36*48*255);expect(r.reverse.hash).toBe(r.quarter.hash);
});

test('global translation preserves both screen axes and a single fully opaque midpoint',async({page})=>{
  const r=await probe(page,'diagonal');expect(r.available).toBe(true);expect(r.backend).toBe('whole-flow-2d');expect(r.first.bounds).toEqual([40,56,32,48]);expect(r.quarter.bounds).toEqual([60,76,32,48]);expect(r.middle.bounds).toEqual([80,96,32,48]);expect(r.last.bounds).toEqual([120,136,32,48]);expect(r.middle.centroid).toEqual([96,120]);expect(r.middle.regions).toBe(1);expect(r.middle.opaque).toBe(32*48);expect(r.middle.alpha).toBe(32*48*255);expect(r.reverse.hash).toBe(r.quarter.hash);
});

for(const mode of ['rejectedPair','missingBytes','noGpu']) test(`${mode} v4 fallback chooses a symmetric nearest source during reverse and cancellation`,async({page})=>{
  const r=await probe(page,mode);expect(r.available).toBe(true);expect(r.backend).toBe(mode==='rejectedPair'?'whole-flow-2d':'whole-2d');
  expect(r.first.bounds).toEqual([40,96,32,48]);expect(r.last.bounds).toEqual([120,96,32,48]);expect(r.reverseEnd.hash).toBe(r.first.hash);
  expect(r.quarter.hash).toBe(r.first.hash);expect(r.threeQuarter.hash).toBe(r.last.hash);
  expect(r.reverse.hash).toBe(r.quarter.hash);expect(r.reverseThreeQuarter.hash).toBe(r.threeQuarter.hash);
  expect(r.middle.hash).toBe(r.first.hash);expect(r.reverseTie.hash).toBe(r.middle.hash);
  expect(r.canceledFrom.hash).toBe(r.canceledTo.hash);expect(r.frozen.hash).toBe(r.later.hash);
});

test('legacy v3 source selection keeps its original frame behavior despite interpolation-shaped samples',async({page})=>{
  const r=await probe(page,'legacyV3');expect(r.available).toBe(true);expect(r.backend).toBe('whole-2d');expect(r.last.hash).toBe(r.first.hash);expect(r.threeQuarter.hash).toBe(r.first.hash);expect(r.reverse.bounds).toEqual([120,96,32,48]);
});

