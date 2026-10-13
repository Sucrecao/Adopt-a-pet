# Double Density Motion Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent artwork and playback tasks in this session. Do not commit or change the user's installed app/profile.

**Goal:** More than double whole-character pose detail and connect cycles and care actions while preserving realistic plush appearance.

**Architecture:** Each species receives two imagegen atlas pages with 96 complete poses. Metadata version 2 registers page/crop/scale and transition tracks, while the renderer/controller retain version 1 compatibility and existing native movement semantics.

**Tech Stack:** Built-in imagegen, React, Canvas 2D, Electron, JSON registration, Pillow read-only analysis, Node/Playwright.

## Global Constraints

- Preserve realistic plush identity and all controls/saved settings.
- One intact animal per drawn frame; no separate anatomy deformation, ghost crossfade or flow-invented intermediate anatomy.
- Two 8×6 pristine generated pages per species; 96 populated poses.
- Required true pose counts: idle12/rest4/walk16/turn16/pet8/feed8/groom8/stretch8/hop10 plus six bridges.
- Native cat/dog turn800 ms, idle6600 ms, displacement stride64; freeze and exact accepted travel persist.
- Care visual timing matches existing pet2400/feed3200/stretch2600/hop2800 interaction windows.
- Retain v1 metadata and fallback compatibility. Publish no remote service; produce local Apple Silicon 0.4.1 trial zip and inline comparison.

## Tasks

### Task 1: Artwork and registration

Files: `public/pets/{species}-whole-v2-motion.png`, `public/pets/{species}-whole-v2-care.png`, `public/pets/{species}-whole-v2.json`, `scripts/register-dense-atlas.py`, `docs/dense-motion-asset-prompts.md`.

- [x] Inspect v1 identity, generate both pages via built-in imagegen using existing v1 as reference. Motion page indices0–47; care page indices48–95 follow exact spec. Document exact prompts/raw paths/hashes.
- [x] Read alpha contours, assign 48 animals per page to row-major cells, reject overlaps/neighbors and inconsistent poses.
- [x] Register complete crops and uniform page scales to common standing baseline226; preserve graded airborne hop displacement and stable parrot flight head anchor. Keep source PNG bytes unchanged.
- [x] Write metadata version2 with pages,96 frames,9 clips,neutralFrame0 and transition tracks. Run deterministic `--check` and inspect contact sheets on opaque backgrounds.

### Task 2: Playback, rendering and actual component

Files: `src/core/whole-animation.js`, `src/rendering/whole-renderer.js`, `src/Pet.jsx`, `tests/whole-animation.test.js`, `tests/whole-renderer.spec.mjs`, `tests/whole-pet.spec.mjs`.

Interfaces: `validateWholeAtlas(imageOrImages,meta)` accepts v1 image or v2 page array. `createWholeRenderer(canvas,{image,images,meta})` selects frame.page. `createWholeAnimationController({species,meta,random})` accepts96 frames and optional whole-frame transitions; existing sample fields stay compatible.

- [x] Add failing tests for page2 drawing/validation,96-frame clip validation, transition freeze/interruption and atomic page loading failure.
- [x] Implement only v2 page support and authored bridge tracks. Keep v1 behavior, exact distance accounting,800 ms turns, repeated care restart and proper cleanup.
- [x] Exercise actual `Pet` with two synthetic pages, failed second page, late species results and bridge freeze. Existing v1 fixtures keep original expectations.
- [x] Run controller tests, renderer pixel tests and actual component integration tests once relevant changes settle.

### Task 3: Final integration and delivery

Files: `src/core/pets.js`, `package.json`, `package-lock.json`, `src/App.jsx`, `README.md`, `docs/verification-0.4.1.md`, `scripts/smoke-whole-electron.mjs`, inline comparison.

- [x] Switch all three species to final v2 metadata/pages and version0.4.1 after visual approval by root. Update native smoke frame membership to metadata-derived clips.
- [x] Inspect actual-size loops, turn seams and care recovery for all three; independently review final source and registrations.
- [x] Run `npm test`, relevant/full browser suite, build, deterministic registration and packaged native smoke with temporary profiles.
- [x] Embed final renderer/controller/pages in the existing comparison, check visible controls/loops in CUA, package with local Electron runtime, verify asar version/assets and zip contents.
- [x] Record counts/real verification and deliver the trial zip with the interactive motion comparison.
