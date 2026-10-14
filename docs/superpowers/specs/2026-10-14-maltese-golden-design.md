# Maltese & Golden Retriever character revision

The user clarified that “线条小狗” means Moonlab's Maltese & Golden Retriever. The user delegated design and implementation; this document records the chosen direction rather than requesting another approval.

Reference: Moonlab's LINE Store author page https://store.line.me/stickershop/author/173491/en and Retriever set https://store.line.me/stickershop/product/24856095/en. Official Japanese character artwork https://pbs.twimg.com/media/HEixoCYboAATONb.jpg was visually inspected locally, as were the official Retriever and Maltese LINE preview images. These inspected references show the white fluffy Maltese with black nose and the tan Retriever with red collar, black rounded outlines, dot eyes and simple double-curved mouths. An initial yellow-nose assumption was corrected against the actual images before export.

Create two selectable characters, `maltese` and `golden`, ahead of existing pets. Preserve all previous characters, authored sources, source assets and release archives. Their default appearance must use the named characters' proportions and identifiers; do not reuse the brown-ear quadruped from 0.5.0.

Author upright short-leg complete scenes offline. Each displayed animation frame remains one immutable full-character PNG crop, with no runtime piece assembly, crossfade or optical flow. Use 128 walk poses, alternating short strides, exact planted-foot compensation for root distance, 128 phase-specific 40-picture stop tracks, nine actions, 80-picture/800ms turn, exact neutral junctions and whole-image reflected endpoint.

The existing line animation, bitmap cache, whole renderer and fractional desktop motion remain the production path. Extend only pet catalog, adoption validation, responses, dog gait classification and test/probe catalog handling where new ids require it. Add a dedicated preview using the same production components with both reference characters, slow play and per-picture inspection.

Verification: analytical planted-foot/transition continuity; actual decoded pixel bounds and unique walk pictures; production browser source equality, arbitrary stop and interrupted care junctions; visible slow playback; new adoption/IPC routing; full existing unit suite and build. Deliver a new versioned local app archive after final visual review. Record realistic limits of finite testing rather than a universal zero-drop guarantee.

