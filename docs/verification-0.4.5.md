# PawPal0.4.5 verification

Date:2026-10-13. User direction: restore the previous complete-picture scheme,
preserve realistic plush appearance, and stop assembling body parts. This
release restores the original v3 artwork; it does not certify a new natural
four-beat gait. No installed application or existing profile was changed.

## Active behavior

All three pet definitions opt into v7 `discrete-whole-frame`. Each has128
original complete poses across three original PNG pages; walk/flight uses32.
Every draw selects one complete source rectangle and applies only its uniform
scale, whole-image registration offset and complete mirror. No head/limb rig,
mesh, flow, contour, crossfade, ground deformation or generated intermediary
is used. Legacy implementations remain available only for explicit older
resources. Runtime asset failure displays the complete static original photo
and holds automatic travel rather than assembling a fallback animal.

Movement intent plays complete entry pictures95,94 before granting readiness;
accepted native distance advances the walking phase. Cat/dog turns retain the
800ms source sequence and stationary root. Cancelling a partial turn still
plays the complete walking entry. Pause/drag/reduced motion freeze exact pixels,
phase and native position. Mobile play preserves its active preparation. Native
turn intent cancellation now emits the final stopped packet.

The dog's original frame93 is a standing paw lift, so its rest track uses actual
settling pictures90,91,92. Bird flight reversal continues to mirror its complete
image immediately; its perched turn row is available in the source explorer.

## Finite source and visual checks

- Exact v3 source/crop/scale/offset provenance is saved in
  `docs/whole-frame-restore-provenance.json`; all original PNGs remain intact.
- Root viewed all128 cat source pictures on four registration sheets. An
  independent actual browser check covered128 frames in both mirrors:256 exact
  original crop references, one draw per endpoint, no invisible or opaque-edge
  clipping. Cat margins at alpha230 were left20/top9/right23/bottom25 pixels.
- Dog128 and parrot128 actual whole-frame renderer outputs were individually
  inspected on eight sheets. All256 were nonempty complete characters; no
  detached body, extra head/tail or clipped alpha32 silhouette was found.
  `.artifacts/whole-frame-restore-audit.json` and its capture inventory bind the
  original sources, output PNGs and review sheets by SHA.
- This is complete-picture reuse approval. Original cat gait119→120 floor
  discontinuity, dog wake90→standing boundary, coarse bird yaw
  and grooming transitions, source edge fringes and contact mismatch remain.
  Pixel uniqueness and exact source selection do not prove anatomical motion.
  Correction after re-reading the original care crop: dog hop89 is standing,
  whereas90 is seated. The earlier description of89 as seated was incorrect.
- New cat16 candidate and both dog16 candidates were rejected for row/camera
  reset or repeated paw recovery. They are not used or extended into a fake64.

## Automated checks

- `npm test`:326/326 pass, including11 discrete controller cases and48 native
  movement cases. Cancelled-turn regression failed96-versus95 before its fix.
- New discrete renderer and Pet checks independently passed13/13. Renderer
  checks include exact partial-alpha pixels, all1..8 layouts,96 pages,1024
  frames, metadata rejection, mirrors, ignored mixing and disposal.
- Whole renderer v3–v7 regression run passed35/35; additional v1/v2 run13/13.
- Full browser run covered177 tests:159 passed;18 old rig fixtures failed
  because Vite rewrote the mode marker quotes. Explicit legacy fixture routing
  was corrected, and all34 tests in the five affected files then passed.
  The active production mode was not relaxed to pass these legacy fixtures.
- Production build passes. The source explorer tests exercise every picture
  in all nine clips for all three species, slow playback, pause, manual stepping,
  whole mirror and328px containment. The project explorer uses lossless PNGs;
  the inline fragment uses uniformly reduced preview pages under1MB.

## Actual native application

Fresh owned temporary profiles were used for both development and the newly
packaged Apple-silicon application. All three species passed exact original
crop capture, `nextFrame===frame`, `mix===0`, empty ground renderer, synchronous
accepted-travel painting, source entry pictures, stationary turn, five care
actions and exact pause/drag/reduced-motion freezing. Old profiles were untouched.

Packaged accepted-travel synchronous packet counts were170/130/176. Walk
distance phase matched native normalized travel to floating-point precision.
Finite1.5s walking captures observed32/31/31 source frame IDs; those captures
are not claimed to have sampled every display frame or hidden paw contact.
Observed intent-to-first-travel spans were220/1306/170ms; these spans include
native scheduling and interaction setup, not just the authored120ms track.
Both complete entry pictures were actually observed before travel. Cat/dog
turn source playback was approximately792ms in sampled display intervals;
native stationary holds were960/982ms including entry. No fixed display-FPS or
universal visual-perfection claim is made.

Evidence: `.artifacts/whole-frame-native-report.json` and
`.artifacts/whole-frame-packaged-native-report.json` with per-species traces.

## Package integrity

Nineteen packaged core/native/bundle/metadata/original-PNG files match current
source/build bytes. Packaged manifest name/version/main match; electron-builder
normally removes development fields. Report:
`.artifacts/whole-frame-package-integrity.json`.

`release/PawPal-0.4.5-mac-arm64.zip`:196315880bytes; `unzip -tq` passes.
SHA256:`12d3c62e71c12a93be77176cffa279b8857ead45250c50f6d3c0695ee368026c`.

Previous0.4.4 ZIP remains exact:
`df174779aa139596852a9f20ca855d64b2a528d7a74461ecfe8d63be1264cfc6`.
Intel Mac/Windows archives retain0.3.2. This release is unsigned as before.
