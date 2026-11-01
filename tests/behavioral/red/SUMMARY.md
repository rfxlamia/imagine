# RED summary (WP5, 2026-11-01)

One RED run per scenario: `imagine` on ChatGPT (GPT 6.1 Sol High), the other ten on Gemini (Gemini 4 Argon Low). Per-rule grades are in each file's `## Grade` section.

| Scenario | Fails | Partial | Pass |
|---|---|---|---|
| imagine | GATE-QUOTE, HARD-GATES-RECORDED, PROC-IMPACT-CONFIRM, HARD-WAIVER-SCOPED | — | GATE-G4, HARD-WAIVER-USER-ONLY |
| imagine-canon | — | PROC-REMOTE-LISTEN, PROC-PRONUNCIATION-LEVERS | 5 rules |
| imagine-plan | PROC-PATCH-ROUNDS | PROC-AUDIT-REREAD | 3 rules |
| imagine-generate | — | — | all 6 |
| imagine-edit | — | HARD-HF-ALLOWLIST | 5 rules |
| imagine-deliver | — | HARD-RASTER-TIER | 6 rules |
| storyboard-artist | HARD-ENTITIES-EXIST / PROC-UPSTREAM-BLOCKED, HARD-PATCH-KEYS (inputs) | PROC-STORYBOARD-NO-DROP, HARD-STORYBOARD-ASSET-DECL | 3 rules |
| previz-designer | PROC-PREVIZ-NO-STRETCH, PROC-CAMERA-WRAPPER, HARD-PATCH-KEYS (inputs) | — | 4 rules |
| fx-designer | HARD-NO-CSS-FILTER-RASTER | HARD-FX-WEBGL-FALLBACK | 4 rules |
| scene-builder | PROC-SCENE-LINT-BLOCKED | — | 5 rules |
| continuity-reviewer | PROC-CONTINUITY-PRIORITY | — | 4 rules |

## Cross-cutting patterns for WP6 briefs

1. **Approved canon edited without an impact report.** imagine (both models), imagine-canon (L04 rewritten), imagine-deliver (mix edited after G6). Every skill that can touch an approved source needs the impact-then-yes step written as a hard stop, including edits after G6.
2. **User words reused as a gate quote.** imagine (both models) recorded a gate with a change request as the quote. The gate rule must say the quote is the user's answer to that gate's question.
3. **Waiver confusion.** Models either deny waivers exist (imagine pilot) or offer to record one themselves (imagine-edit). Skills must separate: D10 allowlist (automatic advice), user-granted scoped waiver (REVIEW.md with quote), non-waivable list.
4. **Retry caps lose to deadlines.** imagine-plan (round 4), scene-builder (lint try 4). State the cap as a count that includes the attempt that just failed, and make "blocked + report" the only next step.
5. **Patch `inputs` invented.** storyboard-artist and previz-designer filled `inputs` with placeholders or notes. Agent files must say: inputs are hashes of sources actually read, one per id/anchor/unit used, never placeholders.
6. **Upstream gaps worked around instead of reported.** Bosun as a prop, previz stretching duration, god-rays approximated without `unsupported`. Subagents must return blocked (or the explicit unsupported marker) rather than design around a missing fact.
7. **Imaginary capabilities.** Upscaler (twice), TTS speed (twice), punctuation "slowing" delivery. Skills must list what does not exist, not only what does.
8. **Fallback fields as a back door.** fx-designer put `css-filter` in `fallback`. Rules on a mechanism apply to fallbacks too.
9. **Unobserved outcomes reported as fact.** imagine-plan ("applied cleanly, rev 7"), scene-builder (`{"ok": true}`), imagine-deliver ("fixed automatically"). Require quoting the actual tool output before claiming a result.
10. **Report format.** continuity-reviewer used PASS/FAIL instead of P0/P1/P2 with cited canon ids and exact changes.

Strong baselines to hold in GREEN: imagine-generate, imagine-edit, continuity-reviewer refusals, G5r discipline.
