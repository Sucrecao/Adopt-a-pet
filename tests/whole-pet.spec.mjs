import { test, expect } from '@playwright/test';

const clips = {
  idle: { frames: [0, 1, 2, 3, 4, 5], durations: [280, 110, 110, 140, 140, 320], loop: true },
  rest: { frames: [6, 7], durations: [2800, 2800], loop: true },
  walk: { frames: [8, 9, 10, 11, 12, 13, 14, 15], durations: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
  turn: { frames: [16, 17, 18, 19, 20, 21, 22, 23], durations: Array(8).fill(100), loop: false },
  pet: { frames: [24, 25, 26, 27], durations: [300, 600, 500, 400], loop: false },
  feed: { frames: [28, 29, 30, 31], durations: [300, 350, 350, 500], loop: true },
  groom: { frames: [32, 33, 34, 35], durations: [300, 500, 500, 400], loop: false },
  stretch: { frames: [36, 37, 38, 39], durations: [250, 700, 600, 450], loop: false },
  hop: { frames: [40, 41, 42, 43, 44], durations: [140, 140, 140, 140, 280], loop: false },
};

const metadata = () => ({ version: 1, columns: 8, rows: 6, sourceSize: [2048, 1536], scale: 1, clips,
  frames: Array.from({ length: 48 }, (_, frame) => ({ rect: [frame % 8 * 256, Math.floor(frame / 8) * 256, 256, 256], offsetX: 0, offsetY: 0 })) });

const denseMetadata = (species, version = 2) => {
  const clip = (first,count,total,loop=false) => ({frames:Array.from({length:count},(_,i)=>first+i),durations:Array(count).fill(total/count),loop});
  const meta = {version,neutralFrame:0,pages:['motion','care'].map(kind=>({asset:`pets/${species}-fixture-whole-v${version}-${kind}.png`,sourceSize:[2048,1536],columns:8,rows:6,scale:1})),
    frames:Array.from({length:96},(_,i)=>({page:Math.floor(i/48),rect:[i%8*256,Math.floor(i%48/8)*256,256,256],offsetX:0,offsetY:0})),
    clips:{idle:clip(0,12,6600,true),rest:clip(12,4,5600,true),walk:clip(16,16,1060,true),turn:clip(32,16,800),pet:clip(48,8,2400),feed:clip(56,8,1600,true),groom:clip(64,8,1700),stretch:clip(72,8,2600),hop:clip(80,10,2800)},
    transitions:{walk:{enter:{frames:[95,94],durations:[60,60]},exit:{frames:[94,95],durations:[60,60]}},rest:{enter:{frames:[90,91,92,93],durations:[100,100,100,100]},exit:{frames:[93,92,91,90],durations:[100,100,100,100]}}}};
  if (version >= 3) {
    meta.pages.push({asset:`pets/${species}-fixture-whole-v${version}-gait.png`,sourceSize:[2048,1024],columns:8,rows:4,scale:1});
    meta.frames.push(...Array.from({length:32},(_,i)=>({page:2,rect:[i%8*256,Math.floor(i/8)*256,256,256],offsetX:0,offsetY:0})));
    meta.clips.walk=clip(96,32,1060,true);
  }
  if ([4,5].includes(version)) {
    const pairs = Object.entries(meta.clips).filter(([name]) => name !== 'walk').flatMap(([, clip]) => clip.frames.flatMap((frame, i) => i + 1 < clip.frames.length ? [[frame, clip.frames[i + 1]]] : clip.loop ? [[frame, clip.frames[0]]] : []));
    meta.flow = { version: 1, size: 32, frameSize: 256, encoding: 'signed-one-pixel-rgba', pairs, asset: `pets/${species}-fixture-flow.bin` };
  }
  if(version===5)meta.handoffs={version:1,neutralFrame:0,edgeDuration:180,settleDuration:420};
  return meta;
};

async function prepareDenseAssets(page, { deferredCare, unavailableCare, invalidCare, version = 2, deferredGait, unavailableGait, invalidGait, unavailableFlow, invalidFlow, deferredFlow } = {}) {
  await prepareAssets(page);
  const images = await page.evaluate(version => Object.fromEntries(['cat','dog','parrot'].flatMap((species,i)=>(version>=3?[0,1,2]:[0,1]).map(index=>{
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=index===2?1024:1536;const ink=canvas.getContext('2d');
    for(let frame=0;frame<(index===2?32:48);frame++){ink.fillStyle=`rgb(${30+i*60+frame+index*48},90,160)`;ink.fillRect(frame%8*256+36,Math.floor(frame/8)*256+32,184,192);}
    return [`${species}-${index}`,canvas.toDataURL().split(',')[1]];
  }))),version);
  await page.route(`**/pets/*-fixture-whole-v${version}.json`,route=>{
    const species=route.request().url().split('/').at(-1).split('-')[0],meta=denseMetadata(species,version);
    if(invalidCare)meta.pages[1].sourceSize[0]++;
    if(invalidGait)meta.pages[2].sourceSize[0]++;
    return route.fulfill({json:meta});
  });
  await page.route(`**/pets/*-fixture-whole-v${version}-*.png`,async route=>{
    const file=route.request().url().split('/').at(-1),species=file.split('-')[0],index=file.includes('-gait')?2:file.includes('-care')?1:0;
    if(index===1&&unavailableCare||index===2&&unavailableGait)return route.abort();
    if(index===1&&deferredCare&&species==='dog')await deferredCare;
    if(index===2&&deferredGait&&species==='dog')await deferredGait;
    await route.fulfill({contentType:'image/png',body:Buffer.from(images[`${species}-${index}`],'base64')});
  });
  if ([4,5].includes(version)) await page.route('**/pets/*-fixture-flow.bin', async route => {
    const species = route.request().url().split('/').at(-1).split('-')[0];
    if (unavailableFlow) return route.fulfill({ status: 404 });
    if (deferredFlow && species === 'dog') await deferredFlow;
    const count = denseMetadata(species, version).flow.pairs.length * 32 * 32 * 4;
    await route.fulfill({contentType:'application/octet-stream', body: Buffer.alloc(invalidFlow ? 8 : count, 128)});
  });
}

async function prepareAssets(page, { invalid, unavailable, deferredDog, deferredCat } = {}) {
  await page.goto('/');
  const images = await page.evaluate(() => Object.fromEntries(['cat', 'dog', 'parrot'].map((species, i) => {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1536;
    const ink = canvas.getContext('2d');
    for (let frame = 0; frame < 48; frame++) {
      ink.fillStyle = `rgb(${30 + i * 60 + frame}, 90, 160)`;
      ink.fillRect(frame % 8 * 256 + 36, Math.floor(frame / 8) * 256 + 32, 184, 192);
    }
    return [species, canvas.toDataURL().split(',')[1]];
  })));
  await page.route('**/pets/*-fixture-whole-v1.png', async route => {
    const species = route.request().url().split('/').at(-1).split('-')[0];
    if (unavailable === 'image') return route.abort();
    if (species === 'dog' && deferredDog) await deferredDog;
    if (species === 'cat' && deferredCat) await deferredCat;
    await route.fulfill({ contentType: 'image/png', body: Buffer.from(images[species], 'base64') });
  });
  await page.route('**/pets/*-fixture-whole-v1.json', async route => {
    if (unavailable === 'metadata') return route.abort();
    const meta = metadata();
    if (invalid === 'dimensions') meta.sourceSize = [99, 99];
    if (invalid === 'crop') meta.frames[0].rect = [5000, 0, 256, 256];
    await route.fulfill({ json: meta });
  });
}

async function mountPet(page, props = {}) {
  await page.evaluate(async initial => {
    const [{ default: React }, { default: ReactDOMClient }, { default: ReactDOM }, { default: Pet, useReducedMotion }, { PETS }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/node_modules/.vite/deps/react-dom.js'), import('/src/Pet.jsx'), import('/src/core/pets.js'),
    ]);
    let now = 0, nextId = 0;
    const callbacks = new Map();
    Math.random = () => .99;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
    window.requestAnimationFrame = callback => { const id = ++nextId; callbacks.set(id, callback); return id; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    const mount = document.createElement('div'); mount.className = 'whole-fixture'; document.body.append(mount);
    const root = ReactDOMClient.createRoot(mount);
    const locomotionRef = { current: { epoch: 1, distanceDip: 0, spriteSizeDip: 256, facing: 1, moving: false } };
    const version = initial.dense >= 3 ? `v${initial.dense}` : initial.dense ? 'v2' : 'v1';
    const selectPet = id => ({ ...PETS.find(pet => pet.id === id), wholeRenderMode: undefined, wholeAsset: `pets/${id}-fixture-whole-${initial.dense ? `${version}-motion` : 'v1'}.png`, wholeMetaAsset: `pets/${id}-fixture-whole-${version}.json` });
    let props = { size: 256, action: 'idle', locomotionRef, ...initial, pet: selectPet(initial.species || 'cat') };
    delete props.dense;delete props.species;
    function Fixture(props) {
      const reduced = useReducedMotion();
      return React.createElement(Pet, { ...props, 'data-fixture-paused': String(props.paused || false), 'data-fixture-reduced': String(reduced) });
    }
    const render = () => ReactDOM.flushSync(() => root.render(React.createElement(Fixture, props)));
    const snapshot = () => {
      const element = mount.querySelector('.pet-sprite'), canvas = element.querySelector('canvas');
      return { ...element.dataset, renderer: canvas.dataset.renderer, transform: element.style.transform, reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        pixels: canvas.toDataURL(), center: Array.from(canvas.getContext('2d').getImageData(128, 128, 1, 1).data) };
    };
    render();
    window.wholeFixture = {
      step(time, motion = {}) {
        now = time; Object.assign(locomotionRef.current, motion);
        const frame = [...callbacks.values()]; callbacks.clear(); frame.forEach(callback => callback(now));
        return snapshot();
      },
      async props(next) {
        props = { ...props, ...next }; render();
        await new Promise(resolve => setTimeout(resolve, 0));
        return snapshot();
      },
      species(id) { props = { ...props, pet: selectPet(id) }; render(); },
      snapshot,
    };
  }, props);
}

const sprite = page => page.locator('.whole-fixture .pet-sprite');

test('v5 Pet decodes all three whole pages and measured connection fields atomically',async({page})=>{
  await prepareDenseAssets(page,{version:5});await mountPet(page,{dense:5});
  await expect(sprite(page)).toHaveAttribute('data-atlas','whole');
  await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer','whole-flow-2d');
  const pose=await page.evaluate(()=>window.wholeFixture.step(275));
  expect(pose.frame).toBe('0');expect(pose.nextFrame).toBe('1');expect(Number(pose.mix)).toBeCloseTo(.5);
});

test('v4 Pet loads whole displacement fields and freezes an intermediate pose exactly', async ({ page }) => {
  await prepareDenseAssets(page, { version: 4 }); await mountPet(page, { dense: 4 });
  await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer', 'whole-flow-2d');
  const pose = await page.evaluate(() => window.wholeFixture.step(275));
  expect(pose.frame).toBe('0'); expect(pose.nextFrame).toBe('1'); expect(Number(pose.mix)).toBeCloseTo(.5);
  await page.evaluate(() => window.wholeFixture.props({ paused: true }));
  const paused = await page.evaluate(() => window.wholeFixture.step(5000));
  expect(paused.pixels).toBe(pose.pixels); expect(paused.mix).toBe(pose.mix);
});

for (const failure of ['unavailableFlow', 'invalidFlow']) {
  test(`v4 ${failure} retains the complete registered 2D artwork`, async ({ page }) => {
    await prepareDenseAssets(page, { version: 4, [failure]: true }); await mountPet(page, { dense: 4 });
    await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
    await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer', 'whole-2d');
    const pose = await page.evaluate(() => window.wholeFixture.step(600));
    expect(pose.frame).toBe('1'); expect(pose.center).toEqual([31,90,160,255]);
  });
}

test('a late v4 field download cannot replace the current species', async ({ page }) => {
  let release; const deferredFlow = new Promise(resolve => { release = resolve; });
  await prepareDenseAssets(page, { version: 4, deferredFlow }); await mountPet(page, { dense: 4, species: 'dog' });
  await page.evaluate(() => window.wholeFixture.species('cat'));
  await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer', 'whole-flow-2d');
  release();
  await expect.poll(() => page.evaluate(() => window.wholeFixture.snapshot().center[0])).toBe(30);
});

for (const [species, color] of [['cat', 30], ['dog', 90], ['parrot', 150]]) {
  test(`actual ${species} Pet prioritizes an intact whole atlas`, async ({ page }) => {
    await prepareAssets(page); await mountPet(page, { species });
    await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
    await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer', 'whole-2d');
    const pose = await page.evaluate(() => window.wholeFixture.step(400));
    expect(pose.clip).toBe('idle'); expect(pose.transform).toBe('none'); expect(pose.contacts).toBe('');
    expect(pose.center).toEqual([color + Number(pose.frame), 90, 160, 255]);
  });
}

test('static selection Pet uses whole idle without starting playback', async ({ page }) => {
  await prepareAssets(page); await mountPet(page, { ambient: false });
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
  const before = await page.evaluate(() => window.wholeFixture.snapshot());
  const after = await page.evaluate(() => window.wholeFixture.step(6000));
  expect(before.clip).toBe('idle'); expect(before.frame).toBe('0'); expect(after.pixels).toBe(before.pixels);
});

for (const failure of ['image', 'metadata', 'dimensions', 'crop']) {
  test(`whole ${failure} failure retains the existing complete rig fallback`, async ({ page }) => {
    await prepareAssets(page, failure === 'image' || failure === 'metadata' ? { unavailable: failure } : { invalid: failure });
    await mountPet(page, { species: 'dog' });
    await expect(sprite(page)).toHaveAttribute('data-atlas', 'rig');
    await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer', 'rig-2d');
    await expect(sprite(page).locator('canvas')).toHaveAttribute('data-body-rig', 'matched-views-v3');
  });
}

test('a late prior species image never replaces the current pet', async ({ page }) => {
  let release; const deferredDog = new Promise(resolve => { release = resolve; });
  await prepareAssets(page, { deferredDog }); await mountPet(page, { species: 'dog' });
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'motion');
  await page.evaluate(() => window.wholeFixture.species('cat'));
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole'); release();
  await expect.poll(() => page.evaluate(() => window.wholeFixture.snapshot().center[0])).toBe(30);
  await page.evaluate(() => window.wholeFixture.species('parrot'));
  await expect.poll(() => page.evaluate(() => window.wholeFixture.snapshot().center[0])).toBe(150);
});

test('a slow whole atlas can initialize after the optical-flow fallback assets load', async ({ page }) => {
  let release; const deferredCat = new Promise(resolve => { release = resolve; });
  await prepareAssets(page, { deferredCat });
  await page.route('**/pets/cat-rig.json', route => route.fulfill({ status: 404 }));
  const flow = page.waitForResponse('**/pets/cat-flow.bin');
  await mountPet(page); await flow;
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  release();
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
  await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer', 'whole-2d');
});

test('whole walking consumes current native and preview displacement', async ({ page }) => {
  await prepareAssets(page); await mountPet(page);
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
  const samples = await page.evaluate(() => [window.wholeFixture.step(10, { moving: true }),
    window.wholeFixture.step(26, { distanceDip: 16 }), window.wholeFixture.step(90, { distanceDip: 16 }),
    window.wholeFixture.step(106, { distanceDip: 40, epoch: 2 })]);
  expect(samples.every(sample => sample.clip === 'walk')).toBeTruthy();
  expect(samples[1].frame).not.toBe(samples[0].frame); expect(samples[2].frame).toBe(samples[1].frame);
  expect(samples[1].motionDistance).toBe('16'); expect(samples[3].motionEpoch).toBe('2');
});

test('whole turn occupies the actual 800ms movement hold', async ({ page }) => {
  await prepareAssets(page); await mountPet(page);
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
  const samples = await page.evaluate(() => {
    const start = window.wholeFixture.step(16, { facing: -1 });
    return [start, window.wholeFixture.step(416), window.wholeFixture.step(815), window.wholeFixture.step(816),
      window.wholeFixture.step(832, { moving: true, distanceDip: 8 })];
  });
  expect(samples[0].clip).toBe('turn'); expect(samples[0].turnRemaining).toBe('800');
  expect(samples[1].turnRemaining).toBe('400'); expect(samples[2].turning).toBe('true');
  expect(samples[3].turnRemaining).toBe('0'); expect(samples[3].turning).toBe('false');
  expect(samples[4].clip).toBe('walk'); expect(samples[4].facing).toBe('-1');
});

for (const [action, clip, start, end] of [['rest', 'rest', 6, 7], ['pet', 'pet', 24, 27], ['feed', 'feed', 28, 31],
  ['groom', 'groom', 32, 35], ['stretch', 'stretch', 36, 39], ['trick', 'hop', 40, 44]]) {
  test(`actual ${action} uses its complete whole-body clip`, async ({ page }) => {
    await prepareAssets(page); await mountPet(page);
    await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
    await page.evaluate(action => window.wholeFixture.props({ action, actionStartedAt: Date.now() }), action);
    const pose = await page.evaluate(() => window.wholeFixture.step(100));
    expect(pose.clip).toBe(clip); expect(Number(pose.frame)).toBeGreaterThanOrEqual(start); expect(Number(pose.frame)).toBeLessThanOrEqual(end);
    expect(pose.transform).toBe('none'); expect(pose.contacts).toBe('');
  });
}

test('repeated actual whole care restarts its frame and sequence', async ({ page }) => {
  await prepareAssets(page); await mountPet(page);
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
  await page.evaluate(() => { window.careToken = Date.now(); return window.wholeFixture.props({ action: 'pet', actionStartedAt: window.careToken }); });
  await expect(sprite(page)).toHaveAttribute('data-sequence', '2');
  const before = await page.evaluate(() => window.wholeFixture.step(1050));
  await page.evaluate(() => window.wholeFixture.props({ action: 'pet', actionStartedAt: window.careToken + 1 }));
  await expect(sprite(page)).toHaveAttribute('data-sequence', '3');
  const repeated = await page.evaluate(() => window.wholeFixture.snapshot());
  expect(Number(before.frame)).toBeGreaterThan(24); expect(repeated.frame).toBe('24');
  expect(Number(repeated.sequence)).toBeGreaterThan(Number(before.sequence));
});

test('explicit actual whole care pauses and resumes the remaining turn', async ({ page }) => {
  await prepareAssets(page); await mountPet(page);
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
  const before = await page.evaluate(() => { window.wholeFixture.step(16, { facing: -1 }); return window.wholeFixture.step(216); });
  await page.evaluate(() => window.wholeFixture.props({ action: 'pet', actionStartedAt: Date.now() }));
  const care = await page.evaluate(() => window.wholeFixture.step(1016));
  await page.evaluate(() => window.wholeFixture.props({ action: 'idle' }));
  const resumed = await page.evaluate(() => window.wholeFixture.step(1032));
  expect(care.clip).toBe('pet'); expect(care.turnRemaining).toBe(before.turnRemaining);
  expect(resumed.clip).toBe('turn'); expect(Number(resumed.turnRemaining)).toBeLessThan(Number(care.turnRemaining));
});

test('actual whole Pet freezes on pause and dragging and resumes without catching up', async ({ page }) => {
  await prepareAssets(page); await mountPet(page);
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
  const before = await page.evaluate(() => window.wholeFixture.step(350));
  await page.evaluate(() => window.wholeFixture.props({ paused: true }));
  await expect(sprite(page)).toHaveAttribute('data-fixture-paused', 'true');
  const paused = await page.evaluate(() => window.wholeFixture.step(5000));
  await page.evaluate(() => window.wholeFixture.props({ paused: false }));
  await expect(sprite(page)).toHaveAttribute('data-fixture-paused', 'false');
  const samples = await page.evaluate(() => {
    const resumed = window.wholeFixture.step(5100);
    const dragged = window.wholeFixture.step(5116, { dragging: true, moving: true, distanceDip: 60 });
    const held = window.wholeFixture.step(10000, { distanceDip: 160 });
    const released = window.wholeFixture.step(10016, { dragging: false, moving: false });
    return { resumed, dragged, held, released };
  });
  Object.assign(samples, { before, paused });
  const evidence = JSON.stringify(Object.fromEntries(Object.entries(samples).map(([key, { pixels, ...pose }]) => [key, pose])));
  expect(samples.paused.pixels === samples.before.pixels, evidence).toBeTruthy(); expect(Number(samples.resumed.elapsed)).toBeLessThan(600);
  expect(samples.held.pixels).toBe(samples.dragged.pixels); expect(samples.released.frame).toBe(samples.held.frame);
});

test('actual whole Pet obeys changing reduced-motion preference', async ({ page }) => {
  await prepareAssets(page); await mountPet(page);
  await expect(sprite(page)).toHaveAttribute('data-atlas', 'whole');
  await page.evaluate(() => window.wholeFixture.step(400));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(sprite(page)).toHaveAttribute('data-fixture-reduced', 'true');
  const before = await page.evaluate(() => window.wholeFixture.snapshot());
  const held = await page.evaluate(() => window.wholeFixture.step(8000));
  expect(held.pixels === before.pixels, JSON.stringify([{ ...before, pixels: undefined }, { ...held, pixels: undefined }])).toBeTruthy();
  expect(held.elapsed).toBe(before.elapsed);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(sprite(page)).toHaveAttribute('data-fixture-reduced', 'false');
  const resumed = await page.evaluate(() => window.wholeFixture.step(8050));
  expect(Number(resumed.elapsed)).toBeLessThan(1000);
});

test('v2 actual Pet waits for both pages before selecting whole playback', async ({ page }) => {
  let release;const deferredCare=new Promise(resolve=>{release=resolve;});
  await prepareDenseAssets(page,{deferredCare});const first=page.waitForResponse('**/pets/dog-fixture-whole-v2-motion.png');
  await mountPet(page,{dense:true,species:'dog'});await first;
  expect(await sprite(page).getAttribute('data-atlas')).not.toBe('whole');
  release();await expect(sprite(page)).toHaveAttribute('data-atlas','whole');
  await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer','whole-2d');
  await page.evaluate(()=>window.wholeFixture.props({action:'pet',actionStartedAt:Date.now()}));
  await expect(sprite(page)).toHaveAttribute('data-clip','pet');
  const care=await page.evaluate(()=>window.wholeFixture.step(1200));
  expect(care.clip).toBe('pet');expect(care.frame).toBe('52');expect(care.center).toEqual([142,90,160,255]);
});

for(const failure of ['missing','dimensions']){
  test(`v2 ${failure} second page falls back atomically to the existing rig`,async({page})=>{
    await prepareDenseAssets(page,{unavailableCare:failure==='missing',invalidCare:failure==='dimensions'});
    await mountPet(page,{dense:true,species:'dog'});
    await expect(sprite(page)).toHaveAttribute('data-atlas','rig');await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer','rig-2d');
  });
}

test('v2 actual bridge pixels freeze and newer care supersedes sleep or walking transitions',async({page})=>{
  await prepareDenseAssets(page);await mountPet(page,{dense:true});await expect(sprite(page)).toHaveAttribute('data-atlas','whole');
  await page.evaluate(()=>window.wholeFixture.props({action:'rest',actionStartedAt:Date.now()}));
  await expect(sprite(page)).toHaveAttribute('data-clip','rest');
  const bridge=await page.evaluate(()=>window.wholeFixture.step(200));expect(bridge.clip).toBe('rest');expect(bridge.frame).toBe('92');
  await page.evaluate(()=>window.wholeFixture.props({paused:true}));await expect(sprite(page)).toHaveAttribute('data-fixture-paused','true');
  const frozen=await page.evaluate(()=>window.wholeFixture.step(5000));expect(frozen.pixels).toBe(bridge.pixels);
  await page.evaluate(()=>window.wholeFixture.props({paused:false}));await expect(sprite(page)).toHaveAttribute('data-fixture-paused','false');
  const resumed=await page.evaluate(()=>window.wholeFixture.step(5100));expect(resumed.frame).toBe('93');
  await page.evaluate(()=>window.wholeFixture.props({action:'pet',actionStartedAt:Date.now()}));
  await expect(sprite(page)).toHaveAttribute('data-clip','pet');
  const pet=await page.evaluate(()=>window.wholeFixture.snapshot());expect(pet.clip).toBe('pet');expect(pet.frame).toBe('48');
  await page.evaluate(()=>window.wholeFixture.props({action:'idle'}));
  await expect(sprite(page)).toHaveAttribute('data-clip','idle');
  const walking=await page.evaluate(()=>window.wholeFixture.step(5116,{moving:true,distanceDip:0}));expect(walking.clip).toBe('walk');expect(walking.frame).toBe('95');
  const progressing=await page.evaluate(()=>window.wholeFixture.step(5176,{distanceDip:4}));expect(progressing.frame).toBe('94');expect(Number(progressing.phase)).toBeCloseTo(4/64,9);
  const stride=await page.evaluate(()=>window.wholeFixture.step(5236,{distanceDip:8}));expect(stride.frame).toBe('18');expect(Number(stride.phase)).toBeCloseTo(8/64,9);
});

test('a late v2 second page from the previous species never replaces the current animal',async({page})=>{
  let release;const deferredCare=new Promise(resolve=>{release=resolve;});
  await prepareDenseAssets(page,{deferredCare});await mountPet(page,{dense:true,species:'dog'});
  await expect(sprite(page)).toHaveAttribute('data-atlas','motion');await page.evaluate(()=>window.wholeFixture.species('cat'));
  await expect(sprite(page)).toHaveAttribute('data-atlas','whole');release();
  await expect.poll(()=>page.evaluate(()=>window.wholeFixture.snapshot().center[0])).toBe(30);
});

test('actual v2 partial sleep cancellation retains the visible whole pose before waking',async({page})=>{
  await prepareDenseAssets(page);await mountPet(page,{dense:true});await expect(sprite(page)).toHaveAttribute('data-atlas','whole');
  await page.evaluate(()=>window.wholeFixture.props({action:'rest',actionStartedAt:Date.now()}));await expect(sprite(page)).toHaveAttribute('data-clip','rest');
  const lowering=await page.evaluate(()=>window.wholeFixture.step(150));expect(lowering.frame).toBe('91');
  await page.evaluate(()=>window.wholeFixture.props({action:'idle'}));await expect(sprite(page)).toHaveAttribute('data-clip','idle');
  const waking=await page.evaluate(()=>window.wholeFixture.snapshot());expect(waking.transition).toBe('rest.exit');expect(waking.pixels).toBe(lowering.pixels);
  const standing=await page.evaluate(()=>window.wholeFixture.step(250));expect(standing.frame).toBe('90');
  const awake=await page.evaluate(()=>window.wholeFixture.step(350));expect(awake.frame).toBe('0');expect(awake.transition).toBe('');
});

test('actual v2 waking into play first draws the authored curled pose before takeoff',async({page})=>{
  await prepareDenseAssets(page);await mountPet(page,{dense:true});await expect(sprite(page)).toHaveAttribute('data-atlas','whole');
  await page.evaluate(()=>window.wholeFixture.props({action:'rest',actionStartedAt:Date.now()}));await expect(sprite(page)).toHaveAttribute('data-clip','rest');
  const sleeping=await page.evaluate(()=>window.wholeFixture.step(450));expect(sleeping.frame).toBe('12');
  await page.evaluate(()=>window.wholeFixture.props({action:'play'}));await expect(sprite(page)).toHaveAttribute('data-clip','idle');
  const waking=await page.evaluate(()=>window.wholeFixture.step(466,{moving:true,distanceDip:4}));
  expect(waking.clip).toBe('walk');expect(waking.frame).toBe('93');expect(waking.center).toEqual([123,90,160,255]);expect(Number(waking.phase)).toBeCloseTo(4/64,9);
});

test('v3 waits for the third gait page and draws all32 whole walking poses',async({page})=>{
  let release;const deferredGait=new Promise(resolve=>{release=resolve;});
  await prepareDenseAssets(page,{version:3,deferredGait});
  const first=page.waitForResponse('**/pets/dog-fixture-whole-v3-motion.png');
  await mountPet(page,{dense:3,species:'dog'});await first;
  expect(await sprite(page).getAttribute('data-atlas')).not.toBe('whole');
  release();await expect(sprite(page)).toHaveAttribute('data-atlas','whole');
  const samples=await page.evaluate(()=>{
    window.wholeFixture.step(0,{moving:true,distanceDip:0});
    return Array.from({length:33},(_,i)=>window.wholeFixture.step(120+i*34,{distanceDip:i*2+.01}));
  });
  expect(samples.slice(0,32).map(sample=>Number(sample.frame))).toEqual(Array.from({length:32},(_,i)=>96+i));
  expect(samples.slice(0,32).map(sample=>sample.center)).toEqual(Array.from({length:32},(_,i)=>[186+i,90,160,255]));
  expect(samples[32].frame).toBe('96');
});

for(const failure of ['missing','dimensions']){
  test(`v3 ${failure} third page falls back atomically to the existing rig`,async({page})=>{
    await prepareDenseAssets(page,{version:3,unavailableGait:failure==='missing',invalidGait:failure==='dimensions'});
    await mountPet(page,{dense:3,species:'dog'});
    await expect(sprite(page)).toHaveAttribute('data-atlas','rig');
    await expect(sprite(page).locator('canvas')).toHaveAttribute('data-renderer','rig-2d');
  });
}
