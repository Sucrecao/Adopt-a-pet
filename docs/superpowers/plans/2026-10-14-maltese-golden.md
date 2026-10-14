# Maltese & Golden Retriever Implementation Plan

> For agentic workers: use subagent-driven-development for independent integration and review. User has delegated execution.

**Goal:** implement the user-specified Maltese and Golden Retriever characters as smooth complete-picture desktop pets.

**Architecture:** separate offline character drawing and biped pose authoring from the existing production whole-frame protocol. Register two new pet ids without altering the old animals or renderer.

**Tech stack:** SVG, Sharp PNG atlases, React, Electron, Node test and Playwright.

## Global constraints

- New pet ids are `maltese` and `golden`; retain `cat`, `dog`, `parrot`.
- Metadata uses `authoring: 'line-pet-v1'`, `renderMode: 'discrete-whole-frame'`, canonical size 256.
- Whole immutable PNG frames only at runtime. Turn duration 800ms. Walk length 128. Stop tracks 128 × 40 pictures.
- White Maltese: fluffy contour, black outline, black nose matching the inspected official images. Tan Retriever: smooth contour, rounded long ears, red collar, black nose. Both: dot eyes, simple mouths, large heads and short upright bodies.
- Retain 0.5.0 release/source assets. No money spent or external messages. No persistent profile changes.

## Task 1: offline complete-scene authoring (root)

- [x] Create `tests/couple-puppy-authoring.test.js` with continuous-world planted-foot and neutral-transition assertions; observe missing implementation failures.
- [x] Create `scripts/couple-puppies/poses.mjs` with `walkPose`, `stopPose`, `actionPose`, `restPose`, `turnPose`, `projectLegX`, `GROUND`, `STRIDE`, `WALK_FRAMES`, `STOP_FRAMES` compatible with the atlas author.
- [x] Create `scripts/couple-puppies/draw.mjs` exporting `drawScene(pose,resolution=512)` for the two reference characters; visually compare neutral and all action rows against inspected references.
- [x] Create `scripts/author-couple-puppies.mjs` exporting previews and new `maltese-line-v1.*` / `golden-line-v1.*` atlases in `public/pets`; never overwrite original line pets.
- [x] Verify all exported frames are nonempty/unclipped, walk pictures unique, turn endpoints pixel exact and stop endpoints exact.

## Task 2: selectable pets and integration (delegate)

- [x] Add the two explicitly named dog characters to `src/core/pets.js`, using `*-line-v1-neutral.png`, `*-line-v1-main-000.png`, `*-line-v1.json` and `presentation:'visual-root-v1'`.
- [x] Add adopt validation for new ids in `electron/security.cjs`; preserve rejection of unknown ids.
- [x] Add app responses and dog traits/sound/gait handling without unrelated refactoring. Check onboarding at small and wide widths.
- [x] Update catalog tests and legacy three-species fixture loops. Extend `scripts/visual-root-electron.mjs` to probe new ids using catalog metadata.
- [x] Run focused core, security, gait and desktop tests; report command results.

## Task 3: production preview and independent review

- [x] Create `.artifacts/couple-puppies/index.html` and `preview.mjs` using the production Pet, motion driver and controller, with Maltese and Retriever selectors.
- [x] Run browser decoded source/mirror/junction/cadence QA against both new assets, then live slow playback and pause/step controls.
- [x] Independent agent reviews appearance against the inspected official references and checks all source poses.

## Task 4: release and final verification

- [x] Update app/package version to 0.5.1. Run `npm test` and `npm run build` after final changes.
- [x] Build with local Electron using explicit ad-hoc signing into `.artifacts/couple-puppies/package`; deep/strict verify signature.
- [x] Probe both new pets from packaged executable with temporary profiles. Archive as `release/PawPal-0.5.1-mac-arm64.zip`, verify ZIP and metadata/assets against source.
- [x] Open the production preview, show final character image and link the release. Record new evidence and unresolved practical limits in `docs/verification-maltese-golden-0.5.1.md`.
