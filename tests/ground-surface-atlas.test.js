import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateWholeAtlas} from '../src/rendering/whole-renderer.js';

function candidate(species) {
  const meta=JSON.parse(fs.readFileSync(new URL(`../public/pets/${species}-whole-v5.json`,import.meta.url)));
  meta.version=6;
  meta.groundGait=JSON.parse(fs.readFileSync(new URL(`../public/pets/${species}-ground-v2.json`,import.meta.url)));
  meta.frames.push(structuredClone(meta.frames[0]));
  meta.pages.push({asset:`pets/${species}-ground-v2-neutral.png`,sourceSize:[256,256],columns:1,rows:1});
  meta.frames[0]={page:3,rect:[0,0,256,256],offsetX:0,offsetY:0};
  meta.frames[128]={...meta.frames[0],mirror:-1};
  return meta;
}
const images=meta=>meta.pages.map(p=>({naturalWidth:p.sourceSize[0],naturalHeight:p.sourceSize[1]}));

for(const species of ['cat','dog'])test(`${species}: v6 independently decoded neutral page and four-legged source binding validate together`,()=>{
  const meta=candidate(species);
  assert.equal(validateWholeAtlas(images(meta),meta),true);
  for(const mutate of [m=>m.pages.pop(),m=>m.pages[3].columns=8,
    m=>m.groundGait.neutralPose.legs.pop(),m=>m.groundGait.sourceSize=[12,12],
    m=>m.frames[0].page=0,m=>m.frames[128].mirror=1]) {
    const broken=structuredClone(meta);mutate(broken);
    assert.throws(()=>validateWholeAtlas(images(broken),broken));
  }
});

test('v6 real intermediate poses can occupy separate decoded pages without changing the original 130 sources',()=>{
  const meta=candidate('dog');
  meta.extraFrameCount=3;
  meta.pages.push({asset:'pets/dog-rise-low.png',sourceSize:[1024,1024],columns:1,rows:1,scale:.8});
  meta.pages.push({asset:'pets/dog-turn-middles.png',sourceSize:[2048,1024],columns:2,rows:1});
  meta.frames.push({page:4,rect:[40,40,900,940]},
    {page:5,rect:[20,20,980,980]},{page:5,rect:[1044,20,980,980]});
  meta.groundRise={frames:[90,130,0],pairDuration:100};
  meta.flow.pairs.push([90,130],[130,0]);
  assert.equal(validateWholeAtlas(images(meta),meta),true);
  for(const mutate of [m=>delete m.extraFrameCount,m=>m.extraFrameCount=2,
    m=>m.frames[130].page=3,m=>m.pages[4].columns=0,
    m=>m.pages.push({asset:'unused.png',sourceSize:[256,256],columns:1,rows:1}),
    m=>m.groundRise.frames=[90,130,130,0],m=>m.groundRise.frames=[90,132,0],
    m=>m.groundRise.pairDuration=Infinity]) {
    const broken=structuredClone(meta);mutate(broken);
    assert.throws(()=>validateWholeAtlas(images(broken),broken));
  }
});
