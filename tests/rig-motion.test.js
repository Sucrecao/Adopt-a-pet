import test from 'node:test';
import assert from 'node:assert/strict';
import { footTrajectory, solveLeg, createRigController } from '../src/core/rig-motion.js';
const props = (distanceDip=0, spriteSizeDip=256, extra={}) => ({locomotion:{epoch:1,distanceDip,spriteSizeDip,facing:1,moving:true,...extra}});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
test('distance owns phase across timing and sprite scales', () => {
 const a=createRigController({species:'cat'}), b=createRigController({species:'cat'});
 a.sample(props(),0); b.sample(props(0,128),0);
 near(a.sample(props(16),100).phase,b.sample(props(8,128),5000).phase);
 near(a.sample(props(16),9000).phase,.25);
 near(a.sample(props(64),9001).phase,1);
});
test('stance feet retain world X and support Y while hips move',()=>{
 const c=createRigController({species:'dog'}); const a=c.sample(props(0),0), b=c.sample(props(4),200);
 for (const i of [0,1,2]) { assert.ok(a.legs[i].planted && b.legs[i].planted); near(a.legs[i].foot.x,b.legs[i].foot.x+4); near(a.legs[i].foot.y,226); near(b.legs[i].foot.y,226); }
});
test('epoch, pause, dragging, and resizing rebase without catch-up',()=>{
 const c=createRigController({species:'cat'}); c.sample(props(),0); near(c.sample(props(16),100).phase,.25);
 near(c.sample(props(200,256,{epoch:2}),200).phase,.25);
 near(c.sample(props(300,256,{paused:true}),300).phase,.25);
 near(c.sample(props(300),400).phase,.25);
 near(c.sample(props(500,256,{dragging:true}),500).phase,.25);
 near(c.sample(props(500),600).phase,.25);
 near(c.sample(props(600,128),700).phase,.25);
});
test('trajectory wraps, lifts and rejoins continuously',()=>{
 near(footTrajectory(-.1).x,footTrajectory(.9).x);
 assert.ok(footTrajectory(.8).y<0); assert.equal(footTrajectory(.8).planted,false);
 near(footTrajectory(.65).y,0); near(footTrajectory(1).y,0);
 assert.ok(Math.abs(footTrajectory(.999999).x-footTrajectory(0).x)<.001);
});
test('IK endpoints are finite and reachable for complete gait',()=>{
 const c=createRigController({species:'cat'}); c.sample(props(),0);
 for(let d=0;d<=64;d++){ for(const leg of c.sample(props(d),d*10).legs){
 const p=solveLeg(leg.hip,leg.foot,leg.upperLength,leg.lowerLength,leg.bend);
 assert.ok(Number.isFinite(p.knee.x)&&Number.isFinite(p.knee.y));
 near(Math.hypot(p.knee.x-leg.hip.x,p.knee.y-leg.hip.y),leg.upperLength);
 near(Math.hypot(p.knee.x-leg.foot.x,p.knee.y-leg.foot.y),leg.lowerLength);
 }}
 const clamped=solveLeg({x:0,y:0},{x:999,y:0},40,40,1); assert.ok(Number.isFinite(clamped.knee.x)); assert.equal(clamped.foot.x,999);
});
test('trick has one bounded ballistic flight and returns to support',()=>{
 const c=createRigController({species:'dog'}); const action={...props(0,256,{moving:false}),action:'trick',actionStartedAt:0};
 const airborne=[]; for(let t=0;t<=2000;t+=20){const p=c.sample(action,t); if(p.airborne)airborne.push(t); else for(const l of p.legs) near(l.foot.y,226);}
 assert.ok(airborne.length>0); assert.ok(airborne.at(-1)-airborne[0]<=480); assert.ok(airborne.at(-1)<1000);
});
test('action profiles expose attached body transform and bird cycle',()=>{
 const c=createRigController({species:'cat'}); const base={...props(0,256,{moving:false}),actionStartedAt:0,actionElapsed:600};
 assert.ok(c.sample({...base,action:'stretch'},600).bodyAngle!==0);
 assert.equal(c.sample({...base,action:'groom'},600).legs[1].planted,false);
 const bird=createRigController({species:'parrot'}); const a=bird.sample(base,0), b=bird.sample(base,400); assert.notEqual(a.wingPhase,b.wingPhase);
});
test('every interaction endpoint remains reachable without stretching bones',()=>{
 for(const action of ['groom','stretch','trick']){
 const c=createRigController({species:'dog'});
 for(let t=0;t<=2000;t+=20)for(const l of c.sample({...props(0,256,{moving:false}),action,actionStartedAt:0},t).legs){
 assert.ok(Math.hypot(l.foot.x-l.hip.x,l.foot.y-l.hip.y)<=l.upperLength+l.lowerLength);
 near(Math.hypot(l.knee.x-l.foot.x,l.knee.y-l.foot.y),l.lowerLength);
 }
 }
});
test('wallclock action token starts monotonic clock and repeated action restarts',()=>{
 const c=createRigController({species:'dog'}), p={...props(0,256,{moving:false}),action:'trick',actionStartedAt:1900000000000};
 c.sample(p,100); const airborne=c.sample(p,600); assert.equal(airborne.airborne,true); near(airborne.elapsed,500); assert.equal(airborne.clip,'hop');
 const restarted=c.sample({...p,actionStartedAt:p.actionStartedAt+1},620); near(restarted.elapsed,0); assert.equal(restarted.airborne,false);
});
test('pause freezes complete pose and resumes without catch-up',()=>{
 const c=createRigController({species:'parrot',random:()=>0}); const p={...props(0,256,{moving:false}),action:'trick',actionStartedAt:1234567890000};
 c.sample(p,0); const before=c.sample(p,400); const paused=c.sample({...p,paused:true},800);
 assert.deepEqual(paused,before); assert.deepEqual(c.sample({...p,paused:true},3000),before);
 const resumed=c.sample(p,3100); near(resumed.elapsed,before.elapsed); assert.deepEqual(resumed.legs,before.legs);
 near(c.sample(p,3200).elapsed,before.elapsed+100);
});
test('quiet modes freeze pose and nonmoving telemetry never advances gait',()=>{
 for(const quiet of [{reducedMotion:true},{ambient:false}]){
 const c=createRigController({species:'cat',random:()=>0}); const p={...props(),...quiet}; const a=c.sample(p,0); const b=c.sample({...p,locomotion:{...p.locomotion,distanceDip:100}},5000); assert.deepEqual(b,a);
 }
 const c=createRigController({species:'dog'}); c.sample(props(0,256,{moving:false}),0); near(c.sample(props(30,256,{moving:false}),100).phase,0);
});
test('actionElapsed seeds clock without mixing timestamp domains',()=>{
 const c=createRigController({species:'cat'}); const p={...props(0,256,{moving:false}),action:'groom',actionStartedAt:1900000000000,actionElapsed:600}; near(c.sample(p,20).elapsed,600); near(c.sample(p,120).elapsed,700);
});
test('stopping lowers airborne swing smoothly while retaining phase',()=>{
 const c=createRigController({species:'cat'}); c.sample(props(),0); const moving=c.sample(props(48),100); assert.ok(moving.legs[0].foot.y<226);
 const stop=c.sample(props(48,256,{moving:false}),116); assert.ok(stop.legs[0].foot.y>moving.legs[0].foot.y&&stop.legs[0].foot.y<226); near(stop.phase,moving.phase);
 const resting=c.sample(props(48,256,{moving:false}),2000); near(resting.legs[0].foot.y,226); near(resting.phase,moving.phase);
});
test('takeoff and landing body and hips are continuous',()=>{
 const c=createRigController({species:'dog'}); const p={...props(0,256,{moving:false}),action:'trick',actionStartedAt:1};c.sample(p,0);
 for(const boundary of [260,740]){const a=c.sample(p,boundary-.001),b=c.sample(p,boundary); assert.ok(Math.abs(a.bodyY-b.bodyY)<.01); for(let i=0;i<4;i++)assert.ok(Math.hypot(a.legs[i].hip.x-b.legs[i].hip.x,a.legs[i].hip.y-b.legs[i].hip.y)<.01);}
});
test('completed groom preserves swing contact status while moving',()=>{
 const c=createRigController({species:'cat'});const p={...props(),action:'groom',actionStartedAt:1};c.sample(p,0);const pose=c.sample({...p,locomotion:props(32).locomotion},1900);assert.ok(pose.legs[1].foot.y<226);assert.equal(pose.legs[1].planted,false);
});
test('moving play uses walk clip including birds',()=>{
 const c=createRigController({species:'parrot'});assert.equal(c.sample({...props(),action:'play'},0).clip,'walk');
});
test('final arrival delta completes stride but subsequent idle telemetry is rebased',()=>{
 const c=createRigController({species:'dog'});c.sample(props(),0);near(c.sample(props(60),100).phase,60/64);near(c.sample(props(64,256,{moving:false}),120).phase,1);near(c.sample(props(500,256,{moving:false}),140).phase,1);
});
test('hind geometry attaches inside torso and stretch uses full action duration',()=>{
 assert.equal(createRigController({species:'cat'}).sample(props(),0).geometry.hindHip.y,147);
 const c=createRigController({species:'cat'});const p={...props(0,256,{moving:false}),action:'stretch',actionStartedAt:1};c.sample(p,0);near(c.sample(p,1300).bodyAngle,.18);assert.ok(c.sample(p,2000).bodyAngle>0);near(c.sample(p,2600).bodyAngle,0);
});
test('all gait phases remain reachable through full bow envelope',()=>{
 for(let d=0;d<=64;d+=2)for(let t=0;t<=2600;t+=100){
 const c=createRigController({species:'dog'}); c.sample({...props(),action:'stretch',actionStartedAt:1},0);
 const pose=c.sample({...props(d),action:'stretch',actionStartedAt:1,actionElapsed:t},t);
 for(const leg of pose.legs){ assert.ok(Math.hypot(leg.foot.x-leg.hip.x,leg.foot.y-leg.hip.y)<=leg.upperLength+leg.lowerLength, `distance at d${d} t${t} ${leg.id}`); near(Math.hypot(leg.knee.x-leg.foot.x,leg.knee.y-leg.foot.y),leg.lowerLength); }
 }
});
test('reversal releases contacts continuously and freezes the turn when paused',()=>{
 for(const moving of [true,false]){
 const c=createRigController({species:'dog',random:()=>0});c.sample(props(),0);const before=c.sample(props(16),100);
 const p=props(16.1,256,{facing:-1,moving});const start=c.sample(p,101);
 assert.ok(start.turning);assert.ok(start.orientation>0);
 for(let i=0;i<4;i++)if(before.legs[i].planted&&start.legs[i].planted)near(start.legs[i].foot.x,before.legs[i].foot.x+.1);
 const paused=c.sample({...p,paused:true},500);assert.equal(paused,start);
 c.sample(p,501);let end;for(let t=541;t<=1501;t+=40)end=c.sample(p,t);assert.equal(end.turning,false);assert.equal(end.orientation,-1);
 }
});
test('pet feed and bird grooming expose continuous articulated response',()=>{
 const sample=(species,action,elapsed)=>createRigController({species,random:()=>0}).sample({...props(0,256,{moving:false}),action,actionElapsed:elapsed},0);
 for(const action of ['pet','feed']){assert.notEqual(sample('dog',action,600).headAngle,0);near(sample('dog',action,0).headAngle,0);near(sample('dog',action,action==='pet'?2400:3200).headAngle,0);}
 assert.ok(sample('parrot','groom',600).preen>0);
});
test('moving turn supports retain exact world positions through release and replant',()=>{
 for(const speed of [0,.02,.05,.15]){
 const c=createRigController({species:'dog',random:()=>0});let before,previousDistance=0;
 for(let t=0;t<=2500;t+=8){
 const facing=t<400?1:-1,distance=speed*t;
 const pose=c.sample(props(distance,256,{facing,moving:speed>0}),t);
 for(let i=0;i<4;i++){
 const leg=pose.legs[i];
 assert.ok(Math.hypot(leg.foot.x-leg.hip.x,leg.foot.y-leg.hip.y)<=leg.upperLength+leg.lowerLength+1e-6,`unreachable ${t} ${i}`);
 if(before){const old=before.legs[i];assert.ok(Math.hypot(leg.foot.x-old.foot.x,leg.foot.y-old.foot.y)<9,`foot discontinuity ${t} ${i}`);
 if(old.planted&&leg.planted&&old.supportGeneration===leg.supportGeneration){near(leg.foot.x+facing*(distance-previousDistance),old.foot.x);near(leg.foot.y,226);}}
 }
 before=pose;previousDistance=distance;
 }
 }
});
test('stationary care actions hold turn progress while head response stays active',()=>{
 const c=createRigController({species:'dog',random:()=>0});c.sample(props(),0);
 const reversed=props(0,256,{facing:-1,moving:false});const start=c.sample(reversed,16);
 const during=c.sample({...reversed,action:'pet',actionElapsed:600},216);near(during.orientation,start.orientation);assert.notEqual(during.headAngle,0);
 const resumed=c.sample({...reversed,action:'idle'},232);assert.ok(resumed.orientation<during.orientation);
});
test('in-place turn settles before ordinary accepted-distance gait resumes',()=>{
 const c=createRigController({species:'cat',random:()=>0});c.sample(props(),0);const before=c.sample(props(16),16);
 const reversed=props(16,256,{facing:-1,moving:false});let end;
 for(let t=32;t<=832;t+=16)end=c.sample(reversed,t);
 assert.equal(end.turning,false);near(end.phase,before.phase);
 const moving=c.sample(props(17,256,{facing:-1}),848);near(moving.phase,before.phase+1/64);
});
test('trick during early mid and late turn carries every paw through flight and resumes support',()=>{
 for(const turnTime of [48,336,688]){
 const c=createRigController({species:'dog',random:()=>0});c.sample(props(),0);c.sample(props(16),100);
 const loc=props(16,256,{facing:-1,moving:false});let base;
 for(let t=116;t<=100+turnTime;t+=16)base=c.sample(loc,t);
 const startTime=100+turnTime;let previous;
 for(let elapsed=0;elapsed<=1200;elapsed+=8){
 const pose=c.sample({...loc,action:'trick',actionStartedAt:1},startTime+elapsed);
 near(pose.orientation,base.orientation);
 for(let i=0;i<4;i++){
 const leg=pose.legs[i];if(pose.airborne){assert.equal(leg.planted,false);near(leg.foot.y-pose.bodyY,base.legs[i].foot.y);}
 assert.ok(Math.hypot(leg.foot.x-leg.hip.x,leg.foot.y-leg.hip.y)<=leg.upperLength+leg.lowerLength+1e-6,`reach turn${turnTime} t${elapsed} ${i}`);
 if(previous)assert.ok(Math.hypot(leg.foot.x-previous.legs[i].foot.x,leg.foot.y-previous.legs[i].foot.y)<4,`jump turn${turnTime} t${elapsed} ${i}`);
 }previous=pose;
 }
 const resumed=c.sample({...loc,action:'idle'},startTime+1200.001);
 for(let i=0;i<4;i++)assert.ok(Math.hypot(resumed.legs[i].foot.x-previous.legs[i].foot.x,resumed.legs[i].foot.y-previous.legs[i].foot.y)<.01);
 }
});
test('support lifetime IDs never reuse after lift replant in the same gait cycle',()=>{
 const c=createRigController({species:'dog',random:()=>0});let previous,root=0,lastDistance=0;const lifetimes=new Map();
 for(let t=0;t<=4500;t+=8){
 const facing=t<600?1:t<1500?-1:1,moving=t<600||t>=1500;
 const distance=t<600?t*.02:t<1500?12:12+(t-1500)*.02;
 root+=(distance-lastDistance)*facing;lastDistance=distance;
 const p=c.sample(props(distance,256,{moving,facing}),t);
 for(const l of p.legs)if(l.planted){
 const key=`${l.id}:${l.supportGeneration}`,world=l.foot.x+root;
 if(lifetimes.has(key))near(world,lifetimes.get(key));else lifetimes.set(key,world);
 if(previous&&!previous.legs.find(old=>old.id===l.id).planted)assert.notEqual(l.supportGeneration,previous.legs.find(old=>old.id===l.id).supportGeneration);
 }previous=p;
 }
 assert.ok(lifetimes.size>=12);
});
test('stationary actions during frozen turn keep all leg endpoints within reach',()=>{
 for(const turnTime of [48,336,688])for(const action of ['pet','feed','stretch','groom']){
 const c=createRigController({species:'dog',random:()=>0});c.sample(props(),0);c.sample(props(16),100);
 const loc=props(16,256,{facing:-1,moving:false});for(let t=116;t<=100+turnTime;t+=16)c.sample(loc,t);
 for(let t=0;t<=2600;t+=16){const p=c.sample({...loc,action,actionStartedAt:1},100+turnTime+t);
 for(const l of p.legs)assert.ok(Math.hypot(l.foot.x-l.hip.x,l.foot.y-l.hip.y)<=l.upperLength+l.lowerLength+1e-6,`${action} turn${turnTime} time${t} ${l.id}`);}
 }
});
