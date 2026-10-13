import { PETS } from './pets.js';

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const finite = (n, fallback) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
const actions = { pet: { happiness: 8, bond: 2 }, feed: { hunger: 18, happiness: 3, bond: 1 }, play: { energy: -8, happiness: 14, bond: 3 }, rest: {},
  stretch: { energy: -1, happiness: 4, bond: 1 }, trick: { energy: -3, happiness: 7, bond: 2 } };
// Keep complete authored care time after the bounded800ms pose connection.
// Rest already has ample time for its entry; playing uses its movement clock.
const durations = { pet: 3200, feed: 4000, play: 6000, rest: 30000, stretch: 3400, trick: 3600 };
const validName = name => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 24;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createState(now = Date.now()) {
  return { species: 'cat', name: '奶糖', adopted: false,
    stats: { hunger: 78, energy: 85, happiness: 80, bond: 0 },
    settings: { size: 1, movement: 'free', sound: false, alwaysOnTop: true, paused: false },
    action: { type: 'idle', until: 0 }, lastInteraction: 0, updatedAt: now };
}

export function normalizeState(value, now = Date.now()) {
  const state = createState(now);
  if (!isRecord(value)) return state;
  const pet = PETS.find(p => p.id === value.species);
  if (pet) state.species = pet.id;
  state.name = validName(value.name) ? value.name.trim() : (pet?.defaultName ?? state.name);
  state.adopted = typeof value.adopted === 'boolean' ? value.adopted : false;
  for (const key of Object.keys(state.stats)) state.stats[key] = clamp(finite(value.stats?.[key], state.stats[key]));
  state.settings.size = clamp(finite(value.settings?.size, 1), 0.65, 1.5);
  if (['free', 'edge'].includes(value.settings?.movement)) state.settings.movement = value.settings.movement;
  for (const key of ['sound', 'alwaysOnTop', 'paused']) {
    if (typeof value.settings?.[key] === 'boolean') state.settings[key] = value.settings[key];
  }
  if (Object.hasOwn(actions, value.action?.type) && Number.isFinite(value.action?.until)) {
    state.action = { type: value.action.type, until: clamp(value.action.until, 0, now + 30000) };
  }
  state.lastInteraction = clamp(finite(value.lastInteraction, 0), 0, now);
  state.updatedAt = clamp(finite(value.updatedAt, now), 0, now);
  return state;
}

export function decayState(value, now = Date.now()) {
  const state = normalizeState(value, now);
  const elapsed = Math.min(3600000, Math.max(0, now - state.updatedAt));
  if (!state.settings.paused) {
    const resting = state.action.type === 'rest' ? Math.min(elapsed, Math.max(0, state.action.until - state.updatedAt)) : 0;
    state.stats.hunger = clamp(state.stats.hunger - elapsed / 120000);
    state.stats.happiness = clamp(state.stats.happiness - elapsed / 240000);
    state.stats.energy = clamp(state.stats.energy + resting / 1000 - (elapsed - resting) / 240000);
  }
  if (state.action.until <= now) state.action = { type: 'idle', until: 0 };
  state.updatedAt = now;
  return state;
}

export function transition(value, command, now = Date.now()) {
  if (!isRecord(command)) throw new Error('无效操作');
  const state = decayState(value, now);
  switch (command.type) {
    case 'adopt': {
      const pet = PETS.find(p => p.id === command.species);
      if (!pet || (command.name !== undefined && !validName(command.name))) throw new Error('请选择宠物并填写 1–24 字名字');
      return { ...createState(now), species: pet.id, name: command.name?.trim() ?? pet.defaultName, adopted: true, settings: state.settings };
    }
    case 'rename':
      if (!validName(command.name)) throw new Error('名字须为 1–24 字');
      state.name = command.name.trim();
      break;
    case 'interact': {
      if (!Object.hasOwn(actions, command.action)) throw new Error('无效互动');
      if (state.settings.paused || ((state.lastInteraction > 0 || state.action.until > 0) && now - state.lastInteraction < 800)) return state;
      for (const [key, amount] of Object.entries(actions[command.action])) state.stats[key] = clamp(state.stats[key] + amount);
      state.action = { type: command.action, until: now + durations[command.action] };
      state.lastInteraction = now;
      break;
    }
    case 'settings':
      if (!isRecord(command.patch)) throw new Error('无效设置');
      for (const [key, value] of Object.entries(command.patch)) {
        const valid = key === 'size' ? Number.isFinite(value) && value >= 0.65 && value <= 1.5
          : key === 'movement' ? ['free', 'edge'].includes(value)
          : ['sound', 'alwaysOnTop', 'paused'].includes(key) && typeof value === 'boolean';
        if (!valid) throw new Error('无效设置');
        state.settings[key] = value;
      }
      break;
    case 'tick': break;
    default: throw new Error('无效操作');
  }
  return state;
}
