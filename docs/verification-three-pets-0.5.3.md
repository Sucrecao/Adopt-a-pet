# PawPal 0.5.3 — three available companions

Verified 2026-10-14. The user requested removing 奶糖 and 豆包. The current catalog and desktop adoption IPC now accept only `maltese`, `golden` and `parrot`. Fresh state defaults to Maltese.

Saved cat/dog identities migrate to Maltese. Adopted status, stats, settings and custom names survive. Historical default names are replaced with 马尔济斯; obsolete care actions and original animation selection reset to idle/clip7. Existing Maltese, Golden and parrot selections remain unchanged. Historical source artwork and releases are retained outside the current selectable catalog.

## Verification

- Three retirement/migration regression tests observed failing baseline and then passed.
- `npm test`: 400 passed, zero failed/skipped/cancelled. Old native planner harnesses now use supported test-only authored-motion identities. Separate production-catalog cases verify original puppies remain stationary.
- Targeted browser files `original-puppies.spec.mjs` and `couple-puppy-integration.spec.mjs`: all 15 distinct cases passed. Includes the three-card list at desktop/mobile sizes, all 48 original animation source crops, both saved-state migrations and parrot care controls/feeding.
- `npm run build`: passed. Scoped review found no actionable catalog/migration/IPC issue.
- The 0.5.3 ARM64 bundle was built with the installed Electron distribution and local ad-hoc signing. Deep/strict signature validation passed. Packaged catalog/state/security/main/index match current files; package version is0.5.3. ZIP CRC reports no errors.
- The live 0.5.2 application was quit and 0.5.3 launched. Native accessibility state confirmed the new ASAR path, visible version0.5.3 and exactly the three adoption controls: Maltese 马尔济斯, Golden Retriever 金毛, 鹦鹉 青柠. Existing user selection and95% size/edge preference remained visible.

Archive: `release/PawPal-0.5.3-mac-arm64.zip`,271,495,292 bytes.

SHA-256: `e5165fe1ac0c4efee5d7dc64a051c9bee28323e2e19d592d0e6669f6846280e5`.

Logs/review/integrity evidence: `.artifacts/three-pets/`. The broad historical browser suites containing retired cat/dog adoption or catalog-derived legacy fixture mounts were not run in this update; this report claims the scoped current-product browser checks above.
