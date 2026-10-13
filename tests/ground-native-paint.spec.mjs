import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function mount(page,species='cat',{waitGround=true}={}) {
  await page.route('**/native-paint-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>Native paint fixture</title></head><body></body></html>'}));
  await page.goto('/native-paint-fixture');
  await page.evaluate(async species=>{
    const {default:RefreshRuntime}=await import('/@react-refresh');
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
    window.__vite_plugin_react_preamble_installed__=true;
    const [{default:React},{default:ReactDOMClient},{default:ReactDOM},{default:Pet},{PETS}]=await Promise.all([
      import('/node_modules/.vite/deps/react.js'),import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/node_modules/.vite/deps/react-dom.js'),import('/src/Pet.jsx'),import('/src/core/pets.js'),
    ]);
    let now=0,id=0;const callbacks=new Map();
    Math.random=()=>.99;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
    window.requestAnimationFrame=callback=>{const key=++id;callbacks.set(key,callback);return key;};
    window.cancelAnimationFrame=key=>callbacks.delete(key);
    const host=document.createElement('div');host.className='native-paint-fixture';document.body.append(host);
    let root=ReactDOMClient.createRoot(host);
    const locomotionRef={current:{epoch:1,distanceDip:0,spriteSizeDip:256,facing:1,moving:false,intentMoving:false}};
    const motionPaintRef={current:null};
    const select=id=>({...PETS.find(p=>p.id===id),wholeRenderMode:undefined,wholeMetaAsset:`pets/${id}-whole-v6.json`});
    let props={pet:select(species),size:256,locomotionRef,motionPaintRef};
    const render=()=>ReactDOM.flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Pet,props))));
    const snapshot=()=>{
      const pet=host.querySelector('.pet-sprite');
      return pet?{...pet.dataset,pixels:pet.querySelector('canvas').toDataURL(),backend:pet.querySelector('canvas').dataset.groundRenderer}:null;
    };
    render();
    window.nativePaintFixture={
      snapshot,
      step(time,motion={}){now=time;Object.assign(locomotionRef.current,motion);const jobs=[...callbacks.values()];callbacks.clear();jobs.forEach(job=>job(now));return snapshot();},
      packet(time,motion){now=time;Object.assign(locomotionRef.current,motion);motionPaintRef.current?.();return {hook:typeof motionPaintRef.current,queuedRafs:callbacks.size,...snapshot()};},
      species(id){props={...props,pet:select(id)};render();},
      unmount(){ReactDOM.flushSync(()=>root.unmount());return {hook:motionPaintRef.current,queuedRafs:callbacks.size};},
      remount(id){root=ReactDOMClient.createRoot(host);props={...props,pet:select(id)};render();},
    };
  },species);
  if(waitGround)await expect(page.locator('.native-paint-fixture canvas')).toHaveAttribute('data-ground-renderer','jointed-surface-webgl');
}

for(const species of ['cat','dog'])test(`${species}: accepted native travel paints synchronously before another animation frame`,async({page})=>{
  await mount(page,species);
  const result=await page.evaluate(()=>{
    const f=window.nativePaintFixture;
    f.step(10,{moving:true,intentMoving:true,actualMoving:true});
    const ready=f.step(170);
    const moved=f.packet(186,{distanceDip:16});
    const duplicate=f.packet(186,{distanceDip:16});
    return {ready,moved,duplicate};
  });
  expect(result.moved.hook).toBe('function');
  expect(result.moved.motionDistance).toBe('16');
  expect(Number(result.moved.phase)-Number(result.ready.phase)).toBeCloseTo(16/(species==='cat'?48:46),9);
  expect(result.moved.pixels).not.toBe(result.ready.pixels);
  expect(result.duplicate.pixels).toBe(result.moved.pixels);
  expect(result.moved.queuedRafs).toBe(1);expect(result.duplicate.queuedRafs).toBe(1);
  const paused=await page.evaluate(()=>{
    const f=window.nativePaintFixture;
    const before=f.packet(190,{paused:true});
    const after=f.packet(5000,{paused:true,distanceDip:16});
    return {before,after};
  });
  expect(paused.after.pixels).toBe(paused.before.pixels);
  expect(paused.after.phase).toBe(paused.before.phase);
});

async function declaredContour(page) {
  const meta=JSON.parse(await readFile('public/pets/cat-whole-v6.json'));
  meta.flow.contours=[{version:1,pair:[0,1],asset:'pets/fixture-contour.png',encoding:'opaque-rgb-temporal-coverage',samples:65,frameSize:256,columns:4,rows:6,gutter:2,sourceSize:[1040,1560]}];
  await page.route('**/pets/cat-whole-v6.json',route=>route.fulfill({json:meta}));
}

test('v6 Pet waits for the separately decoded contour before promoting the complete group',async({page})=>{
  await declaredContour(page);
  let release;const deferred=new Promise(resolve=>{release=resolve;});
  let requested;const seen=new Promise(resolve=>{requested=resolve;});
  await page.route('**/pets/fixture-contour.png',async route=>{
    requested();await deferred;
    await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="1560"><rect width="1040" height="1560" fill="black"/></svg>'});
  });
  await mount(page,'cat',{waitGround:false});await seen;
  await expect(page.locator('.native-paint-fixture .pet-sprite')).not.toHaveAttribute('data-atlas','whole');
  release();await expect(page.locator('.native-paint-fixture canvas')).toHaveAttribute('data-ground-renderer','jointed-surface-webgl');
});

for(const failure of ['missing','dimensions'])test(`v6 contour ${failure} keeps the complete earlier rig instead of a partial whole group`,async({page})=>{
  await declaredContour(page);
  await page.route('**/pets/fixture-contour.png',route=>failure==='missing'?route.abort():route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="black"/></svg>'}));
  await mount(page,'cat',{waitGround:false});
  await expect(page.locator('.native-paint-fixture .pet-sprite')).toHaveAttribute('data-atlas','rig');
  await expect(page.locator('.native-paint-fixture canvas')).toHaveAttribute('data-renderer','rig-2d');
});

test('native paint callback follows species, StrictMode cleanup and unmount',async({page})=>{
  await mount(page);
  await page.evaluate(()=>window.nativePaintFixture.species('dog'));
  await expect(page.locator('.native-paint-fixture canvas')).toHaveAttribute('data-ground-renderer','jointed-surface-webgl');
  const changed=await page.evaluate(()=>{
    const f=window.nativePaintFixture;
    f.step(10,{moving:true,intentMoving:true,actualMoving:true});f.step(170);
    return f.packet(186,{distanceDip:16});
  });
  expect(changed.hook).toBe('function');expect(Number(changed.phase)).toBeCloseTo(.65+16/46,9);
  const released=await page.evaluate(()=>window.nativePaintFixture.unmount());
  expect(released).toEqual({hook:null,queuedRafs:0});
  await page.evaluate(()=>window.nativePaintFixture.remount('cat'));
  await expect(page.locator('.native-paint-fixture canvas')).toHaveAttribute('data-ground-renderer','jointed-surface-webgl');
  const remounted=await page.evaluate(()=>window.nativePaintFixture.packet(5100,{distanceDip:16}));
  expect(remounted.hook).toBe('function');
  expect(await page.evaluate(()=>window.nativePaintFixture.unmount())).toEqual({hook:null,queuedRafs:0});
});
