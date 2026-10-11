import test from 'node:test';
import assert from 'node:assert/strict';
import { createRigController } from '../src/core/rig-motion.js';

function attachment(pose, leg) {
  const root = leg.kind === 'fore' ? pose.geometry.foreHip : pose.geometry.hindHip;
  const x = 128 + pose.orientation * (root.x + (leg.side === 'far' ? 4 : 0) - 128);
  const y = root.y;
  const {pivot,angle,x:dx,y:dy}=pose.body;
  return {x:pivot.x+(x-pivot.x)*Math.cos(angle)-(y-pivot.y)*Math.sin(angle)+dx,
    y:pivot.y+(x-pivot.x)*Math.sin(angle)+(y-pivot.y)*Math.cos(angle)+dy};
}

function assertAttached(pose) {
  for (const leg of pose.legs) {
    const expected=attachment(pose,leg);
    assert.ok(Math.hypot(leg.hip.x-expected.x,leg.hip.y-expected.y)<1e-7,
      `${pose.clip} facing=${pose.facing} orientation=${pose.orientation} ${leg.id} root detached: ${JSON.stringify({actual:leg.hip,expected})}`);
  }
}

test('cat standing paws sit below shoulder and rear haunch rather than a frozen gait phase', () => {
  for(const facing of [1,-1]) {
    const pose=createRigController({species:'cat',random:()=>0}).sample({locomotion:{facing,moving:false,epoch:1,distanceDip:0,spriteSizeDip:256}},0);
    for(const leg of pose.legs) {
      const canonical=128+facing*(leg.foot.x-128);
      const root=leg.kind==='fore'?pose.geometry.foreHip:pose.geometry.hindHip;
      const offset=canonical-root.x;
      assert.ok(offset>=0&&offset<=12,`${leg.id} neutral paw is ${offset}px from its anatomical root`);
      assert.equal(leg.planted,true);
    }
  }
});

test('cat leg roots share the rendered body rotation and reflection during every care pose', () => {
  for(const facing of [1,-1]) for(const action of ['pet','feed','groom','stretch','trick']) {
    const c=createRigController({species:'cat',random:()=>0});
    for(let now=0;now<=3200;now+=20) assertAttached(c.sample({action,actionStartedAt:1,locomotion:{facing,moving:false,epoch:1,distanceDip:0,spriteSizeDip:256}},now));
  }
});

test('cat roots turn with the torso while paws retain their separate stepping schedule', () => {
  for(const facing of [1,-1]) {
    const c=createRigController({species:'cat',random:()=>0});
    const locomotion={facing,moving:false,epoch:1,distanceDip:0,spriteSizeDip:256};
    c.sample({locomotion},0);locomotion.facing=-facing;
    c.sample({locomotion},0);
    for(let now=8;now<=800;now+=8) {
      const pose=c.sample({locomotion},now);assertAttached(pose);
      for(const leg of pose.legs) assert.ok(Math.hypot(leg.ankle.x-leg.hip.x,leg.ankle.y-leg.hip.y)<=leg.upperLength+leg.lowerLength+1e-5,`${leg.id} step exceeds reach at ${now}ms`);
    }
  }
});

test('cat gently replants into its standing stance after travel stops', () => {
  for(const facing of [1,-1])for(const distance of [8,23,41,59]) {
    const c=createRigController({species:'cat',random:()=>0});
    const locomotion={facing,moving:true,epoch:1,distanceDip:0,spriteSizeDip:256};
    c.sample({locomotion},0);locomotion.distanceDip=distance;
    const before=c.sample({locomotion},160);locomotion.moving=false;
    const first=c.sample({locomotion},160);
    for(let i=0;i<4;i++)assert.deepEqual(first.legs[i].foot,before.legs[i].foot,'stopping starts from the actual sole');
    const supports=new Map();let previous=first,end;
    for(let now=176;now<=1168;now+=16) {
      end=c.sample({locomotion},now);
      for(const leg of end.legs) {
        assert.ok(Math.hypot(leg.foot.x-previous.legs.find(v=>v.id===leg.id).foot.x,leg.foot.y-previous.legs.find(v=>v.id===leg.id).foot.y)<9,'replant stays continuous');
        if(leg.planted){if(supports.has(leg.supportGeneration))assert.deepEqual(leg.foot,supports.get(leg.supportGeneration));else supports.set(leg.supportGeneration,leg.foot);}
      }
      previous=end;
    }
    for(const leg of end.legs) {
      const root=leg.kind==='fore'?end.geometry.foreHip:end.geometry.hindHip;
      const offset=128+facing*(leg.foot.x-128)-root.x;
      assert.ok(offset>=0&&offset<=12,`${leg.id} failed to settle under its root`);
      assert.equal(leg.planted,true);
    }
  }
});

test('care after walking lets stopped paws settle instead of suspending the gait pose', () => {
  for(const action of ['pet','feed','groom','stretch','trick']) {
    const c=createRigController({species:'cat',random:()=>0});
    const locomotion={facing:1,moving:true,epoch:1,distanceDip:0,spriteSizeDip:256};
    for(let now=0;now<=800;now+=16){locomotion.distanceDip=now*.05;c.sample({locomotion},now);}
    locomotion.moving=false;let end;
    for(let elapsed=0;elapsed<=2400;elapsed+=16)end=c.sample({locomotion,action,actionStartedAt:1},800+elapsed);
    for(const leg of end.legs){assert.equal(leg.foot.y,226,`${action} ${leg.id} cannot remain suspended`);assert.equal(leg.planted,true);}
  }
});

test('travel resumed halfway through standing replant starts from each current sole', () => {
  for(const facing of [1,-1])for(const stopTime of [32,160,256,416]) {
    const c=createRigController({species:'cat',random:()=>0});
    const locomotion={facing,moving:true,epoch:1,distanceDip:0,spriteSizeDip:256};
    for(let now=0;now<=800;now+=16){locomotion.distanceDip=now*.01;c.sample({locomotion},now);}
    locomotion.moving=false;let previous;
    for(let elapsed=0;elapsed<=stopTime;elapsed+=16)previous=c.sample({locomotion},800+elapsed);
    locomotion.moving=true;
    for(let dt=16;dt<=400;dt+=16) {
      locomotion.distanceDip+=.8;const pose=c.sample({locomotion},800+stopTime+dt);
      for(const leg of pose.legs)assert.ok(Math.hypot(leg.foot.x-previous.legs.find(l=>l.id===leg.id).foot.x,leg.foot.y-previous.legs.find(l=>l.id===leg.id).foot.y)<9,`${leg.id} resumed replant jumped`);
      previous=pose;
    }
  }
});

test('a pause consuming stopped telemetry resumes from the last visible paws', () => {
  const c=createRigController({species:'cat',random:()=>0});
  const locomotion={facing:1,moving:true,epoch:1,distanceDip:0,spriteSizeDip:256};let before;
  for(let now=0;now<=800;now+=16){locomotion.distanceDip=now*.01;before=c.sample({locomotion},now);}
  locomotion.moving=false;c.sample({locomotion,paused:true},816);
  const resumed=c.sample({locomotion},1000);
  for(let i=0;i<4;i++){assert.deepEqual(resumed.legs[i].foot,before.legs[i].foot);assert.equal(resumed.legs[i].supportGeneration,before.legs[i].supportGeneration);}
});

test('resuming a care interruption keeps the remaining turn step continuous', () => {
  for(const facing of [1,-1])for(const phase of [.15,.45,.65,.75,.95])for(const pauseAt of [0,48,192,200,336,592,600,688])for(const action of ['pet','feed','groom']) {
    const c=createRigController({species:'cat',random:()=>0});
    const locomotion={facing,moving:true,epoch:1,distanceDip:0,spriteSizeDip:256};c.sample({locomotion},0);
    locomotion.distanceDip=phase*64;c.sample({locomotion},100);
    locomotion.facing=-facing;locomotion.moving=false;c.sample({locomotion},100);
    for(let now=8;now<=pauseAt;now+=8)c.sample({locomotion},100+now);
    let previous;const duration=action==='pet'?2400:action==='feed'?3200:2200;
    for(let elapsed=0;elapsed<=duration;elapsed+=8)previous=c.sample({locomotion,action,actionStartedAt:1},100+pauseAt+elapsed);
    for(let elapsed=0;elapsed<=850;elapsed+=8) {
      const pose=c.sample({locomotion,action:'idle'},100+pauseAt+duration+elapsed);
      for(const leg of pose.legs){
        assert.ok(Math.hypot(leg.foot.x-previous.legs.find(l=>l.id===leg.id).foot.x,leg.foot.y-previous.legs.find(l=>l.id===leg.id).foot.y)<9,
          `${leg.id} ${action} phase ${phase} pause ${pauseAt} resume ${elapsed} jumps`);
        assert.ok(Math.hypot(leg.ankle.x-leg.hip.x,leg.ankle.y-leg.hip.y)<=leg.upperLength+leg.lowerLength+1e-5);
      }
      previous=pose;
    }
  }
});
