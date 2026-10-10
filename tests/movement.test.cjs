const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

async function harness() {
  const [geometry, motionModule, core] = await Promise.all([
    import('../src/core/geometry.js'), import('../src/core/motion.js'), import('../src/core/state.js'),
  ]);
  const mainPath = path.join(__dirname, '../electron/main.cjs');
  const mainRequire = createRequire(mainPath);
  const workArea = { x: 0, y: 0, width: 1000, height: 800 };
  let now = 1000, bounds = { x: 300, y: 300, width: 221, height: 234 };
  let cursor = { x: -100, y: -100 };
  const handlers = {}, listeners = {};
  const mainFrame = {};
  const window = {
    isDestroyed: () => false, isVisible: () => true,
    getBounds: () => ({ ...bounds }),
    setBounds: next => { bounds = { ...next }; },
    setPosition: (x, y) => { bounds = { ...bounds, x, y }; },
    setAlwaysOnTop: () => {}, setIgnoreMouseEvents: () => {},
    webContents: { mainFrame, send: () => {} },
  };
  const electron = {
    app: { isPackaged: true, requestSingleInstanceLock: () => false, quit: () => {} },
    ipcMain: { handle: (key, fn) => { handlers[key] = fn; }, on: (key, fn) => { listeners[key] = fn; } },
    screen: {
      getDisplayMatching: () => ({ workArea }), getDisplayNearestPoint: () => ({ workArea }),
      getCursorScreenPoint: () => cursor,
    },
  };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : mainRequire(name),
    __dirname: path.dirname(mainPath), process: { env: {} }, console, Date: Clock,
    setTimeout: () => 1, clearTimeout: () => {}, window, geometry, motionModule, core,
  });
  const run = code => vm.runInContext(code, context);
  // Execute real main functions; the harness adds no production test hooks.
  run(fs.readFileSync(mainPath, 'utf8') + `
    petWindow = window;
    clampWindow = geometry.clampWindow;
    advanceMotion = motionModule.advanceMotion;
    transition = core.transition;
    chooseTarget = (bounds, area, mode) => geometry.chooseTarget(bounds, area, mode, () => 0.9);
    state = { ...core.createState(Date.now()), adopted: true,
      settings: { size: 0.65, movement: 'free', paused: false, alwaysOnTop: true } };
    target = { x: 720, y: 500 };
    wanderAt = Date.now() + 60000;
    registerIPC();
    movementTick();
  `);
  const event = { sender: window.webContents, senderFrame: mainFrame };
  return {
    run, bounds: () => ({ ...bounds }), area: workArea,
    tick(ms = 16) { now += ms; run('movementTick()'); },
    cursor(point) { cursor = point; },
    dispatch(command) { return handlers['companion:dispatch'](event, command); },
    drag(start) { listeners[start ? 'companion:drag-start' : 'companion:drag-end'](event); },
    move(point) { return handlers['companion:move'](event, point); },
    snapshot() { return JSON.parse(run('JSON.stringify(snapshot())')); },
  };
}

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
  assert.ok(pets[0].bounds().x >= 370 && pets[0].bounds().x < 384);
});

test('native fractional coordinates survive rounded window bounds', async () => {
  const pet = await harness();
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
  for (const [action, duration] of [['stretch', 2600], ['trick', 2800]]) {
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
  const pet = await harness();
  pet.dispatch({ type: 'interact', action: 'play' });
  pet.run('facing = "right"; regions = [{ type: "rect", x: 0, y: 0, width: 221, height: 234 }];');
  for (let frame = 0; frame < 60; frame++) {
    const bounds = pet.bounds();
    pet.cursor({ x: bounds.x + bounds.width / 2 + (frame % 2 ? -2 : 2), y: bounds.y + 220 });
    pet.tick();
    assert.equal(pet.snapshot().motion.moving, true);
    assert.equal(pet.snapshot().motion.facing, 'right');
  }
});
