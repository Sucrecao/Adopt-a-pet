import { createState, normalizeState, transition } from './core/state.js';

const STORAGE_KEY = 'pawpal.companion.v1';
const desktop = window.companion?.isDesktop === true;
const listeners = new Set();
let previewState;

function readPreview() {
  try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)), Date.now()); }
  catch { return createState(Date.now()); }
}

function broadcast(next) {
  previewState = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Session remains usable without storage. */ }
  listeners.forEach(listener => listener(next));
  return next;
}

export const bridge = desktop ? window.companion : {
  isDesktop: false,
  getState: async () => previewState ||= readPreview(),
  dispatch: async command => broadcast(transition(previewState ||= readPreview(), command, Date.now())),
  onState: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  showPanel: () => { if (new URLSearchParams(location.search).get('view') === 'pet') location.search = ''; },
  hidePet: () => {},
  setHitRegions: () => {},
  beginDrag: () => {},
  endDrag: () => {},
  movePet: () => {},
  getDisplays: async () => [],
};

if (!desktop) {
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) {
      previewState = readPreview();
      listeners.forEach(listener => listener(previewState));
    }
  });
}
