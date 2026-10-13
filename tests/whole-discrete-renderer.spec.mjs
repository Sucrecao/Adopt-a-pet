import {test,expect} from '@playwright/test';

test('v7 reuses a successful held picture while frame or whole-facing changes paint once',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createWholeRenderer}=await import('/src/rendering/whole-renderer.js');
    const source=document.createElement('canvas');source.width=128;source.height=64;
    const ink=source.getContext('2d');ink.fillStyle='#128fca';ink.fillRect(4,6,22,30);ink.fillStyle='#e76d33';ink.fillRect(70,12,28,24);
    const image=new Image();image.src=source.toDataURL();await image.decode();
    const clips=Object.fromEntries(['idle','rest','walk','turn','pet','feed','groom','stretch','hop'].map(name=>[name,{frames:[0],durations:[name==='turn'?800:100],loop:name!=='turn'}]));
    const meta={version:7,renderMode:'discrete-whole-frame',neutralFrame:0,pages:[{asset:'fixture.png',sourceSize:[128,64],columns:2,rows:1}],frames:[{page:0,rect:[0,0,64,64]},{page:0,rect:[64,0,64,64]}],clips};
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d'),draw=context.drawImage.bind(context);let draws=0,clears=0;
    const clear=context.clearRect.bind(context);context.clearRect=(...args)=>{clears++;return clear(...args);};context.drawImage=(...args)=>{draws++;return draw(...args);};
    const renderer=createWholeRenderer(canvas,{images:[image],meta});
    const results=[renderer.draw({frame:0,facing:1})],first=canvas.toDataURL();
    for(const sample of [{frame:0,facing:1,nextFrame:1,mix:1,ground:{mode:'walk',phase:.4}},{frame:0,facing:1,sampleTime:55,phase:.7},{frame:0}])results.push(renderer.draw(sample));
    const reused={draws,clears,pixels:canvas.toDataURL()===first};
    results.push(renderer.draw({frame:0,facing:-1}));const mirrored=canvas.toDataURL();
    results.push(renderer.draw({frame:0,facing:-1,mix:NaN}));
    const facingChanged={draws,clears,pixels:mirrored!==first};
    results.push(renderer.draw({frame:1,facing:-1}));const frameChanged={draws,clears};
    const invalid=renderer.draw({frame:9999,facing:-1});renderer.dispose();const disposed=renderer.draw({frame:1,facing:-1});
    const next=createWholeRenderer(canvas,{images:[image],meta});const fresh=next.draw({frame:1,facing:-1});const freshDraws=draws;next.dispose();
    return{results,reused,facingChanged,frameChanged,invalid,disposed,fresh,freshDraws};
  });
  expect(result.results).toEqual(Array(7).fill(true));
  expect(result.reused).toEqual({draws:1,clears:1,pixels:true});
  expect(result.facingChanged).toEqual({draws:2,clears:2,pixels:true});
  expect(result.frameChanged).toEqual({draws:3,clears:3});
  expect(result.invalid).toBe(false);expect(result.disposed).toBe(false);expect(result.fresh).toBe(true);expect(result.freshDraws).toBe(4);
});

test('v7 does not reuse a former picture after a later drawing attempt fails',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createWholeRenderer}=await import('/src/rendering/whole-renderer.js');
    const source=document.createElement('canvas');source.width=128;source.height=64;source.getContext('2d').fillRect(4,6,20,30);
    const image=new Image();image.src=source.toDataURL();await image.decode();
    const clips=Object.fromEntries(['idle','rest','walk','turn','pet','feed','groom','stretch','hop'].map(name=>[name,{frames:[0],durations:[name==='turn'?800:100],loop:name!=='turn'}]));
    const meta={version:7,renderMode:'discrete-whole-frame',neutralFrame:0,pages:[{asset:'fixture.png',sourceSize:[128,64],columns:2,rows:1}],frames:[{page:0,rect:[0,0,64,64]},{page:0,rect:[64,0,64,64]}],clips};
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d'),draw=context.drawImage.bind(context);let draws=0,fail=false;
    context.drawImage=(...args)=>{draws++;if(fail){fail=false;throw new Error('simulated canvas submission failure');}return draw(...args);};
    const renderer=createWholeRenderer(canvas,{images:[image],meta});renderer.draw({frame:0,facing:1});const first=canvas.toDataURL();
    fail=true;let threw=false;try{renderer.draw({frame:1,facing:1});}catch{threw=true;}
    const restored=renderer.draw({frame:0,facing:1}),same=canvas.toDataURL()===first;renderer.dispose();return{threw,restored,same,draws};
  });
  expect(result).toEqual({threw:true,restored:true,same:true,draws:3});
});

test('repeated disposal of a replaced renderer cannot clear the current cached picture',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createWholeRenderer}=await import('/src/rendering/whole-renderer.js');
    const source=document.createElement('canvas');source.width=source.height=64;const ink=source.getContext('2d');ink.fillStyle='#128fca';ink.fillRect(4,6,22,30);
    const image=new Image();image.src=source.toDataURL();await image.decode();
    const clips=Object.fromEntries(['idle','rest','walk','turn','pet','feed','groom','stretch','hop'].map(name=>[name,{frames:[0],durations:[name==='turn'?800:100],loop:name!=='turn'}]));
    const meta={version:7,renderMode:'discrete-whole-frame',neutralFrame:0,pages:[{asset:'fixture.png',sourceSize:[64,64],columns:1,rows:1}],frames:[{page:0,rect:[0,0,64,64]}],clips};
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d'),draw=context.drawImage.bind(context);let draws=0;
    context.drawImage=(...args)=>{draws++;return draw(...args);};
    const old=createWholeRenderer(canvas,{images:[image],meta});old.draw({frame:0,facing:1});old.dispose();
    const current=createWholeRenderer(canvas,{images:[image],meta});current.draw({frame:0,facing:1});const held=canvas.toDataURL();
    old.dispose();const retainedAfterOldDispose=canvas.toDataURL()===held,currentResult=current.draw({frame:0,facing:1}),retainedAfterCurrentDraw=canvas.toDataURL()===held;
    const oldResult=old.draw({frame:0,facing:1});current.dispose();return{retainedAfterOldDispose,currentResult,retainedAfterCurrentDraw,oldResult,draws};
  });
  expect(result).toEqual({retainedAfterOldDispose:true,currentResult:true,retainedAfterCurrentDraw:true,oldResult:false,draws:2});
});

test('v7 draws only the complete registered source frame with exact RGBA, whole mirror and uniform registration',async({page})=>{
  await page.goto('/');
  const r=await page.evaluate(async()=>{
    const {createWholeRenderer}=await import('/src/rendering/whole-renderer.js');
    const meta=await fetch('/pets/cat-whole-v5.json').then(r=>r.json());meta.version=7;meta.renderMode='discrete-whole-frame';
    for(const key of ['flow','handoffs','groundGait'])delete meta[key];
    const images=await Promise.all(meta.pages.map(p=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/'+p.asset;})));
    const source=document.createElement('canvas');source.width=source.height=256;const sc=source.getContext('2d');
    sc.fillStyle='rgb(71,123,191)';sc.fillRect(0,0,256,256);sc.clearRect(10,20,30,40);sc.fillStyle='rgba(210,60,20,.5)';sc.fillRect(10,20,30,40);
    images.push(source);meta.pages.push({asset:'fixture.png',sourceSize:[256,256],columns:1,rows:1});
    meta.frames[103]={page:3,rect:[0,0,256,256],offsetX:0,offsetY:0};
    const canvas=document.createElement('canvas'),reference=document.createElement('canvas');reference.width=reference.height=256;
    const create=document.createElement.bind(document),get=HTMLCanvasElement.prototype.getContext;let helperCanvases=0,webglRequests=0;
    document.createElement=function(name,...args){if(name==='canvas')helperCanvases++;return create(name,...args);};
    HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2')webglRequests++;return get.call(this,type,...args);};
    let renderer;
    try{
      renderer=createWholeRenderer(canvas,{images,meta});
      const ctx=canvas.getContext('2d'),ref=reference.getContext('2d'),equal=()=>{const a=ctx.getImageData(0,0,256,256).data,b=ref.getImageData(0,0,256,256).data;return a.every((v,i)=>v===b[i]);};
      renderer.draw({frame:103,nextFrame:104,mix:.37,facing:1,ground:{mode:'walk',phase:.5}});ref.drawImage(source,0,0);
      const rgbaExact=equal(),first=canvas.toDataURL(),partial=Array.from(ctx.getImageData(15,25,1,1).data);
      renderer.draw({frame:103,nextFrame:0,mix:.99,facing:1});const ignoresMix=canvas.toDataURL()===first;
      renderer.draw({frame:103,nextFrame:104,mix:.37,facing:-1});ref.clearRect(0,0,256,256);ref.save();ref.translate(256,0);ref.scale(-1,1);ref.drawImage(source,0,0);ref.restore();const mirrorExact=equal();
      const backend=canvas.dataset.renderer,ground=canvas.dataset.groundRenderer;
      const invalid=renderer.draw({frame:9999});renderer.dispose();const afterDispose=renderer.draw({frame:103});
      return {rgbaExact,partial,ignoresMix,mirrorExact,backend,ground,helperCanvases,webglRequests,invalid,afterDispose};
    }finally{renderer?.dispose();document.createElement=create;HTMLCanvasElement.prototype.getContext=get;}
  });
  expect(r.backend).toBe('whole-frame-2d');expect(r.ground).toBe('');expect(r.helperCanvases).toBe(0);expect(r.webglRequests).toBe(0);
  expect(r.rgbaExact).toBe(true);expect(r.partial[3]).toBeGreaterThan(0);expect(r.partial[3]).toBeLessThan(255);
  expect(r.ignoresMix).toBe(true);expect(r.mirrorExact).toBe(true);expect(r.invalid).toBe(false);expect(r.afterDispose).toBe(false);
});

test('v7 photographic frame103 uses only a uniform source registration and composes authored and facing mirrors',async({page})=>{
  await page.goto('/');
  const r=await page.evaluate(async()=>{
    const {createWholeRenderer}=await import('/src/rendering/whole-renderer.js');
    const meta=await fetch('/pets/dog-whole-v5.json').then(r=>r.json());meta.version=7;meta.renderMode='discrete-whole-frame';
    for(const key of ['flow','handoffs','groundGait'])delete meta[key];
    const images=await Promise.all(meta.pages.map(p=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/'+p.asset;})));
    const frame=meta.frames[103];frame.mirror=-1;frame.offsetX+=2;frame.offsetY-=3;
    const canvas=document.createElement('canvas'),reference=document.createElement('canvas');reference.width=reference.height=256;
    const renderer=createWholeRenderer(canvas,{images,meta}),ref=reference.getContext('2d');
    renderer.draw({frame:103,nextFrame:104,mix:.37,facing:-1});
    const page=meta.pages[frame.page],scale=256/Math.max(page.sourceSize[0]/page.columns,page.sourceSize[1]/page.rows)*(page.scale??1),[x,y,w,h]=frame.rect;
    ref.drawImage(images[frame.page],x,y,w,h,(256-w*scale)/2+frame.offsetX,(256-h*scale)/2+frame.offsetY,w*scale,h*scale);
    const a=canvas.getContext('2d').getImageData(0,0,256,256).data,b=ref.getImageData(0,0,256,256).data;
    const exact=a.every((v,i)=>v===b[i]),opaque=a.filter((v,i)=>i%4===3&&v>230).length;renderer.dispose();return {exact,opaque};
  });
  expect(r.exact).toBe(true);expect(r.opaque).toBeGreaterThan(5000);
});

test('v7 accepts every 1..8 page layout up to 96 pages and 1024 source frames',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createWholeRenderer,validateWholeAtlas}=await import('/src/rendering/whole-renderer.js');
    const pages=[],images=[];
    for(let index=0;index<96;index++){
      const columns=Math.floor(index%64/8)+1,rows=index%8+1,cellWidth=32,cellHeight=24;
      const source=document.createElement('canvas');source.width=columns*cellWidth;source.height=rows*cellHeight;
      const ink=source.getContext('2d');
      for(let cell=0;cell<columns*rows;cell++){
        const x=cell%columns*cellWidth,y=Math.floor(cell/columns)*cellHeight;
        ink.fillStyle=`rgb(${(index*13+cell*17)%256},${(index*29+cell*11)%256},${(index*7+cell*31)%256})`;
        ink.fillRect(x+2,y+2,cellWidth-4,cellHeight-4);ink.clearRect(x+3,y+3,5,7);
        ink.fillStyle='rgba(210,60,20,.5)';ink.fillRect(x+3,y+3,5,7);
      }
      const image=new Image();image.src=source.toDataURL();await image.decode();images.push(image);
      pages.push({asset:`page-${index}.png`,sourceSize:[image.naturalWidth,image.naturalHeight],columns,rows,scale:.5+index%3*.25});
    }
    const frames=Array.from({length:1024},(_,index)=>{
      const page=index%pages.length,descriptor=pages[page],cell=Math.floor(index/pages.length)%(descriptor.columns*descriptor.rows);
      return {page,rect:[cell%descriptor.columns*32+2,Math.floor(cell/descriptor.columns)*24+2,28,20],offsetX:index%3-1,offsetY:index%5-2,mirror:index%3===0?-1:1};
    });
    const clips=Object.fromEntries(['idle','rest','walk','turn','pet','feed','groom','stretch','hop'].map(name=>[name,{frames:[0],durations:[name==='turn'?800:100],loop:name!=='turn'}]));
    const meta={version:7,renderMode:'discrete-whole-frame',neutralFrame:0,pages,frames,clips};
    const valid=validateWholeAtlas(images,meta),canvas=document.createElement('canvas'),reference=document.createElement('canvas');reference.width=reference.height=256;
    const context=canvas.getContext('2d'),ref=reference.getContext('2d'),draw=context.drawImage.bind(context),calls=[];
    context.drawImage=function(source,...args){calls.push({page:images.indexOf(source),args});return draw(source,...args);};
    const renderer=createWholeRenderer(canvas,{images,meta}),mismatches=[];
    for(const index of [...Array.from({length:96},(_,i)=>i),1023]){
      const frame=frames[index],descriptor=pages[frame.page],scale=256/Math.max(descriptor.sourceSize[0]/descriptor.columns,descriptor.sourceSize[1]/descriptor.rows)*descriptor.scale;
      const [x,y,width,height]=frame.rect,facing=index%2?-1:1;
      renderer.draw({frame:index,nextFrame:(index+1)%1024,mix:1,facing,ground:{mode:'walk',phase:.5}});
      ref.clearRect(0,0,256,256);ref.save();
      if(facing*frame.mirror===-1){ref.translate(256,0);ref.scale(-1,1);}
      ref.drawImage(images[frame.page],x,y,width,height,(256-width*scale)/2+frame.offsetX,(256-height*scale)/2+frame.offsetY,width*scale,height*scale);ref.restore();
      const actual=context.getImageData(0,0,256,256).data,expected=ref.getImageData(0,0,256,256).data;
      if(!actual.every((value,i)=>value===expected[i]))mismatches.push(index);
    }
    renderer.dispose();
    return {valid,mismatches,calls:calls.map(call=>({page:call.page,crop:call.args.slice(0,4),argumentCount:call.args.length})),expectedPages:[...Array.from({length:96},(_,i)=>i),1023%96],expectedCrops:[...frames.slice(0,96),frames[1023]].map(frame=>frame.rect)};
  });
  expect(result.valid).toBe(true);expect(result.mismatches).toEqual([]);
  expect(result.calls.map(call=>call.page)).toEqual(result.expectedPages);
  expect(result.calls.map(call=>call.crop)).toEqual(result.expectedCrops);
  expect(result.calls.map(call=>call.argumentCount)).toEqual(Array(97).fill(8));
});

test('v7 validation requires the marker, decoded pages, finite registration and valid source clips',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {validateWholeAtlas}=await import('/src/rendering/whole-renderer.js');
    const source=document.createElement('canvas');source.width=128;source.height=64;
    const image=new Image();image.src=source.toDataURL();await image.decode();
    const clips=Object.fromEntries(['idle','rest','walk','turn','pet','feed','groom','stretch','hop'].map(name=>[name,{frames:[0],durations:[name==='turn'?800:100],loop:name!=='turn'}]));
    const meta={version:7,renderMode:'discrete-whole-frame',neutralFrame:0,pages:[{asset:'fixture.png',sourceSize:[128,64],columns:2,rows:1,scale:1}],frames:[{page:0,rect:[0,0,64,64]}],clips};
    const cases=[
      ['missing marker',m=>delete m.renderMode],['wrong marker',m=>m.renderMode='whole-flow'],
      ['no pages',m=>m.pages=[]],['page limit',m=>m.pages=Array(97).fill(m.pages[0]),Array(97).fill(image)],['no frames',m=>m.frames=[]],['frame limit',m=>m.frames=Array(1025).fill(m.frames[0])],
      ['no source size',m=>delete m.pages[0].sourceSize],['source width',m=>m.pages[0].sourceSize[0]++],['source height',m=>m.pages[0].sourceSize[1]++],['source shape',m=>m.pages[0].sourceSize.push(1)],
      ['columns minimum',m=>m.pages[0].columns=0],['columns maximum',m=>m.pages[0].columns=9],['fractional columns',m=>m.pages[0].columns=1.5],
      ['rows minimum',m=>m.pages[0].rows=0],['rows maximum',m=>m.pages[0].rows=9],['fractional rows',m=>m.pages[0].rows=1.5],
      ['no asset',m=>delete m.pages[0].asset],['empty asset',m=>m.pages[0].asset=''],
      ['zero scale',m=>m.pages[0].scale=0],['negative scale',m=>m.pages[0].scale=-1],['infinite scale',m=>m.pages[0].scale=Infinity],['excessive scale',m=>m.pages[0].scale=4.1],
      ['no frame page',m=>delete m.frames[0].page],['unknown frame page',m=>m.frames[0].page=1],['negative frame page',m=>m.frames[0].page=-1],['fractional frame page',m=>m.frames[0].page=.5],
      ['no rectangle',m=>delete m.frames[0].rect],['rectangle shape',m=>m.frames[0].rect.pop()],['negative crop x',m=>m.frames[0].rect[0]=-1],['negative crop y',m=>m.frames[0].rect[1]=-1],
      ['zero crop width',m=>m.frames[0].rect[2]=0],['zero crop height',m=>m.frames[0].rect[3]=0],['crop beyond width',m=>m.frames[0].rect[2]=129],['crop beyond height',m=>m.frames[0].rect[3]=65],['nonfinite crop',m=>m.frames[0].rect[0]=NaN],
      ['nonfinite offset x',m=>m.frames[0].offsetX=Infinity],['nonfinite offset y',m=>m.frames[0].offsetY=NaN],['invalid mirror',m=>m.frames[0].mirror=0],
      ['no neutral',m=>delete m.neutralFrame],['unknown neutral',m=>m.neutralFrame=1],['invalid stride',m=>m.stride=0],
      ['missing clip',m=>delete m.clips.feed],['unknown clip frame',m=>m.clips.walk.frames=[1]],['empty clip',m=>m.clips.idle.frames=[]],
      ['duration count',m=>m.clips.rest.durations=[]],['nonfinite duration',m=>m.clips.pet.durations=[Infinity]],['nonpositive duration',m=>m.clips.hop.durations=[0]],['invalid loop',m=>m.clips.groom.loop=1],['turn timing',m=>m.clips.turn.durations=[799]],['looping turn',m=>m.clips.turn.loop=true],
      ['transition frame',m=>m.transitions={walk:{enter:{frames:[1],durations:[100]}}}],['transition duration',m=>m.transitions={walk:{exit:{frames:[0],durations:[0]}}}],
      ...['flow','handoffs','groundGait','groundRise'].flatMap(key=>[[`${key} data`,m=>m[key]={}], [`${key} null`,m=>m[key]=null]]),
    ];
    const accepted=[];for(const [name,change,decoded=[image]] of cases){const candidate=structuredClone(meta);change(candidate);try{validateWholeAtlas(decoded,candidate);accepted.push(name);}catch{}}
    let missingDecodedPage=false;try{validateWholeAtlas([],meta);}catch{missingDecodedPage=true;}
    const allowed=structuredClone(meta);allowed.pages[0].scale=4;allowed.frames[0].offsetX=-2.5;allowed.frames[0].offsetY=3.5;allowed.frames[0].mirror=-1;
    allowed.transitions={walk:{enter:{frames:[0],durations:[100]},exit:{frames:[0],durations:[100]}}};
    return {valid:validateWholeAtlas([image],meta),allowed:validateWholeAtlas([image],allowed),missingDecodedPage,accepted};
  });
  expect(result.valid).toBe(true);expect(result.allowed).toBe(true);expect(result.missingDecodedPage).toBe(true);expect(result.accepted).toEqual([]);
});

test('v7 invalid draws leave the held source unchanged and disposal clears it without touching sources',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {createWholeRenderer}=await import('/src/rendering/whole-renderer.js');
    const source=document.createElement('canvas');source.width=source.height=256;const ink=source.getContext('2d');ink.fillStyle='#128fca';ink.fillRect(40,50,30,40);
    const image=new Image();image.src=source.toDataURL();await image.decode();
    const clips=Object.fromEntries(['idle','rest','walk','turn','pet','feed','groom','stretch','hop'].map(name=>[name,{frames:[0],durations:[name==='turn'?800:100],loop:name!=='turn'}]));
    const meta={version:7,renderMode:'discrete-whole-frame',neutralFrame:0,pages:[{asset:'fixture.png',sourceSize:[256,256],columns:1,rows:1}],frames:[{page:0,rect:[0,0,256,256]}],clips};
    const canvas=document.createElement('canvas'),renderer=createWholeRenderer(canvas,{images:[image],meta});
    const draw=renderer.draw({frame:0,facing:1,nextFrame:9999,mix:NaN}),held=canvas.toDataURL();
    const invalid=[undefined,{}, {frame:-1},{frame:.5},{frame:1},{frame:NaN}].map(sample=>renderer.draw(sample));
    const unchanged=canvas.toDataURL()===held;renderer.dispose();renderer.dispose();
    const cleared=canvas.getContext('2d').getImageData(0,0,256,256).data.every(value=>value===0),afterDispose=renderer.draw({frame:0});
    return {draw,invalid,unchanged,cleared,afterDispose,sourceSize:[image.naturalWidth,image.naturalHeight],sourcePixel:Array.from(ink.getImageData(50,60,1,1).data)};
  });
  expect(result.draw).toBe(true);expect(result.invalid).toEqual(Array(6).fill(false));expect(result.unchanged).toBe(true);expect(result.cleared).toBe(true);expect(result.afterDispose).toBe(false);
  expect(result.sourceSize).toEqual([256,256]);expect(result.sourcePixel).toEqual([18,143,202,255]);
});
