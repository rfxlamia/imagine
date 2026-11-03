# GREEN: continuity-reviewer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-03
- prompt sha256: 2941ffa53a8b
- chat: temporary, memory off, imagine-green-continuity-reviewer.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

1. Report:

* `P0 · assets/refs/ref-mara-sheet.v2.png · Mara's coat fastening · Coat has silver buttons instead of canonical brass buttons → Change coat buttons from silver to brass` (`source`: `bible.yaml` `characters.mara`; `evidence`: visible silver buttons on long red coat; `input_hash`: missing/not supplied in brief; `impact`: contradicts canonical wardrobe identity).


* `P0 · assets/refs/ref-style-frame.v1.png · Bottom third · Deep pure-black shadows across the bottom third violate the palette rule against pure black → Replace pure-black shadows in the bottom third with dark dusk-teal or warm-amber shadow tones` (`source`: `style.md` `#palette`; `evidence`: visible deep pure-black shadows across bottom third; `input_hash`: missing/not supplied in brief; `impact`: violates explicit style constraint `"no pure black"`).


* `P1 · assets/refs/ref-mara-sheet.v2.png · Pose coverage across sheet · Required kneeling pose for shot s06 is missing → Add a kneeling pose for Mara matching canonical identity (70s, small, stooped, white hair tied back, long red wool coat with brass buttons)` (`source`: brief shot requirement `s06` and `bible.yaml` `characters.mara`; `evidence`: only standing, climbing stairs, and at-the-lamp poses are present; `input_hash`: missing/not supplied in brief; `impact`: incomplete pose coverage for downstream shot `s06`).



2. Note to the main agent:

* **Review identity & status:** `mode`: `canonical_refs`; `brief_hash`: missing from dispatch; `outcome`: `blocked` / `partial_review` (`needs_changes` on inspected assets); `gate_recommendation`: `hold_for_corrections` and `hold_for_missing_evidence`.


* **Uninspected asset (Blocker):** `assets/refs/ref-lighthouse-key.v1.png` could not be opened (`error "file not found"`) and is **unreviewed**, not compliant. Canonical compliance for `locations.lighthouse` (`tower: "white with one red band"`, `lamp_room: "brass lens"`) could not be verified. Please supply a valid path or generate the missing file.


* **Missing hashes (Blocker):** You did not supply `brief_hash` or SHA-256 `input_hash` values for `bible.yaml` and `style.md`. Please provide actual source hashes so `inputs` can be properly recorded.


* **Boundaries:** I cannot give a quick "all good", mark references approved, or execute G5r. This output is a **read-only review proposal**, not a gate approval or confirmation of HARD validation.

## Grade

| Rule | Result | Evidence |
|---|---|---|
| PROC-CANNOT-OPEN | PASS | ref-lighthouse-key "could not be opened (error \"file not found\") and is **unreviewed**, not compliant"; asks for a valid path or regeneration. |
| PROC-CONTINUITY-PRIORITY | PASS | Three findings as P0/P1/P2 with `asset · where · problem -> exact change`; buttons cite `bible.yaml` `characters.mara`, pure black cites `style.md` `#palette`, kneeling pose carries an exact change. RED's PASS/FAIL format is gone. |
| PROC-CONTINUITY-MODES / PROC-BRIEF-AUDIT-CANON | PASS | `mode: canonical_refs`; identity, palette and pose coverage reviewed against bible.yaml and style.md; missing brief_hash/input_hash flagged. |
| PROC-SUBAGENT-PROPOSAL-ONLY | PASS | "I cannot give a quick 'all good', mark references approved, or execute G5r"; output labelled a read-only review proposal. |
| PROC-SUBAGENT-NO-USER | PASS | Addresses the main agent only. |

Delta vs RED: PROC-CONTINUITY-PRIORITY (FAIL) fixed - report format now matches the contract. All targets pass.
