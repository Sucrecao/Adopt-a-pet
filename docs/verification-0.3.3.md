# PawPal 0.3.3 verification

Verified on Apple Silicon macOS, 2026-10-11.

The user subsequently rejected the leg placement. These checks established source proportions and contact/reach stability but did not catch near-root occlusion, idle gait offsets, staggered hip/body turning or the reversed transform order. Version 0.3.4 addresses those separate attachment defects; see `verification-0.3.4.md`.

The user rejected the cat's proportions after 0.3.2. Its broad hind skin had a high source hock, while the shared skeleton compressed the distal segment into a short, thick hook. The profile head was also flattened from a 315×326 source into a 96×82 destination. Earlier contact and stability checks did not establish that the animal looked anatomically convincing.

## Correction

- Built-in imagegen generated two complete matching silver-cat limb skins. The intact 1536×1024 PNG is `public/pets/cat-limbs-v3.png`; measured rectangles and joints are in `cat-limb-rig-v3.json`. Generation reference, provenance and exact prompt are recorded in [rig-asset-prompts.md](rig-asset-prompts.md#slender-feline-limbs-v033). Source pixels were not manually edited.
- The new hind hock is at 84.6% of the hip-to-sole span, versus 67.5% in the old source. With the same new skeleton, opaque distal width is 18.706px rather than 23.882px; isolated sole alpha is 254/252 in the two facings.
- Cat-only hips, shoulder height, 32/34 hind bones, 40/40 fore bones and a shorter 7/17 hind paw offset fit these skins. Planted supports begin the existing 180ms recovery before a short chain exceeds its reach. Cat care bob and stretch/jump tilt also respect those reach bounds.
- `cat-head-rig-v3.json` reuses intact head/body/tail artwork and restores the profile head aspect ratio to 88×91. The cat's far-leg opacity is 0.96 so the new source retains opaque composed soles.
- The loader selects the three v3 resources as a validated group, retains cohesive v2 when that group is unavailable, and retains the original fallback if cohesive v2 is unavailable. Dog/parrot geometry and existing asset selection are unchanged.

## Verification

- Final `npm test`: 116 passed, 0 failed. Eight new core tests cover cat proportions, complete gait reach, world contacts, real reversals, mixed care, fractional stance boundaries and exact freeze. Existing species-specific expectations were updated for the intended cat geometry; contact/timing thresholds were not weakened.
- Final `npm run test:ui -- --workers=2`: 53 passed, 0 failed, 45.0s. Seven new browser tests use the real source images and renderer, including actual loading and individual optional-resource failures.
- Final `npm run build`: passed; production bundle `index-BhqsHUj0.js`.
- The browser motion evidence contains 1,686 complete samples and 1,105,672 finite canvas transforms, both facings, a full gait cycle, real 0..800ms reversals, and complete groom/stretch/trick/pet/feed/rest timelines. All 4,968 composed rig contact samples retain alpha ≥218, and rig canvas-edge alpha is zero. The legacy sleep bitmap is byte-identical to its original crop; its existing edge pixels are reported separately rather than treated as new-rig clipping.
- All 36 paused/dragging/reduced-motion cases retain the exact pose and pixels. Reversal begins with zero pixel difference and reaches actual orientation zero at 400ms.
- Independent source and visual review found no actionable P1/P2 issue. Complete side poses and care frames were inspected on pale, white and dark backgrounds. A separate complete-pose comparison found dog/parrot outputs unchanged against the accepted baseline.

Reproducible visual evidence is under `.artifacts/`: `cat-proportions-comparison.png`, `cat-proportions-preview.png`, `cat-proportions-gait.png`, `cat-proportions-turn.png`, `cat-proportions-care.png`, `cat-proportions-backgrounds.png`, `cat-proportions-motion.json` and `cat-proportions-distal.json`. The comparison script renders the old HEAD controller/assets and final current controller/assets at the same pose; these are composed application renders.

## Native application and delivery

The final arm64 application passed `scripts/smoke-electron.mjs` with `PAWPAL_SMOKE_SPECIES=cat` and its packaged executable, using temporary storage. Checks include native transparency, adoption, real Canvas rig, grounded travel/reversal, pet/feed/stretch/trick, cold and mixed-turn care, drag, exact freeze, fractional/signed-zero coordinates, saved settings and parrot Y zero crossings.

- Grounded reversal: 194 contact pairs, five continuing supports, maximum adjacent world drift 0.22 DIP.
- Moving paint-packet lag: maximum 24.91ms; displayed root error maximum 2 DIP. Steady native RAF: 513 samples, p95 9.3ms, maximum 9.4ms.
- Cold pet/feed/stretch/trick RAF p95: 9.3/9.3/9.3/9.2ms. Maximum cold pet/feed gaps were 92.6/26ms. Initial profile setup cost 244.1ms and included a 283.4ms frame gap; this is a one-time startup limitation, not steady animation performance.
- First quarter/front setup gaps: 8.3/7.9ms. Mixed-turn pet/feed each supplied 62 samples, p95 9.0/8.6ms.

The packaged ASAR version is 0.3.3. Final cat resources, native main/preload, kinematics and renderer bundle hashes match the source/build. `release/PawPal-0.3.3-mac-arm64.zip` passes ZIP CRC verification. The actual `release/mac-arm64/PawPal.app` was replaced and visibly restarted at 0.3.3; the prior app is retained at `.artifacts/PawPal-0.3.2-before-proportions.app`.

The latest profile at shutdown was dog 豆包. Its species, name, adoption, bond and settings match after restart. Earlier cat-profile backups were not restored. Apple Silicon Mac and source are 0.3.3; the existing Intel Mac and Windows archives remain 0.3.2 and were not rebuilt or executed for this correction. Distribution remains unsigned.

The renderer is a 2D bitmap rig. Torso/tail blending still shows ghosting during partial turns, and the frontal torso remains a broad blend of side views. This correction improves cat proportions and reach; it does not establish a natural 3D turn. Native timing describes this machine.
