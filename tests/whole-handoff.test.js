import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholeAnimationController } from '../src/core/whole-animation.js';

function metadata() {
  const clip=(first,count,total,loop=false)=>({frames:Array.from({length:count},(_,i)=>first+i),durations:Array(count).fill(total/count),loop});
  const clips={idle:clip(0,12,6600,true),rest:clip(12,4,5600,true),walk:clip(96,32,1060,true),turn:clip(32,16,800),pet:clip(48,8,2400),feed:clip(56,8,1600,true),groom:clip(64,8,1700),stretch:clip(72,8,2600),hop:clip(80,10,2800)};
  const pairs=[],keys=new Set(),add=(a,b)=>{const key=[a,b].sort((a,b)=>a-b).join(':');if(a!==b&&!keys.has(key)){keys.add(key);pairs.push([a,b]);}};
  for(const track of Object.values(clips)) {for(let i=1;i<track.frames.length;i++)add(track.frames[i-1],track.frames[i]);if(track.loop)add(track.frames.at(-1),track.frames[0]);}
  for(const port of [48,55,56,63,64,71,72,79,80,89,95,...clips.idle.frames])add(0,port);
  for(const pair of [[0,90],[90,91],[91,92],[92,93],[93,12],[90,95],[0,32],[47,128]])add(...pair);
  return {version:5,frames:Array(129).fill({}),neutralFrame:0,stride:96,clips,
    transitions:{walk:{enter:{frames:[95,94],durations:[60,60]},exit:{frames:[94,95],durations:[60,60]}},rest:{enter:{frames:[90,91,92,93],durations:[100,100,100,100]},exit:{frames:[93,92,91,90],durations:[100,100,100,100]}}},
    flow:{version:1,size:32,frameSize:256,encoding:'signed-one-pixel-rgba',pairs,asset:'fixture.bin'},
    handoffs:{version:1,neutralFrame:0,mirroredNeutralFrame:128,edgeDuration:180,settleDuration:420}};
}
const create=extra=>createWholeAnimationController({species:'cat',meta:metadata(),random:()=>1,...extra});
const move=(distance=0,extra={})=>({epoch:1,distanceDip:distance,spriteSizeDip:256,facing:1,moving:false,...extra});
const sample=(c,now,props={},motion={})=>c.sample({...props,locomotion:move(0,motion)},now);
const visible=p=>({frame:p.frame,nextFrame:p.nextFrame,mix:p.mix,facing:p.facing,ground:p.ground});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≈ ${b}`);
function petMid(c) {sample(c,0);const props={action:'pet',actionStartedAt:1};sample(c,100,props);sample(c,280,props);return {props,pose:sample(c,430,props)};}

for(const request of [{action:'feed',actionStartedAt:2},{action:'pet',actionStartedAt:2},{}]) test(`v5 same-clock ${request.action??'idle'} switch retains the exact mixed source pose`,()=>{
  const c=create(),{pose}=petMid(c);assert.ok(pose.mix>0&&pose.mix<1);
  const switched=sample(c,430,request);assert.deepEqual(visible(switched),visible(pose));assert.ok(switched.transition);assert.equal(switched.clip,request.action??'idle');
});

test('a newer intent replaces an unfinished route from its currently painted interval',()=>{
  const c=create();petMid(c);sample(c,430,{action:'feed',actionStartedAt:2});const midway=sample(c,475,{action:'feed',actionStartedAt:2});
  const rest={action:'rest',actionStartedAt:3};assert.deepEqual(visible(sample(c,475,rest)),visible(midway));
  for(let now=500;now<=1400;now+=25)assert.equal(sample(c,now,rest).clip,'rest');
});

for(const action of ['idle','rest']) test(`telemetry epoch rebase preserves partial sleep ${action==='rest'?'repeat':'cancellation'}`,()=>{
  const c=create(),rest={action:'rest',actionStartedAt:1};sample(c,0);sample(c,100,rest);const before=sample(c,530,rest);assert.ok(before.mix>0&&before.mix<1);
  const request=action==='rest'?{...rest,actionStartedAt:2}:{};
  const after=sample(c,530,request,{epoch:2});assert.deepEqual(visible(after),visible(before));near(after.phase,before.phase);
});

for(const mode of ['paused','reducedMotion','dragging','ambient']) test(`${mode} freezes handoff progress and pixels without advancing on resume`,()=>{
  const c=create(),{props}=petMid(c);sample(c,430,{action:'feed',actionStartedAt:2});const request={action:'feed',actionStartedAt:2};const before=sample(c,475,request);assert.ok(before.transition);
  const frozenProps={...request,...(mode==='ambient'?{ambient:false}:mode==='dragging'?{}:{[mode]:true})};
  const frozenMotion=mode==='dragging'?{dragging:true}:{};
  for(const now of [600,5000]) {const held=sample(c,now,frozenProps,frozenMotion);assert.deepEqual(visible(held),visible(before));near(held.transitionRemaining,before.transitionRemaining);}
  const resumed=sample(c,5000,request);assert.deepEqual(visible(resumed),visible(before));near(resumed.transitionRemaining,before.transitionRemaining);
  assert.notDeepEqual(visible(sample(c,5025,request)),visible(before));
});

test('ground walk uses source0 with a phase advanced only by accepted displacement',()=>{
  const c=create();sample(c,0,{}, {moving:true});const walking=sample(c,100,{}, {moving:true,distanceDip:24});
  assert.equal(walking.frame,0);assert.deepEqual(walking.ground,{mode:'walk',phase:.25});near(walking.phase,.25);
  const stationary=sample(c,5000,{}, {moving:true,distanceDip:24});assert.deepEqual(visible(stationary),visible(walking));
  const rebase=sample(c,5001,{}, {moving:true,distanceDip:10000,epoch:2});near(rebase.phase,.25);
  near(sample(c,5010,{}, {moving:true,distanceDip:10006,epoch:2}).phase,.3125);
});

test('walking to care collects the existing feet before the neutral-to-care edge',()=>{
  const c=create();sample(c,0,{}, {moving:true});const before=sample(c,100,{}, {moving:true,distanceDip:24});const care={action:'pet',actionStartedAt:1};
  assert.deepEqual(visible(sample(c,100,care,{distanceDip:24})),visible(before));
  const settling=sample(c,310,care,{distanceDip:24});assert.deepEqual(settling.ground,{mode:'settle',phase:.25,progress:.5});near(settling.phase,.25);
  const joined=sample(c,520,care,{distanceDip:24});assert.equal(joined.frame,0);assert.equal(joined.nextFrame,48);near(joined.mix,0);assert.equal(joined.ground,undefined);
  const middle=sample(c,610,care,{distanceDip:24});assert.equal(middle.frame,0);assert.equal(middle.nextFrame,48);near(middle.mix,.5);
  const started=sample(c,700,care,{distanceDip:24});assert.equal(started.frame,48);near(started.mix,0);near(started.phase,.25);
  const careMotion=sample(c,850,care,{distanceDip:24});assert.equal(careMotion.frame,48);near(careMotion.mix,.5);
});

test('walking to idle settles for420ms without fabricating a gait delta',()=>{
  const c=create();sample(c,0,{}, {moving:true});const before=sample(c,100,{}, {moving:true,distanceDip:24});
  assert.deepEqual(visible(sample(c,100,{}, {distanceDip:24})),visible(before));
  const halfway=sample(c,310,{}, {distanceDip:24});assert.deepEqual(halfway.ground,{mode:'settle',phase:.25,progress:.5});near(halfway.phase,.25);
  const idle=sample(c,520,{}, {distanceDip:24});assert.equal(idle.frame,0);assert.equal(idle.ground,undefined);near(idle.phase,.25);
});

test('replacing a partial foot settle retains its exact current target and finishes collecting',()=>{
  const c=create();sample(c,0,{}, {moving:true});sample(c,100,{}, {moving:true,distanceDip:24});sample(c,100,{}, {distanceDip:24});const halfway=sample(c,310,{}, {distanceDip:24});
  const care={action:'feed',actionStartedAt:2};assert.deepEqual(visible(sample(c,310,care,{distanceDip:24})),visible(halfway));
  const later=sample(c,415,care,{distanceDip:24});near(later.ground.progress,.75);near(later.phase,.25);
});

test('an interrupted airborne hop travels forward to landing89 before the next action',()=>{
  const c=create(),hop={action:'trick',actionStartedAt:1};sample(c,0);sample(c,100,hop);sample(c,280,hop);const airborne=sample(c,700,hop);assert.ok(airborne.frame>80&&airborne.frame<89);
  const care={action:'pet',actionStartedAt:2};assert.deepEqual(visible(sample(c,700,care)),visible(airborne));
  const seen=[];for(let now=701;now<=1500;now+=10){const p=sample(c,now,care);seen.push(p.frame);if(p.nextFrame!==undefined)seen.push(p.nextFrame);}
  const landed=seen.indexOf(89),hub=seen.indexOf(0);assert.ok(landed>=0&&hub>landed);assert.equal(seen.slice(0,landed).includes(80),false);
});

test('long whole-pose routes preserve every edge and stay within the800ms native lead-in',()=>{
  const c=create(),hop={action:'trick',actionStartedAt:1};sample(c,0);sample(c,100,hop);sample(c,280,hop);const before=sample(c,400,hop);
  const requested={action:'stretch',actionStartedAt:2},started=sample(c,400,requested);assert.deepEqual(visible(started),visible(before));assert.ok(started.transitionRemaining<=800);assert.ok(started.transitionRemaining>0);
  const ended=sample(c,1200,requested);assert.equal(ended.transition,'');assert.equal(ended.frame,72);near(ended.mix,0);
});

test('v5 turn keeps the native800ms hold even when entry cannot afford a full handoff',()=>{
  const c=create();sample(c,0);const began=sample(c,100,{}, {facing:-1});assert.equal(began.turnRemaining,800);
  assert.equal(sample(c,899,{}, {facing:-1}).turning,true);const ended=sample(c,900,{}, {facing:-1});assert.equal(ended.turning,false);assert.equal(ended.turnRemaining,0);
});

test('a sparse sample crossing route completion advances only the care time after the lead-in',()=>{
  const c=create(),care={action:'pet',actionStartedAt:1};sample(c,0);sample(c,100,care);
  const after=sample(c,430,care);assert.equal(after.transition,'');assert.equal(after.frame,48);near(after.mix,.5);
});

test('a newly routed care starts its authored clock after the route despite stale actionElapsed',()=>{
  const c=create(),care={action:'pet',actionStartedAt:1,actionElapsed:300};sample(c,0);sample(c,100,care);
  const started=sample(c,280,care);assert.equal(started.frame,48);near(started.mix,0);
});

test('walking enters its contact targets from the exact neutral source over160ms',()=>{
  const c=create();const idle=sample(c,0);assert.deepEqual(visible(sample(c,100,{}, {moving:true})),visible(idle));
  const entered=sample(c,180,{}, {moving:true,distanceDip:12});assert.deepEqual(entered.ground,{mode:'enter',phase:.125,progress:.5});
  const walked=sample(c,260,{}, {moving:true,distanceDip:24});assert.deepEqual(walked.ground,{mode:'walk',phase:.25});
});

test('interrupting a partial contact entry carries its eased source weight into settling',()=>{
  const c=create();sample(c,0);sample(c,100,{}, {moving:true});const entry=sample(c,180,{}, {moving:true,distanceDip:12});
  const care={action:'feed',actionStartedAt:2};assert.deepEqual(visible(sample(c,180,care,{distanceDip:12})),visible(entry));
  const settle=sample(c,285,care,{distanceDip:12});assert.equal(settle.ground.mode,'settle');near(settle.ground.phase,.125);near(settle.ground.progress,.25);near(settle.ground.fromWeight,.5);
});

test('accepted travel during care-to-walk routing is retained without any time-based phase advance',()=>{
  const c=create();petMid(c);sample(c,430,{}, {moving:true,distanceDip:6});near(sample(c,450,{}, {moving:true,distanceDip:12}).phase,.125);
  near(sample(c,600,{}, {moving:true,distanceDip:24}).phase,.25);near(sample(c,650,{}, {moving:true,distanceDip:24}).phase,.25);
});

test('a normal turn joins its mirrored neutral inside the original800ms stationary hold',()=>{
  const c=create();sample(c,0);sample(c,100,{}, {facing:-1});
  const join=sample(c,840,{}, {facing:-1});assert.equal(join.frame,47);assert.equal(join.nextFrame,128);near(join.mix,.5);assert.equal(join.facing,1);assert.equal(join.turnRemaining,60);assert.equal(join.turning,true);
  const idle=sample(c,900,{}, {facing:-1});assert.equal(idle.frame,0);assert.equal(idle.facing,-1);assert.equal(idle.turning,false);assert.equal(idle.transition,'');
});

test('normal idle-to-turn entry preserves its source before traversing the actual0-to32 field',()=>{
  const c=create(),before=sample(c,0);const first=sample(c,100,{}, {facing:-1});assert.deepEqual(visible(first),visible(before));assert.equal(first.handoffUnsupported,false);
  const entry=sample(c,160,{}, {facing:-1});assert.equal(entry.frame,0);assert.equal(entry.nextFrame,32);near(entry.mix,.5);assert.equal(entry.turnRemaining,740);
});

test('a normal turn traverses genuine middle-angle entry and exit sources within the same800ms hold',()=>{
  const meta=metadata();meta.frames.push({},{});
  meta.flow.pairs=meta.flow.pairs.filter(([a,b])=>!([a,b].includes(0)&&[a,b].includes(32))&&!([a,b].includes(47)&&[a,b].includes(128)));
  meta.flow.pairs.push([0,130],[130,32],[47,129],[129,128]);
  const c=create({meta});sample(c,0);sample(c,100,{}, {facing:-1});
  for(const [at,a,b,mix] of [[140,0,130,.5],[220,130,32,.5],[780,47,129,.5],[860,129,128,.5]]) {
    const pose=sample(c,at,{}, {facing:-1});
    assert.equal(pose.frame,a);assert.equal(pose.nextFrame,b);near(pose.mix,mix);
    assert.equal(pose.facing,1);assert.equal(pose.handoffUnsupported,false);
    assert.equal(pose.turning,true);near(pose.turnRemaining,900-at);
  }
  const end=sample(c,900,{}, {facing:-1});
  assert.equal(end.frame,0);assert.equal(end.facing,-1);assert.equal(end.turning,false);
});

test('interrupting a real middle-angle turn exit preserves its exact painted source',()=>{
  const meta=metadata();meta.frames.push({});
  meta.flow.pairs=meta.flow.pairs.filter(([a,b])=>!([a,b].includes(47)&&[a,b].includes(128)));
  meta.flow.pairs.push([47,129],[129,128]);
  const c=create({meta});sample(c,0);sample(c,100,{}, {facing:-1});
  const before=sample(c,850,{}, {facing:-1});
  assert.equal(before.frame,129);assert.equal(before.nextFrame,128);assert.ok(before.mix>0&&before.mix<1);
  const after=sample(c,850,{action:'pet',actionStartedAt:1},{facing:-1});
  assert.deepEqual(visible(after),visible(before));
});

test('a requested reversal after care joins its actual source before the authored turn',()=>{
  const c=create(),{pose}=petMid(c);
  const first=sample(c,430,{}, {facing:-1});
  assert.deepEqual(visible(first),visible(pose));
  assert.equal(first.handoffUnsupported,false);assert.equal(first.turnRemaining,800);
  const collected=sample(c,751,{}, {facing:-1});
  assert.equal(collected.frame,32);assert.equal(collected.turning,true);
  const ended=sample(c,1230,{}, {facing:-1});
  assert.equal(ended.frame,0);assert.equal(ended.facing,-1);assert.equal(ended.turning,false);
});

test('care during a partial turn resumes through measured sources without a one-frame jump',()=>{
  const c=create();sample(c,0);sample(c,100,{}, {facing:-1});sample(c,400,{}, {facing:-1});
  const care={action:'pet',actionStartedAt:1};sample(c,400,care,{facing:-1});
  const before=sample(c,1200,care,{facing:-1});
  const resumed=sample(c,1200,{}, {facing:-1});
  assert.deepEqual(visible(resumed),visible(before));assert.equal(resumed.turnRemaining,500);
  assert.equal(resumed.handoffUnsupported,false);assert.equal(resumed.transitionRemaining,500);
  const next=sample(c,1210,{}, {facing:-1});
  assert.equal(next.transition,'handoff.turn');assert.equal(next.turning,true);
  assert.notDeepEqual(visible(next),visible(before));
  for(let at=1220;at<1700;at+=10)assert.equal(sample(c,at,{}, {facing:-1}).handoffUnsupported,false);
  const ended=sample(c,1710,{}, {facing:-1});
  assert.equal(ended.turning,false);assert.equal(ended.facing,-1);
});

test('normal moving turn fits foot collection, all sixteen authored poses and the tail inside800ms',()=>{
  const c=create();sample(c,0,{}, {moving:true});const before=sample(c,100,{}, {moving:true,distanceDip:24});assert.deepEqual(visible(sample(c,100,{}, {facing:-1,distanceDip:24})),visible(before));
  const collecting=sample(c,156,{}, {facing:-1,distanceDip:24});assert.ok(collecting.ground,'normal moving turn retains its current whole-paw collection');assert.equal(collecting.ground.mode,'settle');near(collecting.ground.progress,.5);near(collecting.phase,.25);
  const frames=[];for(let i=0;i<16;i++){const pose=sample(c,261+i*32.5,{}, {facing:-1,distanceDip:24});frames.push(pose.frame);assert.equal(pose.turning,true);near(pose.phase,.25);}
  assert.deepEqual(frames,Array.from({length:16},(_,i)=>32+i));
  const tail=sample(c,840,{}, {facing:-1,distanceDip:24});assert.equal(tail.frame,47);assert.equal(tail.nextFrame,128);near(tail.mix,.5);
  const done=sample(c,900,{}, {facing:-1,distanceDip:24});assert.equal(done.turning,false);assert.equal(done.frame,0);assert.equal(done.facing,-1);near(done.phase,.25);
});

test('repeating a partial sleep entry continues toward curled rest without standing at hub0 again',()=>{
  const c=create(),rest={action:'rest',actionStartedAt:1};sample(c,0);sample(c,100,rest);const before=sample(c,530,rest);
  const repeated={...rest,actionStartedAt:2};assert.deepEqual(visible(sample(c,530,repeated,{epoch:2})),visible(before));
  const seen=[];for(let now=531;now<=1330;now+=10){const pose=sample(c,now,repeated,{epoch:2});seen.push(pose.frame,pose.nextFrame);}
  assert.equal(seen.includes(0),false);assert.equal(seen.includes(90),false);assert.ok(seen.includes(12));
});

test('a stationary movement preparation keeps its walk intent and advances the visual join without travel',()=>{
  const c=create(),care={action:'pet',actionStartedAt:1};sample(c,0);sample(c,100,care);const before=sample(c,280,care);
  const preparing={intentMoving:true,moving:false,prepareEpoch:2};
  const first=sample(c,280,{},preparing);assert.deepEqual(visible(first),visible(before));assert.equal(first.clip,'walk');
  for(const now of [330,460,540,620,1200]) {
    const pose=sample(c,now,{},preparing);assert.equal(pose.clip,'walk');near(pose.phase,0);
    if(now===540)assert.deepEqual(pose.ground,{mode:'enter',phase:0,progress:.5});
    if(now>=620)assert.deepEqual(pose.ground,{mode:'walk',phase:0});
  }
  const moved=sample(c,1300,{}, {...preparing,moving:true,distanceDip:6});near(moved.phase,.0625);
});

test('an explicit stopped movement intent overrides stale actual movement telemetry',()=>{
  const c=create();const pose=sample(c,0,{}, {intentMoving:false,moving:true});assert.equal(pose.clip,'idle');assert.equal(pose.ground,undefined);
});

test('an interrupted contact entry preserves per-foot entry progress through repeated settling',()=>{
  const c=create();sample(c,0);sample(c,100,{}, {moving:true});const entry=sample(c,164,{}, {moving:true,distanceDip:12});near(entry.ground.progress,.4);
  const care={action:'feed',actionStartedAt:2};assert.deepEqual(visible(sample(c,164,care,{distanceDip:12})),visible(entry));
  const settling=sample(c,248,care,{distanceDip:12});assert.equal(settling.ground.mode,'settle');near(settling.ground.fromEnterProgress,.4);near(settling.ground.progress,.2);
  const replacement={action:'pet',actionStartedAt:3};assert.deepEqual(visible(sample(c,248,replacement,{distanceDip:12})),visible(settling));
  const later=sample(c,332,replacement,{distanceDip:12});near(later.ground.fromEnterProgress,.4);near(later.ground.progress,.4);near(later.phase,.125);
});
