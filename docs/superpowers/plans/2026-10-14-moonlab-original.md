# Moonlab Original Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. Follow the task scopes and report verification evidence.

**Goal:** display the original Maltese and Golden artwork and original animation, with all 48 source clips selectable.

**Architecture:** losslessly decode each original APNG into a native 320×300 whole-picture atlas and metadata, then use a dedicated time-based original renderer/controller. Keep original catalog ids and disable fabricated locomotion for these two pets. Add a persisted original animation selection and controls in the existing app.

**Tech Stack:** Python/Pillow, React, Canvas2D, Node test runner, Playwright, Electron.

## Global Constraints

- Original inputs: `.artifacts/couple-puppies-exact/references/manifest.json`, and the 24 per-species APNGs named `${species}-${stickerId}.png`.
- Original animation mode: `original-apng-v1`. Metadata asset: `pets/${species}-original-v1.json`.
- One atlas per clip: `pets/${species}-original-v1-${index}.png`, zero-padded 01–24; five columns of 320×300 complete cells, as many rows as necessary.
- Preserve complete decoded RGBA bytes, source frame delays in milliseconds, source APNG loop count (zero means infinite), original order and transparent canvas. Do not resample, crop artwork, remove props, mirror, blend or synthesize frames.
- Metadata: `{version:1,mode:'original-apng-v1',species,sourceSize:[320,300],defaultClip:7,clips:[{id:1..24,stickerId,asset,sourceSize:[atlasWidth,atlasHeight],columns:5,rows,frameSize:[320,300],durations:[milliseconds],loopCount,sourceUrl,sourceSha256,frameHashes:[rawRGBA_SHA256]}]}`.
- Native fallback: `pets/${species}-original-v1-neutral.png` is clip7 frame0, 320×300. Source APNG copies: `pets/${species}-original-source-${index}.png` for reproducibility.
- `OriginalPet` accepts `originalClip` (default7), `originalStartedAt` (restart token), the standard Pet placement/size/pause/static props, and `reducedMotion`; it reports `ready:false` for locomotion and commits stationary visual geometry after successful painting.
- `state.originalAnimation = {clip:7,startedAt:0}` by default. Command `{type:'original-animation',clip:integer1..24}` is accepted only for adopted original pets; sets selection and `startedAt=now`. Paused selection leaves state unchanged. Normalize invalid persisted selections to defaults. Legacy care and settings keep their behavior.
- Keep existing ids and preserve older sources/archives. No changes to legacy controllers, gait math or other pets.

### Task 1: Lossless source importer

Files: create `scripts/import-original-puppies.py`, `tests/original-assets.test.py`; generate only the new `public/pets/*-original-*` assets.

- [x] Write verification against original APNG using Pillow: every atlas crop's RGBA bytes and SHA256 equal the source frame; every delay, repeat count, index and source hash match. Observe failure because original exports are missing.
- [x] Implement importer from the manifest's entries after the product-main entry. Exclude APNG default fallback images if marked `default_image`; export composited animation frames exactly as decoded. Copy original source files byte-for-byte. Export clip7 frame0 fallback.
- [x] Run importer for both species; run `python3 tests/original-assets.test.py`. Expect all 741 source frame comparisons and metadata checks to pass.
- [x] Report counts, command/output, files touched and limitations in `.artifacts/couple-puppies-exact/import-report.md`.

### Task 2: Original playback and renderer

Files: create `src/core/original-animation.js`, `src/OriginalPet.jsx`, `tests/original-animation.test.js`; modify only the routing wrapper in `src/Pet.jsx`.

- [x] Write failing controller tests for unequal frame delays, finite/infinite loop count, exact boundary selection, pause/resume without clock jump, repeated selection restart, static/reduced-motion hold. Use a three-frame fixture with delays `[50,100,200]` and finite loopCount2.
- [x] Implement `createOriginalAnimationController({clip})` with `sample({clip,token,paused,static},now)` selecting frame index, elapsed and done. Original APNG zero loop count is infinite. Frame selection uses cumulative delay boundaries and holds the final frame after finite repeats.
- [x] Implement `OriginalPet` that lazily fetches metadata and loads only selected atlas, draws one whole 320×300 crop to a native-size canvas with proportional CSS display, keeps prior completed image while a selection loads, and releases sources on replacement/unmount. Every successful stationary visual geometry proposal is committed using the existing visualMotionRef. No native locomotion readiness.
- [x] Make `Pet` a stable routing wrapper choosing OriginalPet when `pet.animationMode==='original-apng-v1'`; leave the existing authored Pet implementation intact behind its own component.
- [x] Run `node --test tests/original-animation.test.js`. Report evidence and files in `.artifacts/couple-puppies-exact/playback-report.md`.

### Task 3: Catalog, state and product integration

Files: modify `src/core/pets.js`, `src/core/state.js`, `src/App.jsx`, `src/styles.css`, `electron/security.cjs`, `electron/main.cjs`, `tests/core.test.js`, `tests/security.test.cjs`; create `tests/original-puppies.spec.mjs`, state tests as needed.

- [x] Add failing state/security tests for selection, replay token, invalid clip ids, pause, wrong species and persisted reload.
- [x] Switch two original pet catalog entries to original metadata/fallback and `animationMode:'original-apng-v1'`, retaining saved ids and visual root presentation.
- [x] Add the original-animation command/state per global constraints. Use the original picker in the main panel and original quick controls in the overlay. Disable browser/native wander for original pets; preserve manual drag, size and pause. Avoid misleading walking/grooming labels. Keep legacy controls for other pets.
- [x] Run state/security tests, full `npm test`, `npm run build`, and targeted `npx playwright test tests/original-puppies.spec.mjs`. Browser tests cover adoption, all48 clip loads/draws, selection/restart, pause, reload and a legacy pet.
- [x] Review implementation and actual source screenshots. Build new 0.5.2 archive with local ad-hoc signing and check packaged sources/rendering, signature and ZIP integrity. Record evidence in `docs/verification-moonlab-original-0.5.2.md` and deliver original preview plus archive.
