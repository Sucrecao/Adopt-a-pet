import { test, expect } from '@playwright/test';

async function probe(page, mode = 'frames') {
  await page.goto('/');
  return page.evaluate(async mode => {
    const module = await import('/src/rendering/whole-renderer.js').catch(() => ({}));
    if (typeof module.createWholeRenderer !== 'function' || typeof module.validateWholeAtlas !== 'function') return { available: false };
    const clips = {
      idle: { frames:[0,1,2,3,4,5], durations:[1680,660,660,840,840,1920], loop:true },
      rest: { frames:[6,7], durations:[2800,2800], loop:true },
      walk: { frames:[8,9,10,11,12,13,14,15], durations:[120,120,120,120,120,120,120,220], loop:true },
      turn: { frames:[16,17,18,19,20,21,22,23], durations:Array(8).fill(100), loop:false },
      pet: { frames:[24,25,26,27], durations:[300,600,500,400], loop:false },
      feed: { frames:[28,29,30,31], durations:[300,350,350,500], loop:true },
      groom: { frames:[32,33,34,35], durations:[300,500,500,400], loop:false },
      stretch: { frames:[36,37,38,39], durations:[250,700,600,450], loop:false },
      hop: { frames:[40,41,42,43,44], durations:[140,140,140,140,280], loop:false },
    };
    const cellWidth = mode === 'aspect' ? 320 : 256, cellHeight = mode === 'aspect' ? 160 : 256;
    const source = document.createElement('canvas'); source.width = cellWidth * 8; source.height = cellHeight * 6;
    const ink = source.getContext('2d'); ink.fillStyle = '#e0523d'; ink.fillRect(40, 40, 80, 40);
    ink.fillStyle = '#00a060'; ink.fillRect(40, 40, 10, 10);
    ink.fillStyle = '#367fc9'; ink.fillRect(cellWidth + 140, 80, 60, 80);
    const image = new Image(); image.src = source.toDataURL(); await image.decode();
    const meta = { version:1, columns:8, rows:6, sourceSize:[source.width,source.height], clips,
      frames:Array.from({length:48}, (_, frame) => ({ rect:[frame%8*cellWidth,Math.floor(frame/8)*cellHeight,cellWidth,cellHeight], offsetX:0, offsetY:0 })) };
    if (mode === 'invalid') {
      const validate = change => { const value = structuredClone(meta); change(value); try { module.validateWholeAtlas(image,value); return false; } catch { return true; } };
      return { available:true, valid:module.validateWholeAtlas(image,meta), rejected:[
        validate(m => m.sourceSize[0]++), validate(m => m.columns = 6), validate(m => m.frames.pop()),
        validate(m => m.frames[0].rect[2] = 0), validate(m => m.frames[0].rect[0] = -1),
        validate(m => m.frames[47].rect[2] += 100), validate(m => m.frames[0].offsetY = Infinity),
        validate(m => m.scale = -1), validate(m => m.clips.idle.frames[0] = 48),
        validate(m => m.clips.idle.durations.pop()), validate(m => m.clips.turn.durations[0] = 101),
        validate(m => m.frames[0].mirror = 0),
      ] };
    }
    if (mode === 'aspect') { meta.scale = .5; meta.frames[0].offsetX = 10; meta.frames[0].offsetY = 12; }
    if (mode === 'registeredMirror') meta.frames[0].mirror = -1;
    const canvas = document.createElement('canvas'); const renderer = module.createWholeRenderer(canvas,{ image,meta });
    const pixels = () => {
      const bytes = canvas.getContext('2d').getImageData(0,0,256,256).data;
      const at = (x,y) => Array.from(bytes.slice((y*256+x)*4,(y*256+x)*4+4));
      let left=256,right=-1,top=256,bottom=-1,opaque=0;
      for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(bytes[(y*256+x)*4+3]===255){ left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);opaque++; }
      return { hash:canvas.toDataURL(), corner:at(0,0), old:at(80,60), next:at(170,100), marker:at(45,45), mirroredMarker:at(210,45), bounds:[left,top,right-left+1,bottom-top+1], opaque };
    };
    const draw = renderer.draw({ frame:0,clip:'idle',facing:1 }); const first = pixels();
    if(mode === 'aspect') { renderer.dispose(); return { available:true,draw,first }; }
    renderer.draw({ frame:1,clip:'idle',facing:1,nextFrame:0,mix:.5 }); const second = pixels();
    renderer.draw({ frame:0,clip:'idle',facing:-1 }); const mirrored = pixels();
    renderer.draw({ frame:0,clip:'idle',facing:-1,stopped:true }); const held = pixels();
    renderer.draw({ frame:0,clip:'idle',facing:-1,stopped:true },10000); const later = pixels();
    const invalidDraw = renderer.draw({ frame:48,facing:1 });
    const backend = canvas.dataset.renderer; const size = [canvas.width,canvas.height];
    renderer.dispose(); const disposed = pixels(); const afterDispose = renderer.draw({ frame:0,facing:1 }); renderer.dispose();
    return { available:true,draw,backend,size,first,second,mirrored,held,later,invalidDraw,disposed,afterDispose };
  }, mode);
}

test('whole renderer selects one opaque intact frame and clears transparent surroundings', async ({ page }) => {
  const result = await probe(page); expect(result.available).toBe(true);
  expect(result.draw).toBe(true); expect(result.backend).toBe('whole-2d'); expect(result.size).toEqual([256,256]);
  expect(result.first.old[3]).toBe(255); expect(result.first.next[3]).toBe(0);
  expect(result.second.old[3]).toBe(0); expect(result.second.next[3]).toBe(255);
  expect(result.second.corner[3]).toBe(0); expect(result.second.opaque).toBe(60*80);
});

test('whole mirroring preserves every source pixel without blending or part transforms', async ({ page }) => {
  const result = await probe(page); expect(result.available).toBe(true);
  expect(result.first.marker).toEqual([0,160,96,255]);
  expect(result.mirrored.mirroredMarker).toEqual(result.first.marker); expect(result.mirrored.marker[3]).toBe(0);
  expect(result.mirrored.opaque).toBe(result.first.opaque); expect(result.later.hash).toBe(result.held.hash);
});

test('global uniform scale and registration offsets retain a non-square source aspect ratio', async ({ page }) => {
  const result = await probe(page,'aspect'); expect(result.available).toBe(true); expect(result.draw).toBe(true);
  expect(result.first.bounds).toEqual([90,124,32,16]); expect(result.first.corner[3]).toBe(0);
});

test('a registered source mirror composes with the whole-character facing mirror', async ({ page }) => {
  const result = await probe(page,'registeredMirror'); expect(result.available).toBe(true);
  expect(result.first.mirroredMarker).toEqual([0,160,96,255]); expect(result.first.marker[3]).toBe(0);
  expect(result.mirrored.marker).toEqual([0,160,96,255]); expect(result.mirrored.mirroredMarker[3]).toBe(0);
});

test('atlas validation rejects incompatible image dimensions, rects, clips and native turn timing', async ({ page }) => {
  const result = await probe(page,'invalid'); expect(result.available).toBe(true); expect(result.valid).toBe(true);
  expect(result.rejected).toEqual(Array(12).fill(true));
});

test('invalid samples and disposal return false and disposed canvases are clear', async ({ page }) => {
  const result = await probe(page); expect(result.available).toBe(true);
  expect(result.invalidDraw).toBe(false); expect(result.afterDispose).toBe(false); expect(result.disposed.opaque).toBe(0);
});

async function denseProbe(page) {
  await page.goto('/');
  return page.evaluate(async () => {
    const { createWholeRenderer, validateWholeAtlas } = await import('/src/rendering/whole-renderer.js');
    const images = await Promise.all([256,320].map(async (cell, index) => {
      const source = document.createElement('canvas'); source.width = cell * 8; source.height = cell * 6;
      const ink = source.getContext('2d'); ink.fillStyle = index ? '#367fc9' : '#e0523d';
      const margin=(cell-256)/2;ink.fillRect(40+margin,40+margin,80,40); ink.fillStyle = '#00a060'; ink.fillRect(40+margin,40+margin,10,10);
      const image = new Image(); image.src = source.toDataURL(); await image.decode(); return image;
    }));
    const clip = (first,count,total,loop=false) => ({ frames:Array.from({length:count},(_,i)=>first+i), durations:Array(count).fill(total/count), loop });
    const meta = { version:2, neutralFrame:0, pages:images.map((image,index) => ({ asset:`page-${index}.png`, sourceSize:[image.width,image.height], columns:8,rows:6,scale:index ? 1.25 : 1 })),
      frames:Array.from({length:96},(_,i)=>({page:Math.floor(i/48),rect:[i%8*(i<48?256:320),Math.floor(i%48/8)*(i<48?256:320),i<48?256:320,i<48?256:320],offsetX:0,offsetY:0})),
      clips:{idle:clip(0,12,6600,true),rest:clip(12,4,5600,true),walk:clip(16,16,1060,true),turn:clip(32,16,800),pet:clip(48,8,2400),feed:clip(56,8,1600,true),groom:clip(64,8,1700),stretch:clip(72,8,2600),hop:clip(80,10,2800)},
      transitions:{walk:{enter:{frames:[95,94],durations:[60,60]}}} };
    const rejected = change => { const value = structuredClone(meta); change(value); try { validateWholeAtlas(images,value);return false; } catch {return true;} };
    const invalid = [rejected(m=>m.frames[48].page=2),rejected(m=>m.frames[48].rect[2]=3000),rejected(m=>m.pages[1].sourceSize[0]++),rejected(m=>m.pages[1].scale=0),rejected(m=>m.frames.pop()),rejected(m=>m.neutralFrame=96),rejected(m=>m.transitions.walk.enter.frames[0]=96)];
    let missingRejected=false;try{validateWholeAtlas(images.slice(0,1),meta);}catch{missingRejected=true;}
    const valid=validateWholeAtlas(images,meta), canvas=document.createElement('canvas');
    const renderer=createWholeRenderer(canvas,{image:images[0],images,meta});
    const pixel=(x,y)=>Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data);
    renderer.draw({frame:0,facing:1});const first=pixel(80,60);
    renderer.draw({frame:48,facing:1,nextFrame:0,mix:.5});const second=pixel(80,60),marker=pixel(45,45),corner=pixel(0,0);
    renderer.draw({frame:48,facing:-1});const mirrored=pixel(210,45);
    return {valid,invalid,missingRejected,first,second,marker,corner,mirrored,size:[canvas.width,canvas.height],backend:canvas.dataset.renderer};
  });
}

test('v2 renders either decoded page with its registered uniform scale and intact mirror', async ({ page }) => {
  const result = await denseProbe(page);
  expect(result.valid).toBe(true);expect(result.backend).toBe('whole-2d');expect(result.size).toEqual([256,256]);
  expect(result.first).toEqual([224,82,61,255]);expect(result.second).toEqual([54,127,201,255]);
  expect(result.marker).toEqual([0,160,96,255]);expect(result.mirrored).toEqual(result.marker);expect(result.corner[3]).toBe(0);
});

test('v2 validation rejects absent pages and invalid page crops, scales, neutral or bridge frames', async ({ page }) => {
  const result = await denseProbe(page);expect(result.missingRejected).toBe(true);expect(result.invalid).toEqual(Array(7).fill(true));
});
