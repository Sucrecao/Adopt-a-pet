const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', {
  isDesktop: true,
  getState: () => ipcRenderer.invoke('companion:state'),
  dispatch: command => ipcRenderer.invoke('companion:dispatch', command),
  onState: listener => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('companion:update', handler);
    return () => ipcRenderer.removeListener('companion:update', handler);
  },
  onMotion: listener => {
    const handler = (_event, motion) => listener(motion);
    ipcRenderer.on('companion:motion', handler);
    return () => ipcRenderer.removeListener('companion:motion', handler);
  },
  setReducedMotion: value => ipcRenderer.invoke('companion:reduced-motion', value),
  showPanel: () => ipcRenderer.invoke('companion:panel'),
  hidePet: () => ipcRenderer.invoke('companion:hide'),
  setHitRegions: regions => ipcRenderer.send('companion:regions', regions),
  beginDrag: () => ipcRenderer.send('companion:drag-start'),
  endDrag: () => ipcRenderer.send('companion:drag-end'),
  movePet: point => ipcRenderer.invoke('companion:move', point),
  getDisplays: () => ipcRenderer.invoke('companion:displays'),
});
