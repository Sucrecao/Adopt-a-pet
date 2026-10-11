# PawPal 0.3.1 verification

Verified on Apple Silicon macOS, 2026-10-11.

This correction replaces exposed cylindrical limb pieces and separately cropped paws with intact generated dog/cat fore/hind skins. A new dog head atlas removes the long pendant neck and restores puppy head proportions. Facial landmarks and cheek contours align before views blend, avoiding duplicated eyes/noses and the angular cheek strip identified in actual turn frames. Source PNGs are copied intact; deformation and registration are runtime geometry.

## Source and visual checks

- `npm test`: 108 passed, 0 failed. Includes upper/lower reach bounds, care composed with turning and exact freeze/contact regressions. An independent 27,784-pose baseline comparison preserved phase, orientation, soles and support identity.
- Final `npm run test:ui`: 35 passed, 0 failed, 30.3s. Production assets, both starting directions, contact alpha, strict initial reversal, paused pixels, optional-asset fallback, facial feature placement and source/destination mesh winding are covered.
- Final `npm run build`: passed, 295ms; bundle `index-hfPi9mpD.js`.
- Independent combined implementation review: spec PASS / quality Approved. Actual gait, turn, grooming, stretch and jump compositions were inspected; both-direction head turns were checked on white and dark backgrounds. The former rod joints, cut-off paws, pendant bib, duplicated facial features and angular cheek strip were resolved in these samples.
- Head winding audit: 65 actual endpoint/mixed idle/pet/feed poses, both mirrors and partial/full expressions; all transforms finite, destination triangle areas positive, no source-view folds.

Limb cost is 376 triangles in an ordinary full-pet pose and 416 in sampled grooming, with extra mirrored profiles during turns. Each active dog head view uses 240 triangles: 240 at an endpoint, 480 in a two-view turn and up to 720 with an expression. A steady dog therefore uses 616 head-plus-limb triangles. Source contours/grids are cached after a one-time scan on each view's first activation.

## Packaged native checks

The final Apple Silicon executable passed `scripts/smoke-electron.mjs` with isolated temporary storage, including transparent native pixels, actual connected-v2/registered-v2 assets, stationary pet/feed/stretch/trick playback, drag, pause/reduced-motion freeze, persistent state and integer/signed-zero coordinates across dog X and parrot Y zero crossings.

- Grounded reversal: 197 planted-contact pairs, four continuing reversal supports, maximum adjacent world drift 0.44 DIP. Whole support lifetimes also satisfied the unchanged <5 DIP horizontal / <2 DIP vertical limits.
- Native RAF intervals outside screenshot readbacks: median 8.3ms, p95 9ms, maximum 9.3ms. Moving paint-packet lag maximum 39.13ms; displayed root error maximum 4 DIP. Existing <35ms p95, <50ms moving lag and <5 DIP root-error gates passed.
- First-use quarter/front head setup was bracketed by actual native frames: 16.6ms / 8.4ms gaps. Cold pet/feed p95 was 9.1ms / 17.1ms. Each of the five head source views was scanned exactly once.
- Mixed-turn pet/feed each supplied 62 actual samples at the three-head-view budget, p95 8.9ms / 9.1ms, maximum 9.1ms / 9.3ms. Native interactions were accepted after their normal cooldown and retained an interior turn orientation.
- Initial renderer/image setup included a 74.5ms frame gap for the first profile; this is startup cost, not steady animation timing. These measurements describe this machine, not every supported system.

## Delivery checks

All three 0.3.1 ZIPs were built. Their ASAR package versions, 17 rig asset hashes, native main/preload code, kinematics and exact production renderer bundle match the final source/build. macOS plist versions and native executable architectures are arm64 / x86_64 as labeled. All ZIP CRC checks and required app/EXE entries passed.

The actual Apple Silicon application was gracefully restarted from the updated package. Its UI shows v0.3.1 and the corrected head/legs. The latest existing dog profile was preserved: 豆包, bond12, size1.1, free movement, sound off, always-on-top on and pause off. Stats match ordinary elapsed-time decay from the saved profile; no stale backup was restored. The application is left running.

The renderer remains a bitmap 2D rig. Existing torso/tail profiles can blend visibly during partial turns; side care expressions fade toward neutral frontal artwork because separate frontal expression assets are absent. This work does not establish a fully 3D turn. Intel Mac and Windows were packaged and archive-checked, but not executed on their target systems. Distribution remains unsigned.
