# Contact-aware Walking and Action Handoffs

The user retains the realistic plush appearance and requests substantially more motion connections. They clarified that walking speed itself is secondary: the feet do not agree with travel. This iteration continues the previously approved appearance and motion direction without another approval gate or a git commit.

## Diagnosis

Version 4 directly resets most interaction clips, so changing from walking or an unfinished care pose teleports to the next action's first frame. Its epoch reset also discards visual bridges even when the epoch changed only because of a native interaction. The generated walking sequence contains supporting paws that stay nearly stationary relative to the body. Changing its stride alone cannot make a stationary relative paw agree with a translating root.

Three alternatives were considered: more optical-flow frames would retain the incorrect support trajectory; replacing every character with another generated atlas would risk the approved appearance; a constrained deformation of a single complete source image can preserve its texture and join the existing motion graph. The last approach is the initial implementation, subject to actual-pixel and visual acceptance. If the deformation fails anatomical or contact checks, do not ship it merely because its phase math passes.

## Motion design

Use v5 metadata and separate fields while retaining v4 and prior release archives. Cat and dog walk through a single whole-image mesh with independently marked visible paws, visible leg surface bends and fixed torso/head anchors. Hidden anatomical joints are not claimed as measured coordinates. During support, each visible paw's canonical x retreats by exactly the accepted root travel. During swing it lifts, moves forward and lands; no elapsed-time walking while the root is stationary. The head and torso retain their source texture and registration. The bird keeps its flight semantics and is not tested against a ground-contact rule.

Starting lifts and places the preparing paws in sequence over160ms; cancelling preserves each paw's actual partial progress. Stopping settles feet through a short420ms lift-and-place sequence before joining the original standing pose. Starting, stopping, care entry, care return, care replacement and repeat requests use an interruptible route. Every switch starts at the currently painted pose, including partial interpolation. Keep the native and preview root stationary until the painted walking route and first-step preparation are ready, using a movement-intent epoch handshake. Route existing valid clip edges to a neutral endpoint, then use separately measured standing-port fields to reach the destination. Keep explicit source-frame safeguards for incompatible view/occlusion edges and report them honestly.

Native telemetry rebasing is separate from visual interruption. Pause, drag and reduced motion freeze the exact displayed pose and transition progress. Accepted physical distance remains the gait clock. Preserve the existing 800ms grounded turn and its interruption semantics; fill its endpoint connection where compatible. A subsequent first-step preparation holds the root after that800ms turn if needed. Cap other handoff routes at800ms and budget that lead-in in each care action lifetime. Repair the dog sleep route that currently includes a standing frame between lying and sleeping.

## Acceptance

Verify support with observed source paw pixels and rendered world coordinates, not self-reported procedural contact values. Compare old and new world-foot drift over each measured stance, at multiple sizes and movement speeds. Inspect silhouettes and mesh winding across the full cycle. Check start/stop, walking-to-care, care-to-care, repeated tokens, cancellation, sleep interruption, epoch changes, pause/resume and facing reversal. Check all new field pairs in the real renderer; rejected fields cannot count as successful geometric connections. Rebuild a preview showing actual root travel against a fixed ground reference, then validate the packaged arm64 application and preserve the real user profile.
