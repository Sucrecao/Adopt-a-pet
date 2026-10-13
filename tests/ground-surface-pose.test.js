import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const module = await import('../src/core/ground-surface-pose.js').catch(() => ({}));
const configs = Object.fromEntries(['cat','dog'].map(species => [species,
  JSON.parse(fs.readFileSync(new URL(`../public/pets/${species}-ground-v2.json`,import.meta.url)))]));
const create = config => {
  assert.equal(typeof module.createGroundPoseModel,'function','accepted surface gait has a reusable pure pose model');
  return module.createGroundPoseModel(config);
};
const near = (a,b,tolerance=1e-8) => assert.ok(Math.abs(a-b)<tolerance,`${a} ≈ ${b}`);

for(const [species,config] of Object.entries(configs)) {
  test(`${species}: four fixed limb lengths and complete soles remain reachable through a full cycle`, () => {
    const model=create(config);
    for(let i=0;i<1024;i++) {
      const pose=model.walk(i/1024);
      assert.equal(pose.legs.length,4);
      assert.ok(pose.legs.filter(l=>l.planted).length>=2);
      for(const leg of pose.legs) {
        near(Math.hypot(leg.knee[0]-leg.hip[0],leg.knee[1]-leg.hip[1]),leg.lengths[0]);
        near(Math.hypot(leg.ankle[0]-leg.knee[0],leg.ankle[1]-leg.knee[1]),leg.lengths[1]);
        assert.ok([...leg.hip,...leg.knee,...leg.ankle,...leg.foot,...leg.contact].every(Number.isFinite));
      }
    }
  });
  test(`${species}: flat supporting paw cancels accepted world distance in both directions`, () => {
    const model=create(config);
    for(const facing of [-1,1])for(const leg of config.neutralPose.legs) {
      const phases=[.2,.3,.4].map(local=>((local-leg.phaseOffset)%1+1)%1);
      const unwrapped=phases.map(p=>p<phases[0]?p+1:p);
      const positions=phases.map((p,i)=>{
        const foot=model.walk(p).legs.find(l=>l.id===leg.id).foot;
        return facing*(foot[0]+unwrapped[i]*config.stride);
      });
      positions.slice(1).forEach(x=>near(x,positions[0]));
    }
  });
  test(`${species}: cycle boundaries and neutral are stable without a clock`, () => {
    const model=create(config);
    assert.deepEqual(model.walk(.3125),model.walk(.3125));
    const first=model.walk(0),next=model.walk(1);
    for(let i=0;i<4;i++)for(const field of ['hip','knee','ankle','foot','contact'])
      first.legs[i][field].forEach((v,j)=>near(v,next.legs[i][field][j]));
    assert.deepEqual(model.neutral,config.neutralPose);
  });
  test(`${species}: every sampled stop keeps support and finishes at the exact decoded neutral bind`, () => {
    const model=create(config);
    for(let phaseIndex=0;phaseIndex<64;phaseIndex++) {
      const start=model.walk(phaseIndex/64);
      assert.deepEqual(model.settle(start,0),start);
      assert.deepEqual(model.settle(start,1),model.neutral);
      for(let i=0;i<=32;i++) assert.ok(model.settle(start,i/32).legs.filter(l=>l.planted).length>=2);
    }
  });
}

test('invalid source bounds, duplicate legs, nonfinite values and unreachable neutral fail before rendering',()=>{
  for(const mutate of [c=>c.neutralPose.legs[0].source.rect[0]=-1,
    c=>c.neutralPose.legs[1].id=c.neutralPose.legs[0].id,
    c=>c.stride=Infinity,c=>c.neutralPose.legs[0].contact[0]=NaN,
    c=>c.neutralPose.legs[0].lengths[0]=0]) {
    const config=structuredClone(configs.cat); mutate(config);
    assert.throws(()=>create(config),TypeError);
  }
});
