# PawPal 0.3.4 verification

Verified on Apple Silicon macOS, 2026-10-11.

The user rejected 0.3.3 because the cat's legs did not emerge from the correct body locations. The previous proportions and reach checks did not establish correct visible attachments. This correction retains the complete v3 artwork and addresses attachment transforms, layering and foot placement.

## Causes and correction

- The measured profile shoulder `(170,145)` and haunch `(80,151)` already correspond to the body artwork. The complete near-leg skin was drawn behind the torso, however, and the lower pass skipped that skin. The torso concealed its shoulder/thigh, leaving apparent shin stumps. A cached, fading attachment layer now appears over the torso, below the head. Its root cap remains concealed; opacity increases between the source hip and knee landmarks. No source image pixels were changed.
- Idle reused four different walking phases. Its soles were `(100.8,174.8,72.8,161.45)`, leaving the near hind foot under the belly. Neutral cat soles are now `(83,172,92,181)`, under the haunch and shoulder, with the far pair offset for depth. Stopping uses a 440ms diagonal-pair replant from the actual visible feet instead of snapping into that stance.
- Left-facing care mirrored hip positions after rotating them, while the body renderer mirrored before rotating. Left stretch separated the hind/fore attachments by approximately 15.69/13.48 canvas pixels. Cat roots now use exactly the body's mirror-then-rotate transform.
- Turning moved individual hips on a delayed per-leg schedule while the torso used its global orientation; the near hind root could separate by 60.31 pixels at 300ms. All cat roots now follow the global torso orientation. Diagonal pairs lift and replant around those roots while continuing supports remain fixed in world coordinates.
- Care, freeze and travel can interrupt a replant or turn. Replant time now continues during care, frozen telemetry does not consume the stop transition, and resuming movement starts from the actual visible feet. Interrupted turn swings resume from their saved position and remaining step time. Raised waiting feet are lowered without moving an already active turn swing to a different horizontal target.

The earlier v3 geometry and optional-resource fallback remain in place. Dog/parrot motion and rendering take their existing branches.

## Verification

- `npm test`: 124 passed, 0 failed. Eight attachment tests cover neutral stance, both-facing body transforms, real turn attachments/reach, stop/replant, care after walking, resuming a partial replant, frozen stopped telemetry and interrupted turn/care/resume.
- `npm run test:ui -- --workers=2`: 54 passed, 0 failed, 46.2s. The new browser regression uses the complete production cat artwork and renderer in both facings. It checks visible near-root skin below the hip and absence of an exposed opaque cap above it; it failed before the new attachment layer.
- `npm run build`: passed. Final production bundle is `index-DyJvizqD.js`.
- An independent direct-production audit sampled 2,372,752 limbs across 100 gait phases, both facings, 5/8/16/33/50ms steps and care interruption/resume points. All six groups had zero overreach. Maximum root/body transform discrepancy was `6.36e-14` canvas pixels; continuing planted contacts had zero drift in the shipping stationary-turn groups.
- Shipping stationary turns retained two supports after the initial walking swing settled; interrupted care retained at least three. Resumed turns retained two. Final stance error and first-resume foot displacement were zero. The previously reproduced 17.77px jump over an 8ms interrupted step is now bounded by 7.38px across the audited gait/care/resume cases.
- Independent code review reproduced and verified the fixes for care-time replant, mid-replant travel, consumed frozen telemetry and interrupted turn/care continuity. A separate 4,800-pose comparison found dog/parrot outputs exactly equal to the pre-attachment controller across care, turning, pause/reduced motion/drag, epoch and size changes.

Evidence is in `.artifacts/cat-attachments-core.log`, `cat-attachments-ui.log`, `cat-attachments-reach-audit.mjs/json`, `cat-attachments-comparison.png`, `cat-attachments-motion.png` and `cat-attachments-joints.png`. Before/after images use the frozen 0.3.3 controller/renderer and final controller/renderer with the same intact v3 artwork at the same poses. They are composed application renders.

## Native application and delivery

The final arm64 package was built with Electron 44.7.0. Its ASAR reports version 0.3.4, and ten packaged source, native bridge, bundle and selected cat-resource hashes match the final source/build. The report is `.artifacts/cat-attachments-package-verification.json`. `release/PawPal-0.3.4-mac-arm64.zip` passes ZIP CRC verification.

The first native run failed the existing requirement for ten PNG samples inside a 700ms care window. The failure log is retained as `cat-attachments-native-first-failed.log`; it did not record individual frame durations, so its cause is unproven. A diagnostic rerun with unchanged assertions passed all desktop checks. It recorded 13/13/10/12 PNG samples for pet/feed/stretch/trick and one 192.4ms synchronous PNG capture during stretch; capture-overlapping frame intervals are excluded from the existing steady-animation timing calculation. No acceptance thresholds were weakened.

The original, unmodified `scripts/smoke-electron.mjs` then passed with `PAWPAL_SMOKE_SPECIES=cat` and the final packaged executable, using temporary storage. It verifies the desktop bridge, adoption, visible native alpha transparency, actual rig assets, grounded travel/reversal, rendered pet/feed/stretch/trick, cold and mixed-turn care, stationary interactions, play, drag, exact freeze, fractional/signed-zero coordinates, persisted settings and parrot Y zero crossings. The successful log is `cat-attachments-native.log`.

- Grounded reversal: 197 contact pairs, one continuing reversal support track, maximum adjacent world drift 0.22 DIP.
- Moving paint-packet lag: 27 samples, maximum 22.10ms. Displayed root error: maximum 2 DIP. Steady native RAF: 508 samples, p95 9.3ms, maximum 16.7ms outside captures.
- Cold pet/feed/stretch/trick RAF p95: 17.5/17.6/17.6/17.6ms. Mixed-turn pet/feed each supplied 53/55 samples, p95 16.7ms.
- First profile/quarter/front setup frame gaps: 66.7/16.8/41.4ms. These cold-start pauses remain a limitation; the correction does not establish zero initialization cost.

The actual `release/mac-arm64/PawPal.app` was replaced, its installed ASAR compared byte-for-byte with the verified package, and visibly restarted at 0.3.4. The old application is retained at `.artifacts/PawPal-0.3.3-before-attachments.app`. The latest profile was saved after graceful shutdown, rather than restoring an earlier backup. Its dog species, name 豆包, adoption, bond and all settings match after restart; the native UI confirms free movement, size 110%, sound off, always-on-top on and pause off. The actual application remains running.

The renderer remains a 2D bitmap rig. Partial-turn torso/tail blending can still show ghosting, and the frontal torso remains a broad blend of side views. A separate synthetic audit supplies continuous translation throughout a turn, unlike the shipping App/native path which gates translation during its 800ms turn. That synthetic path retains reach and fixed supports when planted, but can lift all four feet; it is not evidence of grounded turning for such telemetry. This correction establishes body attachment and shipping-path contact behavior, not a natural 3D turn.

Apple Silicon Mac and source are 0.3.4. Existing Intel Mac and Windows archives remain 0.3.2 and were not rebuilt or executed for this correction. Distribution remains unsigned. Native timing describes this machine.
