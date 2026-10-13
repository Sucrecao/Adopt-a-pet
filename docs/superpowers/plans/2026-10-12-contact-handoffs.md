# Contact-aware Walking and Action Handoffs Implementation Plan

> **For agentic workers:** Use subagent-driven development for independent source measurements, motion routing and field generation. Root integrates whole-image walking, the preview and final verification.

**Goal:** Match visible supporting feet to actual travel and replace abrupt action switches with continuous, interruptible connections.

**Architecture:** Opt-in v5 whole metadata preserves v4. A constrained whole-image walking mesh handles grounded paws; a neutral-port graph reuses accepted whole-image fields for action connections. One distance clock and one frozen animation clock drive both.

**Tech Stack:** JavaScript, Canvas/WebGL, existing OpenCV environment, Node tests, Playwright and Electron.

## Global Constraints

- Preserve the approved plush texture and original PNG bytes; preserve the 0.4.3 archive and v4 metadata/fields.
- No Snoopy calibration. Ground-foot support is judged from real rendered pixels and accepted world travel.
- Cat/dog turns retain 800ms. Bird flight does not pretend to have planted feet.
- Keep pause/drag/reduced-motion pixels exact; telemetry rebases cannot silently discard a visual transition.
- No installed-app or real-profile changes, commits or publishing.

### Task 1: Source measurements and reproduction

- [x] Independently mark visible paw/hip/head constraints on the source standing pose, inspect current gait support trajectories and save measurements plus marked contact sheets.
- [x] Reproduce walking-to-care, care-to-care, return, repeated sleep with epoch rebase and the incorrect dog sleep ordering. Save real source/renderer evidence.

### Task 2: Interruptible action routing

**Files:** `src/core/whole-animation.js`, a focused handoff helper if needed, `tests/whole-handoff.test.js`.

- [x] Write failing tests: a clip switch at the same timestamp preserves the exact fromPose, a new token replaces intent while retaining the current interval, pause preserves elapsed progress, an epoch rebase preserves a partial sleep reversal, and stop runs its settle sequence before care.
- [x] Run `node --test tests/whole-handoff.test.js` and verify failures identify immediate jumps in the current controller.
- [x] Add opt-in neutral-port routing with explicit partial-interval timing and shortest safe return paths. Handle airborne hop returns by landing before entering the next action. Retain previous metadata behavior.
- [x] Run controller regressions including the existing whole-animation suite.

### Task 3: New graph and semantic sleep path

**Files:** a v5 generator, `public/pets/*-whole-v5.json`, v5 fields and quality report, asset tests.

- [x] Write failing validation for new metadata, preserved PNG hashes, new neutral-port pairs and dog sleep paths that never return to standing between lying and sleep.
- [x] Start with `0↔{48,55,56,63,64,71,72,79,80,89,95}` and idle-to-neutral ports. Measure compatible fields using the existing generator without modifying v4.
- [x] Add correct dog sleep endpoint `92↔12`; inspect each new production pair before marking it accepted. Add a turn endpoint only if its canonical mirrored neutral is coherent.
- [x] Run graph, binary-size, source-hash, mesh-fold and independent actual-art checks.

### Task 4: Whole-image foot support and integration

**Files:** `src/rendering/whole-ground-renderer.js`, `src/rendering/whole-renderer.js`, `src/core/gait.js` only where measurement justifies it, `src/Pet.jsx`, catalog and tests.

- [x] Write a failing browser test with independently marked opaque source paws: while planted, actual rendered world pixels remain stable during root travel; stationary displacement cannot advance gait.
- [x] Create a constrained mesh that moves visible paw texture and its continuous leg surface while keeping torso/head fixed. Derive support displacement from accepted distance; use bounded swing and lift-and-place settling.
- [x] Check all-cycle geometry and actual paw silhouettes, start/stop, mirror and exact freeze. Reject failed anatomy instead of claiming success from synthetic contact telemetry.
- [x] Load v5 atomically, opt the controller and renderer into the new schema, and run browser loader fallbacks and legacy tests.

### Task 5: Preview and release

- [x] Show root movement against a fixed ground reference and full action sequences in the updated preview; inspect all three species.
- [x] Run complete unit/browser checks and the production build. Verify the packaged app's travel, support, transitions, transparent window and temporary-profile persistence.
- [x] Package 0.4.4 arm64, verify source/packaged file equality and ZIP integrity, and document measured improvement plus remaining limits.
