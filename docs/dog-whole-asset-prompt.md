# Dog whole character atlas provenance

Tool: built-in imagegen, one candidate, transparent background requested.

Identity reference: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog.png`.

Original generated image path: `/Users/sucrecao/.codex/generated_images/01a12a9d-b8f8-7e52-9efb-0240460f1a67/exec-f6a5f72d-2990-4461-b9cc-3c5b8ed93c04.png`.

Project asset path: `/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v1.png` (pristine PNG copied after composite QA).

First candidate QA: source is 1448x1086 RGBA with real alpha and an 8x6 layout. Composite over #f4f4f4 is clean; colored halos in the tool alpha preview are mostly alpha 1–3 and disappear under compositing. There are exactly 45 substantial whole-character connected components, with the final three slots empty. Row 4 petting cells include happy paw lifting/licking instead of the requested head-lowering response; the parent approved retaining this complete-character response. Turn row ends with a correct left profile. Source crops must use actual connected-component rectangles, because walk tails and the hop reach beyond nominal 181px cell borders. No second generation was made.

## Prompt

Use case: identity-preserve. Generate a production WHOLE CHARACTER animation sprite atlas for PawPal desktop pet. Reference dog.png supplies identity only: same cute REALISTIC warm honey gold retriever puppy, round brown eyes, black nose, soft floppy ears, plush golden fur, short natural neck, natural four-legged puppy anatomy, softly rendered 3D fur. Keep realistic plush appearance, NOT cartoon, NOT detached body parts. Every frame must be one COMPLETE anatomically coherent puppy drawn together, not a collage. We are replacing an awkward cutout bone rig with harmonious whole body pose animation like a polished desktop companion.

LAYOUT ABSOLUTELY EXACT: EIGHT equal columns, SIX equal rows, 48 regular cells. Canvas 1536x1152 landscape 4:3, cells192x192. TRUE transparent alpha background, no floor, no shadows, no backdrop, no gradients, no labels, no text, no grid. Each whole puppy wholly inside its cell with at least15px transparent moat, no neighbor overlap. Same camera, lighting and anatomical scale across entire atlas; body natural volume, short natural neck, four distinct correctly placed legs, same head proportions. Grounded soles at y=170 relative to each cell; centered anchor x=96. Character height around145px, width around160px including tail. Do not maximize each pose separately or change scale.

ROW1 zero-based frames0-7: first SIX cells one calm STANDING three-quarter right-facing idle loop, almost identical whole body: open eyes, slight eyelid lowering, eyes closed, eyes reopening, eyes open with 2degree head tilt, neutral open eyes. No pose jump, first and last compatible. Tail subtle and slow. Last TWO cells show same puppy curled comfortably asleep at same scale (eyes closed; second only slight breath), no background.
ROW2 frames8-15: EIGHT consecutive phases of ONE loopable natural right-facing side-profile four-legged WALK in place. Strong distinct alternating leg phases: contact, down, passing, up for first diagonal pair then contact/down/passing/up opposite pair. Near and far paws alternate planted support and visible swing, natural elbow/knee bend, shoulders and hips respond together, tail maintains consistent shape with small follow-through. No sliding body center, not eight copies of same extended paw. The legs belong organically to torso. Last phase flows smoothly to first.
ROW3 frames16-23: EIGHT consecutive whole body poses of ONE grounded turn from right-facing profile to LEFT-facing profile: exact right profile, right three-quarter, near-front from right, fully frontal, fully frontal slight lean left, near-front from left, left three-quarter, exact left profile. Head and torso rotate together; paws take small plausible turning steps; no blended duplicate heads or bodies. Fixed size, center, floor line.
ROW4 frames24-31: first FOUR cells calm right-facing three-quarter petting response: same standing pose, lowers head mildly, closes eyes contentedly, lifts head returning to neutral. Last FOUR cells right-facing three-quarter eating response: standing neutral, lowers head slightly mouth open, closes mouth chewing, lifts head after swallowing. NO bowl food props text or effects.
ROW5 frames32-39: first FOUR cells right-facing three-quarter grooming: standing neutral, lifts near forepaw, head bends to lick raised paw, paw lowers back to stand. Last FOUR cells natural right-facing stretch/play bow: neutral standing, front paws move forward/body lowers, full foreleg stretch with rump raised and natural straight back, recovery standing. Keep body coherent.
ROW6 frames40-47: first FIVE cells tiny complete-body happy hop: neutral standing, crouch for anticipation, ALL paws rise10-18px with body in one coherent jump, land with bent legs, recover original stand. Deliberate airborne foot displacement only in third cell. Last THREE cells completely EMPTY transparent, no artwork.

Motion changes measured and compact like sprite animation; no extreme facial redraw, no arbitrary face identity changes, no blur or ghosting. Complete tail ears paws in every cell. The result is a coherent animation atlas, not a collage of unrelated illustrations.


## Whole-character crop candidates

Row-major rectangles `[x, y, width, height]` in original pixels, detected from 4-connected alpha >=16 components with at least1000 pixels and 3px padding. These preserve the original image; no raster editing or resampling was used. Frames45–47 are empty. Parent integration owns final registration and baseline QA.

```json
[
  [
    17,
    17,
    161,
    165
  ],
  [
    198,
    19,
    167,
    163
  ],
  [
    377,
    26,
    166,
    156
  ],
  [
    558,
    19,
    161,
    163
  ],
  [
    736,
    17,
    162,
    165
  ],
  [
    915,
    18,
    161,
    164
  ],
  [
    1088,
    78,
    178,
    100
  ],
  [
    1269,
    78,
    175,
    99
  ],
  [
    12,
    205,
    182,
    141
  ],
  [
    194,
    202,
    181,
    141
  ],
  [
    372,
    205,
    182,
    141
  ],
  [
    554,
    201,
    176,
    144
  ],
  [
    733,
    202,
    178,
    144
  ],
  [
    907,
    197,
    184,
    147
  ],
  [
    1087,
    201,
    183,
    145
  ],
  [
    1270,
    206,
    177,
    140
  ],
  [
    11,
    375,
    181,
    151
  ],
  [
    199,
    372,
    166,
    160
  ],
  [
    379,
    372,
    151,
    162
  ],
  [
    581,
    368,
    109,
    166
  ],
  [
    754,
    368,
    114,
    165
  ],
  [
    919,
    371,
    147,
    163
  ],
  [
    1086,
    374,
    166,
    157
  ],
  [
    1257,
    378,
    182,
    148
  ],
  [
    13,
    552,
    168,
    165
  ],
  [
    192,
    556,
    174,
    160
  ],
  [
    373,
    567,
    169,
    147
  ],
  [
    547,
    551,
    172,
    167
  ],
  [
    732,
    552,
    169,
    166
  ],
  [
    906,
    582,
    181,
    136
  ],
  [
    1089,
    585,
    173,
    132
  ],
  [
    1270,
    552,
    169,
    166
  ],
  [
    14,
    730,
    169,
    165
  ],
  [
    195,
    749,
    167,
    141
  ],
  [
    386,
    739,
    146,
    148
  ],
  [
    546,
    727,
    170,
    167
  ],
  [
    735,
    742,
    166,
    154
  ],
  [
    916,
    755,
    181,
    147
  ],
  [
    1102,
    731,
    167,
    169
  ],
  [
    1271,
    730,
    166,
    166
  ],
  [
    16,
    911,
    164,
    161
  ],
  [
    201,
    937,
    160,
    133
  ],
  [
    385,
    891,
    154,
    144
  ],
  [
    556,
    932,
    157,
    138
  ],
  [
    734,
    910,
    162,
    161
  ]
]
```

<!-- whole-atlas-registration:start -->
## Registration measurements for all three species

Run `python3 scripts/register-whole-atlas.py --check` to verify. The PNG files are never written. Source crops retain up to3px and at least1px outside their alpha>=32 contour; narrow padding is reduced where a neighbor approaches, retaining the entire own contour. Standing and sleeping feet align to y226; only airborne hop frame42 uses y204. Flight poses align their measured eyes to y110, independent of wingtip height. The padded parrot artwork uses one species-wide scale0.98 to retain its original desktop proportions; cat/dog use0.80. Cat turn poses16/23 use complete walk profile8, with pose23 mirrored; frontal pose20 mirrors pose19. Idle selects0/1/2/1/0/0 over the native 6.6-second cycle.

```json
[
  {
    "species": "cat",
    "sourceSize": [
      1448,
      1086
    ],
    "sha256": "1b6e4c2d3ce8e11d9289248415e02d5cfba6ff3923e5e5898c378263b920bdb6",
    "wholeAnimalCount": 45,
    "populatedFrames": 45,
    "emptyFrames": [
      45,
      46,
      47
    ],
    "scale": 0.8,
    "destinationPixelsPerSourcePixel": 1.13149171,
    "groundY": 226,
    "hopAirborneGroundY": 204,
    "flightEyeY": null,
    "minimumCropMoatAtAlpha32": 3,
    "largestRenderedCrop": [
      204.8,
      196.88
    ],
    "feetByAuthoredFrame": [
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      204.0,
      226.0,
      226.0
    ]
  },
  {
    "species": "dog",
    "sourceSize": [
      1448,
      1086
    ],
    "sha256": "1eddc3920ae529dcfb53825e6c4db3158c35c0b5b3545595b6f50d9aac8ce964",
    "wholeAnimalCount": 45,
    "populatedFrames": 45,
    "emptyFrames": [
      45,
      46,
      47
    ],
    "scale": 0.8,
    "destinationPixelsPerSourcePixel": 1.13149171,
    "groundY": 226,
    "hopAirborneGroundY": 204,
    "flightEyeY": null,
    "minimumCropMoatAtAlpha32": 2,
    "largestRenderedCrop": [
      205.931,
      190.091
    ],
    "feetByAuthoredFrame": [
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      204.0,
      226.0,
      226.0
    ]
  },
  {
    "species": "parrot",
    "sourceSize": [
      1448,
      1086
    ],
    "sha256": "cfba5e1e33577a017c06a765742691a57c1247458c4f632ae35c2525b91582a6",
    "wholeAnimalCount": 45,
    "populatedFrames": 45,
    "emptyFrames": [
      45,
      46,
      47
    ],
    "scale": 0.98,
    "destinationPixelsPerSourcePixel": 1.38607735,
    "groundY": 226,
    "hopAirborneGroundY": 204,
    "flightEyeY": 110,
    "minimumCropMoatAtAlpha32": 3,
    "largestRenderedCrop": [
      248.108,
      199.595
    ],
    "feetByAuthoredFrame": [
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      210.629,
      205.224,
      209.105,
      195.937,
      207.857,
      201.897,
      209.936,
      209.659,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      226.0,
      204.0,
      226.0,
      226.0
    ]
  }
]
```
<!-- whole-atlas-registration:end -->
