# Desktop companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver a runnable Mac/Windows desktop pet with cat, dog, parrot selection, free movement and playful interactions.

**Architecture:** Electron owns desktop windows and persisted state, React renders a shared adoption panel and pet overlay, and a pure core owns state transitions and geometry. A browser adapter supports a clearly labeled interactive preview with the same actions.

**Tech Stack:** React, Vite, Electron, electron-builder, Node's test runner, generated transparent sprite atlases.

## Global Constraints

- Mac/Windows; Chinese UI; cat/dog/parrot; both free and edge movement.
- Real transparent desktop window with click-through empty space; isolated preload, no renderer Node integration.
- Interactions: pet, feed, play, rest; bounds, cooldowns and local persistence.
- Browser UI must identify preview mode and not claim to place a pet on the OS desktop.
- Windows runtime is not verified on this Mac; build Windows in Windows CI.

### Task 1: Core and tested desktop contract

**Files:** `src/core/pets.js`, `src/core/state.js`, `src/core/geometry.js`, `tests/core.test.js`.

**Interfaces:** `PETS` array of `{ id, label, defaultName, subtitle, description, personality, toyLabel, color, asset }`; `createState(now)`, `normalizeState(value, now)`, `transition(state, command, now)`, `decayState(state, now)`; `clampWindow(bounds, workArea)`, `chooseTarget(bounds, workArea, mode, random)`.

**State:** `{ species:'cat', name:'奶糖', adopted:false, stats:{hunger:78,energy:85,happiness:80,bond:0}, settings:{size:1,movement:'free',sound:false,alwaysOnTop:true,paused:false}, action:{type:'idle',until:0}, lastInteraction:0, updatedAt }`.

**Commands:** `{type:'adopt',species,name}`, `{type:'rename',name}`, `{type:'interact',action:'pet'|'feed'|'play'|'rest'}`, `{type:'settings',patch}`, `{type:'tick'}`. Invalid values are rejected or normalized safely; an interaction returns state with `action.type` and `action.until`.

- [x] Write public behavior tests for cooldown, invalid species/settings, offline decay and screen boundaries; run `node --test tests/core.test.js` to observe missing implementation failures.
- [x] Implement data and pure functions; run the same command, expect all assertions passing.

```js
import assert from 'node:assert/strict';
const s = transition(createState(1000), { type: 'adopt', species: 'cat', name: '奶糖' }, 1000);
assert.equal(s.adopted, true);
const fed = transition(s, { type: 'interact', action: 'feed' }, 5000);
assert.ok(fed.stats.hunger > s.stats.hunger);
assert.deepEqual(clampWindow({x:999,y:999,width:300,height:300},{x:0,y:0,width:800,height:600}), {x:500,y:300,width:300,height:300});
```

### Task 2: Desktop shell

**Files:** `electron/main.cjs`, `electron/preload.cjs`, `electron/security.cjs`, `tests/security.test.cjs`, package/build files, `scripts/dev.mjs`.

**Interfaces:** `window.companion = {isDesktop:true,getState(),dispatch(command),onState(listener),showPanel(),hidePet(),setHitRegions(regions),beginDrag(),endDrag(),movePet(point),getDisplays()}`. `onState` returns unsubscribe. Renderer mode `?view=pet` identifies overlay.

- [x] Write IPC command/source validation tests and verify failures using `node --test tests/security.test.cjs`.
- [x] Implement whitelist validation, safe persisted state and isolated Electron IPC. Start renderer with `VITE_DEV_SERVER_URL` only in unpackaged mode; packaged mode loads `dist/index.html`.
- [x] Poll cursor to handle click-through; constrain small moving window to workArea; suspend movement while dragging/interacting/paused; tray supports show/hide/panel/quit.
- [x] Build with `npm run build`; launch `npm run dev` and inspect panel/overlay.

```js
new BrowserWindow({frame:false,transparent:true,resizable:false,skipTaskbar:true,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
ipcMain.handle('companion:dispatch', (event, command) => {
  if (!isTrustedSender(event, windows) || !isValidCommand(command)) throw new Error('Invalid request');
  state = transition(state, command, Date.now());
  publish();
  return state;
});
```

### Task 3: Adoption panel and playful renderer

**Files:** `src/App.jsx`, `src/Pet.jsx`, `src/bridge.js`, `src/styles.css`, `src/main.jsx`, `index.html`.

**Interfaces:** imports Task 1 core; bridge implements desktop API and localStorage adapter; sprite atlas has 3 columns × 2 rows for idle, walk1, walk2, sleep, play, affection.

- [x] Add renderer user journey checks: choose pet, name, adopt, feed/play/rest, switch modes; verify missing behavior before implementation.
- [x] Implement sidebar and pet cards, interactive desktop stage, working settings, stats and feedback, keyboard focus, reduced motion and responsive layout.
- [x] Implement overlay with `Pet` sprite, hit region registration and drag pointer capture; toolbar interactions and preview target pursuit.
- [x] Run browser journey with Playwright and screenshot visual review; test real Electron path for source persistence and transparency.

```js
const next = await companion.dispatch({ type: 'interact', action: 'play' });
setState(next);
// Assets: /pets/cat.png, /pets/dog.png, /pets/parrot.png in development;
// use import.meta.env.BASE_URL for packaged relative resource URLs.
```

### Task 4: Assets, builds and review

**Files:** `public/pets/*.png`, `docs/asset-prompts.md`, `README.md`, `.github/workflows/build.yml`, `tests/renderer.spec.mjs`.

- [x] Generate three transparent realistic pet atlases through built-in imagegen; inspect them and copy originals into project.
- [x] Document `npm install`, `npm run dev`, `npm run dev:web`, `npm run build`, `npm run pack`, and platform packaging commands. Add Mac/Windows CI with lockfile.
- [x] Run `npm test`, `npm run build`, browser journeys and Electron smoke; independently review IPC, click-through, movement and UI requirements, fix significant findings.
- [x] Deliver runnable source, local Mac build when possible, and clear Windows verification limitation.
