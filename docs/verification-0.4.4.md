# PawPal 0.4.4 verification

Date: 2026-10-12. Platform: macOS arm64. User scope: preserve realistic plush artwork, correct foot support versus world travel, and add interruptible action connections. No installed app, real user profile, commit, or publishing changes.

## Result and limits

Cat and dog now use an intact standing-image texture with constrained whole-image paw and leg-surface deformation. Supporting paws retreat by accepted root travel; swing, first-step preparation and settling lift and place the feet. Walking is driven exclusively by distance. It does not claim to display the previous32 walking source frames or to reconstruct hidden anatomical joints. Head/upper-body texture is fixed. Bird retains32 authored flight poses and completes its source-flight cycle before landing.

V5 has61 newly accepted geometric connections: all60 care/idle-to-neutral connections and the corrected dog lying-to-sleeping connection. Cat/dog/bird have93/87/89 measured geometric fields. Seven new incompatible ports were rejected; together with17 prior safeguards,24 boundaries use crisp complete-source selection. Large turn/wing-occlusion boundaries still visibly step. Returning arbitrary care to an interrupted partial turn retains a reported limited seam; this version does not claim every action boundary is geometrically continuous.

Actions finish/reverse the currently visible interval, return through a neutral port, and enter the requested clip. Hop returns land first. Repeated sleep preserves the curled endpoint. Care lifetime includes up to800ms of connection time. Native and preview movement intent is separate from accepted travel, and a ready/epoch handshake holds the root through first-step preparation. The turn animation itself remains800ms; native root hold also includes the following first-step preparation when needed.

## Source and actual pixels

- Original gait96..103 near-side paw world slip was22.4/24.9px for cat and15.8/19.4px for dog at canonical256 size. Evidence: `.artifacts/gait-foot-diagnostic/foot-measurements-report.json` and `actual-controller-world-foot-trace.json`.
- Independent standing-source annotations: `docs/ground-gait-source-anchors.json`; config: `docs/ground-gait-config.json`. Four visible paw/sole/leg-surface marks, source hashes and annotation uncertainty are recorded; hidden joints are null.
- Actual original toe-texture tracking over64 steady phases measures maximum stance drift1.417px cat and1.596px dog. Independent opaque GPU marker tracking measures≤.332px/≤.465px. Submitted foreground mesh has zero folded triangles over64 phases. This is finite rendered-cycle validation, not an invented skeleton-contact metric.
- Ground browser regressions independently observe all four opaque source paw pixels, both facings and32 phases, require world support drift<1.5px, head preservation, serial enter lift, exact cancellation and exact freeze.
- Dynamic real-art tests preserve the first PNG exactly through partial-enter cancellation, partial-settle replacement, native epoch rebase, care→walk and walk→care. Paused/resumed pixels are exact. Intent without accepted travel cannot advance walking phase. First following RAF toe displacement stays<2.5px. All24 source safeguards are exact complete endpoints with pixel-exact reverse symmetry at three mixes and both facings.
- Independent final review: `.artifacts/contact-v5-qa-final.json`, ground/dynamic contact sheets and SHA-bound decisions in `docs/contact-handoff-qa.json`. New geometric fields were inspected at.25/.5/.75;61 passed and7 were rejected. No speculative repair of rejected fields was shipped.

## Automated verification

- `npm test`:273/273 passed, including native ready/epoch,800ms turn clock, legacy controller and interrupted-route regressions.
- `npm run test:ui -- --workers=2`:150/150 passed. Includes actual GPU images, loader atomicity/fallbacks, care/turn/play, pause/reduced-motion, UI containment and a new legacy-readiness fallback regression.
- Final dynamic test-file refinement was checked separately in `tests/whole-handoff-renderer.spec.mjs`:5/5 passed(6.7s).
- V5 generator `--check`: all3 species passed, no visual-pending pairs; field provenance, old-field prefix, exact crop bytes, source hashes and analytic foreground winding verified.
- V4 generator `--check`: all3 species passed. The32 original PNG hashes,6 v4 JSON/binary hashes, old generator and old quality report are preserved.
- `npm run build`: production0.4.4 bundle passed.

## Packaged native application

Built offline with the installed Electron44.7.0 distribution. `scripts/smoke-whole-electron.mjs` ran against `.artifacts/contact-handoffs-release/mac-arm64/PawPal.app`, using fresh temporary profiles only. Cat, dog and parrot passed transparent-window, native version/metadata, every authored care pose and intermediate images, actual travel, reversal, exact pixel/position freeze for pause/drag/reduced-motion, size and persisted profile restoration.

Cat/dog use the whole-ground WebGL backend; bird uses authored whole flight. Each species produced a stationary native movement-preparation packet before travel. Cat/dog root hold during reversal was981ms/990ms, covering800ms turn plus first-step preparation; the captured window bounds stayed exactly fixed. Accepted native travel and visual phase matched to floating precision:

| Species | Visual cycles | Cycles from actual accepted distance |
| --- | ---: | ---: |
| Cat |5.425101214574895|5.425101214574899|
| Dog |7.5303643724696325|7.530364372469636|
| Parrot |4.521778081647462|4.521778081647463|

The native test awaits actual resolved IPC motion states; it does not treat an unresolved Promise in a browser polling callback as a positive state. Reports: `.artifacts/contact-native-final.json`, `.artifacts/contact-native-turn-cat.json`, `.artifacts/contact-native-turn-dog.json`.

## Release integrity

25 packaged source/bundle/v5 metadata/field/original-PNG files exactly match source→dist→app.asar hashes. Report: `.artifacts/contact-package-integrity.json`.

`release/PawPal-0.4.4-mac-arm64.zip`:193753472bytes; `unzip -tq` passed.
SHA256: `df174779aa139596852a9f20ca855d64b2a528d7a74461ecfe8d63be1264cfc6`.

Previous0.4.3 ZIP remains byte-identical:
`2b3b00e66e6f48d4074e9f8c16586b603a7cd4e7d5294b4235284db05b5d595b`.

Only Apple-silicon Mac was packaged and exercised for this iteration. Existing Intel Mac/Windows archives remain0.3.2. The app is unsigned as before.

## In-conversation comparison

Updated the existing fragment in the thread-owned visualization directory,921076bytes. The self-contained comparison embeds common preview images and exact v4 field prefixes, original v4 strides96/112/80 and original dog rest path. V5 runs the production handoff/ground helpers against a fixed world ground grid, with a following camera and actual root displacement. Automatic sequence: walk→feed→pet→idle→walk. Preparing movement holds root travel until the painted route is ready. Preview-only images are compressed; production PNGs remain unchanged.

Script checks: all3 species start without JS errors, cat enter at80ms holds new root at0 DIP, prepared ground.walk at800ms resumes travel, every sequence stage appears, care holds travel, pause freezes pixels/distance, and328px content has no horizontal overflow. CUA verified cat walk, dog automatic care connection, bird flight, species switching and pause/resume. The new browser tab is retained on cat automatic sequence.
