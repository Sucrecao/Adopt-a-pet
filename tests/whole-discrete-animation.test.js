import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWholeAnimationController} from '../src/core/whole-animation.js';

const metadata=species=>({...JSON.parse(readFileSync(`public/pets/${species}-whole-v3.json`)),version:7,renderMode:'discrete-whole-frame',stride:species==='parrot'?80:32});
const props=(motion={},extra={})=>({action:'idle',locomotion:{epoch:1,distanceDip:0,spriteSizeDip:256,facing:1,moving:false,actualMoving:false,intentMoving:false,...motion},...extra});
for(const species of ['cat','dog','parrot']) {
  test(`${species} whole pictures prepare from intent before any native displacement`,()=>{
    const c=createWholeAnimationController({species,meta:metadata(species),random:()=>.99});c.sample(props(),0);
    const entering=c.sample(props({intentMoving:true}),10);
    assert.equal(entering.clip,'walk');assert.equal(entering.frame,95);assert.equal(entering.firstStepReady,false);
    assert.equal(c.sample(props({intentMoving:true}),70).frame,94);
    const ready=c.sample(props({intentMoving:true}),130);assert.equal(ready.frame,96);assert.equal(ready.firstStepReady,true);
    assert.equal(ready.nextFrame,ready.frame);assert.equal(ready.mix,0);assert.equal(ready.ground,undefined);
  });
  test(`${species} whole pictures render all32 distinct authored walk frames from accepted travel`,()=>{
    const meta=metadata(species),c=createWholeAnimationController({species,meta,random:()=>.99});c.sample(props(),0);c.sample(props({intentMoving:true}),10);c.sample(props({intentMoving:true}),130);
    const observed=[];
    for(let i=0;i<32;i++) {
      const pose=c.sample(props({intentMoving:true,moving:true,actualMoving:true,distanceDip:meta.stride*(i+.01)/32}),140+i*16);
      observed.push(pose.frame);assert.equal(pose.nextFrame,pose.frame);assert.equal(pose.mix,0);assert.equal(pose.firstStepReady,true);
    }
    assert.deepEqual(observed,meta.clips.walk.frames);
    assert.equal(c.sample(props({intentMoving:true,moving:true,actualMoving:true,distanceDip:meta.stride}),1000).frame,96);
  });
}
test('mobile play preserves the running whole entry and pauses freeze its exact picture',()=>{
  const c=createWholeAnimationController({meta:metadata('cat'),random:()=>.99});c.sample(props(),0);c.sample(props({intentMoving:true}),10);
  const play=c.sample(props({intentMoving:true},{action:'play'}),70);assert.equal(play.frame,94);assert.equal(play.transitionRemaining,60);
  const paused=c.sample(props({intentMoving:true},{action:'play',paused:true}),100);assert.equal(paused.frame,play.frame);assert.equal(paused.firstStepReady,false);
  assert.equal(c.sample(props({intentMoving:true},{action:'play'}),200).frame,94);
  const ready=c.sample(props({intentMoving:true},{action:'play'}),260);assert.equal(ready.firstStepReady,true);
});
test('a whole800ms turn is stationary, discrete and cannot release travel early',()=>{
  const c=createWholeAnimationController({meta:metadata('cat'),random:()=>.99});c.sample(props(),0);
  const first=c.sample(props({facing:-1,intentMoving:true}),10);assert.equal(first.clip,'turn');assert.equal(first.firstStepReady,false);
  const halfway=c.sample(props({facing:-1,intentMoving:true}),410);assert.equal(halfway.frame,40);assert.equal(halfway.mix,0);assert.equal(halfway.phase,0);assert.equal(halfway.facing,1);
  const after=c.sample(props({facing:-1,intentMoving:true}),810);assert.equal(after.facing,-1);assert.equal(after.firstStepReady,false);
  assert.equal(c.sample(props({facing:-1,intentMoving:true}),930).firstStepReady,true);
});
test('cancelled intent exits the whole entry without granting movement readiness',()=>{
  const c=createWholeAnimationController({meta:metadata('cat'),random:()=>.99});c.sample(props(),0);c.sample(props({intentMoving:true}),10);
  const stopped=c.sample(props(),50);assert.equal(stopped.clip,'idle');assert.equal(stopped.firstStepReady,false);assert.equal(stopped.nextFrame,stopped.frame);assert.equal(stopped.mix,0);
});
test('cancelling a whole turn back to its initial facing still paints the full walking entry',()=>{
  const c=createWholeAnimationController({meta:metadata('cat'),random:()=>.99});c.sample(props(),0);
  c.sample(props({facing:-1,intentMoving:true}),10);
  const cancelled=c.sample(props({facing:1,intentMoving:true}),50);
  assert.equal(cancelled.turning,false);assert.equal(cancelled.frame,95);assert.equal(cancelled.firstStepReady,false);assert.equal(cancelled.transition,'walk.enter');
  assert.equal(c.sample(props({facing:1,intentMoving:true}),110).frame,94);
  assert.equal(c.sample(props({facing:1,intentMoving:true}),170).firstStepReady,true);
});
test('v7 rejects any accidental assembly metadata',()=>{
  for(const property of ['flow','handoffs','groundGait','groundRise'])assert.throws(()=>createWholeAnimationController({meta:{...metadata('cat'),[property]:{}}}),/whole|discrete|frame/i);
  assert.throws(()=>createWholeAnimationController({meta:{...metadata('cat'),renderMode:'stitched'}}),/whole|discrete|frame/i);
});
