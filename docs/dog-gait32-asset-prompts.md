# Dog 32-phase gait atlas provenance

Tool: built-in imagegen; transparent background requested. The selected source PNG was copied byte-for-byte without modifying its pixels or alpha. One initial generation and one targeted repair were used.

Targeted repair inputs: initial raw sheet (edit target) and existing v2 motion sheet (identity).

## Exact targeted repair prompt

Use case: identity-preserve.
Repair ONLY the gait choreography in this existing32-cell puppy sprite sheet (first input). The second input is the unchanged puppy identity reference. Keep its same honey-gold/cream plush retriever puppy, exact face/eyes/black nose/ears/fur, head and torso proportions, camera/light and uniform physical scale. Keep the8columns by4rows32-complete-dog layout, wide2:1 canvas, full tails/paws and generous transparent gutters. No extra cells or animals.

The current error is that one front paw keeps lifting throughout most rows. Replace those leg poses with ONE biomechanically consistent32-phase four-beat walk cycle. Draw32 adjacent time samples of ONE cycle in row-major order, with row boundaries continuing the same animation and phase31→0 seamless. Never restart a mini-walk at a row boundary. Every dog faces RIGHT; body/head remain nearly fixed in the cell. Tiny1px body bob only.

Each dog has exactly FOUR anatomically attached legs. Three paws provide grounded support while one leg swings. Supporting paws stay flat at their near/far floor level and move slowly LEFT/backward relative to the stable body. Swinging paws move RIGHT/forward on one low5px arc with natural connected elbow/knee bends. Keep step range modest, about20px from rear to front. A lifted paw must begin behind its shoulder/hip and finish in front, not wave repeatedly at the front. No both-front-paws-floating poses, hops, running bounds or hidden missing legs.

Use this exact SINGLE-CYCLE schedule:
ROW1 frames0–7: ONLY the NEAR FRONT paw swings rear-to-front. The other front paw and BOTH hindpaws are visibly planted. At frame0 this near front paw starts at rear toe-off; frame7 it is low at forward touchdown.
ROW2 frames8–15: ONLY the FAR HIND paw swings rear-to-front. BOTH front paws are visibly grounded throughout this entire row, and near hindpaw is grounded. Near front paw has just touched ahead at8 and slides backward across this row.
ROW3 frames16–23: ONLY the FAR FRONT paw swings rear-to-front. The near frontpaw and BOTH hindpaws are visibly grounded throughout this row. Far hindpaw has just touched ahead at16 and slides backward.
ROW4 frames24–31: ONLY the NEAR HIND paw swings rear-to-front. BOTH front paws and the far hindpaw are visibly grounded throughout the entire row. Far frontpaw has just touched ahead at24 and slides backward. At frame31 the near hindpaw is almost touching at the front of its step and near frontpaw is about to toe off at the rear. Next frame0 makes the matching continuation.

Within EACH swing's eight consecutive frames, use: rear toe-off, small lift/slight forward movement, low early pass, low middle pass under joint, low late pass, front extension, lowering, almost-touching forward. These are subtle connected poses, not large arm gestures. The three grounded paws keep moving rearward gradually even while another paw swings; do not snap their positions when changing rows.
Footfall order over this ONE cycle: near hind at0, near front at8, far hind at16, far front at24. Each individual paw is grounded for24 frames and swings for8, with no two forelegs simultaneously airborne. Preserve consistent near/far leg identities across all32 images, using natural mild occlusion but never adding/removing legs.

Keep head/visible eye position and body volume stable so the only meaningful changes are gradual paw choreography, weight transfer and tiny tail lag. First and last face/torso proportions must match. Soft realistic plush quality, clean RGBA alpha. No background, floor/shadow, grid, labels, text, props, motion lines, detached anatomy or neighbor fragments. Output32 complete safely separated puppies.

Identity reference: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v2-motion.png` (inspected before generation).

Project destination: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v3-gait.png`.

Selected repaired raw result: `/Users/sucrecao/.codex/generated_images/01a12a9d-b8f8-7e52-9efb-0240460f1a67/exec-c949218a-6d74-4c51-b07f-2d5ee0fbc0fd.png`.

Selected actual dimensions/mode: 1774×887 RGBA, exactly2:1. SHA256: `3424795b9c90d1ce12a654b3ff47cfb7174e0b615a14da94b7d21e19902e08ae`. The project PNG has the same bytes and hash as this raw result.

Read-only contour QA finds32 separate complete animals at alpha≥32, one in each8×4 row-major slot. A3px extension of each tight contour rectangle includes no other whole-body contour. Opaque light and dark composites show clean fur transparency; no source cleanup or masking was applied.

At approximately184px desktop body height, eye-aligned actual-size review shows stable face/body proportions, complete tails/paws and grounded front paws in rows2/4. Rows1/3 concentrate the front-paw swing, improving the initial candidate. The30→31→0→1 seam has no large face/body jump. These observations do not certify exact gait mechanics: the front swing arc remains larger than the requested low5–8px arc, near/far forepaw identity is visually ambiguous, and the full24-frame backward support/8-frame forward recovery schedule cannot be verified from these drawings. Final naturalness needs runtime playback review. This is the selected deliverable after the single targeted repair, not a claim that every requested contact constraint has passed.

Measured anchors are in `docs/gait32-dog-anchors.json`: `dog.eyes32` and `dog.groundY32` arrays plus global-frame-keyed `gaitEyes`/`supportGround` for96–127. Near-eye centers use the largest connected dark eye region within a head ROI and were checked visually on all32 marked frames. Ground is the bottom of the alpha≥32 whole-body contour, a supporting-foot floor estimate; no independent near/far paw labels were inferred. The file also records the existing v2 frame16 eye and ground reference for a common anatomical page scale.

Temporary read-only QA artifacts: `/private/tmp/dog-gait32-final-eye-aligned-qa.png`, `/private/tmp/dog-gait32-final-seam-qa.png`, `/private/tmp/dog-gait32-final-light.png`, `/private/tmp/dog-gait32-final-dark.png`. These composites and crops are for review only and are not production sprites.

Initial raw: `/Users/sucrecao/.codex/generated_images/01a12a9d-b8f8-7e52-9efb-0240460f1a67/exec-6fbaef85-ce68-4e34-aa4d-41e5690d7d1f.png`.

Initial actual dimensions/mode: 1774×887 RGBA;32 separate whole bodies assigned to all8×4 row-major slots. SHA256: `65200a5bb55ec7000546a87fe4af252aa9c096af5ab55cbb60fd73b8a8e30211`.

Initial QA: identity, uniform body size and full crops look clean on opaque light background. At actual desktop body height184px, repeated front-paw lifting dominates all four rows instead of the requested staggered four-leg cycle. A single targeted built-in repair addresses this contact choreography. QA contact sheet: `/private/tmp/dog-gait32-initial-actual-size-qa.png`.

## Gait contract

One right-facing four-beat walking cycle with32 equally spaced poses in8×4 row-major order. Paw contact relative to a fixed body travels backward during stance; a single lifted paw recovers forward on a low arc. Intended lift order is near forepaw, far hindpaw, far forepaw, near hindpaw, each over eight consecutive phases; three paws support the body. Body and head remain almost steady and phase31 closes into0. Artwork must be assessed visually before claiming natural motion. Root owns runtime registration and final playback QA.

Suggested registration landmark: measure the center of the visible near eye in every frame, with a fixed anatomical body/shoulder scale across all32. Align those eyes to the existing right-profile gait eye position rather than recentering each changing tail/paw silhouette. Preserve source contact foot heights and the small authored bob; avoid per-frame scale changes or aligning the lowest swinging paw as the body anchor.

## Exact generation prompt

Use case: identity-preserve.
Asset type: one production WHOLE-CHARACTER 32-frame walking sprite atlas.
Input image: identity/material reference only. Keep the exact same warm honey-gold/cream golden retriever puppy from dog-whole-v2-motion.png: same brown eyes, black nose, floppy ears, short natural neck, friendly face and realistic plush golden fur. Change ONLY the walking gait. Paint each complete dog coherently with four attached legs, full paws, muzzle, ears and tail. No part assembly.

Output layout: a wide 2:1 transparent PNG, requested 2048x1024, exactly EIGHT equal columns and FOUR equal rows, all32 cells populated. Each cell contains ONE complete small dog. The page represents ONE and only ONE continuous walk cycle sampled at32 consecutive equally spaced phases. Left-to-right, row1 continues into row2, then row3, then row4, and final frame31 flows directly into frame0. Do NOT restart the gait at row boundaries or repeat eight poses across rows. Each of32 drawings must be a genuine adjacent intermediate gait pose, not32 unrelated dog poses. Keep one uniform camera magnification and anatomical size across all frames. Use ample transparent gutters: every full dog occupies at most70percent of cell width and65percent of cell height, centered in cell, with all paws and tail at least20px from cell edges. No neighboring fragments.

Camera/style invariants: exact RIGHT-facing side profile in EVERY cell, muzzle to right and tail to left. Fixed camera and body center; identical shoulder/hip/neck/head proportions, body volume, coat texture, face and soft lighting throughout. Keep the head and eyes nearly stationary, body bob only1–2px and tiny natural shoulder/hip weight shifts. Very small coherent tail inertia. No blinking/head turning/new expression while walking. Same friendly neutral mouth throughout. Natural puppy anatomy, four legs only, no extra paws, no limb detachment, no changing neck length or body size.

Animation contract: a relaxed four-beat WALK IN PLACE, not trot, hop or gallop. The complete dog will translate to the RIGHT at playback, so each planted paw must travel steadily BACKWARD/LEFT relative to its body during its support phase. Each lifted paw returns FORWARD/RIGHT on a LOW smooth arc, with natural elbow/knee bend, then makes soft contact at the front of its step. At almost every instant THREE paws support the body and ONE swings; never both forelegs lifted together. Fore and hind lift are staggered. Show plausible paw-flat support, toe-off, low passing, extension and touchdown. Keep grounded paw heights consistent for each near/far side; do not float supporting paws.

Precise single-cycle phase plan (not labels to draw):
Four paw identities remain attached consistently: near forepaw NF, far forepaw FF, near hindpaw NH, far hindpaw FH. Near/far paws may overlap briefly through natural occlusion, but exactly four legs exist.
ROW1 frames0–7: NF swings from its rear toe-off to its forward touchdown. NH,FH,FF stay grounded, sliding smoothly backward relative to the stable torso. In these eight consecutive drawings NF gradually lifts low, passes under shoulder, extends forward, lowers toward contact.
ROW2 frames8–15 CONTINUES the same cycle: NF is now planted forward and slides backward. FH swings from rear toe-off to forward touchdown in eight gradual low-arc intermediate drawings. NH,NF,FF remain grounded and moving backward. Do not reset other paw positions at this row boundary.
ROW3 frames16–23 CONTINUES: FH is now planted forward and slides backward. FF swings rear-to-front in eight gradual low-arc intermediate drawings. NH,NF,FH remain grounded and moving backward. NF and FF never swing together.
ROW4 frames24–31 CONTINUES: FF is now planted forward and slides backward. NH swings rear-to-front in eight gradual low-arc intermediate drawings. NF,FH,FF remain grounded and moving backward. Frame31 has NH about to touch forward and NF approaching rear toe-off; next frame0 is the matching continuation, not a new body pose.

Each paw's stance lasts24 phases and swing lasts8 phases. Whole cycle footfalls are NH at phase0, NF at phase8, FH at phase16, FF at phase24. Across a full support phase, a planted paw gradually moves about22px rearward relative to the body; swing returns smoothly about22px forward with only5–8px maximum lift. These distances are modest relative to puppy size. Neighbors differ by only a small phase step. Keep every supporting paw physically on its implied floor, but draw NO floor or shadow. First/last anatomical proportions and contact states must loop seamlessly.

Background: true transparent RGBA outside the animal. Clean soft fur alpha, no matte, haze, colored fringe, floor/shadow, props, scenery, grid lines, labels, numbers, letters, borders or text. Soft realistic plush3D quality matching the reference. All32 COMPLETE puppies must remain inside their own cells. The most important improvement is coherent planted/swing paw timing and smooth32-phase closure of ONE natural grounded walk cycle.

