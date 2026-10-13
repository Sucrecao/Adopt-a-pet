# Cat 32-pose whole-character gait asset

Generated with the built-in imagegen tool. Final source bytes were copied unchanged into `public/pets/cat-whole-v3-gait.png`; no background cleanup, per-part edits, resampling, compositing, or palette edits were applied to this production PNG.

## Source and provenance

- Identity reference: `public/pets/cat-whole-v2-motion.png` (RGBA, 1448 × 1086).
- Initial generation raw: `/Users/sucrecao/.codex/generated_images/01a12aa0-0575-7992-bd87-97c3c076dab6/exec-8de59c3b-3980-418a-ac35-54e651512000.png`.
- Initial SHA-256: `eca844bd6afb3fd99e34ac581853b4e4f28154964ef0984e5c7e9c0d4082f6be`.
- Final spacing-repair raw: `/Users/sucrecao/.codex/generated_images/01a12aa0-0575-7992-bd87-97c3c076dab6/exec-ee03530a-94ce-43cd-98b6-dc25b845a5c3.png`.
- Final SHA-256 (raw and project copy): `da8c790d8bdce190169a45e9af87cd55bcd30c246873c85c1dc41816205add55`.
- Actual dimensions: **1774 × 887**, exact 2:1; requested target was 2048 × 1024.
- RGBA alpha range: 0–255. Exactly 32 complete alpha32 connected animal contours, assigned one per eight-column/four-row slot. All 32 alpha32 contour masks are distinct.
- Sequence: local phases 0–31; intended metadata frame range 96–127.

## QA and registration

The first page had only a 12 px minimum horizontal neighbor gap and some animals crossed nominal cell boundaries. One targeted repair changed whole-sprite scale and placement; the final page has a 62 px minimum horizontal contour gap. Its median full-animal contour is 156 × 132 source pixels. All ears, tails and paws remain complete. Registration must use measured whole-animal contours, because the generated rows are spaced consistently but are not exactly on mathematical cell origins.

Actual alpha compositing on white and black is clean, including the padded whole crops at the proposed rendered scale. The transparent image viewer exposes colorful/white RGB from invisible pixels, which is absent in the opaque composites. Within each proposed complete crop plus 3 px margin, disconnected nonmain components contain **zero pixels at alpha32 and alpha128**. At alpha8 the maximum is seven pixels across four tiny components. These low-opacity pixels remain pristine.

Measured anchors are in `docs/gait32-cat-anchors.json`, under the `cat` object. `gaitEyes`, `gaitFarEyes` and `gaitFootY` use global frame keys 96–127. Every frame also records its local index, contour, padded crop, eye component bounds and pixel count. Near-eye coordinates are the pixel centroid of the leftmost substantial dark pupil/iris component within a verified face region; all32 crosshairs were visually checked. The foot baseline uses the last lower-body row containing at least eight alpha160 pixels, plus one.

One uniform factor **1.317384370015949 logical pixels per source pixel** matches the existing v2 gait's median rendered height (147 × 1.1829573934837094 = 173.8947368421053). For this 8×4 page, its renderer `page.scale` equivalent is **1.1411327501993622**. Use the near eye as the horizontal body landmark rather than whole-silhouette midpoint; a reasonable preview anchor is x184. Foot baselines are provided to assess contact around the existing ground y226. A fixed eye y106 was used for the QA loop only; this is a registration suggestion, not production metadata.

Lowest-paw grounding alone makes the rendered head range102.43–114.09px and jump9.65px at an adjacent pair. A measured hind-paw baseline alone still yields8.84px range and6.44px maximum jump, so it does not solve registration jerk. The anchor JSON now also supplies `gaitHindFootY` source measurements and **`gaitHeadY` destination targets**. Recommended targets use a circular nine-sample mean of the lowest-paw-grounded eye Y, recenter at108, and damp departures from the mean by0.45. This keeps the complete animal rigid while reducing the head bob to1.93px total and the largest adjacent move to0.579px, including the loop. This is a whole-frame registration correction; source pixels and anatomy remain untouched. The source's differing projected forepaw depth means its lowest forepaw then varies around219–232 logicalpx. A perfectly fixed head and perfectly fixed lowest paw cannot both be recovered from these generated poses without modifying anatomy. Actual grounded playback should be reviewed with that limit in mind.

Visual boundary comparison reviewed 7→8, 15→16, 23→24 and 31→0 after a uniform scale and near-eye alignment. The tail, face and torso retain their identity; leg positions differ through the low walking poses without doubled or disconnected limbs. Small source variation in torso angle/volume remains, especially between rows; image generation did not produce mathematically exact anatomical interpolation. The page should be assessed in the actual displacement-driven renderer before claiming that all perceived awkwardness is removed.

A silhouette adjacency audit supports the seam assessment without treating it as proof of paw anatomy: median whole-contour change 7.61%, maximum14.28%; the 31→0 seam is 6.94%. Row boundaries are 8.39%, 9.55%, and9.50%, below the worst ordinary adjacent pair. Lower-body contour change at31→0 is11.97%, effectively the ordinary median11.98%.

QA artifacts (derivatives only; production source remains untouched):

- `.artifacts/cat-gait32-final-white.jpg`, `.artifacts/cat-gait32-final-black.jpg`: whole-page opaque composites.
- `.artifacts/cat-gait32-eye-landmarks.jpg`: all32 measured near-eye crosshairs.
- `.artifacts/cat-gait32-eye-anchored-boundaries.jpg`: rendered-size row and loop boundaries.
- `.artifacts/cat-gait32-eye-anchored-loop.gif`: complete32-pose visual QA loop at60ms per pose.
- `.artifacts/cat-gait32-smoothed-head-contact-sheet.jpg`, `.artifacts/cat-gait32-smoothed-head-loop.gif`: all32 complete poses with the recommended low-amplitude cyclic head registration.
- `.artifacts/cat-gait32-alpha-qa.json`: disconnected alpha components within complete crop margins.
- `.artifacts/cat-gait32-adjacency-qa.json`: every adjacent silhouette comparison and seam.
- Initial-candidate composite/loop/contour evidence uses `.artifacts/cat-gait32-candidate-*`.

## Exact generation prompt

```text
Use case: identity-preserve.
Asset type: production whole-character cat walking animation atlas for a realistic plush desktop companion.
Input image 1 is the accepted CAT whole-character motion page. Use it ONLY as the exact character identity/material/camera reference, especially its walking rows. Preserve this exact silver British shorthair kitten: pale silver-grey fur with subtle soft stripes, rounded young kitten proportions, green eyes, pink nose, full upright softly curled tail, small rounded ears, short natural neck. Preserve realistic soft plush fur and clean photographic lighting, not a cartoon. This new page contains walking only.

Produce ONE truly transparent RGBA atlas page with EXACTLY EIGHT columns and FOUR rows: 32 populated complete kittens in regular square cells, read strictly left-to-right across each row then next row. Wide 2:1 canvas, target 2048×1024, regular 256×256 cells. No text, numbering, grid, floor, shadows, props, background or boxes. Place one complete animal in every cell, centered consistently with generous transparent gutters: complete tail, ears and paws at least24px inside every cell edge. Same physical character scale in every cell, around185px wide and180px high. Ground line y224 within each cell; never independently enlarge a pose to fill its cell. Exact same right-facing body profile and slight three-quarter face camera as the supplied walking reference, same head shape and eye locations, same torso length/volume and same tail curl throughout. Torso/head anchor stay constant with only 1–3px gentle natural weight-transfer bob, no forward translation, no zoom, no camera rotation.

The entire sheet is ONE coherent 32-phase natural slow four-beat CAT WALK in place facing RIGHT, not four separate row animations. Each image is a genuinely new small intermediate anatomical pose. Row1 contains phases0–7, row2 phases8–15, row3 phases16–23, row4 phases24–31. Continue smoothly across 7→8,15→16,23→24, and31→0. Frame31 is the natural adjacent phase just before frame0, not a duplicated first pose. Lock fur identity, silhouette volume, head expression and lighting while only the complete animal's joints change naturally.

Use exactly FOUR organic legs/paws, consistently identifiable near and far forepaws and near and far hindpaws in every phase. Natural four-beat support order, offset by eight phases: near forepaw contacts forward at phase0; far hindpaw contacts forward at phase8; far forepaw contacts forward at phase16; near hindpaw contacts forward at phase24, then near forepaw again at0. Each paw spends roughly20 phases planted and12 phases swinging. During planted support, each paw moves progressively BACKWARD relative to the fixed torso, as it would stay fixed on the floor while the real cat walks RIGHT. During recovery, the lifted paw bends organically at elbow/knee and advances FORWARD along a compact low arc, then lowers gently into contact. Never freeze a planted paw at the same torso coordinate throughout the sheet; never drag a lifted paw backward. Stance and recovery alternate smoothly with clear near/far leg layering, natural cat hindpaw tracking into the former forepaw location. Opposite paws must not teleport, swap identity or sprout extra limbs. Keep at least two paws supporting at every phase, normally three; this is a walk, no trot/run/hopping and no phase with all paws airborne. Soft shoulder/hip weight transfer follows the supporting paws, tail has tiny natural inertia with its overall curl unchanged. No doubled legs, merged feet, detached paws or impossible joints.

Production animation inbetweens, exact same complete kitten in all32 cells, 32 distinct contours with small continuous changes. Anatomical walking trajectory and seamless cyclic progression are more important than dramatic pose differences. Preserve true background transparency and all source alpha, no opaque white outline or background speckles.
```

## Exact targeted spacing repair prompt

```text
Use case: precise-object-edit.
Edit target: the supplied 32-frame CAT WALKING atlas.
Change ONLY uniform sprite size and cell placement to repair insufficient transparent gutters. Preserve all32 EXACT existing complete kitten poses, their detailed paw positions, their row-major sequence, each kitten's exact silver plush fur/green eyes/pink nose, anatomy, expression, camera and tail. No redrawing of the gait or stylistic redesign.

Keep ONE wide2:1 RGBA atlas with EXACTLY EIGHT columns and FOUR rows, all32 cells populated. Shrink EVERY complete kitten uniformly to78% of its current physical size, identical scale factor across all32 poses, preserving aspect ratio. Recenter the32 complete animals in regular equally sized square cells. Their complete contours must stay at least25–30px away from all four sides of their own cells, including entire tail tip, ear tips and forward/rear paws. Keep shared body/head anchors aligned within every cell and consistent planted-paw ground level. Preserve only the intended small natural weight-transfer bob; do not independently resize or vertically fit each pose. At least35–45px fully transparent clear gap between neighboring animals. No animal crosses into another cell, no clipping, no leftover neighboring fragments.

Same32 anatomical intermediate walking poses, same continuous phase order0→31→0, preserve full near/far paw layering. This is exclusively a padding/layout correction to the supplied atlas. Preserve realistic soft photographic plush material exactly. Truly transparent background, no floor/shadow/grid/text/numbers/boxes/props and no opaque matte fringe. Target2048×1024, but keep exact2:1 aspect ratio and8×4 layout.
```


## Rejected source-geometry repair candidate

A further targeted source repair was authorized after runtime QA showed that smoothing the head leaves a discontinuous lowest-paw plane. The candidate was **rejected** and did not replace the accepted project PNG or its anchors.

- Raw: `/Users/sucrecao/.codex/generated_images/01a12aa0-0575-7992-bd87-97c3c076dab6/exec-5669f120-f856-4c9d-a109-10b31085a4d1.png`.
- SHA-256: `e3ebedf5e85b60f2f278b26ea6768233301e887d23ebbabea397c02d91b2f686`.
- RGBA1774×887,32 complete contours, median contour163×137 sourcepx.
- Same measured near-eye/opaque-support-paw algorithm as the accepted anchors.
- Near-eye-to-support-sole distance ranges89.8070–97.4035 sourcepx.
- With the accepted uniform rendering factor, grounding the lowest sole produces a **10.0075px maximum adjacent head jump**, at15→16; accepted source was9.6498px. Candidate loop jump31→0 is3.2156px.
- Recalibrating the uniform factor to the candidate's larger median height still leaves approximately9.64px maximum adjacent change, so it does not satisfy the requested≤2px criterion.
- Candidate contact-sheet review shows continued phase-dependent forepaw extension/length and row camera-volume differences. More distinct poses do not establish anatomical continuity.
- Evidence: `.artifacts/cat-gait32-geometry-candidate-qa.json`, `.artifacts/cat-gait32-geometry-candidate-contact-sheet.jpg`, `.artifacts/cat-gait32-geometry-candidate-loop.gif`, plus candidate white/black composites and a pristine candidatePNG copy.

Exact additional targeted prompt:

```text
Use case: precise-object-edit / identity-preserve.
Edit target is the supplied accepted32-pose silver British shorthair CAT WALK atlas. Produce ONE corrected candidate. Keep the exact same realistic plush silver-grey kitten identity, green eyes, pink nose, short natural neck, rounded young body proportions, soft fur/stripes, ears, upward-curled tail, photographic lighting, true RGBA transparency and generous clear spacing. Keep eight columns and four rows on the same wide2:1 canvas, all32 cells populated with one COMPLETE right-facing kitten each. Do not add/remove cells or introduce text, grids, floors, shadows, props or background. Preserve good alpha edges, no invisible speckles or matte outlines.

Concrete defect to fix: the supplied phases change projected leg length and torso/camera angle, so anchoring the head makes the support soles jump about10 rendered pixels; anchoring the soles makes the head jerk instead. Correct this SOURCE geometry. Every phase must share one fixed camera and the same anatomical volume. All32 kittens have exactly the same camera: right-facing three-quarter SIDE PROFILE, no gradual yaw toward/away from viewer, no row-based perspective change. The head/eyes/ears, torso length, shoulder/hip heights and tail volume remain fixed; upper body changes only an extremely small1px weight-transfer bob. Fur identity stays exact.

CRITICAL measurable geometry across ALL32 cells: the center of the near large green eye stays at the SAME HEIGHT above the planted support-paw plane, approximately90 SOURCE pixels, with no more than1px difference between consecutive phases or at31→0. Each cell uses the SAME logical ground line and head height. At least two planted paws always support the kitten at that same ground plane; the lowest opaque planted sole stays on that shared line within1 SOURCE pixel. Forepaw support soles may NOT sink lower or grow longer than the other support paws. Hindleg and foreleg lengths must remain anatomically constant at every phase. Do not shorten/lengthen torso or legs to change stride. Keep the paws complete, small and natural with short rounded toes.

Make one smooth natural FOUR-BEAT CAT WALK,32 genuinely distinct intermediate anatomical poses, read row-major continuously0→31→0. Row1 is phases0–7, row2 phases8–15, row3 phases16–23, row4 phases24–31; no row resets. Correct supporting/passing leg poses while retaining the current soft modest stride character. Exactly four organic legs: near fore, far fore, near hind, far hind, consistent occlusion and identity. Contact order: near fore0, far hind8, far fore16, near hind24, then near fore0. Stance paw slides steadily BACK relative to the fixed torso, as if the kitten progresses RIGHT across the floor; swing paw bends and advances FORWARD in a tiny low3–5px recovery arc. No exaggerated reaching, no all-paws-raised pose, no trot, no doubled/merged legs. Normally three supporting paws, at least two always. The lower-leg contour movement between any two consecutive phases should be a small natural step, not a new pose with a large sole jump. Final31 leads naturally into0 with the same physical limb lengths, volume, camera and support plane.

Preserve current compact animal size and generous gutters (current animals around156px wide by132px high at1774×887 page size); source anatomy is not enlarged. Keep at least25px transparent clearance around each complete kitten and about60px between neighboring bodies. The repair is coherent complete-animal pose correction, not ghosting, blending, detached body pieces, body-part compositing or style change. Priority: constant near-eye/support-sole distance and continuous small correct walking intermediates over dramatic stride or pose differences.
```


