import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function metadata(page,species='cat',{invalid=false}={}) {
  const meta=JSON.parse(await readFile(`public/pets/${species}-whole-v3.json`));
  meta.version=7;meta.renderMode=invalid?'stitched':'discrete-whole-frame';meta.stride=species==='parrot'?80:32;
  await page.route(`**/pets/${species}-whole-discrete-fixture.json`,route=>route.fulfill({json:meta}));
}

async function mount(page,species='cat',{wait=true}={}) {
  await page.route('**/whole-frame-pet-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/whole-frame-pet-fixture');
  await page.evaluate(async species=>{
    const {default:RefreshRuntime}=await import('/@react-refresh');RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    const [{default:React},{default:ReactDOMClient},{default:ReactDOM},{default:Pet},{PETS}]=await Promise.all([
      import('/node_modules/.vite/deps/react.js'),import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/node_modules/.vite/deps/react-dom.js'),import('/src/Pet.jsx'),import('/src/core/pets.js'),
    ]);
    let now=0,id=0;const callbacks=new Map(),readiness=[];Math.random=()=>.99;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
    window.requestAnimationFrame=callback=>{const key=++id;callbacks.set(key,callback);return key;};window.cancelAnimationFrame=key=>callbacks.delete(key);
    const host=document.createElement('div');host.className='whole-frame-fixture';document.body.append(host);let root=ReactDOMClient.createRoot(host);
    const locomotionRef={current:{epoch:1,prepareEpoch:1,distanceDip:0,spriteSizeDip:256,facing:1,moving:false,intentMoving:false,actualMoving:false}};
    const motionPaintRef={current:null};const select=id=>({...PETS.find(p=>p.id===id),wholeRenderMode:'discrete-whole-frame',wholeMetaAsset:`pets/${id}-whole-discrete-fixture.json`});
    let props={pet:select(species),size:256,locomotionRef,motionPaintRef,onPlaybackReady:event=>readiness.push(event)};
    const render=()=>ReactDOM.flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Pet,props))));
    const snapshot=()=>{const pet=host.querySelector('.pet-sprite'),canvas=pet?.querySelector('canvas');return pet?{...pet.dataset,pixels:canvas.toDataURL(),backend:canvas.dataset.renderer,groundBackend:canvas.dataset.groundRenderer??'',visibility:canvas.style.visibility,transform:pet.style.transform,background:pet.style.backgroundImage,ready:readiness.at(-1),queuedRafs:callbacks.size}:null;};
    render();window.wholeFramePetFixture={snapshot,
      step(time,motion={}){now=time;Object.assign(locomotionRef.current,motion);const jobs=[...callbacks.values()];callbacks.clear();jobs.forEach(job=>job(now));return snapshot();},
      packet(time,motion={}){now=time;Object.assign(locomotionRef.current,motion);motionPaintRef.current?.();return snapshot();},
      props(next){props={...props,...next};render();return snapshot();},
      species(id){props={...props,pet:select(id)};render();},
      unmount(){ReactDOM.flushSync(()=>root.unmount());return {hook:motionPaintRef.current,queuedRafs:callbacks.size};},
    };
  },species);
  if(wait)await expect(page.locator('.whole-frame-fixture canvas')).toHaveAttribute('data-renderer','whole-frame-2d');
}

for(const species of ['cat','dog','parrot'])test(`${species}: complete pictures prepare before native travel and paint packets synchronously`,async({page})=>{
  const requests=[];page.on('request',r=>requests.push(r.url()));await metadata(page,species);await mount(page,species);
  const result=await page.evaluate(()=>{const f=window.wholeFramePetFixture;const preparing=f.packet(10,{intentMoving:true,moving:false,actualMoving:false});const ready=f.step(140);const moved=f.packet(156,{moving:true,actualMoving:true,distanceDip:16});const duplicate=f.packet(156,{distanceDip:16});return {preparing,ready,moved,duplicate};});
  expect(result.preparing.ready).toEqual({ready:false,epoch:1});expect(result.ready.ready).toEqual({ready:true,epoch:1});
  expect(result.moved.motionDistance).toBe('16');expect(result.moved.pixels).not.toBe(result.ready.pixels);expect(result.duplicate.pixels).toBe(result.moved.pixels);
  for(const sample of Object.values(result)){expect(sample.nextFrame).toBe(sample.frame);expect(sample.mix).toBe('0');expect(sample.ground).toBe('');expect(sample.groundBackend).toBe('');expect(sample.queuedRafs).toBe(1);}
  expect(requests.filter(url=>/\/pets\/.*(rig|flow|ground-v2|cohesive|limbs)/.test(url))).toEqual([]);
  await page.evaluate(()=>window.wholeFramePetFixture.props({paused:true}));
  const paused=await page.evaluate(()=>{const f=window.wholeFramePetFixture;const before=f.packet(170,{paused:true});const after=f.packet(5000,{paused:true,distanceDip:32});return {before,after};});
  expect(paused.after.pixels===paused.before.pixels,JSON.stringify({before:{frame:paused.before.frame,phase:paused.before.phase},after:{frame:paused.after.frame,phase:paused.after.phase}})).toBe(true);expect(paused.after.phase).toBe(paused.before.phase);expect(paused.after.queuedRafs).toBe(0);
});

test('same-time duplicate whole-frame packets publish no redundant DOM mutations while later telemetry and the owned rAF advance',async({page})=>{
  await metadata(page);await mount(page);
  const result=await page.evaluate(()=>{
    const fixture=window.wholeFramePetFixture;
    fixture.packet(10,{intentMoving:true,moving:false,actualMoving:false});fixture.step(140);
    const moved=fixture.packet(156,{moving:true,actualMoving:true,distanceDip:16});
    const element=document.querySelector('.whole-frame-fixture .pet-sprite'),canvas=element.querySelector('canvas');
    const observer=new MutationObserver(()=>{});observer.observe(element,{attributes:true});observer.observe(canvas,{attributes:true});
    const duplicate=fixture.packet(156,{distanceDip:16}),duplicateMutations=observer.takeRecords().map(record=>record.attributeName);
    const advanced=fixture.packet(172,{distanceDip:17}),advancedMutations=observer.takeRecords().map(record=>record.attributeName);
    const tick=fixture.step(173),tickMutations=observer.takeRecords().map(record=>record.attributeName);observer.disconnect();
    return{moved,duplicate,advanced,tick,duplicateMutations,advancedMutations,tickMutations};
  });
  expect(result.duplicateMutations).toEqual([]);
  expect(result.duplicate.pixels).toBe(result.moved.pixels);expect(result.duplicate.phase).toBe(result.moved.phase);expect(result.duplicate.sampleTime).toBe('156');
  expect(result.advanced.motionDistance).toBe('17');expect(Number(result.advanced.phase)-Number(result.moved.phase)).toBeCloseTo(1/32,12);expect(result.advanced.sampleTime).toBe('172');
  expect(result.advancedMutations).toContain('data-motion-distance');expect(result.advancedMutations).toContain('data-phase');expect(result.advancedMutations).toContain('data-sample-time');
  expect(result.tick.phase).toBe(result.advanced.phase);expect(result.tick.sampleTime).toBe('173');expect(result.tickMutations).toEqual(['data-sample-time']);
  for(const sample of [result.moved,result.duplicate,result.advanced,result.tick]){expect(sample.queuedRafs).toBe(1);expect(sample.ready).toEqual({ready:true,epoch:1});expect(sample.nextFrame).toBe(sample.frame);expect(sample.mix).toBe('0');}
});

test('all whole pages decode atomically while the complete-photo fallback blocks travel',async({page})=>{
  await metadata(page);let release,requested;const gate=new Promise(r=>{release=r;}),seen=new Promise(r=>{requested=r;});
  await page.route('**/pets/cat-whole-v3-gait.png',async route=>{requested();await gate;await route.continue();});
  await mount(page,'cat',{wait:false});await seen;
  const pending=await page.evaluate(()=>window.wholeFramePetFixture.packet(100,{intentMoving:true,moving:true,facing:-1}));
  expect(pending.atlas).toBe('whole-fallback');expect(pending.visibility).toBe('hidden');expect(pending.ready).toEqual({ready:false,epoch:1});expect(pending.transform).toBe('scaleX(-1)');
  release();await expect(page.locator('.whole-frame-fixture canvas')).toHaveAttribute('data-renderer','whole-frame-2d');
});

for(const failure of ['missing','dimensions','metadata'])test(`whole-frame ${failure} failure never selects a body-part fallback`,async({page})=>{
  const requests=[];page.on('request',r=>requests.push(r.url()));await metadata(page,'cat',{invalid:failure==='metadata'});
  if(failure!=='metadata')await page.route('**/pets/cat-whole-v3-gait.png',route=>failure==='missing'?route.abort():route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await mount(page,'cat',{wait:false});await expect(page.locator('.whole-frame-fixture .pet-sprite')).toHaveAttribute('data-load-state','failed');
  const fallback=await page.evaluate(()=>window.wholeFramePetFixture.packet(100,{intentMoving:true,moving:true,facing:-1}));
  expect(fallback.atlas).toBe('whole-fallback');expect(fallback.visibility).toBe('hidden');expect(fallback.transform).toBe('scaleX(-1)');expect(fallback.ready).toEqual({ready:false,epoch:1});expect(fallback.background).toContain('pets/cat.png');
  expect(requests.filter(url=>/\/pets\/.*(rig|flow|ground-v2|cohesive|limbs)/.test(url))).toEqual([]);
});

test('whole-frame native paint ownership survives species changes and StrictMode cleanup',async({page})=>{
  await metadata(page,'cat');await metadata(page,'dog');await mount(page);
  await page.evaluate(()=>window.wholeFramePetFixture.species('dog'));await expect(page.locator('.whole-frame-fixture canvas')).toHaveAttribute('data-renderer','whole-frame-2d');
  expect(await page.evaluate(()=>window.wholeFramePetFixture.unmount())).toEqual({hook:null,queuedRafs:0});
});
