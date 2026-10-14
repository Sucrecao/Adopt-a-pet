import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../src/rendering/line-pages.js').catch(()=>({}));
const meta={pages:Array.from({length:6},(_,i)=>({asset:`${i}.png`,sourceSize:[128,128]})),frames:Array.from({length:6},(_,i)=>({page:i}))};
test('line pages deduplicate in-flight requests and verify actual decoded dimensions',async()=>{
  assert.equal(typeof module.createLinePageCache,'function');let loads=0,closed=0;
  const cache=module.createLinePageCache({meta,loadImage:async()=>{loads++;return {width:128,height:128,close(){closed++;}};},maxBytes:128*128*4*2});
  const [a,b]=await Promise.all([cache.load(0),cache.load(0)]);assert.equal(a,b);assert.equal(loads,1);assert.equal(cache.get(0),a);
  cache.dispose();assert.equal(closed,1);assert.equal(cache.get(0),undefined);
});
test('page budget releases old bitmaps while retaining pinned live whole-frame sources',async()=>{
  assert.equal(typeof module.createLinePageCache,'function');const closed=[];
  const cache=module.createLinePageCache({meta,maxBytes:128*128*4*2,loadImage:async(asset)=>({width:128,height:128,close(){closed.push(asset);}})});
  cache.pinFrames([0]);await cache.load(0);await cache.load(1);await cache.load(2);
  assert.ok(cache.get(0));assert.equal(cache.get(1),undefined);assert.ok(cache.get(2));assert.deepEqual(closed,['1.png']);
  assert.equal(cache.stats().bytes,128*128*4*2);cache.dispose();
});
test('incorrect source dimensions fail without publishing a drawable page',async()=>{
  assert.equal(typeof module.createLinePageCache,'function');let closed=0;
  const cache=module.createLinePageCache({meta,loadImage:async()=>({width:127,height:128,close(){closed++;}})});
  await assert.rejects(cache.load(0),/dimension/i);assert.equal(cache.get(0),undefined);assert.equal(closed,1);
});
test('disposing while decoding closes late images and never invokes a ready callback',async()=>{
  assert.equal(typeof module.createLinePageCache,'function');let finish,ready=0,closed=0;
  const cache=module.createLinePageCache({meta,loadImage:()=>new Promise(resolve=>{finish=resolve;}),onReady:()=>ready++});
  const pending=cache.load(0);await Promise.resolve();cache.dispose();finish({width:128,height:128,close(){closed++;}});
  await assert.rejects(pending,/disposed/i);assert.equal(ready,0);assert.equal(closed,1);
});
