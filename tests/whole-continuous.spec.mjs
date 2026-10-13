import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const clips = ['idle','rest','turn','pet','feed','groom','stretch','hop'];

async function inspectSpecies(page, species) {
  await page.goto('/');
  return page.evaluate(async ({ species, clipNames }) => {
    const { createWholeRenderer } = await import('/src/rendering/whole-renderer.js');
    const { createWholeAnimationController } = await import('/src/core/whole-animation.js');
    const url = asset => `/${asset.replace(/^\//, '')}`;
    const metaResponse = await fetch(`/pets/${species}-whole-v4.json`);
    if (!metaResponse.ok) throw new Error(`Missing ${species} v4 metadata: ${metaResponse.status}`);
    const meta = await metaResponse.json();
    const acceptedPairs = new Set(meta.flow.pairs.map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`));
    // Uniform eighths retain the quarter checks and sample the continuous RAF
    // trajectory more closely, including clips with complete-source handoffs.
    const intermediatePhases = Array.from({ length: 7 }, (_, index) => (index + 1) / 8);
    const images = await Promise.all(meta.pages.map(async descriptor => {
      const image = new Image(); image.src = url(descriptor.asset); await image.decode(); return image;
    }));
    const flowResponse = await fetch(url(meta.flow.asset));
    if (!flowResponse.ok) throw new Error(`Missing ${species} v4 fields: ${flowResponse.status}`);
    const flowBytes = new Uint8Array(await flowResponse.arrayBuffer());
    const canvas = document.createElement('canvas');
    const renderer = createWholeRenderer(canvas, { images, image: images[0], meta, flowBytes });
    const backend = canvas.dataset.renderer;
    const context = canvas.getContext('2d');
    const reference = document.createElement('canvas'); reference.width = reference.height = 256;
    const ink = reference.getContext('2d');
    const snapshot = () => {
      const bytes = context.getImageData(0, 0, 256, 256).data;
      let visible = 0;
      for (let i = 3; i < bytes.length; i += 4) if (bytes[i] >= 32) visible++;
      return { png: canvas.toDataURL(), visible, bytes };
    };
    const draw = (sample, now = 0) => {
      if (!renderer.draw(sample, now)) throw new Error(`Rejected ${species} sample ${JSON.stringify(sample)}`);
      return snapshot();
    };
    const source = (frameIndex, facing = 1) => {
      const frame = meta.frames[frameIndex], descriptor = meta.pages[frame.page];
      const scale = 256 / Math.max(descriptor.sourceSize[0] / descriptor.columns, descriptor.sourceSize[1] / descriptor.rows) * (descriptor.scale ?? 1);
      const [x,y,width,height] = frame.rect;
      ink.setTransform(1, 0, 0, 1, 0, 0); ink.clearRect(0, 0, 256, 256); ink.save();
      if (facing * (frame.mirror ?? 1) === -1) { ink.translate(256, 0); ink.scale(-1, 1); }
      ink.drawImage(images[frame.page], x, y, width, height, (256 - width * scale) / 2 + (frame.offsetX ?? 0), (256 - height * scale) / 2 + (frame.offsetY ?? 0), width * scale, height * scale);
      ink.restore(); return reference.toDataURL();
    };
    const sheet = document.createElement('canvas'); sheet.width = 15 * 136; sheet.height = clipNames.length * 156;
    const sheetInk = sheet.getContext('2d'); sheetInk.fillStyle = '#f1ede5'; sheetInk.fillRect(0, 0, sheet.width, sheet.height);
    const records = [];
    for (const [row,name] of clipNames.entries()) {
      const track = meta.clips[name], unique = new Set(), sourceCounts = [];
      let minimumIntermediate = Infinity, minimumAlphaRatio = Infinity, endpointsExact = true, reverseExact = true, warpedEdges = 0, interpolatedEdges = 0, sourceHandoffEdges = 0;
      const edgeCount = track.loop ? track.frames.length : track.frames.length - 1;
      const contactEdges = [0, Math.floor((edgeCount - 1) / 2), edgeCount - 1];
      for (const [index,frame] of track.frames.entries()) {
        const nextFrame = track.frames[index + 1] ?? (track.loop ? track.frames[0] : frame);
        const first = draw({ frame, nextFrame, mix: 0, clip: name, facing: 1 });
        unique.add(first.png); sourceCounts.push(first.visible);
        endpointsExact &&= first.png === source(frame, 1);
        const second = draw({ frame, nextFrame, mix: 1, clip: name, facing: 1 });
        endpointsExact &&= second.png === source(nextFrame, 1);
        endpointsExact &&= draw({ frame, nextFrame, mix: 0, clip: name, facing: -1 }).png === source(frame, -1);
        endpointsExact &&= draw({ frame, nextFrame, mix: 1, clip: name, facing: -1 }).png === source(nextFrame, -1);
        if (nextFrame === frame) continue;
        const eligible = acceptedPairs.has(`${Math.min(frame, nextFrame)}:${Math.max(frame, nextFrame)}`);
        if (eligible) interpolatedEdges++;
        else sourceHandoffEdges++;
        let warped = false;
        for (const mix of intermediatePhases) {
          const middle = draw({ frame, nextFrame, mix, clip: name, facing: 1 });
          unique.add(middle.png);
          minimumIntermediate = Math.min(minimumIntermediate, middle.visible);
          minimumAlphaRatio = Math.min(minimumAlphaRatio, middle.visible / Math.min(first.visible, second.visible));
          reverseExact &&= middle.png === draw({ frame: nextFrame, nextFrame: frame, mix: 1 - mix, clip: name, facing: 1 }).png;
          const flipped = draw({ frame, nextFrame, mix, clip: name, facing: -1 }).png;
          reverseExact &&= flipped === draw({ frame: nextFrame, nextFrame: frame, mix: 1 - mix, clip: name, facing: -1 }).png;
          // A geometry warp changes the alpha silhouette beyond a plain fade.
          if (eligible && mix === .5) {
            let differentAlpha = 0;
            for (let p = 3; p < middle.bytes.length; p += 4) if (Math.abs(middle.bytes[p] - (first.bytes[p] + second.bytes[p]) / 2) > 8) differentAlpha++;
            warped ||= differentAlpha > 100;
          }
        }
        if (warped) warpedEdges++;
        for (const [group,edge] of contactEdges.entries()) if (index === edge) {
          for (const [column,mix] of [0,.25,.5,.75,1].entries()) {
            draw({ frame, nextFrame, mix, clip: name, facing: 1 });
            const cell = group * 5 + column, left = cell * 136, top = row * 156;
            sheetInk.fillStyle = cell % 2 ? '#18222b' : '#ffffff'; sheetInk.fillRect(left, top, 136, 132);
            sheetInk.drawImage(canvas, left + 4, top + 2, 128, 128);
            sheetInk.fillStyle = '#17222b'; sheetInk.font = '11px sans-serif';
            sheetInk.fillText(`${name} ${frame}→${nextFrame} ${mix}`, left + 3, top + 147);
          }
        }
      }
      records.push({ name, baseCount: track.frames.length, distinctPNG: unique.size, sampledPhasesPerInterval: intermediatePhases.length, interpolatedEdges, sourceHandoffEdges, minimumSourceAlpha: Math.min(...sourceCounts), minimumIntermediateAlpha: minimumIntermediate, minimumAlphaRatio, endpointsExact, reverseExact, warpedEdges });
    }
    const controller = createWholeAnimationController({ species, meta, random: () => 1 });
    controller.sample({}, 0);
    const sleeping = { action: 'rest', actionStartedAt: 1 };
    controller.sample(sleeping, 100);
    const before = controller.sample(sleeping, 237.5), beforePNG = draw(before).png;
    const held = controller.sample({ ...sleeping, paused: true }, 5000);
    const heldPNG = draw(held).png;
    const heldAgainPNG = draw(held, 20000).png;
    const resumed = controller.sample(sleeping, 5000), resumedPNG = draw(resumed).png;
    const reversed = controller.sample({}, 5000), reversedPNG = draw(reversed).png;
    const repeat = controller.sample({ ...sleeping, actionStartedAt: 2 }, 5000), repeatPNG = draw(repeat).png;
    const frozen = { before: { frame: before.frame, nextFrame: before.nextFrame, mix: before.mix }, reversed: { frame: reversed.frame, nextFrame: reversed.nextFrame, mix: reversed.mix }, exactPause: beforePNG === heldPNG && heldPNG === heldAgainPNG && heldAgainPNG === resumedPNG, exactCancel: beforePNG === reversedPNG, exactRepeat: reversedPNG === repeatPNG };
    renderer.dispose();
    return { species, version: meta.version, backend, flowBytes: flowBytes.length, records, frozen, contactSheet: sheet.toDataURL() };
  }, { species, clipNames: clips });
}

for (const species of ['cat','dog','parrot']) {
  test(`${species} production v4 gives every nonwalk action at least twice the distinct complete poses`, async ({ page }) => {
    test.setTimeout(120000);
    const result = await inspectSpecies(page, species);
    const directory = path.resolve('.artifacts'); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `natural-continuous-${species}.png`), Buffer.from(result.contactSheet.split(',')[1], 'base64'));
    const { contactSheet, ...report } = result;
    await writeFile(path.join(directory, `natural-continuous-${species}.json`), `${JSON.stringify(report, null, 2)}\n`);
    expect(result.version).toBe(4);
    expect(result.backend).toBe('whole-flow-2d');
    expect(result.flowBytes).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(record.distinctPNG, `${species} ${record.name} distinct PNG poses`).toBeGreaterThanOrEqual(record.baseCount * 2);
      expect(record.minimumSourceAlpha, `${species} ${record.name} source visible pixels`).toBeGreaterThan(1000);
      expect(record.minimumIntermediateAlpha, `${species} ${record.name} intermediate visible pixels`).toBeGreaterThan(1000);
      expect(record.minimumAlphaRatio, `${species} ${record.name} alpha retained`).toBeGreaterThan(.6);
      expect(record.endpointsExact, `${species} ${record.name} crop and mirror endpoints`).toBe(true);
      expect(record.reverseExact, `${species} ${record.name} canonical reverse pixels`).toBe(true);
      expect(record.warpedEdges, `${species} ${record.name} geometric intermediate silhouettes`).toBeGreaterThan(0);
    }
    expect(result.frozen.before).toEqual({ frame: 91, nextFrame: 92, mix: .375 });
    expect(result.frozen.reversed).toEqual({ frame: 92, nextFrame: 91, mix: .625 });
    expect(result.frozen.exactPause).toBe(true);
    expect(result.frozen.exactCancel).toBe(true);
    expect(result.frozen.exactRepeat).toBe(true);
  });
}
