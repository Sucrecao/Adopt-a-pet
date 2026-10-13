const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

async function harness(options = {}) {
  const [geometry, motionModule, core, gait] = await Promise.all([
    import('../src/core/geometry.js'), import('../src/core/motion.js'), import('../src/core/state.js'),
    import('../src/core/gait.js'),
  ]);
  const mainPath = path.join(__dirname, '../electron/main.cjs');
  const mainRequire = createRequire(mainPath);
  const workArea = options.workArea ?? { x: 0, y: 0, width: 1000, height: 800 };
  let now = 1000, bounds = options.bounds ?? { x: 300, y: 300, width: 221, height: 234 };
  let cursor = { x: -100, y: -100 };
  const nearestPoints = [];
  const nativeInteger = value => {
    assert.ok(Number.isInteger(value) && !Object.is(value, -0),
      `Electron native argument must be an integer without negative zero; received ${Object.is(value, -0) ? '-0' : value}`);
  };
  const handlers = {}, listeners = {}, events = [];
  const mainFrame = {};
  const window = {
    isDestroyed: () => false, isVisible: () => true,
    getBounds: () => ({ ...bounds }),
    setBounds: next => { Object.values(next).forEach(nativeInteger); bounds = { ...next }; },
    setPosition: (x, y) => { nativeInteger(x); nativeInteger(y); bounds = { ...bounds, x, y }; },
    setAlwaysOnTop: () => {}, setIgnoreMouseEvents: () => {},
    webContents: { mainFrame, send: (channel, value) => events.push({ channel, value: JSON.parse(JSON.stringify(value)), bounds: { ...bounds } }) },
  };
  const electron = {
    app: { isPackaged: true, requestSingleInstanceLock: () => false, quit: () => {} },
    ipcMain: { handle: (key, fn) => { handlers[key] = fn; }, on: (key, fn) => { listeners[key] = fn; } },
    screen: {
      getDisplayMatching: () => ({ workArea }),
      getDisplayNearestPoint: point => {
        nativeInteger(point.x); nativeInteger(point.y);
        nearestPoints.push({ ...point });
        return { workArea };
      },
      getCursorScreenPoint: () => cursor,
    },
  };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : mainRequire(name),
    __dirname: path.dirname(mainPath), process: { env: {} }, console, Date: Clock,
    setTimeout: () => 1, clearTimeout: () => {}, window, geometry, motionModule, core, gait, options,
  });
  const run = code => vm.runInContext(code, context);
  // Execute real main functions; the harness adds no production test hooks.
  run(fs.readFileSync(mainPath, 'utf8') + `
    petWindow = window;
    clampWindow = geometry.clampWindow;
    advanceMotion = motionModule.advanceMotion;
    desktopSpriteSize = gait.desktopSpriteSize;
    gaitSpeedDip = gait.gaitSpeedDip;
    transition = core.transition;
    chooseTarget = (bounds, area, mode) => geometry.chooseTarget(bounds, area, mode, () => options.random ?? 0.9);
    state = { ...core.createState(Date.now()), adopted: true,
      species: options.species ?? "cat", settings: { size: 0.65, movement: 'free', paused: false, alwaysOnTop: true } };
    target = options.target === undefined ? { x: 720, y: 500 } : options.target;
    wanderAt = options.target === null ? 0 : Date.now() + 60000;
    registerIPC();
    movementTick();
  `);
  const event = { sender: window.webContents, senderFrame: mainFrame };
  return {
    run, events, reduced(value, trusted = true) { return handlers["companion:reduced-motion"](trusted ? event : { sender: {}, senderFrame: {} }, value); }, bounds: () => ({ ...bounds }), area: workArea, nearestPoints,
    tick(ms = 16) { now += ms; run('movementTick()'); },
    cursor(point) { cursor = point; },
    dispatch(command) { return handlers['companion:dispatch'](event, command); },
    drag(start) { listeners[start ? 'companion:drag-start' : 'companion:drag-end'](event); },
    move(point) { return handlers['companion:move'](event, point); },
    snapshot() { return JSON.parse(run('JSON.stringify(snapshot())')); },
    ready(value, trusted=true) { return handlers['companion:playback-ready']?.(trusted?event:{sender:{},senderFrame:{}},value) ?? false; },
  };
}

test('native travel waits for the painted connection before a new movement intent',async()=>{
  const pet=await harness();
  assert.equal(pet.ready({ready:true,epoch:0}),true);
  pet.dispatch({type:'interact',action:'feed'});pet.tick(900);
  pet.cursor({x:900,y:350});pet.dispatch({type:'interact',action:'play'});
  const before=pet.bounds();pet.tick();
  const requested=pet.snapshot().motion;
  assert.equal(requested.intentMoving,true);assert.equal(requested.moving,false);
  assert.equal(typeof requested.prepareEpoch,'number');
  for(let i=0;i<20;i++)pet.tick();
  assert.deepEqual(pet.bounds(),before);assert.equal(pet.snapshot().motion.distanceDip,requested.distanceDip);
  assert.equal(pet.ready({ready:true,epoch:requested.prepareEpoch-1}),false);
  assert.throws(()=>pet.ready({ready:true,epoch:requested.prepareEpoch},false),/未知窗口/);
  pet.tick();assert.deepEqual(pet.bounds(),before);
  assert.equal(pet.ready({ready:true,epoch:requested.prepareEpoch}),true);
  for(let i=0;i<20;i++)pet.tick();
  assert.ok(pet.bounds().x>before.x);
});

test('not-ready turn exit keeps its800ms clock running and releases movement without another turn',async()=>{
  const pet=await harness({species:'dog'});
  assert.equal(pet.ready({ready:true,epoch:0}),true);
  for(let index=0;index<40;index++)pet.tick();
  pet.run('target = {x:0,y:motion.y};');pet.tick();
  const before=pet.bounds(),motion=pet.snapshot().motion;
  assert.equal(motion.facing,-1);assert.equal(pet.run('turnRemainingMs'),800);
  // Pet publishes not-ready as soon as the painted turn begins, before the
  // subsequent walk entry can receive or consume any native displacement.
  assert.equal(pet.ready({ready:false,epoch:motion.prepareEpoch}),true);
  for(let index=0;index<20;index++) {
    pet.tick(50);assert.deepEqual(pet.bounds(),before);assert.equal(pet.snapshot().motion.distanceDip,motion.distanceDip);
  }
  assert.equal(pet.run('turnRemainingMs'),0,'readiness must not freeze the original turn clock');
  assert.equal(pet.snapshot().motion.moving,false);
  assert.equal(pet.ready({ready:true,epoch:motion.prepareEpoch}),true);pet.tick();
  assert.equal(pet.snapshot().motion.moving,true,'the painted first step releases travel on the next tick');
  assert.equal(pet.run('turnRemainingMs'),0,'the completed turn is not queued again');
  for(let index=0;index<20;index++)pet.tick();
  assert.ok(pet.bounds().x<before.x);assert.ok(pet.snapshot().motion.distanceDip>motion.distanceDip);
});

test('enlarging a roaming pet replaces its old destination and keeps 300 subsequent steps on screen', async () => {
  const pet = await harness();
  pet.tick();
  pet.run(`const previous = state;
    state = { ...state, settings: { ...state.settings, size: 1.5 } };
    configurePet(previous);`);
  const resized = pet.bounds();
  assert.equal(resized.width, 510); assert.equal(resized.height, 540);
  let moved = false;
  for (let tick = 0; tick < 300; tick++) {
    pet.tick();
    const bounds = pet.bounds(), area = pet.area;
    moved ||= bounds.x !== resized.x || bounds.y !== resized.y;
    assert.ok(bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width &&
      bounds.y + bounds.height <= area.y + area.height, `pet left work area on tick ${tick}: ${JSON.stringify(bounds)}`);
  }
  assert.ok(moved, 'pet must resume moving after the resize');
});

test('native travel follows actual elapsed time at 16ms and 33ms', async () => {
  const pets = await Promise.all([harness(), harness()]);
  for (const [index, cadence] of [16, 33].entries()) {
    pets[index].run('target = { x: 720, y: 300 };');
    for (let elapsed = 0; elapsed < 2000; elapsed += cadence) pets[index].tick(Math.min(cadence, 2000 - elapsed));
  }
  assert.ok(Math.abs(pets[0].bounds().x - pets[1].bounds().x) <= 1);
  // Integrate the eight-per-second acceleration response analytically. The
  // native width includes12px of padding that the actual sprite excludes.
  const speed = 42 * (221 - 12) / (340 - 12);
  const expectedTravel = speed * (2 - (1 - Math.exp(-8 * 2)) / 8);
  assert.ok(Math.abs(pets[0].bounds().x - (300 + expectedTravel)) <= 1);
});

test('native fractional coordinates survive rounded window bounds', async () => {
  const pet = await harness({ species: 'parrot' });
  pet.run('target = { x: 301, y: 560 };');
  for (let tick = 0; tick < 250; tick++) pet.tick();
  assert.equal(pet.bounds().x, 301, 'the subpixel x movement must accumulate');
  assert.ok(pet.bounds().y > 430);
});

test('native long frame clamps to 50ms and zero elapsed does not move', async () => {
  const pet = await harness();
  const initial = pet.bounds();
  pet.tick(0);
  assert.deepEqual(pet.bounds(), initial);
  pet.tick(10000);
  assert.ok(Math.hypot(pet.bounds().x - initial.x, pet.bounds().y - initial.y) <= 3);
});

test('new actions immediately stop roaming until their duration expires, then resume', async () => {
  for (const [action, duration] of [['stretch', 3400], ['trick', 3600]]) {
    const pet = await harness();
    for (let frame = 0; frame < 20; frame++) pet.tick();
    assert.equal(pet.snapshot().motion.moving, true);
    const next = pet.dispatch({ type: 'interact', action });
    assert.equal(next.action.type, action);
    assert.equal(next.motion.moving, false);
    const initial = pet.bounds();
    for (let elapsed = 0; elapsed < duration - 16; elapsed += 16) pet.tick(Math.min(16, duration - 16 - elapsed));
    assert.deepEqual(pet.bounds(), initial);
    for (let frame = 0; frame < 40; frame++) pet.tick();
    assert.notDeepEqual(pet.bounds(), initial);
  }
});

test('pause, drag, display constraints and movement changes discard old velocity and destination', async () => {
  const pet = await harness();
  for (let frame = 0; frame < 20; frame++) pet.tick();
  pet.dispatch({ type: 'settings', patch: { paused: true } });
  const paused = pet.bounds();
  pet.tick(10000); assert.deepEqual(pet.bounds(), paused);
  pet.dispatch({ type: 'settings', patch: { paused: false, movement: 'edge' } });
  pet.cursor({ x: 400, y: 400 }); pet.drag(true);
  pet.cursor({ x: 950, y: 750 }); pet.run('pointerTick()');
  const dragged = pet.bounds();
  pet.tick(); assert.deepEqual(pet.bounds(), dragged);
  pet.drag(false);
  assert.equal(pet.run('target'), null);
  pet.run('constrainPet({ x: -1000, y: 0, width: 1000, height: 800 });');
  const constrained = pet.bounds();
  assert.ok(constrained.x < 0);
  assert.equal(pet.run('target'), null);
  pet.tick(0); assert.deepEqual(pet.bounds(), constrained);
  assert.equal(pet.run('Math.hypot(motion.vx, motion.vy)'), 0);
});

test('play chase retains continuous moving state and facing inside the horizontal dead zone', async () => {
  const pet = await harness({ species: 'parrot' });
  pet.dispatch({ type: 'interact', action: 'play' });
  pet.run('facing = "right"; regions = [{ type: "rect", x: 0, y: 0, width: 221, height: 234 }];');
  for (let frame = 0; frame < 60; frame++) {
    const bounds = pet.bounds();
    pet.cursor({ x: bounds.x + bounds.width / 2 + (frame % 2 ? -2 : 2), y: bounds.y + 220 });
    pet.tick();
    assert.equal(pet.snapshot().motion.moving, true);
    assert.equal(pet.snapshot().motion.facing, 1);
  }
});

for(const species of ['cat','dog'])for(const heading of [-1,1]) {
  test(`${species}: a chase destination just behind the heading stops without backwards planted-paw travel (${heading})`,async()=>{
    const pet=await harness({species});
    for(let i=0;i<20;i++)pet.tick();
    pet.run(`facing = ${heading===1?'"right"':'"left"'};
      motion = {...motion, x:window.getBounds().x, vx:${heading*32}, vy:0, arrived:false};
      target = {x:motion.x-(${heading*4}), y:motion.y};
      movementWanted = true; moving = true; turnRemainingMs = 0;`);
    const before=pet.bounds(),distance=pet.snapshot().motion.distanceDip;
    for(let i=0;i<60;i++) {
      const previous=pet.bounds();pet.tick();const next=pet.bounds();
      assert.ok((next.x-previous.x)*heading>=0,'window may not reverse under a forward planted-paw cycle');
      assert.equal(pet.snapshot().motion.facing,heading,'near-target stopping retains heading');
    }
    assert.deepEqual(pet.bounds(),before,'a destination inside the opposite dead zone settles in place');
    assert.equal(pet.snapshot().motion.distanceDip,distance);
    assert.equal(pet.snapshot().motion.moving,false);assert.equal(pet.snapshot().motion.intentMoving,false);
  });
}

for(const species of ['cat','dog'])for(const preparing of [true,false]) {
  test(`${species}: play preserves an existing ${preparing?'first-step preparation':'walking cycle'} and accepted distance`,async()=>{
    const pet=await harness({species});
    pet.run(`motionEpoch=7; distanceDip=21; prepareEpoch=5;
      playbackReadyKnown=true; playbackReady=${!preparing};
      movementWanted=true; moving=${!preparing};
      motion={...motion,vx:${preparing?0:32},vy:0,arrived:false};`);
    const before=pet.snapshot().motion,bounds=pet.bounds();
    pet.cursor({x:bounds.x+bounds.width/2+500,y:bounds.y+bounds.height*.6});
    pet.dispatch({type:'interact',action:'play'});
    const after=pet.snapshot().motion;
    assert.equal(after.epoch,before.epoch,'play must not inject a stop/rebase into the same mobile mode');
    assert.equal(after.distanceDip,before.distanceDip);assert.equal(after.prepareEpoch,before.prepareEpoch);
    assert.equal(after.intentMoving,true);assert.equal(after.moving,before.moving);
    assert.equal(pet.run('playbackReady'),!preparing);
    if(preparing) {
      for(let i=0;i<20;i++)pet.tick();assert.deepEqual(pet.bounds(),bounds);
      assert.equal(pet.ready({ready:true,epoch:5}),true);
    }
    for(let i=0;i<20;i++)pet.tick();
    assert.ok(pet.bounds().x>bounds.x);assert.ok(pet.snapshot().motion.distanceDip>21);
    assert.equal(pet.snapshot().motion.epoch,7);
  });
}

for(const species of ['cat','dog'])for(const heading of [-1,1]) {
  test(`${species}: cancelling movement inside a turn publishes the stopped intent (${heading})`,async()=>{
    const pet=await harness({species});
    pet.run(`facing=${heading===1?'"right"':'"left"'};
      motion={...motion,x:window.getBounds().x,vx:0,vy:0,arrived:false};
      target={x:motion.x+${heading*300},y:motion.y};`);
    for(let i=0;i<40;i++)pet.tick();
    pet.run(`target={x:motion.x-(${heading*300}),y:motion.y};`);pet.tick();
    assert.equal(pet.run('turnRemainingMs'),800);
    assert.equal(pet.snapshot().motion.facing,-heading);
    const before=pet.bounds(),distance=pet.snapshot().motion.distanceDip;
    pet.run(`target={x:window.getBounds().x+${heading*3},y:motion.y};`);
    pet.tick();
    assert.ok(pet.run('turnRemainingMs')>0,'the original turn still finishes in place');
    const delivered=()=>pet.events.filter(e=>e.channel==='companion:motion').at(-1).value;
    assert.equal(delivered().intentMoving,false,'renderer must receive cancelled intent while the turn is held');
    for(let i=0;i<20;i++)pet.tick(50);
    assert.equal(pet.run('turnRemainingMs'),0);assert.equal(pet.run('target'),null);
    assert.deepEqual(pet.bounds(),before);assert.equal(pet.snapshot().motion.distanceDip,distance);
    assert.equal(delivered().intentMoving,pet.snapshot().motion.intentMoving);
    assert.equal(delivered().moving,false);
  });
}

test('roaming crosses zero on the secondary display without losing its fractional position', async () => {
  const pet = await harness({
    species: 'parrot', workArea: { x: 1800, y: -414, width: 3840, height: 2130 },
    bounds: { x: 2000, y: 1, width: 221, height: 234 },
    target: null, random: 0.2,
  });
  let crossed = false;
  for (let frame = 0; frame < 60; frame++) {
    pet.tick();
    const y = pet.run('motion.y');
    if (y < 0 && y > -0.5) {
      crossed = true;
      assert.equal(pet.bounds().y, 0);
      assert.ok(!Number.isInteger(y), 'native rounding must preserve the floating motion state');
    }
  }
  assert.ok(crossed, 'the natural roaming path must pass through the negative-zero rounding range');
  assert.ok(pet.bounds().y < 0, 'roaming must continue after the crossing');
});

for (const axis of ['x', 'y']) {
  for (const direction of [-1, 1]) {
    test(`native movement crosses ${axis} zero toward ${direction < 0 ? 'negative' : 'positive'} coordinates`, async () => {
      const start = -direction;
      const pet = await harness({
        species: 'parrot', workArea: { x: -1000, y: -1000, width: 2000, height: 2000 },
        bounds: { x: axis === 'x' ? start : 200, y: axis === 'y' ? start : 200, width: 221, height: 234 },
        target: { x: axis === 'x' ? direction * 35 : 200, y: axis === 'y' ? direction * 35 : 200 },
      });
      let crossed = false;
      for (let frame = 0; frame < 80; frame++) {
        pet.tick();
        const value = pet.run(`motion.${axis}`);
        if (value < 0 && value > -0.5) {
          crossed = true;
          assert.equal(pet.bounds()[axis], 0);
          assert.ok(!Number.isInteger(value));
        }
      }
      assert.ok(crossed, 'movement must exercise the negative-zero rounding range');
      assert.ok(pet.bounds()[axis] * direction > 0, 'movement must continue across zero');
    });
  }
}

test('resizing through a half-pixel origin supplies positive zero to native bounds', async () => {
  const pet = await harness({
    workArea: { x: -1000, y: -1000, width: 2000, height: 2000 },
    bounds: { x: 0, y: 100, width: 221, height: 234 },
  });
  pet.dispatch({ type: 'settings', patch: { size: 222 / 340 } });
  assert.equal(pet.bounds().x, 0);
  assert.equal(pet.bounds().width, 222);
  assert.equal(pet.run('motion.x'), 0);
});

test('manual movement rounds finite coordinates before native display lookup and extracts only the point', async () => {
  const pet = await harness({ workArea: { x: -1000, y: -1000, width: 2000, height: 2000 } });
  for (const [point, expected] of [
    [{ x: -0.2, y: 10.6, width: 1 }, { x: 0, y: 11 }],
    [{ x: -10.6, y: -0, height: 1 }, { x: -11, y: 0 }],
  ]) {
    assert.equal(pet.move(point), true);
    assert.deepEqual(pet.nearestPoints.at(-1), expected);
    assert.deepEqual(pet.bounds(), { ...expected, width: 221, height: 234 });
  }
  const before = pet.bounds();
  for (const point of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }]) assert.equal(pet.move(point), false);
  assert.deepEqual(pet.bounds(), before);
});

test('dragging across a negative display origin supplies integer bounds and resumes roaming', async () => {
  const pet = await harness({
    workArea: { x: -1000, y: -1000, width: 2000, height: 2000 },
    bounds: { x: 1, y: 1, width: 221, height: 234 },
  });
  pet.cursor({ x: 10, y: 10 }); pet.drag(true);
  for (const coordinate of [9, 8, 9, 10]) {
    pet.cursor({ x: coordinate, y: coordinate }); pet.run('pointerTick()');
    assert.equal(pet.bounds().x, coordinate - 9);
    assert.equal(pet.bounds().y, coordinate - 9);
  }
  pet.drag(false);
  const before = pet.bounds();
  pet.tick(10000);
  for (let frame = 0; frame < 40; frame++) pet.tick();
  assert.notDeepEqual(pet.bounds(), before);
});

for (const species of ['cat', 'dog']) test(`${species} roam and chase retain ground Y`, async () => {
  const pet = await harness({ species });
  for (let i = 0; i < 100; i++) pet.tick();
  assert.equal(pet.bounds().y, 300);
  pet.dispatch({ type: 'interact', action: 'play' });
  pet.cursor({ x: 900, y: 700 });
  for (let i = 0; i < 100; i++) pet.tick();
  assert.equal(pet.bounds().y, 300);
});
for (const species of ['cat', 'parrot']) test(`${species} telemetry measures accepted integer travel and emits after positioning`, async () => {
  const pet = await harness({ species });
  let before = pet.bounds(), distance = 0;
  for (let i = 0; i < 100; i++) {
    pet.tick(); const after = pet.bounds();
    distance += species === 'parrot' ? Math.hypot(after.x - before.x, after.y - before.y) : Math.abs(after.x - before.x);
    assert.equal(pet.snapshot().motion.distanceDip, distance);
    const event = pet.events.filter(e => e.channel === 'companion:motion').at(-1);
    assert.ok(event); assert.deepEqual(event.bounds, after);
    assert.equal(event.value.distanceDip, distance);
    before = after;
  }
  assert.equal(pet.snapshot().motion.spriteSizeDip, (221 - 12) * .76);
  assert.ok([1, -1].includes(pet.snapshot().motion.facing));
  assert.equal(pet.run('Object.hasOwn(state, "motion")'), false);
});
test('pause, drag, resize and relocation rebase motion without adding distance', async () => {
  const pet = await harness();
  for (let i = 0; i < 80; i++) pet.tick();
  let epoch = pet.snapshot().motion.epoch;
  assert.ok(pet.snapshot().motion.distanceDip > 0);
  pet.dispatch({ type: 'settings', patch: { paused: true } });
  assert.ok(pet.snapshot().motion.epoch > epoch);
  assert.equal(pet.snapshot().motion.distanceDip, 0);
  assert.equal(pet.snapshot().motion.paused, true);
  pet.tick(10000); assert.equal(pet.snapshot().motion.distanceDip, 0);
  pet.drag(true); pet.cursor({ x: 800, y: 700 }); pet.run('pointerTick()');
  assert.equal(pet.snapshot().motion.dragging, true);
  assert.equal(pet.snapshot().motion.distanceDip, 0);
  pet.drag(false); epoch = pet.snapshot().motion.epoch;
  pet.move({ x: 400, y: 200 });
  assert.ok(pet.snapshot().motion.epoch > epoch);
  assert.equal(pet.snapshot().motion.distanceDip, 0);
  epoch = pet.snapshot().motion.epoch;
  pet.dispatch({ type: 'settings', patch: { size: 1 } });
  assert.ok(pet.snapshot().motion.epoch > epoch);
  assert.equal(pet.snapshot().motion.spriteSizeDip, (340 - 12) * .76);
});
test('reduced motion uses trusted boolean IPC and remains transient', async () => {
  const pet = await harness();
  assert.throws(() => pet.reduced(true, false));
  for (const invalid of [1, 'true', null, {}]) assert.throws(() => pet.reduced(invalid));
  pet.reduced(true);
  const before = pet.bounds(); pet.tick(10000);
  assert.deepEqual(pet.bounds(), before); assert.equal(pet.snapshot().motion.paused, true);
  assert.equal(pet.snapshot().settings.paused, false);
  assert.equal(pet.run('Object.hasOwn(state, "reducedMotion")'), false);
  pet.reduced(false); pet.run('wanderAt = 0;');
  for (let i = 0; i < 80; i++) pet.tick();
  assert.notDeepEqual(pet.bounds(), before);
});

test('preload motion subscription hides IPC events, unsubscribes and sends reduced motion', () => {
  let api; const subscriptions = new Map(), invoked = [];
  const ipcRenderer = {
    on: (channel, listener) => subscriptions.set(channel, listener),
    removeListener: (channel, listener) => { assert.equal(subscriptions.get(channel), listener); subscriptions.delete(channel); },
    invoke: (channel, value) => { invoked.push([channel, value]); return Promise.resolve(true); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_key, value) => { api = value; } }, ipcRenderer }),
  });
  const telemetry = { epoch: 2, distanceDip: 5 }; let received;
  const unsubscribe = api.onMotion(value => { received = value; });
  subscriptions.get('companion:motion')({ secret: true }, telemetry);
  assert.equal(received, telemetry);
  unsubscribe(); assert.equal(subscriptions.size, 0);
  api.setReducedMotion(true);
  assert.deepEqual(invoked, [['companion:reduced-motion', true]]);
});

test('switching a grounded pet to edge relocates to screen bottom before horizontal travel', async () => {
  for (const species of ['cat', 'dog']) {
    const pet = await harness({ species,
      workArea: { x: -1000, y: -414, width: 2000, height: 1000 },
      bounds: { x: 200, y: 100, width: 221, height: 234 } });
    for (let i = 0; i < 40; i++) pet.tick();
    const epoch = pet.snapshot().motion.epoch;
    pet.dispatch({ type: 'settings', patch: { movement: 'edge' } });
    assert.equal(pet.bounds().y, 352);
    assert.ok(pet.snapshot().motion.epoch > epoch);
    assert.equal(pet.snapshot().motion.distanceDip, 0);
    const edge = pet.bounds();
    for (let i = 0; i < 80; i++) pet.tick();
    assert.equal(pet.bounds().y, edge.y);
    assert.notEqual(pet.bounds().x, edge.x);
    pet.move({ x: 200, y: 100 });
    pet.dispatch({ type: 'settings', patch: { movement: 'free' } });
    for (let i = 0; i < 80; i++) pet.tick();
    assert.equal(pet.bounds().y, 100);
  }
});

for (const species of ['cat', 'dog']) test(`${species} turns in place before accepting reverse travel for 800 active ms`, async () => {
  const pet = await harness({ species });
  for (let i = 0; i < 40; i++) pet.tick();
  const before = pet.bounds(), distance = pet.snapshot().motion.distanceDip;
  const floatX = pet.run('motion.x');
  pet.run('target = { x: 0, y: motion.y };');
  pet.tick();
  assert.equal(pet.snapshot().motion.facing, -1);
  assert.equal(pet.snapshot().motion.moving, false);
  assert.deepEqual(pet.bounds(), before);
  assert.equal(pet.run('motion.x'), floatX);
  assert.equal(pet.snapshot().motion.distanceDip, distance);
  for (let i = 0; i < 49; i++) {
    pet.tick();
    assert.deepEqual(pet.bounds(), before);
    assert.equal(pet.snapshot().motion.distanceDip, distance);
    assert.equal(pet.snapshot().motion.moving, false);
  }
  pet.tick();
  assert.equal(pet.snapshot().motion.moving, true);
  for (let i = 0; i < 12; i++) pet.tick();
  assert.ok(pet.bounds().x < before.x);
});

for (const freeze of ['pause', 'reduced', 'action']) test(`native turn retains remaining duration across ${freeze}`, async () => {
  const pet = await harness();
  pet.run('target = { x: 0, y: motion.y };'); pet.tick();
  for (let i = 0; i < 20; i++) pet.tick();
  const before = pet.bounds(), telemetry = pet.snapshot().motion;
  if (freeze === 'pause') pet.dispatch({ type: 'settings', patch: { paused: true } });
  if (freeze === 'reduced') pet.reduced(true);
  if (freeze === 'action') pet.dispatch({ type: 'interact', action: 'stretch' });
  pet.tick(10000);
  assert.deepEqual(pet.bounds(), before);
  assert.equal(pet.snapshot().motion.epoch, telemetry.epoch);
  if (freeze === 'pause') pet.dispatch({ type: 'settings', patch: { paused: false } });
  if (freeze === 'reduced') pet.reduced(false);
  // Expired actions become idle on the next native tick.
  for (let i = 0; i < 29; i++) { pet.tick(); assert.deepEqual(pet.bounds(), before); }
  assert.equal(pet.snapshot().motion.moving, false);
  pet.tick(); assert.equal(pet.snapshot().motion.moving, true);
});

for (const reset of ['drag', 'resize', 'species', 'relocate']) test(`${reset} clears a native turn when rebasing motion`, async () => {
  const pet = await harness();
  pet.run('target = { x: 0, y: motion.y };'); pet.tick();
  assert.equal(pet.snapshot().motion.moving, false);
  const epoch = pet.snapshot().motion.epoch;
  if (reset === 'drag') { pet.drag(true); pet.drag(false); }
  if (reset === 'resize') pet.dispatch({ type: 'settings', patch: { size: 1 } });
  if (reset === 'species') pet.run('const previous = state; state = { ...state, species: "dog" }; configurePet(previous);');
  if (reset === 'relocate') pet.move({ x: 400, y: 200 });
  assert.ok(pet.snapshot().motion.epoch > epoch);
  assert.equal(pet.snapshot().motion.distanceDip, 0);
  pet.run('target = { x: 0, y: motion.y };'); pet.tick();
  assert.equal(pet.snapshot().motion.moving, true, 'rebased facing must not inherit a stale hold');
});

test('a chase heading changed during a turn cannot translate against the published facing', async () => {
  const pet = await harness();
  pet.run('target = { x: 0, y: motion.y };'); pet.tick();
  const before = pet.bounds();
  pet.run('target = { x: 720, y: motion.y };');
  for (let i = 0; i < 50; i++) pet.tick();
  assert.equal(pet.snapshot().motion.facing, 1);
  assert.equal(pet.snapshot().motion.moving, false);
  assert.deepEqual(pet.bounds(), before);
  for (let i = 0; i < 49; i++) { pet.tick(); assert.deepEqual(pet.bounds(), before); }
  pet.tick(); assert.equal(pet.snapshot().motion.moving, true);
});

test('active play completes a reverse turn before the chase action expires', async () => {
  const pet = await harness();
  pet.dispatch({ type: 'interact', action: 'play' });
  pet.cursor({ x: 0, y: 400 });
  pet.tick();
  const before = pet.bounds(), until = pet.snapshot().action.until;
  assert.equal(pet.snapshot().motion.facing, -1);
  assert.equal(pet.snapshot().motion.moving, false);
  for (let i = 0; i < 49; i++) { pet.tick(); assert.deepEqual(pet.bounds(), before); }
  pet.tick();
  assert.ok(pet.run('Date.now()') < until, 'turn completes during the active chase');
  assert.equal(pet.snapshot().motion.moving, true);
  for (let i = 0; i < 12; i++) pet.tick();
  assert.ok(pet.bounds().x < before.x);
});
