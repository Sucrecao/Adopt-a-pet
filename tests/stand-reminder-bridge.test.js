import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createState, normalizeState, transition } from '../src/core/state.js';
import { createStandReminderController } from '../src/core/stand-reminder.js';
import { getBeijingPeriod } from '../src/core/companion-routine.js';

function harness({ desktop = false } = {}) {
  let now = Date.parse('2026-10-15T02:00:00Z'), storage;
  const callbacks = [], windowEvents = {}, documentEvents = {}, desktopBridge = {isDesktop:true};
  const document = { hidden:false, addEventListener:(key,callback)=>{documentEvents[key]=callback;} };
  const window = { companion:desktop ? desktopBridge : undefined,
    addEventListener:(key,callback)=>{windowEvents[key]=callback;} };
  storage = JSON.stringify({...createState(now),adopted:true});
  class Clock extends Date { static now() {return now;} }
  const context=vm.createContext({createState,normalizeState,transition,createStandReminderController,getBeijingPeriod,
    window,document,Date:Clock,console,URLSearchParams,location:{search:'?view=pet'},
    localStorage:{getItem:()=>storage,setItem:(_key,value)=>{storage=value;}},
    setInterval:callback=>{callbacks.push(callback);return callbacks.length;},clearInterval:()=>{} });
  const source=fs.readFileSync(new URL('../src/bridge.js',import.meta.url),'utf8')
    .replace(/^import .*?;\n/gm,'').replace('export const bridge =','const bridge =');
  vm.runInContext(source+'\nglobalThis.testBridge=bridge;',context);
  return { bridge:context.testBridge, desktopBridge, callbacks,
    get saved(){return JSON.parse(storage);},
    tick(ms=1000){now+=ms; callbacks.forEach(callback=>callback());},
    advance(ms){while(ms>0){const step=Math.min(ms,1000);this.tick(step);ms-=step;}},
    visibility(hidden){document.hidden=hidden;documentEvents.visibilitychange?.();},
    storage(value){storage=JSON.stringify(value);windowEvents.storage?.({key:'pawpal.companion.v1'});},
  };
}

test('browser preview owns one timer, shows transient cues and never persists them in its save',async()=>{
  const browser=harness();
  assert.equal(typeof browser.bridge.presentStandReminder,'function');
  assert.equal(browser.callbacks.length,1);
  let current=await browser.bridge.getState();
  browser.bridge.onState(state=>{current=state;});
  browser.advance(1800000);
  assert.equal(current.standReminder.phase,'pending');
  assert.equal(Object.hasOwn(browser.saved,'standReminder'),false);
  const cue=await browser.bridge.presentStandReminder(current.standReminder.id);
  assert.equal(cue.phase,'visible');
  assert.equal(current.standReminder.phase,'visible');
  browser.advance(12000); assert.equal(current.standReminder,null);
  browser.advance(1788000);
  await browser.bridge.dismissStandReminder(current.standReminder.id);
  assert.equal(current.standReminder,null);
  await browser.bridge.dispatch({type:'settings',patch:{standReminder:false}});
  assert.equal(browser.saved.settings.standReminder,false);
  assert.equal(Object.hasOwn(browser.saved,'standReminder'),false);
});

test('browser preference reloads and background tabs restart with a full interval',async()=>{
  const browser=harness(); let current=await browser.bridge.getState();
  browser.bridge.onState(state=>{current=state;});
  browser.advance(1799000); browser.visibility(true); browser.advance(3600000);
  browser.visibility(false); browser.advance(1799999);
  assert.equal(current.standReminder,null);
  browser.tick(1); assert.equal(current.standReminder.phase,'pending');
  browser.storage({...browser.saved,settings:{...browser.saved.settings,standReminder:false}});
  assert.equal(current.standReminder,null);
  await assert.rejects(()=>browser.bridge.presentStandReminder('1'),/无效/);
});

test('native bridge never creates a duplicate renderer timer',()=>{
  const desktop=harness({desktop:true});
  assert.equal(desktop.bridge,desktop.desktopBridge);
  assert.equal(desktop.callbacks.length,0);
});
