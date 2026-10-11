import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('dog v2 head registers its anatomical neck landmark instead of its crop bottom', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createRigRenderer } = await import('/src/rendering/rig-renderer.js');
    const blank=document.createElement('canvas');blank.width=blank.height=128;
    const headImage=document.createElement('canvas');headImage.width=128*6;headImage.height=128;
    const ink=headImage.getContext('2d');ink.fillStyle='#00cc44';ink.fillRect(128+60,76,8,8);
    const headMeta={version:2,parts:Array.from({length:6},(_,i)=>[i*128,0,128,128]),registration:{body:{x:128,y:76,width:180,height:104},head:{offsetX:52,y:119,width:104,height:92},anchors:Array.from({length:6},()=>[.5,.625])}};
    const canvas=document.createElement('canvas'),renderer=createRigRenderer(canvas,{species:'dog',rigImage:blank,rigMeta:{parts:Array(6).fill([0,0,128,128])},headImage,headMeta});
    const pose={legs:[],body:{},orientation:1,facing:1,tailAngle:0,headAngle:0,expressionWeight:0,clip:'idle'};
    renderer.draw(pose,0);
    const bytes=canvas.getContext('2d').getImageData(0,0,256,256).data,index=(119*256+180)*4;
    return {alpha:bytes[index+3],green:bytes[index+1]};
  });
  expect(result.alpha).toBeGreaterThan(220);expect(result.green).toBeGreaterThan(150);
});

test('preview dog uses the production registered head and preserves the old pair when optional v2 fails', async ({ page }) => {
  await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.getByRole('button',{name:/选择小狗/}).click();await page.getByRole('button',{name:/在预览中领养/}).click();
  const canvas=page.locator('.stage-pet canvas');
  await expect(canvas).toHaveAttribute('data-head-rig','registered-v2');
  await page.route('**/pets/dog-cohesive-v3.png',route=>route.abort());
  await page.reload();await expect(canvas).toHaveAttribute('data-body-rig','side-profile');
  await page.route('**/pets/dog-head-rig-v2.png',route=>route.abort());
  await page.reload();await expect(canvas).toHaveAttribute('data-head-rig','legacy-parts');
});

test('production dog head expressions remain continuous through the front-facing midpoint', async ({ page }) => {
  await page.goto('/');const result=await page.evaluate(async()=>{
    const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');
    const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
    const rigImage=await load('/pets/dog-rig.png'),rigMeta=await(await fetch('/pets/dog-rig.json')).json(),headImage=await load('/pets/dog-head-rig-v2.png'),headMeta=await(await fetch('/pets/dog-head-rig-v2.json')).json();
    const blank=document.createElement('canvas');blank.width=blank.height=128;
    const isolatedMeta={...headMeta,parts:headMeta.parts.map((part,index)=>index===0?[0,0,1,1]:part)};
    const deltas=[];
    // Remove only torso/tail layers; every head crop is the actual v2 artwork.
    for(const mode of ['registered-v2','legacy-behavior']){
      const canvas=document.createElement('canvas'),renderer=createRigRenderer(canvas,{species:'dog',rigImage:blank,rigMeta,headImage,headMeta:{...isolatedMeta,version:mode==='registered-v2'?2:1}});
      for(const clip of ['idle','pet','feed'])for(const headAngle of [0,.15])for(const epsilon of [1e-3,1e-4,1e-5,1e-6]){
        const pose={legs:[],body:{},facing:1,tailAngle:0,headAngle,expressionWeight:1,clip};
        renderer.draw({...pose,orientation:epsilon},0);const before=canvas.getContext('2d').getImageData(0,0,256,256).data;
        renderer.draw({...pose,orientation:-epsilon},8);const after=canvas.getContext('2d').getImageData(0,0,256,256).data;
        // Compare visible color on both backgrounds, not RGB hidden under alpha0.
        let maxDelta=0;for(const background of [255,22]){let delta=0;for(let i=0;i<before.length;i+=4){const a=before[i+3]/255,b=after[i+3]/255;for(let channel=0;channel<3;channel++)delta+=Math.abs(before[i+channel]*a+background*(1-a)-after[i+channel]*b-background*(1-b));}maxDelta=Math.max(maxDelta,delta/(256*256*3));}
        deltas.push({mode,clip,headAngle,epsilon,delta:maxDelta});
      }
    }return deltas;
  });await mkdir('.superpowers/sdd/evidence',{recursive:true});await writeFile('.superpowers/sdd/evidence/natural-head-midpoint.json',JSON.stringify(result,null,2));
  for(const sample of result.filter(sample=>sample.mode==='registered-v2'&&sample.epsilon===1e-6))expect(sample.delta,JSON.stringify(sample)).toBeLessThan(.1);
  for(const sample of result.filter(sample=>sample.mode==='legacy-behavior'&&sample.epsilon===1e-6&&(sample.headAngle===.15||sample.clip!=='idle')))expect(sample.delta,JSON.stringify(sample)).toBeGreaterThan(1);
});


test('production dog short-neck head keeps turn registration, expressions and exact frozen pixels', async ({ page }) => {
  await page.goto('/');const result=await page.evaluate(async()=>{
    const {createRigRenderer}=await import('/src/rendering/rig-renderer.js'),{createRigController}=await import('/src/core/rig-motion.js');
    const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
    const rigImage=await load('/pets/dog-rig.png'),rigMeta=await(await fetch('/pets/dog-rig.json')).json(),headImage=await load('/pets/dog-head-rig-v2.png'),headMeta=await(await fetch('/pets/dog-head-rig-v2.json')).json(),limbImage=await load('/pets/quadruped-legs-v2.png'),limbMeta=await(await fetch('/pets/quadruped-legs-v2.json')).json();
    const canvas=document.createElement('canvas'),renderer=createRigRenderer(canvas,{species:'dog',rigImage,rigMeta,headImage,headMeta,limbImage,limbMeta});
    const sheet=document.createElement('canvas');sheet.width=256*8;sheet.height=256*2;const context=sheet.getContext('2d');
    const columns=[['idle',1],['idle',-1],['idle',.5],['idle',-.5],['idle',0],['pet',1],['feed',-1],['groom',1]],fingerprints={};let maxEdge=0;
    for(const [column,[action,orientation]]of columns.entries()){
      const controller=createRigController({species:'dog',random:()=>0}),locomotion={epoch:1,distanceDip:0,spriteSizeDip:256,facing:orientation<0?-1:1,moving:false};
      let pose=controller.sample({action,actionElapsed:600,locomotion},0);pose={...pose,orientation};renderer.draw(pose,0);
      if(['pet','feed'].includes(action))fingerprints[action]=canvas.toDataURL();if(column===0)fingerprints.idle=canvas.toDataURL();
      const bytes=canvas.getContext('2d').getImageData(0,0,256,256).data;for(let n=0;n<256;n++)for(const [x,y]of [[n,0],[n,255],[0,n],[255,n]])maxEdge=Math.max(maxEdge,bytes[(y*256+x)*4+3]);
      for(let row=0;row<2;row++){context.fillStyle=row?'#16191f':'#ffffff';context.fillRect(column*256,row*256,256,256);context.drawImage(canvas,column*256,row*256);}
    }
    const turnAudit=[];for(const facing of [1,-1]){
      const controller=createRigController({species:'dog',random:()=>0}),locomotion={epoch:1,distanceDip:0,spriteSizeDip:256,facing,moving:false};
      const first=controller.sample({locomotion},0);renderer.draw(first,0);const before=canvas.getContext('2d').getImageData(0,0,256,256).data;locomotion.facing=-facing;
      const start=controller.sample({locomotion},.001);renderer.draw(start,.001);const after=canvas.getContext('2d').getImageData(0,0,256,256).data;let startDelta=0;for(let i=0;i<before.length;i++)startDelta+=Math.abs(before[i]-after[i]);
      let pose;for(let now=8;now<=800;now+=8)pose=controller.sample({locomotion},now);renderer.draw(pose,800);const frozen=canvas.toDataURL();renderer.draw(pose,2400);turnAudit.push({facing,startDelta:startDelta/before.length,frozen:canvas.toDataURL()===frozen});
    }
    const careAudit=[];for(const facing of [1,-1])for(const action of ['pet','feed','groom']){
      const controller=createRigController({species:'dog',random:()=>0}),locomotion={epoch:1,distanceDip:0,spriteSizeDip:256,facing,moving:false};controller.sample({locomotion},0);locomotion.facing=-facing;
      for(let now=8;now<=400;now+=8)controller.sample({locomotion},now);let pose;
      for(let elapsed=0;elapsed<=800;elapsed+=16){pose=controller.sample({action,actionStartedAt:1,actionElapsed:elapsed,locomotion},400+elapsed);renderer.draw(pose,400+elapsed);}
      const pixels=canvas.toDataURL(),paused=controller.sample({action,paused:true,locomotion},2000);renderer.draw(paused,2000);careAudit.push({facing,action,orientation:pose.orientation,samePose:paused===pose,frozen:canvas.toDataURL()===pixels});
    }
    return {sheet:sheet.toDataURL(),maxEdge,turnAudit,careAudit,distinct:fingerprints.pet!==fingerprints.idle&&fingerprints.feed!==fingerprints.idle&&fingerprints.pet!==fingerprints.feed};
  });
  await mkdir('.superpowers/sdd/evidence',{recursive:true});await writeFile('.superpowers/sdd/evidence/natural-head-white-dark.png',Buffer.from(result.sheet.split(',')[1],'base64'));
  await writeFile('.superpowers/sdd/evidence/natural-head-care-freeze.json',JSON.stringify(result.careAudit,null,2));
  for(const sample of result.careAudit){expect(Number.isFinite(sample.orientation)).toBeTruthy();expect(sample.samePose).toBeTruthy();expect(sample.frozen).toBeTruthy();}
  expect(result.maxEdge).toBe(0);expect(result.distinct).toBeTruthy();for(const sample of result.turnAudit){expect(sample.startDelta).toBeLessThan(.1);expect(sample.frozen).toBeTruthy();}
});

test('actual blended dog head places a single dark nose at the shared facial landmark',async({page})=>{
 await page.goto('/');const samples=await page.evaluate(async()=>{
 const{createRigRenderer}=await import('/src/rendering/rig-renderer.js');const load=async src=>{const i=new Image();i.src=src;await i.decode();return i;};const headImage=await load('/pets/dog-head-rig-v2.png'),headMeta=await(await fetch('/pets/dog-head-rig-v2.json')).json(),blank=document.createElement('canvas');blank.width=blank.height=128;
 const isolatedMeta={...headMeta,parts:headMeta.parts.map((p,i)=>i===0?[0,0,1,1]:p)},canvas=document.createElement('canvas'),r=createRigRenderer(canvas,{species:'dog',rigImage:blank,rigMeta:{parts:Array(6).fill([0,0,128,128])},headImage,headMeta:isolatedMeta}),out=[];
 for(const orientation of [.125,.25,.375,.625,.75,.875,-.125,-.25,-.375,-.625,-.75,-.875]){
  const profile=Math.abs(orientation)*2,indices=[3,2,1],lower=Math.floor(profile),mix=profile-lower,views=[[indices[lower],1-mix],[indices[lower+1],mix]];
  let nx=0,ny=0;for(const [index,weight]of views){const nose=headMeta.registration.features[index].nose,anchor=headMeta.registration.anchors[index];nx+=(nose[0]-anchor[0])*104*weight*(index===3?1:Math.sign(orientation));ny+=(nose[1]-anchor[1])*92*weight;}
  nx+=128+52*orientation;ny+=119;r.draw({legs:[],body:{},orientation,facing:1,headAngle:0,tailAngle:0,clip:'idle',expressionWeight:0},0);
  const pixels=canvas.getContext('2d').getImageData(0,0,256,256).data;let darkest=255;for(let y=Math.round(ny)-2;y<=Math.round(ny)+2;y++)for(let x=Math.round(nx)-2;x<=Math.round(nx)+2;x++){const i=(y*256+x)*4;if(pixels[i+3]>230)darkest=Math.min(darkest,(pixels[i]+pixels[i+1]+pixels[i+2])/3);}
  out.push({orientation,nx,ny,darkest});
 }
 const probe=document.createElement('canvas');probe.width=512;probe.height=256;const ctx=probe.getContext('2d');ctx.fillStyle='#16191f';ctx.fillRect(0,0,512,256);
 r.draw({legs:[],body:{},orientation:.25,facing:1,headAngle:0,tailAngle:0,clip:'idle',expressionWeight:0},0);ctx.drawImage(canvas,0,0);
 const aligned=document.createElement('canvas');aligned.width=aligned.height=256;const ink=aligned.getContext('2d');ink.globalCompositeOperation='lighter';
 const views=[[3,.5],[2,.5]],target={x:0,y:0};for(const [index,weight]of views){const anchor=headMeta.registration.anchors[index],nose=headMeta.registration.features[index].nose;target.x+=(nose[0]-anchor[0])*104*weight;target.y+=(nose[1]-anchor[1])*92*weight;}
 for(const [index,weight]of views){const anchor=headMeta.registration.anchors[index],nose=headMeta.registration.features[index].nose;ink.globalAlpha=weight;ink.drawImage(headImage,...headMeta.parts[index],141+target.x-nose[0]*104,119+target.y-nose[1]*92,104,92);}
 ctx.drawImage(aligned,256,0);return {samples:out,probe:probe.toDataURL()};});await writeFile('.superpowers/sdd/evidence/natural-head-translation-probe.png',Buffer.from(samples.probe.split(',')[1],'base64'));await writeFile('.superpowers/sdd/evidence/natural-head-nose-registration.json',JSON.stringify(samples.samples,null,2));for(const sample of samples.samples)expect(sample.darkest,JSON.stringify(sample)).toBeLessThan(110);
});

test('production facial mesh aligns both eyes through real turns with finite bounded geometry',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{
 const{createRigRenderer}=await import('/src/rendering/rig-renderer.js'),{createRigController}=await import('/src/core/rig-motion.js');const load=async src=>{const i=new Image();i.src=src;await i.decode();return i;};const rigImage=await load('/pets/dog-rig.png'),rigMeta=await(await fetch('/pets/dog-rig.json')).json(),headImage=await load('/pets/dog-head-rig-v2.png'),headMeta=await(await fetch('/pets/dog-head-rig-v2.json')).json(),limbImage=await load('/pets/quadruped-legs-v2.png'),limbMeta=await(await fetch('/pets/quadruped-legs-v2.json')).json();
 const canvas=document.createElement('canvas'),renderer=createRigRenderer(canvas,{species:'dog',rigImage,rigMeta,headImage,headMeta,limbImage,limbMeta}),sheet=document.createElement('canvas');sheet.width=2048;sheet.height=1024;const ctx=sheet.getContext('2d');const times=[0,112,224,336,448,560,672,800];
 for(const [row,facing]of [1,-1].entries()){
  const controller=createRigController({species:'dog',random:()=>0}),locomotion={epoch:1,distanceDip:0,spriteSizeDip:256,facing,moving:false};let pose=controller.sample({locomotion},0);locomotion.facing=-facing;let now=0;
  for(const [column,time]of times.entries()){for(;now<=time;now+=8)pose=controller.sample({locomotion},now);renderer.draw(pose,time);for(const [background,color]of ['#16191f','#ffffff'].entries()){ctx.fillStyle=color;ctx.fillRect(column*256,(row+background*2)*256,256,256);ctx.drawImage(canvas,column*256,(row+background*2)*256);}}
 }
 const blank=document.createElement('canvas');blank.width=blank.height=128;const isolatedMeta={...headMeta,parts:headMeta.parts.map((part,index)=>index===0?[0,0,1,1]:part)},headCanvas=document.createElement('canvas'),headRenderer=createRigRenderer(headCanvas,{species:'dog',rigImage:blank,rigMeta,headImage,headMeta:isolatedMeta});
 const prototype=CanvasRenderingContext2D.prototype,originals={transform:prototype.transform,moveTo:prototype.moveTo,lineTo:prototype.lineTo},matrices=[],points=[];prototype.transform=function(...m){matrices.push(m);originals.transform.apply(this,m);};for(const method of ['moveTo','lineTo'])prototype[method]=function(x,y){points.push([x,y]);originals[method].call(this,x,y);};const eyes=[];
 for(const orientation of [.25,.375,.625,.75,-.25,-.375,-.625,-.75]){
  headRenderer.draw({legs:[],body:{},orientation,facing:1,headAngle:0,tailAngle:0,clip:'idle',expressionWeight:0},0);const bytes=headCanvas.getContext('2d').getImageData(0,0,256,256).data,profile=Math.abs(orientation)*2,indices=[3,2,1],lower=Math.floor(profile),mix=profile-lower;
  for(let eye=0;eye<2;eye++){let x=128+52*orientation,y=119;for(const [index,weight]of [[indices[lower],1-mix],[indices[lower+1],mix]]){const mirror=index===3?1:Math.sign(orientation),point=headMeta.registration.features[index].eyes[mirror<0?1-eye:eye],anchor=headMeta.registration.anchors[index];x+=(point[0]-anchor[0])*104*mirror*weight;y+=(point[1]-anchor[1])*92*weight;}let darkest=255;for(let py=Math.round(y)-3;py<=Math.round(y)+3;py++)for(let px=Math.round(x)-3;px<=Math.round(x)+3;px++){const i=(py*256+px)*4;if(bytes[i+3]>220)darkest=Math.min(darkest,(bytes[i]+bytes[i+1]+bytes[i+2])/3);}eyes.push({orientation,eye,x,y,darkest});}
 }
 Object.assign(prototype,originals);return {sheet:sheet.toDataURL(),eyes,triangles:matrices.length,finite:matrices.every(m=>m.every(Number.isFinite)),bounded:points.every(p=>p.every(v=>Number.isFinite(v)&&Math.abs(v)<512))};
 });await writeFile('.superpowers/sdd/evidence/natural-head-turn-white-dark.png',Buffer.from(result.sheet.split(',')[1],'base64'));await writeFile('.superpowers/sdd/evidence/natural-head-facial-audit.json',JSON.stringify({...result,sheet:undefined},null,2));expect(result.triangles).toBe(3840);expect(result.finite).toBeTruthy();expect(result.bounded).toBeTruthy();for(const eye of result.eyes)expect(eye.darkest,JSON.stringify(eye)).toBeLessThan(130);
});

test('actual facial views retain consistent triangle orientation through mixed turns and expressions',async({page})=>{
 await page.goto('/');const audit=await page.evaluate(async()=>{
 const{createRigRenderer}=await import('/src/rendering/rig-renderer.js');const image=new Image();image.src='/pets/dog-head-rig-v2.png';await image.decode();const meta=await(await fetch('/pets/dog-head-rig-v2.json')).json(),blank=document.createElement('canvas');blank.width=blank.height=128;const canvas=document.createElement('canvas'),r=createRigRenderer(canvas,{species:'dog',rigImage:blank,rigMeta:{parts:Array(6).fill([0,0,128,128])},headImage:image,headMeta:{...meta,parts:meta.parts.map((part,i)=>i===0?[0,0,1,1]:part)}}),prototype=CanvasRenderingContext2D.prototype,original=prototype.transform,originalDraw=prototype.drawImage,originalMove=prototype.moveTo,originalLine=prototype.lineTo,matrices=[],areas=[],profiles=[];let capture=false,path=[];prototype.moveTo=function(x,y){path=[[x,y]];originalMove.call(this,x,y);};prototype.lineTo=function(x,y){path.push([x,y]);originalLine.call(this,x,y);};prototype.drawImage=function(image,...args){if(capture&&this.globalCompositeOperation==='lighter'&&image instanceof HTMLCanvasElement&&image.width===256&&image.height===256&&this.globalAlpha>0&&this.globalAlpha<1)profiles.push(image.toDataURL());originalDraw.call(this,image,...args);};prototype.transform=function(...m){matrices.push(m);const [a,b,c]=path;areas.push(a&&b&&c?(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]):NaN);original.apply(this,m);};const out=[];
 for(const orientation of [-1,-.875,-.625,-.375,-.25,-.125,0,.125,.25,.375,.625,.875,1])for(const clip of ['idle','pet','feed'])for(const expressionWeight of clip==='idle'?[0]:[.5,1]){
  capture=orientation===.25&&clip==='idle';matrices.length=0;areas.length=0;r.draw({legs:[],body:{},orientation,facing:1,headAngle:.15,tailAngle:0,clip,expressionWeight},0);let folds=0;const signs=[];
  for(let start=0;start<matrices.length;start+=240){const determinants=matrices.slice(start,start+240).map(([a,b,c,d])=>a*d-b*c),reference=determinants.find(value=>Math.abs(value)>1e-10);const sign=Math.sign(reference);signs.push(sign);if(determinants.some(value=>value*sign<-1e-10))signs.push(determinants.map((value,i)=>value*sign<-1e-10?i:null).filter(i=>i!==null));folds+=determinants.filter(value=>value*sign<-1e-10).length;}
  out.push({orientation,clip,expressionWeight,triangles:matrices.length,signs,folds,destinationPositive:areas.every(area=>area>0),finite:matrices.every(matrix=>matrix.every(Number.isFinite))});
 }prototype.transform=original;prototype.drawImage=originalDraw;prototype.moveTo=originalMove;prototype.lineTo=originalLine;return {audit:out,profiles};});for(const [index,profile]of audit.profiles.entries())await writeFile(`.superpowers/sdd/evidence/natural-head-warped-profile-${index}.png`,Buffer.from(profile.split(',')[1],'base64'));await writeFile('.superpowers/sdd/evidence/natural-head-fold-audit.json',JSON.stringify(audit.audit,null,2));for(const sample of audit.audit){expect(sample.triangles).toBeGreaterThanOrEqual(240);expect(sample.triangles%240).toBe(0);expect(sample.finite).toBeTruthy();expect(sample.destinationPositive,JSON.stringify(sample)).toBeTruthy();expect(sample.folds,JSON.stringify(sample)).toBe(0);}
});
