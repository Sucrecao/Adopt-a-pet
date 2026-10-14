// Offline anatomical pose authoring. Nothing in this module runs in the pet renderer.
export const GROUND = 226;
export const STRIDE = 56;
export const STANCE = .8;
export const WALK_FRAMES = 128;
export const STOP_FRAMES = 40;
export const LEGS = [
  { name: 'rearFar', hipX: 98, phase: 0, far: true, rear: true },
  { name: 'frontFar', hipX: 166, phase: .5, far: true, rear: false },
  { name: 'rearNear', hipX: 100, phase: .75, far: false, rear: true },
  { name: 'frontNear', hipX: 174, phase: .25, far: false, rear: false },
];
// Near/far limb depth stays visible when the longitudinal axis faces the
// viewer. The profile endpoints retain their original exact geometry.
export function projectLegX(pose, legIndex, x) {
  const o = pose.orientation, depth = [-16, -18, 16, 18][legIndex];
  return 128 + (x - 128) * o + depth * Math.sqrt(Math.max(0, 1 - o * o));
}
export const clamp = x => Math.max(0, Math.min(1, x));
export const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const smoother = x => x * x * x * (10 + x * (-15 + 6 * x));
const mix = (a, b, t) => a + (b - a) * t;
const pulse = t => Math.sin(Math.PI * t) ** 2;

function basePose(species) {
  return { species, bodyY: 161, bodyTilt: 0, bodySquash: 0, headX: species === 'cat' ? 187 : 188,
    headY: species === 'cat' ? 125 : 121, headTilt: 0, ear: 0, tail: 0, eye: 1, mouth: 0,
    orientation: 1, feet: [] };
}

export function walkPose(species, phase) {
  const p = ((phase % 1) + 1) % 1;
  const pose = basePose(species);
  pose.bodyY -= 1.35 * Math.sin(4 * Math.PI * p) ** 2;
  pose.headY -= .6 * Math.sin(4 * Math.PI * p) ** 2;
  pose.tail = 3.5 * Math.sin(2 * Math.PI * p);
  pose.ear = 1.7 * Math.sin(2 * Math.PI * p);
  pose.feet = LEGS.map(leg => {
    const raw = p + leg.phase, cycle = Math.floor(raw), q = raw - cycle;
    const contact = q <= STANCE;
    const swing = clamp((q - STANCE) / (1 - STANCE));
    // Author the airborne toe in world space: stationary velocity and
    // acceleration meet each stance. The local derivative is -STRIDE at both
    // endpoints because accepted root travel supplies +STRIDE.
    const x = leg.hipX + (contact ? (.5 * STANCE - q) * STRIDE :
      (.5 * STANCE - STANCE) * STRIDE - STRIDE * (1 - STANCE) * swing + STRIDE * smoother(swing));
    return { name: leg.name, x, y: contact ? GROUND : GROUND - 13 * pulse(swing) ** 2, contact, cycle };
  });
  return pose;
}

export function stopPose(species, phase, progress) {
  const initial = walkPose(species, phase), neutral = walkPose(species, 0), t = clamp(progress);
  if (t === 0) return initial;
  if (t === 1) return neutral;
  const pose = { ...initial };
  for (const key of ['bodyY', 'headY', 'tail', 'ear']) pose[key] = mix(initial[key], neutral[key], ease(t));
  const order = initial.feet.map((f, i) => i).sort((a, b) => Number(initial.feet[a].contact) - Number(initial.feet[b].contact) || a - b);
  pose.feet = initial.feet.map((foot, leg) => {
    const goal = neutral.feet[leg], rank = order.indexOf(leg);
    if (foot.x === goal.x && foot.y === goal.y) return { ...goal };
    const start = initial.feet.some(f => !f.contact) ? (rank === 0 ? 0 : .12 + (rank - 1) * .2) : .02 + rank * .2;
    const u = clamp((t - start) / .32);
    if (u === 0) return { ...foot };
    if (u === 1) return { ...goal };
    const e = ease(u), initialLift = GROUND - foot.y;
    return { ...foot, x: mix(foot.x, goal.x, e), y: GROUND - initialLift * (1 - e) - 8 * pulse(u), contact: false };
  });
  return pose;
}

export function actionPose(species, clip, progress) {
  const t = clamp(progress), neutral = walkPose(species, 0);
  if (t === 0 || t === 1) return neutral;
  const pose = { ...neutral, feet: neutral.feet.map(f => ({ ...f })) }, a = pulse(t);
  if (clip === 'idle') {
    pose.bodyY -= .7 * a;
    pose.headY -= .35 * a;
    pose.tail = 1.5 * Math.sin(2 * Math.PI * t) * a;
    pose.eye = 1 - pulse(clamp((t - .44) / .12));
  } else if (clip === 'pet') {
    pose.headY -= 3 * a; pose.headTilt = -.09 * a; pose.eye = 1 - .95 * a;
    pose.tail = 13 * Math.sin(6 * Math.PI * t) * a; pose.ear = -3 * a;
    pose.mouth = .6 * a;
  } else if (clip === 'feed') {
    pose.headY += 49 * a; pose.headX -= 4 * a; pose.headTilt = .21 * a;
    pose.ear = 4 * a; pose.mouth = Math.sin(12 * Math.PI * t) * a;
  } else if (clip === 'groom') {
    pose.headY += 17 * a; pose.headX -= 11 * a; pose.headTilt = .14 * a; pose.eye = 1 - .65 * a;
    pose.feet[3].x += 1 * a; pose.feet[3].y -= 59 * a;
    pose.feet[3].contact = false; pose.mouth = .7 * a;
  } else if (clip === 'stretch') {
    pose.bodyTilt = .14 * a; pose.bodyY += 8 * a; pose.headY += 24 * a; pose.headX += 4 * a;
    pose.tail = -7 * a;
    for (const i of [1, 3]) {
      pose.feet[i].x += 17 * a;
      pose.feet[i].y -= 4 * Math.sin(2 * Math.PI * t) ** 2;
      pose.feet[i].contact = t === .5;
    }
  } else if (clip === 'hop') {
    const lift = 36 * pulse(clamp((t - .15) / .7));
    const crouch = 5 * pulse(clamp(t / .3)) + 4 * pulse(clamp((t - .7) / .3));
    pose.bodyY += crouch - lift; pose.headY += crouch - lift; pose.ear = -4 * lift / 36;
    pose.feet = pose.feet.map(f => ({ ...f, y: GROUND - lift, contact: lift === 0 }));
  } else throw new Error(`Unknown line-pet action ${clip}`);
  return pose;
}

export function restPose(species, progress, breath = 0) {
  const t = ease(progress), pose = walkPose(species, 0);
  pose.bodyY += 34 * t - .55 * breath * t; pose.bodySquash = .28 * t;
  pose.headY += (species === 'cat' ? 65 : 63) * t - .25 * breath * t;
  pose.headX -= 5 * t; pose.headTilt = .04 * t; pose.eye = 1 - t;
  pose.ear = 2 * t; pose.tail = -8 * t;
  return pose;
}

export function turnPose(species, progress) {
  const pose = walkPose(species, 0), t = ease(progress);
  pose.orientation = Math.cos(Math.PI * t);
  pose.headY -= 1.5 * Math.sin(Math.PI * t) ** 2;
  return pose;
}
