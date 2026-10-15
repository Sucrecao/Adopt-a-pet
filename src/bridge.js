import { createState, normalizeState, transition } from './core/state.js';
import { createStandReminderController } from './core/stand-reminder.js';
import { getBeijingPeriod } from './core/companion-routine.js';

const STORAGE_KEY = 'pawpal.companion.v1';
const desktop = window.companion?.isDesktop === true;
const listeners = new Set();
let previewState;
let previewHidden = false, previewReminder = null, reminderSpecies;
const previewReminderController = desktop ? null : createStandReminderController();

function readPreview() {
  try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)), Date.now()); }
  catch { return createState(Date.now()); }
}

function previewSnapshot() {
  previewState ||= readPreview();
  const now = Date.now();
  if (reminderSpecies !== previewState.species) {
    reminderSpecies = previewState.species; previewReminderController.reset(now);
  }
  previewReminder = previewReminderController.sample({ now, enabled: previewState.settings.standReminder !== false,
    available: previewState.adopted && !previewState.settings.paused && !previewHidden
      && !document.hidden && getBeijingPeriod(now).key !== 'sleep' });
  return { ...previewState, desktop: { hidden: previewHidden }, standReminder: previewReminder };
}

function notifyPreview() {
  const next = previewSnapshot();
  listeners.forEach(listener => listener(next));
  return next;
}

function broadcast(next) {
  previewState = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Session remains usable without storage. */ }
  return notifyPreview();
}

const validReminderId = id => Number.isSafeInteger(id) && id > 0;

export const bridge = desktop ? window.companion : {
  isDesktop: false,
  getState: async () => previewSnapshot(),
  dispatch: async command => {
    if (command?.type === 'adopt') previewHidden = false;
    return broadcast(transition(previewState ||= readPreview(), command, Date.now()));
  },
  presentStandReminder: async id => {
    if (!validReminderId(id)) throw new Error('操作参数无效');
    previewSnapshot();
    previewReminder = previewReminderController.present(id, Date.now());
    notifyPreview();
    return previewReminder;
  },
  dismissStandReminder: async id => {
    if (!validReminderId(id)) throw new Error('操作参数无效');
    previewReminder = previewReminderController.dismiss(id);
    notifyPreview();
    return previewReminder;
  },
  onState: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  onMotion: () => () => {},
  setReducedMotion: async () => true,
  setPlaybackReady: async () => true,
  showPanel: () => { if (new URLSearchParams(location.search).get('view') === 'pet') location.search = ''; },
  hidePet: () => { previewHidden = true; notifyPreview(); },
  setHitRegions: () => {},
  beginDrag: () => {},
  endDrag: () => {},
  movePet: () => {},
  getDisplays: async () => [],
};

if (!desktop) {
  setInterval(notifyPreview, 1000);
  document.addEventListener('visibilitychange', () => {
    previewReminderController.reset(Date.now());
    notifyPreview();
  });
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) {
      previewState = readPreview();
      notifyPreview();
    }
  });
}
