# Natural Plush Walking Implementation Plan

> **For agentic workers:** Use independent motion/geometry work and actual-frame review; root owns appearance assets, integration, and release. Do not commit or overwrite prior source/releases.

**Goal:** A believable plush cat/dog walk whose individual poses and consecutive-frame motion are both visually acceptable.

**Architecture:** Prototype independent fixed-length limb joints and whole-body load motion using original plush texture, with separate depth/occlusion surfaces and rigid paw/toe pivots. Introduce product changes only after lossless actual-frame review accepts the candidate. Retain existing distance/readiness/action handoff protocols.

**Tech Stack:** JavaScript/WebGL/Canvas, Node/Playwright, existing image assets and built-in ImageGen only for missing raster surfaces. A local offline3D renderer is the fallback if the layered relief cannot retain volume.

## Global constraints

- Preserve original source PNGs/v4/v5 metadata and0.4.4 ZIP; no installed-app/real-profile changes, commits or publishing.
- Keep realistic plush identity, colors, head/body proportions and source lighting.
- Preserve native/preview accepted-distance clock, first-step ready epoch, pause/drag/reduced-motion and interaction routing.
- Cat/dog turns retain their800ms authored track; move only after their exit preparation is ready.
- Never equate foot-lock, zero folds, or passing old tests with natural-looking motion.

### Task1: Reproduce and diagnose

- [x] Save measured velocity discontinuities in the current consumer curve.
- [x] Capture64 lossless current frames and double-cycle playback; independent reviewer records anatomical/motion defects. All128 cat/dog baseline frames rejected; reports and videos are under `.artifacts/realistic-gait-audit/`.
- [x] Save primary natural gait references, identifying morphology/timing rather than copying cartoon movement. See `docs/realistic-gait-reference.md`.
- [x] Check local3D runtime/model availability and isolate a fixed-length joint prototype. Native WebGL works; no local Blender/model is available. The first feasibility appearance was rejected.

### Task2: Candidate movement and source surfaces

**Files:** `.artifacts/realistic-gait-feasibility*`, `.artifacts/realistic-gait-prototype*`; accepted source/core filenames are decided only after the candidate's visual shape passes.

- [x] Before production changes, write regressions for continuous world paw velocity at lift/landing, constant segment lengths, reach rejection, independent toe pivot and body/load participation.
- [x] Verify RED against current single-standing-image deformation.
- [x] Construct the candidate in isolation. Swing world x uses minimum jerk; local swing subtracts accepted root travel. Lift has zero first/second endpoint derivatives. Each species has authored limb proportions and same-side timing.
- [x] Preserve the original visible head/body texture; use separate whole limb skin and depth layers. Generate only missing/hidden raster surfaces, using the original character as an identity reference; keep candidate assets separate.
- [x] Check exact neutral appearance, complete limb silhouette and every extreme articulation before integrating.

Rejected v3–v6 appearance failures are retained as evidence. Static standing thigh lobes and connected photo cap warps caused stumps and folded fur. Accepted v7 preserves the original upper face/body/tail layer and uses a true no-leg lower torso fill plus independent limb skins. Cat48/dog46 strides passed256 actual steady views. Four/two tiny projected fur triangles in cat/dog were inspected in actual pixels and show no visible crack; no zero-limb-fold claim is made.

Candidate WebGL alpha blending had a real white-edge defect; an actual transparent PNG regression reproduced the error and passes with a consistent premultiplied upload/blend convention. A separate actual single-limb/body compositing fixture reproduced internal alpha loss(128/255 coverage) at the fur root. Full-alpha proximal underlap before the retained body, with distal skin in front, restores255/255 coverage. Frozen reports: `.artifacts/realistic-gait-audit/root-coverage-{red,green}.json`. POT mipmapped minification is now available for the1254px limb sources; the original256px body keeps its source resolution. The final body topology subsequently cleared the appearance blockers; alpha fixtures alone do not approve motion.

### Task3: Every-frame review

- [x] Render64 indexed steady frames per species/facing and full double-cycle playback at original size.
- [ ] Review each indexed frame and each lift/landing/loop seam. Record accepted/rejected status and concrete defects; fix every rejected frame/interval.
- [ ] Validate dense numerical contact, bone length, mesh area/volume and consecutive-frame derivatives, plus actual observed paw pixels.
- [ ] Check normal/slow playback at desktop pet size, source attachment fur, occlusion and whole-body balance.

### Task4: Integrate the accepted candidate

- [x] Add atomic asset loading/schema with safe complete-character fallback. The v6 path remains inactive while photographic turn bridges are reviewed.
- [x] Connect enter/walk/settle to the existing interruptible handoff controller and readiness handshake. Same-time interruptions and neutral endpoints preserve the actual painted pose.
- [ ] Test first-step preparation, stop, turn exit, care→walk→care, pause/drag/reduced-motion, species/size/epoch changes.

### Task5: Verify and deliver

- [ ] Run required unit/browser regressions and production build once stable.
- [ ] Exercise new packaged native app with temporary profiles; compare accepted world travel to actual rendered feet.
- [ ] Verify source→dist→package hashes and new ZIP integrity; preserve previous ZIP hashes.
- [ ] Update the high-quality review and interactive comparison. Report actual frame coverage and limitations; do not claim universal perfection from finite metrics.

Inactive v6 integration:2048 reusable pose samples exactly match the accepted prototype;128 generic GPU poses match accepted GPU pixels exactly. Natural one-farFore preparation has14 numerical regressions and256 actual first-cycle views; independent surface review accepted68 stops,20 prep and256 first-cycle views. Normal startup tempo remains under review.46 changed neutral ports were remeasured;44 passed sampled visual review,90→neutral fails for double faces/tails. Rest via original-neutral129 also fails despite copied old tiles, so it requires genuine intermediate source poses or a better measured port. The new source-only turn guards visibly jump and require repair. No production pointer or new release promotion yet.

Further inactive integration checks:301 unit regressions pass. Six reproduced final-stop/care/reversal packet failures now pass after applying accepted residual travel to the painted walking source and keeping actual movement distinct from requested movement. Genuine multi-source turn entry/exit routes retain800ms and same-clock interruption identity. v6 schema accepts separately decoded extra source pages, validates source counts and rejects missing rise-neighbor fields. An assembly tool freezes reviewed metadata/field/source/report hashes and remaps independently authored source IDs; its incomplete smoke output is not a production candidate.

Actual paw-texture follow-up:the earlier28-row cat nearHind template failed five frames because its visible ankle fur was inside the region. The original evidence is preserved. A visually selected distal16-row toe-fur template passes the unchanged MSE64/NCC.95 diagnostic gates for all260 actual isolated nearFore/nearHind views including four loop endpoints; maximum MSE14.65/minimum correlation.9965. Observed flat-support fur-proxy world-x ranges are.018–.048 canonical pixels. This does not identify hidden pads, pressure or literal anatomical heel/toe contact. Full/inline walking-review previews now show64 unique indexed frames per species, and resume correctly after the host echoes saved state. Photograph rise/turn source reviews and native/package coverage remain required before activation.

Native full-scene audit found a real near-target backward-root correction while the grounded heading and unsigned gait clock remained forward: observed opaque distal toe-fur world-x slip6.02DIP. Four cat/dog left/right regressions reproduced it and pass after stopping within the opposite6DIP heading dead zone; parrot behavior and800ms distant turn remain unchanged. Fresh temporary-profile development Electron capture has914 actual PNG frames,267moving packets painted before the receipt observer, no opposing native travel, and313 observed opaque distal toe-fur samples with unchanged MSE64/NCC.95 gates (maxMSE7.13/minNCC.9931/world-x range<.044DIP). This is not packaged-release validation or atomic OS-compositor evidence. Earlier wider templates and rejected diagnostic evidence are retained.

Immediate native packet painting has6 browser lifecycle/atomic-loading regressions;307unit regressions and42 earlier whole-Pet/ground browser tests pass. Optionalv6 RGB65-sample contour coverage is integrated but inactive:22 flow/contour/ground GPU browser tests pass, including synthetic disocclusion, reverse, temporal boundaries, missing assets and legacy fallback. v6 photographic endpoints now share an in-memory256canonical crop with flow; actual generated-source alpha cold/warm instability68/74 vanished, with at most1LSB opaque RGB variation. The coverage compositor has a newly found near-opaque253-alpha interior-distance assumption under private correction; no contour artifact is promoted until that correction and complete actual route review are accepted.

Further native startup audit reproduced an unnecessary play-triggered motion reset in both preparing and steady cat/dog walking. Four new regressions fail before the fix and pass after preserving the existing mobile action motion epoch, distance, readiness and first-step preparation. Fresh311/311 unit tests and43 whole-Pet/native-loader browser tests pass. The latest temporary-profile development capture contains899 actual PNGs,309 moving packets already painted before the independent receipt observer, zero initial settle frames and no accepted travel opposite the painted heading. All408 opaque distal toe-fur fits pass the unchanged confidence thresholds, with maximum flat-support world-x range.047DIP. Exact-PNG finite morphology review is still pending; this is neither packaged-release evidence nor atomic OS compositor/FPS certification. Dog terminal rise133→neutral remains visually rejected for fast chest/visible-leg proportion reshaping and requires a genuine final bridge.
