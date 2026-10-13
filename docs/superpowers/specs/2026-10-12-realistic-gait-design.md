# Natural plush walking: diagnosis and acceptance

The user rejected0.4.4 walking as unrealistic and explicitly authorized sustained work without a token ceiling. Preserve the existing realistic plush character appearance. This is a continued motion repair, not a request to publish, commit, replace an installed app, or change the real user profile.

## What failed

V5 fixes planted-foot world drift, but draws one fixed standing image with lower-surface TPS deformation. Head, shoulder, ribcage and most of the pelvis are frozen above y154. Paw center and sole translate identically, so the heel and toes cannot roll. A single texture retains the same front/back-leg occlusion through the full stride. Surface bends at45% of paw movement are not joint rotations; zero mesh folds does not prove shape/volume preservation.

The old stance-to-swing and wrap boundaries are not velocity-continuous. Finite differences show dx/dphase changing from-32 to approximately0 and dy/dphase from0 to±67.0206. Both species use the same32-unit stride,65%-like support fraction(.625) and.25 same-side limb lag. Evidence: `.artifacts/realistic-gait-audit/curve-continuity-before.json`. Previous foot-only PASS is insufficient.

## Alternatives and selected experiment

1. A new layered relief/3D rig retains original plush texture while independently rotating fixed-length forelimb/hindlimb segments, shoulder girdle, pelvis, toes and paws. Complete hidden fur surfaces and depth layers allow real limb occlusion. This is the first concrete experiment; it must pass actual-frame visual review before product integration.
2. A fully modeled, appearance-matched3D character rendered offline would give the best volume and occlusion control. No Blender/Three/model is currently available locally. If the first approach remains a flat, elastic cutout, obtain the needed runtime and construct a matching model; do not settle for a generic substitute character.
3. Retiming the old single-texture warp can fix the velocity defect but cannot provide missing joint geometry/occlusion. It remains diagnostic and will not be called a realistic final solution.

## Motion contract

Separate a neutral standing footprint from gait footfall centers under the authored shoulder/hip projections. The previous neutral hindpaw lies well behind its visible hip surface; using that paw location as the center of a larger stride can violate limb reach. Skeleton coordinates are authored model parameters, not claimed X-ray measurements.

Use world-space planted contacts and a smooth swing between consecutive world contacts. For support fraction s and normalized swing progress q, canonical paw x relative to its gait center is:
`-stride*s/2 + stride*(minimumJerk(q)-(1-s)*q)`.
Its derivative matches stance `-stride` at both endpoints. Swing lift starts/ends with zero velocity and acceleration; a fourth-power sine envelope is the initial candidate. An unreachable pose must be rejected, never silently stretched to pass.

Maintain each bone length; hinge direction distinguishes elbow/stifle/hock/wrist. Forelimb scapula movement participates in reach. Pelvis, torso and head respond gently to load distribution without decorative bouncing. Paw/toe rolls use a declared pivot; a supporting toe/pad remains at its world contact until release. Depth ordering changes correctly when legs overlap. Cat/dog phase and compression differ according to natural morphology; shared geometry formulas do not imply identical timing.

Start, stop and handoff poses must converge continuously to existing neutral/source art. Preserve V5's interruptible action routing, readiness handshake, pause/drag/reduced-motion behavior and accepted-distance clock. Keep every previous source/archive intact. Keep candidates isolated until their appearance and motion are accepted.

## Every-frame acceptance

Review every authored sample in at least one64-frame cycle per species/facing, plus complete double-cycle playback, first/last loop seam, start, stop, turn exit, care interruption and resumed motion. Capture lossless production-sized PNGs and high-quality videos; compressed inline previews are not the primary acceptance view.

For every reviewed frame, record frame index and decision. Reject detached limbs, fused/extra legs, wrong hinge bends, stretched bone lengths, collapsing thigh/paw volumes, fur gaps/halos at attachments, self-intersections, wrong depth/occlusion, penetration below the floor or airborne contact flags. Confirm a plausible silhouette at the normal pet size. A contact sheet assists navigation but does not replace inspecting each failed/extreme pose.

For consecutive frames, check position/velocity/acceleration continuity and foot-lock in world coordinates, consistent physical distance, load/shoulder/pelvis participation, natural paw clearance and landing. Numerically test densely over phase as well as at authored frames. Freeze/resume must preserve actual pixels and progress. Full existing tests and native packaged travel are regression requirements, not substitutes for visual realism.

Do not describe a rejected candidate as done because its tests pass. Deliver only after observed visual defects have been resolved, and report any actual remaining limitation.
