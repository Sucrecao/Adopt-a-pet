# PawPal 0.3.2 verification

Verified on Apple Silicon macOS, 2026-10-11.

This correction replaces the cat's pendant torso chest and mismatched head/limbs with one generated silver-kitten atlas. The nine source components share fur and lighting: torso, five facial views, complete fore/hind legs and tail. The PNG is copied intact; source measurements, registration and runtime deformation establish the connections. Cat loading selects the PNG and both metadata files as one group, restoring the original head/leg combination if any member fails.

## Source and visual checks

- `npm test`: 108 passed, 0 failed, 2.2s. Core motion is unchanged, including accepted-distance phase, world soles, support identity, turning gates and exact quiet-mode freeze.
- Final `npm run test:ui`: 46 passed, 0 failed, 29.4s. Includes each optional cat group member failing, anatomical neck/tail placement, opaque contact pixels, strict initial reversal, frozen care pixels, ear-tip alignment and head winding.
- Final `npm run build`: passed, 246ms; bundle `index-BpF2ntwC.js`.
- Independent combined source/visual review: PASS, no must-fix. Complete cat standing, both-direction gait, turn, grooming, stretch, jump, pet and feed compositions were inspected on purple, white and dark backgrounds. The old hanging chest, broad hooked ankle and extra translucent ears are resolved in these samples. Mid-turn torso/tail blending remains visible.
- The measured source contains nine complete alpha components. Padded source rectangles preserve fur, whiskers, paws and tail; rendered canvas margins remain clear.
- Hind registration now uses the actual source hock `(638,1070)` and cat-only width `0.8`. Mean opaque distal width changes from 34 to 27.238px (19.9% narrower), preserving sole alpha 230 and exact solved ankle/foot coordinates. Invalid width values retain the default pixels.
- Complete hind motion coverage: accepted travel 0..160 in 2px increments, turning 0..800ms in 8ms increments and full groom/stretch/trick/pet/feed durations in 40ms increments, both initial directions. All 275,576 transforms are finite; 1,356 planted contacts retain alpha ≥230; ten paused care poses retain exact identity/pixels.
- Final head audit: 65 actual idle/pet/feed endpoint/mixed poses, thirteen orientations and partial/full expressions. Exact 288-triangle cat profile blocks are finite, with consistent source winding and positive destination triangles. Sixteen mirrored ear-tip samples retain alpha ≥246 after registration; the original actual-source failure was alpha 189.
- Against baseline 156cc03, 70 complete dog/parrot canvases are byte-identical, covering seven actions and five orientations. No existing test or threshold was weakened.

Each cat head view uses 288 triangles, up to 576 in a neutral two-view turn or 864 when a care expression is blended during a turn. Dog retains 240/view. Source contours and grids are cached after each facial view's first activation. The profile's occluded far eye is an inferred mesh correspondence; it is not an additional painted eye.

## Packaged native checks

The final Apple Silicon executable passed both isolated cat and dog smoke runs using temporary storage, including actual connected-v2/registered-v2 assets, native alpha transparency, stationary interactions, drag, exact pause/reduced-motion freeze, saved settings and fractional/signed-zero coordinates. Cat/dog X and parrot Y zero crossings passed.

- Cat grounded reversal: 217 planted-contact pairs, five continuing supports across reversal and maximum adjacent world drift 0.26 DIP. Entire support lifetimes meet the unchanged <5 DIP horizontal / <2 DIP vertical limits.
- Cat native RAF intervals outside screenshot readbacks: median 8.3ms, p95 9.7ms, maximum 10.3ms. Maximum moving paint-packet lag 27.48ms; displayed root error maximum 2 DIP. The existing <35ms p95, <50ms moving lag and <5 DIP root-error gates passed.
- Each of five cat facial source views was scanned exactly once. First quarter/front activation had actual native frame gaps 15.9ms / 8.2ms. Cold pet/feed p95 was 9.5ms / 10ms; mixed-turn pet/feed supplied 61 / 62 real samples, p95 9.2ms / 8.9ms at the three-view budget. Initial profile setup included a 33.2ms gap; this is startup cost, not steady animation timing.

- Dog grounded reversal: 196 planted-contact pairs, four continuing reversal supports, maximum adjacent world drift 0.31 DIP. Native RAF p95 9.6ms, maximum moving paint-packet lag 25.29ms and maximum displayed root error 2 DIP. The same strict contact and timing limits passed.
- Dog first quarter/front setup gaps were 17.3ms / 10.3ms; cold pet/feed p95 9.8ms / 9.6ms and mixed-turn p95 9.7ms / 8.9ms. Each mixed action supplied 61 real samples. The initial profile setup gap was 65.4ms.

The first dog regression exposed a measurement bug: the old trace lookup matched an epoch/distance to the earliest packet, including a stopped pre-turn packet with the same distance. That reported 851ms age when the actual advancing pose used a later packet. The harness now matches the latest packet available before DOM observation with identical epoch, distance, facing and moving state. Independent replay matched all 200 cat/dog poses, preserving every accepted native bounds value; the failed dog sample's age becomes 31.61ms. No timing/contact threshold changed, and both final native runs passed the corrected harness. RAF timestamps are not used as IPC cutoffs because input can arrive between the frame timestamp and painting.

## Delivery checks

All three 0.3.2 ZIPs were built. Their ASAR package versions, 20 rig asset hashes, native main/preload code, kinematics and exact production renderer bundle match the final source/build. Mac plist versions and native architectures are arm64/x86_64; the Windows executable has PE machine x86_64. All ZIP CRC and required application-entry checks passed.

The latest actual profile was saved after gracefully quitting the previous application: cat 奶糖, bond0, size1.1, free movement, sound off, always-on-top on and pause off. The Mac was locked when the desktop tool attempted the final restart; visible application/profile verification awaits manual unlock. No stale profile backup was restored.

The renderer remains a bitmap 2D rig. Torso/tail side profiles blend visibly during partial turns; care expressions fade toward neutral frontal artwork because separate frontal expression assets are absent. This does not establish a fully 3D turn. Intel Mac and Windows were packaged and archive-checked, but not executed on their target systems. Distribution remains unsigned. Native timing describes this machine, not every supported system.
