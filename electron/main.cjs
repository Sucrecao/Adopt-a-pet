const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isValidCommand, isTrustedSender, isValidHitRegions, isValidPoint, isValidVisualCommit } = require('./security.cjs');

if (process.env.PAWPAL_TEST_USER_DATA) app.setPath('userData', process.env.PAWPAL_TEST_USER_DATA);
let panel, petWindow, tray, state, storePath, transition, normalizeState, clampWindow, chooseTarget, advanceMotion, desktopSpriteSize, gaitSpeedDip;
let quitting = false, hidden = false, regions = [], ignoring = null, target = null, wanderAt = 0, saveTimer;
let dragging = null, moving = false, facing = 'right';
let motion = null, lastMovementAt = null, turnRemainingMs = 0;
let motionEpoch = 0, distanceDip = 0, reducedMotion = false;
let playbackReady = true, playbackReadyKnown = false, movementWanted = false, prepareEpoch = 0;
let petCatalog = [], visualRect = null, visualGeometrySeq = 0, visualSequence = 0, visualSpeedDip = 0;
const timers = [];
const devURL = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;
const preload = path.join(__dirname, 'preload.cjs');

function motionSnapshot() {
  const host = petWindow && !petWindow.isDestroyed() ? petWindow.getBounds() : null;
  const bounds = visualRect || host;
  return { clockKind: visualRect ? 'visual-root-v1' : 'native-window-v1', epoch: motionEpoch, distanceDip,
    spriteSizeDip: desktopSpriteSize(bounds?.width ?? 340 * (state?.settings.size ?? 1)),
    facing: facing === 'left' ? -1 : 1, moving, intentMoving: movementWanted || moving, prepareEpoch, dragging: Boolean(dragging),
    paused: Boolean(state?.settings.paused || reducedMotion || hidden),
    ...(visualRect && host ? { visual: { geometrySeq: visualGeometrySeq, host, rectGlobal: { ...visualRect },
      targetGlobal: target && { ...target }, speedDip: visualSpeedDip, committedSequence: visualSequence,
      displayId: screen.getDisplayMatching(host).id } } : {}) };
}
function emitMotion() {
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('companion:motion', motionSnapshot());
}
function snapshot() { return { ...state, motion: motionSnapshot(), desktop: { hidden } }; }
function publish() {
  for (const window of [panel, petWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('companion:update', snapshot());
  }
}
function saveNow() {
  if (!storePath || !state) return;
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(`${storePath}.tmp`, JSON.stringify(state), 'utf8');
    fs.renameSync(`${storePath}.tmp`, storePath);
  } catch (error) { console.error('保存宠物状态失败:', error.message); }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); }
function trusted(event) { return isTrustedSender(event, [panel, petWindow]); }
function secureWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
}
function load(window, view) {
  if (devURL) {
    const url = new URL(devURL);
    if (view) url.searchParams.set('view', view);
    return window.loadURL(url.href);
  }
  return window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: view ? { view } : {} });
}
function showPanel() {
  if (!panel || panel.isDestroyed()) createPanel();
  else { panel.show(); panel.focus(); }
}
function createPanel() {
  panel = new BrowserWindow({ width: 1280, height: 900, minWidth: 880, minHeight: 650,
    title: 'PawPal · 屏边小伙伴', icon:path.join(__dirname,'..','dist','icon.png'), backgroundColor: '#f7f7fb', autoHideMenuBar: true,
    show: false, webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  secureWindow(panel);
  panel.once('ready-to-show', () => panel.show());
  panel.on('close', event => { if (!quitting) { event.preventDefault(); panel.hide(); } });
  load(panel).catch(error => dialog.showErrorBox('无法打开领养面板', error.message));
}
// Electron's integer conversion rejects -0; normalize it only at the native boundary.
function rounded(bounds) { return Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value) + 0])); }
function areaFor(bounds) { return screen.getDisplayMatching(rounded(bounds)).workArea; }
function companionBounds() { return visualRect ? { ...visualRect } : petWindow.getBounds(); }
function wantsVisualPresentation() { return petCatalog.some(pet => pet.id === state?.species && pet.presentation === 'visual-root-v1'); }
function relocateVisual(rect, area) {
  // The native boundary owns host geometry. Ordinary renderer travel never calls this.
  petWindow.setBounds(rounded(area));
  const acceptedHost = petWindow.getBounds();
  visualRect = clampWindow(rect, acceptedHost);
  visualGeometrySeq++; regions = [];
}
function resetMotion() {
  const bounds = petWindow && !petWindow.isDestroyed() ? companionBounds() : null;
  motion = bounds ? { x: bounds.x, y: bounds.y, vx: 0, vy: 0, arrived: true } : null;
  lastMovementAt = Date.now();
  target = null; moving = false; movementWanted = false; playbackReady = !visualRect; turnRemainingMs = 0;
  motionEpoch++; distanceDip = 0;
  visualSequence = 0; visualSpeedDip = 0;
  emitMotion();
}
function constrainPet(area) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = companionBounds();
  if (visualRect) relocateVisual(bounds, area ?? areaFor(bounds));
  else petWindow.setBounds(rounded(clampWindow(bounds, area ?? areaFor(bounds))));
  resetMotion();
  publish();
}
function createPet() {
  if (petWindow && !petWindow.isDestroyed()) return;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.round(340 * state.settings.size), height = Math.round(360 * state.settings.size);
  const bounds = rounded(clampWindow({ x: area.x + (area.width - width) / 2,
    y: state.settings.movement === 'edge' ? area.y + area.height - height : area.y + (area.height - height) * 0.56, width, height }, area));
  visualRect = wantsVisualPresentation() ? { ...bounds } : null;
  if (visualRect) visualGeometrySeq++;
  petWindow = new BrowserWindow({ ...(visualRect ? rounded(area) : bounds), frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, hasShadow: false, skipTaskbar: true, show: false,
    alwaysOnTop: state.settings.alwaysOnTop, title: 'PawPal companion',
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  secureWindow(petWindow);
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  ignoring = true;
  if (process.platform === 'darwin') petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.once('ready-to-show', () => { if (!hidden) petWindow.showInactive(); });
  petWindow.on('closed', () => { petWindow = null; visualRect = null; regions = []; dragging = null; resetMotion(); });
  load(petWindow, 'pet').catch(error => dialog.showErrorBox('无法显示桌面宠物', error.message));
  resetMotion(); wanderAt = Date.now() + 5000;
}
function configurePet(previous) {
  if (!state.adopted) return;
  createPet();
  if (!petWindow || petWindow.isDestroyed()) return;
  if (previous.species !== state.species) dragging = null;
  petWindow.setAlwaysOnTop(state.settings.alwaysOnTop);
  if (Boolean(visualRect) !== wantsVisualPresentation()) {
    const bounds = companionBounds(), area = areaFor(bounds);
    if (wantsVisualPresentation()) relocateVisual(bounds, area);
    else { visualRect = null; petWindow.setBounds(rounded(clampWindow(bounds, area))); regions = []; }
    dragging = null; resetMotion(); wanderAt = 0;
  }
  if (previous.settings.size !== state.settings.size) {
    const bounds = companionBounds();
    const width = Math.round(340 * state.settings.size), height = Math.round(360 * state.settings.size);
    const adjusted = { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + bounds.height - height, width, height };
    if (visualRect) relocateVisual(adjusted, areaFor(bounds));
    else petWindow.setBounds(rounded(clampWindow(adjusted, areaFor(bounds))));
    regions = [];
    resetMotion(); wanderAt = 0;
  }
  if (previous.settings.movement !== state.settings.movement && state.settings.movement === 'edge' &&
      state.species !== 'parrot') {
    const bounds = companionBounds(), area = areaFor(bounds);
    if (visualRect) relocateVisual({ ...bounds, y: area.y + area.height - bounds.height }, area);
    else petWindow.setBounds(rounded(clampWindow({ ...bounds, y: area.y + area.height - bounds.height }, area)));
  }
  if (previous.settings.movement !== state.settings.movement || previous.species !== state.species ||
      (previous.settings.paused !== state.settings.paused && !turnRemainingMs)) {
    resetMotion(); wanderAt = 0;
  }
}
function hitAt(cursor, bounds) {
  const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
  return regions.some(region => {
    if (region.width <= 0 || region.height <= 0) return false;
    if (region.type === 'rect') return x >= region.x && y >= region.y && x <= region.x + region.width && y <= region.y + region.height;
    return ((x - region.x - region.width / 2) / (region.width / 2)) ** 2 + ((y - region.y - region.height / 2) / (region.height / 2)) ** 2 <= 1;
  });
}
function pointerTick() {
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
  const cursor = screen.getCursorScreenPoint();
  if (dragging) {
    const bounds = companionBounds();
    const next = { ...bounds, x: cursor.x - dragging.x, y: cursor.y - dragging.y };
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    if (visualRect) {
      const host = petWindow.getBounds();
      if (host.x !== area.x || host.y !== area.y || host.width !== area.width || host.height !== area.height) relocateVisual(next, area);
      else { visualRect = clampWindow(next, host); visualGeometrySeq++; }
    } else petWindow.setBounds(rounded(clampWindow(next, area)));
    resetMotion();
  }
  const ignore = !dragging && !hitAt(cursor, companionBounds());
  if (ignore !== ignoring) {
    petWindow.setIgnoreMouseEvents(ignore, { forward: true });
    ignoring = ignore;
  }
}
function movementTick() {
  const now = Date.now();
  const previousMovementAt = lastMovementAt;
  const elapsed = lastMovementAt === null ? 0 : Math.min(0.05, Math.max(0, (now - lastMovementAt) / 1000));
  lastMovementAt = now;
  if (!state.adopted || !petWindow || petWindow.isDestroyed() || !petWindow.isVisible() || state.settings.paused || reducedMotion || dragging) return;
  const bounds = companionBounds(), area = visualRect ? petWindow.getBounds() : areaFor(bounds);
  // getBounds() is integer-valued; use it for geometry, never to overwrite the
  // floating position during an ordinary tick.
  motion ??= { x: bounds.x, y: bounds.y, vx: 0, vy: 0, arrived: true };
  const action = state.action.until > now ? state.action.type : 'idle';
  if (petCatalog.some(pet => pet.id === state.species && pet.animationMode === 'original-apng-v1') ||
      ['rest', 'pet', 'feed', 'stretch', 'trick'].includes(action) ||
      (action !== 'play' && hitAt(screen.getCursorScreenPoint(), bounds))) {
    motion = { ...motion, vx: 0, vy: 0 };
    if (moving || movementWanted) { moving = false; movementWanted = false; emitMotion(); publish(); }
    return;
  }
  if (action === 'play') {
    const cursor = screen.getCursorScreenPoint();
    const chase = clampWindow({...bounds,x:cursor.x-bounds.width/2,y:cursor.y-bounds.height*0.6}, area);
    target = {x:chase.x,y:chase.y};
  } else if (!target && now >= wanderAt) target = chooseTarget(bounds, area, state.settings.movement);
  if (!target) return;
  const boundedTarget = clampWindow({ ...bounds, ...target }, area);
  target = { x: boundedTarget.x, y: state.species === 'parrot' ? boundedTarget.y : bounds.y };
  const dx = target.x - motion.x;
  const nearBehind = state.species !== 'parrot' && Math.abs(dx) <= 6
    && dx * (facing === 'left' ? -1 : 1) <= 0;
  const wasMovementWanted = movementWanted;
  const wantsMovement = !nearBehind && Math.hypot(dx, state.species === 'parrot' ? target.y - motion.y : 0) > 2;
  const newlyRequested = wantsMovement && !movementWanted;
  movementWanted = wantsMovement;
  if(newlyRequested && playbackReadyKnown) { prepareEpoch++; playbackReady = false; }
  const speed = gaitSpeedDip(state.species, action, desktopSpriteSize(bounds.width));
  // Grounded turns finish their foot transfers before the root can translate.
  // Facing is the requested heading; velocity can still point the old way while braking.
  const requestedFacing = Math.abs(dx) > 6 ? (dx > 0 ? 'right' : 'left') : facing;
  if (turnRemainingMs) {
    // An action that expires between ticks cannot charge its stationary time to the turn.
    const stationaryAction = ['rest', 'pet', 'feed', 'stretch', 'trick'].includes(state.action.type);
    const activeElapsed = stationaryAction && previousMovementAt < state.action.until ? 0 : elapsed;
    turnRemainingMs = Math.max(0, turnRemainingMs - activeElapsed * 1000);
    if (turnRemainingMs) {
      // The root stays still, but a changed chase intent must reach playback.
      // Otherwise it can prepare another step after a cancelled turn finishes.
      if (wasMovementWanted !== movementWanted) { emitMotion(); publish(); }
      return;
    }
  }
  if (nearBehind) {
    // A tiny chase correction must not move the window backwards while the
    // distance-driven feet and heading still describe a forward walk.
    motion = { ...motion, x: bounds.x, y: bounds.y, vx: 0, vy: 0, arrived: true };
    target = null; wanderAt = now + 4500 + Math.random() * 6500;
    const changed = moving || wasMovementWanted;
    moving = false; movementWanted = false;
    if (changed) { emitMotion(); publish(); }
    return;
  }
  if(wantsMovement && playbackReadyKnown && !playbackReady && (!visualRect || requestedFacing === facing)) {
    motion = { ...motion, vx: 0, vy: 0 };
    moving = false;
    if(newlyRequested) { emitMotion(); publish(); }
    return;
  }
  if (state.species !== 'parrot' && !turnRemainingMs && requestedFacing !== facing) {
    facing = requestedFacing; moving = false;
    motion = { ...motion, vx: 0, vy: 0 };
    turnRemainingMs = 800;
    emitMotion(); publish();
    return;
  }
  if (visualRect) {
    // Native code supplies intent, bounds and barriers. The renderer integrates
    // each rAF and reports only the root paired with a successful whole-frame draw.
    const changed = moving !== wantsMovement;
    moving = wantsMovement; visualSpeedDip = speed;
    if (!wantsMovement) { target = null; wanderAt = now + 4500 + Math.random() * 6500; }
    emitMotion();
    if (changed) publish();
    return;
  }
  motion = advanceMotion(motion, target, speed, elapsed);
  const constrained = clampWindow({ ...bounds, x: motion.x, y: motion.y }, area);
  if (motion.x !== constrained.x) motion.vx = 0;
  if (motion.y !== constrained.y) motion.vy = 0;
  motion.x = constrained.x; motion.y = constrained.y;
  const nextFacing = Math.abs(dx) > 6 && Math.abs(motion.vx) > 2 ? (motion.vx > 0 ? 'right' : 'left') : facing;
  const nextMoving = !motion.arrived;
  const changed = moving !== nextMoving || facing !== nextFacing;
  moving = nextMoving; facing = state.species === 'parrot' ? nextFacing : facing;
  if(motion.arrived)movementWanted = false;
  const position = rounded({ x: motion.x, y: motion.y });
  petWindow.setPosition(position.x, position.y);
  // Count accepted native DIP travel, never the floating integrator's proposal.
  const accepted = petWindow.getBounds();
  distanceDip += state.species === 'parrot'
    ? Math.hypot(accepted.x - bounds.x, accepted.y - bounds.y) : Math.abs(accepted.x - bounds.x);
  emitMotion();
  if (motion.arrived) { target = null; wanderAt = now + 4500 + Math.random() * 6500; }
  if (changed) publish();
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开领养面板', click: showPanel },
    { label: hidden ? '叫宠物出来' : '让宠物暂时隐藏', enabled: state.adopted, click: () => { hidden = !hidden; if (hidden) { dragging = null; petWindow?.hide(); } else { createPet(); petWindow?.showInactive(); } resetMotion(); updateTray(); publish(); } },
    { label: state.settings.paused ? '继续活动' : '暂停活动', enabled: state.adopted, click: () => { state = transition(state, {type:'settings',patch:{paused:!state.settings.paused}}); if (turnRemainingMs) lastMovementAt = Date.now(); else resetMotion(); publish(); scheduleSave(); updateTray(); } },
    { type: 'separator' },
    { label: '退出 PawPal', click: () => app.quit() },
  ]));
}
function createTray() {
  // A real RGBA bitmap keeps the tray independent from the renderer or SVG support.
  const size = 20, data = Buffer.alloc(size * size * 4);
  const dots = [{x:10,y:12,rx:5,ry:4},{x:4,y:6,rx:2,ry:2.5},{x:9,y:4,rx:2,ry:2.5},{x:14,y:5,rx:2,ry:2.5},{x:17,y:9,rx:1.7,ry:2.2}];
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    if (dots.some(dot => ((x-dot.x)/dot.rx)**2 + ((y-dot.y)/dot.ry)**2 <= 1)) {
      const offset = (y * size + x) * 4;
      data[offset] = 99; data[offset+1] = 76; data[offset+2] = 157; data[offset+3] = 255;
    }
  }
  const icon = nativeImage.createFromBitmap(data, {width:size,height:size,scaleFactor:1});
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('PawPal · 屏边小伙伴');
  tray.on('click', showPanel);
  updateTray();
}
function registerIPC() {
  const handle = (channel, callback) => ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('请求来自未知窗口');
    return callback(event, ...args);
  });
  handle('companion:state', () => snapshot());
  handle('companion:playback-ready', (event, value) => {
    if(event.sender !== petWindow?.webContents || !value || typeof value.ready !== 'boolean'
      || !Number.isInteger(value.epoch) || value.epoch !== prepareEpoch) return false;
    playbackReadyKnown = true; playbackReady = value.ready; return true;
  });
  handle('companion:reduced-motion', (_event, value) => {
    if (typeof value !== 'boolean') throw new Error('操作参数无效');
    if (reducedMotion !== value) {
      reducedMotion = value; if (turnRemainingMs) lastMovementAt = Date.now(); else { resetMotion(); wanderAt = 0; } publish();
    }
    return true;
  });
  handle('companion:dispatch', (_event, command) => {
    if (!isValidCommand(command)) throw new Error('操作参数无效');
    const previous = state;
    state = transition(state, command, Date.now());
    if (command.type === 'adopt') { hidden = false; createPet(); petWindow?.showInactive(); }
    configurePet(previous);
    if (previous.settings.paused !== state.settings.paused && turnRemainingMs) lastMovementAt = Date.now();
    if (command.type === 'interact' && state.lastInteraction !== previous.lastInteraction) {
      if (turnRemainingMs) { lastMovementAt = Date.now(); moving = false; emitMotion(); }
      else if (state.species !== 'parrot' && state.action.type === 'play' && (previous.action.until <= Date.now() || ['idle','play'].includes(previous.action.type))) {
        // Roaming and play share the current walk/first-step preparation. A
        // new chase target does not require a zero-distance stop packet that
        // would settle the barely lifted paw and prepare it a second time.
        target = null;
      }
      else resetMotion();
      wanderAt = state.action.type === 'play' ? 0 : state.action.until;
    }
    publish(); scheduleSave(); updateTray();
    return snapshot();
  });
  handle('companion:panel', () => showPanel());
  handle('companion:hide', () => { hidden = true; dragging = null; petWindow?.hide(); resetMotion(); publish(); updateTray(); });
  handle('companion:displays', () => screen.getAllDisplays().map(display => ({ id:display.id, label:display.label, workArea:display.workArea })));
  handle('companion:move', (_event, point) => {
    if (!isValidPoint(point) || !petWindow) return false;
    const bounds = companionBounds();
    const position = rounded({ x: point.x, y: point.y });
    if (visualRect) relocateVisual({ ...bounds, x: point.x, y: point.y }, screen.getDisplayNearestPoint(position).workArea);
    else petWindow.setBounds(rounded(clampWindow({...bounds,...position}, screen.getDisplayNearestPoint(position).workArea)));
    resetMotion(); wanderAt = Date.now() + 7000; publish();
    return true;
  });
  ipcMain.on('companion:regions', (event, values) => {
    if (!trusted(event) || event.sender !== petWindow?.webContents) return;
    if (visualRect) {
      if (values?.epoch === motionEpoch && values?.geometrySeq === visualGeometrySeq
        && isValidHitRegions(values.regions, visualRect)) regions = values.regions;
    } else if (isValidHitRegions(values)) regions = values;
  });
  ipcMain.on('companion:visual-commit', (event, value) => {
    if (!trusted(event) || event.sender !== petWindow?.webContents || !visualRect) return;
    if (!isValidVisualCommit(value, { epoch: motionEpoch, geometrySeq: visualGeometrySeq, sequence: visualSequence,
      rect: visualRect, area: petWindow.getBounds(), distanceDip,
      allowMovement: moving && !state.settings.paused && !reducedMotion && !hidden && !dragging && !turnRemainingMs })) return;
    visualRect = { ...value.rectGlobal }; distanceDip = value.distanceDip; visualSequence = value.sequence;
    motion = { x: visualRect.x, y: visualRect.y, vx: 0, vy: 0, arrived: false };
  });
  ipcMain.on('companion:drag-start', event => {
    if (!trusted(event) || event.sender !== petWindow?.webContents) return;
    const cursor = screen.getCursorScreenPoint(), bounds = companionBounds();
    dragging = {x:cursor.x-bounds.x,y:cursor.y-bounds.y};
    resetMotion(); publish();
  });
  ipcMain.on('companion:drag-end', event => {
    if (!trusted(event) || event.sender !== petWindow?.webContents) return;
    dragging = null; constrainPet(); wanderAt = Date.now() + 8000; publish();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showPanel);
  app.whenReady().then(async () => {
    ({ transition, normalizeState } = await import(pathToFileURL(path.join(__dirname, '..', 'src/core/state.js')).href));
    ({ clampWindow, chooseTarget } = await import(pathToFileURL(path.join(__dirname, '..', 'src/core/geometry.js')).href));
    ({ advanceMotion } = await import(pathToFileURL(path.join(__dirname, '..', 'src/core/motion.js')).href));
    ({ desktopSpriteSize, gaitSpeedDip } = await import(pathToFileURL(path.join(__dirname, '..', 'src/core/gait.js')).href));
    ({ PETS: petCatalog } = await import(pathToFileURL(path.join(__dirname, '..', 'src/core/pets.js')).href));
    storePath = path.join(app.getPath('userData'), 'companion.json');
    try { state = normalizeState(JSON.parse(fs.readFileSync(storePath, 'utf8'))); }
    catch { state = normalizeState(null); }
    state = transition(state, {type:'tick'});
    registerIPC(); createPanel(); createTray();
    if (state.adopted) createPet();
    timers.push(setInterval(pointerTick, 40), setInterval(movementTick, 16), setInterval(() => {
      state = transition(state, {type:'tick'}); publish(); scheduleSave();
    }, 1000));
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, () => constrainPet());
    app.on('activate', showPanel);
  }).catch(error => { dialog.showErrorBox('PawPal 启动失败', error.message); app.quit(); });
  app.on('before-quit', () => { quitting = true; for (const timer of timers) clearInterval(timer); clearTimeout(saveTimer); saveNow(); });
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
}
