# Cohesive Cat Implementation Plan

> **For agentic workers:** Execute with subagent-driven-development in this task, using scoped ownership and an independent final review.

**Goal:** Replace the cat's pendant chest and compressed hind-leg appearance with one consistent kitten anatomy while retaining continuous, grounded interaction.

**Architecture:** Generate a single transparent atlas containing matching cat torso, five heads, complete fore/hind skins and tail. Consume it through the existing registered-head and connected-limb renderer, with feline placement and source joints. The torso owns the chest; head artwork ends at a short neck root. No new kinematics or animation backend is required.

**Tech Stack:** Existing React, Canvas2D, Electron, Playwright and built-in imagegen.

## Global Constraints

- Preserve exact accepted-distance phase, world soles, support identity, 800ms turn gate and pause/drag/reduced-motion freeze.
- Dog and parrot runtime geometry/assets retain their accepted behavior; no new dependencies.
- Keep the silver kitten identity, round green eyes, short fur and existing interactions.
- Source PNG bytes remain intact. Geometry/alpha metadata may be measured; pixel repairs require imagegen.
- Optional cat atlas and both metadata files load as one matching group; source failure retains existing usable assets.
- Require actual composed standing/gait/turn/care visuals on purple, dark and white backgrounds before packaging. Passing geometry alone does not establish harmonious anatomy.
- Preserve the latest actual profile/settings during update and leave the Mac app running. Intel/Windows packages require honest target-system execution limits.

## Task 1: Unified source anatomy

**Files:** Create `public/pets/cat-cohesive-v2.png`, `public/pets/cat-head-rig-v2.json`, `public/pets/cat-limb-rig-v2.json`; record exact prompt in `docs/rig-asset-prompts.md`.

- [x] Generate a 3×3 transparent sheet: row1 torso/side-head/quarter-head; row2 front-head/pet-head/feed-head; row3 full-fore/full-hind/tail. Match all nine components to one cat, lighting and fur.
- [x] Inspect source alpha connected components, reject clipping, extra anatomy or a drooping torso breast. Measure complete rectangles rather than assuming cells crop anatomy correctly.
- [x] Six head/body rectangles use the existing `parts` contract. Registration supplies torso/head placement, per-view neck anchors, eyes/nose/mouth features and complete-tail source/attachment. Two complete limb rectangles/joints use `species.cat={fore:0,hind:1}`. Hind hock-to-sole source proportions must suit the existing21px distal span rather than compressing a39px shape.

## Task 2: Production cat integration

**Files:** Modify `src/Pet.jsx`, `src/rendering/rig-renderer.js`; add scoped cat tests. Modify `src/rendering/limb-skin.js` only if source evidence demonstrates a required species-local width correction.

- [x] Write and observe RED for cat-v2 neck registration and paired production loading; failures must demonstrate retained old cat behavior, not missing test files.
- [x] Extend the existing version/species-gated registration to cat and dog. Use the metadata's cat-specific body/head placement, landmarks and tail attachment; retain exact existing dog placement and parrot path.
- [x] Load the unified cat image with head/limb metadata through `Promise.allSettled`; select the new cat group only when its required members succeed. On failure use the old paired head and connected-leg assets.
- [x] Run focused cat tests plus existing head/limb/rig regressions: feature placement, actual alpha/paws, finite/nonfolded geometry, strict initial reversal, exact freeze and source failure. Capture actual production frames before declaring anatomy accepted.

## Task 3: Independent acceptance and delivery

**Files:** Update release version/README/smoke and `docs/verification-0.3.2.md`.

- [x] Independently compare the original attachment with actual cat standing, both full gait directions, turns, groom/stretch/hop and pet/feed. Confirm one chest contour, connected shoulder and slender feline hock/toes; reopen concrete defects.
- [x] Run full core/UI/build. Measure packaged cat native cold/mixed-care timing and world contacts with the existing strict limits; retain dog/parrot smoke.
- [x] Build all three0.3.2 packages; verify source/bundle/asset hashes, architectures and ZIPCRC.
- [ ] Gracefully restart actual Mac app preserving latest saved profile with expected normal decay. Verify visible version/appearance, save local commit and leave app open.
