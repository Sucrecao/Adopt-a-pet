const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('enlarging a roaming pet replaces its old destination and keeps subsequent movement on screen', async () => {
  const geometry = await import('../src/core/geometry.js');
  const mainPath = path.join(__dirname, '../electron/main.cjs');
  const mainRequire = createRequire(mainPath);
  const workArea = { x: 0, y: 0, width: 1000, height: 800 };
  let bounds = { x: 300, y: 300, width: 221, height: 234 };
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => ({ ...bounds }),
    setBounds: next => { bounds = { ...next }; },
    setPosition: (x, y) => { bounds = { ...bounds, x, y }; },
    setAlwaysOnTop: () => {},
    webContents: { send: () => {} },
  };
  const electron = {
    app: { isPackaged: true, requestSingleInstanceLock: () => false, quit: () => {} },
    screen: {
      getDisplayMatching: () => ({ workArea }),
      getCursorScreenPoint: () => ({ x: -100, y: -100 }),
    },
  };
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : mainRequire(name),
    __dirname: path.dirname(mainPath), process: { env: {} }, console,
    window, geometry,
  });
  // Append a harness to the evaluated source rather than exposing production test hooks.
  vm.runInContext(`${fs.readFileSync(mainPath, 'utf8')}
    petWindow = window;
    clampWindow = geometry.clampWindow;
    chooseTarget = (bounds, area, mode) => geometry.chooseTarget(bounds, area, mode, () => 0.9);
    state = { adopted: true, species: 'cat', action: { type: 'idle' },
      settings: { size: 0.65, movement: 'free', paused: false, alwaysOnTop: true } };
    target = { x: 720, y: 500 };
    wanderAt = Date.now() + 60000;
    movementTick();
    const previous = state;
    state = { ...state, settings: { ...state.settings, size: 1.5 } };
    configurePet(previous);
  `, context, { filename: mainPath });

  const resized = { ...bounds };
  assert.equal(bounds.width, 510);
  assert.equal(bounds.height, 540);
  let moved = false;
  for (let tick = 0; tick < 300; tick++) {
    vm.runInContext('movementTick()', context);
    moved ||= bounds.x !== resized.x || bounds.y !== resized.y;
    assert.ok(bounds.x >= workArea.x && bounds.y >= workArea.y &&
      bounds.x + bounds.width <= workArea.x + workArea.width &&
      bounds.y + bounds.height <= workArea.y + workArea.height,
    `pet left work area on tick ${tick}: ${JSON.stringify(bounds)}`);
  }
  assert.ok(moved, 'pet must resume moving after the resize');
});
