import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PETS } from '../src/core/pets.js';

// Finite checkout-only integration diagnostic. Own profile and process; no
// installed application, persistent user profile, or desktop input is changed.
const species = process.env.PAWPAL_VISUAL_SPECIES || 'cat';
const executablePath=process.env.PAWPAL_PACKAGED_EXECUTABLE;
const definition = PETS.find(pet => pet.id === species);
assert.equal(definition?.presentation, 'visual-root-v1', 'Probe requires a catalog pet with visual root presentation');
const artifacts = ['maltese', 'golden'].includes(species) ? 'couple-puppies' : 'line-pets';
const output = path.resolve(`.artifacts/${artifacts}/visual-${executablePath?'packaged':'desktop'}-${species}`);
await mkdir(output, { recursive:true });
const profile = await mkdtemp(path.join(tmpdir(), 'pawpal-visual-root-'));
let app;
const deadline = setTimeout(() => { app?.close().catch(() => {}); }, 60000);
const report = { species, packaged:Boolean(executablePath), clockKind:'visual-root-v1', definition:'Successful browser whole-frame/root commits; not WindowServer scanout timestamps.', scenarios:[] };
report.startedAt=new Date().toISOString();
async function motion(overlay) { return (await overlay.evaluate(() => window.companion.getState())).motion; }
async function wait(overlay,predicate) {
  const end=Date.now()+6000;
  while(Date.now()<end) { const value=await motion(overlay); if(predicate(value))return value; await overlay.waitForTimeout(30); }
  throw new Error('Visual desktop motion barrier timed out');
}
async function sample(overlay,duration) {
  return overlay.evaluate(duration=>new Promise(resolve=>{
    const rows=[],start=performance.now();
    function tick(now) {
      const root=document.querySelector('.pet-overlay'),pet=root.querySelector('.pet-sprite');
      rows.push({now,sequence:Number(root.dataset.visualSequence),origin:JSON.parse(root.dataset.visualOrigin||'null'),
        distance:Number(root.dataset.visualDistance),frame:Number(pet.dataset.frame),phase:Number(pet.dataset.phase),
        sourceDistance:Number(pet.dataset.motionDistance),clip:pet.dataset.clip,transition:pet.dataset.transition,
        turning:pet.dataset.turning==='true',sourceEpoch:pet.dataset.motionEpoch,renderer:pet.querySelector('canvas').dataset.renderer,
        failedDraws:Number(root.dataset.visualFailedDraws||0),decodedBytes:Number(pet.dataset.decodedBytes||0)});
      if(now-start<duration)requestAnimationFrame(tick);else resolve(rows);
    } requestAnimationFrame(tick);
  }),duration);
}
async function surface(name) {
  const capture=await app.evaluate(async({BrowserWindow})=>{
    const pet=BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().includes('view=pet'));
    return {png:(await pet.webContents.capturePage()).toPNG().toString('base64'),bounds:pet.getBounds()};
  });
  await writeFile(path.join(output,`${name}.png`),Buffer.from(capture.png,'base64'));
  return {file:`${name}.png`,bounds:capture.bounds};
}
try {
  report.provenance=Object.fromEntries(await Promise.all(['electron/main.cjs','electron/security.cjs','electron/preload.cjs',
    'src/App.jsx','src/Pet.jsx','src/core/visual-motion.js','src/core/line-animation.js','src/rendering/whole-renderer.js',
    `public/${definition.wholeMetaAsset}`].map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  app=await electron.launch({...executablePath?{executablePath,args:[]}:{args:['.']},env:{...process.env,VITE_DEV_SERVER_URL:undefined,PAWPAL_TEST_USER_DATA:profile}});
  assert.equal(await app.evaluate(({app})=>app.isPackaged),Boolean(executablePath));
  const panel=await app.firstWindow();await panel.waitForFunction(()=>window.companion?.isDesktop);
  await panel.evaluate(species=>window.companion.dispatch({type:'adopt',species,name:'有限验证'}),species);
  let overlay;
  for(let attempt=0;attempt<100;attempt++) {
    overlay=app.windows().find(window=>window.url().includes('view=pet'));
    if(overlay)break;await panel.waitForTimeout(30);
  }
  assert.ok(overlay);await overlay.waitForFunction(()=>document.querySelector('.pet-sprite')?.dataset.loadState==='ready');
  const initial=await motion(overlay);assert.equal(initial.clockKind,'visual-root-v1');
  await app.evaluate(({BrowserWindow,screen})=>{
    const pet=BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().includes('view=pet'));
    const record={cursor:{x:-9999,y:-9999},positionCalls:0,boundsCalls:0,journal:[],display:screen.getDisplayMatching(pet.getBounds())};
    globalThis.pawpalVisualDiagnostic=record;screen.getCursorScreenPoint=()=>record.cursor;Math.random=()=>.99;
    const position=pet.setPosition.bind(pet),bounds=pet.setBounds.bind(pet),send=pet.webContents.send.bind(pet.webContents);
    pet.setPosition=(...args)=>{record.positionCalls++;return position(...args);};
    pet.setBounds=(...args)=>{record.boundsCalls++;return bounds(...args);};
    pet.webContents.send=(channel,...args)=>{if(channel==='companion:motion')record.journal.push({wallNow:Date.now(),bounds:pet.getBounds(),motion:args[0]});return send(channel,...args);};
  });
  await panel.evaluate(()=>window.companion.dispatch({type:'settings',patch:{paused:true}}));
  const area=initial.visual.host,anchor={x:area.x+Math.min(1150,area.width-350)+.125,y:area.y+Math.min(200,area.height-370)};
  await overlay.evaluate(point=>window.companion.movePet(point),anchor);await overlay.waitForTimeout(150);
  const holdA=await sample(overlay,150);report.scenarios.push({name:'fractional-hold-A',rows:holdA,surface:await surface('hold-A')});
  await overlay.evaluate(point=>window.companion.movePet(point),{...anchor,x:anchor.x+.25});await overlay.waitForTimeout(150);
  const holdB=await sample(overlay,150);report.scenarios.push({name:'fractional-hold-B',rows:holdB,surface:await surface('hold-B')});
  assert.equal(holdB.at(-1).origin.x-holdA.at(-1).origin.x,.25);
  const heldHost=(await motion(overlay)).visual.host;
  await overlay.evaluate(()=>document.querySelector('.pet-sprite').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  await overlay.waitForTimeout(80);
  const localRects=await overlay.evaluate(()=>{
    const root=document.querySelector('.pet-overlay').getBoundingClientRect();
    return [...document.querySelectorAll('.overlay-sprite-box,.overlay-toolbar')].map(element=>{const b=element.getBoundingClientRect();return {x:b.x-root.x,y:b.y-root.y,width:b.width,height:b.height};});
  });
  assert.ok(localRects.every(rect=>rect.x>=0&&rect.y>=0&&rect.x+rect.width<=340.01&&rect.y+rect.height<=360.01));
  report.localHitRects=localRects;
  await overlay.evaluate(()=>document.querySelector('.pet-sprite').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  await panel.evaluate(()=>window.companion.dispatch({type:'settings',patch:{paused:false}}));
  const starting=await motion(overlay);
  await app.evaluate((_electron,point)=>{globalThis.pawpalVisualDiagnostic.cursor=point;},
    {x:Math.round(starting.visual.rectGlobal.x+starting.visual.rectGlobal.width/2+250),y:Math.round(starting.visual.rectGlobal.y+starting.visual.rectGlobal.height*.6)});
  await panel.evaluate(()=>window.companion.dispatch({type:'interact',action:'play'}));
  await wait(overlay,value=>value.moving);const walk=await sample(overlay,1800);
  const traveling=walk.filter((row,index)=>index&&row.distance>walk[index-1].distance);
  assert.ok(traveling.length>20,'renderer submitted distinct fractional travel');
  assert.ok(traveling.some(row=>!Number.isInteger(row.origin.x)));
  assert.ok(walk.every(row=>Math.abs(row.distance-row.sourceDistance)<.00001));
  assert.ok(walk.every(row=>row.renderer==='whole-frame-2d'));
  report.scenarios.push({name:'forward-walk',rows:walk,surface:await surface('walk')});
  const faultBefore=await overlay.evaluate(()=>{
    const root=document.querySelector('.pet-overlay'),canvas=root.querySelector('canvas');
    const original=CanvasRenderingContext2D.prototype.drawImage;
    const before={png:canvas.toDataURL(),failedDraws:Number(root.dataset.visualFailedDraws||0)};
    CanvasRenderingContext2D.prototype.drawImage=function(...args) {
      if(this.canvas!==canvas&&this.canvas.width===256&&this.canvas.height===256)throw new Error('Finite diagnostic staged draw fault');
      return original.apply(this,args);
    };
    window.restoreVisualDrawFault=()=>{CanvasRenderingContext2D.prototype.drawImage=original;};
    return before;
  });
  const failedPaints=await sample(overlay,220);
  const faultAfter=await overlay.evaluate(()=>{
    const root=document.querySelector('.pet-overlay');
    const after={png:root.querySelector('canvas').toDataURL(),failedDraws:Number(root.dataset.visualFailedDraws||0)};
    window.restoreVisualDrawFault();delete window.restoreVisualDrawFault;return after;
  });
  assert.ok(faultAfter.failedDraws>faultBefore.failedDraws,'real staged canvas faults reach the motion transaction');
  assert.equal(faultAfter.png,faultBefore.png,'staged draw failure retains exact previous whole-picture pixels');
  assert.equal(new Set(failedPaints.map(row=>JSON.stringify([row.origin,row.distance]))).size,1,'failed pictures never move or charge the visual root');
  report.scenarios.push({name:'staged-draw-failure',rows:failedPaints,failureCount:faultAfter.failedDraws-faultBefore.failedDraws,exactHeldPicture:true});
  await panel.evaluate(()=>window.companion.dispatch({type:'interact',action:'pet'}));
  await wait(overlay,value=>!value.moving&&!value.intentMoving);
  const coldStop=await sample(overlay,900);
  assert.equal(new Set(coldStop.map(row=>JSON.stringify([row.origin,row.distance]))).size,1,'source loading and authored settle keep visual root stationary');
  assert.ok(coldStop.every(row=>row.decodedBytes<=32*1024*1024),'decoded source cache stays within its budget');
  report.scenarios.push({name:'authored-stop-care',rows:coldStop});
  await panel.evaluate(()=>window.companion.dispatch({type:'interact',action:'play'}));
  await wait(overlay,value=>value.moving);
  for(const barrier of ['paused','reduced','dragging']) {
    if(barrier==='paused')await panel.evaluate(()=>window.companion.dispatch({type:'settings',patch:{paused:true}}));
    if(barrier==='reduced')await overlay.emulateMedia({reducedMotion:'reduce'});
    if(barrier==='dragging')await overlay.evaluate(()=>window.companion.beginDrag());
    await wait(overlay,value=>barrier==='dragging'?value.dragging:value.paused);await overlay.waitForTimeout(100);
    const frozen=await sample(overlay,250);
    assert.equal(new Set(frozen.map(row=>JSON.stringify([row.origin,row.distance,row.frame,row.phase]))).size,1,`${barrier} freezes root, source frame and phase`);
    report.scenarios.push({name:barrier,rows:frozen});
    if(barrier==='paused')await panel.evaluate(()=>window.companion.dispatch({type:'settings',patch:{paused:false}}));
    if(barrier==='reduced')await overlay.emulateMedia({reducedMotion:'no-preference'});
    if(barrier==='dragging')await overlay.evaluate(()=>window.companion.endDrag());
  }
  await wait(overlay,value=>!value.paused&&!value.dragging);
  await overlay.evaluate(()=>window.companion.movePet({x:0,y:200}));
  await panel.evaluate(()=>window.companion.dispatch({type:'settings',patch:{size:1.5,movement:'edge'}}));
  const resized=await motion(overlay);assert.equal(resized.visual.rectGlobal.width,510);
  assert.equal(resized.visual.rectGlobal.y,resized.visual.host.y+resized.visual.host.height-540);
  assert.equal(resized.distanceDip,0);report.resized=resized;
  report.native=await app.evaluate(()=>globalThis.pawpalVisualDiagnostic);
  assert.equal(report.native.positionCalls,0,'ordinary visual presentation never moves native host');
  const walkingJournal=report.native.journal.filter(row=>row.motion.moving&&row.motion.visual.rectGlobal.width===340);
  assert.ok(walkingJournal.every(row=>JSON.stringify(row.bounds)===JSON.stringify(heldHost)));
  report.status='passed';
} catch(error) { report.status='failed';report.error=error.stack;throw error; }
finally {
  clearTimeout(deadline);if(app)await app.close().catch(()=>{});
  await rm(profile,{recursive:true,force:true});report.profileRemoved=true;
  report.completedAt=new Date().toISOString();
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({status:report.status,scenarios:report.scenarios.map(row=>({name:row.name,count:row.rows.length})),output}));
