const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isValidCommand, isTrustedSender, isValidHitRegions, isValidPoint } = require('./security.cjs');

if (process.env.PAWPAL_TEST_USER_DATA) app.setPath('userData', process.env.PAWPAL_TEST_USER_DATA);
let panel, petWindow, tray, state, storePath, transition, normalizeState, clampWindow, chooseTarget;
let quitting = false, hidden = false, regions = [], ignoring = null, target = null, wanderAt = 0, saveTimer;
let dragging = null, moving = false, facing = 'right';
const timers = [];
const devURL = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;
const preload = path.join(__dirname, 'preload.cjs');

function snapshot() { return { ...state, motion: { moving, facing, dragging: Boolean(dragging) }, desktop: { hidden } }; }
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
function rounded(bounds) { return Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value)])); }
function areaFor(bounds) { return screen.getDisplayMatching(bounds).workArea; }
function constrainPet(area) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  petWindow.setBounds(rounded(clampWindow(bounds, area ?? areaFor(bounds))));
  target = null;
}
function createPet() {
  if (petWindow && !petWindow.isDestroyed()) return;
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.round(340 * state.settings.size), height = Math.round(360 * state.settings.size);
  const bounds = rounded(clampWindow({ x: area.x + (area.width - width) / 2,
    y: state.settings.movement === 'edge' ? area.y + area.height - height : area.y + (area.height - height) * 0.56, width, height }, area));
  petWindow = new BrowserWindow({ ...bounds, frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, hasShadow: false, skipTaskbar: true, show: false,
    alwaysOnTop: state.settings.alwaysOnTop, title: 'PawPal companion',
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  secureWindow(petWindow);
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  ignoring = true;
  if (process.platform === 'darwin') petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.once('ready-to-show', () => { if (!hidden) petWindow.showInactive(); });
  petWindow.on('closed', () => { petWindow = null; regions = []; });
  load(petWindow, 'pet').catch(error => dialog.showErrorBox('无法显示桌面宠物', error.message));
  wanderAt = Date.now() + 5000;
}
function configurePet(previous) {
  if (!state.adopted) return;
  createPet();
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.setAlwaysOnTop(state.settings.alwaysOnTop);
  if (previous.settings.size !== state.settings.size) {
    const bounds = petWindow.getBounds();
    const width = Math.round(340 * state.settings.size), height = Math.round(360 * state.settings.size);
    const adjusted = { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + bounds.height - height, width, height };
    petWindow.setBounds(rounded(clampWindow(adjusted, areaFor(bounds))));
    regions = [];
    target = null; wanderAt = 0;
  }
  if (previous.settings.movement !== state.settings.movement || previous.species !== state.species) {
    target = null; wanderAt = 0;
  }
  if (state.settings.paused) { moving = false; target = null; }
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
    const bounds = petWindow.getBounds();
    const next = { ...bounds, x: cursor.x - dragging.x, y: cursor.y - dragging.y };
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    petWindow.setBounds(rounded(clampWindow(next, area)));
  }
  const ignore = !dragging && !hitAt(cursor, petWindow.getBounds());
  if (ignore !== ignoring) {
    petWindow.setIgnoreMouseEvents(ignore, { forward: true });
    ignoring = ignore;
  }
}
function movementTick() {
  if (!state.adopted || !petWindow || petWindow.isDestroyed() || !petWindow.isVisible() || state.settings.paused || dragging) return;
  const now = Date.now(), bounds = petWindow.getBounds();
  if (hitAt(screen.getCursorScreenPoint(), bounds) || ['rest', 'pet', 'feed'].includes(state.action.type)) {
    if (moving) { moving = false; publish(); }
    return;
  }
  if (state.action.type === 'play') {
    const cursor = screen.getCursorScreenPoint();
    const chase = clampWindow({...bounds,x:cursor.x-bounds.width/2,y:cursor.y-bounds.height*0.6}, areaFor(bounds));
    target = {x:chase.x,y:chase.y};
  } else if (!target && now >= wanderAt) target = chooseTarget(bounds, areaFor(bounds), state.settings.movement);
  if (!target) return;
  const dx = target.x - bounds.x, dy = target.y - bounds.y, distance = Math.hypot(dx, dy);
  if (distance < 5) {
    target = null; moving = false; wanderAt = now + 4500 + Math.random() * 6500; publish(); return;
  }
  const speed = (state.species === 'parrot' ? 85 : state.species === 'dog' ? 58 : 42) * (state.action.type === 'play' ? 1.7 : 1);
  const step = Math.min(distance, speed * 0.08);
  const nextFacing = dx >= 0 ? 'right' : 'left';
  const changed = !moving || facing !== nextFacing;
  moving = true; facing = nextFacing;
  petWindow.setPosition(Math.round(bounds.x + dx / distance * step), Math.round(bounds.y + dy / distance * step));
  if (changed) publish();
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开领养面板', click: showPanel },
    { label: hidden ? '叫宠物出来' : '让宠物暂时隐藏', enabled: state.adopted, click: () => { hidden = !hidden; if (hidden) petWindow?.hide(); else { createPet(); petWindow?.showInactive(); } updateTray(); publish(); } },
    { label: state.settings.paused ? '继续活动' : '暂停活动', enabled: state.adopted, click: () => { state = transition(state, {type:'settings',patch:{paused:!state.settings.paused}}); moving = false; target = null; publish(); scheduleSave(); updateTray(); } },
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
  handle('companion:dispatch', (_event, command) => {
    if (!isValidCommand(command)) throw new Error('操作参数无效');
    const previous = state;
    state = transition(state, command, Date.now());
    if (command.type === 'adopt') { hidden = false; createPet(); petWindow?.showInactive(); }
    configurePet(previous);
    if (command.type === 'interact' && command.action === 'play') { target = null; wanderAt = 0; }
    publish(); scheduleSave(); updateTray();
    return snapshot();
  });
  handle('companion:panel', () => showPanel());
  handle('companion:hide', () => { hidden = true; petWindow?.hide(); moving = false; publish(); updateTray(); });
  handle('companion:displays', () => screen.getAllDisplays().map(display => ({ id:display.id, label:display.label, workArea:display.workArea })));
  handle('companion:move', (_event, point) => {
    if (!isValidPoint(point) || !petWindow) return false;
    const bounds = petWindow.getBounds();
    petWindow.setBounds(rounded(clampWindow({...bounds,...point}, screen.getDisplayNearestPoint(point).workArea)));
    target = null; wanderAt = Date.now() + 7000;
    return true;
  });
  ipcMain.on('companion:regions', (event, values) => {
    if (trusted(event) && event.sender === petWindow?.webContents && isValidHitRegions(values)) regions = values;
  });
  ipcMain.on('companion:drag-start', event => {
    if (!trusted(event) || event.sender !== petWindow?.webContents) return;
    const cursor = screen.getCursorScreenPoint(), bounds = petWindow.getBounds();
    dragging = {x:cursor.x-bounds.x,y:cursor.y-bounds.y};
    target = null; moving = false; publish();
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
    storePath = path.join(app.getPath('userData'), 'companion.json');
    try { state = normalizeState(JSON.parse(fs.readFileSync(storePath, 'utf8'))); }
    catch { state = normalizeState(null); }
    state = transition(state, {type:'tick'});
    registerIPC(); createPanel(); createTray();
    if (state.adopted) createPet();
    timers.push(setInterval(pointerTick, 40), setInterval(movementTick, 80), setInterval(() => {
      state = transition(state, {type:'tick'}); publish(); scheduleSave();
    }, 1000));
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, () => constrainPet());
    app.on('activate', showPanel);
  }).catch(error => { dialog.showErrorBox('PawPal 启动失败', error.message); app.quit(); });
  app.on('before-quit', () => { quitting = true; for (const timer of timers) clearInterval(timer); clearTimeout(saveTimer); saveNow(); });
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
}
