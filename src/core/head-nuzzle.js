// Coordinates refer to complete 320 × 300 source pictures, including transparent margins.
const heads = {
  maltese: { 7: [.30, .32, .40, .28], 16: [.34, .20, .39, .31], 22: [.42, .50, .34, .28] },
  golden: { 7: [.24, .30, .46, .30], 16: [.27, .22, .40, .31], 22: [.33, .39, .36, .29] },
};

/** A coarse head ellipse followed by an opaque-source-pixel check avoids transparent hit boxes. */
export function getHeadContact({ species, clip, rect, point, alphaAt }) {
  const head = heads[species]?.[clip];
  if (!head || !rect || !point || !(rect.width > 0 && rect.height > 0) || typeof alphaAt !== 'function') return null;
  const scale = Math.min(rect.width / 320, rect.height / 300);
  const x = (point.x - rect.x - (rect.width - 320 * scale) / 2) / scale;
  const y = (point.y - rect.y - (rect.height - 300 * scale) / 2) / scale;
  const [left, top, width, height] = head;
  const centerX = (left + width / 2) * 320, centerY = (top + height / 2) * 300;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= 320 || y < 0 || y >= 300
    || ((x - centerX) / (width * 160)) ** 2 + ((y - centerY) / (height * 150)) ** 2 > 1) return null;
  if (!(alphaAt(Math.floor(x), Math.floor(y)) > 0)) return null;
  return { direction: x < centerX ? -1 : 1 };
}

/** The timer continues while a pointer rests still, but never repeats within one entry. */
export function createHeadNuzzleController() {
  let enteredAt, leftAt, identity, fired = false, gestureId = 0, lastCueAt = -Infinity;
  return {
    sample({ now, species, clip, token, contact, enabled = true, pressed = false }) {
      const touching = Boolean(enabled && !pressed && contact);
      if (!touching) {
        enteredAt = undefined; identity = undefined;
        if (!enabled || pressed) leftAt = undefined;
        else {
          leftAt ??= now;
          if (now - leftAt >= 250) fired = false;
        }
        return { cue: null, touching: false, direction: 1 };
      }
      if (leftAt !== undefined && now - leftAt >= 250) fired = false;
      leftAt = undefined;
      const nextIdentity = `${species}:${clip}:${token}`;
      if (identity !== nextIdentity) { identity = nextIdentity; enteredAt = now; }
      let cue = null;
      if (!fired && now - enteredAt >= 400 && now - lastCueAt >= 10000) {
        fired = true; lastCueAt = now;
        cue = { species, clip, token, gestureId: ++gestureId, direction: contact.direction === -1 ? -1 : 1 };
      }
      return { cue, touching: true, direction: contact.direction === -1 ? -1 : 1 };
    },
  };
}
