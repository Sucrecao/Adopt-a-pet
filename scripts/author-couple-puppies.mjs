#!/usr/bin/env node
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { walkPose, stopPose, actionPose, restPose, turnPose, projectLegX, STRIDE, GROUND, WALK_FRAMES, STOP_FRAMES } from './couple-puppies/poses.mjs';
import { drawScene } from './couple-puppies/draw.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); } catch { sharp = require('/Users/sucrecao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'); }
const artifacts = resolve(root, '.artifacts/couple-puppies');
const publicPets = resolve(root, 'public/pets');
const CELL = 128;
const renderRaster = (pose, size) => {
  // The completed turn independently rasterizes the entire neutral SVG, then
  // reflects that complete bitmap offline. This preserves exact endpoint
  // pixels despite SVG edge antialiasing's winding-dependent rounding.
  const mirroredEndpoint = pose.orientation === -1;
  let image = sharp(Buffer.from(drawScene(mirroredEndpoint ? { ...pose, orientation: 1 } : pose))).resize(size, size);
  if (mirroredEndpoint) image = image.flop();
  return image.png().toBuffer();
};
const raster = pose => renderRaster(pose, 256);
const hash = buffer => createHash('sha256').update(buffer).digest('hex');

async function sheet(images, columns = 8, cell = 256, background = { r: 255, g: 252, b: 247, alpha: 1 }) {
  return sharp({ create: { width: columns * cell, height: Math.ceil(images.length / columns) * cell, channels: 4, background } })
    .composite(images.map((input, i) => ({ input, left: i % columns * cell, top: Math.floor(i / columns) * cell }))).png().toBuffer();
}

export async function preview(species) {
  await mkdir(artifacts, { recursive: true });
  const neutral = walkPose(species, 0);
  await writeFile(resolve(artifacts, `${species}-line-neutral.svg`), drawScene(neutral));
  await writeFile(resolve(artifacts, `${species}-line-neutral.png`), await raster(neutral));
  const walk = Array.from({ length: 32 }, (_, i) => walkPose(species, i / 32));
  await writeFile(resolve(artifacts, `${species}-line-walk-proof.png`), await sheet(await Promise.all(walk.map(raster))));
  await writeFile(resolve(artifacts, `${species}-line-walk-landmarks.json`), JSON.stringify({ species, stride: STRIDE, groundY: GROUND, canonicalSize: 256, walkFrameCount: WALK_FRAMES,
    samples: walk.map((pose, i) => ({ phase: i / 32, nominalDisplacement: i / 32 * STRIDE, feet: pose.feet })) }, null, 2));
  const clips = ['idle', 'rest', 'walk', 'turn', 'pet', 'feed', 'groom', 'stretch', 'hop'];
  const actionImages = [];
  for (const clip of clips) for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const pose = clip === 'walk' ? walkPose(species, i / 8) : clip === 'rest' ? restPose(species, t) : clip === 'turn' ? turnPose(species, t) : actionPose(species, clip, t);
    actionImages.push(await raster(pose));
  }
  await writeFile(resolve(artifacts, `${species}-line-actions-proof.png`), await sheet(actionImages));
  console.log(`${species}: neutral,32walkposes,9actionrows preview complete`);
}

export async function turnProof(species) {
  const meta = JSON.parse(await readFile(resolve(publicPets, `${species}-line-v1.json`), 'utf8'));
  const pictures = [];
  for (const index of meta.clips.turn.frames) {
    const frame = meta.frames[index], r = frame.rect;
    pictures.push(await sharp(resolve(root, 'public', meta.pages[frame.page].asset))
      .extract({ left: r[0], top: r[1], width: r[2], height: r[3] }).resize(256, 256).png().toBuffer());
  }
  await writeFile(resolve(artifacts, `${species}-line-turn-80-proof.png`), await sheet(pictures, 10));
  await writeFile(resolve(artifacts, `${species}-line-turn-midpoint-proof.png`), await sheet(pictures.slice(36, 44), 8));
  console.log(`${species}: actual atlas80turnframes +slots36–43 midpoint proof complete`);
}

export function buildAuthored(species) {
  const poses = [], labels = [], neutral = walkPose(species, 0);
  const add = (pose, label) => { const index = poses.length; poses.push(pose); labels.push(label); return index; };
  add(neutral, 'neutral');
  const makeTrack = (name, count, duration, sample, loop = false, endpointsNeutral = false) => {
    const frames = Array.from({ length: count }, (_, i) => endpointsNeutral && (i === 0 || i === count - 1) ? 0 : add(sample(i / (count - 1)), `${name}:${i}`));
    return { frames, durations: Array(count).fill(duration / count), loop };
  };
  const clips = {};
  clips.idle = makeTrack('idle', 128, 4000, t => actionPose(species, 'idle', t), true, true);
  clips.walk = { frames: Array.from({ length: WALK_FRAMES }, (_, i) => i === 0 ? 0 : add(walkPose(species, i / WALK_FRAMES), `walk:${i}`)), durations: Array(WALK_FRAMES).fill(1000 / WALK_FRAMES), loop: true };
  clips.turn = makeTrack('turn', 80, 800, t => turnPose(species, t));
  clips.turn.frames[0] = 0;
  for (const [name, duration] of [['pet', 2400], ['feed', 2400], ['groom', 2600], ['stretch', 2600], ['hop', 1600]]) {
    clips[name] = makeTrack(name, 96, duration, t => actionPose(species, name, t), false, true);
  }
  const restEnter = makeTrack('rest.enter', 60, 600, t => restPose(species, t));
  restEnter.frames[0] = 0;
  const restEndpoint = restEnter.frames.at(-1);
  clips.rest = makeTrack('rest', 48, 2400, t => restPose(species, 1, Math.sin(Math.PI * t) ** 2), true);
  clips.rest.frames[0] = clips.rest.frames[clips.rest.frames.length - 1] = restEndpoint;
  const mainCount = poses.length;
  const authoredStops = Array.from({ length: WALK_FRAMES }, (_, slot) => ({
    frames: Array.from({ length: STOP_FRAMES }, (_, i) => i === 0 ? clips.walk.frames[slot] : i === STOP_FRAMES - 1 ? 0 : add(stopPose(species, slot / WALK_FRAMES, i / (STOP_FRAMES - 1)), `stop:${slot}:${i}`)),
    durations: Array(STOP_FRAMES).fill(400 / STOP_FRAMES),
  }));
  return { poses, labels, mainCount, clips, authoredStops,
    transitions: { rest: { enter: restEnter,
      exit: { frames: [...restEnter.frames].reverse(), durations: [...restEnter.durations].reverse(), loop: false } } } };
}

export async function exportSpecies(species, { turnOnly = false, neutralStopOnly = false } = {}) {
  await mkdir(artifacts, { recursive: true }); await mkdir(publicPets, { recursive: true });
  const authored = buildAuthored(species), pages = [], frames = [], frameHashes = [], pageHashes = [];
  const mainPages = Math.ceil(authored.mainCount / 64), pageCount = mainPages + WALK_FRAMES;
  const patchOnly = turnOnly || neutralStopOnly;
  const previousMeta = patchOnly ? JSON.parse(await readFile(resolve(publicPets, `${species}-line-v1.json`), 'utf8')) : null;
  const previousProvenance = patchOnly ? JSON.parse(await readFile(resolve(artifacts, `${species}-line-v1-provenance.json`), 'utf8')) : null;
  const turnPages = new Set(authored.clips.turn.frames.filter(frame => frame !== 0).map(frame => Math.floor(frame / 64)));
  const selectedPages = neutralStopOnly ? new Set([mainPages]) : turnPages;
  for (let page = 0; page < pageCount; page++) {
    const main = page < mainPages, slot = page - mainPages;
    const startIndex = main ? page * 64 : authored.mainCount + slot * (STOP_FRAMES - 2);
    const count = main ? Math.min(64, authored.mainCount - startIndex) : STOP_FRAMES - 2;
    if (patchOnly && !selectedPages.has(page)) {
      pages.push(previousMeta.pages[page]);
      frames.push(...previousMeta.frames.slice(startIndex, startIndex + count));
      frameHashes.push(...previousProvenance.frameHashes.slice(startIndex, startIndex + count));
      pageHashes.push(previousProvenance.pages[page]);
      continue;
    }
    const pagePoses = authored.poses.slice(startIndex, startIndex + count), buffers = [];
    for (let start = 0; start < pagePoses.length; start += 8) buffers.push(...await Promise.all(pagePoses.slice(start, start + 8).map(pose => renderRaster(pose, CELL))));
    const asset = `pets/${species}-line-v1-${main ? 'main' : 'stop'}-${String(main ? page : slot).padStart(3, '0')}.png`;
    const composites = buffers.map((input, i) => ({ input, left: i % 8 * CELL, top: Math.floor(i / 8) * CELL }));
    const rows = main ? 8 : 5;
    const png = await sharp({ create: { width: 8 * CELL, height: rows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(resolve(root, 'public', asset), png);
    if (page === 0) {
      const neutralPixels = await sharp(png).extract({ left: 0, top: 0, width: CELL, height: CELL }).png().toBuffer();
      await writeFile(resolve(publicPets, `${species}-line-v1-neutral.png`), neutralPixels);
    }
    pages.push({ asset, sourceSize: [8 * CELL, rows * CELL], columns: 8, rows, scale: 1, role: main ? 'main' : 'stop', ...(main ? {} : { walkSlot: slot }) });
    buffers.forEach(buffer => frameHashes.push(hash(buffer)));
    pageHashes.push({ asset, sha256: hash(png), bytes: png.length });
    pagePoses.forEach((_, i) => frames.push({ page, rect: [i % 8 * CELL, Math.floor(i / 8) * CELL, CELL, CELL], offsetX: 0, offsetY: 0 }));
    if (page % 10 === 0 || page === pageCount - 1) console.log(`${species}: authored page${page + 1}/${pageCount}`);
  }
  const walkContacts = authored.clips.walk.frames.map((frame, slot) => ({ phase: slot / WALK_FRAMES, feet: authored.poses[frame].feet.map(f => ({ id: f.name, x: f.x, y: f.y, planted: f.contact, supportGeneration: f.cycle })) }));
  const meta = { version: 7, authoring: 'line-pet-v1', renderMode: 'discrete-whole-frame', canonicalSize: 256, sourceCellSize: CELL, groundY: GROUND, pages, frames, clips: authored.clips, walkContacts,
    stride: STRIDE, neutralFrame: 0, neutralAsset: `pets/${species}-line-v1-neutral.png`, authoredStops: authored.authoredStops, transitions: authored.transitions,
    provenance: { source: 'scripts/author-couple-puppies.mjs + scripts/couple-puppies/{poses,draw}.mjs', method: 'independent-full-svg-scene-rasterization', turnEndpoint: 'offline-reflection-of-independently-rasterized-whole-neutral', rasterSize: 512, outputSize: CELL, generation: 'offline', characterReference: 'Moonlab — Maltese & Golden Retriever', referenceUrl: 'https://store.line.me/stickershop/author/173491/en' } };
  if (!patchOnly) await writeFile(resolve(publicPets, `${species}-line-v1.json`), JSON.stringify(meta, null, 2));
  await writeFile(resolve(artifacts, `${species}-line-v1-landmarks.json`), JSON.stringify({ species, canonicalSize: 256, groundY: GROUND, stride: STRIDE, walkFrames: authored.clips.walk.frames,
    frames: authored.poses.map((pose, i) => ({ frame: i, label: authored.labels[i], ...pose,
      feet: pose.feet.map((f, legIndex) => ({ ...f, id: f.name, generation: f.cycle, stance: f.contact, projectedX: projectLegX(pose, legIndex, f.x), projectedY: f.y })) })) }));
  const sources = ['scripts/author-couple-puppies.mjs', 'scripts/couple-puppies/poses.mjs', 'scripts/couple-puppies/draw.mjs'];
  await writeFile(resolve(artifacts, `${species}-line-v1-provenance.json`), JSON.stringify({ species, generatedAt: new Date().toISOString(), method: `complete SVG per frame rasterized at512 then downsampled${CELL}`,
    frameCount: frames.length, mainFrameCount: authored.mainCount, pages: pageHashes, frameHashes,
    sources: await Promise.all(sources.map(async path => ({ path, sha256: hash(await readFile(resolve(root, path))) }))) }, null, 2));
  console.log(`${species}: ${frames.length} complete frames,${pages.length}pages exported`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const species = process.argv.slice(2).filter(x => ['maltese', 'golden'].includes(x));
  for (const item of species.length ? species : ['maltese', 'golden']) {
    if (process.argv.includes('--export') || process.argv.includes('--turn-only') || process.argv.includes('--neutral-stop-only'))
      await exportSpecies(item, { turnOnly: process.argv.includes('--turn-only'), neutralStopOnly: process.argv.includes('--neutral-stop-only') });
    else if (process.argv.includes('--turn-proof')) await turnProof(item);
    else await preview(item);
  }
}
