# 0.4.1 whole-character motion assets

All six PNG pages were generated or edited with the built-in imagegen tool, then copied byte-for-byte into `public/pets`. Each page contains 48 complete animals in an 8×6 layout; each species has 96 registered poses. Registration reads alpha contours and writes JSON only. It does not repaint, warp, or split the source images.

Exact prompts, reference roles, raw generated paths, rejected candidates and final file hashes:

- [Cat](cat-dense-asset-prompts.md): `cat-whole-v2-motion.png`, `cat-whole-v2-care.png`.
- [Dog](dog-dense-asset-prompts.md): `dog-whole-v2-motion.png`, `dog-whole-v2-care.png`.
- [Cockatiel](parrot-dense-asset-prompts.md): `parrot-whole-v2-motion.png`, `parrot-whole-v2-care.png`.

Final runtime assets and crop registrations are in `public/pets/{species}-whole-v2-{motion,care}.png` and `public/pets/{species}-whole-v2.json`. The measured cockatiel flight eye anchors are in [dense-motion-registration.json](dense-motion-registration.json). Reproduce metadata with `python3 scripts/register-dense-atlas.py`; verify it without changing anything with `python3 scripts/register-dense-atlas.py --check`.

## Authored pose counts

| State | Previous played poses | Refined played poses |
| --- | ---: | ---: |
| Idle | 3–6 depending on species | 12 |
| Sleep | 2 | 4 |
| Walking / flight | 8 / 3 | 16 |
| Cat / dog turn | 6 / 8 | 16 |
| Pet / feed / groom / stretch | 4 each | 8 each |
| Hop | 5 | 10 |
| Sleep / gait bridges | 0 | 6 |

The native cockatiel continues to mirror flight immediately when direction changes; its 16 authored standing-turn poses are available in the atlas without adding a ground-turn delay to flight. Cat and dog turn for the existing 800ms. Gait is driven by accepted displacement with the existing normalized 64px stride; added drawings increase detail rather than slow the pet down.

Clips retain complete animal anatomy and a common ground anchor. Flight uses a measured eye anchor and hops use an intentional lift arc. Stand-to-sleep and gait entry/exit use authored whole-body poses; interrupted bridges reverse from the displayed pose. The preview embeds downsampled copies solely to fit the conversation size limit; the application uses the full-resolution pristine PNGs.
