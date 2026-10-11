import { test, expect } from '@playwright/test';

test('preview dog advances gait with horizontal travel and freezes all pixels when paused', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByRole('button', { name: /选择小狗/ }).click();
  await page.getByRole('button', { name: /在预览中领养/ }).click();
  const pet = page.locator('.stage-pet');
  await expect(pet).toHaveAttribute('data-atlas', 'rig');
  const before = await page.locator('.stage-pet-anchor').boundingBox();
  await page.getByRole('button', { name: '玩耍', exact: true }).click();
  const stage = await page.locator('.desktop-stage').boundingBox();
  await page.mouse.move(stage.x + stage.width * .85, stage.y + 10);
  await expect.poll(async () => Number(await pet.getAttribute('data-phase'))).toBeGreaterThan(.08);
  const after = await page.locator('.stage-pet-anchor').boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThan(.5);
  await page.getByRole('switch', { name: '暂停活动' }).click();
  await page.waitForTimeout(70);
  const pixels = await pet.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(180);
  expect(await pet.locator('canvas').evaluate(canvas => canvas.toDataURL())).toBe(pixels);
});

test('jointed renderer draws opaque paws at their solved contacts with clear margins', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createRigRenderer } = await import('/src/rendering/rig-renderer.js');
    const { createRigController } = await import('/src/core/rig-motion.js');
    const image = new Image(); image.src = '/pets/dog-rig.png'; await image.decode();
    const meta = await (await fetch('/pets/dog-rig.json')).json();
    const canvas = document.createElement('canvas');
    const renderer = createRigRenderer(canvas, { species: 'dog', rigImage: image, rigMeta: meta });
    const controller = createRigController({ species: 'dog' });
    const props = { action: 'idle', walking: true, locomotion: { epoch: 0, distanceDip: 0, spriteSizeDip: 256, facing: 1, moving: true } };
    controller.sample(props, 0);
    props.locomotion.distanceDip = 16;
    const pose = controller.sample(props, 250);
    renderer.draw(pose, 250);
    const ctx = canvas.getContext('2d'), bytes = ctx.getImageData(0, 0, 256, 256).data;
    const at = (x, y) => bytes[(Math.round(y) * 256 + Math.round(x)) * 4 + 3];
    const contacts = pose.legs.filter(leg => leg.planted).map(leg => at(leg.foot.x, leg.foot.y - 3));
    let edgeAlpha = 0;
    for (let n = 0; n < 256; n++) edgeAlpha = Math.max(edgeAlpha, at(n, 0), at(n, 255), at(0, n), at(255, n));
    const first = canvas.toDataURL();
    props.locomotion.distanceDip = 18;
    renderer.draw(controller.sample(props, 275), 275);
    const second = canvas.toDataURL();
    const backend = canvas.dataset.renderer;
    renderer.dispose();
    return { backend, contacts, edgeAlpha, changes: first !== second };
  });
  expect(result.backend).toBe('rig-2d');
  expect(result.contacts.length).toBeGreaterThanOrEqual(2);
  expect(result.contacts.every(alpha => alpha > 200)).toBeTruthy();
  expect(result.edgeAlpha).toBe(0);
  expect(result.changes).toBeTruthy();
});

test('pet feed and parrot preen visibly articulate matching artwork', async ({ page }) => {
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');
  const {createRigController}=await import('/src/core/rig-motion.js');
  const results=[];
  for(const species of ['cat','dog','parrot']){
   const load=async(src)=>{const image=new Image();image.src=src;await image.decode();return image;};
   const rigImage=await load(`/pets/${species}-rig.png`),rigMeta=await(await fetch(`/pets/${species}-rig.json`)).json();
   const perchImage=species==='parrot'?await load('/pets/parrot-perch-rig.png'):undefined;
   const headImage=await load(`/pets/${species}-head-rig.png`),headMeta=await(await fetch(`/pets/${species}-head-rig.json`)).json();
   const canvas=document.createElement('canvas');
   const renderer=createRigRenderer(canvas,{species,rigImage,rigMeta,perchImage,headImage,headMeta});
   const frames={};
   for(const action of ['idle','pet','feed','groom']){
    const controller=createRigController({species,random:()=>0});
    renderer.draw(controller.sample({action,actionElapsed:600,locomotion:{epoch:1,distanceDip:0,spriteSizeDip:256,facing:1,moving:false}},0),0);
    frames[action]=canvas.toDataURL();
   }
   results.push({species,pet:frames.pet!==frames.idle,feed:frames.feed!==frames.idle,distinct:frames.pet!==frames.feed,groom:frames.groom!==frames.idle});
  }
  return results;
 });
 for(const response of result){expect(response.pet).toBeTruthy();expect(response.feed).toBeTruthy();expect(response.distinct).toBeTruthy();expect(response.groom).toBeTruthy();}
});

test('preview holds root during reversal and rebases unclamped resize',async({page})=>{
 await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.getByRole('button',{name:/选择小狗/}).click();await page.getByRole('button',{name:/在预览中领养/}).click();
 const pet=page.locator('.stage-pet');await expect(pet).toHaveAttribute('data-atlas','rig');
 await page.getByRole('button',{name:'玩耍',exact:true}).click();
 const stage=await page.locator('.desktop-stage').boundingBox();
 await page.mouse.move(stage.x+stage.width*.85,stage.y+20);
 await expect.poll(async()=>Number(await pet.getAttribute('data-phase'))).toBeGreaterThan(.1);
 await page.mouse.move(stage.x+stage.width*.15,stage.y+20);
 await expect(pet).toHaveAttribute('data-turning','true');
 const before=await page.locator('.stage-pet-anchor').boundingBox();
 await page.waitForTimeout(160);const after=await page.locator('.stage-pet-anchor').boundingBox();
 expect(Math.abs(before.x-after.x)).toBeLessThan(.5);expect(Math.abs(before.y-after.y)).toBeLessThan(.5);
 await expect(pet).toHaveAttribute('data-turning','false',{timeout:1800});
 await page.getByRole('switch',{name:'暂停活动'}).click();
 const epoch=Number(await pet.getAttribute('data-motion-epoch'));
 await page.locator('.desktop-stage').evaluate(stage => { stage.style.width = '90%'; });
 await page.waitForTimeout(80);
 // Paused controller retains exact pose; resume consumes the changed epoch.
 await page.getByRole('switch',{name:'暂停活动'}).click();
 await expect.poll(async()=>Number(await pet.getAttribute('data-motion-epoch'))).toBeGreaterThan(epoch);
});

test('rendered reversal and front-facing midpoint have no silhouette cut or collapse',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {createRigController}=await import('/src/core/rig-motion.js');const {createRigRenderer}=await import('/src/rendering/rig-renderer.js');
  const load=async(src)=>{const image=new Image();image.src=src;await image.decode();return image;};
  const species='dog',rigImage=await load('/pets/dog-rig.png'),rigMeta=await(await fetch('/pets/dog-rig.json')).json(),headImage=await load('/pets/dog-head-rig.png'),headMeta=await(await fetch('/pets/dog-head-rig.json')).json();
  const canvas=document.createElement('canvas'),renderer=createRigRenderer(canvas,{species,rigImage,rigMeta,headImage,headMeta}),controller=createRigController({species,random:()=>0});
  let locomotion={epoch:1,distanceDip:0,spriteSizeDip:256,facing:1,moving:true};controller.sample({locomotion},0);locomotion.distanceDip=16;const before=controller.sample({locomotion},400);renderer.draw(before,400);
  const pixels=()=>new Uint8ClampedArray(canvas.getContext('2d').getImageData(0,0,256,256).data);const first=pixels();
  locomotion={...locomotion,facing:-1,moving:false};const start=controller.sample({locomotion},400.001);renderer.draw(start,400.001);const second=pixels();
  let difference=0;for(let i=0;i<first.length;i++)difference+=Math.abs(first[i]-second[i]);
  let midpoint;for(let t=416;t<=800;t+=16)midpoint=controller.sample({locomotion},t);renderer.draw(midpoint,800);const middle=pixels();
  let left=256,right=-1,count=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(middle[(y*256+x)*4+3]>200){left=Math.min(left,x);right=Math.max(right,x);count++;}
  return {difference:difference/first.length,width:right-left,count,footJump:Math.max(...start.legs.map((leg,i)=>Math.hypot(leg.foot.x-before.legs[i].foot.x,leg.foot.y-before.legs[i].foot.y))),kneeJump:Math.max(...start.legs.map((leg,i)=>Math.hypot(leg.knee.x-before.legs[i].knee.x,leg.knee.y-before.legs[i].knee.y)))};
 });
 expect(result.difference).toBeLessThan(.1);expect(result.width).toBeGreaterThan(120);expect(result.count).toBeGreaterThan(9000);expect(result.footJump).toBeLessThan(.01);expect(result.kneeJump).toBeLessThan(.01);
});
