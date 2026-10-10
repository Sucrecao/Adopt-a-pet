const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isName = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 24;
const settings = {
  size: value => Number.isFinite(value) && value >= 0.65 && value <= 1.5,
  movement: value => ['free', 'edge'].includes(value),
  sound: value => typeof value === 'boolean',
  alwaysOnTop: value => typeof value === 'boolean',
  paused: value => typeof value === 'boolean',
};

function isValidCommand(command) {
  if (!isRecord(command)) return false;
  switch (command.type) {
    case 'adopt': return ['cat', 'dog', 'parrot'].includes(command.species) && isName(command.name);
    case 'rename': return isName(command.name);
    case 'interact': return ['pet', 'feed', 'play', 'rest'].includes(command.action);
    case 'settings': return isRecord(command.patch) && Object.entries(command.patch).every(([key, value]) => Object.hasOwn(settings, key) && settings[key](value));
    case 'tick': return true;
    default: return false;
  }
}

function isTrustedSender(event, windows) {
  return windows.some(window => window && !window.isDestroyed() && window.webContents === event.sender && window.webContents.mainFrame === event.senderFrame);
}

function isValidHitRegions(regions) {
  return Array.isArray(regions) && regions.length <= 16 && regions.every(region =>
    isRecord(region) && ['rect', 'ellipse'].includes(region.type) &&
    ['x', 'y', 'width', 'height'].every(key => Number.isFinite(region[key]) && region[key] >= 0 && region[key] <= 1000));
}

const isValidPoint = point => isRecord(point) && ['x', 'y'].every(key => Number.isFinite(point[key]) && Math.abs(point[key]) <= 100000);
module.exports = { isValidCommand, isTrustedSender, isValidHitRegions, isValidPoint };
