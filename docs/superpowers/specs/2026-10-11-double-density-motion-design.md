# Double density whole-character motion

The user accepted the 0.4.0 whole-character direction and explicitly requested at least twice the action detail with continuous playback. Preserve the accepted realistic plush cat, dog and cockatiel identities, complete-body frames, transparent background, care controls, saved settings and desktop movement. This is refinement of the approved direction.

## Artwork

Create two pristine imagegen pages per species, each 8 columns × 6 rows. Keep the existing whole-v1 atlas as the identity/reference input and preserve its realistic material and face. Each character is fully contained in one cell with consistent camera/lighting/scale and generous transparent spacing. Register complete contours in JSON; do not warp anatomy, blend duplicate silhouettes or modify generated alpha pixels.

Page A contains 48 poses: idle 0–11, rest 12–15, walk/flight 16–31, grounded right-to-left turn 32–47. Page B contains 48 poses: pet 48–55, feed 56–63, groom 64–71, stretch 72–79, hop 80–89, four standing-to-rest bridges 90–93, two locomotion-to-neutral bridges 94–95. Counts are 12/4/16/16/8/8/8/8/10, plus six bridges: 96 populated complete-body poses per species, compared with 45 previously.

Walking and flight must form one coherent 16-phase cycle with adjacent poses changing gradually. All standing care clips start and finish at the same right-facing neutral stance as idle. Hop includes anticipation, gradual airborne rise/fall and landing recovery. Sleep bridges gradually lower the body into the resting pose; reverse them to wake. The parrot locomotion bridges show takeoff/landing instead of quadruped foot settling.

## Loading and rendering

Support existing metadata version 1 unchanged. Metadata version 2 has `pages:[{asset,sourceSize,columns:8,rows:6,scale}]`, `frames:[{page,rect,offsetX,offsetY,mirror?}]`, required nine `clips`, `neutralFrame:0` and optional `transitions`. Each page has a measured uniform scale; scales across both pages preserve the same animal size. Load and validate every page atomically before selecting the primary renderer. Any missing/invalid page retains the established fallback.

`createWholeRenderer(canvas,{image,images?,meta})` chooses the one page belonging to `sample.frame` and draws one whole crop. `validateWholeAtlas(imageOrImages,meta)` validates page dimensions, rectangles, frame/page indices, clips and optional transitions. Version 2 contains 96 frames and clips do not reference invalid positions.

## Timing and continuity

Keep 6.6-second idle, displacement-driven gait and 800 ms cat/dog turning. Sixteen walk phases divide the same 1.06-second normalized gait cycle; sixteen turn phases each occupy 50 ms. Preserve pause/drag/reduced-motion pixels, monotonic elapsed time, accepted displacement and scheduler synchronization. Parrot direction still mirrors immediately.

Double true intermediate poses rather than repeat old frames. For explicit care, match visual cycle/recovery to existing interaction durations: pet 2400 ms, feed 1600 ms per cycle (3200 ms interaction), stretch 2600 ms, hop 2800 ms. Groom remains a complete one-shot; rest breathes slowly. Feed starts/ends neutral so a normal interaction finishes on a compatible pose. Optional transition tracks use whole authored bridge poses for stop/start and sleep/wake, and preserve the destination clip name in telemetry. New care/reversal/moving accepted travel can supersede an unfinished bridge; no stale or queued interaction survives newer input.

## Acceptance

Inspect all 96 animals and actual-size loops for identity, gradual limb/wing changes, consistent scale/anchor, complete anatomy, transparent margins, loop closure and neutral recovery. Assert pose counts from actual frame selections, not duration duplication. Test v1 compatibility, v2 page failure/species change, bridge entry/exit, interruption, freeze and exact gait distance. Review in the actual browser/native app, update the comparison, package Apple Silicon 0.4.1 only after visual/functional checks. Automated results establish behavior, not subjective smoothness.
