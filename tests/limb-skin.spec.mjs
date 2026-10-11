import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('connected limb atlas reaches the sole and preserves toe artwork through bends and turns', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createRigRenderer } = await import('/src/rendering/rig-renderer.js');
    const blank = document.createElement('canvas'); blank.width=blank.height=128;
    const artwork = document.createElement('canvas'); artwork.width=64; artwork.height=128;
    const ink=artwork.getContext('2d'); ink.fillStyle='#00cc44'; ink.fillRect(20,0,24,128);
    ink.fillStyle='#ff2244'; ink.fillRect(44,112,16,16);
    const canvas=document.createElement('canvas');
    const renderer=createRigRenderer(canvas,{species:'dog',rigImage:blank,rigMeta:{parts:Array(6).fill([0,0,128,128])},limbImage:artwork,
      limbMeta:{parts:[{rect:[0,0,64,128],joints:[[.5,0],[.5,.4],[.5,.8],[.5,1]]}],species:{dog:{fore:0,hind:0}}}});
    const frames=[];
    for(const orientation of [1,.01,0,-.01,-1]) {
      const leg={kind:'fore',side:'near',hip:{x:100,y:110},knee:{x:115,y:150},ankle:{x:100,y:185},foot:{x:100,y:205},orientation};
      renderer.draw({legs:[leg],orientation,tailAngle:0,clip:'idle',body:{}},frames.length);
      const bytes=canvas.getContext('2d').getImageData(0,0,256,256).data;
      const alpha=(x,y)=>bytes[(y*256+x)*4+3];
      let toe=0;for(let y=196;y<205;y++)for(let x=75;x<125;x++){const i=(y*256+x)*4;if(bytes[i]>100&&bytes[i+1]<100&&bytes[i+3]>100)toe++;}
      frames.push({sole:alpha(100,202),knee:alpha(115,150),ankle:alpha(100,185),toe,bytes:Array.from(bytes)});
    }
    let delta=0;for(let i=0;i<frames[1].bytes.length;i++)delta+=Math.abs(frames[1].bytes[i]-frames[3].bytes[i]);
    return {frames:frames.map(({bytes,...frame})=>frame),delta:delta/(256*256*4)};
  });
  for(const frame of result.frames){expect(frame.sole).toBeGreaterThan(220);expect(frame.knee).toBeGreaterThan(220);expect(frame.ankle).toBeGreaterThan(220);expect(frame.toe).toBeGreaterThan(8);}
  expect(result.delta).toBeLessThan(.2);
});

test('production full skins retain opaque ground contacts through gait and care', async ({ page }, testInfo) => {
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');
    const {createRigController}=await import('/src/core/rig-motion.js');
    const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
    const limbImage=await load('/pets/quadruped-legs-v2.png'),limbMeta=await(await fetch('/pets/quadruped-legs-v2.json')).json();
    const sheet=document.createElement('canvas');sheet.width=256*8;sheet.height=256*2;const sheetContext=sheet.getContext('2d');
    const samples=[];
    const detail=document.createElement('canvas');detail.width=detail.height=1024;const detailContext=detail.getContext('2d');
    for(const [row,species] of ['dog','cat'].entries()){
      const rigImage=await load(`/pets/${species}-rig.png`),rigMeta=await(await fetch(`/pets/${species}-rig.json`)).json();
      const headImage=await load(`/pets/${species}-head-rig${species==='dog'?'-v2':''}.png`),headMeta=await(await fetch(`/pets/${species}-head-rig${species==='dog'?'-v2':''}.json`)).json();
      const canvas=document.createElement('canvas');
      const transforms=[],clipPoints=[];
      const prototype=CanvasRenderingContext2D.prototype;
      const originals={transform:prototype.transform,moveTo:prototype.moveTo,lineTo:prototype.lineTo};
      for(const method of ['moveTo','lineTo'])prototype[method]=function(x,y){clipPoints.push([x,y]);originals[method].call(this,x,y);};
      prototype.transform=function(...matrix){transforms.push(matrix);originals.transform.apply(this,matrix);};
      const renderer=createRigRenderer(canvas,{species,rigImage,rigMeta,headImage,headMeta,limbImage,limbMeta});
      const scenarios=[['idle',1,0],['walk',1,20],['walk',1,60],['walk',-1,20],['walk',-1,60],['groom',1,600],['stretch',1,1000],['trick',1,500]];
      for(const [column,[action,facing,value]] of scenarios.entries()){
        const controller=createRigController({species,random:()=>0});
        const locomotion={epoch:1,distanceDip:0,spriteSizeDip:256,facing,moving:action==='walk'};
        controller.sample({action:action==='walk'?'idle':action,actionElapsed:0,locomotion},0);
        if(action==='walk')locomotion.distanceDip=value;
        const pose=controller.sample({action:action==='walk'?'idle':action,actionElapsed:action==='walk'?0:value,locomotion},400);
        transforms.length=0;clipPoints.length=0;renderer.draw(pose,400);sheetContext.drawImage(canvas,column*256,row*256);
        if(column===0||column===5)detailContext.drawImage(canvas,(column===0?0:512),row*512,512,512);
        const bytes=canvas.getContext('2d').getImageData(0,0,256,256).data;
        const determinants=transforms.map(([a,b,c,d])=>a*d-b*c);
        const mixedStripCount=determinants.filter((value,i)=>i%2===0&&value*determinants[i+1]<-1e-12).length;
        samples.push({species,action,triangleCount:transforms.length,mixedStripCount,finite:transforms.every(matrix=>matrix.every(Number.isFinite)),maxCoefficient:Math.max(...transforms.flatMap(matrix=>matrix.slice(0,4).map(Math.abs))),bounded:clipPoints.every(point=>point.every(value=>Number.isFinite(value)&&Math.abs(value)<512)),winding:Math.min(...transforms.map(([a,b,c,d])=>a*d-b*c)),contacts:pose.legs.filter(leg=>leg.planted).map(leg=>bytes[(Math.round(leg.foot.y-3)*256+Math.round(leg.foot.x))*4+3])});
      }
      Object.assign(prototype,originals);
    }
    return {samples,sheet:sheet.toDataURL(),detail:detail.toDataURL()};
  });
  await mkdir('.superpowers/sdd/evidence',{recursive:true});
  await writeFile('.superpowers/sdd/evidence/natural-leg-gait-care.png',Buffer.from(result.sheet.split(',')[1],'base64'));
  await writeFile('.superpowers/sdd/evidence/natural-leg-standing-groom-detail.png',Buffer.from(result.detail.split(',')[1],'base64'));
  await testInfo.attach('natural-leg-gait-care.png',{body:Buffer.from(result.sheet.split(',')[1],'base64'),contentType:'image/png'});
  await writeFile('.superpowers/sdd/evidence/natural-leg-render-audit.json',JSON.stringify(result.samples,null,2));
  for(const sample of result.samples){
    expect(sample.finite).toBeTruthy();expect(sample.bounded).toBeTruthy();
    expect(sample.triangleCount).toBeGreaterThan(50);
    if(sample.action!=='groom')expect(sample.mixedStripCount).toBe(0);
    for(const alpha of sample.contacts)expect(alpha,`${sample.species} ${sample.action} contact`).toBeGreaterThan(200);
  }
  await writeFile('.superpowers/sdd/evidence/natural-leg-render-audit.json',JSON.stringify(result.samples,null,2));
});

test('groom skin stays continuous across lift, return and an unfinished turn',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');const {createRigController}=await import('/src/core/rig-motion.js');
  const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
  const limbImage=await load('/pets/quadruped-legs-v2.png'),limbMeta=await(await fetch('/pets/quadruped-legs-v2.json')).json();
  const audit=[];const evidence=document.createElement('canvas');evidence.width=evidence.height=1024;const evidenceContext=evidence.getContext('2d');
  for(const [row,species]of ['dog','cat'].entries()){
   const rigImage=await load(`/pets/${species}-rig.png`),rigMeta=await(await fetch(`/pets/${species}-rig.json`)).json();const headImage=await load(`/pets/${species}-head-rig${species==='dog'?'-v2':''}.png`),headMeta=await(await fetch(`/pets/${species}-head-rig${species==='dog'?'-v2':''}.json`)).json();
   for(const [column,facing]of [1,-1].entries()){
    const canvas=document.createElement('canvas'),renderer=createRigRenderer(canvas,{species,rigImage,rigMeta,headImage,headMeta,limbImage,limbMeta}),controller=createRigController({species,random:()=>0});
    const locomotion={epoch:1,distanceDip:0,spriteSizeDip:256,facing,moving:false};
    let previous,maxDelta=0,at=0;
    for(let elapsed=0;elapsed<=1800;elapsed+=8){
     renderer.draw(controller.sample({action:'groom',actionStartedAt:1,actionElapsed:elapsed,locomotion},elapsed),elapsed);
     const bytes=canvas.getContext('2d').getImageData(0,0,256,256).data;
     if(previous){let delta=0;for(let i=0;i<bytes.length;i++)delta+=Math.abs(bytes[i]-previous[i]);delta/=bytes.length;if(delta>maxDelta){maxDelta=delta;at=elapsed;}}
     previous=bytes;
    }
    audit.push({species,facing,scenario:'groom',maxDelta,at});
    const frozen=createRigController({species,random:()=>0});locomotion.facing=facing;frozen.sample({locomotion},0);locomotion.facing=-facing;for(let now=8;now<=592;now+=8)frozen.sample({locomotion},now);
    previous=undefined;maxDelta=0;at=0;
    for(let elapsed=0;elapsed<=192;elapsed+=8){
     renderer.draw(frozen.sample({action:'groom',actionStartedAt:1,actionElapsed:elapsed,locomotion},592+elapsed),592+elapsed);
     const bytes=canvas.getContext('2d').getImageData(0,0,256,256).data;
     if(previous){let delta=0;for(let i=0;i<bytes.length;i++)delta+=Math.abs(bytes[i]-previous[i]);delta/=bytes.length;if(delta>maxDelta){maxDelta=delta;at=elapsed;}}
     previous=bytes;
    }
    evidenceContext.drawImage(canvas,column*512,row*512,512,512);audit.push({species,facing,scenario:'frozen-turn-groom',maxDelta,at});
   }
  }
  const composites={};for(const [name,color]of [['dark','#24242c'],['white','#ffffff'],['stage','#eee8fa']]){const composite=document.createElement('canvas');composite.width=composite.height=1024;const ctx=composite.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,1024,1024);ctx.drawImage(evidence,0,0);composites[name]=composite.toDataURL();}
  return {audit,evidence:evidence.toDataURL(),composites};
 });
 await mkdir('.superpowers/sdd/evidence',{recursive:true});await writeFile('.superpowers/sdd/evidence/natural-leg-groom-continuity.json',JSON.stringify(result.audit,null,2));
 await writeFile('.superpowers/sdd/evidence/natural-leg-frozen-turn-groom.png',Buffer.from(result.evidence.split(',')[1],'base64'));
 for(const [name,data]of Object.entries(result.composites))await writeFile(`.superpowers/sdd/evidence/natural-leg-frozen-turn-groom-${name}.png`,Buffer.from(data.split(',')[1],'base64'));
 for(const sample of result.audit)expect(sample.maxDelta,JSON.stringify(sample)).toBeLessThan(3);
});

test('turning fore paw profiles share their solved sole throughout full-width mirror blending',async({page})=>{
 await page.goto('/');const contacts=await page.evaluate(async()=>{
 const{createRigRenderer}=await import('/src/rendering/rig-renderer.js'),{createRigController}=await import('/src/core/rig-motion.js');const load=async p=>{const i=new Image();i.src=p;await i.decode();return i;};const out=[];
 for(const species of ['dog','cat'])for(const facing of [1,-1]){const rigImage=await load(`/pets/${species}-rig.png`),rigMeta=await(await fetch(`/pets/${species}-rig.json`)).json(),limbImage=await load('/pets/quadruped-legs-v2.png'),limbMeta=await(await fetch('/pets/quadruped-legs-v2.json')).json();const canvas=document.createElement('canvas'),r=createRigRenderer(canvas,{species,rigImage,rigMeta,limbImage,limbMeta}),c=createRigController({species}),l={epoch:1,distanceDip:0,spriteSizeDip:256,facing,moving:false};c.sample({locomotion:l},0);l.facing=-facing;
 for(let t=8;t<=800;t+=8){const p=c.sample({locomotion:l},t);r.draw(p,t);const b=canvas.getContext('2d').getImageData(0,0,256,256).data;for(const leg of p.legs.filter(x=>x.kind==='fore'&&Math.abs(x.orientation)<.12))out.push({species,facing,t,id:leg.id,alpha:b[(Math.round(leg.foot.y-3)*256+Math.round(leg.foot.x))*4+3]});}}
 return out;});
 await writeFile('.superpowers/sdd/evidence/natural-leg-turn-contacts.json',JSON.stringify(contacts,null,2));
 expect(new Set(contacts.map(contact=>`${contact.species}:${contact.facing}:${contact.id}`)).size).toBe(8);
 expect(contacts.length).toBeGreaterThan(16);for(const contact of contacts)expect(contact.alpha,JSON.stringify(contact)).toBeGreaterThan(200);
});

test('frozen-turn hind skin bends smoothly through knee and hock without strip shear jumps',async({page})=>{
 await page.goto('/');const samples=await page.evaluate(async()=>{
 const{createLimbSkin}=await import('/src/rendering/limb-skin.js'),{createRigController}=await import('/src/core/rig-motion.js');const image=new Image();image.src='/pets/quadruped-legs-v2.png';await image.decode();const meta=await(await fetch('/pets/quadruped-legs-v2.json')).json(),out=[];
 for(const species of ['dog','cat'])for(const facing of [1,-1]){
  const controller=createRigController({species}),locomotion={epoch:1,distanceDip:0,spriteSizeDip:256,facing,moving:false};controller.sample({locomotion},0);locomotion.facing=-facing;for(let now=8;now<=592;now+=8)controller.sample({locomotion},now);let pose;for(let elapsed=0;elapsed<=192;elapsed+=8)pose=controller.sample({action:'groom',actionStartedAt:1,actionElapsed:elapsed,locomotion},592+elapsed);
  const skin=createLimbSkin(document,image,meta,species),original=CanvasRenderingContext2D.prototype.transform,matrices=[];CanvasRenderingContext2D.prototype.transform=function(...matrix){matrices.push(matrix);original.apply(this,matrix);};
  for(const leg of pose.legs.filter(leg=>leg.kind==='hind')){
   matrices.length=0;const canvas=document.createElement('canvas');canvas.width=canvas.height=256;skin.draw(canvas.getContext('2d'),leg);
   const profiles=[];for(let i=0;i<matrices.length;i+=2){const matrix=matrices[i],sign=Math.sign(matrix[0]);if(!profiles.length||profiles.at(-1).sign!==sign)profiles.push({sign,strips:[]});profiles.at(-1).strips.push(matrix);}
   let maxShearJump=0;for(const profile of profiles){const strips=profile.strips;for(let i=2;i<strips.length-1;i++)maxShearJump=Math.max(maxShearJump,Math.abs(strips[i][2]-strips[i-1][2]));}
   out.push({species,facing,id:leg.id,profiles:profiles.length,maxShearJump});
  }
  CanvasRenderingContext2D.prototype.transform=original;
 }return out;});
 await writeFile('.superpowers/sdd/evidence/natural-leg-hind-shear.json',JSON.stringify(samples,null,2));expect(samples.length).toBe(8);for(const sample of samples)expect(sample.maxShearJump,JSON.stringify(sample)).toBeLessThan(.1);
});
