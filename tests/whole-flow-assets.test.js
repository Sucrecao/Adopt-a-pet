import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const strides = { cat: 96, dog: 112, parrot: 80 };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(new URL(path, root)));
function asset(species) {
  const path = `public/pets/${species}-whole-v4.json`;
  assert.ok(existsSync(new URL(path, root)), `${species} production v4 metadata is missing`);
  return json(path);
}

function requiredPairs(meta) {
  const pairs = [];
  for (const [name, clip] of Object.entries(meta.clips)) {
    if (name === 'walk') continue;
    pairs.push(...clip.frames.slice(1).map((frame, i) => [clip.frames[i], frame]));
    if (clip.loop) pairs.push([clip.frames.at(-1), clip.frames[0]]);
  }
  for (const path of Object.values(meta.transitions.rest)) {
    pairs.push(...path.frames.slice(1).map((frame, i) => [path.frames[i], frame]));
  }
  pairs.push([93, 12], [90, 0], [90, 95]);
  return pairs.filter(([a, b]) => a !== b);
}

// Decode only the pristine 8-bit RGBA PNGs used by production, independently
// of the Python canonicalization and geometry validator.
function rgba(path) {
  const bytes = readFileSync(new URL(`public/${path}`, root));
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8); assert.equal(bytes[25], 6);
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (kind === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const packed = inflateSync(Buffer.concat(compressed)), stride = width * 4;
  const pixels = new Uint8Array(width * height * 4);
  const paeth = (a, b, c) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)]; assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, left = x >= 4 ? pixels[at - 4] : 0;
      const up = y ? pixels[at - stride] : 0, corner = y && x >= 4 ? pixels[at - stride - 4] : 0;
      const prediction = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter];
      pixels[at] = (packed[y * (stride + 1) + 1 + x] + prediction) & 255;
    }
  }
  return { width, height, pixels };
}

function foreground(meta, images, index) {
  const frame = meta.frames[index], page = meta.pages[frame.page], image = images[frame.page];
  const [x, y, width, height] = frame.rect;
  const scale = 256 / Math.max(page.sourceSize[0] / page.columns, page.sourceSize[1] / page.rows) * (page.scale ?? 1);
  const dx = (256 - width * scale) / 2 + (frame.offsetX ?? 0);
  const dy = (256 - height * scale) / 2 + (frame.offsetY ?? 0);
  const mask = new Uint8Array(32 * 32);
  for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
    const sx = ((frame.mirror ?? 1) < 0 ? 256 - px - .5 : px + .5) - dx;
    const sy = py + .5 - dy;
    if (sx < 0 || sy < 0 || sx >= width * scale || sy >= height * scale) continue;
    const sourceX = x + Math.floor(sx / scale), sourceY = y + Math.floor(sy / scale);
    if (image.pixels[(sourceY * image.width + sourceX) * 4 + 3] > 20) mask[(py >> 3) * 32 + (px >> 3)] = 1;
  }
  return mask;
}

function sampledField(bytes, pair, channel) {
  const vertices = [];
  const start = pair * 32 * 32 * 4;
  for (let y = 0; y <= 32; y++) for (let x = 0; x <= 32; x++) {
    const sx = Math.max(0, Math.min(31, x - .5)), sy = Math.max(0, Math.min(31, y - .5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(31, x0 + 1), y1 = Math.min(31, y0 + 1);
    const fx = sx - x0, fy = sy - y0;
    const at = (px, py, c) => bytes[start + (py * 32 + px) * 4 + c] - 128;
    const sample = c => (at(x0, y0, c) * (1 - fx) + at(x1, y0, c) * fx) * (1 - fy)
      + (at(x0, y1, c) * (1 - fx) + at(x1, y1, c) * fx) * fy;
    vertices.push([x * 8, y * 8, sample(channel), sample(channel + 1)]);
  }
  return vertices;
}

// Independently marked on the pristine registered256px endpoint images.
// Fur SIFT matches alone do not establish face correspondence.
const semanticFaces = [
  { species: 'dog', pair: [56,57], anchors: [
    [[176.2,75],[187.62,131.05]], [[204.24,70],[215.43,127.86]],
  ], regions: [
    // The black nose's shaded mass changes with head pitch: its centroid is
    // not a homologous surface point. Check correspondence to independently
    // marked black-nose bounds instead of requiring equal dark-mass centers.
    { points: [[207.98,87.23],[209.92,154.94]], bounds: [[201,82,214,93],[203,150,218,160]] },
  ] },
  { species: 'parrot', pair: [59,60], anchors: [
    [[186.55,184.97],[183.47,194.88]], [[209,200],[209,215]],
  ] },
];

function displacementAt(vertices, [x,y]) {
  const ix = Math.max(0,Math.min(31,Math.floor(x/8))), iy = Math.max(0,Math.min(31,Math.floor(y/8)));
  const fx = x/8-ix, fy = y/8-iy, a = iy*33+ix;
  const weighted = fx+fy<=1 ? [[a,1-fx-fy],[a+1,fx],[a+33,fy]]
    : [[a+1,1-fy],[a+33,1-fx],[a+34,fx+fy-1]];
  return [0,1].map(component => weighted.reduce((sum,[index,weight])=>sum+vertices[index][component+2]*weight,0));
}

for (const {species,pair,anchors,regions=[]} of semanticFaces) test(`${species} ${pair} independently marked face landmarks share intermediate geometry`, () => {
  const meta=asset(species), bytes=readFileSync(new URL(`public/${meta.flow.asset}`,root));
  const index=meta.flow.pairs.findIndex(value=>value[0]===pair[0]&&value[1]===pair[1]);
  assert.ok(index>=0);
  for (let direction=0;direction<2;direction++) {
    const vertices=sampledField(bytes,index,direction*2);
    for (const endpoints of anchors) {
      const source=endpoints[direction],target=endpoints[1-direction],delta=displacementAt(vertices,source);
      const error=Math.hypot(source[0]+delta[0]-target[0],source[1]+delta[1]-target[1]);
      assert.ok(error<=6, `${species} ${pair} direction${direction} face anchor${source} misses${target} by${error.toFixed(2)}px`);
    }
    for (const {points,bounds} of regions) {
      const source=points[direction],delta=displacementAt(vertices,source),[left,top,right,bottom]=bounds[1-direction];
      const x=source[0]+delta[0],y=source[1]+delta[1];
      const error=Math.hypot(Math.max(left-x,0,x-right),Math.max(top-y,0,y-bottom));
      assert.ok(error<=6,`${species} ${pair} direction${direction} nose leaves its independently marked region by${error.toFixed(2)}px`);
    }
  }
});

for (const [species, stride] of Object.entries(strides)) {
  test(`${species} v4 keeps every original registered whole pose and action duration`, () => {
    const meta = asset(species), old = json(`public/pets/${species}-whole-v3.json`);
    assert.equal(meta.version, 4); assert.equal(meta.stride, stride);
    assert.deepEqual(meta.pages, old.pages); assert.deepEqual(meta.frames, old.frames);
    assert.deepEqual(meta.clips, old.clips); assert.deepEqual(meta.transitions, old.transitions);
    assert.equal(meta.frames.length, 128); assert.equal(meta.pages.length, 3);
  });

  test(`${species} measured fields cover every nonwalk edge and rest seam without changing PNGs`, () => {
    const meta = asset(species), flow = meta.flow;
    assert.equal(flow.version, 1); assert.equal(flow.size, 32); assert.equal(flow.frameSize, 256);
    assert.equal(flow.encoding, 'signed-one-pixel-rgba');
    const exclusions = json('docs/whole-flow-rejected-pairs.json')[species];
    const key = pair => [...pair].sort((a,b)=>a-b).join(':');
    const rejected = new Set(exclusions.map(entry=>key(entry.pair)));
    assert.equal(rejected.size,exclusions.length);
    assert.ok(exclusions.every(entry=>typeof entry.reason==='string'&&entry.reason.length>20));
    assert.deepEqual(flow.sourcePairs,exclusions.map(entry=>entry.pair));
    const keys = new Set(flow.pairs.map(key));
    assert.equal(keys.size, flow.pairs.length);
    const eligible = [];
    const seen = new Set(rejected);
    for (const pair of requiredPairs(meta)) if (!seen.has(key(pair))) {seen.add(key(pair));eligible.push(pair);}
    assert.deepEqual(flow.pairs,eligible,'production graph must exactly match the reviewed eligible graph');
    for (const entry of exclusions) assert.ok(!keys.has(key(entry.pair)),`rejected ${entry.pair} must retain complete source rendering`);
    assert.ok(flow.pairs.every(([a, b]) => a < 96 && b < 96 && a !== b));
    assert.ok(!keys.has('94:95'));
    const bytes = readFileSync(new URL(`public/${flow.asset}`, root));
    assert.equal(bytes.length, flow.pairs.length * 32 * 32 * 4);
    const report = json('docs/whole-flow-qa.json');
    assert.equal(sha(bytes), report.species[species].binarySha256);
    assert.equal(report.species[species].pairCount, flow.pairs.length);
    assert.equal(report.reviewedExclusionsSha256,sha(readFileSync(new URL('docs/whole-flow-rejected-pairs.json',root))));
    for (const [path, hash] of Object.entries(report.sourcePngSha256)) assert.equal(sha(readFileSync(new URL(path, root))), hash, `${path} source changed`);
  });

  test(`${species} each nonwalk clip retains enough approved interpolation intervals for twice the pose detail`,()=>{
    const meta=asset(species), keys=new Set(meta.flow.pairs.map(pair=>[...pair].sort((a,b)=>a-b).join(':')));
    const coverage=json('docs/whole-flow-qa.json').species[species].clipCoverage;
    for(const [name,clip] of Object.entries(meta.clips)) {
      if(name==='walk')continue;
      const edges=clip.frames.slice(1).map((frame,i)=>[clip.frames[i],frame]);
      if(clip.loop)edges.push([clip.frames.at(-1),clip.frames[0]]);
      const count=edges.filter(pair=>keys.has([...pair].sort((a,b)=>a-b).join(':'))).length;
      assert.equal(coverage[name].interpolatedEdges,count);
      assert.equal(coverage[name].quarterSampleOpportunities,clip.frames.length+count*3);
      assert.equal(coverage[name].eighthSampleOpportunities,clip.frames.length+count*7);
      assert.ok(coverage[name].eighthSampleOpportunities>=clip.frames.length*2,`${species} ${name} lacks2x interval opportunities; actual GPU pixel distinctness is checked separately`);
    }
  });

  test(`${species} quantized production fields keep foreground triangle winding throughout interpolation`, () => {
    const meta = asset(species), bytes = readFileSync(new URL(`public/${meta.flow.asset}`, root));
    const images = meta.pages.map(page => rgba(page.asset)), masks = new Map();
    const maskFor = index => {
      if (!masks.has(index)) masks.set(index, foreground(meta, images, index));
      return masks.get(index);
    };
    for (const [pairIndex, pair] of meta.flow.pairs.entries()) for (let direction = 0; direction < 2; direction++) {
      const vertices = sampledField(bytes, pairIndex, direction * 2), mask = maskFor(pair[direction]);
      for (const amount of [.05, .1, .25, .5, .75, .9, .95, 1]) {
        const point = index => [vertices[index][0] + amount * vertices[index][2], vertices[index][1] + amount * vertices[index][3]];
        const area = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 64;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
          if (!mask[y * 32 + x]) continue;
          const at = y * 33 + x, a = point(at), b = point(at + 33), c = point(at + 1), d = point(at + 34);
          assert.ok(-area(a, b, c) > .05 && -area(c, b, d) > .05, `${species} ${pair} direction${direction} t${amount} folds at${x},${y}`);
        }
      }
    }
  });
}
