# Parrot whole atlas padding correction

Tool: built-in imagegen, transparent background requested.

Reference: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/parrot-whole-v1.png` (original candidate). Its original PNG SHA256 is `820e13ccb952e42d68ace0f6a3285e0c8d182c94fb9fc4c8692fb7a14abef580`; the prior imagegen source path remains recorded in `docs/whole-character-asset-prompts.md`.

New original generated image path: `/Users/sucrecao/.codex/generated_images/01a12a9d-b8f8-7e52-9efb-0240460f1a67/exec-faf76e3a-ca91-42be-ae74-fb4fd2bdbafe.png`.

Target: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/parrot-whole-v1.png`.

## Prompt

Use case: precise-object-edit, identity-preserve.
Edit the supplied complete cockatiel animation atlas as a production sprite atlas. This is a STRICT spacing and padding correction of the existing artwork. Preserve the same realistic plush grey cockatiel, yellow crest and face, orange cheek patches, black eyes, natural beak, feather texture, lighting, exact anatomy, ALL 45 complete individual poses, and their EXACT current row-major order. Do not invent, omit, merge, swap, deform, or redesign poses.

Output layout MUST remain exactly EIGHT equal columns by SIX equal rows on a 1448x1086 4:3 canvas, 181x181 logical cells. There are 45 complete birds: row1 eight, row2 eight, row3 eight, row4 eight, row5 eight, row6 five followed by THREE completely empty transparent cells. Every complete bird must be independently reduced to 70% of its CURRENT dimensions and repositioned inside its own logical cell. Apply ONE identical 70% artwork scale to EVERY bird and EVERY body part, regardless of the pose. Never maximize a pose separately. Keep the tail, crest, wings, beak, feet, and full feather tips intact. Each cell must contain one COMPLETE coherent bird, surrounded on ALL FOUR sides by at least 15px of TRUE transparent empty margin. No feathers, tails, wings or neighbor fragments may enter another cell. No pixels of any adjacent bird may appear in a cell.

Keep the current 45 poses as-is: row1 first6 calm perched blink poses and last2 sleeping; row2 all8 flight wingbeat poses including the fully lowered wings in columns3 and7; row3 right-to-left whole-body turn; row4 first4 happy/petting responses then4 feeding; row5 first4 grooming then4 stretch/play bow (keep column6 low stretch and column7 tall raised-tail stretch); row6 five small whole-body hop poses. Preserve every pose's complete natural silhouette. Recenter each full silhouette within the cell horizontally. Grounded birds should have their feet at approximately y155 relative to their cell. Flight poses should keep stable head/body positions relative to their own cell while the wings move around the body; preserve the intentional airborne hop displacement in row6 column3. The scaled birds must stay safely inside their cells in every pose.

TRUE transparent RGBA background, alpha exactly zero outside the soft feather edge. Preserve fine clean natural feather alpha edges. NO white or grey background, NO matte, NO cloudy texture, NO yellow or pink fringe or halo, NO colored speckles, NO stray pixels, NO grid lines, NO labels, NO text, NO scenery, NO floor, NO shadow, NO props. This is the same whole-character atlas with corrected spacing and clean transparent padding, not a new collage.


QA: 1448x1086 RGBA, exactly45 substantial whole-animal components and final3 slots empty. All padded source rectangles intersect exactly one animal. Flight10/14 and stretch37/38 retain complete wings/tails without neighbor fragments. The model reduced ordinary perched contour height from about165px to about135px (roughly82%, rather than the requested70%); registration uses measured proportions to retain the original desktop size. Original imagegen result was copied byte-for-byte.
