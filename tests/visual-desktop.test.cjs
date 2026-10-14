const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

async function harness() {
  const [geometry, motionModule, core, gait] = await Promise.all([
    import('../src/core/geometry.js'), import('../src/core/motion.js'), import('../src/core/state.js'), import('../src/core/gait.js')]);
  const mainPath = path.join(__dirname, '../electron/main.cjs'), mainRequire = createRequire(mainPath);
  const area = { x:-1400, y:20, width:2000, height:1000 };
  let bounds = {...area}, cursor = {x:-1300,y:30}, now = 1000, positionCalls = 0;
  const handlers = {}, listeners = {}, events = [], mainFrame = {};
  const window = { isDestroyed:()=>false, isVisible:()=>true, getBounds:()=>({...bounds}),
    setBounds:value=>{bounds={...value};}, setPosition:()=>{positionCalls++;},
    setAlwaysOnTop:()=>{}, setIgnoreMouseEvents:()=>{}, hide:()=>{},
    webContents:{mainFrame,send:(channel,value)=>events.push({channel,value})} };
  const electron = { app:{isPackaged:true,requestSingleInstanceLock:()=>false,quit:()=>{}},
    ipcMain:{handle:(key,fn)=>{handlers[key]=fn;},on:(key,fn)=>{listeners[key]=fn;}},
    screen:{getDisplayMatching:rect=>{for(const value of Object.values(rect))assert.ok(Number.isInteger(value),'display lookup uses native integer rectangle');return {id:1,workArea:area};},getDisplayNearestPoint:()=>({id:1,workArea:area}),getCursorScreenPoint:()=>cursor} };
  class Clock extends Date { static now() {return now;} }
  const context = vm.createContext({require:name=>name==='electron'?electron:mainRequire(name),
    __dirname:path.dirname(mainPath),process:{env:{}},console,Date:Clock,setTimeout:()=>1,clearTimeout:()=>{},window,geometry,motionModule,core,gait,area});
  const run = code=>vm.runInContext(code,context);
  run(fs.readFileSync(mainPath,'utf8')+`
    petWindow=window; clampWindow=geometry.clampWindow; advanceMotion=motionModule.advanceMotion;
    desktopSpriteSize=gait.desktopSpriteSize; gaitSpeedDip=gait.gaitSpeedDip; transition=core.transition;
    chooseTarget=()=>({x:100,y:500});
    state={...core.createState(Date.now()),adopted:true,species:'cat',settings:{size:1,movement:'free',paused:false,alwaysOnTop:true}};
    petCatalog=[{id:'cat',presentation:'visual-root-v1'},{id:'parrot'}];
    visualRect={x:-300,y:500,width:340,height:360}; visualGeometrySeq=1;
    resetMotion(); target={x:100,y:500}; wanderAt=Date.now()+60000; registerIPC();
  `);
  const event = {sender:window.webContents,senderFrame:mainFrame};
  return {run,area,events,bounds:()=>({...bounds}),positionCalls:()=>positionCalls,
    tick(ms=16){now+=ms;run('movementTick()');}, pointer(point){cursor=point;run('pointerTick()');},
    snapshot(){return JSON.parse(run('JSON.stringify(snapshot())'));},
    ready(value){return handlers['companion:playback-ready'](event,value);},
    commit(value){listeners['companion:visual-commit']?.(event,value);},
    regions(value){const motion=JSON.parse(run('JSON.stringify(motionSnapshot())'));listeners['companion:regions'](event,{epoch:motion.epoch,geometrySeq:motion.visual.geometrySeq,regions:value});},
    dispatch(command){return handlers['companion:dispatch'](event,command);},
    move(point){return handlers['companion:move'](event,point);},
    hide(){return handlers['companion:hide'](event);},
    drag(start){listeners[start?'companion:drag-start':'companion:drag-end'](event);},
  };
}
function commitFor(pet, x, sequence=1) {
  const motion=pet.snapshot().motion;
  return {clockKind:'visual-root-v1',epoch:motion.epoch,geometrySeq:motion.visual.geometrySeq,sequence,
    rectGlobal:{...motion.visual.rectGlobal,x},distanceDip:motion.distanceDip+Math.abs(x-motion.visual.rectGlobal.x),selectedFrame:7,phase:.2};
}

test('visual authority keeps native host fixed and sprite geometry logical',async()=>{
  const pet=await harness(); const before=pet.bounds(),initial=pet.snapshot().motion;
  assert.equal(initial.clockKind,'visual-root-v1'); assert.equal(initial.spriteSizeDip,249.28);
  pet.ready({ready:true,epoch:initial.prepareEpoch}); pet.tick();
  pet.ready({ready:true,epoch:pet.snapshot().motion.prepareEpoch});
  for(let frame=0;frame<120;frame++)pet.tick();
  assert.deepEqual(pet.bounds(),before); assert.equal(pet.positionCalls(),0);
  assert.equal(pet.snapshot().motion.distanceDip,0,'native planner does not count proposed float motion');
});

test('hiding a visual pet cancels the drag gesture before it can be shown again',async()=>{
  const pet=await harness();pet.drag(true);assert.equal(pet.snapshot().motion.dragging,true);
  pet.hide();assert.equal(pet.snapshot().motion.dragging,false);
  assert.equal(pet.snapshot().motion.paused,true);
});

test('committed visual rect supports hit testing beyond the old 1000 DIP host-local limit',async()=>{
  const pet=await harness();pet.tick();pet.ready({ready:true,epoch:pet.snapshot().motion.prepareEpoch});pet.tick();
  pet.commit(commitFor(pet,-299.875));
  assert.equal(pet.snapshot().motion.distanceDip,.125);
  pet.regions([{type:'rect',x:20,y:20,width:100,height:100}]);
  assert.equal(pet.run('hitAt({x:-269.875,y:530}, companionBounds())'),true);
  assert.equal(pet.run('hitAt({x:-1000,y:530}, companionBounds())'),false);
  pet.commit(commitFor(pet,-299.5));
  assert.equal(pet.snapshot().motion.distanceDip,.125,'stale sequence is rejected');
});

test('move, resize, edge placement and drag rebase logical geometry without native travel',async()=>{
  const pet=await harness(),host=pet.bounds();
  pet.move({x:40.5,y:100});
  assert.equal(pet.snapshot().motion.visual.rectGlobal.x,40.5);
  pet.dispatch({type:'settings',patch:{size:1.5}});
  assert.equal(pet.snapshot().motion.visual.rectGlobal.width,510);
  pet.dispatch({type:'settings',patch:{movement:'edge'}});
  assert.equal(pet.snapshot().motion.visual.rectGlobal.y,480);
  pet.pointer({x:0,y:500});pet.drag(true);pet.pointer({x:-100,y:400});pet.drag(false);
  assert.deepEqual(pet.bounds(),host); assert.equal(pet.positionCalls(),0);
  assert.equal(pet.snapshot().motion.distanceDip,0);
});

test('pause rejects in-flight visual travel and turns hold their native 800 ms barrier',async()=>{
  const pet=await harness();pet.tick();pet.ready({ready:true,epoch:pet.snapshot().motion.prepareEpoch});pet.tick();
  const stale=commitFor(pet,-299.5);
  pet.dispatch({type:'settings',patch:{paused:true}});pet.commit(stale);
  assert.equal(pet.snapshot().motion.distanceDip,0);
  pet.dispatch({type:'settings',patch:{paused:false}});
  pet.run('target={x:-800,y:visualRect.y};');pet.tick();
  assert.equal(pet.snapshot().motion.facing,-1);assert.equal(pet.snapshot().motion.moving,false);
  for(let index=0;index<49;index++)pet.tick();
  assert.equal(pet.snapshot().motion.moving,false);
  pet.tick();pet.ready({ready:true,epoch:pet.snapshot().motion.prepareEpoch});pet.tick();
  assert.equal(pet.snapshot().motion.moving,true);
  assert.equal(pet.positionCalls(),0);
});
