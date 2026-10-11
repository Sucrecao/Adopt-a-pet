import test from 'node:test';
import assert from 'node:assert/strict';
import {createRigController} from '../src/core/rig-motion.js';

const locomotion=facing=>({facing,moving:false,epoch:1,distanceDip:0,spriteSizeDip:256});
const controller=()=>createRigController({species:'dog',random:()=>0});
function walkToPhase(c,l,phase){
 c.sample({locomotion:l},0);l.moving=true;
 const distance=128+phase*64;let now=0,previous;
 while(l.distanceDip<distance){const travel=Math.min(.25,distance-l.distanceDip);l.distanceDip+=travel;now+=travel/.05;previous=c.sample({locomotion:l},now);}
 return {now,previous};
}
function expectedRoot(pose,leg){
 const root=leg.kind==='fore'?pose.geometry.foreHip:pose.geometry.hindHip;
 const depth=leg.kind==='fore'?16:12,side=leg.side==='near'?-1:1;
 const x=pose.orientation*(root.x+(leg.side==='far'?4:0)-128)+side*depth*(1-pose.orientation**2),y=root.y-140;
 return {x:128+x*Math.cos(pose.body.angle)-y*Math.sin(pose.body.angle)+pose.body.x,
  y:140+x*Math.sin(pose.body.angle)+y*Math.cos(pose.body.angle)+pose.body.y};
}
function assertSkeleton(pose){
 for(const leg of pose.legs){
  const root=expectedRoot(pose,leg);
  assert.ok(Math.hypot(root.x-leg.hip.x,root.y-leg.hip.y)<1e-8,`${pose.clip} ${leg.id} root detached from torso`);
  assert.ok(Math.hypot(leg.ankle.x-leg.hip.x,leg.ankle.y-leg.hip.y)<=leg.upperLength+leg.lowerLength+1e-5,`${pose.clip} ${leg.id} ankle exceeds bone reach`);
  assert.ok(Math.abs(Math.hypot(leg.knee.x-leg.hip.x,leg.knee.y-leg.hip.y)-leg.upperLength)<1e-5,`${pose.clip} ${leg.id} upper bone compressed`);
  assert.ok(Math.abs(Math.hypot(leg.ankle.x-leg.knee.x,leg.ankle.y-leg.knee.y)-leg.lowerLength)<1e-5,`${pose.clip} ${leg.id} lower bone compressed`);
 }
}
function assertContinuous(previous,pose){
 for(const [i,leg]of pose.legs.entries())assert.ok(Math.hypot(leg.foot.x-previous.legs[i].foot.x,leg.foot.y-previous.legs[i].foot.y)<9,`${leg.id} sole jumped at ${pose.sampleTime}ms`);
}

test('dog neutral ankles are below their shoulder and haunch with a separate far stance',()=>{
 for(const facing of[1,-1]){
  const p=controller().sample({locomotion:locomotion(facing)},0);
  const soles=[86,172,95,181];
  p.legs.forEach((l,i)=>{assert.equal(128+facing*(l.foot.x-128),soles[i]);assert.equal(l.planted,true);assert.equal(l.foot.y,226);});
  assertSkeleton(p);
 }
});
test('dog roots reflect before rotating during all care actions',()=>{
 for(const facing of[1,-1])for(const action of['pet','feed','groom','stretch','trick']){
  const c=controller(),l=locomotion(facing);
  for(let now=0;now<=3200;now+=16)assertSkeleton(c.sample({locomotion:l,action,actionStartedAt:1},now));
 }
});
test('dog paired turn keeps roots on the torso, bones intact and two stationary supports',()=>{
 for(const facing of[1,-1]){
  const c=controller(),l=locomotion(facing);let previous=c.sample({locomotion:l},0);l.facing=-facing;c.sample({locomotion:l},0);
  const supports=new Map();
  for(let now=8;now<=800;now+=8){
   const p=c.sample({locomotion:l},now);assertSkeleton(p);assertContinuous(previous,p);
   assert.ok(p.legs.filter(x=>x.planted).length>=2,`only one support at ${now}ms`);
   for(const leg of p.legs)if(leg.planted){const key=leg.id+leg.supportKey;if(supports.has(key))assert.deepEqual(leg.foot,supports.get(key));else supports.set(key,leg.foot);}
   if(now===400)p.legs.forEach((leg,i)=>assert.ok(Math.abs(leg.hip.x-[116,112,140,144][i])<1e-8,'front roots remain on separate sides'));
   previous=p;
  }
 }
});
test('dog forepaws stay below separate shoulders while passing through the front turn view',()=>{
 for(const facing of[1,-1]){
  const c=controller(),l=locomotion(facing);c.sample({locomotion:l},0);l.facing=-facing;let p;
  for(let t=8;t<=400;t+=8)p=c.sample({locomotion:l},t);
  const near=p.legs[1],far=p.legs[3];
  assert.ok(near.foot.x<far.foot.x,'front paws must retain their left and right order');
  assert.ok(far.foot.x-near.foot.x>=20,'front paws must not crowd at the torso center');
  for(const leg of[near,far])assert.ok(Math.abs(leg.foot.x-leg.hip.x)<=10,'front paw remains below its shoulder');
 }
});
test('dog standing forelegs bend gently below the shoulder instead of bowing behind the chest',()=>{
 for(const facing of[1,-1]){
  const p=controller().sample({locomotion:locomotion(facing)},0);
  for(const leg of p.legs.filter(l=>l.kind==='fore')){
   const dx=leg.ankle.x-leg.hip.x,dy=leg.ankle.y-leg.hip.y,d=Math.hypot(dx,dy);
   const offset=Math.abs((leg.knee.x-leg.hip.x)*dy-(leg.knee.y-leg.hip.y)*dx)/d;
   assert.ok(offset<=8+1e-8,`fore elbow bows ${offset}px away from shoulder-to-wrist chain`);
  }
 }
});
test('walking into a dog turn retains valid contacts across different gait phases',()=>{
 for(const facing of[1,-1])for(const phase of[.15,.45,.65,.75,.95]){
  const c=controller(),l=locomotion(facing);l.moving=true;c.sample({locomotion:l},0);l.distanceDip=phase*64;c.sample({locomotion:l},100);
  l.moving=false;l.facing=-facing;let previous=c.sample({locomotion:l},100);
  for(let t=8;t<=800;t+=8){const p=c.sample({locomotion:l},100+t);assertSkeleton(p);assertContinuous(previous,p);if(t>=200)assert.ok(p.legs.filter(x=>x.planted).length>=2);previous=p;}
 }
});
test('dog walking turns land the already raised pair before lifting every support',()=>{
 for(const facing of[1,-1])for(let phase=0;phase<100;phase++){
  const c=controller(),l=locomotion(facing);let {now,previous}=walkToPhase(c,l,phase/100);
  l.moving=false;l.facing=-facing;c.sample({locomotion:l},now);
  const supports=new Map();
  for(let t=5;t<=800;t+=5){
   const p=c.sample({locomotion:l},now+t);assertSkeleton(p);assertContinuous(previous,p);
   assert.ok(p.legs.some(leg=>Math.abs(leg.foot.y-226)<1e-8),`all four soles leave the floor at phase ${phase/100}, facing ${facing}, ${t}ms`);
   if(t>=160)assert.ok(p.legs.filter(leg=>leg.planted).length>=2,'two supports after the first raised pair settles');
   for(const leg of p.legs)if(leg.planted){const key=leg.id+leg.supportGeneration;if(supports.has(key))assert.deepEqual(leg.foot,supports.get(key));else supports.set(key,{...leg.foot});}
   previous=p;
  }
 }
});
test('dog interrupted grooming lands the other paws before lifting its remaining support',()=>{
 for(const facing of[1,-1])for(let phase=0;phase<100;phase++)for(const pauseAt of[0,48,112,152]){
  const c=controller(),l=locomotion(facing),{now}=walkToPhase(c,l,phase/100);l.moving=false;l.facing=-facing;c.sample({locomotion:l},now);
  for(let t=5;t<=pauseAt;t+=5)c.sample({locomotion:l},now+t);c.sample({locomotion:l},now+pauseAt);
  const supports=new Map();
  for(let t=0;t<=400;t+=5){
   const p=c.sample({locomotion:l,action:'groom',actionStartedAt:1},now+pauseAt+t);assertSkeleton(p);
   assert.ok(p.legs.some(leg=>Math.abs(leg.foot.y-226)<1e-8),`grooming lifts every sole at phase ${phase/100}, facing ${facing}, pause ${pauseAt}, ${t}ms`);
   if(t>=180)assert.ok(p.legs.filter(leg=>leg.planted).length>=2);
   for(const leg of p.legs)if(leg.planted){const key=leg.id+leg.supportGeneration;if(supports.has(key))assert.deepEqual(leg.foot,supports.get(key));else supports.set(key,{...leg.foot});}
  }
 }
});
test('dog stop replants from its visible soles and can resume halfway through',()=>{
 for(const facing of[1,-1])for(const stopTime of[32,160,256,416]){
  const c=controller(),l=locomotion(facing);l.moving=true;let previous;
  for(let t=0;t<=800;t+=16){l.distanceDip=t*.01;previous=c.sample({locomotion:l},t);}
  l.moving=false;const first=c.sample({locomotion:l},800);first.legs.forEach((leg,i)=>assert.deepEqual(leg.foot,previous.legs[i].foot));
  for(let t=8;t<=stopTime;t+=8){const p=c.sample({locomotion:l},800+t);assertSkeleton(p);assertContinuous(previous,p);previous=p;}
  l.moving=true;for(let t=8;t<=400;t+=8){l.distanceDip+=.4;const p=c.sample({locomotion:l},800+stopTime+t);assertSkeleton(p);assertContinuous(previous,p);previous=p;}
 }
});
test('dog stopped care settles its support paws instead of leaving walking feet suspended',()=>{
 for(const action of['pet','feed','groom','stretch','trick']){
  const c=controller(),l=locomotion(-1);l.moving=true;for(let t=0;t<=800;t+=16){l.distanceDip=t*.01;c.sample({locomotion:l},t);}l.moving=false;let p;
  for(let t=0;t<=3200;t+=16)p=c.sample({locomotion:l,action,actionStartedAt:1},800+t);
  assertSkeleton(p);p.legs.forEach(leg=>{assert.equal(leg.foot.y,226);assert.equal(leg.planted,true);});
 }
});
test('dog fully settles its neutral stance after travel stops',()=>{
 for(const facing of[1,-1])for(const distance of[8,23,41,59]){
  const c=controller(),l=locomotion(facing);l.moving=true;c.sample({locomotion:l},0);l.distanceDip=distance;c.sample({locomotion:l},160);l.moving=false;
  let p;for(let t=0;t<=1200;t+=8){p=c.sample({locomotion:l},160+t);assertSkeleton(p);}
  p.legs.forEach((leg,i)=>{assert.equal(128+facing*(leg.foot.x-128),[86,172,95,181][i]);assert.equal(leg.planted,true);});
 }
});
test('dog walking starts from its planted standing soles without a frozen gait jump',()=>{
 for(const facing of[1,-1]){
  const c=controller(),l=locomotion(facing);let previous=c.sample({locomotion:l},0);l.moving=true;
  const supports=new Map();
  for(let t=8;t<=1200;t+=8){l.distanceDip+=.4;const p=c.sample({locomotion:l},t);assertSkeleton(p);assertContinuous(previous,p);
   for(const leg of p.legs)if(leg.planted){const key=leg.id+leg.supportGeneration,world={x:leg.foot.x+l.distanceDip*facing,y:leg.foot.y};if(supports.has(key))assert.ok(Math.hypot(world.x-supports.get(key).x,world.y-supports.get(key).y)<1e-9,'planted sole stays fixed in world coordinates');else supports.set(key,world);}
   previous=p;
  }
 }
});
test('paused dog stopped telemetry resumes the identical visible sole and support identity',()=>{
 for(const facing of[1,-1])for(const freeze of[{paused:true},{reducedMotion:true},{ambient:false},{dragging:true}]){
  const c=controller(),l=locomotion(facing);l.moving=true;let before;
  for(let t=0;t<=800;t+=16){l.distanceDip=t*.01;before=c.sample({locomotion:l},t);}l.moving=false;
  c.sample({...freeze,locomotion:{...l,...(freeze.dragging?{dragging:true}:{})}},816);const p=c.sample({locomotion:l},1000);
  p.legs.forEach((leg,i)=>{assert.deepEqual(leg.foot,before.legs[i].foot);assert.equal(leg.supportGeneration,before.legs[i].supportGeneration);});
 }
});
test('dog care interrupted turn resumes its remaining step without snapping',()=>{
 for(const facing of[1,-1])for(const phase of[.15,.65,.95])for(const pauseAt of[0,152,160,192,200,312,320,336,472,480,592,600,632,640,688])for(const action of['pet','feed','groom','stretch','trick']){
  const c=controller(),l=locomotion(facing);l.moving=true;c.sample({locomotion:l},0);l.distanceDip=phase*64;c.sample({locomotion:l},100);l.moving=false;l.facing=-facing;c.sample({locomotion:l},100);
  for(let t=8;t<=pauseAt;t+=8)c.sample({locomotion:l},100+t);
  let previous;const duration=action==='pet'?2400:action==='feed'?3200:action==='groom'?2200:action==='stretch'?2600:1200;
  for(let t=0;t<=duration;t+=8){previous=c.sample({locomotion:l,action,actionStartedAt:1},100+pauseAt+t);assertSkeleton(previous);}
  for(let t=0;t<=850;t+=8){const p=c.sample({locomotion:l,action:'idle'},100+pauseAt+duration+t);assertSkeleton(p);assertContinuous(previous,p);previous=p;}
 }
});
test('dog paws settled during interrupted care keep their support identity and floor position',()=>{
 for(const [facing,phase,pauseAt]of[[1,0,152],[1,.33,472],[-1,.65,152],[-1,0,472]])for(const action of['pet','feed','groom','stretch','trick']){
  const c=controller(),l=locomotion(facing);l.moving=true;c.sample({locomotion:l},0);l.distanceDip=phase*64;c.sample({locomotion:l},100);l.moving=false;l.facing=-facing;c.sample({locomotion:l},100);
  for(let t=5;t<=pauseAt;t+=5)c.sample({locomotion:l},100+t);c.sample({locomotion:l},100+pauseAt);
  const supports=new Map();let previous;
  for(let t=0;t<=3200;t+=5){
   const p=c.sample({locomotion:l,action,actionStartedAt:1},100+pauseAt+t);assertSkeleton(p);
   if(previous)for(const [i,leg]of p.legs.entries())assert.ok(Math.hypot(leg.foot.x-previous.legs[i].foot.x,leg.foot.y-previous.legs[i].foot.y)<4,'care foot moves smoothly through takeoff and landing');
   for(const leg of p.legs)if(leg.planted){
    const key=leg.id+leg.supportGeneration;if(supports.has(key))assert.deepEqual(leg.foot,supports.get(key),'continuing planted support must not slide during care');else supports.set(key,{...leg.foot});
   }
   if(t>=180&&!p.airborne)assert.ok(p.legs.filter(x=>x.planted).length>=2);
   previous=p;
  }
 }
});
test('dog finishes a paused turn step landing before hopping and carries all soles through flight',()=>{
 for(const facing of[1,-1])for(const pauseAt of[48,336,688]){
  const c=controller(),l=locomotion(facing);c.sample({locomotion:l},0);l.facing=-facing;let base;
  for(let t=8;t<=pauseAt;t+=8)base=c.sample({locomotion:l},t);
  let previous;for(let t=0;t<=1200;t+=8){
   const p=c.sample({locomotion:l,action:'trick',actionStartedAt:1},pauseAt+t);assert.equal(p.orientation,base.orientation);assertSkeleton(p);
   if(previous)for(const [i,leg]of p.legs.entries())assert.ok(Math.hypot(leg.foot.x-previous.legs[i].foot.x,leg.foot.y-previous.legs[i].foot.y)<4);
   if(p.airborne)p.legs.forEach(leg=>{assert.equal(leg.planted,false);assert.ok(Math.abs(leg.foot.y-p.bodyY-226)<1e-8);});
   previous=p;
  }
  const resumed=c.sample({locomotion:l,action:'idle'},pauseAt+1200);
  resumed.legs.forEach((leg,i)=>assert.deepEqual(leg.foot,previous.legs[i].foot));
 }
});
