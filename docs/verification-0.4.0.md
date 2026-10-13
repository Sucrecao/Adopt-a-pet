# PawPal 0.4.0 verification

Date: 2026-10-11. Deliverable: `release/PawPal-0.4.0-mac-arm64.zip`.

## Change

Cat, dog and cockatiel retain realistic plush identities and now paint one complete animal per animation frame. Whole atlases take priority over the existing optional rig/flow fallback. Each species has nine clips; idle uses the installed Codex Snoopy reference's 6.6-second timing. Walking advances from accepted desktop displacement. Cat/dog turn in place for 800 ms; parrot flight mirrors immediately.

Uniform species scale and registration preserve full anatomy and transparent silhouettes. Grounded feet share baseline 226; hop frame 42 retains airborne baseline 204. Parrot flight uses a stable head anchor. The final parrot was regenerated with more space between poses; all 45 populated source crops contain one whole character. Asset provenance and exact prompts are recorded in the adjacent prompt documents.

## Results

- `npm test`: 159/159 passed.
- `npm run test:ui -- --workers=2`: 102/102 passed. Covers actual component rendering, care, turning, displacement, freeze, species changes, asset failures and fallback.
- `npm run build`: passed.
- `python3 scripts/register-whole-atlas.py --check`: all three final registrations passed. Registered poses and visible alpha stay inside the 256×256 canvas.
- Packaged executable smoke: all three species passed care, visible movement, reversal, pause/drag/reduced motion, sizing and actual restart persistence. Cat/dog stationary reversal measured 802/800 ms. Care recordings contained 2–5 distinct whole frames; parrot flight switched direction without a grounded hold.
- Final packaged PNG/JSON files are byte-identical to the verified source assets; application and package versions both read 0.4.0.
- `unzip -tq release/PawPal-0.4.0-mac-arm64.zip`: passed.
- `git diff --check`: passed. Independent final review found no material issues.

Native verification used fresh temporary profiles and removed them after completion. The installed app and user's saved pets/settings were not replaced. Native results and canvas captures are in `.artifacts/whole-native-smoke.json` and `.artifacts/whole-native-{species}.png`. White/dark composites and the interactive comparison were visually inspected; transparent image previews can show display artifacts that are absent in opaque composites and actual playback.

## Delivery scope

Apple Silicon Mac package and source are updated to 0.4.0. Intel Mac/Windows packages remain 0.3.2. This local Mac build has no Developer ID signature. The interactive comparison uses the actual new playback code with smaller embedded artwork; Snoopy comparison clips are available for idle, walking and hopping. Other selected actions show Snoopy's idle reference. Visual smoothness remains a judgment to make from playback; automated checks establish frame, timing and interaction behavior.
