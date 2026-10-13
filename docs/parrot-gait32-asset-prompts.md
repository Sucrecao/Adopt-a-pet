# Parrot gait32 artwork

Generated with the built-in imagegen tool on 2026-10-11. The existing v2 motion PNG is an identity/gait reference. Only the separate new gait PNG and measurement/documentation files are delivered here; original motion/care images retain their pixels.

## Selected pristine output

- Project asset: `public/pets/parrot-whole-v3-gait.png`
- Raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-9db9-7452-9e10-cda94006a8f7/exec-ef627f14-e6c4-4a27-a8c5-0257ed2bf3aa.png`
- SHA-256: `0e66eaf7f4947b72c446824659291923166e7163157b8ac9e9c9db77493977f6`
- Dimensions/mode: 1774×887, RGBA; 32 whole alpha contours in 8×4 row-major cells.
- Copy is byte-for-byte; no PNG pixel postprocessing or part assembly.
- Near-eye measurements and one uniform scale proposal: `docs/gait32-parrot-anchors.json`.
- Opaque 256-square uniform-scale contact sheet: `.artifacts/parrot-gait32-registered-contact.png`.
- Loop seam 26–31→0–1: `.artifacts/parrot-gait32-seam-contact.png`.

## Inspection and limits

All 32 birds face right, with no mirror or body rotation. The retained grey/white feather detail, yellow face/crest, orange cheek, glossy eye, grey beak and tiny feet match the existing plush identity. Raised→downstroke→lowest→recovery→raised spans the entire page, rather than resetting each row. All 32 registered silhouette masks are distinct.

Near-eye centers were measured using the largest dark face component and checked visually. Eye-to-crest-top median is 51.635 source px (range 47.67–53.64), compared with 48.84 source px in v2. Proposed uniform rendered pixels per source pixel is 1.0478164237942666, preserving the v2 median rendered crest height rather than scaling by changing wing height. Anchor every frame's near-eye to (172,110). Every complete crop fits a 256 square at that factor.

The closing 31→0 pose is visually compatible: registered silhouette delta 3.56%, near median adjacent 4.315%. The largest internal change is 23→24 (16.99%), followed by 6→7 (16.5%); wing articulation is less evenly spaced at these passages. The lowstroke body/tail silhouette is slightly broader than the raised stroke. These are authored-frame limitations to evaluate in playback; no interpolation, duplicate frame insertion or part deformation was used.

Both prompts requested 25 px transparent cell margins. The repair enlarged usable gaps but did not fully satisfy that number: minimum nominal-cell margin is 4.75 px at alpha>=32. Every bird stays inside its nominal cell; minimum horizontal neighbor gap is 34 px. Each 3 px padded contour crop preserves one complete bird and excludes neighboring animals. Original low-alpha pixels remain untouched.

## Initial candidate

Not selected because cell margins were narrow and the 23→24 upstroke passage needed a small continuity correction.

Raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-9db9-7452-9e10-cda94006a8f7/exec-8d0fa598-4319-4425-aa2f-972d859397b3.png`

SHA-256: `030e4a4fc006968a30c16d5bbeb3ded5bf95a4d12a7884f2ca9cd1c62f448999`

Input reference: `public/pets/parrot-whole-v2-motion.png`, inspected before generation.

Exact prompt:

```text
Use case: identity-preserve.
Asset type: production whole-character gait sprite atlas,32 poses,8 columns ×4 rows, transparent RGBA.
INPUT IMAGE1 is ONLY the exact character identity/material/profile reference. Its rows3–4 show the current flight. Create a NEW gait-only page, not an edit of the old atlas and not a copy of its idle/rest/turn rows.

Preserve the SAME small realistic plush cockatiel: finely detailed fluffy grey and white feathers, buttery yellow face and swept yellow crest, orange cheek disk, glossy black eye, little grey beak, grey tail, delicate tiny feet. Match the reference's realistic soft studio photograph/3D plush material, warm natural feather texture, face and body proportions. Never cartoon, line art, pixel art, green parrot, plastic toy or a different species.

Canvas: wide2:1 rectangle, preferably2048×1024, regular8-column ×4-row grid of identical square cells. EXACTLY32 separate COMPLETE birds, one per cell. Each entire bird including crest, both wings, toes and tail fits inside the center70% of its cell, with AT LEAST25 pixels of genuinely empty transparent moat on every side. Keep a consistent character scale. No bird crosses its own nominal cell boundary, no interleaving with neighbors. All birds centered consistently; no shadows, floor, props, grid lines, labels, checkerboard graphics, letters or numbers. True transparent RGBA cutouts.

ONE continuous32-phase RIGHT-FACING flight wingbeat in row-major order: row1 is phases0–7, row2 phases8–15, row3 phases16–23, row4 phases24–31. It is ONE full cycle across ALL FOUR rows, NOT a separate flap cycle per row. Frame7→8,15→16 and23→24 are consecutive small steps. Frame31→0 has the same small angular step and closes smoothly in both position and velocity. All32 are genuinely different authored intermediate whole-bird poses, not duplicated16 poses or unrelated variations.

Stable identity/registration: for ALL32, the beak points RIGHT, tail extends LEFT, ONE identical right-facing camera profile and body angle. Preserve head/eye height, beak/crest proportions, torso volume, face, cheek visibility, tail angle/length, feather pattern, soft light and scale. No body rotation, front views, left-facing birds, mirrored poses or camera changes. Imagine the same stable complete cockatiel flying horizontally in place while only its coherent near/far wings advance in small physically plausible steps. Feet remain softly tucked/dangling in the same position. Minimal body bob. The whole birds must be anatomically intact, no isolated wings or glued fragments.

Exact continuous wing progression:
ROW1 phases0–7: begin at the top of the raised upstroke, then smoothly descend through eight small steps toward near-horizontal wings. Phase0 is the upper turning point;1–2 barely below it,3–5 progressively lower,6–7 almosthorizontal. Feather fans articulate gradually, same wing anatomy.
ROW2 phases8–15: continue the SAME downstroke below horizontal in eight small increments, broad near-wing lowering gradually down/forward, with the far wing following the same physical stroke. Phase15 is nearly at the low turning point. Do not reset to raised wings at this row.
ROW3 phases16–23: phase16 reaches the lowest wing position;17–18 begin gradual recovery with a small natural feather fold,19–21 rise in small increments,22–23 approach horizontal from below. This is an upstroke continuation, no sudden wing flip or abrupt spread/fold.
ROW4 phases24–31: continue upward past horizontal,25–27 increasingly raised,28–29 nearly high,30–31 just short of the top. Phase31→phase0 advances only one small step to the top and then returns into the downstroke. Do not add a second full cycle or finish with folded standing wings.
Use approximately evenly spaced cycle phases, with smooth easing naturally slowing at the upper/lower turning points; all intermediate feather/wing angles move gradually and continuously. Raised-wing phase0 and almost-raised phase31 must match in camera/body/feather structure for a seamless loop.

Critical: exactly32 isolated whole realistic plush cockatiels on8×4 cells, ALL faceRIGHT/tailLEFT with stable head/body profile, one coherent full32-phase wingbeat, generous transparent cell gutters. No standing, sleeping, turn or care poses. Retain the reference identity rather than reinventing the bird.
```

## Single targeted repair, selected

Input 1: initial candidate above, inspected before repair. Input 2: current v2 motion identity reference. Transparent background preserved. One repair call only.

Exact prompt:

```text
Use case: identity-preserve / precise-object-edit.
EDIT IMAGE1, the NEW32-pose right-facing plush cockatiel flight page. IMAGE2 is only the accepted character identity/material reference. Correct ONLY spacing/containment and a tiny continuity irregularity; preserve32 whole birds,8columns4rows, one right-facing flightcycle and exact realistic plush grey/yellow/orange character.

PRIMARY CORRECTION: all32 complete birds must be about20% SMALLER at ONE uniform scale, and translated consistently inside their own cells so every entire crest, tail, wing and toe has at least25 actual transparent source pixels of margin on allfour sides of its equal cell. Current bird outlines come too close to bottom/top cell edges. Make empty true-alpha gutters generous; no nominal cell crossing. Never crop bird parts, never stretch body, no isolated fragments. Keep a wide2:1 regular8×4 atlas,32 complete animals exactly. No labels, grid, objects, floor, shadow, glow or checkerboard drawing. Transparent RGBA.

Preserve the coherent SINGLE wingbeat across row1phases0–7, row2phases8–15, row3phases16–23,row4phases24–31. Raised at0, passeshorizontal8, lowest16, returnsupwardthrough24, almosttop31, then0. Keep the gradual feather/wing angles and small natural easing at high/low points. If the row3last→row4first wing currently dips backward, correct ONLY that tiny passage so phase24 is slightly MORE RAISED than phase23, phase25 slightly more raised than24, continuing smoothly into26..31. Frame31→0 must be a tiny seamless upperturning-point step, without change in body/head scale, camera or torso.

Identity/body invariants: ALL32 beaks pointRIGHT and tailsLEFT, fixed right-facing camera/bodyprofile and head/eye position within the pose, exact grey/white plush feather detail, yellow crest/face, orange cheek, glossy black eye, small grey beak and softly tucked feet. Same body/head volume and tail length throughout. No mirrored bird, no left/frontalview, no rotation. Wings remain anatomically coherent with torso, only their gradual angle changes. Retain same realistic detailed plush character as inputs, never cartoon or another bird. Do not copy idle, sleep, care or turn poses.

This is one targeted production repair: generous centered transparent cell margins plus the very small23→24upstroke continuation. Keep ALL32 authored intermediate wholeflight poses in order and preserve the existing pleasing realistic character.
```

