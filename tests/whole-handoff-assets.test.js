import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWholeAnimationController } from '../src/core/whole-animation.js';

const metadata=species=>readFile(new URL(`../public/pets/${species}-whole-v5.json`,import.meta.url),'utf8').then(JSON.parse);
const locomotion={epoch:1,distanceDip:0,spriteSizeDip:256,facing:1,moving:false};
const signature=pose=>[pose.frame,pose.nextFrame,pose.mix,pose.facing,pose.ground];

test('the actual dog sleep and wake graph never visits its old standing93 pose',async()=>{
  const meta=await metadata('dog'),c=createWholeAnimationController({species:'dog',meta,random:()=>1}),rest={action:'rest',actionStartedAt:1,locomotion};
  c.sample({locomotion},0);c.sample(rest,100);const enter=[];
  for(let now=101;now<=1000;now+=10){const pose=c.sample(rest,now);enter.push(pose.frame,pose.nextFrame);}
  assert.ok(enter.includes(90)&&enter.includes(91)&&enter.includes(92)&&enter.includes(12));assert.equal(enter.includes(93),false);
  const before=c.sample(rest,1200),first=c.sample({locomotion:{...locomotion,epoch:2}},1200);assert.deepEqual(signature(first),signature(before));
  const exit=[];for(let now=1201;now<=2000;now+=10){const pose=c.sample({locomotion:{...locomotion,epoch:2}},now);exit.push(pose.frame,pose.nextFrame);}
  assert.ok(exit.includes(92)&&exit.includes(91)&&exit.includes(90)&&exit.includes(0));assert.equal(exit.includes(93),false);
});

for(const species of ['cat','dog','parrot'])test(`${species} actual care graph preserves every mixed source and caps each native lead-in`,async()=>{
  const meta=await metadata(species),targets=['idle','pet','feed','groom','stretch','trick','rest'];
  for(const [clip,track] of Object.entries(meta.clips)) {
    if(['walk','turn'].includes(clip))continue;
    let elapsed=0;
    for(let index=0;index<track.frames.length;index++) {
      const midpoint=elapsed+track.durations[index]/2;elapsed+=track.durations[index];
      for(const target of targets) {
        const c=createWholeAnimationController({species,meta,random:()=>1});
        const before=c.sample({action:clip==='hop'?'trick':clip,actionStartedAt:1,actionElapsed:midpoint,locomotion},0);
        const after=c.sample({action:target,actionStartedAt:2,locomotion:{...locomotion,epoch:2}},0);
        assert.deepEqual(signature(after),signature(before),`${clip}[${index}]→${target}`);
        assert.equal(after.handoffUnsupported,false,`${clip}[${index}]→${target} has a declared route`);
        assert.ok(after.transitionRemaining<=800,`${clip}[${index}]→${target} fits the native lead-in`);
      }
    }
  }
});

test('every actual bird flight pose recovers forward through127 and the landing ports within800ms',async()=>{
  const meta=await metadata('parrot'),flight=meta.clips.walk.frames;
  for(const frame of flight.slice(1,-1)) {
    const c=createWholeAnimationController({species:'parrot',meta,random:()=>1});
    c.sample({locomotion:{...locomotion,moving:true}},0);
    const distanceDip=(flight.indexOf(frame)+.25)/flight.length*meta.stride;
    const before=c.sample({locomotion:{...locomotion,moving:true,distanceDip}},100);assert.equal(before.frame,frame);
    const care={action:'pet',actionStartedAt:2,locomotion:{...locomotion,distanceDip}};
    const first=c.sample(care,100);assert.deepEqual(signature(first),signature(before));assert.equal(first.handoffUnsupported,false,`flight${frame} has a forward recovery`);assert.ok(first.transitionRemaining<=800);
    const seen=[];for(let now=101;now<=900;now++) {const pose=c.sample(care,now);for(const index of [pose.frame,pose.nextFrame])if(seen.at(-1)!==index)seen.push(index);}
    const landed=seen.indexOf(127),hover=seen.indexOf(94),perch=seen.indexOf(95),hub=seen.indexOf(0);
    assert.ok(landed>=0&&hover>landed&&perch>hover&&hub>perch,`flight${frame} reaches127→94→95→0`);
    const recovered=new Set(seen.slice(0,landed+1).filter(index=>flight.includes(index)));
    assert.deepEqual([...recovered],flight.slice(flight.indexOf(frame)),`flight${frame} preserves every remaining forward authored pose`);
    const done=c.sample(care,900);assert.equal(done.transition,'');assert.equal(done.frame,48);assert.ok(Math.abs(done.mix-(800-first.transitionRemaining)/meta.clips.pet.durations[0])<1e-9);assert.equal(done.phase,before.phase);
  }
});
