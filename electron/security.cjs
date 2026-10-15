const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isName = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 24;
const settings = {
  size: value => Number.isFinite(value) && value >= 0.65 && value <= 1.5,
  movement: value => ['free', 'edge'].includes(value),
  sound: value => typeof value === 'boolean',
  alwaysOnTop: value => typeof value === 'boolean',
  paused: value => typeof value === 'boolean',
  standReminder: value => typeof value === 'boolean',
};

function isValidCommand(command) {
  if (!isRecord(command)) return false;
  switch (command.type) {
    case 'adopt': return ['maltese', 'golden', 'parrot'].includes(command.species) && isName(command.name);
    case 'rename': return isName(command.name);
    case 'interact': return ['pet', 'feed', 'play', 'rest', 'stretch', 'trick'].includes(command.action);
    case 'original-animation': return Number.isInteger(command.clip) && command.clip >= 1 && command.clip <= 24;
    case 'settings': return isRecord(command.patch) && Object.entries(command.patch).every(([key, value]) => Object.hasOwn(settings, key) && settings[key](value));
    case 'tick': return true;
    default: return false;
  }
}

function isTrustedSender(event, windows) {
  return windows.some(window => window && !window.isDestroyed() && window.webContents === event.sender && window.webContents.mainFrame === event.senderFrame);
}

function isValidHitRegions(regions, logicalSize) {
  return Array.isArray(regions) && regions.length <= 16 && regions.every(region =>
    isRecord(region) && ['rect', 'ellipse'].includes(region.type) &&
    ['x', 'y', 'width', 'height'].every(key => Number.isFinite(region[key]) && region[key] >= 0 && region[key] <= 1000)
    && (!logicalSize || region.x + region.width <= logicalSize.width + .01
      && region.y + region.height <= logicalSize.height + .01));
}

function isValidVisualCommit(value, context) {
  if (!isRecord(value) || value.clockKind !== 'visual-root-v1'
    || value.epoch !== context.epoch || value.geometrySeq !== context.geometrySeq
    || !Number.isSafeInteger(value.sequence) || value.sequence <= context.sequence
    || !Number.isFinite(value.distanceDip) || value.distanceDip < context.distanceDip
    || !Number.isInteger(value.selectedFrame) || value.selectedFrame < 0 || value.selectedFrame > 100000
    || !Number.isFinite(value.phase) || !isRecord(value.rectGlobal)) return false;
  const rect = value.rectGlobal, before = context.rect, area = context.area;
  if (!['x','y','width','height'].every(key => Number.isFinite(rect[key]))
    || rect.width !== before.width || rect.height !== before.height
    || Math.abs(rect.y - before.y) > .00001
    || rect.x < area.x - .00001 || rect.y < area.y - .00001
    || rect.x + rect.width > area.x + area.width + .00001
    || rect.y + rect.height > area.y + area.height + .00001) return false;
  const travel = Math.abs(rect.x - before.x);
  return (context.allowMovement || travel < .00001)
    && Math.abs(value.distanceDip - context.distanceDip - travel) < .00001;
}

const isValidPoint = point => isRecord(point) && ['x', 'y'].every(key => Number.isFinite(point[key]) && Math.abs(point[key]) <= 100000);
const isValidReminderId = id => Number.isSafeInteger(id) && id > 0;
module.exports = { isValidCommand, isTrustedSender, isValidHitRegions, isValidPoint, isValidVisualCommit, isValidReminderId };
