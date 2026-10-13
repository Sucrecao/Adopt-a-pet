# Whole Character Animation Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement independent artwork and playback tasks in this session.

**Goal:** Preserve realistic plush pets and replace assembled anatomy with harmonious complete character animation.

**Architecture:** Optional full-body atlas and registration data take priority in `Pet`. A small controller chooses intact frames from displacement, persistent time and state. Existing rig and optical-flow paths remain available when the optional new asset group cannot load.

**Tech Stack:** React, Canvas 2D, Electron, Node test runner, Playwright, built-in imagegen.

## Global Constraints

- Preserve cat, dog and cockatiel realistic plush identities and all saved care/settings state.
- Paint one complete animal per frame; no part deformation, crossfade or optical-flow intermediates.
- Eight columns, six rows; load source dimensions from the actual generated image.
- Register source rectangles to common baseline with one species-wide scale; retain intentional hop offsets.
- Turn duration remains 800ms to agree with native and preview schedulers.
- Pause/drag/reduced motion freeze frame and clock; resume does not catch up frozen time.
- Asset failures retain the complete existing fallback path.

### Task 1: Art and registration

Files: `public/pets/{species}-whole-v1.png`, `public/pets/{species}-whole-v1.json`, `docs/whole-character-asset-prompts.md`.

- [x] Generate eight-column, six-row whole-body transparent atlases using existing identity references.
- [x] Inspect cells and animation loops, reject inconsistent anatomy or identity and poor loop seams.
- [x] Record image source dimensions, normalized cell rectangles, common scale and anchor offsets. Record prompt/provenance.

Metadata interface: `{ version:1, columns:8, rows:6, sourceSize:[width,height], clips:{ idle:{frames:[0,1,2,1,0,0], durations:[1680,660,660,840,840,1920],loop:true}, rest:{frames:[6,7],durations:[2800,2800],loop:true}, walk:{frames:[8,9,10,11,12,13,14,15],durations:[120,120,120,120,120,120,120,220],loop:true}, turn:{frames:[16,17,18,19,20,21,22,23],durations:[100,100,100,100,100,100,100,100],loop:false}, pet:{frames:[24,25,26,27],durations:[300,600,500,400],loop:false}, feed:{frames:[28,29,30,31],durations:[300,350,350,500],loop:true}, groom:{frames:[32,33,34,35],durations:[300,500,500,400],loop:false}, stretch:{frames:[36,37,38,39],durations:[250,700,600,450],loop:false}, hop:{frames:[40,41,42,43,44],durations:[140,140,140,140,280],loop:false}}, frames:[{rect:[x,y,w,h],offsetX:0,offsetY:0}] }`. Frames indexed row-major; frame offsets are in 256px render coordinates. Images retain their original pixels. Use uniform image scale, stored as `scale` (default 1); source aspect ratio must be preserved.

### Task 2: Whole frame playback and canvas

Files: `src/core/whole-animation.js`, `src/rendering/whole-renderer.js`, `tests/whole-animation.test.js`, `tests/whole-renderer.spec.mjs`.

Interface: `createWholeAnimationController({species,meta,random})` with `sample(props,now)`; props include `action, actionStartedAt, actionElapsed, walking, facing, ambient, paused, reducedMotion, locomotion`. Locomotion uses `epoch,distanceDip,spriteSizeDip,facing,moving,dragging`. Output: `frame,clip,facing,elapsed,sequence,turning,turnRemaining,phase,motionDistance,motionEpoch,sampleTime,stopped`. `createWholeRenderer(canvas,{image,meta})` exposes `draw(sample)` and `dispose()`; sets renderer dataset to `whole-2d`.

- [x] Tests first: exact frame timings, displacement-driven step cycle, epoch rebasing, frozen pause/resume, 800ms turn, care repetition/interruption and ambient cancellation during reversal.
- [x] Implement persistent clock, whole-body mirroring (turn row starts right and ends left), hold final one-shot pose, selection validation.
- [x] Canvas paints one rectangular image crop with uniform scale and metadata offsets; paused frames remain identical.
- [x] Test intact-frame pixels and transparency, invalid metadata and disposal.

### Task 3: Actual component integration and delivery

Files: `src/Pet.jsx`, `src/core/pets.js`, actual-component browser tests, README/version and verification notes.

- [x] Load optional whole image+JSON, validate them together, prioritize whole renderer/controller. Preserve existing fallback path and proper cleanup/recreation.
- [x] Report `data-atlas=whole` and `data-renderer=whole-2d`; preserve useful motion/turn/freeze datasets. Avoid external element body transforms in whole path.
- [x] Test actual component actions, turning, species changes, failure fallback, pause/reduced motion and dragging.
- [x] Generate reviewable animation preview, run source/build/relevant browser/native verification, package verified Apple Silicon version.

Final implementation and verification: see `docs/verification-0.4.0.md`. The native Snoopy idle schedule totals 6.6 seconds. Atlas registration uses tight complete-character rectangles from the actual 1448×1086 generated images. Parrot flight selects coherent frames 8/9/10 rather than mixing differently oriented poses.
