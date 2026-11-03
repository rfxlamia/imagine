# GREEN summary (WP7, 2026-11-03)

One GREEN run per scenario, same model as its RED run: `imagine` on ChatGPT (GPT 6.1 Sol High), the other ten on Gemini (Gemini 4 Argon Low). Prompts unchanged from RED (hashes match); each answer pasted back, graded per rule, and instruction fixes applied between rounds where a rule failed. Per-rule grades are in each file's `## Grade` sections (earlier rounds are kept in-file).

Upload format: per-scenario pack (`run.mjs pack --for <name>`), one markdown bundle with the fixed GREEN preamble. The first three `imagine` rounds used the full-plugin bundle and showed why that fails: ChatGPT only searched it on demand (it quoted the SKILL.md waiver paragraph when asked, yet called HARD-STORY-UNIT-ONCE non-waivable in two runs). The small per-scenario bundle is what Claude Code actually loads for one skill or agent.

Final result: **all 11 scenarios pass every target rule.** Rules that failed or were partial in RED: 16 of 16 now pass; RED passes all held.

| Scenario | Rounds | Fixes made between rounds | Final |
|---|---|---|---|
| imagine (chatgpt) | 3 | SKILL.md section 8: non-waivable list is exhaustive; HARD-STORY-* waivable | 7/7 PASS |
| imagine-canon | 1 | — | 7/7 PASS |
| imagine-plan | 1 | — | 5/5 PASS |
| imagine-generate | 1 | — | 6/6 PASS |
| imagine-edit | 1 | — (reviewed under round-1 instructions; strict-check waiver clarity fixed after in imagine-edit/imagine-generate) | 6/6 PASS |
| imagine-deliver | 2 | SKILL.md section 5.1: all six replan options listed inline | 7/7 PASS |
| storyboard-artist | 1 | — | 8/8 PASS (vs 8 targets incl. PASS rows counted per row) |
| previz-designer | 2 | agents/previz-designer.md section 6.2: inputs rule extends to notes | 7/7 PASS |
| fx-designer | 1 | — | 6/6 PASS |
| scene-builder | 1 | — | 6/6 PASS |
| continuity-reviewer | 1 | — | 5/5 PASS |

## Instruction fixes landed during WP7 (each gate-checked, committed on wp7/green-runs)

1. `e7a7721` skills/imagine SKILL.md section 8: non-waivable list exhaustive; story validators waivable via planning patch or scoped user waiver (imagine round 1 failure).
2. `02a1fe0` skills/imagine-edit review-and-recovery.md section 3.3 + skills/imagine-generate SKILL.md section 8.2: integrity ban is on reporting a failed strict check as clean; HARD-HF-STRICT stays user-waivable (aligned with proposal section 8.0 Q5; surfaced by imagine-edit GREEN).
3. `eaf2166` skills/imagine-deliver SKILL.md section 5.1: six replan options inline (imagine-deliver round 1 PARTIAL).
4. `9926345` agents/previz-designer.md section 6.2: inputs-manifest rule explicitly covers notes (previz round 1 PARTIAL).

## WP7 conclusions for WP8

- Instruction comprehension holds under the same model family that failed RED, once the files are loaded the way Claude Code loads them. RED's 16 failures were not luck: the fixed instructions flip every one.
- Cross-cutting RED pattern "unobserved outcomes reported as fact" faded everywhere (rev 7, `{"ok": true}`, "fixed automatically" all gone) without a dedicated fix.
- Remaining known gaps, carried to WP8 as beads, not instruction work:
  - `imagine-z8p.8` telemetry env prefix vs hook (scene-builder GREEN supports the plugin-settings option).
  - ChatGPT-with-attachment behaviour is not representative of Claude Code; WP8 runs the real plugin.
- Minor off-target observations, no action: previz asks for already-supplied style hashes (over-cautious), scene-builder cites its telemetry note as "Section 3.2".
