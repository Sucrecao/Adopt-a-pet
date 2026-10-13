# Whole character animation

The user rejected the assembled bitmap rig and requested the harmonious motion of their Codex Snoopy pet. They confirmed that the cat, dog and cockatiel must retain their realistic plush appearance. The accepted task is to redo movement, including the visible frames, rather than continue tuning independent head/body/leg transforms.

## Diagnosis and decision

`Pet.jsx` currently prioritizes `createRigRenderer`. Its head, torso, limbs and tail are different crops, deformed and blended independently. Mathematical ground/support constraints do not establish a coherent silhouette; the cat's frontal turn even retains two blended side bodies. The alternative optical-flow atlas also invents intermediate anatomy. Use complete character frames as in the locally documented Codex pet contract. No independently deformed anatomy, body-view crossfade or optical flow in the new primary path.

Keep the three identities, appearance, existing care controls, transparent native window, movement/dragging and saved preferences. New atlases contain whole animals. Each uses eight columns and six rows, with consistently sized cells and transparent unused cells. Rows: idle/rest, walk, right-to-left turn, pet/feed, groom/stretch, hop. Directions may mirror the complete animal. Source frames are measured and registered to a common grounded baseline with one species-wide scale; intentional hop displacement remains in the artwork.

## Playback

Use discrete opaque whole frames, sustained poses and a persistent clock that freezes during pause, dragging and reduced motion. Walking phase advances from real native/preview displacement and pet size. An eight-frame stationary turn occupies the existing 800ms movement hold and resumes movement after the final frame. Care interrupts locomotion, repeated care restarts, and sleep stays in its full-body curled pose. Missing or invalid complete-frame assets retain the established renderer.

Idle is subtle blinking/breathing; care and ambient actions return to a compatible calm pose. Idle frame cadence follows the local Codex row contract (280,110,110,140,140,320ms). Walk has eight distinct alternating steps. A sprite cell is painted as one image without crossfade or mesh warping.

## Verification

First inspect the generated atlases and looping animations at actual desktop size. Check identity, transparent margins, complete anatomy, fixed scale, grounded steps, loop seam and lack of image ghosting. Exercise actual component/native movement, reversal, all care controls, pause/resume, reduced motion, dragging, size changes and species selection. Existing rig-specific tests remain useful for fallback; replace primary-path assertions with complete-frame behavior assertions instead of pretending the rig remains primary. Package an Apple Silicon preview only after this visual and functional verification. Automated pass counts alone are not evidence of aesthetic success.
