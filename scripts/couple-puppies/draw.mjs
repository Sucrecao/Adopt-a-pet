import { projectLegX } from './poses.mjs';

const n = x => Number(x.toFixed(4));
const INK = '#161413';
const WHITE = '#ffffff';
const TAN = '#e7ce9f';

// The SVG is an offline drawing of a WHOLE pose. Only its finished transparent
// PNG is shipped to the runtime; there are no layers, joints or part transforms.
export function drawScene(pose, resolution = 512) {
  const white = pose.species === 'maltese', fill = white ? WHITE : TAN;
  const o = pose.orientation, front = Math.sqrt(Math.max(0, 1 - o * o));
  const sx = x => 128 + (x - 128) * o;
  const path = (d, color = fill, extra = '') => `<path d="${d}" fill="${color}" ${extra}/>`;
  const ellipse = (x, y, rx, ry, color = fill, extra = '') => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${color}" ${extra}/>`;
  const p = (x, y) => `${n(sx(x))} ${n(y)}`;
  const parts = [], by = pose.bodyY;
  const bodyWidth = 32 + front * 3, bodyTop = by - 39, bodyBottom = by + 40 * (1 - pose.bodySquash);
  // A tiny curved tail, almost hidden behind the reference's upright body.
  parts.push(path(`M ${p(101, by + 20)} Q ${p(77, by + 18 + pose.tail)} ${p(83, by + 6 + pose.tail)} Q ${p(88, by + 2 + pose.tail)} ${p(89, by + 12 + pose.tail)} Q ${p(95, by + 15)} ${p(104, by + 10)} Z`));

  const footShape = index => {
    const foot = pose.feet[index], fx = projectLegX(pose, index, foot.x);
    const hip = projectLegX(pose, index, index === 0 ? 113 : 143), hy = bodyBottom - 9;
    const y = foot.y;
    return path(`M ${n(hip - 10)} ${n(hy - 5)} Q ${n(fx - 12)} ${n(y - 22)} ${n(fx - 12)} ${n(y - 13)} C ${n(fx - 12)} ${n(y - 4)} ${n(fx - 7)} ${n(y - 2.4)} ${n(fx)} ${n(y - 2.4)} C ${n(fx + 7)} ${n(y - 2.4)} ${n(fx + 12)} ${n(y - 4)} ${n(fx + 12)} ${n(y - 13)} Q ${n(fx + 12)} ${n(y - 22)} ${n(hip + 10)} ${n(hy - 5)} Z`);
  };
  parts.push(footShape(0), footShape(1));
  const bx = sx(126);
  if (white) {
    parts.push(path(`M ${n(bx - 24)} ${n(bodyTop)} Q ${n(bx - 35)} ${n(bodyTop + 4)} ${n(bx - 32)} ${n(by - 13)} Q ${n(bx - 38)} ${n(by)} ${n(bx - 32)} ${n(by + 8)} Q ${n(bx - 35)} ${n(by + 20)} ${n(bx - 27)} ${n(by + 25)} Q ${n(bx - 28)} ${n(bodyBottom - 2)} ${n(bx - 15)} ${n(bodyBottom)} Q ${n(bx - 8)} ${n(bodyBottom + 5)} ${n(bx)} ${n(bodyBottom + 1)} Q ${n(bx + 8)} ${n(bodyBottom + 5)} ${n(bx + 15)} ${n(bodyBottom)} Q ${n(bx + 28)} ${n(bodyBottom - 2)} ${n(bx + 27)} ${n(by + 25)} Q ${n(bx + 35)} ${n(by + 20)} ${n(bx + 32)} ${n(by + 8)} Q ${n(bx + 38)} ${n(by)} ${n(bx + 32)} ${n(by - 13)} Q ${n(bx + 35)} ${n(bodyTop + 4)} ${n(bx + 24)} ${n(bodyTop)} Z`));
  } else {
    parts.push(path(`M ${n(bx - 22)} ${n(bodyTop)} Q ${n(bx - bodyWidth - 3)} ${n(by - 31)} ${n(bx - bodyWidth)} ${n(by + 8)} Q ${n(bx - bodyWidth)} ${n(bodyBottom)} ${n(bx - 11)} ${n(bodyBottom + 1)} Q ${n(bx)} ${n(bodyBottom + 7)} ${n(bx + 11)} ${n(bodyBottom + 1)} Q ${n(bx + bodyWidth)} ${n(bodyBottom)} ${n(bx + bodyWidth)} ${n(by + 8)} Q ${n(bx + bodyWidth + 3)} ${n(by - 31)} ${n(bx + 22)} ${n(bodyTop)} Z`));
  }

  const armShape = side => {
    const movement = side === -1 ? pose.armLeft : pose.armRight;
    const shoulder = bx + side * 27, sy = by - 18;
    const handX = bx + side * (37 + Math.max(0, pose.armLift - 33) * .55) + movement;
    const handY = by + 6 - pose.armLift;
    const length = Math.hypot(handX - shoulder, handY - sy) || 1;
    const ux = (handX - shoulder) / length, uy = (handY - sy) / length, vx = -uy, vy = ux;
    const point = (x, y, along, across) => `${n(x + ux * along + vx * across)} ${n(y + uy * along + vy * across)}`;
    // A round palm with constant volume, connected by a soft curved arm.
    // No pointed wedge and no conditional foreground pop at an action phase.
    return path(`M ${point(shoulder, sy, 0, 6)} Q ${point(shoulder, sy, length * .55, 10)} ${point(handX, handY, 0, 10)} C ${point(handX, handY, 12, 10)} ${point(handX, handY, 12, -10)} ${point(handX, handY, 0, -10)} Q ${point(shoulder, sy, length * .55, -10)} ${point(shoulder, sy, 0, -6)}`);
  };

  const hx = sx(pose.headX), hy = pose.headY;
  const hp = (x, y) => `${n(hx + x)} ${n(hy + y)}`;
  const head = [];
  if (white) {
    // White dog's standing ears and cloud-like fur are part of the perimeter.
    const contour = `M ${hp(-39, -25)} Q ${hp(-49, -18)} ${hp(-46, -7)} Q ${hp(-53, 2)} ${hp(-47, 12)} Q ${hp(-48, 24)} ${hp(-36, 29)} Q ${hp(-22, 40)} ${hp(-9, 37)} Q ${hp(0, 42)} ${hp(9, 37)} Q ${hp(22, 40)} ${hp(36, 29)} Q ${hp(48, 24)} ${hp(47, 12)} Q ${hp(53, 2)} ${hp(46, -7)} Q ${hp(49, -18)} ${hp(39, -25)} Q ${hp(35, -34)} ${hp(39, -39)} Q ${hp(43, -52 + pose.ear)} ${hp(26, -49 + pose.ear)} Q ${hp(14, -49)} ${hp(12, -35)} Q ${hp(0, -39)} ${hp(-12, -35)} Q ${hp(-14, -49)} ${hp(-26, -49 + pose.ear)} Q ${hp(-43, -52 + pose.ear)} ${hp(-39, -39)} Q ${hp(-35, -34)} ${hp(-39, -25)} Z`;
    head.push(path(contour, fill, 'stroke="none"'));
    // A few deliberate contour breaks match the pen-drawn character, while
    // the white fill remains one clean, complete silhouette on transparency.
    for (const side of [-1, 1]) head.push(path(`M ${hp(side * 39, -25)} Q ${hp(side * 49, -18)} ${hp(side * 46, -7)} M ${hp(side * 48, -1)} Q ${hp(side * 53, 9)} ${hp(side * 43, 19)} Q ${hp(side * 43, 26)} ${hp(side * 36, 29)} M ${hp(side * 38, -29)} Q ${hp(side * 35, -35)} ${hp(side * 39, -39)} Q ${hp(side * 43, -52 + pose.ear)} ${hp(side * 26, -49 + pose.ear)} Q ${hp(side * 14, -49)} ${hp(side * 12, -35)}`, 'none'));
    head.push(path(`M ${hp(-8, -36)} Q ${hp(0, -39)} ${hp(8, -36)}`, 'none'));
  } else {
    // Long rounded ears, one behind the cheek in this three-quarter view.
    for (const side of [-1, 1]) {
      const near = (1 - side * o) / 2, outer = 47 + 20 * near;
      head.push(path(`M ${hp(side * 31, -25)} Q ${hp(side * (outer - 4), -31)} ${hp(side * outer, -12 + pose.ear)} Q ${hp(side * (outer + 6), 4 + pose.ear)} ${hp(side * (outer - 8), 16 + pose.ear)} Q ${hp(side * (outer - 20), 22 + pose.ear)} ${hp(side * 32, 5)} Z`));
    }
    head.push(path(`M ${hp(-41, -23)} Q ${hp(-28, -40)} ${hp(0, -37)} Q ${hp(28, -40)} ${hp(41, -23)} Q ${hp(54, -10)} ${hp(49, 8)} Q ${hp(49, 28)} ${hp(25, 34)} Q ${hp(0, 40)} ${hp(-25, 34)} Q ${hp(-49, 28)} ${hp(-49, 8)} Q ${hp(-54, -10)} ${hp(-41, -23)} Z`));
    // The red collar is a quiet identifying curve, with no decorative buckle.
    head.push(path(`M ${hp(-28, 33)} Q ${hp(0, 44)} ${hp(28, 33)}`, 'none', 'stroke="#ff7777" stroke-width="5.3"'));
  }
  const facialShift = 5 * o, eyeY = hy + 1;
  for (const side of [-1, 1]) {
    const x = hx + facialShift + side * 14;
    if (pose.eye < .16) head.push(path(`M ${n(x - 3)} ${n(eyeY + 1)} Q ${n(x)} ${n(eyeY - 2)} ${n(x + 3)} ${n(eyeY + 1)}`, 'none', 'stroke-width="3.3"'));
    else head.push(ellipse(x, eyeY, 2.75, Math.max(.65, 2.85 * pose.eye), INK, 'stroke="none"'));
  }
  const nx = hx + facialShift, ny = hy + 9;
  head.push(path(`M ${n(nx - 5)} ${n(ny - 3)} Q ${n(nx)} ${n(ny - 6)} ${n(nx + 5)} ${n(ny - 3)} Q ${n(nx + 5)} ${n(ny + 1)} ${n(nx)} ${n(ny + 4)} Q ${n(nx - 5)} ${n(ny + 1)} ${n(nx - 5)} ${n(ny - 3)} Z`, INK, 'stroke-width="3.3"'));
  if (pose.mouth > 0) {
    const m = pose.mouth;
    head.push(path(`M ${n(nx - 10 * m)} ${n(ny + 13)} Q ${n(nx - 6 * m)} ${n(ny + 13 + 14 * m)} ${n(nx)} ${n(ny + 13 + 14 * m)} Q ${n(nx + 6 * m)} ${n(ny + 13 + 14 * m)} ${n(nx + 10 * m)} ${n(ny + 13)} Z`, '#a33251', `stroke-width="${n(3.7 * m)}"`));
  }
  head.push(path(`M ${n(nx)} ${n(ny + 3)} L ${n(nx)} ${n(ny + 10)} M ${n(nx - 13)} ${n(ny + 10)} Q ${n(nx - 13)} ${n(ny + 19)} ${n(nx)} ${n(ny + 10)} Q ${n(nx + 13)} ${n(ny + 19)} ${n(nx + 13)} ${n(ny + 10)}`, 'none', 'stroke-width="4.2"'));
  parts.push(`<g transform="rotate(${n(pose.headTilt * 180 / Math.PI * o)} ${n(hx)} ${n(hy)})">${head.join('')}</g>`);
  // The rounded paws remain continuously in front of the torso and cheek.
  parts.push(armShape(-1), armShape(1));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${resolution}" height="${resolution}" viewBox="0 0 256 256"><g stroke="${INK}" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g></svg>`;
}
