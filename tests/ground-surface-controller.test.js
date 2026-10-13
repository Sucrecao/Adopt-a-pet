import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWholeAnimationController} from '../src/core/whole-animation.js';

const configs=Object.fromEntries(['cat','dog'].map(s=>[s,JSON.parse(fs.readFileSync(new URL(`../public/pets/${s}-whole-v6.json`,import.meta.url)))]));
const motion=(distanceDip=0,extra={})=>({epoch:1,distanceDip,spriteSizeDip:256,facing:1,moving:true,intentMoving:true,...extra});
const signature=p=>[p.frame,p.nextFrame,p.mix,p.facing,p.ground];
const create=s=>createWholeAnimationController({species:s,meta:configs[s],random:()=>1});

for(const species of ['cat','dog']) {
  test(`${species}: first renderer sample prepares the neutral pose before native movement is released`,()=>{
    const c=create(species),first=c.sample({locomotion:motion()},0);
    assert.equal(first.frame,0);assert.equal(first.nextFrame,0);assert.equal(first.mix,0);
    assert.equal(first.transition,'handoff.walk');assert.equal(first.transitionRemaining,160);
    const preparing=c.sample({locomotion:motion()},80);
    assert.equal(preparing.ground.mode,'enter');assert.equal(preparing.ground.progress,.5);
    const ready=c.sample({locomotion:motion()},160);
    assert.deepEqual(ready.ground,{mode:'walk',phase:.65,travelCycles:0});
    assert.equal(ready.transition,'');
  });
  test(`${species}: first stance offsets use accepted distance and keep their state through care cancellation`,()=>{
    const c=create(species);c.sample({locomotion:motion()},0);c.sample({locomotion:motion()},160);
    const distance=configs[species].stride*.125;
    const before=c.sample({locomotion:motion(distance)},200);
    assert.equal(before.ground.travelCycles,.125);assert.equal(before.ground.phase,.775);
    const held=c.sample({locomotion:motion(distance)},10000);assert.deepEqual(held.ground,before.ground);
    const props={action:'pet',actionStartedAt:1,locomotion:motion(distance,{moving:false,intentMoving:false})};
    const canceled=c.sample(props,10000);assert.deepEqual(signature(canceled),signature(held));
    const settling=c.sample(props,10001);
    assert.equal(settling.ground.mode,'settle');assert.equal(settling.ground.fromTravelCycles,.125);
  });
  test(`${species}: partial preparation and partial settling preserve the rendered source`,()=>{
    const c=create(species);c.sample({locomotion:motion()},0);
    const partial=c.sample({locomotion:motion()},73);
    const care={action:'feed',actionStartedAt:2,locomotion:motion(0,{moving:false,intentMoving:false})};
    assert.deepEqual(signature(c.sample(care,73)),signature(partial));
    const stop=c.sample(care,100);
    assert.equal(stop.ground.fromEnterProgress,73/160);
    const other={...care,action:'pet',actionStartedAt:3};
    assert.deepEqual(signature(c.sample(other,100)),signature(stop));
    const next=c.sample(other,101);assert.equal(next.ground.fromEnterProgress,73/160);
  });
  test(`${species}: resizing rebases without a first-step replay or an extra size multiplier`,()=>{
    const c=create(species);c.sample({locomotion:motion()},0);c.sample({locomotion:motion()},160);
    const first=c.sample({locomotion:motion(configs[species].stride/4)},200);
    const resized=c.sample({locomotion:motion(1000,{spriteSizeDip:128})},210);
    assert.deepEqual(resized.ground,first.ground);
    const next=c.sample({locomotion:motion(1000+configs[species].stride/8,{spriteSizeDip:128})},220);
    assert.equal(next.ground.travelCycles,.5);
  });
  for(const action of ['idle','pet'])test(`${species}: unread final native travel reaches the painted stop source before ${action}`,()=>{
    const c=create(species);c.sample({locomotion:motion()},0);c.sample({locomotion:motion()},160);
    const stride=configs[species].stride;
    c.sample({locomotion:motion(stride*.25)},200);
    const props={action,actionStartedAt:1,locomotion:motion(stride*.30,{moving:false,intentMoving:false})};
    const first=c.sample(props,220);
    assert.ok(Math.abs(first.ground.phase-.95)<1e-9);
    assert.ok(Math.abs(first.ground.travelCycles-.30)<1e-9);
    const next=c.sample(props,221);
    assert.ok(Math.abs(next.ground.phase-.95)<1e-9);
    assert.ok(Math.abs(next.ground.fromTravelCycles-.30)<1e-9);
  });
  test(`${species}: coalesced old-heading travel cannot skip a stationary requested reversal`,()=>{
    const c=create(species);c.sample({locomotion:motion()},0);c.sample({locomotion:motion()},160);
    const stride=configs[species].stride;
    c.sample({locomotion:motion(stride*.25)},200);
    const requested=motion(stride*.30,{moving:false,intentMoving:true,facing:-1});
    const first=c.sample({locomotion:requested},220);
    assert.equal(first.clip,'turn');assert.equal(first.turning,true);assert.equal(first.turnRemaining,800);
    assert.equal(first.facing,1);assert.ok(Math.abs(first.ground.phase-.95)<1e-9);
    const later=c.sample({locomotion:requested},320);
    assert.equal(later.turning,true);assert.equal(later.turnRemaining,700);assert.equal(later.facing,1);
  });
}
