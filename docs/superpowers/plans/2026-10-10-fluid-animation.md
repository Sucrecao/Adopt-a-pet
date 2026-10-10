# Fluid Pet Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Make desktop movement and pet animation visibly smoother and add expressive idle and interactive actions.

**Architecture:** Keep the transparent Electron window and React renderer. A small pure motion integrator handles time-based desktop movement, while a renderer timeline plays continuous reference-matched sprites. Independent native and renderer tasks use the action names and atlas layout below.

**Tech Stack:** Electron, React, CSS, Vite, Node test runner, Playwright; no new runtime dependency.

## Global Constraints

- Keep existing Mac / Windows behavior, local pet data and IPC isolation.
- New action identifiers are `stretch` and `trick`, labels “伸懒腰” and “小把戏”.
- New transparent assets are `pets/cat-motion.png`, `pets/dog-motion.png`, `pets/parrot-motion.png`, with 6 columns × 4 rows: walk 0–7, idle 8–11, groom 12–15, stretch 16–19, hop 20–23.
- Keep legacy `pets/*.png` for rest pose 3 and affection pose 5.
- Register grounded motion frames to the measured feet baseline at display time, preserving airborne hop height. After visual selection, parrot stretch uses frames `[16,17,16,15]`; frames 18/19 remain in the source atlas but are not played.
- Paused and reduced-motion views stop autonomous animations; no placeholder or broken image visible while assets load.
- Working tree ownership is disjoint; agents do not commit another agent’s files.

### Task 1: Native movement and new action state

**Files:** Create `src/core/motion.js`, `tests/motion.test.js`; modify `electron/main.cjs`, `electron/security.cjs`, `src/core/state.js`, `tests/core.test.js`, `tests/security.test.cjs`, `tests/movement.test.cjs`.

**Interfaces:** `advanceMotion(motion, target, speed, elapsedSeconds)` returns floating point `{x,y,vx,vy,arrived}`. Native snapshot retains `{motion:{moving,facing,dragging}}`. The renderer consumes `stretch` and `trick` actions with existing `{type,until}` shape.

- [ ] Write and run failing tests for equal travel at 16/33ms, fractional low-speed progress, smooth arrival without overshoot and resetting resized bounds.
- [ ] Implement acceleration/deceleration and native tick at 16ms using elapsed time capped at 50ms. Initialize from actual window bounds and retain fractional coordinates. Clear motion and target when resize, drag, pause, display geometry, species or movement settings change.
- [ ] Add `stretch` duration 2600ms (energy -1, happiness +4, bond +1) and `trick` 2800ms (energy -3, happiness +7, bond +2) to state and security validation. Stop native wandering during these actions.
- [ ] Run `node --test tests/motion.test.js tests/movement.test.cjs tests/core.test.js tests/security.test.cjs` and record results in `.superpowers/sdd/fluid-native-report.md`.

### Task 2: Renderer timeline, idle behavior and interactions

**Files:** Create `src/core/animation.js`, `tests/animation.test.js`; modify `src/Pet.jsx`, `src/App.jsx`, `src/styles.css`, `src/core/pets.js`, `tests/renderer.spec.mjs`.

**Interfaces:** Add `motionAsset` to each PETS entry, preserve `asset`. `Pet` retains all current props and accepts `paused`, `ambient` (false for adoption thumbnails), and optional `actionStartedAt` timestamp. Native motion snapshot is unchanged. Atlas contract is in Global Constraints.

- [ ] Write failing timeline tests for 8 distinct walk frames, valid atlas coordinates, loop/one-shot behavior, rest legacy selection and stopped paused/reduced playback.
- [ ] Implement time-based clips, slight body weight shifts, short action transitions and softened turn. Decoded assets load before switching; failures retain the existing sprite. Avoid ghosting between walk frames.
- [ ] Add occasional deterministic-duration idle groom/stretch with randomized gaps; explicit user actions immediately interrupt ambient behavior. Respect pause, rest and reduced-motion; only main stage/overlay are ambient.
- [ ] Replace preview 50ms position interval with requestAnimationFrame, float position refs, delta-time movement and smoothly arriving targets. Keep pointer dragging responsive, bounds valid and nonmoving interactions stationary.
- [ ] Add both action buttons with Chinese responses, adequate overlay toolbar width and responsive layout. Pass pause/drag status to `Pet`; remove preview fake-walking overlay interval.
- [ ] Run `node --test tests/animation.test.js`, `npm run build`, and focused Playwright flows. Record results in `.superpowers/sdd/fluid-renderer-report.md`.

### Task 3: Continuous sprite assets and visual review

**Files:** Add `public/pets/*-motion.png`; append `docs/asset-prompts.md`.

- [ ] Generate one 24-frame transparent atlas per species with the existing image as an identity reference, fixed camera, scale and baseline. Save exact prompts and generated paths.
- [ ] Inspect all generated grids and alpha channel; use only complete aligned 6×4 grids and preserve originals.
- [ ] Load into renderer and capture full walk, idle, stretch and hop cycles; inspect alignment, flicker, clipping and turn behavior. Correct observed defects before packaging.

### Task 4: Review, version and delivery

**Files:** Modify `package.json`, `package-lock.json`, `README.md`, `scripts/smoke-electron.mjs` as needed.

- [ ] Review combined diff for state, movement and renderer integration; resolve important findings and update regression tests.
- [ ] Run `npm test`, `npm run test:ui`, `npm run test:desktop` and review screenshots/animation recordings.
- [ ] Change version to 0.2.0, rebuild Mac ARM64/Intel and Windows ZIPs, verify archive integrity, and smoke-test packaged Mac ARM64.
- [ ] Restart the completed Mac app with existing user state and deliver updated links plus concise validation and platform limitations.
