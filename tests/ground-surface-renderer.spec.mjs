import {test,expect} from '@playwright/test';

for(const species of ['cat','dog'])test(`${species}: integrated skin preserves actual neutral, pause, mirror and every interrupted first stance`,async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async species=>{
    const {createWholeRenderer}=await import('/src/rendering/whole-renderer.js');
    const {createGroundPoseModel}=await import('/src/core/ground-surface-pose.js');
    const meta=await fetch(`/pets/${species}-whole-v6.json`).then(r=>r.json());
    const image=asset=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/'+asset;});
    const [images,skinImage,bodyImage,flowBytes]=await Promise.all([
      Promise.all(meta.pages.map(p=>image(p.asset))),image(meta.groundGait.skinAsset),image(meta.groundGait.bodyAsset),
      fetch('/'+meta.flow.asset).then(r=>r.arrayBuffer()),
    ]);
    const canvas=document.createElement('canvas'),renderer=createWholeRenderer(canvas,{images,meta,flowBytes,surfaceImages:{skinImage,bodyImage}});
    const context=canvas.getContext('2d');
    const bytes=()=>context.getImageData(0,0,256,256).data;
    const draw=ground=>renderer.draw({frame:0,nextFrame:0,mix:0,facing:1,ground});
    draw();const neutral=canvas.toDataURL(),neutralBytes=new Uint8ClampedArray(bytes());
    const neutralDifferences=[];
    const exact=[];
    for(const phase of [0,.125,.375,.53125,.984375]) {
      draw({mode:'settle',phase,progress:1});exact.push(canvas.toDataURL()===neutral);
      const current=bytes();let max=0,count=0,opaqueMax=0;
      for(let j=0;j<current.length;j++){const d=Math.abs(current[j]-neutralBytes[j]);max=Math.max(max,d);if(d)count++;if(neutralBytes[j-j%4+3]>128)opaqueMax=Math.max(opaqueMax,d);}
      neutralDifferences.push({phase,max,count,opaqueMax});
    }
    draw({mode:'enter',phase:.65,progress:0});exact.push(canvas.toDataURL()===neutral);
    draw({mode:'enter',phase:.65,progress:1});const prepared=canvas.toDataURL();
    draw({mode:'walk',phase:.65,travelCycles:0});exact.push(prepared===canvas.toDataURL());
    const canceled=[];
    for(const p of [.03,.2,.49,.73,.97]) {
      draw({mode:'enter',phase:.65,progress:p});const before=canvas.toDataURL();
      draw({mode:'settle',phase:.65,progress:0,fromEnterProgress:p});canceled.push(before===canvas.toDataURL());
    }
    for(const travelCycles of [.015625,.0625,.099,.125,.5,.999,1.125]) {
      const phase=.65+travelCycles;
      draw({mode:'walk',phase,travelCycles});const before=canvas.toDataURL();
      draw({mode:'walk',phase,travelCycles});exact.push(before===canvas.toDataURL());
      draw({mode:'settle',phase,progress:0,fromTravelCycles:travelCycles});canceled.push(before===canvas.toDataURL());
    }
    let maximumMirrorError=0,minimumOpaquePixels=Infinity;
    const model=createGroundPoseModel(meta.groundGait);
    for(let i=0;i<64;i++) {
      const ground={mode:'walk',phase:i/64};draw(ground);const original=new Uint8ClampedArray(bytes());
      const count=original.filter((v,j)=>j%4===3&&v>128).length;minimumOpaquePixels=Math.min(minimumOpaquePixels,count);
      renderer.draw({frame:0,nextFrame:0,mix:0,facing:-1,ground});const mirrored=bytes();
      for(let y=0;y<256;y++)for(let x=0;x<256;x++)for(let channel=0;channel<4;channel++)
        maximumMirrorError=Math.max(maximumMirrorError,Math.abs(original[(y*256+x)*4+channel]-mirrored[(y*256+255-x)*4+channel]));
      const pose=model.resolve(ground);if(pose.legs.length!==4)throw new Error('Incomplete pose');
    }
    const backend=canvas.dataset.groundRenderer;renderer.dispose();
    return {backend,exact,canceled,maximumMirrorError,minimumOpaquePixels,neutralDifferences};
  },species);
  expect(result.backend).toBe('jointed-surface-webgl');
  expect(result.exact.every(Boolean),JSON.stringify(result)).toBe(true);expect(result.canceled.every(Boolean)).toBe(true);
  expect(result.maximumMirrorError).toBe(0);expect(result.minimumOpaquePixels).toBeGreaterThan(17000);
});
