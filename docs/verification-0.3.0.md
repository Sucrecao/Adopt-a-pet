# PawPal 0.3.0 verification

Verified on Apple Silicon macOS on 2026-10-11.

- Core: `npm test`, 101 passed. Includes native/security coordinates, accepted movement telemetry, gait contacts, turning, airborne action composition and reachable limbs.
- Browser: `npm run test:ui`, 23 passed. Includes rendered continuity, expressions/preening, pause pixels, resize/fallback, and in-place turn followed by distance-driven walking.
- Independent code review approved. A focused action/turn probe checked 36,480 leg endpoints without unreachable limbs or planted airborne feet.
- Source Electron smoke: 213 planted-contact pairs, 3 continuing supports across reversal, maximum matched-native world drift 0.35 DIP. Observed root versus painted packet differed by at most 2 DIP; moving packet age at most 22.77 ms. Native RAF p95 was 9.2 ms outside capture encoding. These are measured local results, not cross-platform frame-rate guarantees.
- Production build passed. Both Mac app architectures and Windows x64 ZIP rebuilt; embedded source/assets/version hashes match the final source. All three ZIPs passed CRC and executable/ASAR checks.

The animation uses matching bitmap body, limb, tail/wing and directional head layers with a 2D joint rig. Intermediate direction changes can soften torso contours. This is not a volumetric 3D model. Original atlases remain as fallbacks and for sleeping.

Final Apple Silicon packaged-app smoke passed: 212 support pairs, 2 continuing reversal supports, maximum matched-native contact drift 0.53 DIP; observed root error at most 3 DIP and moving paint lag at most 34.34 ms. Transparency, interactions, exact paused/reduced-motion pixels, signed-zero crossings and temporary-profile persistence also passed.

The actual application was gracefully restarted and visually confirmed at v0.3.0 with the new articulated pet. Its current species, name, adoption and every setting matched the latest pre-update profile. Intel Mac and Windows packages have been built and inspected, but require testing on their target systems. Packages are unsigned.
