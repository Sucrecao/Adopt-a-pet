import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

async function production(page,species,kind) {
 await page.goto('/');
 return page.evaluate(async({species,kind})=>{
  const [{createWholeRenderer},{createWholeAnimationController}]=await Promise.all([
   import('/src/rendering/whole-renderer.js'),import('/src/core/whole-animation.js')]);
  const meta=await(await fetch(`/pets/${species}-whole-v5.json`,{cache:'no-store'})).json();
  const images=await Promise.all(meta.pages.map(async p=>{const im=new Image();im.src=`/${p.asset.replace(/^\//,'')}`;await im.decode();return im;}));
  const bytes=new Uint8Array(await(await fetch(`/${meta.flow.asset.replace(/^\//,'')}`,{cache:'no-store'})).arrayBuffer());
  const digest=await crypto.subtle.digest('SHA-256',bytes),sha256=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  const canvas=document.createElement('canvas'),renderer=createWholeRenderer(canvas,{images,meta,flowBytes:bytes});
  const paint=sample=>{renderer.draw(sample);return canvas.toDataURL();};
  if(kind==='guards') {
   const records=[];
   for(const pair of meta.flow.sourcePairs??[])for(const facing of [1,-1]){
    const[frame,nextFrame]=pair,first=paint({frame,nextFrame,mix:0,facing}),last=paint({frame,nextFrame,mix:1,facing});
    const phases=[.25,.5,.75].map(mix=>{const png=paint({frame,nextFrame,mix,facing});return{mix,complete:png===first||png===last,reverse:paint({frame:nextFrame,nextFrame:frame,mix:1-mix,facing})===png};});
    records.push({pair,facing,phases});
   }
   renderer.dispose();return{species,sha256,records,guardCount:meta.flow.sourcePairs?.length??0};
  }
  const config=meta.groundGait,colors=[[255,16,16],[16,255,16],[16,16,255],[255,16,255]];
  const markedImages=images.map(im=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);return c;});
  const sourceFrame=meta.frames[config.sourceFrame],pageDescriptor=meta.pages[sourceFrame.page],[rx,ry,rw,rh]=sourceFrame.rect;
  const scale=256/Math.max(pageDescriptor.sourceSize[0]/pageDescriptor.columns,pageDescriptor.sourceSize[1]/pageDescriptor.rows)*(pageDescriptor.scale??1);
  const dx=(256-rw*scale)/2+(sourceFrame.offsetX??0),dy=(256-rh*scale)/2+(sourceFrame.offsetY??0),markerInk=markedImages[sourceFrame.page].getContext('2d');
  config.paws.forEach((paw,i)=>{const x=paw.center[0],y=paw.sole[1]-5;markerInk.fillStyle=`rgb(${colors[i].join(',')})`;markerInk.beginPath();markerInk.arc(rx+(x-dx)/scale,ry+(y-dy)/scale,2.5/scale,0,Math.PI*2);markerInk.fill();});
  const marked=document.createElement('canvas'),markerRenderer=createWholeRenderer(marked,{images:markedImages,meta,flowBytes:bytes});
  function markers(){const data=marked.getContext('2d').getImageData(0,0,256,256).data,marks=colors.map(()=>({x:0,y:0,mass:0,count:0}));
   for(let y=170;y<242;y++)for(let x=20;x<215;x++){const at=(y*256+x)*4;if(data[at+3]<100)continue;
    colors.forEach((color,i)=>{if(color.every((v,c)=>v>100?data[at+c]>190:data[at+c]<80)){const w=data[at+3]/255;marks[i].x+=(x+.5)*w;marks[i].y+=(y+.5)*w;marks[i].mass+=w;marks[i].count++;}});}
   return marks.map(m=>({x:m.x/m.mass,y:m.y/m.mass,count:m.count}));
  }
  const controller=createWholeAnimationController({species,meta,random:()=>1});
  let now=0,distance=0,action='idle',token=0,intent=false,moving=false,paused=false,epoch=1;
  const snapshots=[],selected=[];
  function take(label,select=false){
   const sample=controller.sample({action,actionStartedAt:token,actionElapsed:0,paused,locomotion:{epoch,distanceDip:distance,spriteSizeDip:256,facing:1,intentMoving:intent,moving}},now);
   const png=paint(sample);markerRenderer.draw(sample);
   const row={label,now,distance,sample:{...sample},marks:markers(),png};snapshots.push(row);if(select)selected.push(row);return row;
  }
  const start=take('source',true);now=100;intent=true;take('begin enter');now=164;
  const entering=take('partial enter',true);action='feed';token=1;intent=false;
  const enterCancel=take('cancel enter',true);now+=16;const enterCancelNext=take('cancel enter next RAF',true);
  now+=64;const settling=take('partial settle',true);paused=true;
  const pause=take('pause settle');now=5000;const held=take('held settle');paused=false;
  const resumed=take('resume settle');epoch++;
  const rebased=take('same-time native epoch rebase');action='pet';token=2;
  const settleCancel=take('replace partial settle');now+=16;const settleCancelNext=take('replace settle next RAF',true);
  for(let i=0;i<50;i++){now+=16;take('finish pet route');}
  action='play';token=3;intent=true;moving=false;
  const resumeWalk=take('care to walk',true);const preparation=[];
  let ready;
  for(let i=0;i<80;i++){now+=16;const row=take('prepare walk');preparation.push(row);if(row.sample.clip==='walk'&&!row.sample.transition&&row.sample.ground?.mode==='walk'){ready=row;selected.push({...row,label:'prepared walk'});break;}}
  const walking=[];
  if(ready)for(let i=0;i<32;i++){now+=16;distance+=1;moving=true;const row=take('accepted root travel');walking.push(row);if(i%8===0)selected.push({...row,label:`walk root+${distance}`});}
  const beforeCare=snapshots.at(-1);action='feed';token=4;intent=false;moving=false;
  const walkingCancel=take('ground to feed',true);now+=16;const walkingCancelNext=take('ground to feed next RAF',true);
  for(let i=0;i<50;i++){now+=16;take('finish feed route');}
  const atFeed=snapshots.at(-1);selected.push({...atFeed,label:'feeding'});
  const jump=(a,b)=>Math.max(...a.marks.map((m,i)=>Math.hypot(m.x-b.marks[i].x,m.y-b.marks[i].y)));
  const supportDrift=[];
  for(const[paw,offset]of config.paws.map(p=>p.phase).entries())for(const cycle of [0,1,2]){
   const values=walking.filter(r=>Math.floor(r.sample.phase+offset)===cycle&&(r.sample.phase+offset)%1<config.support).map(r=>r.distance+r.marks[paw].x);
   if(values.length>=2)supportDrift.push({paw,cycle,range:Math.max(...values)-Math.min(...values)});
  }
  const sheet=document.createElement('canvas');sheet.width=4*256;sheet.height=Math.ceil(selected.length/4)*280;const ink=sheet.getContext('2d');
  for(const[i,row]of selected.entries()){const im=new Image();im.src=row.png;await im.decode();const x=i%4*256,y=Math.floor(i/4)*280;ink.fillStyle=i%2?'#18222b':'#f1ede5';ink.fillRect(x,y,256,256);ink.drawImage(im,x,y);ink.fillStyle='#f1ede5';ink.fillRect(x,y+256,256,24);ink.fillStyle='#17222b';ink.font='12px sans-serif';ink.fillText(`${row.label} t${row.now}`,x+3,y+273);}
  const png=sheet.toDataURL();renderer.dispose();markerRenderer.dispose();
  const simplify=row=>({label:row.label,now:row.now,distance:row.distance,sample:row.sample,marks:row.marks});
  return{species,sha256,groundBackend:canvas.dataset.groundRenderer,entering: simplify(entering),enterCancelExact:entering.png===enterCancel.png,enterCancelNextPixelJump:jump(entering,enterCancelNext),pauseExact:settling.png===pause.png&&pause.png===held.png&&held.png===resumed.png,resumeEpochExact:resumed.png===rebased.png,settleCancelExact:rebased.png===settleCancel.png,settleCancelNextPixelJump:jump(settleCancel,settleCancelNext),careToWalkExact:resumeWalk.png===snapshots[snapshots.indexOf(resumeWalk)-1].png,preparationPhaseHeld:preparation.every(r=>r.sample.phase===resumeWalk.sample.phase),ready:ready?simplify(ready):null,walkingCancelExact:beforeCare.png===walkingCancel.png,walkingCancelNextPixelJump:jump(walkingCancel,walkingCancelNext),supportDrift,finalFeed:simplify(atFeed),sourceMarks:start.marks,records:snapshots.map(simplify),contactSheet:png};
 },{species,kind});
}

for(const species of ['cat','dog','parrot'])test(`${species} all declared source guards paint intact reversible endpoint pixels`,async({page})=>{
 const result=await production(page,species,'guards');
 await writeFile(`.artifacts/contact-v5-qa-final-guards-${species}.json`,JSON.stringify(result,null,2)+'\n');
 expect(result.guardCount).toBe({cat:4,dog:11,parrot:9}[species]);
 expect(result.records.every(r=>r.phases.every(p=>p.complete&&p.reverse))).toBe(true);
});

for(const species of ['cat','dog'])test(`${species} actual plush enter/cancel/pause/care routes preserve visible toe pixels`,async({page})=>{
 const result=await production(page,species,'dynamic');
 await writeFile(`.artifacts/contact-v5-qa-dynamic-${species}.png`,Buffer.from(result.contactSheet.split(',')[1],'base64'));
 const{contactSheet,...report}=result;await writeFile(`.artifacts/contact-v5-qa-dynamic-${species}.json`,JSON.stringify(report,null,2)+'\n');
 expect(result.groundBackend).toBe('whole-ground-webgl');
 expect(result.entering.sample.ground.mode).toBe('enter');
 expect(result.sourceMarks[0].y-result.entering.marks[0].y).toBeGreaterThan(3);
 expect(result.enterCancelExact).toBe(true);expect(result.enterCancelNextPixelJump).toBeLessThan(2.5);
 expect(result.pauseExact).toBe(true);expect(result.resumeEpochExact).toBe(true);
 expect(result.settleCancelExact).toBe(true);expect(result.settleCancelNextPixelJump).toBeLessThan(2.5);
 expect(result.careToWalkExact).toBe(true);expect(result.preparationPhaseHeld).toBe(true);
 expect(result.ready).not.toBeNull();expect(result.ready.sample.ground.mode).toBe('walk');
 expect(result.walkingCancelExact).toBe(true);expect(result.walkingCancelNextPixelJump).toBeLessThan(2.5);
 expect(result.supportDrift.length).toBeGreaterThan(3);
 expect(Math.max(...result.supportDrift.map(d=>d.range))).toBeLessThan(1.5);
 expect(result.finalFeed.sample.clip).toBe('feed');
 expect(result.records.every(r=>!r.sample.handoffUnsupported)).toBe(true);
});
