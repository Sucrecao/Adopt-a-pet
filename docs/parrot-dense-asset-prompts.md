# Parrot dense animation artwork

Generated on 2026-10-11 with built-in imagegen and `transparent_background:true`. The inspected identity reference was `public/pets/parrot-whole-v1.png`: the accepted realistic plush grey-and-white cockatiel with yellow face/crest and orange cheek disks. No CLI/API fallback, pixel cleanup, resize, alpha repair or source-image compositing was used for final artwork. Selected PNGs were copied unchanged from their raw generated output paths.

## Selected files and measurements

| Page | Saved sibling | Size / mode | Whole alpha≥32 contours | SHA-256 |
| --- | --- | --- | --- | --- |
| Motion | public/pets/parrot-whole-v2-motion.png | 1448×1086 RGBA | 48 | 2dc8b44d77677c1855f6a2507d92966b4de9dbfaadfa3cec902ade3e70f51c3d |
| Care | public/pets/parrot-whole-v2-care.png | 1448×1086 RGBA | 48 | 3588d7f14b3ba281e678bf3f713efc6786f169a947034671f178f081cefafb60 |

Both pages have exactly one complete alpha contour per row-major 8×6 cell, no missing cells and no neighbor bounding-box overlaps. The source cell pitch is 181px. After targeted repairs, minimum gaps between neighboring visible bounding boxes are 3px on motion and 1px on care. Complete neighbor-aware crops retain minimum transparent alpha32 contour moats of 3px/1px respectively. Some complete contours extend across their nominal cell boundary (minimum nominal margin motion −22px, care −39px), so registration must use measured complete contours and neighbor-aware transparent padding rather than blindly crop rectangular cells. The requested 20px cell moats were not fully achieved by imagegen; this limitation is explicitly reported, not hidden by altering pixels. Deterministic dense registration checks complete crops and canvas fit.

Opaque QA was performed by compositing read-only analysis copies onto a warm opaque background in /private/tmp. It confirmed realistic identity, complete cutouts and improved landed crouch at global frame88. Targeted care edits further improve groom recovery at global69/70 and sleep settling at92; motion12 now remains fully tucked to join the sleep bridge and rest13–15. It does not change the final PNG files. Feed peak→recovery retains a larger pose step for actual-size playback review. Turn frames include several close frontal/left profiles rather than equally separated camera yaw. All sixteen selected flight poses face right; no per-frame mirrors are needed for this page. Despite targeted edit requests, imagegen changed pixels throughout each page; all flight anchors were remeasured and both pages re-registered.

## Exact index contract

Motion page: idle0–11, rest12–15, flight16–31, grounded right-to-left turn32–47. Care page (global indices): pet48–55, feed56–63, groom64–71, stretch72–79, hop80–89, standing-to-sleep bridges90–93, half-wing near-hover locomotion bridge94, neutral perched locomotion bridge95.

Final verification: `python3 scripts/register-dense-atlas.py --species parrot` and `python3 scripts/register-dense-atlas.py --species parrot --check` both passed with these selected hashes and 96 registered complete frames. All crops fit the 256×256 canvas. Registered page factors are 1.1077805291281113 pixels/source pixel (motion) and 1.1536197234368606 (care), preserving a consistent neutral apparent size across pages. Updated flight annotations are saved in `docs/dense-motion-registration.json`.

Opaque rendered QA artifacts: `.artifacts/parrot-v2-registered-contact-sheet.png` contains all96 frames as independent256×256 square cells (2048×3072 sheet); `.artifacts/parrot-v2-continuity-contact.png` contains groom64–71 and sleep90–93→12–15 (2048×512 sheet). Rendering uses one uniform affine scale per page without stretching a crop to a square. The inspected target sequence improves69/70 recovery and keeps93→12 tucked.

## Flight registration evidence

The following source-global eye centers belong to motion frames16–31 in order. They were measured from the largest compact dark eye component in the right-facing face region, with alpha>180 and max(R,G,B)<70. Each selected eye component contains42–56px; tiny nearby dark feather components were excluded. Use a consistent eye target to stabilize the whole bird rather than its changing wingtip. No artwork was changed.

```json
[
  [
    153.12,
    456.37
  ],
  [
    336.63,
    456.58
  ],
  [
    512.04,
    461.64
  ],
  [
    693.45,
    466.53
  ],
  [
    877.62,
    468.7
  ],
  [
    1053.22,
    472.69
  ],
  [
    1232.7,
    473.64
  ],
  [
    1411.5,
    468.96
  ],
  [
    177.11,
    646.71
  ],
  [
    352.75,
    642.77
  ],
  [
    530.46,
    641.56
  ],
  [
    705.88,
    639.02
  ],
  [
    883.56,
    633.23
  ],
  [
    1061.58,
    638.42
  ],
  [
    1246.2,
    632.72
  ],
  [
    1404.56,
    632.62
  ]
]
```

## Targeted continuity repair

Two independent built-in edits were requested in parallel after registered sequence review. Candidate siblings were retained as `public/pets/parrot-whole-v2-care-targeted-candidate.png` and `public/pets/parrot-whole-v2-motion-targeted-candidate.png`. After opaque inspection confirmed improvement and read-only contour analysis verified 48 complete safe crops each, they were copied byte-for-byte to the final selected filenames. No pixels were combined or surgically replaced by code.

Care raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-9db9-7452-9e10-cda94006a8f7/exec-d436e903-0fd6-4e26-8e52-8ecf6ff57998.png`

Care SHA-256: `3588d7f14b3ba281e678bf3f713efc6786f169a947034671f178f081cefafb60`

```text
Use case: precise-object-edit / identity-preserve.
This image is a production8×6 transparent RGBA atlas of48 realistic plush grey cockatiels. Make a highly targeted edit to ONLY THREE specified cells. Preserve all other45 birds exactly in pose, feather detail, scale, lighting, location, tail, feet, alpha and spacing. Same1448×1086 landscapegrid, noextraobjects, text, shadows orfloor. Do not redraw/reorder othercells.

Cells count from zero in row-major order. Change local21 (row3,column6, pixelcell x905–1086/y362–543), local22 (row3,column7, x1086–1267/y362–543), and local44 (row6,column5,x724–905/y905–1086) ONLY.

GROOM RECOVERY: row3cell5/local20 is the low tucked/preening bird. It currently jumps immediately to neutral at row3cell6/local21. Replace local21 with a genuinely partial untucking pose: head remains LOW beside the folded wing, beak is just rising out of grey wing feathers, neck relaxed, eye half-open, yellow crest still tilted forward/low. Torso remains softly crouched with toes planted and tailleft. It must visually sit halfway between the tucked cell5 bird and an upright bird.
Replace local22 with the NEXT gradual recovery: head is almostupright but still lower/moreforward than finalneutral local23, beakturningRIGHT, crest partiallyraised, torsoalmostrecovered. Do not make local21 or22 fullyneutral. The progression20→21→22→23 must clearly show tucked→halfuntucked→almostupright→neutral, with small natural anatomical changes.

SLEEP SETTLING: local43/row6cell4 is the lowhead sleepy bird; local45/row6cell6 is fullytucked low sleepingbird. Replace local44/row6cell5 with a true intermediate HALF-TUCKED sleepy bird: softlycrouchedlowbody, headalreadyfolding halfway INTO its nearwing, greybeak partlyhiddeninfeathers, eyesclosed, yellowcrestrelaxedsideways and low. It must be visibly lower and moretucked than local43 but notfullytucked as local45. Toes staygrounded, tailleft, wholebody remainscomplete.

Keep exact accepted identity: tiny fluffy grey-and-white cockatiel, yellowface/crest, orangecheekdisk, finelyrealistic feathers and greybeak, nevercartoon. Keep all three edited birds complete and isolated fromneighbors, with transparent cropmargins. Keep all other45birds and rowarrangement unchanged. No changesoutside these THREE cells.
```

Motion raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-9db9-7452-9e10-cda94006a8f7/exec-0eb39f2b-1c34-481a-9c7a-ac722cb5b489.png`

Motion SHA-256: `2dc8b44d77677c1855f6a2507d92966b4de9dbfaadfa3cec902ade3e70f51c3d`

```text
Use case: precise-object-edit / identity-preserve.
This is a production8column×6row transparent RGBA atlas of48 realistic plush cockatiels. Make ONE targeted change to localframe12 ONLY: row2,column5 (the fifth cellinsecondrow, zero-basedindex12, cell x724–905/y181–362 in1448×1086image). Preserve everyother47wholebird exactly in pose, feather detail, scale, lighting, gridlocation, alpha and spacing. Especially preserve the entire16phase right-facingflight cycle at indices16–31 unchanged. No newframes, text, shadows, floor orprops.

Current frame12 is upright with its eyesclosed; this makes sleepentry pop upright. Replace frame12 with a FULLY TUCKED, LOW SLEEPING pose matching its immediate rightneighbors13,14,15: same tiny grey cockatiel body gently crouchedlow, head nestled into its near grey wing, greybeak tuckedinto feathers, yellowcrest folded/relaxedlow, eyeclosed, orangecheek partlyvisible by wing. The bird is a complete curledperching sleeper with tailtoLEFT and delicate toesgrounded, samebodyvolumeandfeatherdetail. Frame12 must be compatible with fullytucked lastsleepbridge and nextsleepframe13, with only a subtle breathingvariation. It must NOT be an upright eyesclosed neutralperch.

Keep exact accepted realistic plush grey/whitefeathers, yellowfacecrest/orangecheekidentity and genuine RGBAtransparentbackground. Whole edited bird fitsfullyinsidethesamecellwithtransparentmargins; nocroppedtail/crest/toes, noneighborfragments. Edit ONLY row2cell5/frame12; allother47birds includingflight16–31 mustremain unchanged.
```


## Generation provenance and exact prompts

### Initial motion candidate

Rejected: flight frames27–31 face left; turn resolves too early.

Raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-9db9-7452-9e10-cda94006a8f7/exec-fc850a1a-f1bb-467a-9013-c83a751d5814.png`

SHA-256: `e189f70a271c560e589e14a0de9f29e7cafeb9821fb6d7e2c84f0e446a0a25e3`

```text
Use case: identity-preserve.
Asset type: production whole-character animation atlas, PARROT motion page, 8 columns × 6 rows.
Input image 1 is an IDENTITY AND REALISTIC PLUSH MATERIAL reference only. Preserve exactly the same small grey-and-white cockatiel, buttery yellow face and tall swept yellow crest, orange cheek disks, dark bright eyes, grey beak, soft finely detailed grey feathers and long grey tail. Never change into a green parrot, a cartoon, a toy illustration or a different bird.

Create a NEW pristine transparent RGBA atlas. Exactly 48 complete birds, one per cell, arranged in exactly 8 equally spaced columns and 6 equally spaced rows on a landscape 4:3 canvas. Every cell has identical camera, soft studio light and species scale. No labels or cell borders. Entire crest, wings, feet and tail must remain wholly inside each individual cell. Leave at least 20 pixels of true transparent moat all around every bird, including fully spread flight wings. No floor, shadows, objects, checkerboard graphics, cropping, duplicates, fragments in adjacent cells or touching animals. Use high-resolution feather detail and the same plush realism as the reference.

Exact row-major choreography:
ROW 1, cells 1–8: idle poses 0–7, first eight phases of ONE subtle 12-pose breathing/blinking cycle, right-facing neutral perched stance. Body height/volume changes gently, calm eye open→half closed→closed→half open. This is one stable bird with tiny increments, not eight different expressions.
ROW 2, cells 1–4: idle poses 8–11, finish that same breathing/blinking cycle returning gradually to the exact shared neutral pose of pose0, eyes open and wings folded.
ROW 2, cells 5–8: rest poses12–15, four consecutive phases of quiet sleeping breathing, body low and softly tucked, head nestled in folded wing, crest relaxed. The fourth sleep breath joins the first gently.

ROWS 3 AND 4, cells1–8 then1–8: flight poses16–31, a SINGLE coherent 16-phase wingbeat cycle traveling right. All sixteen faces, beaks and eyes point RIGHT; tail points LEFT, stable body angle and torso position and stable head/eye height. Wings gradually descend from raised, pass halfway down, sweep down/back, reach the low stroke, fold slightly on recovery, then gradually sweep up/forward and return near the raised start. Each frame is a TRUE slightly different intermediate complete body pose. Across the row break pose23→24 is merely the next small wingbeat step; pose31→16 closes the wing cycle. Do not alternate front/side views. Do not swap body orientation or wings suddenly. No front-facing, left-facing, standing or sleeping bird anywhere in these sixteen cells. Wing change is gradual and physically coherent, while face, torso, tail, lighting and scale stay stable.

ROWS 5 AND 6, cells1–8 then1–8: turn poses32–47, a SINGLE gradual 16-pose grounded RIGHT-to-LEFT full-body turn. Starts from shared neutral right-facing perched stance, rotates the whole complete bird incrementally through three-quarter right, near frontal, frontal at middle, three-quarter left, then finishes at shared neutral left-facing perched stance. Only small planted foot transfers, stable grounded sole baseline, same scale, no torso crossfade or disjointed feathers. At row5→row6 the body continues its small rotation without a reset. Sixteen true angular intermediate poses; do not repeat eight poses.

Critical identity invariants: small fluffy realistic grey cockatiel, yellow crest/face, orange cheek disks, delicate feet; fixed plush material/face/body proportions throughout. Critical grid invariant: 48 birds exactly, all cells occupied once, generous blank transparent gutters, no text. This atlas is for refined animation: coherence and small consecutive changes matter more than varying expressions.
```

### Motion repair candidate

Rejected: left-facing flight pattern persisted. Complete-crop metadata mirroring is feasible, but a later candidate avoids it.

Raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-9db9-7452-9e10-cda94006a8f7/exec-05068615-d868-4b1d-b28c-9a4cdf8a95db.png`

SHA-256: `acd90fcd1a224714cfe441f91c240ff647421ea1e02ab00e444e0a8aea433f71`

```text
Use case: identity-preserve. EDIT IMAGE1, the newly generated 8-column × 6-row cockatiel motion atlas. IMAGE2 is only the accepted old atlas for exact realistic plush grey/yellow/orange cockatiel identity.

Retain this exact realistic fluffy bird, fine feathers, soft studio light, alpha transparency, 8×6 grid and 48 whole birds. Keep idle/rest choreography in the first two rows. Correct only the animation choreography in rows3–6, plus increase transparent gutters for EVERY complete bird. Uniformly make ALL birds slightly smaller within their cells, keeping consistent species scale, so every entire crest/tail/wing stays inside its own cell with at least20 source pixels of empty transparent margin. No cropped feathers, shadows, floor, colored glow, objects, cell lines or labels.

MANDATORY FLIGHT FIX — rows3 and4 together must be ONE sixteen-step RIGHT-FACING wingbeat. The existing later row4 images incorrectly face LEFT. Replace them with the SAME right-facing head, eye, beak, torso and leftward tail as row3cell1. Every single flight beak points to the RIGHT edge of its cell, tail points toward LEFT edge; no orientation swap at any point. Keep face/head/body angle and head/eye height stable across all16. Only the complete wings gradually change through their natural cycle; render intact birds, not separate glued parts.
ROW3 cells1–8: raised wing, slightly lowered, 1/4 lowered, half lowered, 3/4 lowered, almost low, low forward stroke, fully low stroke.
ROW4 cells1–8: low recovering wing, low/back recovery, partly recovering, halfway raised, 3/4 raised, nearly raised, raised, close to the opening raised pose.
At row3cell8→row4cell1 only a small wing change. At row4cell8→row3cell1 a small wing change. All16 bird bodies face RIGHT with the same plumage markings, scale, torso position, eye/face height and tail; no different camera view, no reversed head.

MANDATORY TURN FIX — rows5 and6 together must be ONE continuous16-step grounded turn, starting right-facing and finishing left-facing. Do NOT finish the turn in row5 and repeat side views in row6.
ROW5 cells1–8: right-facing shared neutral perch; tiny body rotation inward; slightly more inward; right three-quarter; slightly more toward front; near front right; very nearly frontal right; almost frontal but still faintly right.
ROW6 cells1–8: almost frontal but faintly left; very nearly frontal left; near front left; left three-quarter; slightly more left; near left profile; almost left profile; shared left-facing neutral perch.
Each of these16 angles is distinct. Whole skull, beak, chest, folded wings, tail and feet rotate coherently in small increments. Eye count and cheek visibility follow the camera angle naturally. Stable sole baseline, tiny planted foot transfer, identical body volume. No repeated pose rows, crossfade, limbs detached or extra bird silhouettes.

There must be exactly48 complete isolated realistic plush cockatiels in a regular8×6 atlas, with genuine transparent RGBA background and generous transparent cell moats. Identity must remain the original small grey-and-white bird with buttery yellow crest/face and orange cheek disks, never cartoon.
```

### Motion page before targeted sleep repair

Initially selected and copied byte-for-byte; superseded by the targeted continuity repair documented above.

Raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-9db9-7452-9e10-cda94006a8f7/exec-056132b5-7e82-4d14-8bef-d94164f8df43.png`

SHA-256: `84e572204e8c76f56dd925cc4798432b75489f9bb8a3ccaba18d29cbc72e0cc4`

```text
Use case: identity-preserve. Generate a completely NEW dense motion atlas, using the provided OLD atlas ONLY to identify the small realistic plush grey cockatiel with yellow crest/face and orange cheeks. Do NOT reproduce its rows or motion ordering. Fixed soft studio light, fine natural fluffy feather detail, same grey/white/yellow/orange identity, realistic material. Not cartoon, drawing, pixelart or a green parrot.

Make a new 8column×6row regular square-cell atlas,48 isolated whole birds exactly. Transparent RGBA background. All48 birds uniformly fit inside the center70% of their cell, at least20px true transparent moat per side. Scale/body volume is constant; keep every crest, tail, toe and wing complete and separated from all neighbors. No floor, shadows, props, borders, text or labels.

STRICT ROW MAP:
ROW1: idle1–8 of a12phase subtle breathing/blinkcycle, head facingRIGHT, folded wings.
ROW2 first4: idle9–12 finishingtheblink and returning neutral.
ROW2 last4: four tucked sleepingbreathphases.
ROWS3–4: one16phase flightcycle. EVERY bird in BOTH these rows has its beak pointedRIGHT and its tail extendingLEFT. EVERY frame has the exact same right-facing head/body profile, same sole visible cheek, same bodyangle, same face/eye height, same tailangle; wingchanges only. Never create aleft-facing bird in these rows. Never rotate thebody at all. Think of the identical body pose repeated sixteen times while coherent near/farwing positions advance by small increments.
Flight phaseorder, row3lefttoright thenrow4lefttoright:
1high wing aboveback,2slightlylower,3aquarterdown,4one-third down,5halfdown,6twothirds down,7almostlow,8lowstroke;
9fullylow,10lowbeginningrecovery,11quarterrecoveredback,12halfrecovered,13twothirdsraised,14nearlyhigh,15high,16justbelowthestart high.
The wingbeat loops from16to1 with a small change. At row3last→row4first no reset. For ALL16: faceRIGHT/tailLEFT, ONE camera profile, neverleft/front view, no bodyflip or orientation swap.

ROWS5–6: one16phase GROUNDED whole-body RIGHT-to-LEFT turn. Allfeet staygrounded, wingsfolded, torsoandheadrotate together, tiny foot transfers, fixed bodyvolume. Exactly sixteen genuinely different angles spaced across two rows; do not finish in one row.
Use these yawangles relative tofrontcamera:
row5cells1–8: +55,+47,+39,+31,+23,+15,+7,+2degrees. Row5 starts right-facing neutralperch and ends almostfrontal but slightlyRIGHT.
row6cells1–8: -2,-7,-15,-23,-31,-39,-47,-55degrees. Row6 begins almostfrontal but slightlyLEFT and ends left-facing neutralperch.
Beak direction, cheek visibility, numberofvisibleeyes, folded-wing perspective andtail placement must vary gradually following these angles. Keep the rowbreak nearfrontsmall. Do notrepeat eight leftprofile birds inrow6.

Common standingneutral: tiny realistic plush cockatiel with foldedwing, finefeathers, upright relaxed crest, rightfacingbeak, tailleft and delicate toes; shared idlefirst/lastandturnstart. Sleep is lowheadtuckintowing. Flight is the SAME animal with stablebody/head profile and graduallyflappingwings. 48 complete animals exactly, grid8×6, uniformlycontained central70% cells with generousalpha gutters. Transparentcutouts, no text or objects.
```

### Initial care candidate

Rejected: hop pose88 was wing-up flight rather than landing crouch; spacing/recovery repair requested.

Raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-9db9-7452-9e10-cda94006a8f7/exec-7bb7c5c7-7283-44f2-8a69-e9ff2f54f9d1.png`

SHA-256: `a1b368c201ca9431624328f734a3935aa93ba61979677e063ccb6fc725d98cb4`

```text
Use case: identity-preserve.
Asset type: production whole-character animation atlas, PARROT CARE page, 8 columns × 6 rows, exactly48 complete birds.
IMAGE1 is the accepted original cockatiel identity. IMAGE2 is a new motion page, used ONLY as realistic plush material/face/shared neutral perch and tucked sleeping pose reference. Create a NEW care atlas; do not copy its choreography.

Preserve the exact small fluffy realistic grey-and-white cockatiel with buttery yellow face and swept yellow crest, orange cheek disks, dark eyes, grey beak, delicate toes and long grey tail. Same fine feather detail, realistic soft plush texture, body proportions, fixed camera, lighting and scale as the inputs. Never cartoon or a different species.

Canvas: landscape4:3, a precise regular8-column ×6-row grid with EXACTLY48 birds. Each complete bird belongs wholly to one cell. Same species scale everywhere; allow at least20–25 source pixels of true transparent empty moat on all sides even for spread wings or airborne hop. Crest, tail, wings and toes all contained, no overlap with neighboring cells. Actual transparent RGBA, no floor, no shadows, glow, objects, text, row labels, grid lines or drawn checkerboard.

Standing neutral stance shared with the motion page: small right-facing perched cockatiel, folded wings, head/beak looking RIGHT, long tail extending LEFT, feet planted on a common sole baseline. Every ordinary care cycle starts and ends in this compatible neutral stance, with only subtle natural variation. Each cell is a genuinely different consecutive intermediate WHOLE animal pose, never copied duplicate frames or a collage of separate body parts.

EXACT ROW-BY-ROW CHOREOGRAPHY:
ROW1 (8 cells), PET response poses48–55: neutral open-eyed perch → barely lift/relax chest → gently bow head with half-closed eye → content head dip and relaxed crest → enjoy a slightly deeper soft head bow, eyes nearly closed → gently lift head → reopen eye and recover posture → calm neutral perch matching the start. Small gradual movements, same body size and folded wings.
ROW2 (8 cells), FEED poses56–63: neutral → slightly lean head forward → begin lowering beak → gently dip beak toward toes → deepest mild nibbling bow, beak slightly open → raise head halfway → raise almost neutral and close beak → neutral. No food bowl, seeds or props. A complete smooth peck/chew/recovery cycle that joins its next repetition in neutral stance.
ROW3 (8 cells), GROOM poses64–71: neutral → turn head gently toward near shoulder → slightly lower beak toward folded wing → begin preening near wing feathers → softly preen/touch feathers → lift head from wing → rotate head back almost neutral → shared neutral perch. Gradual anatomically plausible neck motion with continuous whole body and feet.
ROW4 (8 cells), STRETCH poses72–79: neutral → subtly crouch → lengthen body forward a little → partly extend near wing and tiny rear foot → full relaxed stretch with one wing extended backward and one leg stretched, whole bird still grounded → retract halfway → recover nearly upright → shared neutral perch. No scale growth, detached wings, or sudden unrelated pose.
ROW5 (8 cells), HOP first8 poses80–87: neutral → slight crouch → deeper anticipation crouch → toes pushing off → low airborne whole bird → medium airborne rise → gentle top of hop → descending toward ground. All complete bodies face RIGHT, consistent scale, knees/feet coherent; wings partly spread only for balance. Feather detail preserved. Raise the whole bird gradually above the common sole baseline rather than change its size.
ROW6 cells1–2, HOP last2 poses88–89: soft landing with bent legs → fully recovered shared neutral right-facing perch. These continue directly from row5cell8 and end the 10-pose hop cycle.
ROW6 cells3–6, SLEEP SETTLING bridge poses90–93: right-facing neutral perch starting to relax → gentle crouch and crest softens → lower body farther while head begins tucking into near wing → fully low, curled/tucked sleeping bird matching the motion page's restful tucked pose. Four genuine gradual intermediate whole bodies, no sudden appearance change. They will be reversed to wake.
ROW6 cell7, LOCOMOTION bridge pose94: right-facing bird just above the perch, wings HALF extended with stable horizontal body/head angle between grounded neutral perch and flight; tail LEFT, beak RIGHT, feet slightly dangling. This is the half-way landing/takeoff posture.
ROW6 cell8, LOCOMOTION bridge pose95: shared neutral right-facing grounded perch with folded wings. Cell7→cell8 provides gentle landing; the pair reverses for takeoff.

Critical: EXACTLY8columns6rows48isolated whole animals, consistent tiny realistic plush grey/yellow/orange cockatiel identity, transparent gutters, complete anatomy, no floor/shadow/props/text. All active care loops recover neutral to avoid a snap when they end; consecutive action poses change in small coherent increments.
```

### Care page before targeted continuity repair

Initially selected and copied byte-for-byte; superseded by the targeted continuity repair documented above.

Raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-9db9-7452-9e10-cda94006a8f7/exec-20c786ea-d149-4e58-97a0-ac809fb15853.png`

SHA-256: `30d4d289b198bc00915857f73cdd82c528be001b8cf16e9982dc22323ffc4c5a`

```text
Use case: identity-preserve. EDIT image1, this realistic plush cockatiel CARE atlas. Preserve exact grey-and-white feathers, yellow face/crest, orange cheeks, fixed plush realism, identity,48 birds,8columns6rows, and all row meanings. Image2 is only original identity reference. Retain true transparent RGBA.

Two corrections only: generous centered cell spacing and recovery intermediate poses.
1. All48 birds must be uniformly about18% smaller and CENTERED within their own equal181×181-equivalent cells. Each complete outline must fit within the central140×140 area of its cell, leaving AT LEAST20 true transparent pixels around crest/tail/wings/feet even on spread-wing poses. Use one consistent scale across every bird, no neighbor crossing/interleaving. Neutral standing soles should have generous blank space below, not touch a row boundary. No alpha edits, shadows, floor, text or borders.
2. Fix abrupt care recovery cells as follows. Keep each action's first and last cell matching the shared right-facing neutral folded-wing perch.
ROW2 FEED: keep cells1–5. Replace cell6 with head/body raised only ONE THIRD from deepest cell5 bow toward neutral; cell7 with head/body raised TWO THIRDS; cell8 neutral. Genuine whole-body intermediate poses, no immediate pop upright.
ROW3 GROOM: keep cells1–5. Replace cell6 with head just starting to emerge from near wing after preening, beak still low; cell7 head raised/rotating almost to right-facing neutral, feathers settling; cell8 neutral. Smooth untucking/recovery.
ROW4 STRETCH: keep cells1–4. Cell5 is grounded gentle wing/one-leg stretch, maintain at leastone planted sole, never airborne. Cell6: wing HALF retracted, stretchedbody HALF recovered. Cell7: wing almostfolded and bodyalmostupright. Cell8: neutral.
ROW5 HOP: cells1–3 neutral→slightcrouch→deeperanticipation;4toeoff;5lowair;6rising;7atpeak;8descending with wings partly folded and feet reaching for ground. This must join ROW6cell1.
ROW6cell1: LOW LANDED CROUCH, both soles contacting the usual ground baseline, wings mostly folded, chest relaxed, slightkneebend. It is NOT another high flying wing-up pose. ROW6cell2 fully recovered neutral perch. ROW6cells3–6 retain gentle standing→tuck→crouch→sleepsettling. ROW6cell7 retain right-facing halfextended-wing nearhover bridge. ROW6cell8 neutral perch.

All bodies/beaks faceRIGHT except the neck naturally turning into its near wing for preening/sleep. Same real fluffy cockatiel material and proportions throughout. Exactly48 isolated complete birds in8×6 cells; real new recovery intermediates; transparent margins>=20pixels; no cartoon, props, floor, drop shadow, artifacts or labels.
```


