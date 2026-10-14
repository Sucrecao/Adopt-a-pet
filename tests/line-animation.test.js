import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholeAnimationController } from '../src/core/whole-animation.js';

const track = (frames, time=10, loop=false) => ({frames,durations:frames.map(()=>time),loop});
const fixture = () => ({version:7,renderMode:'discrete-whole-frame',authoring:'line-pet-v1',stride:64,neutralFrame:0,
  frames:Array.from({length:64},()=>({page:0,rect:[0,0,256,256]})),
  clips:{idle:track([0,8,0],20,true),walk:track([0,1,2,3,4,5,6,7],10,true),rest:track([20,21,20],10,true),turn:track([0,40,41,42],200),
    pet:track([0,30,31,0]),feed:track([0,32,33,0]),groom:track([0,34,35,0]),stretch:track([0,36,37,0]),hop:track([0,38,39,0])},
  transitions:{rest:{enter:track([0,22,20]),exit:track([20,22,0])}},
  authoredStops:Array.from({length:8},(_,i)=>track([i,16+i,0]))});
const props = (motion={},extra={}) => ({action:'idle',...extra,locomotion:{epoch:1,distanceDip:0,spriteSizeDip:256,facing:1,intentMoving:false,moving:false,...motion}});
const make=()=>createWholeAnimationController({species:'dog',meta:fixture(),random:()=>.99});

test('line walk uses presented distance and stop starts at the exact displayed whole pose',()=>{
  const c=make();c.sample(props(),0);
  assert.equal(c.sample(props({intentMoving:true}),1).firstStepReady,true);
  const walk=c.sample(props({intentMoving:true,moving:true,distanceDip:16}),10);
  assert.equal(walk.frame,2);assert.equal(walk.phase,.25);assert.equal(walk.mix,0);assert.equal(walk.nextFrame,walk.frame);
  const stop=c.sample(props({distanceDip:16}),11);
  assert.equal(stop.frame,walk.frame);assert.equal(stop.transition,'walk.settle');assert.equal(stop.firstStepReady,false);
  assert.equal(c.sample(props({distanceDip:16}),21).frame,18);
  assert.equal(c.sample(props({distanceDip:16}),41).frame,0);
});
test('resuming during settling finishes the authored landing before permitting travel',()=>{
  const c=make();c.sample(props(),0);c.sample(props({intentMoving:true}),1);c.sample(props({intentMoving:true,moving:true,distanceDip:32}),10);
  c.sample(props({distanceDip:32}),11);
  const resumed=c.sample(props({intentMoving:true,distanceDip:32}),21);
  assert.equal(resumed.frame,20);assert.equal(resumed.firstStepReady,false);
  const ready=c.sample(props({intentMoving:true,distanceDip:32}),41);
  assert.equal(ready.frame,0);assert.equal(ready.phase,0);assert.equal(ready.firstStepReady,true);
});
test('care interruption retraces complete pictures to neutral without a same-time snap',()=>{
  const c=make();c.sample(props(),0);c.sample(props({}, {action:'pet',actionStartedAt:1}),1);
  const care=c.sample(props({}, {action:'pet',actionStartedAt:1}),16);
  assert.equal(care.frame,30);
  const interrupt=c.sample(props({}, {action:'feed',actionStartedAt:2}),16);
  assert.equal(interrupt.frame,care.frame);assert.equal(interrupt.transition,'pet.return');
  assert.equal(c.sample(props({}, {action:'feed',actionStartedAt:2}),26).frame,0);
  assert.equal(c.sample(props({}, {action:'feed',actionStartedAt:2}),36).frame,0);
  assert.equal(c.sample(props({}, {action:'feed',actionStartedAt:2}),46).frame,32);
});
test('rest entry cancellation retraces the exact complete current picture',()=>{
  const c=make();c.sample(props(),0);c.sample(props({}, {action:'rest'}),1);
  const resting=c.sample(props({}, {action:'rest'}),16);assert.equal(resting.frame,22);
  const cancelled=c.sample(props({intentMoving:true}),16);assert.equal(cancelled.frame,22);assert.equal(cancelled.firstStepReady,false);
  assert.equal(c.sample(props({intentMoving:true}),36).firstStepReady,true);
});
test('turn remains a stationary 800ms whole-frame track then joins the mirrored neutral',()=>{
  const c=make();c.sample(props(),0);
  const start=c.sample(props({facing:-1,intentMoving:true}),1);assert.equal(start.frame,0);assert.equal(start.turning,true);
  const middle=c.sample(props({facing:-1,intentMoving:true}),401);assert.equal(middle.frame,41);assert.equal(middle.facing,1);assert.equal(middle.phase,0);assert.equal(middle.firstStepReady,false);
  const end=c.sample(props({facing:-1,intentMoving:true}),801);assert.equal(end.frame,0);assert.equal(end.facing,-1);assert.equal(end.firstStepReady,true);
});
test('pause/drag/reduced motion freeze the actual whole pose and suppress resume catch-up',()=>{
  for(const freeze of [{paused:true},{reducedMotion:true},{locomotion:{dragging:true}}]) {
    const c=make();c.sample(props(),0);c.sample(props({}, {action:'pet'}),1);const a=c.sample(props({}, {action:'pet'}),16);
    const p=props({}, {action:'pet',...freeze});if(freeze.locomotion)p.locomotion={...props().locomotion,...freeze.locomotion};
    const frozen=c.sample(p,1000);assert.equal(frozen.frame,a.frame);assert.equal(frozen.firstStepReady,false);
    const resumed=c.sample(props({}, {action:'pet'}),2000);assert.equal(resumed.frame,a.frame);
  }
});
test('rollback discards an unpainted proposed travel sample',()=>{
  const c=make();c.sample(props(),0);c.sample(props({intentMoving:true}),1);
  c.sample(props({intentMoving:true,moving:true,distanceDip:32}),10);
  assert.equal(typeof c.rollback,'function');c.rollback();
  const recovered=c.sample(props({intentMoving:true,moving:true,distanceDip:16}),20);
  assert.equal(recovered.phase,.25);assert.equal(recovered.frame,2);
});
test('malformed authored stop endpoints cannot enter the line route',()=>{
  const meta=fixture();meta.authoredStops[2].frames[0]=1;
  assert.throws(()=>createWholeAnimationController({meta}),/stop|settle|authored/i);
});
test('display cadence cannot select opposite sides of a floating-point walk boundary',()=>{
  const drive=hz=>{
    const c=createWholeAnimationController({meta:{...fixture(),stride:56}});c.sample(props(),0);c.sample(props({intentMoving:true}),0);
    let pose;
    for(let i=1;i<=hz*2;i++)pose=c.sample(props({intentMoving:true,moving:true,distanceDip:56*i/hz}),1000*i/hz);
    return pose;
  };
  const a=drive(60),b=drive(120);assert.equal(a.frame,b.frame);assert.equal(a.frame,0);assert.equal(a.phase,2);assert.equal(b.phase,2);
});
test('ambient grooming remains reachable and returns through whole neutral pictures',()=>{
  const c=createWholeAnimationController({meta:fixture(),random:()=>0});c.sample(props(),0);
  const groom=c.sample(props(),6600);assert.equal(groom.clip,'groom');assert.equal(groom.frame,0);
  assert.equal(c.sample(props(),6615).frame,34);
  const finished=c.sample(props(),6640);assert.equal(finished.clip,'idle');assert.equal(finished.frame,0);
});
test('paused travel is consumed without moving the held walking pose on resume',()=>{
  const c=make();c.sample(props(),0);c.sample(props({intentMoving:true}),1);
  const a=c.sample(props({intentMoving:true,moving:true,distanceDip:16}),10);
  const paused=c.sample(props({intentMoving:true,distanceDip:60},{paused:true}),1000);assert.equal(paused.frame,a.frame);
  const resumed=c.sample(props({intentMoving:true,distanceDip:60}),2000);assert.equal(resumed.frame,a.frame);assert.equal(resumed.phase,a.phase);
});
test('an epoch barrier during drag starts settling from the held picture after release',()=>{
  const c=make();c.sample(props(),0);c.sample(props({intentMoving:true}),1);
  const a=c.sample(props({intentMoving:true,moving:true,distanceDip:16}),10);
  c.sample(props({epoch:2,distanceDip:0,dragging:true,intentMoving:true}),50);
  const resumed=c.sample(props({epoch:2,distanceDip:0,intentMoving:true}),100);
  assert.equal(resumed.frame,a.frame);assert.equal(resumed.transition,'walk.settle');assert.equal(resumed.firstStepReady,false);
});
test('a care interruption already returning home follows its short remaining whole-picture route',()=>{
  const c=make();c.sample(props(),0);c.sample(props({}, {action:'pet',actionStartedAt:1}),1);
  const nearEnd=c.sample(props({}, {action:'pet',actionStartedAt:1}),29);assert.equal(nearEnd.frame,31);
  const cancel=c.sample(props({}, {action:'feed',actionStartedAt:2}),29);assert.equal(cancel.frame,nearEnd.frame);
  assert.equal(c.sample(props({}, {action:'feed',actionStartedAt:2}),39).frame,0);
  assert.equal(c.sample(props({}, {action:'feed',actionStartedAt:2}),49).clip,'feed');
});
test('failed stationary care draws consume wall time instead of catching up on recovery',()=>{
  const c=make();c.sample(props(),0);c.sample(props({}, {action:'pet'}),1);
  const held=c.sample(props({}, {action:'pet'}),11);assert.equal(held.frame,30);
  for(let now=21;now<=721;now+=10){c.sample(props({}, {action:'pet'}),now);c.rollback();}
  const recovered=c.sample(props({}, {action:'pet'}),722);
  assert.equal(recovered.frame,held.frame);assert.equal(recovered.elapsed,held.elapsed+1);
});
test('failed landing draws resume the next authored pose without skipping the stop track',()=>{
  const c=make();c.sample(props(),0);c.sample(props({intentMoving:true}),1);c.sample(props({intentMoving:true,moving:true,distanceDip:32}),10);
  c.sample(props({distanceDip:32}),11);const held=c.sample(props({distanceDip:32}),21);
  for(let now=31;now<=731;now+=10){c.sample(props({distanceDip:32}),now);c.rollback();}
  const recovered=c.sample(props({distanceDip:32}),732);
  assert.equal(recovered.frame,held.frame);assert.equal(recovered.transition,'walk.settle');assert.equal(recovered.elapsed,held.elapsed+1);
});
