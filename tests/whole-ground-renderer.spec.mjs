import { test, expect } from '@playwright/test';

async function inspect(page) {
  await page.goto('/');
  return page.evaluate(async () => {
    const { createWholeRenderer } = await import('/src/rendering/whole-renderer.js');
    const images = [6,6,4].map(rows => { const c=document.createElement('canvas');c.width=2048;c.height=rows*256;return c; });
    const ink=images[0].getContext('2d');ink.fillStyle='#b09070';ink.fillRect(44,80,178,90);
    const centers=[[60,211],[112,211],[160,216],[200,211]], colors=['#ff2020','#20ff20','#2020ff','#ff20ff'];
    centers.forEach(([x,y],i)=>{ink.fillStyle='#b09070';ink.fillRect(x-6,155,12,y-155);ink.fillStyle=colors[i];ink.fillRect(x-5,y-4,10,8);});
    const clip=(first,count,total,loop=false)=>({frames:Array.from({length:count},(_,i)=>first+i),durations:Array(count).fill(total/count),loop});
    const meta={version:5,neutralFrame:0,stride:32,pages:images.map((image,i)=>({asset:`page${i}`,sourceSize:[image.width,image.height],columns:8,rows:i===2?4:6})),
      frames:Array.from({length:128},(_,i)=>({page:i<48?0:i<96?1:2,rect:[i%8*256,Math.floor((i<96?i%48:i-96)/8)*256,256,256]})),
      clips:{idle:clip(0,12,6600,true),rest:clip(12,4,5600,true),walk:clip(96,32,1060,true),turn:clip(32,16,800),pet:clip(48,8,2400),feed:clip(56,8,1600,true),groom:clip(64,8,1700),stretch:clip(72,8,2600),hop:clip(80,10,2800)},
      groundGait:{version:1,sourceFrame:0,stride:32,support:.625,lift:8,fixedPins:[[40,145],[88,145],[136,145],[184,145],[224,145]],
        paws:centers.map((center,i)=>({id:['nearHind','farHind','nearFore','farFore'][i],center,sole:[center[0],center[1]+4],upper:[center[0],155],phase:[0,.5,.75,.25][i]}))}};
    const canvas=document.createElement('canvas');let renderer;
    try {renderer=createWholeRenderer(canvas,{images,meta});}catch(error){return {error:String(error)};}
    const pixels=()=>canvas.getContext('2d').getImageData(0,0,256,256).data;
    function marks() {
      const bytes=pixels(),out=Array.from({length:4},()=>[0,0,0]);
      for(let p=0;p<65536;p++)if(bytes[p*4+3]>220){const [r,g,b]=bytes.slice(p*4,p*4+3);const i=r>220&&g<70&&b<70?0:g>220&&r<70&&b<70?1:b>220&&r<70&&g<70?2:r>220&&b>220&&g<70?3:-1;if(i>=0){out[i][0]+=p%256+.5;out[i][1]+=Math.floor(p/256)+.5;out[i][2]++;}}
      return out.map(([x,y,n])=>({x:x/n,y:y/n,count:n}));
    }
    const sample=(phase,facing=1,ground={mode:'walk',phase})=>({frame:0,nextFrame:0,mix:0,clip:'walk',phase,facing,ground});
    renderer.draw({frame:0,clip:'idle',facing:1});const neutral=canvas.toDataURL(),neutralMarks=marks(),head=Array.from(pixels().slice(80*256*4,145*256*4));
    const rows=[];
    for(const facing of [1,-1])for(const phase of Array.from({length:32},(_,i)=>(i+.5)/32)){
      renderer.draw(sample(phase,facing));const feet=marks(),bytes=pixels();rows.push({phase,facing,feet,headExact:head.every((v,i)=>v===bytes[80*256*4+i])});
    }
    renderer.draw(sample(.3));const held=canvas.toDataURL();renderer.draw(sample(.3),999999);const frozen=canvas.toDataURL();
    renderer.draw(sample(.3,1,{mode:'settle',phase:.3,progress:0}));const settleStart=canvas.toDataURL();
    renderer.draw(sample(.3,1,{mode:'settle',phase:.3,progress:1}));const settleEnd=canvas.toDataURL();
    renderer.draw(sample(.3,1,{mode:'enter',phase:.3,progress:0}));const enterStart=canvas.toDataURL();
    renderer.draw(sample(.3,1,{mode:'enter',phase:.3,progress:.4}));const entering=canvas.toDataURL(),enteringMarks=marks();
    renderer.draw(sample(.3,1,{mode:'settle',phase:.3,progress:0,fromWeight:(1-Math.cos(Math.PI*.4))/2}));const enteringCanceled=canvas.toDataURL();
    renderer.draw(sample(.3,1,{mode:'settle',phase:.3,progress:0,fromEnterProgress:.4}));const liftedEnteringCanceled=canvas.toDataURL();
    renderer.dispose();return {backend:canvas.dataset.groundRenderer,rows,neutral,neutralMarks,held,frozen,settleStart,settleEnd,enterStart,entering,enteringMarks,enteringCanceled,liftedEnteringCanceled};
  });
}

test('v5 whole-image support locks observed opaque paw pixels to accepted world travel',async({page})=>{
  const result=await inspect(page);expect(result.error).toBeUndefined();expect(result.backend).toBe('whole-ground-webgl');
  for(const facing of [1,-1]) {
    for(const [paw,offset] of [0,.5,.75,.25].entries())for(const cycle of [0,1]) {
      const positions=result.rows.filter(r=>r.facing===facing&&Math.floor(r.phase+offset)===cycle&&(r.phase+offset)%1<.625).map(r=>({world:r.phase*32*facing+r.feet[paw].x,foot:r.feet[paw]}));
      if(positions.length<2)continue;
      const world=positions.map(p=>p.world);expect(Math.max(...world)-Math.min(...world)).toBeLessThan(1.5);
      expect(positions.every(p=>p.foot.count>45)).toBe(true);
    }
  }
  expect(result.rows.filter(r=>r.facing===1).every(r=>r.headExact)).toBe(true);
});

test('the first step lifts each preparing paw before placement and cancel preserves that lifted pose',async({page})=>{
  const result=await inspect(page);expect(result.error).toBeUndefined();
  expect(result.neutralMarks[0].y-result.enteringMarks[0].y).toBeGreaterThan(3.5);
  expect(result.liftedEnteringCanceled).toBe(result.entering);
});

test('whole-image walking freezes exactly and settles into the intact neutral source',async({page})=>{
  const result=await inspect(page);expect(result.error).toBeUndefined();expect(result.frozen).toBe(result.held);
  expect(result.settleStart).toBe(result.held);expect(result.settleEnd).toBe(result.neutral);expect(result.enterStart).toBe(result.neutral);
  expect(result.liftedEnteringCanceled).toBe(result.entering);
});
