# Natural Cadence Implementation Plan

> **For agentic workers:** Use subagent-driven development for independent controller, field generation, and rendering tasks. The root integrates loading, cadence, preview, and release verification.

**Goal:** Correct walking cadence and provide at least twice the distinct playback poses for every other action while retaining plush artwork.

**Architecture:** v4 preserves three decoded whole-character pages. Offline measurements produce displacement fields; an offscreen GPU mesh creates continuous intermediate geometry, then paints a visible 2D canvas. Distance drives walk phase and elapsed time drives care actions.

**Tech Stack:** JavaScript, React, Canvas/WebGL, existing OpenCV environment, Node tests, Playwright, Electron.

## Global Constraints

- Preserve all source PNG bytes, all 128 registered frames, all existing clips and authored bridges.
- Grounded turn remains 800ms; pause/reduced motion freezes the exact interpolated pose.
- No Snoopy cadence or preview reference; preview and desktop use the same species travel calibration.
- Metadata v4 retains three pages and 128 frames. `flow` has version 1, `size: 32`, `frameSize: 256`, `encoding: signed-one-pixel-rgba`, `pairs`, and `asset`.
- No installed-app changes, real-profile writes, git commits, or deletion of existing deliverables.

### Task 1: Continuous timeline

- [x] Write and run failing tests for quarter/half interval poses, loop seams, final one-shot holds, and exact interpolated pause/resume.
- [x] Extend `src/core/whole-animation.js` only for flow-enabled metadata to return `nextFrame` and `mix` while retaining previous metadata behavior.
- [x] Verify bridges and 800ms turns with `node --test tests/whole-animation.test.js`.

### Task 2: Measured fields

- [x] Create `scripts/generate-whole-flow.py`, canonicalize existing registered crops in memory, measure both directions, reject folded meshes, and write binary fields and v4 metadata.
- [x] Include visually eligible adjacent clip edges and loop seams, authored transition edges and endpoints. Record excluded view/occlusion edges explicitly and keep image hashes in a QA report.
- [x] Verify byte counts, pair coverage, and original source hashes. Do not write edited raster images.

### Task 3: Whole-character interpolation

- [x] Write a failing browser test with two translated opaque shapes and measured constant fields: midpoint has one complete silhouette at the actual midpoint.
- [x] Add a focused offscreen WebGL mesh renderer and opt it into `createWholeRenderer` only with valid fields. Preserve 2D fallback and crop/mirror behavior.
- [x] Verify endpoints, intermediate geometry, invalid data fallback, freeze, alpha backgrounds, and resource disposal.

### Task 4: Cadence and integration

- [x] Extend v4 atlas validation and loading, fetching optional field bytes with abort handling. Expose nextFrame/mix in dataset for diagnostics.
- [x] Calibrate species stride from accepted motion, correct native content size normalization, and keep movement speed proportional to pet size so resizing does not change gait frequency.
- [x] Verify production catalog metadata, all nonwalk pairs, cadence ratios, and loader fallbacks using node and browser suites.

### Task 5: Preview and deliverable

- [x] Rebuild a shared-artwork old/new PawPal preview with matching native speed calibration and new care poses, without Snoopy.
- [x] Run complete unit/browser checks and build. Inspect actual browser playback and packaged Electron behavior for each species.
- [x] Package arm64 0.4.3, verify packaged fields and original PNGs, ZIP integrity, and document exact results and limitations.

### Actual-art quality follow-up

- [x] Repair compatible face and neck correspondence; reject incompatible view/occlusion edges into reversible complete-source handoffs. A distinct PNG count alone does not establish visual quality.
- [x] Inspect the initial complete pair contact sheets, then re-render the final rejected/repaired production pairs and all 24 clip overviews for duplicate anatomy before release.
