import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const key = pair => [...pair].sort((a,b)=>a-b).join(':');
const ports = [48,55,56,63,64,71,72,79,80,89,95];
const reviewFor = (report,species) => report.visualReview ? JSON.parse(report.visualReview.rawJson).species[species] : [];
function asset(species) {
  const path=`public/pets/${species}-whole-v5.json`;
  assert.ok(existsSync(new URL(path,root)),`${species} v5 contact handoff asset is missing`);
  return json(path);
}

// Independent pristine-PNG foreground and actual32-grid vertex reconstruction.
// Shared algorithm with the v4 asset regression, not the Python generator.
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


for (const species of ['cat','dog','parrot']) {
  test(`${species} independent GPU rejection removes unsafe new geometry`,()=>{
    const meta=asset(species),report=json('docs/contact-handoff-qa.json'),qa=report.species[species];
    assert.ok(report.visualReview,'new fields must bind an independent actual-GPU review');
    assert.equal(sha(Buffer.from(report.visualReview.rawJson)),report.visualReview.sha256);
    const review=JSON.parse(report.visualReview.rawJson),entries=reviewFor(report,species);
    assert.equal(review.binarySha256[species],qa.candidateBinarySha256);
    assert.deepEqual(entries.map(entry=>entry.pair),qa.newPairs.map(entry=>entry.pair));
    const keys=new Set(meta.flow.pairs.map(key)),guards=new Set(meta.flow.sourcePairs.map(key));
    assert.ok(entries.every(entry=>['accepted','rejected'].includes(entry.status)&&entry.reason.length>20&&entry.evidence.length===3&&entry.reversePixelExact));
    for(const [index,entry] of entries.entries()) {
      assert.equal(qa.newPairs[index].visualStatus,entry.status);
      if(entry.status==='accepted')assert.ok(keys.has(key(entry.pair))&&!guards.has(key(entry.pair)));
      else assert.ok(!keys.has(key(entry.pair))&&guards.has(key(entry.pair)),`rejected ${species} ${entry.pair} remains geometry`);
    }
    assert.equal(entries.filter(entry=>entry.status==='accepted').length,species==='dog'?21:20);
    assert.ok(ports.every(frame=>keys.has(key([0,frame]))),'all care-neutral ports must be visually accepted geometry');
  });

  test(`${species} v5 uses independently recorded ground constraints without guessing bird support`,()=>{
    const meta=asset(species),config=json('docs/ground-gait-config.json');
    assert.equal(json('docs/contact-handoff-qa.json').groundGaitConfigSha256,sha(readFileSync(new URL('docs/ground-gait-config.json',root))));
    if(species==='parrot') {assert.equal(meta.groundGait,undefined);assert.equal(meta.stride,80);}
    else {assert.deepEqual(meta.groundGait,config[species]);assert.equal(meta.stride,config[species].stride);}
  });

  test(`${species} v5 preserves source registration and approved v4 geometry`,()=>{
    const meta=asset(species),old=json(`public/pets/${species}-whole-v4.json`);
    const report=json('docs/contact-handoff-qa.json'),qa=report.species[species];
    assert.equal(meta.version,5);
    assert.deepEqual(meta.pages,old.pages);
    assert.deepEqual(meta.frames.slice(0,128),old.frames);
    assert.deepEqual(meta.clips,old.clips);
    assert.equal(meta.handoffs.version,1);assert.equal(meta.handoffs.neutralFrame,0);
    assert.equal(meta.handoffs.edgeDuration,180);assert.equal(meta.handoffs.settleDuration,420);
    if(species==='parrot')assert.equal(meta.frames.length,128);
    else {
      assert.equal(meta.frames.length,129);
      assert.equal(meta.handoffs.mirroredNeutralFrame,128);
      assert.deepEqual(meta.frames[128],{...old.frames[0],mirror:-(old.frames[0].mirror??1)});
    }
    if(species==='dog') {
      assert.deepEqual(meta.transitions.rest.enter,{frames:[90,91,92],durations:[100,100,100]});
      assert.deepEqual(meta.transitions.rest.exit,{frames:[92,91,90],durations:[100,100,100]});
    } else assert.deepEqual(meta.transitions,old.transitions);
    const oldBytes=readFileSync(new URL(`public/${old.flow.asset}`,root));
    const bytes=readFileSync(new URL(`public/${meta.flow.asset}`,root));
    assert.equal(sha(oldBytes),json('docs/whole-flow-qa.json').species[species].binarySha256);
    for(const [i,pair] of old.flow.pairs.entries()) {
      const j=meta.flow.pairs.findIndex(value=>key(value)===key(pair));assert.ok(j>=0);
      assert.deepEqual(meta.flow.pairs[j],pair);
      assert.deepEqual(bytes.subarray(j*4096,(j+1)*4096),oldBytes.subarray(i*4096,(i+1)*4096),`${species} copied v4 ${pair} tile changed`);
    }
    assert.equal(qa.copiedPairCount,old.flow.pairs.length);
    assert.deepEqual(meta.flow.sourcePairs,[...old.flow.sourcePairs,...reviewFor(report,species).filter(entry=>entry.status==='rejected').map(entry=>entry.pair)]);
    for(const [path,hash] of Object.entries(json('docs/whole-flow-qa.json').sourcePngSha256)) {
      assert.equal(report.sourcePngSha256[path],hash);
      assert.equal(sha(readFileSync(new URL(path,root))),hash,`${path} pristine source changed`);
    }
    for(const [path,hash] of Object.entries(report.sourceV4Sha256))assert.equal(sha(readFileSync(new URL(path,root))),hash,`${path} v4 archive input changed`);
  });

  test(`${species} v5 provides only declared action, idle, sleep and turn/flight ports`,()=>{
    const meta=asset(species),old=json(`public/pets/${species}-whole-v4.json`),report=json('docs/contact-handoff-qa.json'),qa=report.species[species];
    const required=[...ports.map(frame=>[0,frame]),...Array.from({length:11},(_,i)=>[0,i+1])];
    if(species==='dog')required.push([92,12]);
    if(species==='parrot')required.push([95,94],[94,96],[127,94]);
    else required.push([0,32],[47,128]);
    const rejected=new Set(reviewFor(report,species).filter(entry=>entry.status==='rejected').map(entry=>key(entry.pair)));
    const expected=new Set([...old.flow.pairs,...required].filter(pair=>!rejected.has(key(pair))).map(key));
    const actual=new Set(meta.flow.pairs.map(key));
    assert.equal(actual.size,meta.flow.pairs.length);
    assert.deepEqual([...actual].sort(),[...expected].sort());
    assert.ok(meta.flow.pairs.every(pair=>pair.length===2&&pair.every(i=>Number.isInteger(i)&&i>=0&&i<meta.frames.length)&&pair[0]!==pair[1]));
    for(const pair of old.flow.sourcePairs)assert.ok(!actual.has(key(pair)));
    const newPairs=meta.flow.pairs.filter(pair=>!old.flow.pairs.some(value=>key(value)===key(pair)));
    assert.deepEqual(qa.newPairs.filter(entry=>entry.visualStatus!=='rejected').map(entry=>entry.pair),newPairs);
    assert.ok(qa.newPairs.every(entry=>['pending','accepted','rejected'].includes(entry.visualStatus)));
    const bytes=readFileSync(new URL(`public/${meta.flow.asset}`,root));
    assert.equal(bytes.length,meta.flow.pairs.length*4096);assert.equal(sha(bytes),qa.binarySha256);
    assert.equal(meta.flow.version,1);assert.equal(meta.flow.size,32);assert.equal(meta.flow.frameSize,256);assert.equal(meta.flow.encoding,'signed-one-pixel-rgba');
  });

  test(`${species} new quantized handoff fields preserve foreground winding`,()=>{
    const meta=asset(species),old=json(`public/pets/${species}-whole-v4.json`);
    const previous=new Set(old.flow.pairs.map(key));
    const bytes=readFileSync(new URL(`public/${meta.flow.asset}`,root));
    const images=meta.pages.map(page=>rgba(page.asset)),masks=new Map();
    const maskFor=i=>{if(!masks.has(i))masks.set(i,foreground(meta,images,i));return masks.get(i);};
    for(const [index,pair] of meta.flow.pairs.entries()) {
      if(previous.has(key(pair)))continue;
      for(let direction=0;direction<2;direction++) {
        const vertices=sampledField(bytes,index,direction*2),mask=maskFor(pair[direction]);
        for(const amount of [.05,.125,.25,.5,.75,.875,.95,1]) {
          const point=i=>[vertices[i][0]+amount*vertices[i][2],vertices[i][1]+amount*vertices[i][3]];
          const area=(a,b,c)=>((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/64;
          for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
            if(!mask[y*32+x])continue;
            const at=y*33+x,a=point(at),b=point(at+33),c=point(at+1),d=point(at+34);
            assert.ok(-area(a,b,c)>.05&&-area(c,b,d)>.05,`${species} handoff${pair} direction${direction} t${amount} folds at${x},${y}`);
          }
        }
      }
    }
  });
}
