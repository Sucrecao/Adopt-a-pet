// Offline complete-scene poses for the two upright reference characters.
// Production receives only finished PNG pictures, never these body landmarks.
export const GROUND = 226;
export const STRIDE = 40;
export const STANCE = .64;
export const WALK_FRAMES = 128;
export const STOP_FRAMES = 40;
export const LEGS = [{ name: 'leftPaw', hipX: 100.2, phase: 0 }, { name: 'rightPaw', hipX: 150.2, phase: .5 }];
export const clamp = x => Math.max(0, Math.min(1, x));
export const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const smooth = x => x * x * x * (10 + x * (-15 + 6 * x));
const mix = (a, b, t) => a + (b - a) * t;
const pulse = t => Math.sin(Math.PI * clamp(t)) ** 2;
export function projectLegX(pose, index, x) {
  const profile = Math.abs(pose.orientation);
  // Both identical rounded paws pivot in place. Keep their projected ordering
  // through the back half of a turn, so two supports never collapse or cross.
  return 128 + (x - 128) * profile + [-15, 15][index] * (1 - profile);
}

function base(species) {
  return { species, bodyY: 164, bodyTilt: 0, bodySquash: 0, headX: 139, headY: 93,
    headTilt: 0, ear: 0, tail: 0, eye: 1, mouth: 0, armLeft: 0, armRight: 0,
    armLift: 0, orientation: 1, feet: [] };
}

export function walkPose(species, phase) {
  const p = ((phase % 1) + 1) % 1, pose = base(species);
  const bob = 1.8 * Math.sin(2 * Math.PI * p) ** 2;
  pose.bodyY -= bob; pose.headY -= bob * .8;
  pose.armLeft = 4 * Math.sin(2 * Math.PI * p);
  pose.armRight = -pose.armLeft;
  pose.tail = 3 * Math.sin(2 * Math.PI * p);
  pose.ear = .85 * Math.sin(2 * Math.PI * p);
  pose.feet = LEGS.map(leg => {
    const raw = p + leg.phase, cycle = Math.floor(raw), q = raw - cycle;
    const contact = q <= STANCE, u = clamp((q - STANCE) / (1 - STANCE));
    const x = leg.hipX + (contact ? (.5 * STANCE - q) * STRIDE :
      -.5 * STANCE * STRIDE - STRIDE * (1 - STANCE) * u + STRIDE * smooth(u));
    return { name: leg.name, x, y: contact ? GROUND : GROUND - 9 * pulse(u) ** 2, contact, cycle };
  });
  return pose;
}

export function stopPose(species, phase, progress) {
  const first = walkPose(species, phase), last = walkPose(species, 0), t = clamp(progress);
  if (t === 0) return first;
  if (t === 1) return last;
  const pose = { ...first };
  for (const key of ['bodyY', 'headY', 'tail', 'ear', 'armLeft', 'armRight']) pose[key] = mix(first[key], last[key], ease(t));
  const airborne = first.feet.findIndex(f => !f.contact), order = airborne === 1 ? [1, 0] : [0, 1];
  pose.feet = first.feet.map((foot, index) => {
    const target = last.feet[index];
    if (foot.x === target.x && foot.y === target.y) return { ...target };
    const u = clamp((t - order.indexOf(index) * .38) / .58), e = smooth(u);
    if (u === 0) return { ...foot };
    if (u === 1) return { ...target };
    return { ...foot, x: mix(foot.x, target.x, e), y: GROUND - (GROUND - foot.y) * (1 - e) - 7 * pulse(u), contact: false };
  });
  return pose;
}

export function actionPose(species, clip, progress) {
  const t = clamp(progress), neutral = walkPose(species, 0);
  if (t === 0 || t === 1) return neutral;
  const pose = { ...neutral, feet: neutral.feet.map(f => ({ ...f })) }, a = pulse(t);
  if (clip === 'idle') {
    pose.bodyY -= .6 * a; pose.headY -= .35 * a;
    pose.eye = 1 - pulse((t - .44) / .12); pose.tail = 1.4 * Math.sin(2 * Math.PI * t) * a;
  } else if (clip === 'pet') {
    pose.headY -= 2 * a; pose.headTilt = -.07 * a; pose.eye = 1 - .94 * a;
    pose.mouth = .9 * a; pose.tail = 7 * Math.sin(6 * Math.PI * t) * a;
    pose.armLeft = -3 * a; pose.armRight = 3 * a;
  } else if (clip === 'feed') {
    pose.headY += 11 * a; pose.headX += 3 * a; pose.headTilt = .1 * a;
    pose.armLift = 25 * a; pose.mouth = .65 * Math.sin(12 * Math.PI * t) ** 2 * a;
  } else if (clip === 'groom') {
    pose.headTilt = -.11 * a; pose.headY += 4 * a;
    pose.armLift = 33 * a; pose.armRight = -7 * a; pose.eye = 1 - .7 * a; pose.mouth = .45 * a;
  } else if (clip === 'stretch') {
    pose.armLift = 59 * a; pose.headY -= 4 * a; pose.headTilt = -.04 * a;
    pose.bodyY -= 2 * a; pose.bodySquash = -.06 * a; pose.eye = 1 - .75 * a;
  } else if (clip === 'hop') {
    const lift = 29 * pulse((t - .15) / .7), crouch = 5 * pulse(t / .3) + 4 * pulse((t - .7) / .3);
    pose.bodyY += crouch - lift; pose.headY += crouch - lift; pose.bodySquash = crouch / 100;
    pose.armLift = lift * .32;
    pose.feet = pose.feet.map(f => ({ ...f, y: GROUND - lift, contact: lift === 0 }));
  } else throw new Error(`Unknown puppy clip ${clip}`);
  return pose;
}

export function restPose(species, progress, breath = 0) {
  const pose = walkPose(species, 0), t = ease(progress);
  if (t === 0) return pose;
  pose.bodyY += 29 * t - .5 * breath * t; pose.bodySquash = .32 * t;
  pose.headY += 57 * t - .25 * breath * t; pose.headX -= 10 * t;
  pose.headTilt = .15 * t; pose.eye = 1 - t; pose.armLift = -9 * t;
  pose.tail = -6 * t;
  return pose;
}

export function turnPose(species, progress) {
  const pose = walkPose(species, 0), t = ease(progress);
  pose.orientation = Math.cos(Math.PI * t);
  pose.headY -= 1.2 * Math.sin(Math.PI * t) ** 2;
  return pose;
}
