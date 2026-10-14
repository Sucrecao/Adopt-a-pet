# PawPal 0.5.1 — Maltese & Golden Retriever

Verified 2026-10-14. The user clarified that the reference is Moonlab's Maltese and Golden Retriever. Two separate selectable characters now lead the catalog, with the original pets retained. Existing saved identities remain valid. Select Maltese or Golden Retriever in the adoption panel to use the new characters.

The character drawings follow the inspected official artwork's white furry Maltese, black nose, tan floppy-ear Retriever, red collar, dot eyes and simple mouths. They are newly authored animation drawings of the named characters. Sources: https://store.line.me/stickershop/author/173491/en and https://store.line.me/stickershop/product/24856095/en. The actual exported turns and mouth openings were independently reviewed against the downloaded reference images.

## Complete pictures and action continuity

Each pet has 5,776 registered whole-picture cells across 143 PNG pages, including 128 distinct walk pictures and 128 phase-specific 40-picture stop tracks. The final actual unique raster counts are 5,367 Maltese and 5,370 Golden; neutral/return/hold cells intentionally repeat. Nine actions, rest entry/exit and the 800ms/80-picture turn share exact complete-picture junctions. The runtime crops one finished PNG picture and uniformly draws it; it does not assemble body parts, blend poses or synthesize intermediate pixels.

Offline authoring is in `scripts/author-couple-puppies.mjs` and `scripts/couple-puppies/{poses,draw}.mjs`. Walking uses a 40-canonical-pixel stride and two alternating supports. Planted paws cancel accepted root distance; source quantization is measured independently from this analytical property. Turn paws keep their ordering and remain separated through every turn picture. Ear changes use opaque geometric occlusion. The mouth opening grows continuously from the smile; the pilot's threshold pop was removed.

## Verification results

- `npm test`: **380 passed, 0 failed** after final source and catalog changes; `npm run build`: passed.
- New browser onboarding/adoption/reply/reload checks: **4 passed**. Both new characters use dog responses, optional sound, traits and gait, while original saved pets reload unchanged.
- New decoded-source and production preview checks: **3 passed**. Each pet: 2,483 actual whole-picture draws, 864 exact whole mirrors, all 128 same-time stop junctions, five care interruptions, and equal source pixels at common deterministic 60/120Hz timestamps. Maximum declared quantization drift: 0.291667 canonical pixels, below 40/128.
- Legacy whole-picture and fallback browser checks: **11 passed**. The old fallback fixture now explicitly selects its cat subject.
- Every one of the 11,552 registered cells was decoded and checked for nonempty content, unclipped bounds and valid dimensions. All 80 turn pictures per pet have two separate actual sole clusters in the 220–226 canonical strip. The first 218-row detector included an ankle antialiasing bridge; the refined strip measures the soles and keeps the same two-support requirement.
- Actual PNG sole-alpha centroids: 164 consecutive support observations per pet, maximum world drift 0.004786 canonical pixels and measurement error 0.006614 pixels. This is independent raster evidence in addition to pose mathematics.
- Independent visual review covered the named references, all final turn pictures, complete action/rest sheets, all dense stop-track sheets and focused mouth-opening frames. No remaining inspected clipping, single-paw collapse, ear endpoint snap or mouth threshold pop was found.

Normal/quarter-speed review playback sampled 36 finite runs. A heavy synchronous RGBA-readback run observed one 116ms interval during Maltese turning; the other 35 runs had maxima no higher than 21ms. A separate lightweight playback check ran twelve walk/turn trials without pixel readback: 1,056 callbacks, maximum per-run p95 18ms, maximum interval 23ms, no page exceptions. The isolated long interval was not reproduced; concurrent load/readback is a possible contributor, not a proven sole cause.

## Signed packaged application

Built using the installed Electron 44.7.0 distribution, explicit local ad-hoc signing and hardened runtime:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --mac --arm64 --config.electronDist=node_modules/electron/dist --config.mac.identity=- --config.directories.output=.artifacts/couple-puppies/package
```

Both new pets passed actual packaged Electron probes with temporary profiles, all removed afterward. The final standalone Maltese walk recorded 109 fractional root submissions and 90 selected pictures, p95 17.6ms/max 17.7ms. Golden recorded 217 fractional submissions and 116 selected pictures, p95 9.1ms/max 9.3ms. The different callback rates are observations, not a promise of a particular screen refresh rate. Whole-source distance agreed with committed root travel. Staged drawing failures held exact old pixels/root; stop/care, pause, reduced motion, drag and resize checks passed. Ordinary travel made zero native host-position calls.

Captured surface pixels resolved a requested 0.25DIP root movement as 0.250091DIP Maltese and 0.254262DIP Golden. A prior concurrent Maltese run and its captures are retained separately; final surface proofs refer to the standalone run.

Deep strict signature verification passed. Independent final integrity verification: **65 checks, zero mismatches**; all 290 new asset files match public, dist and ASAR. All 672 dist, three Electron and fourteen core files match the packaged contents. ZIP CRC passes for all 823 file members; all 280 bundle file/symlink members match the signed application. Original restored files and older archives, including 0.5.0, remain unchanged.

Archive: `release/PawPal-0.5.1-mac-arm64.zip`, **255,900,990 bytes**.

SHA-256: `d98d4f6dc0e6a18153e8d2f23a5c713088affbc948517cd471758f99e7ce0400`.

Evidence and reproducible audit scripts are in `.artifacts/couple-puppies/`, particularly `appearance-review.md`, `motion-qa-report.md`, `release-integrity-report.md`, `verify-release-integrity.py`, `qa-source-audit.py`, `qa-raster-contacts.py`, `qa-playback-light.mjs` and `visual-packaged-{maltese,golden}/`.

## Reviewable preview and limits

Preview: http://127.0.0.1:5173/.artifacts/couple-puppies/index.html. It uses the production Pet, controller, source cache, renderer and visual motion driver, with normal/half/quarter speed, pause, next-picture and sole markers. The development server remains running for this preview. A local complete-picture character proof is in `.artifacts/couple-puppies/characters.png`.

These are finite source, browser, packaged GUI and captured-surface checks. They do not establish universal zero dropped frames or physical display scanout timing, nor an exact pixel-for-pixel copy of pre-existing sticker poses. Unusual cross-display/DPR migrations and click-through into another native application were not exhaustively exercised in this revision. The local application was ad-hoc signed, not Apple notarized. No installed application, persistent user profile, external publication or paid service was changed.
