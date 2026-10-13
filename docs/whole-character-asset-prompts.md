# Whole character asset provenance

The final cat, dog and cockatiel atlases were generated with the built-in imagegen tool and copied from its original PNG outputs. All three final files are **1448x1086 RGBA**, with eight columns, six rows and 181x181 nominal cells. Each contains 45 complete animal poses followed by three unpopulated slots. The original generation prompt below requested 1536x1152; that is the requested size, not the measured output size.

The project PNGs retain the generated pixels and alpha byte-for-byte. Registration changes only JSON source rectangles, whole-frame offsets, uniform species scale and complete-frame mirroring. No PNG filtering, pixel masking, cutout assembly, raster resizing or retouching was used. The parrot spacing repair was a separate built-in imagegen edit; its final output was also copied unchanged.

## Final sources

### Cat

- Identity reference: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/cat.png`.
- Original generated PNG: `/Users/sucrecao/.codex/generated_images/01a12a9b-2182-7442-8036-02b7741fcaec/exec-72d2210b-4fed-44dd-97ba-6880312491a1.png`.
- Final project PNG: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/cat-whole-v1.png`.
- SHA256 of both original and project PNG: `1b6e4c2d3ce8e11d9289248415e02d5cfba6ff3923e5e5898c378263b920bdb6`.
- The exact original generation prompt is preserved below.

### Dog

- Identity reference: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog.png`.
- Original generated PNG: `/Users/sucrecao/.codex/generated_images/01a12a9d-b8f8-7e52-9efb-0240460f1a67/exec-f6a5f72d-2990-4461-b9cc-3c5b8ed93c04.png`.
- Final project PNG: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v1.png`.
- SHA256 of both original and project PNG: `1eddc3920ae529dcfb53825e6c4db3158c35c0b5b3545595b6f50d9aac8ce964`.
- Exact prompt and registration measurements: [Dog whole character atlas provenance](dog-whole-asset-prompt.md). The original dog generation was retained; its three narrow walking margins were corrected in JSON registration.

### Cockatiel / parrot

- Identity reference for the initial generation: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/parrot.png`.
- Initial generated PNG: `/Users/sucrecao/.codex/generated_images/01a12a9b-2182-7442-8036-02b7741fcaec/exec-50822193-dd2f-4539-bf6b-8f1ed2663a43.png`.
- SHA256 of initial generated PNG: `820e13ccb952e42d68ace0f6a3285e0c8d182c94fb9fc4c8692fb7a14abef580`.
- That initial atlas was used as the reference for a spacing repair, because adjacent birds entered some complete-body rectangular crops.
- Final generated PNG: `/Users/sucrecao/.codex/generated_images/01a12a9d-b8f8-7e52-9efb-0240460f1a67/exec-faf76e3a-ca91-42be-ae74-fb4fd2bdbafe.png`.
- Final project PNG: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/parrot-whole-v1.png`.
- SHA256 of both final generated and project PNG: `cfba5e1e33577a017c06a765742691a57c1247458c4f632ae35c2525b91582a6`.
- Exact spacing-repair prompt and inspection notes: [Parrot whole atlas padding correction](parrot-whole-padding-prompt.md).

## Final registration

`scripts/register-whole-atlas.py` produces `public/pets/{cat,dog,parrot}-whole-v1.json` from the final PNGs. It detects the 45 complete animals, registers actual source rectangles rather than assuming that every pose fits the nominal cell, and checks that every populated crop contains exactly one animal and fits the 256px rendering canvas. Crops retain three pixels outside the alpha>=32 contour; the closest dog walking margins retain two pixels. The three unused entries register small empty rectangles.

Cat and dog use one scale of 0.80 per species; parrot uses one scale of 0.98 to compensate for its smaller padded artwork. Grounded and sleeping poses share a foot baseline at y = 226. Airborne hop frame 42 uses y = 204. Parrot flight poses align their measured eyes at y = 110, so changing wingtip height does not shift the body. The native idle timing totals 6.6 seconds with frame selection 0/1/2/1/0/0. Cat turn frames 16/23 reuse complete profile frame 8, with frame 23 mirrored; frontal frame 20 mirrors frame 19. These are complete-frame choices, not separately animated body parts.

Run `python3 scripts/register-whole-atlas.py --check` to verify source dimensions, complete-animal counts, crop isolation, registration bounds and deterministic JSON output without writing files. Full measured source hashes and registration bounds are recorded in [the registration appendix](dog-whole-asset-prompt.md).

## Original cat generation prompt

Use case: identity-preserve. Generate a production WHOLE CHARACTER animation sprite atlas for PawPal desktop pet. Reference cat.png supplies identity only: same cute REALISTIC silver British shorthair kitten, round green eyes, pink nose, plush pale grey fur, subtle stripes, natural kitten anatomy, softly rendered 3D fur. Keep realistic plush appearance, NOT cartoon, NOT detached body parts. Every frame must be one COMPLETE anatomically coherent kitten drawn together, not a collage. We are replacing an awkward cutout bone rig with harmonious whole body pose animation like a polished desktop companion.

LAYOUT ABSOLUTELY EXACT: EIGHT equal columns, SIX equal rows, 48 regular cells. Canvas 1536x1152 landscape 4:3, cells192x192. TRUE transparent alpha background, no floor, no shadows, no backdrop, no gradients, no labels, no text, no grid. Each whole kitten wholly inside its cell with at least15px transparent moat, no neighbor overlap. Same camera, lighting and anatomical scale across entire atlas; body natural volume, short natural neck, four distinct correctly placed legs, same head proportions. Grounded soles at y=170 relative to each cell; centered anchor x=96. Character height around145px, width around160px including tail. Do not maximize each pose separately or change scale.

ROW1 zero-based frames0-7: first SIX cells one calm STANDING three-quarter right-facing idle loop, almost identical whole body: open eyes, slight eyelid lowering, eyes closed, eyes reopening, eyes open with 2degree head tilt, neutral open eyes. No pose jump, first and last compatible. Tail subtle and slow. Last TWO cells show same kitten curled comfortably asleep at same scale (eyes closed; second only slight breath), no background.
ROW2 frames8-15: EIGHT consecutive phases of ONE loopable natural right-facing side-profile four-legged WALK in place. Strong distinct alternating leg phases: contact, down, passing, up for first diagonal pair then contact/down/passing/up opposite pair. Near and far paws alternate planted support and visible swing, natural elbow/knee bend, shoulders and hips respond together, tail maintains consistent shape with small follow-through. No sliding body center, not eight copies of same extended paw. The legs belong organically to torso. Last phase flows smoothly to first.
ROW3 frames16-23: EIGHT consecutive whole body poses of ONE grounded turn from right-facing profile to LEFT-facing profile: exact right profile, right three-quarter, near-front from right, fully frontal, fully frontal slight lean left, near-front from left, left three-quarter, exact left profile. Head and torso rotate together; paws take small plausible turning steps; no blended duplicate heads or bodies. Fixed size, center, floor line.
ROW4 frames24-31: first FOUR cells calm right-facing three-quarter petting response: same standing pose, lowers head mildly, closes eyes contentedly, lifts head returning to neutral. Last FOUR cells right-facing three-quarter eating response: standing neutral, lowers head slightly mouth open, closes mouth chewing, lifts head after swallowing. NO bowl food props text or effects.
ROW5 frames32-39: first FOUR cells right-facing three-quarter grooming: standing neutral, lifts near forepaw, head bends to lick raised paw, paw lowers back to stand. Last FOUR cells natural right-facing stretch/play bow: neutral standing, front paws move forward/body lowers, full foreleg stretch with rump raised and natural straight back, recovery standing. Keep body coherent.
ROW6 frames40-47: first FIVE cells tiny complete-body happy hop: neutral standing, crouch for anticipation, ALL paws rise10-18px with body in one coherent jump, land with bent legs, recover original stand. Deliberate airborne foot displacement only in third cell. Last THREE cells completely EMPTY transparent, no artwork.

Motion changes measured and compact like sprite animation; no extreme facial redraw, no arbitrary face identity changes, no blur or ghosting. Complete tail ears paws in every cell. The result is a coherent animation atlas, not a collage of unrelated illustrations.

