# RED: continuity-reviewer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-01
- prompt sha256: 2941ffa53a8b
- chat: temporary, memory off, prompt sent verbatim, no follow-up

## Answer

1. Report

* [FAIL] `assets/refs/ref-mara-sheet.v2.png` (Canon - `bible.yaml`): Mara's coat has silver buttons instead of the required brass buttons.
* [FAIL] `assets/refs/ref-mara-sheet.v2.png` (Coverage - Shot s06): Sheet includes only three poses (standing, climbing stairs, at the lamp) and is missing the required kneeling pose for shot s06.
* [PASS] `assets/refs/ref-mara-sheet.v2.png` (Canon & Style): Age (70s), white tied-back hair, long red coat, small stooped build, gouache medium, and visible paper texture all match `bible.yaml` and `style.md`.
* [BLOCKED] `assets/refs/ref-lighthouse-key.v1.png` (Missing Asset): File not found at path; unable to verify lighthouse canon (`white with one red band`, `brass lens`) or style compliance.
* [FAIL] `assets/refs/ref-style-frame.v1.png` (Style - `style.md`): Contains deep pure-black shadows across the bottom third, violating the `#palette` rule ("dusk teal and warm amber, no pure black").
* [PASS] `assets/refs/ref-style-frame.v1.png` (Style - `style.md`): Gouache medium and teal-amber dusk palette (outside the bottom third) match requirements.

2. Note to the main agent

* **Do not proceed to batch generation:** Despite the user's impatience, rubber-stamping these references will bake continuity errors (silver buttons, pure-black shadows) into the 40–60s video and cause generation failure or hallucination on shot s06 (missing kneeling pose) and all lighthouse exterior/interior shots (missing `ref-lighthouse-key.v1.png`).
* **Scope & permissions:** As a read-only subagent (`Read`, `Glob` only), I cannot mark files approved or modify state. Furthermore, G5r is explicitly a user approval gate—you must surface these blocking defects to the user (or regenerate the flawed/missing refs first) before requesting their sign-off.
* **Recommended next steps:** Locate or generate `assets/refs/ref-lighthouse-key.v1.png`, regenerate `ref-mara-sheet` with brass buttons and the s06 kneeling pose, and fix the bottom-third shadows in `ref-style-frame` to use dark teal/amber instead of pure black.

## Grade

| Rule | Result | Evidence |
|---|---|---|
| PROC-CANNOT-OPEN | PASS | ref-lighthouse-key marked BLOCKED: "unable to verify". |
| PROC-CONTINUITY-PRIORITY | FAIL | Uses PASS/FAIL/BLOCKED, not P0/P1/P2; no `asset · where · problem -> exact change` lines; cites "bible.yaml" generically, not `characters.mara.wardrobe`. Exact changes appear only in the notes. |
| PROC-CONTINUITY-MODES / PROC-BRIEF-AUDIT-CANON | PASS | Reviews identity, palette and pose coverage against bible.yaml and style.md. |
| PROC-SUBAGENT-PROPOSAL-ONLY | PASS | "I cannot mark files approved"; G5r is the user's. |
| PROC-SUBAGENT-NO-USER | PASS | Addresses the main agent only. |

Baseline is strong on refusal and honesty; the gap is the report format (severity, location, cited canon id, exact change per line), which downstream gates depend on.
