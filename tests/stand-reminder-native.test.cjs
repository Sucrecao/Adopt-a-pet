const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

async function harness() {
  const [core, reminder, routine, gait, geometry] = await Promise.all([
    import('../src/core/state.js'), import('../src/core/stand-reminder.js'), import('../src/core/companion-routine.js'),
    import('../src/core/gait.js'), import('../src/core/geometry.js'),
  ]);
  const mainPath = path.join(__dirname, '../electron/main.cjs'), mainRequire = createRequire(mainPath);
  let now = Date.parse('2026-10-15T02:00:00Z'), bounds = { x:300, y:300, width:340, height:360 };
  const handlers = {}, events = [], mainFrame = {}, panelFrame = {};
  const makeWindow = frame => ({ isDestroyed:()=>false, isVisible:()=>true, getBounds:()=>({...bounds}),
    setBounds:next=>{bounds={...next};}, setPosition:(x,y)=>{bounds={...bounds,x,y};},
    setAlwaysOnTop:()=>{}, setIgnoreMouseEvents:()=>{}, hide:()=>{},
    webContents:{mainFrame:frame,send:(channel,value)=>events.push({channel,value})} });
  const window = makeWindow(mainFrame), panelWindow = makeWindow(panelFrame);
  const electron = { app:{isPackaged:true,requestSingleInstanceLock:()=>false,quit:()=>{}},
    ipcMain:{handle:(key,fn)=>{handlers[key]=fn;},on:()=>{}},
    screen:{getDisplayMatching:()=>({id:1,workArea:{x:0,y:0,width:1920,height:1080}}),
      getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),getCursorScreenPoint:()=>({x:0,y:0})} };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ require:name=>name==='electron'?electron:mainRequire(name),
    __dirname:path.dirname(mainPath), process:{env:{}}, console, Date:Clock, setTimeout:()=>1, clearTimeout:()=>{},
    core, reminder, routine, gait, geometry, window, panelWindow });
  const run = code=>vm.runInContext(code,context);
  run(fs.readFileSync(mainPath,'utf8')+`
    petWindow=window; panel=panelWindow; transition=core.transition; normalizeState=core.normalizeState;
    desktopSpriteSize=gait.desktopSpriteSize; gaitSpeedDip=gait.gaitSpeedDip;
    clampWindow=geometry.clampWindow;
    standReminderController=reminder.createStandReminderController(); getBeijingPeriod=routine.getBeijingPeriod;
    state={...core.createState(Date.now()),adopted:true,species:'parrot'};
    registerIPC();
  `);
  const event={sender:window.webContents,senderFrame:mainFrame}, panelEvent={sender:panelWindow.webContents,senderFrame:panelFrame};
  return { run, events, get now(){return now;},
    tick(ms=1000){now+=ms; run('standReminderTick()');},
    advance(ms){while(ms>0){const step=Math.min(1000,ms);this.tick(step);ms-=step;}},
    snapshot(){return JSON.parse(run('JSON.stringify(snapshot())'));},
    present(id,sender='pet'){return handlers['companion:stand-reminder-present']?.(sender==='panel'?panelEvent:sender==='unknown'?{sender:{},senderFrame:{}}:event,id);},
    dismiss(id){return handlers['companion:stand-reminder-dismiss']?.(event,id);},
    dispatch(command){return handlers['companion:dispatch'](panelEvent,command);},
    hide(){return handlers['companion:hide'](event);},
  };
}

test('native owner publishes a transient pending cue once and allows only its pet window to present it',async()=>{
  const pet=await harness();
  assert.equal(pet.run('typeof standReminderTick'),'function');
  pet.tick(); pet.advance(1800000);
  const pending=pet.snapshot().standReminder;
  assert.equal(pending.phase,'pending');
  assert.equal(pet.run('Object.hasOwn(state,"standReminder")'),false);
  assert.equal(pet.present(pending.id,'panel'),false);
  assert.throws(()=>pet.present(pending.id,'unknown'),/未知窗口/);
  assert.throws(()=>pet.present('1'),/无效/);
  const visible=pet.present(pending.id);
  assert.equal(visible.phase,'visible');
  assert.equal(pet.snapshot().motion.paused,true);
  pet.advance(12000);
  assert.equal(pet.snapshot().standReminder,null);
  assert.equal(pet.snapshot().motion.paused,false);
});

test('native settings, pause, hiding and Beijing bedtime immediately cancel cues and restart the interval',async()=>{
  const pet=await harness(); pet.tick(); pet.advance(1800000);
  let pending=pet.snapshot().standReminder;
  pet.present(pending.id);
  pet.dispatch({type:'settings',patch:{standReminder:false}});
  assert.equal(pet.snapshot().standReminder,null);
  pet.dispatch({type:'settings',patch:{standReminder:true}});
  pet.advance(1799999); assert.equal(pet.snapshot().standReminder,null);
  pet.tick(1); assert.equal(pet.snapshot().standReminder.phase,'pending');
  pet.dispatch({type:'settings',patch:{paused:true}});
  assert.equal(pet.snapshot().standReminder,null);
  pet.dispatch({type:'settings',patch:{paused:false}});
  pet.advance(1800000); pending=pet.snapshot().standReminder;
  pet.present(pending.id); pet.hide(); assert.equal(pet.snapshot().standReminder,null);
  pet.run('hidden=false'); pet.tick(); pet.advance(1800000);
  pet.run('getBeijingPeriod=()=>({key:"sleep"})'); pet.tick();
  assert.equal(pet.snapshot().standReminder,null);
});

test('visible reminder stops native movement without counting itself as user pause',async()=>{
  const pet=await harness(); pet.tick(); pet.advance(1800000);
  pet.run('moving=true; target={x:800,y:300}; motion={x:300,y:300,vx:20,vy:0};');
  pet.present(pet.snapshot().standReminder.id);
  assert.equal(pet.snapshot().motion.moving,false);
  assert.equal(pet.run('state.settings.paused'),false);
  const bounds=pet.run('JSON.stringify(companionBounds())');
  pet.run('movementTick()'); assert.equal(pet.run('JSON.stringify(companionBounds())'),bounds);
  pet.dismiss(pet.snapshot().standReminder.id);
  assert.equal(pet.snapshot().standReminder,null);
  assert.ok(pet.run('wanderAt > Date.now()'));
});

test('preload exposes only the two cue acknowledgements through their dedicated IPC channels',async()=>{
  let bridge;
  const calls=[];
  const context=vm.createContext({require:()=>({
    contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}},
    ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve(null);}},
  })});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../electron/preload.cjs'),'utf8'),context);
  await bridge.presentStandReminder(3); await bridge.dismissStandReminder(3);
  assert.deepEqual(calls,[['companion:stand-reminder-present',3],['companion:stand-reminder-dismiss',3]]);
});
