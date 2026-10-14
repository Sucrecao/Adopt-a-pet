import { LEGS, projectLegX, ease } from './poses.mjs';

const n = v => Number(v.toFixed(4));
const INK = '#624938';
const FUR = '#fffaf0';
const FAR = '#e9ddcc';

// Every call emits one entire animal. Transformations below are SVG source
// authoring only: the exported renderer receives a single immutable PNG crop.
export function drawScene(pose, resolution = 512) {
  const { species, orientation: o = 1 } = pose, cat = species === 'cat';
  const front = 1 - Math.abs(o), sx = x => n(128 + (x - 128) * o);
  const p = (x, y) => `${sx(x)} ${n(y)}`;
  const path = (d, fill = FUR, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
  const ellipse = (x, y, rx, ry, fill = FUR, extra = '') => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" ${extra}/>`;
  let parts = [];
  const tailBase = pose.bodyY - 1, tail = pose.tail + pose.bodyY - 161;
  if (cat) {
    const tailPath = `M ${p(74, tailBase)} C ${p(42, tailBase - 2)} ${p(28, 126 + tail)} ${p(36, 111 + tail)} C ${p(41, 101 + tail)} ${p(58, 104 + tail)} ${p(53, 116 + tail)}`;
    parts.push(path(tailPath, 'none', 'stroke-width="15"'));
    parts.push(path(tailPath, 'none', `stroke="${FUR}" stroke-width="10.4"`));
  } else {
    parts.push(path(`M ${p(78, tailBase + 1)} C ${p(57, tailBase + 1)} ${p(39, 148 + tail)} ${p(40, 130 + tail)} Q ${p(43, 119 + tail)} ${p(50, 129 + tail)} C ${p(51, 143 + tail)} ${p(63, tailBase - 10)} ${p(80, tailBase - 12)} Z`));
  }

  const legShape = index => {
    const leg = LEGS[index], foot = pose.feet[index];
    const hipX = leg.hipX, hipY = pose.bodyY + 19 + (leg.rear ? -4 : 4) * pose.bodyTilt;
    const kneeX = hipX * .48 + foot.x * .52 + (leg.rear ? -9 : 2), kneeY = (hipY + foot.y - 12) / 2;
    const ax = foot.x - 3;
    const frontal = ease((.55 - Math.abs(o)) / .55), direction = o < 0 ? -1 : 1;
    // Blend the COMPLETE scene's limb contour toward a symmetric cylinder
    // and rounded sole. Width is anatomical, not longitudinal foreshortening.
    // At orientation0 this gives two separated forefeet and leg volumes;
    // symmetric contours also prevent a winding/shape jump across the front.
    const lp = (x, y, anchor, width, frontY = y) => {
      const sideX = projectLegX(pose, index, x), fullX = projectLegX(pose, index, anchor) + direction * width;
      return `${n(sideX + (fullX - sideX) * frontal)} ${n(y + (frontY - y) * frontal)}`;
    };
    return path(`M ${lp(hipX - 8, hipY - 7, hipX, -6)} Q ${lp(hipX - 12, hipY + 10, hipX, -6)} ${lp(kneeX - 5, kneeY, kneeX, -6)} Q ${lp(ax - 7, foot.y - 20, foot.x, -6)} ${lp(ax - 6, foot.y - 9, foot.x, -6)} Q ${lp(foot.x - 11, foot.y - 7, foot.x, -8, foot.y - 9)} ${lp(foot.x - 9, foot.y - 3.2, foot.x, -8, foot.y - 5)} Q ${lp(foot.x - 8, foot.y - 1.2, foot.x, -8)} ${lp(foot.x - 3, foot.y - 1.2, foot.x, -5)} L ${lp(foot.x + 7, foot.y - 1.2, foot.x, 5)} Q ${lp(foot.x + 11, foot.y - 2, foot.x, 8, foot.y - 1.2)} ${lp(foot.x + 8, foot.y - 6, foot.x, 8, foot.y - 5)} Q ${lp(foot.x + 5, foot.y - 9, foot.x, 8)} ${lp(ax + 5, foot.y - 10, foot.x, 6, foot.y - 9)} Q ${lp(kneeX + 6, kneeY, kneeX, 6)} ${lp(hipX + 8, hipY - 2, hipX, 6, hipY - 7)} Z`, leg.far ? FAR : FUR);
  };
  parts.push(legShape(0), legShape(1), legShape(2), legShape(3));
  const bodyX = sx(125), bodyRx = (cat ? 56 : 59) * (.48 + .52 * Math.abs(o));
  const bodyRy = (cat ? 31 : 33) * (1 - pose.bodySquash);
  parts.push(ellipse(bodyX, pose.bodyY, bodyRx, bodyRy, FUR,
    `transform="rotate(${n(pose.bodyTilt * 180 / Math.PI * o)} ${bodyX} ${n(pose.bodyY)})"`));
  if (pose.feet[3].y < 195) parts.push(legShape(3));

  const hx = sx(pose.headX), hy = pose.headY, rx = cat ? 34 : 37, ry = cat ? 34 : 38;
  let head = [];
  if (cat) {
    for (const side of [-1, 1]) {
      head.push(path(`M ${n(hx + side * rx * .9)} ${n(hy - 10)} L ${n(hx + side * rx * .74)} ${n(hy - 53)} Q ${n(hx + side * rx * .72)} ${n(hy - 57)} ${n(hx + side * rx * .6)} ${n(hy - 53)} L ${n(hx + side * 5)} ${n(hy - 29)} Z`));
      head.push(path(`M ${n(hx + side * rx * .71)} ${n(hy - 23)} L ${n(hx + side * rx * .65)} ${n(hy - 45)} L ${n(hx + side * 11)} ${n(hy - 28)} Z`, '#e8b8aa', 'stroke="none"'));
    }
  }
  head.push(ellipse(hx, hy, rx * (.9 + .1 * Math.abs(o)), ry));
  if (!cat) {
    const ex = hx - 24 * o;
    head.push(path(`M ${n(ex + 5 * o)} ${n(hy - 24)} C ${n(ex - 11 * o)} ${n(hy - 31)} ${n(ex - 20 * o)} ${n(hy - 10)} ${n(ex - 17 * o)} ${n(hy + 15 + pose.ear)} C ${n(ex - 15 * o)} ${n(hy + 36 + pose.ear)} ${n(ex + 1 * o)} ${n(hy + 38 + pose.ear)} ${n(ex + 7 * o)} ${n(hy + 17)} Q ${n(ex + 12 * o)} ${n(hy - 5)} ${n(ex + 5 * o)} ${n(hy - 24)} Z`, '#bc9473'));
    head.push(ellipse(hx + 24 * o, hy + 15, 22 * (.65 + .35 * Math.abs(o)), 16, '#fff5e5'));
  }
  const eyeY = hy - (cat ? 4 : 6), eyeX = hx + 12 * o + 11 * front;
  const eye = (x, opacity = 1) => {
    if (pose.eye < .14) return path(`M ${n(x - 4)} ${n(eyeY + 1)} Q ${n(x)} ${n(eyeY - 3)} ${n(x + 4)} ${n(eyeY + 1)}`, 'none', `opacity="${n(opacity)}" stroke-width="2.2"`);
    return ellipse(x, eyeY, 3.1, Math.max(.7, 4.4 * pose.eye), INK, `stroke="none" opacity="${n(opacity)}"`) + ellipse(x + o, eyeY - 1.6, .8, .9, '#ffffff', `stroke="none" opacity="${n(opacity * pose.eye)}"`);
  };
  head.push(eye(eyeX));
  if (front > .001) head.push(eye(hx + 12 * o - 11 * front, front));
  const nx = hx + (cat ? 31 : 42) * o, ny = hy + (cat ? 9 : 10);
  if (cat) head.push(path(`M ${n(nx - 3.3)} ${n(ny)} Q ${n(nx)} ${n(ny - 2)} ${n(nx + 3.3)} ${n(ny)} L ${n(nx)} ${n(ny + 4)} Z`, '#b78275', 'stroke-width="1.4"'));
  else head.push(ellipse(nx, ny, 5 * (.7 + .3 * Math.abs(o)), 4.4, INK, 'stroke="none"'));
  head.push(path(`M ${n(nx - 3 * o)} ${n(ny + 6)} Q ${n(nx - 8 * o)} ${n(ny + 12 + pose.mouth * 2)} ${n(nx - 13 * o)} ${n(ny + 8)}`, 'none', 'stroke-width="1.5"'));
  if (cat) {
    for (const dy of [-2, 5]) head.push(path(`M ${n(hx + 20 * o)} ${n(hy + 13 + dy)} L ${n(hx + 43 * o)} ${n(hy + 11 + dy * 1.5)}`, 'none', 'stroke-width="1.25"'));
  } else head.push(ellipse(hx + 12 * o, hy + 15, 4.8, 2.8, '#efc4b0', 'stroke="none" opacity=".65"'));
  parts.push(`<g transform="rotate(${n(pose.headTilt * 180 / Math.PI * o)} ${hx} ${n(hy)})">${head.join('')}</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${resolution}" height="${resolution}" viewBox="0 0 256 256"><g stroke="${INK}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g></svg>`;
}
