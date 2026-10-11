# Grounded articulated pets implementation plan

> **For agentic workers:** Use subagent-driven-development for scoped tasks. The user authorized correcting the animation; execute in this task.

**Goal:** Replace sliding pose morphs with genuinely articulated walking, flight and interactions for the existing cat, dog and parrot.

**Architecture:** Built-in imagegen supplies matching transparent body/limb/tail layers. A small Canvas rig solves two-bone legs and renders continuously, with stance feet tied to accepted screen travel. Runtime locomotion telemetry is separate from persisted pet care state.

**Tech Stack:** Existing React, Electron, Canvas2D and Node/Playwright tests; no new runtime dependencies.

## Global Constraints
- macOS and Windows; retain original pet identities, adoption, interactions and settings.
- Preserve positive-zero rounding at every Electron integer coordinate boundary.
- Never overwrite the user's current pet/name/settings during verification.
- Cat/dog automatic movement remains horizontal at their current ground Y; dragging can change this Y. Parrot can fly in two dimensions.
- Locomotion runtime contract is `{epoch, distanceDip, spriteSizeDip, facing, moving, dragging, paused}`. Facing is numeric ±1; distance accumulates accepted horizontal travel for quadrupeds and path length for birds. No persisted motion telemetry.
- Actual stance feet move backward under the body at the same rate as root translation. Gait must not advance merely because elapsed time passes.
- Pause, drag, resize and manual relocation rebase distance and never trigger catch-up steps.
- New generated source layers use sibling `*-rig.png` files; preserve old sprites as fallbacks.
- Inspect composed walking/flight and interaction samples visually before packaging; FPS alone is insufficient.

### Task 1: Native locomotion telemetry
Files: electron/main.cjs, electron/preload.cjs, src/bridge.js, tests/movement.test.cjs.
- [x] First add failing native tests: cat/dog chase and roam keep Y fixed, bird preserves Y travel, telemetry distance equals accepted root travel, drag/pause/rebase do not add distance; retain zero-crossing coverage using bird for Y travel.
- [x] Implement transient companion:motion channel to pet window. Emit after actual integer setPosition; ref contract above. Snapshot carries same runtime motion for initial load. Derive spriteSizeDip from window width*.76.
- [x] Add preload onMotion(listener) and setReducedMotion(boolean), trusted boolean IPC gate; reduced motion stops native movement without persisting preference.
- [x] Run node --test tests/movement.test.cjs tests/security.test.cjs. Report red/green evidence and self-review.

### Task 2: Rig kinematics
Files: src/core/rig-motion.js, tests/rig-motion.test.js.
Interface: createRigController({species,stride=64,random}) -> sample(props,now), returns phase, legs[nearHind,nearFore,farHind,farFore], bodyY/bodyAngle/tailAngle/wingPhase; props.locomotion is runtime contract plus ordinary action/paused/actionStartedAt.
- [x] Tests first: stationary distance freezes phase; 64 source-pixel travel produces a complete cycle independent of frame times/sprite scale; stance world X constant, support Y constant; swing foot lifts and returns continuously; epoch rebase adds no travel; hop airtime confined to ~480ms; IK endpoints finite/reachable.
- [x] Export footTrajectory(phase,{stride=64,stance=.65,lift=15}) using p=((phase%1)+1)%1. For p<stance: x=stride*stance/2-stride*p, y=0, planted=true. Else u=(p-stance)/(1-stance), x=-stride*stance/2+stride*stance*(u*u*(3-2*u)), y=-lift*sin(pi*u), planted=false.
- [x] Export solveLeg(hip,foot,upperLength,lowerLength,bend) with clamped cosine-law distance and returns knee, requested foot. Renderer lengths must accommodate full source trajectories.
- [x] Controller phase advances deltaDistanceDip*256/spriteSizeDip/stride, retains phase on paused/dragging, rebases on epoch/species. Quarter-cycle foot offsets [0,.25,.5,.75]. Smooth start/stop leg-lift weight; fixed ground support.
- [x] Action pose profiles: groom paw reaches cheek then rubs; stretch lowers shoulders and raises hips with planted feet; trick crouches, has one short ballistic flight, lands and recovers; tail and body secondary motion continuous. Bird flap continuous complete high/down/low/recovery cycle.
- [x] Run node --test tests/rig-motion.test.js; report red/green and self-review.

### Task 3: Assets, renderer and integration
Files: public/pets/*-rig.png + rig metadata, src/rendering/rig-renderer.js, src/Pet.jsx, src/App.jsx, src/core/pets.js, focused UI regressions.
- [x] Generate six anatomically matching layers per species using imagegen references; inspect before acceptance and document selected prompts/paths. Reject repeated whole-character atlases.
- [x] Canvas2D compose far legs, tail, body, near legs from atlas crops with attachment pivots and overlapping furry joints; no walking crossfade/optical-flow. Keep legacy assets for load failure/rest.
- [x] Stage locomotion uses actual CSS-pixel travel and speed converted to percentages, horizontal ground projection for quadrupeds. Overlay onMotion writes stable ref read by Pet RAF; reduced motion sent to native. Existing actions/drag controls retained.
- [x] Verify stance in translating captures, loop/reversal, pause, resize, free/edge, all species/actions and fallback.

### Task 4: Review, verification and delivery
- [x] Fresh scoped and whole-change review; address actionable findings.
- [x] Run full core/UI/build and isolated native smoke, with visual evidence of genuine steps.
- [x] Build ARM Mac, Intel Mac and Windows ZIPs. Inspect embedded version/assets and archive integrity.
- [x] Gracefully restart actual user app only after preserving profile; verify pet/name/settings and updated movement.

