# PawPal 0.5.2 — Maltese & Golden Retriever original artwork

Verified 2026-10-14. The user explicitly selected original artwork and original actions exactly. The existing `maltese` and `golden` identities now use complete Moonlab public animation preview frames from LINE Store products 24856130 and 24856095. Other pets, prior authored sources, legacy artwork and older archives are retained.

Each original pet exposes 24 animations in the main panel and common original animations in the desktop toolbar. Source props and two-character scenes stay intact. The original renderer preserves the source 320×300 canvas, original fractional delays, frame ordering and finite repeat counts; after the original repeats finish it holds the last frame. Users can restart, pause, resize and manually position the pet. Original pets stay stationary, consistent with the chosen original-action scope and the absence of matching original free-walk/turn tracks in these sets.

## Source and playback evidence

- `python3 tests/original-assets.test.py`: two tests pass. Every one of the 741 complete RGBA frame crops equals its independently decoded source bytes: Maltese 370, Golden 371. All original delays, repeat counts, provenance, source copies and fallbacks match. An additional synthetic APNG checks separate-default-image exclusion and unequal delays/infinite repeats.
- `npm test`: 397 passed, zero failed, skipped or cancelled. Includes 13 source-timeline controller tests, state persistence and original command validation. Test-first failures were recorded in the task reports.
- `npm run build`: succeeds at version 0.5.2.
- `npx playwright test tests/original-puppies.spec.mjs --workers=1 --reporter=line`: nine passed. All 48 clips load and advance; a sampled complete 320×300 browser canvas for each clip equals its full atlas crop. Restart, reload persistence, pause, reduced motion, stationary anchors and legacy cat care/rendering pass.
- `npx playwright test tests/couple-puppy-integration.spec.mjs --workers=1 --reporter=line`: four passed. Original onboarding layout at 1440px/390px, adoption, selection and persisted reload pass.
- Independent scoped review passes Tasks 1–3 with no confirmed Critical/Important defect or required production fix.

## Packaged native evidence

The actual 0.5.2 ARM64 app was launched under a newly owned temporary profile. Both original pets passed complete source-crop equality for sampled original clips 7/3/24, animation selection and restart IPC, paused pixel holds, blocked selection while paused, transparent visible full-surface overlays, manual placement and proportional resizing. Stationary checks observed 8,452ms and 8,424ms, 33 samples each; no automatic root travel occurred. The legacy cat still loaded its authored renderer. The app was closed and the temporary profile removed after checking.

The dedicated reproducible probe is `scripts/smoke-original-electron.mjs`, supporting `PAWPAL_PACKAGED_EXECUTABLE`. Its report, JSON, two actual native overlay screenshots and six native canvas captures are under `.artifacts/couple-puppies-exact/`.

## Final archive integrity

Built with the installed Electron distribution and local ad-hoc signing:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --mac --arm64 --config.electronDist=node_modules/electron/dist --config.mac.identity=- --config.directories.output=.artifacts/couple-puppies-exact/package
```

Deep/strict code signature verification passes. All 790 built/runtime files in ASAR match the current workspace byte-for-byte. All 100 new original files match public, dist and ASAR. Production package metadata matches after the packager's intentional removal of only scripts, devDependencies and build configuration. ZIP CRC verification passes with no errors.

Archive: `release/PawPal-0.5.2-original-mac-arm64.zip`, 271,495,659 bytes.

SHA-256: `a9a3d2bdc28568adabeabb557895b1f33882286f32c1d0bd80f1c692e3adb994`.

Integrity checks are reproducible with `.artifacts/couple-puppies-exact/verify-release-integrity.mjs`. Review/probe reports and raw verification logs are in the same directory. Product preview: http://127.0.0.1:5173/ . Official source comparison remains at http://127.0.0.1:5173/.artifacts/couple-puppies-exact/references/index.html .

## Practical scope

Equality covers all decoded source data and selected software canvas frames. Browser/display scheduling does not establish that every picture physically appears at an exact theoretical instant under all machine loads. Async reversal/cancellation was reviewed by control flow, while automated browser source checks used sequential selection. Native image fitting was checked through source dimensions, `object-fit: contain`, resize checks and inspected actual captures. This is a locally ad-hoc signed ARM64 build; this revision does not provide newly tested Intel/Windows packages or Apple notarization. No installed app, existing persistent user profile or external publication was changed.
