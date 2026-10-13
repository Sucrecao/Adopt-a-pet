# Dog double-density atlas provenance

Tool: built-in imagegen, one call per page, true transparent background requested.

Identity reference for both calls: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v1.png`.

The final care generation and repaired motion generation are copied unchanged into the project. Their original generated PNG bytes are preserved; registration and final animation QA belong to the root task. Initial rejected motion provenance is retained below.

## Initial motion candidate (replaced)

Raw output path: `/Users/sucrecao/.codex/generated_images/01a12a9d-b8f8-7e52-9efb-0240460f1a67/exec-8b8f1adf-9224-448b-9a05-8262a4a9644c.png`.

Project path: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v2-motion.png`.

SHA256: `b1dfa9272c03a8543f43e79bf707eccd1c5988397bf03410b06e204c84053500`.

Actual output: 1447×1087 RGBA. Initial candidate has 48 visible dogs but only 47 separate alpha≥32 connected bodies, because walk cells18/19 touch. Turn row6 resets to right instead of continuing the row5 turn. This candidate was replaced by the targeted motion repair below and is not used for registration.

### Exact prompt

Use case: identity-preserve.
Produce a production WHOLE-CHARACTER animation atlas for PawPal's realistic plush golden retriever puppy. Input dog-whole-v1.png is the IDENTITY reference: preserve its same soft honey-gold/cream puppy, brown eyes, black nose, floppy ears, short natural neck, plush detailed fur, natural four-legged puppy anatomy and friendly face. Every frame is one COMPLETE animal painted coherently, never assembled detached body parts. Same camera, soft lighting, face proportions and anatomical size in ALL cells. Make true intermediate poses with gradually changing limbs and whole-body weight, not repeated copies of the old six/eight frame animations.

ABSOLUTE OUTPUT LAYOUT: EIGHT equal columns, SIX equal rows, exactly48 populated cells and48 COMPLETE dogs, on a1448x1086 landscape4:3 canvas. Each logical cell181x181. There are NO empty cells on this page. Read poses left-to-right, row-by-row. All paws, fur, tail, ears and muzzle must fit wholly inside their own cell, with at least20px of genuinely transparent empty margin on ALL FOUR SIDES. Never let any neighbor fragment, tail, nose or paw enter a cell. Use a deliberately compact animal: neutral standing height about110–116px and complete width at most132px including tail; centered x90.5, grounded feet y152 relative to cell. Keep ONE uniform animal scale for every pose, including sleep/stretch/hop, rather than maximizing a pose separately. Pose changes may alter the silhouette but never the camera magnification. Retain the complete natural tail. This spacing requirement is essential so each full animal can be cropped as one intact rectangle.

TRUE transparent RGBA background; no backdrop, floor, shadows, scenery, props, text, labels, borders or drawn grid. Preserve clean soft fur alpha edges, with no matte, colored cloud, yellow/pink halo or stray pixels. Softly rendered realistic plush3D fur, NOT cartoon or pixel art. Natural compact motion with no blur, ghosting, duplicate heads, overlapping bodies or extreme expressions.

PAGE A: 48 MOTION poses in this EXACT arrangement.
ROW1 cells0–7 and ROW2 first FOUR cells8–11 form ONE12-phase calm idle loop in the exact same grounded three-quarter RIGHT-facing neutral stance. All four feet stay planted. Start/end open-eyed neutral. Across12 gradual phases: relaxed open eyes, gentle breathing rise, slight eyelid lowering, eyelids half lowered, eyes closing, softly closed, softly closed with tiny ear settling, eyes reopening, eyes half open, fully open with gentle breathing fall, settled almost neutral, identical compatible neutral. Tail and ears move only a few pixels slowly. No abrupt head tilt, camera change or body-size change. First and last poses flow together.
ROW2 last FOUR cells12–15 are ONE4-phase curled sleeping breathing loop: comfortably curled asleep, slight breathing rise, soft breathing peak, breathing fall compatible with the first sleep pose. Same animal scale as standing; sleep should not be enlarged to fill the cell.
ROWS3 and4, cells16–31, are ONE continuous16-phase loopable natural RIGHT-facing SIDE-PROFILE four-legged WALK in place. Continue across the row boundary; row4 continues row3, it is not a new walk. Exactly16 distinct genuine intermediate gait phases with small changes between neighbors. Sequence: phase0 first diagonal pair contact (near forepaw and opposite hindpaw leading);1 heel/paw settling;2 down;3 early passing;4 passing;5 early rise;6 up;7 late swing into opposite-pair contact;8 opposite diagonal pair contact;9 paw settling;10 down;11 early passing;12 passing;13 early rise;14 up;15 late swing into the first contact. Near/far paws alternate planted support and visible swing with natural elbow/knee bend. The paws move forward/back gradually; head, shoulders, hips and tail follow small consistent weight shifts. Body center does not slide across the cell. Keep the torso and limbs anatomically connected. Last phase must flow into first without a pose jump. Do not duplicate eight poses into sixteen.
ROWS5 and6, cells32–47, are ONE16-phase gradual grounded whole-body turn from exact RIGHT SIDE PROFILE to exact LEFT SIDE PROFILE. Continue smoothly across the row boundary. Camera viewing angles relative to frontal view: +90,+78,+66,+54,+42,+30,+18,+6,-6,-18,-30,-42,-54,-66,-78,-90 degrees. Right profile at first, near-front at middle, left profile at last. Head and torso rotate together, with small plausible planted turning steps; body size, center and foot baseline stay fixed. No duplicated/blended heads or detached head rotation. Do not reverse direction at the end. These are sixteen adjacent stages of one coherent turn.
The result is a polished dense animation atlas, with ALL48 coherent complete dogs and exact row order.

## Care page

Raw output path: `/Users/sucrecao/.codex/generated_images/01a12a9d-b8f8-7e52-9efb-0240460f1a67/exec-72bba534-f0ad-4dbe-9ce0-dc9a8d7d80ca.png`.

Project path: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v2-care.png`.

SHA256: `c5d8ad124e2b3088eeb039f673e4dcc014a783face1de8fea64a536644fbed4b`.

Actual output: 1448×1086 RGBA, 48 separate alpha≥32 connected whole dogs assigned one per nominal cell. Pet/feed/groom/stretch/hop and sleeping bridges visibly follow the requested row arrangement. Standing animals are larger than the requested compact size and some cross nominal cell boundaries; registration must use measured whole-body bounds rather than fixed grid crops. Opaque light-background inspection shows clean complete animals.

### Exact prompt

Use case: identity-preserve.
Produce a production WHOLE-CHARACTER animation atlas for PawPal's realistic plush golden retriever puppy. Input dog-whole-v1.png is the IDENTITY reference: preserve its same soft honey-gold/cream puppy, brown eyes, black nose, floppy ears, short natural neck, plush detailed fur, natural four-legged puppy anatomy and friendly face. Every frame is one COMPLETE animal painted coherently, never assembled detached body parts. Same camera, soft lighting, face proportions and anatomical size in ALL cells. Make true intermediate poses with gradually changing limbs and whole-body weight, not repeated copies of the old six/eight frame animations.

ABSOLUTE OUTPUT LAYOUT: EIGHT equal columns, SIX equal rows, exactly48 populated cells and48 COMPLETE dogs, on a1448x1086 landscape4:3 canvas. Each logical cell181x181. There are NO empty cells on this page. Read poses left-to-right, row-by-row. All paws, fur, tail, ears and muzzle must fit wholly inside their own cell, with at least20px of genuinely transparent empty margin on ALL FOUR SIDES. Never let any neighbor fragment, tail, nose or paw enter a cell. Use a deliberately compact animal: neutral standing height about110–116px and complete width at most132px including tail; centered x90.5, grounded feet y152 relative to cell. Keep ONE uniform animal scale for every pose, including sleep/stretch/hop, rather than maximizing a pose separately. Pose changes may alter the silhouette but never the camera magnification. Retain the complete natural tail. This spacing requirement is essential so each full animal can be cropped as one intact rectangle.

TRUE transparent RGBA background; no backdrop, floor, shadows, scenery, props, text, labels, borders or drawn grid. Preserve clean soft fur alpha edges, with no matte, colored cloud, yellow/pink halo or stray pixels. Softly rendered realistic plush3D fur, NOT cartoon or pixel art. Natural compact motion with no blur, ghosting, duplicate heads, overlapping bodies or extreme expressions.

PAGE B:48 CARE AND BRIDGE poses in this EXACT arrangement. Global index is local index+48.
EVERY standing care sequence starts and finishes in the SAME neutral grounded three-quarter RIGHT-facing stance as the identity reference's calm idle: all four paws down, same camera, same size, same head angle and friendly expression. Start/end poses must be visually compatible so playback returns to idle without a jump. Intermediate changes are gradual and meaningful rather than old-frame copies.
ROW1 local0–7/global48–55: ONE8-phase affectionate petting/nuzzle response.0 neutral;1 slightly lower head and relax eyelids;2 head lowers a little further;3 close eyes contentedly with tiny neck/torso relaxation;4 soft happy nuzzle and subtle ear settling;5 gradually raise head;6 eyes reopen and body settles;7 return to the exact neutral stance. Keep four paws planted and short natural neck.
ROW2 local8–15/global56–63: ONE8-phase eating/chewing response without any bowl/food/props.0 neutral;1 gently lower head;2 lower muzzle further with small mouth opening;3 small natural chew;4 second tiny chew with coherent jaw/face;5 swallowing and starting to raise head;6 nearly raised head;7 exactly neutral. Do not redraw the face into another dog.
ROW3 local16–23/global64–71: ONE8-phase grooming response.0 neutral;1 shift weight slightly onto far forepaw;2 near forepaw begins lifting;3 lift it naturally and lower head toward it;4 one subtle lick of the raised paw;5 head begins rising while paw starts lowering;6 paw almost grounded;7 complete neutral stance. Preserve connected natural elbows, shoulders and paw.
ROW4 local24–31/global72–79: ONE8-phase natural whole-body stretch/play bow.0 neutral;1 forepaws begin extending forward;2 shoulders lower a little;3 shoulders lower further with gradually extended forelegs;4 full relaxed foreleg stretch with rump naturally raised, straight coherent back and full tail;5 smoothly raise shoulders halfway;6 nearly upright recovering paws;7 exactly neutral. Four limbs remain correctly attached with no detached torso.
ROW5 all EIGHT cells local32–39/global80–87 plus ROW6 first TWO cells local40–41/global88–89: ONE continuous10-phase tiny happy whole-body hop.0 neutral stand;1 begin crouching;2 deeper anticipation crouch;3 takeoff with all four paws only3px airborne;4 rise to8px;5 gentle apex with all paws14px airborne;6 descend to8px;7 descend to3px;8 soft grounded landing with bent legs;9 recover exactly neutral. The complete body, head, tail and ears travel coherently. Keep at least20px transparent padding above the highest airborne fur; no exaggerated jump. Last pose is compatible with first and idle.
ROW6 NEXT FOUR cells local42–45/global90–93: FOUR gradual STANDING-TO-SLEEP bridge poses at the same animal scale:42 neutral standing;43 relaxed sitting with all body parts coherent;44 low resting crouch close to the ground;45 complete comfortable curled sleeping pose compatible with the sleeping reference. These should reverse naturally from curl through crouch/sit to standing when waking.
ROW6 LAST TWO cells local46–47/global94–95: TWO natural WALK-TO-NEUTRAL bridge poses.46 almost stopped right-facing three-quarter stance with paws nearly planted and one final tiny settling step;47 fully stopped exact neutral standing stance compatible with idle and every care sequence.
Do not leave any cells empty. Preserve all48 complete poses in this exact order with genuine intermediate changes.


## Motion repair

A targeted built-in imagegen edit reduces all animal sizes uniformly, separates touching walk cells, and replaces the two turn rows with one right-to-left sequence.

Final raw output: `/Users/sucrecao/.codex/generated_images/01a12a9d-b8f8-7e52-9efb-0240460f1a67/exec-d43ca636-7619-49fa-ae55-44272d15aa64.png`.

Final project path: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v2-motion.png`.

SHA256: `e7abd36dc8550ab08a5f3b7ffd70f44b6604a6904bf296395ff96b370b5b25d0`.

Actual output: 1448×1086 RGBA, 48 separate whole animals assigned to all48 nominal row-major cells. Every alpha≥32 bounding box retains2px padding without any neighboring body box. Opaque composite inspection shows all full bodies, clean fur edges and a turn progressing from right to front across row5, then front to left across row6 with no right-facing reset. Idle standing height is approximately132px versus the care page’s approximately158px; registration must account for the cross-page size difference. These are authored raster poses; final loop and transition continuity require playback QA.

Input images, in order: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v2-motion.png` (initial motion candidate) and `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v1.png` (identity).

### Exact repair prompt

Edit the MOTION atlas supplied as the first reference. The second reference is the original puppy identity only. Preserve the same warm cream/honey golden retriever puppy, same face, brown eyes, black nose, floppy ears, short natural neck, realistic soft plush fur, and complete connected four-legged anatomy.

Keep exactly EIGHT columns and SIX rows, exactly 48 full animals. Keep all complete dogs with tails and paws inside their own cells. Preserve the calm idle poses in row 1 and the first four cells of row 2, and the four curled-sleep poses in the last four cells of row 2. Preserve the single 16-pose walking sequence in rows 3 and 4, but improve gradual natural gait between neighboring stages.

CRITICAL SPACING REPAIR: Reduce EVERY animal uniformly to 75 percent of its current anatomical dimensions, including all idle, sleep, walk, and turn poses. Recenter each dog inside its own cell, with grounded paw baseline at about 150 px in its approximately 181 px tall cell. Do NOT scale different poses separately. Maintain one physical scale across the entire sheet. Leave AT LEAST 18 px fully transparent margin on every side, including tail and muzzle. In particular rows 3 and 4 must have all 16 separate dogs with no tails touching neighboring noses and no overlapping alpha. Every complete animal must crop as its own intact rectangular body without any neighboring dog fragments.

CRITICAL TURN REPAIR: Replace BOTH bottom rows with ONE continuous 16-stage grounded whole-body turn. It travels from RIGHT profile through FRONT to LEFT profile. These are not two separate repeated turns. Read left to right across row 5 and continue into row 6. Head AND torso rotate together; paws make small plausible planted turning steps. Keep camera, body center, uniform physical size and foot baseline steady.
Row 5 exactly:
column 1 dog faces exact RIGHT side profile, +90 degrees;
column 2 faces mostly right, +77 degrees;
column 3 faces front-right, +64 degrees;
column 4 faces front-right, +51 degrees;
column 5 faces front-right, +38 degrees;
column 6 faces slight front-right, +25 degrees;
column 7 faces almost front, +12 degrees;
column 8 faces exact FRONT, 0 degrees.
Row 6 exactly:
column 1 faces exact FRONT, 0 degrees, compatible with previous cell;
column 2 faces slight FRONT-LEFT, -12 degrees;
column 3 faces FRONT-LEFT, -25 degrees;
column 4 faces FRONT-LEFT, -38 degrees;
column 5 faces FRONT-LEFT, -51 degrees;
column 6 faces mostly LEFT, -64 degrees;
column 7 faces almost exact LEFT, -77 degrees;
column 8 faces exact LEFT side profile, -90 degrees.
NO dog in row 6 may face toward the RIGHT. The dogs rotate to the viewer's left across the second turn row; NEVER reset to the beginning. No reversed final frame.

The resulting sheet must contain 48 separate complete coherent puppy poses. Uniform camera/light/identity and anatomical size throughout. Soft realistic plush3D fur, no cartoon, no detached anatomy, no duplicate limbs or blended heads. True transparent RGBA outside the dogs, with clean fur edges. No backdrop, floor, ground shadows, labels, text, boxes, grid or props. Keep the original detailed fur quality while making every dog safely smaller and separately bounded. Output a landscape 4:3 atlas about1448x1086.

