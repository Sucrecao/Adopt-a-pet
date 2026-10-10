# Continuous Pose Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Remove visible pose stepping and gait resets in the existing desktop companions.

**Architecture:** Keep existing atlases, Electron motion and local state. A persistent pure animation controller samples neighboring poses; a dedicated canvas renderer interpolates registered sprites using precomputed bidirectional displacement fields. React retains the interaction surface and does not update state for each animation frame.

**Tech Stack:** React, Canvas/WebGL, Node tests and Playwright. OpenCV/Pillow are offline data-generation tools only.

## Global Constraints

- Preserve Mac / Windows, current pet identity, local care data, IPC isolation and the v0.2.1 signed-zero native coordinate fix.
- Keep all original PNGs unchanged. No new application runtime dependency.
- Preserve existing action names, action durations and stationary behavior during stretch/trick/rest/pet/feed.
- Position every input sprite with `spriteBaselineOffset(species, frame)` before interpolating; preserve hop airtime and parrot flight.
- Paused and reduced-motion pets do not animate. Adoption thumbnails are static.
- Native and browser previews use the same Pet component. Loading/GPU failure retains a usable visible pet.
- Ship version 0.2.2 ZIPs for Mac ARM64, Mac x64 and Windows x64; only Mac ARM64 runtime verification is available here.

### Task 1: Continuous sampler and persistent Pet playback

**Files:** Modify `src/core/animation.js`, `src/Pet.jsx`, `tests/animation.test.js`, `tests/renderer.spec.mjs`.

**Interface:** The pure `animationFrame` result retains its existing fields and adds `nextFrame` and `mix` in [0,1]. `createAnimationController({species, random})` exposes `sample(props, now)` where now is monotonic milliseconds and props are Pet animation inputs. Facing must never reset clip progress. The renderer interface is `createSpriteRenderer(canvas, {species, motionImage, legacyImage, flowMeta, flowBytes})`, returning `{draw(sample, now), dispose()}`. `draw` consumes atlas/frame/nextFrame/mix/clip; registration is the renderer's responsibility.

- [x] Write failing tests for continuous interpolation inside a pose interval, loop boundaries, one-shot completion, turning without gait reset and stopped/resumed clock.
- [x] Keep existing clip identifiers and durations. Add neighboring frame sampling and isolate facing changes from clip clocks. Preserve ambient scheduling across harmless prop updates.
- [x] Decode local atlas images and load optional `pets/<species>-flow.json` / `.bin`; retain the legacy background until the canvas has drawn. Keep loading failures recoverable and cancel asynchronous work on identity change/unmount.
- [x] Use a single persistent rAF loop per animated Pet, props refs and imperative DOM/canvas updates. Apply turning/breathing/lift to the outer sprite. Preserve handlers, accessibility, class names and data-frame/data-clip/data-atlas attributes.
- [x] Add browser regression coverage for a fresh companion's turn phase and pose interpolation. Run focused animation tests; report RED/GREEN and self-review in `.superpowers/sdd/continuous-timeline-report.md`.

### Task 2: Registered interpolation renderer and displacement data

**Files:** Create `src/rendering/sprite-renderer.js`, `scripts/generate-pose-flow.py`, `public/pets/{cat,dog,parrot}-flow.{json,bin}`, `tests/sprite-renderer.spec.mjs`; modify `src/styles.css` only for the canvas child.

**Interface:** Implement Task 1's `createSpriteRenderer` contract. Flow metadata records `size:64`, `encoding:'signed-one-pixel-rgba'` and frame-pair indices; each binary tile is 64×64×4 unsigned bytes containing A→B x/y and B→A x/y displacements. Values encode `128 + displacement` (−128…127px; the earlier half-pixel encoding remains readable); the renderer normalizes displacements by the 256px frame size. Atlas texture sampling cannot leak adjacent cells.

- [x] Generate mathematical displacement fields for adjacent playback pairs (including walk/idle loop wraps and parrot's selected stretch path), using existing registration. Record generation parameters and data-size checks.
- [x] Add browser tests that distinguish interpolated images from endpoint images, validate transparent corners and exercise the Canvas 2D fallback before implementing.
- [x] Implement a compact WebGL renderer with premultiplied alpha, registered two-way warp and short captured-frame transitions between clips. Fall back to 2D continuous mixing when GPU/flow data are unavailable; dispose allocated resources.
- [x] Capture paired old/new cycles for all species and inspect actual intermediate poses, alignment, clipping, duplicated outlines and continuity. Measure rAF cadence in the new renderer.
- [x] Record tests and visual evidence in `.superpowers/sdd/continuous-renderer-report.md`.

### Task 3: Integration, review and delivery

**Files:** Modify `scripts/smoke-electron.mjs`, `package.json`, `package-lock.json`, `src/App.jsx`, `README.md` as needed.

- [x] Independently review both changed units; address material issues and run covering tests.
- [x] Run the full Node suite, browser suite, production build and native Electron smoke, including the existing signed-zero regression and new pixel-continuity coverage.
- [x] Update version to 0.2.2 and documentation to explain the playback improvement and existing platform verification limits.
- [x] Review the complete change, rebuild all three ZIPs, verify embedded assets/version and archive integrity, and smoke-test packaged Mac ARM64.
- [x] Gracefully restart the updated real Mac app and verify retained dog 豆包 and settings before delivering links.
