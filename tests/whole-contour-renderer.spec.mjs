import {test,expect} from '@playwright/test';

test('v6 photographic endpoints retain their first canonical pixels after repeated readback',async({page})=>{
  await page.goto('/');
  const results=await page.evaluate(async()=>{
    const {createWholeRenderer}=await import('/src/rendering/whole-renderer.js');
    const records=[];
    for(const species of ['cat','dog']) {
      const meta=await fetch(`/pets/${species}-whole-v6.json`).then(r=>r.json());
      const images=await Promise.all(meta.pages.map(p=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/'+p.asset;})));
      for(const frame of [1,90]) {
        const canvas=document.createElement('canvas'),renderer=createWholeRenderer(canvas,{images,meta});
        const context=canvas.getContext('2d');
        renderer.draw({frame,nextFrame:frame,mix:0,facing:1});
        const before=new Uint8ClampedArray(context.getImageData(0,0,256,256).data);
        for(let i=0;i<130;i++){renderer.draw({frame,nextFrame:frame,mix:0,facing:1});context.getImageData(0,0,256,256);}
        const after=context.getImageData(0,0,256,256).data;
        let maximumAlphaDifference=0,maximumOpaqueRGBDifference=0;
        for(let i=0;i<before.length;i+=4){maximumAlphaDifference=Math.max(maximumAlphaDifference,Math.abs(before[i+3]-after[i+3]));if(before[i+3]>230)for(let c=0;c<3;c++)maximumOpaqueRGBDifference=Math.max(maximumOpaqueRGBDifference,Math.abs(before[i+c]-after[i+c]));}
        records.push({species,frame,maximumAlphaDifference,maximumOpaqueRGBDifference});renderer.dispose();
      }
    }
    return records;
  });
  for(const r of results){expect(r.maximumAlphaDifference,JSON.stringify(r)).toBe(0);expect(r.maximumOpaqueRGBDifference,JSON.stringify(r)).toBe(0);}
});

test('a v6 contour atlas changes one coherent boundary without transparent donor fur',async({page})=>{
  await page.goto('/');
  const r=await page.evaluate(async()=>{
    const {createWholeRenderer,validateWholeAtlas}=await import('/src/rendering/whole-renderer.js');
    const meta=await fetch('/pets/dog-whole-v6.json').then(r=>r.json());
    const images=meta.pages.map(p=>{const c=document.createElement('canvas');[c.width,c.height]=p.sourceSize;return c;});
    for(let i=0;i<2;i++) {
      const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
      ctx.fillStyle='rgb(180,110,45)';ctx.fillRect(60,70,120,140);if(i)ctx.clearRect(125,160,55,50);
      images.push(c);meta.pages.push({asset:`fixture-${i}.png`,sourceSize:[256,256],columns:1,rows:1});
      meta.frames.push({page:4+i,rect:[0,0,256,256],offsetX:0,offsetY:0});
    }
    meta.extraFrameCount=2;
    meta.flow.pairs=[[130,131]];const flowBytes=new Uint8Array(32*32*4).fill(128);
    const descriptor={version:1,pair:[130,131],asset:'fixture-contour.png',encoding:'opaque-rgb-temporal-coverage',samples:65,frameSize:256,columns:4,rows:6,gutter:2,sourceSize:[1040,1560]};
    const contour=document.createElement('canvas');[contour.width,contour.height]=descriptor.sourceSize;
    const ctx=contour.getContext('2d'),data=ctx.createImageData(contour.width,contour.height);
    for(let i=3;i<data.data.length;i+=4)data.data[i]=255;
    for(let frame=0;frame<65;frame++) {
      const tile=Math.floor(frame/3),channel=frame%3,tx=tile%4*260,ty=Math.floor(tile/4)*260;
      for(let y=-2;y<258;y++)for(let x=-2;x<258;x++) {
        const px=Math.max(0,Math.min(255,x))+.5,py=Math.max(0,Math.min(255,y))+.5;
        const inside=px>=60&&px<180&&py>=70&&py<210;
        const boundary=180-55*frame/64;
        const coverage=inside?(py>=160?Math.max(0,Math.min(1,boundary-px+.5)):1):0;
        data.data[((ty+y+2)*contour.width+tx+x+2)*4+channel]=Math.round(coverage*255);
      }
    }
    ctx.putImageData(data,0,0);
    const canvas=document.createElement('canvas');let renderer=createWholeRenderer(canvas,{images,meta,flowBytes});
    const pixel=(x,y)=>Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data);
    renderer.draw({frame:130,nextFrame:131,mix:.5,facing:1});const old=pixel(145,180);renderer.dispose();
    meta.flow.contours=[descriptor];
    renderer=createWholeRenderer(canvas,{images,meta,flowBytes,contourImages:[contour]});
    const draw=t=>{renderer.draw({frame:130,nextFrame:131,mix:t,facing:1});return canvas.toDataURL();};
    draw(.5);const retained=pixel(145,180),removed=pixel(165,180),interior=pixel(100,110);
    const forward=draw(.375);renderer.draw({frame:131,nextFrame:130,mix:.625,facing:1});const reverse=canvas.toDataURL();
    let maxTemporalAlphaJump=0;
    for(let k=1;k<64;k++) {
      draw(k/64-1e-8);const a=canvas.getContext('2d').getImageData(0,0,256,256).data;
      draw(k/64+1e-8);const b=canvas.getContext('2d').getImageData(0,0,256,256).data;
      for(let i=3;i<a.length;i+=4)maxTemporalAlphaJump=Math.max(maxTemporalAlphaJump,Math.abs(a[i]-b[i]));
    }
    const rejected=[];
    for(const change of [m=>m.flow.contours[0].pair.reverse(),m=>m.flow.contours.push(structuredClone(m.flow.contours[0])),m=>m.flow.contours[0].samples=64,m=>m.flow.contours[0].encoding='rgba',m=>m.flow.contours[0].sourceSize[0]--]){
      const broken=structuredClone(meta);change(broken);try{validateWholeAtlas(images,broken);rejected.push(false);}catch{rejected.push(true);}
    }
    let missingRejected=false,dimensionRejected=false;
    try{createWholeRenderer(document.createElement('canvas'),{images,meta,flowBytes});}catch{missingRejected=true;}
    try{createWholeRenderer(document.createElement('canvas'),{images,meta,flowBytes,contourImages:[images[4]]});}catch{dimensionRejected=true;}
    renderer.dispose();return {old,retained,removed,interior,reverseExact:forward===reverse,maxTemporalAlphaJump,rejected,missingRejected,dimensionRejected};
  });
  expect(r.old[3]).toBeGreaterThan(100);expect(r.old[3]).toBeLessThan(150);
  expect(r.retained).toEqual([180,110,45,255]);expect(r.removed).toEqual([0,0,0,0]);expect(r.interior).toEqual([180,110,45,255]);
  expect(r.reverseExact).toBe(true);expect(r.maxTemporalAlphaJump).toBe(0);
  expect(r.rejected).toEqual([true,true,true,true,true]);expect(r.missingRejected).toBe(true);expect(r.dimensionRejected).toBe(true);
});
