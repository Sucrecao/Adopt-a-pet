# PawPal 0.4.1 verification

Date: 2026-10-11. Deliverable: `release/PawPal-0.4.1-mac-arm64.zip`.

## Change

Realistic plush cat, dog and cockatiel identities are preserved. Each species now has 96 authored whole-body poses on two pristine 1448×1086 PNG pages, compared with 45 populated poses in 0.4.0. Required clip counts are idle 12/rest 4/walk 16/turn 16/pet 8/feed 8/groom 8/stretch 8/hop 10, plus six bridge poses. A single intact animal is drawn per frame, without body-part deformation or blended silhouettes.

Care timings now occupy the accepted native interaction windows: pet 2400 ms, feed 1600 ms×2, stretch 2600 ms and hop 2800 ms. Idle retains 6600 ms, cat/dog turns retain 800 ms, and walking advances from accepted distance using the existing normalized 64px stride. Parrot flight still mirrors immediately. Sleeping, waking, starting and stopping use authored bridges. Interrupted sleep bridges reverse from the visible pose; waking into walking completes the wake and gait-entry poses while preserving accepted travel. New explicit care and reversals supersede bridges immediately. Both pages load atomically, retaining existing fallback artwork when a page is missing or invalid.

## Results

- `npm test`: 174/174 passed, including 34 whole-controller cases.
- `npm run test:ui -- --workers=2`: 111/111 passed, including 37 whole-renderer/component cases.
- `npm run build`: passed.
- `python3 scripts/register-dense-atlas.py --check`: all three deterministic registrations passed. Each page contains 48 whole animals, no registered crop includes a neighboring animal, and all crops fit the 256×256 canvas.
- Independent final review found no material issues in full/partial sleep→walk, care/reversal overrides, freeze/resume, distance conservation and source registrations.
- Packaged version reads 0.4.1. All three packaged metadata files and all six pristine PNG pages match source bytes. Executable is Mach-O arm64; evidence is `.artifacts/dense-asar-verification.json`.
- `unzip -tq release/PawPal-0.4.1-mac-arm64.zip`: passed.
- Packaged native smoke: all three species passed. Each displayed all authored pet/feed/stretch/hop/rest poses (8/8/8/10/4), all four sleep-entry poses and all 16 gait poses. Cat/dog displayed all 16 turn poses during stationary native holds of 809/807 ms; parrot flight moved vertically and mirrored immediately. Accepted-distance phase errors were at most 1.8e-15. Pause, drag and reduced motion froze pixels and native bounds; sizing, saved settings and actual relaunch passed. Evidence: `.artifacts/dense-native-final.log`, `.artifacts/dense-native-final.json` and `.artifacts/whole-native-smoke.json`.

The initial browser run was disrupted by Vite reloading HTML snapshots written by its own tests. The watcher now ignores generated `.artifacts`, `test-results`, `playwright-report` and `release` directories while retaining product HMR. The full stable run then passed. Test navigations honor the configured baseURL.

The initial stricter native phase assertion incorrectly normalized distance by the rendered CSS box. Native movement packets use the window-derived `spriteSizeDip` instead: at the tested size this is 206.72 DIP versus 197.59375 DIP for the CSS box. The smoke test now pairs painted epoch/distance telemetry with its actual native packet and uses its size; product movement code is unchanged by this harness correction.

## Artwork and delivery scope

Exact imagegen prompts, raw output paths, final PNG hashes and registration annotations are in [dense-motion-asset-prompts.md](dense-motion-asset-prompts.md) and the species documents it links. Generated PNGs retain their original pixels and transparency. Registration writes JSON only. Grounded poses share anchor 128/226, hops retain a lift arc, and parrot flight uses eye 172/110. The final parrot targeted repairs keep sleep tucked across 93→12 and soften grooming recovery.

Opaque registered contact sheets and the updated interactive comparison were visually inspected. The comparison uses the final renderer/controller and smaller embedded copies solely to fit the conversation size limit; the app uses full-resolution PNGs. Snoopy reference clips are available for idle, walking and hopping; other selected actions show its idle reference.

Apple Silicon Mac package and source are updated to 0.4.1. Intel Mac/Windows downloads remain 0.3.2. This local Mac build has no Developer ID signature. The user's installed application/profile is not replaced; native checks use disposable temporary profiles. Automated checks establish frame/timing/interaction behavior; final visual smoothness can be judged directly from playback.
