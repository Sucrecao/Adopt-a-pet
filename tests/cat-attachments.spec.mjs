import { test, expect } from '@playwright/test';

test('near cat shoulder and thigh remain visible over torso fur without an opaque root cap', async ({page}) => {
  await page.goto('/');
  const results=await page.evaluate(async()=>{
    const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');
    const {createRigController}=await import('/src/core/rig-motion.js');
    const load=async name=>{const i=new Image();i.src='/pets/'+name+'.png';await i.decode();return i;};
    const json=async name=>(await fetch('/pets/'+name+'.json')).json();
    const [rigImage,rigMeta,headImage,headMeta,limbImage,limbMeta]=await Promise.all([load('cat-rig'),json('cat-rig'),load('cat-cohesive-v2'),json('cat-head-rig-v3'),load('cat-limbs-v3'),json('cat-limb-rig-v3')]);
    const results=[];
    for(const facing of [1,-1]) {
      const pose=createRigController({species:'cat',random:()=>0}).sample({locomotion:{facing,moving:false,epoch:1,distanceDip:0,spriteSizeDip:256}},0);
      const draw=meta=>{const c=document.createElement('canvas');createRigRenderer(c,{species:'cat',rigImage,rigMeta,headImage,headMeta:meta,limbImage,limbMeta}).draw(pose,0);return c.getContext('2d').getImageData(0,0,256,256).data;};
      const actual=draw(headMeta),underBody=draw({...headMeta,revision:2});
      for(const leg of pose.legs.filter(l=>l.side==='near')) {
        let visibleSkin=0,capPixels=0;
        for(let y=Math.round(leg.hip.y);y<Math.round(leg.knee.y);y++)for(let x=Math.round(leg.hip.x)-20;x<=Math.round(leg.hip.x)+20;x++){
          const offset=(y*256+x)*4;
          if(Math.max(...[0,1,2].map(c=>Math.abs(actual[offset+c]-underBody[offset+c])))>=12)visibleSkin++;
        }
        for(let y=Math.round(leg.hip.y)-5;y<Math.round(leg.hip.y);y++)for(let x=Math.round(leg.hip.x)-15;x<=Math.round(leg.hip.x)+15;x++){
          const offset=(y*256+x)*4;
          if(Math.max(...[0,1,2].map(c=>Math.abs(actual[offset+c]-underBody[offset+c])))>=12)capPixels++;
        }
        results.push({id:leg.id,facing,visibleSkin,capPixels});
      }
    }
    return results;
  });
  for(const result of results) {
    expect(result.visibleSkin,JSON.stringify(result)).toBeGreaterThan(20);
    expect(result.capPixels,JSON.stringify(result)).toBe(0);
  }
});
