import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import {useLegacyPetResources} from './legacy-pet-fixture.mjs';
test.beforeEach(async({page})=>useLegacyPetResources(page));

const headMeta = {
  version: 2, sourceSize: [1536, 1024], parts: Array.from({ length: 6 }, () => [0, 0, 64, 64]),
  registration: {
    body: { x: 128, offsetX: -5, y: 80, width: 160, height: 94 },
    head: { offsetX: 47, y: 122, width: 96, height: 82 },
    anchors: Array.from({ length: 6 }, () => [.5, .625]),
    tail: { rect: [0, 0, 64, 64], offsetX: -60, y: 132, width: 45, height: 56, anchorX: .15, anchorY: .86 },
  },
};
const limbMeta = {
  version: 2, sourceSize: [1536, 1024], species: { cat: { fore: 0, hind: 1 } },
  parts: Array.from({ length: 2 }, () => ({ rect: [0, 0, 64, 64], joints: [[.5, .1], [.5, .4], [.5, .8], [.5, .98]] })),
};

test('cat v2 places its short neck and torso with feline registration', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async metadata => {
    const { createRigRenderer } = await import('/src/rendering/rig-renderer.js');
    const blank = document.createElement('canvas'); blank.width = blank.height = 128;
    const image = document.createElement('canvas'); image.width = 128 * 6; image.height = 128;
    const ink = image.getContext('2d');
    ink.fillStyle = '#00cc44'; ink.fillRect(128 + 60, 76, 8, 8);
    ink.fillStyle = '#cc0044'; ink.fillRect(60, 0, 8, 8);
    const meta = { ...metadata, parts: Array.from({ length: 6 }, (_, i) => [i * 128, 0, 128, 128]) };
    const canvas = document.createElement('canvas');
    const renderer = createRigRenderer(canvas, { species: 'cat', rigImage: blank, rigMeta: { parts: Array(6).fill([0, 0, 128, 128]) }, headImage: image, headMeta: meta });
    renderer.draw({ legs: [], body: {}, orientation: 1, facing: 1, tailAngle: 0, headAngle: 0, expressionWeight: 0, clip: 'idle' });
    const bytes = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
    const pixel = (x, y) => [...bytes.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)];
    return { neck: pixel(175, 122), torso: pixel(123, 82), registration: canvas.dataset.headRig };
  }, headMeta);
  expect(result.neck[3]).toBeGreaterThan(220); expect(result.neck[1]).toBeGreaterThan(150);
  expect(result.torso[3]).toBeGreaterThan(220); expect(result.torso[0]).toBeGreaterThan(150);
  expect(result.registration).toBe('registered-v2');
});

test('cat v2 draws its complete matching tail at the registered root', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async metadata => {
    const { createRigRenderer } = await import('/src/rendering/rig-renderer.js');
    const blank = document.createElement('canvas'); blank.width = blank.height = 128;
    const image = document.createElement('canvas'); image.width = 768; image.height = 128;
    const ink = image.getContext('2d'); ink.fillStyle = '#00cc44'; ink.fillRect(6, 53, 8, 8);
    const meta = { ...metadata, parts: Array.from({ length: 6 }, (_, i) => [128 * (i + 1), 0, 128, 128]) };
    const canvas = document.createElement('canvas'), renderer = createRigRenderer(canvas, { species: 'cat', rigImage: blank, rigMeta: { parts: Array(6).fill([0, 0, 128, 128]) }, headImage: image, headMeta: meta });
    renderer.draw({ legs: [], body: {}, orientation: 1, facing: 1, tailAngle: 0, headAngle: 0, expressionWeight: 0, clip: 'idle' });
    const bytes = canvas.getContext('2d').getImageData(68, 132, 1, 1).data; return [...bytes];
  }, headMeta);
  expect(result[3]).toBeGreaterThan(220); expect(result[1]).toBeGreaterThan(150);
});

for (const failure of [null, 'png', 'head', 'limb']) {
  test(`fallback cat rig selects the complete coherent group${failure ? ` and restores the original pair on ${failure} failure` : ''}`, async ({ page }) => {
    await page.route('**/pets/*-whole-v*', route => route.abort());
    const png = await readFile('public/pets/cat-head-rig.png');
    await page.route('**/pets/cat-cohesive-v2.png', route => failure === 'png' ? route.abort() : route.fulfill({ contentType: 'image/png', body: png }));
    await page.route('**/pets/cat-head-rig-v2.json', route => failure === 'head' ? route.abort() : route.fulfill({ json: headMeta }));
    await page.route('**/pets/cat-limb-rig-v2.json', route => failure === 'limb' ? route.abort() : route.fulfill({ json: limbMeta }));
    await page.addInitScript(() => {
      window.drawnPetAssets = new Set();
      window.catLimbCrops = 0;
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (image instanceof HTMLImageElement) window.drawnPetAssets.add(image.src.split('/').at(-1));
        if (image instanceof HTMLImageElement && image.src.endsWith('/cat-cohesive-v2.png') && this.canvas.width === 64 && this.canvas.height === 64) window.catLimbCrops++;
        return original.call(this, image, ...args);
      };
    });
    await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.getByRole('button', { name: /选择猫咪/ }).click();
    await page.getByRole('button', { name: /在预览中领养/ }).click();
    const canvas = page.locator('.stage-pet canvas');
    await expect(canvas).toHaveAttribute('data-head-rig', failure ? 'legacy-parts' : 'registered-v2');
    await expect(canvas).toHaveAttribute('data-limb-skin', 'connected-v2');
    await expect.poll(() => page.evaluate(() => [...window.drawnPetAssets])).toContain(failure ? 'cat-head-rig.png' : 'cat-cohesive-v2.png');
    const assets = await page.evaluate(() => [...window.drawnPetAssets]);
    if (failure) { expect(assets).not.toContain('cat-cohesive-v2.png'); expect(assets).toContain('quadruped-legs-v2.png'); }
    else { expect(assets).not.toContain('cat-head-rig.png'); expect(await page.evaluate(() => window.catLimbCrops)).toBeGreaterThanOrEqual(2); }
  });
}

test('actual cohesive cat retains sole contact, continuous turns and frozen care pixels', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createRigRenderer } = await import('/src/rendering/rig-renderer.js');
    const { createRigController } = await import('/src/core/rig-motion.js');
    const load = async path => { const image = new Image(); image.src = path; await image.decode(); return image; };
    const rigImage = await load('/pets/cat-rig.png'), rigMeta = await (await fetch('/pets/cat-rig.json')).json();
    const image = await load('/pets/cat-cohesive-v2.png'), headMeta = await (await fetch('/pets/cat-head-rig-v2.json')).json(), limbMeta = await (await fetch('/pets/cat-limb-rig-v2.json')).json();
    const canvas = document.createElement('canvas'), renderer = createRigRenderer(canvas, { species: 'cat', rigImage, rigMeta, headImage: image, headMeta, limbImage: image, limbMeta });
    const sheet = document.createElement('canvas'); sheet.width = 256 * 12; sheet.height = 256 * 3; const ink = sheet.getContext('2d');
    const columns = [['idle', 1], ['idle', -1], ['walk', 1], ['walk', -1], ['idle', .5], ['idle', 0], ['idle', -.5], ['groom', 1], ['stretch', 1], ['trick', 1], ['pet', 1], ['feed', -1]];
    const soles = [], transitions = [], care = []; let maxEdge = 0;
    for (const [column, [action, orientation]] of columns.entries()) {
      const controller = createRigController({ species: 'cat', random: () => 0 }), locomotion = { epoch: 1, distanceDip: 0, spriteSizeDip: 256, facing: orientation < 0 ? -1 : 1, moving: action === 'walk' };
      let pose; for (let now = 0; now <= 600; now += 16) { locomotion.distanceDip = action === 'walk' ? now * .1 : 0; pose = controller.sample({ action: action === 'walk' ? 'idle' : action, actionElapsed: now, actionStartedAt: 1, locomotion }, now); }
      pose = { ...pose, orientation }; renderer.draw(pose, 600);
      const pixels = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
      for (let n = 0; n < 256; n++) for (const [x, y] of [[n, 0], [n, 255], [0, n], [255, n]]) maxEdge = Math.max(maxEdge, pixels[(y * 256 + x) * 4 + 3]);
      if (action === 'idle' && Math.abs(orientation) === 1) for (const leg of pose.legs.filter(leg => leg.planted)) soles.push({ orientation, id: leg.id, alpha: pixels[(Math.round(leg.foot.y - 3) * 256 + Math.round(leg.foot.x)) * 4 + 3] });
      for (const [row, color] of ['#eee8fa', '#16191f', '#ffffff'].entries()) { ink.fillStyle = color; ink.fillRect(column * 256, row * 256, 256, 256); ink.drawImage(canvas, column * 256, row * 256); }
    }
    for (const facing of [1, -1]) {
      const controller = createRigController({ species: 'cat', random: () => 0 }), locomotion = { epoch: 1, distanceDip: 0, spriteSizeDip: 256, facing, moving: false };
      const initial = controller.sample({ locomotion }, 0); renderer.draw(initial, 0); const before = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
      locomotion.facing = -facing; renderer.draw(controller.sample({ locomotion }, .001), .001); const after = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
      transitions.push({ facing, delta: before.reduce((sum, value, i) => sum + Math.abs(value - after[i]), 0) / before.length });
      for (let now = 8; now <= 400; now += 8) controller.sample({ locomotion }, now);
      for (const action of ['pet', 'feed', 'groom']) {
        const pose = controller.sample({ action, actionStartedAt: action, actionElapsed: 600, locomotion }, 1000); renderer.draw(pose, 1000); const pixels = canvas.toDataURL();
        const paused = controller.sample({ action, paused: true, locomotion }, 2000); renderer.draw(paused, 2000); care.push({ facing, action, samePose: paused === pose, pixelsEqual: canvas.toDataURL() === pixels });
      }
    }
    return { sheet: sheet.toDataURL(), maxEdge, soles, transitions, care };
  });
  await mkdir('.superpowers/sdd/evidence', { recursive: true });
  await writeFile('.superpowers/sdd/evidence/cohesive-cat-production-purple-dark-white.png', Buffer.from(result.sheet.split(',')[1], 'base64'));
  await writeFile('.superpowers/sdd/evidence/cohesive-cat-production-contact-freeze.json', JSON.stringify({ ...result, sheet: undefined }, null, 2));
  expect(result.maxEdge).toBe(0); expect(result.soles).toHaveLength(8);
  for (const sole of result.soles) expect(sole.alpha, JSON.stringify(sole)).toBeGreaterThan(200);
  for (const transition of result.transitions) expect(transition.delta).toBeLessThan(.1);
  for (const sample of result.care) { expect(sample.samePose).toBeTruthy(); expect(sample.pixelsEqual).toBeTruthy(); }
});

test('actual cohesive cat facial mesh stays finite and unfolded in mixed turns and care', async ({ page }) => {
  await page.goto('/');
  const audit = await page.evaluate(async () => {
    const { createRigRenderer } = await import('/src/rendering/rig-renderer.js');
    const image = new Image(); image.src = '/pets/cat-cohesive-v2.png'; await image.decode();
    const meta = await (await fetch('/pets/cat-head-rig-v2.json')).json(), blank = document.createElement('canvas'); blank.width = blank.height = 128;
    const canvas = document.createElement('canvas'), renderer = createRigRenderer(canvas, { species: 'cat', rigImage: blank, rigMeta: { parts: Array(6).fill([0, 0, 128, 128]) }, headImage: image, headMeta: { ...meta, parts: meta.parts.map((part, index) => index === 0 ? [0, 0, 1, 1] : part) } });
    const prototype = CanvasRenderingContext2D.prototype, original = prototype.transform,originalMove=prototype.moveTo,originalLine=prototype.lineTo, matrices = [], areas=[],samples = [];let path=[];prototype.moveTo=function(x,y){path=[[x,y]];return originalMove.call(this,x,y);};prototype.lineTo=function(x,y){path.push([x,y]);return originalLine.call(this,x,y);};const sheet=document.createElement('canvas');sheet.width=13*256;sheet.height=5*256;const sheetContext=sheet.getContext('2d');sheetContext.fillStyle='#16191f';sheetContext.fillRect(0,0,sheet.width,sheet.height);
    prototype.transform = function (...matrix) { matrices.push(matrix);const [a,b,c]=path;areas.push(a&&b&&c?(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]):NaN); return original.apply(this, matrix); };
    try {
      for (const orientation of [-1, -.875, -.625, -.375, -.25, -.125, 0, .125, .25, .375, .625, .875, 1]) for (const clip of ['idle', 'pet', 'feed']) for (const expressionWeight of clip === 'idle' ? [0] : [.5, 1]) {
        matrices.length = 0;areas.length=0; renderer.draw({ legs: [], body: {}, orientation, facing: 1, headAngle: .15, tailAngle: 0, clip, expressionWeight });sheetContext.drawImage(canvas,[-1,-.875,-.625,-.375,-.25,-.125,0,.125,.25,.375,.625,.875,1].indexOf(orientation)*256,(clip==='idle'?0:clip==='pet'?expressionWeight===.5?1:2:expressionWeight===.5?3:4)*256);
        let folds = 0;const foldIndices=[];
        for (let start = 0; start < matrices.length; start += 288) { const determinants = matrices.slice(start, start + 288).map(([a, b, c, d]) => a * d - b * c), sign = Math.sign(determinants.find(value => Math.abs(value) > 1e-10)); foldIndices.push(...determinants.map((value,i)=>value*sign < -1e-10?start+i:null).filter(i=>i!==null)); folds += determinants.filter(value => value * sign < -1e-10).length; }
        samples.push({ orientation, clip, expressionWeight, triangles: matrices.length, finite: matrices.every(matrix => matrix.every(Number.isFinite)),destinationPositive:areas.every(area=>Number.isFinite(area)&&area>0), folds,foldIndices });
      }
    } finally { prototype.transform = original;prototype.moveTo=originalMove;prototype.lineTo=originalLine; }
    return {samples,sheet:sheet.toDataURL()};
  });
  await mkdir('.superpowers/sdd/evidence', { recursive: true }); await writeFile('.superpowers/sdd/evidence/cohesive-cat-head-folds.json', JSON.stringify(audit.samples, null, 2));await writeFile('.superpowers/sdd/evidence/cohesive-cat-ear-care-65.png',Buffer.from(audit.sheet.split(',')[1],'base64'));
  for (const sample of audit.samples) { expect(sample.triangles).toBeGreaterThanOrEqual(288); expect(sample.triangles % 288).toBe(0); expect(sample.finite).toBeTruthy();expect(sample.destinationPositive,JSON.stringify(sample)).toBeTruthy(); expect(sample.folds, JSON.stringify(sample)).toBe(0); }
});

test('actual cat turning ear apices share one opaque skull silhouette before blending',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{
  const{createRigRenderer}=await import('/src/rendering/rig-renderer.js');const image=new Image();image.src='/pets/cat-cohesive-v2.png';await image.decode();const meta=await(await fetch('/pets/cat-head-rig-v2.json')).json();
  const ears=[null,[[.408964,.030675],[.638647,.04908]],[[.334027,.068047],[.780854,.032544]],[[.15007,.035821],[.856244,.032836]],[[.370204,.03012],[.725193,.054217]],[[.400246,.055394],[.763964,.029155]]];
  const blank=document.createElement('canvas');blank.width=blank.height=128;const canvas=document.createElement('canvas'),renderer=createRigRenderer(canvas,{species:'cat',rigImage:blank,rigMeta:{parts:Array(6).fill([0,0,128,128])},headImage:image,headMeta:{...meta,parts:meta.parts.map((part,i)=>i===0?[0,0,1,1]:part)}}),samples=[];
  for(const orientation of [-.875,-.625,-.375,-.25,.25,.375,.625,.875]){
   renderer.draw({legs:[],body:{},orientation,facing:1,headAngle:0,tailAngle:0,clip:'idle',expressionWeight:0});const pixels=canvas.getContext('2d').getImageData(0,0,256,256).data,profile=Math.abs(orientation)*2,lower=Math.floor(profile),mix=profile-lower,indices=[3,2,1],views=[[indices[lower],1-mix],[indices[lower+1],mix]];
   for(let ear=0;ear<2;ear++){let x=128+50*orientation,y=122;for(const[index,weight]of views){const mirror=index===3?1:Math.sign(orientation),source=ears[index][mirror<0?1-ear:ear];x+=(source[0]-.5)*96*mirror*weight;y+=(source[1]-.88)*82*weight;}let alpha=0;for(let dy=1;dy<=3;dy++)for(let dx=-1;dx<=1;dx++)alpha=Math.max(alpha,pixels[((Math.round(y)+dy)*256+Math.round(x)+dx)*4+3]);samples.push({orientation,ear,x,y,alpha});}
  }return samples;
 });await writeFile('.superpowers/sdd/evidence/cohesive-cat-ear-apices.json',JSON.stringify(result,null,2));for(const sample of result)expect(sample.alpha,JSON.stringify(sample)).toBeGreaterThan(200);
});
