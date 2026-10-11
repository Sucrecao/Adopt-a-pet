# PawPal 0.3.5 verification

Apple Silicon macOS, 2026-10-11. Source, browser, packaged-native and actual installed application checks completed.

The user rejected the dog's head turn and leg coordination in 0.3.4. The previous dog still used one side torso, independently delayed hip turns and opposing-knee interpolation. Correcting only head proportions did not establish a coordinated whole animal.

## Artwork and rendering

- Built-in imagegen produced one intact 1086×1448 RGBA atlas containing matching side/quarter/front torso and short-neck head views, care heads, complete fore/hind legs and tail. It is `public/pets/dog-cohesive-v3.png`; original SHA256 is `94ed8e1c5bab25d040fe5b1926a656a5bc175ae0d2c87f45e63f9d655914663a`. No source pixels were manually edited. The exact prompt and provenance are in [rig-asset-prompts.md](rig-asset-prompts.md#matching-golden-puppy-views-v035).
- The old frontal torso blended two opposing 180px side silhouettes. The new front uses a single 80px torso, the quarter view 136px, and the side view 180px. Each head follows that view's measured neck point. Head destination dimensions retain source aspect ratios rather than stretching every view into one rectangle.
- Reusing the old facial-row mesh with the new atlas caused a visible horizontal shelf at intermediate yaw. The new dog uses a smooth thin-plate skull deformation fitted to the face, neck and measured head/ear contours on a uniform UV grid, preserving single-view source endpoints. A strict profile contributes one visible pupil rather than stretching its hidden eye into a frontal eye gap. A bounded binary refinement keeps the deformation continuous when a full warp would fold; adjacent feeding samples no longer jump by 23px. Source contour scans are cached once per head crop. Cat and old dog fallback keep their existing rendering paths.
- Complete near-leg skin now has a cached fading shoulder/thigh attachment over the torso, below the head. Far legs remain behind the body. Dog tail mirroring follows its actual lower-right source root, making the tip project outward in both profile directions.
- The image and both registration JSONs form one optional group. Missing files, out-of-image crops or invalid normalized landmarks restore the complete old dog combination.

## Motion

- Dog shoulder/hip roots use the same global orientation and mirror-before-body-rotation transform as the torso. The old delayed roots could separate from the body by about 60px during a turn; left-facing care also rotated and mirrored in a different order.
- Neutral soles now sit under the actual dog shoulder and haunch at profile X `(86,172,95,181)`. Front shoulder roots project to `(112,144)` and hips to `(116,140)`. Old idle soles reused walking phases and put a hind paw under the belly.
- Stationary dog turns use five alternating 160ms diagonal windows over the existing 800ms turn. Initial and middle landings share the frontal stance; the final two windows place the profile stance. A landing remains fixed in world coordinates through its hold. The old four-window targets put front paws on opposite sides of their shoulders and crossed them at the frontal midpoint.
- Dog knees are solved from the projected chain rather than interpolated between opposing bends. Old mid-turn interpolation compressed a 35px upper bone to approximately 5.8px. Foreleg projection bounds a standing elbow's lateral bend to 8px and the frontal bend to 2px.
- Walking stop/restart, care interruption and freeze/resume retain the actual visible feet and continuing support identity. Raised care-interrupted turn paws land at a fixed target with a new support identity. Hop feet travel vertically with the body.
- A turn beginning in a walking swing first lands the airborne diagonal pair while retaining the planted pair. This removes the previously possible 155ms interval with all four feet off the floor. Grooming waits for the interrupted paws to land before lifting its forepaw.
- Actual `Pet` scheduling exposed a separate integration issue: automatic groom/stretch/hop could pause the visual turn past App/native's 800ms translation hold. Dog reversals now cancel automatic care before sampling the rig. Explicit care can still pause and resume a turn. Seven real-component regressions cover automatic care already running or due at a reversal, plus explicit-care pause/resume; the six automatic cases failed before the fix and all seven passed afterward.

## Final verification and delivery

- Source tests: `npm test` — 140/140 passed, zero failures.
- Browser tests: `npm run test:ui -- --workers=2` — 74/74 passed, including actual v3 asset loading, complete fallback for missing/invalid registration, continuous head deformation, cached contour scans, dog support and automatic-care scheduling.
- Independent motion audit: 1,647,448 sampled frames / 6,589,792 legs at 5–50ms frame intervals, both directions, seven gait phases, sixteen pause points and five care actions. Root attachment, chain reach, frozen/resumed continuity and care planting checks passed. Cat and parrot retained 3,010 exactly equal baseline poses.
- Realistic support audit: 200 walking-to-turn cases and 3,200 early pet/feed/groom/stretch interruptions had no unintended interval with all four feet off the floor. At least two feet were planted after the first turn landing; grooming retained three supports after its landing delay.

- `npm run build` passed; the final bundle is `index-BH-0N9I9.js`.
- Apple Silicon packaging passed. Seventeen packaged source/build/assets matched their corresponding files, including the byte-identical original generated atlas. `dog-redesign-package-verification.json` records their SHA-256 values.

- Packaged Electron smoke passed with a separate test profile. It verified actual v3 torso/limbs/head loading, transparent native pixels, stationary pet/feed/stretch/trick interactions, rendered articulation, grounded travel, turns, play, dragging, fractional and signed-zero coordinates, settings and persistence. All existing acceptance thresholds remained unchanged.
- Final native timing: ordinary care p95 at most 9.3ms; mixed-turn pet/feed p95 at most 16.7ms. First-use head view scans were at most 12.2ms with frame gaps at most 17.1ms. Moving paint lag was at most 24.74ms, displayed root error at most 2 native DIP, and non-capture RAF p95 9.2ms. See `.artifacts/dog-redesign-native.log` and the `dog-*-native-*.json` traces.
- Two earlier native attempts are retained as `dog-redesign-native-first-failure.log` and `dog-redesign-native-second-failure.log`. The first observed a feeding-window displacement before pointer diagnostics were enabled, so its cause was not established. The second sampled a new 5-DIP native tick only 1.09ms after emission, before the next paint; its main packet gap was 52.53ms while renderer RAF continued at about 8.3ms. The final run used a virtual test cursor from startup and ran after the old live app was gracefully closed. It passed the same position, sampling and performance assertions. No production fix or relaxed threshold was attributed to those transient observations.
- The 0.3.5 Apple Silicon ZIP passed `unzip -tq`. The installed app's ASAR is byte-identical to the verified package, and its native plist and visible UI both report 0.3.5. The previous 0.3.4 app is retained at `.artifacts/PawPal-0.3.4-before-dog-redesign.app`.
- During the work the user switched from dog 豆包 to cat 奶糖 and changed size/movement. The latest profile was captured after graceful quit, then the updated application was launched without restoring an older profile. Current 奶糖, adoption, bond 8, last interaction and settings (95%, screen edge, sound off, unpaused, always on top) matched that latest snapshot. Ordinary time decay of hunger/energy/happiness continued. `.artifacts/dog-redesign-installed-verification.json` records the before/after state and installed ASAR hash. The updated actual app is left running; the development server was stopped.

The renderer remains a 2D bitmap rig; partial-turn torso contours can show translucent blending. The shipping App/native path stops translation during its 800ms turn. Synthetic telemetry that continues translating through a turn uses the previous paired-step compatibility path and is evaluated separately.

Apple Silicon Mac and source are 0.3.5. Intel Mac and Windows archives remain 0.3.2; distribution is unsigned.
