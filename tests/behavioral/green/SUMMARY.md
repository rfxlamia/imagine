# GREEN summary (WP7, 2026-11-03)

One GREEN run per scenario, same model as its RED run: `imagine` on ChatGPT (GPT 6.1 Sol High), the other ten on Gemini (Gemini 4 Argon Low). Prompts unchanged from RED (hashes match); each answer pasted back, graded per rule, and instruction fixes applied between rounds where a rule failed. Per-rule grades are in each file's `## Grade` sections. Earlier rounds are kept next to the latest result as `<name>.<slug>.r<N>.md`, so no round is overwritten.

Upload format: per-scenario pack (`run.mjs pack --for <name>`), one markdown bundle with the fixed GREEN preamble. The first two `imagine` rounds used the full-plugin bundle and showed why that fails: ChatGPT only searched it on demand (it quoted the SKILL.md waiver paragraph when asked, yet called HARD-STORY-UNIT-ONCE non-waivable in two runs). The small per-scenario bundle is what Claude Code actually loads for one skill or agent.

## What each result is bound to

Every result header records the round, the sha256 of the instruction bundle that was attached, and the commit that carries it:

- `- round` - which round of that scenario this is.
- `- prompt sha256` - the scenario prompt, compared against RED. This answers "did the prompt change", not "which instructions were tested".
- `- bundle sha256` - the exact upload bundle. This answers "which instructions were tested".
- `- tested commit` - the commit that carries the result.

`run.mjs check <name> <slug>` re-checks a stored answer (yaml parsed with a real yaml parser, patch keys the scenario requires and their types), and the test suite verifies that each recorded bundle sha256 is the bundle as it stood at its recorded commit.

A result only validates the bundle it was produced with. When an instruction file changed after the run, the result is reported against the bundle it actually tested, and the scenario is listed below as needing a re-run.

`run.mjs pack` writes a pack manifest (`tests/behavioral/packs/<scope>.json`, not committed): the bundle sha256, the commit and a per-file hash list of exactly the bytes that were uploaded. `run.mjs save green` requires that manifest and refuses when the bundle on disk no longer matches it, so a result always states the instructions it was really tested against.

## Results

69 grade rows across the 11 scenarios, 68 PASS. The one FAIL is `HARD-PATCH-KEYS` in fx-designer: the stored patch does not parse as yaml and omits the required top-level `brief_hash`, so it is not an applicable patch and the answer is retained as a blocked diagnostic.

One further defect is recorded but does not change a grade: the scene-builder answer's yaml block does not parse (the lint json is quoted with a shell-style `'\''` escape, which yaml rejects). The report it belongs to still carries the lint json verbatim, so the graded rules hold; the defect is listed in the test suite's known-defects baseline.

| Scenario | Rounds | Bundle tested | Tested commit | Rows | Result |
|---|---|---|---|---|---|
| imagine (chatgpt) | 3 | `3f448e8dfb92` | `b074ac3` | 7/7 | PASS, but pre-dates the waiver-list fix and the story-validator policy fix below |
| imagine-canon | 1 | `d6e2d19def7c` | `6c39af3` | 7/7 | PASS, but pre-dates the waiver-list fix and the story-validator policy fix below |
| imagine-plan | 1 | `1113a4f264f4` | `a1a35f5` | 5/5 | PASS, but pre-dates the waiver-list fix and the story-validator policy fix below |
| imagine-generate | 1 | `d6434c752cbc` | `7f3364f` | 6/6 | PASS, but pre-dates `02a1fe0` |
| imagine-edit | 1 | `5c4e230cf234` | `003866a` | 6/6 | PASS, but pre-dates `02a1fe0` and the answer contradicts the final policy |
| imagine-deliver | 2 | `636169a82fb5` | `5565d1b` | 7/7 | PASS, but pre-dates the waiver-list fix and the story-validator policy fix below |
| storyboard-artist | 1 | `b26ce7dd93a7` | `8a731e5` | 8/8 | PASS against the final bundle |
| previz-designer | 2 | `bf078ec3bb01` | `5297aae` | 7/7 | PASS against the final bundle |
| fx-designer | 1 | `0693197e7816` | `d106542` | 5/6 | FAIL on HARD-PATCH-KEYS; bundle is current, the result is not |
| scene-builder | 1 | `be8881340492` | `c1bf6cc` | 6/6 | PASS against the final bundle; the answer's yaml block does not parse |
| continuity-reviewer | 1 | `f5e7e90c87f3` | `e87eea2` | 5/5 | PASS against the final bundle |

## Required re-runs

The bundle changed after these runs, so their results do not validate the final instructions:

1. **imagine-edit, imagine-generate** - `02a1fe0` clarified that a failed strict check stays user-waivable. The imagine-edit answer still calls unallowlisted strict-check findings non-waivable, which directly contradicts the final policy. Re-run both against the final bundle.
2. **imagine, imagine-canon, imagine-plan, imagine-deliver** - the non-waivable list was made consistent across the skills: the raster quality floor (no `replan` tier ships; a `soft` tier needs G4 and G5b acceptance) is now non-waivable everywhere it is enumerated, not only in the delivery skill, and the story validators the kit runs before G4 (for example HARD-STORY-UNIT-ONCE) are non-waivable too, because `imagine-kit gate G4 approve` refuses a story error whatever REVIEW.md says. These four bundles changed twice. Their stored answers do not contradict the new policy, but they were not tested against it.
3. **fx-designer** - the stored answer is a blocked diagnostic, not an applicable patch. Re-run against the final bundle.

Re-runs are manual web-chat runs: open a temporary chat, attach the per-scenario bundle, paste `run.mjs prompt <name> --green`, save with `run.mjs save green`, then check with `run.mjs check` before grading.

## Instruction fixes landed during WP7 (each gate-checked, committed on wp7/green-runs)

1. `e7a7721` skills/imagine SKILL.md section 8: non-waivable list exhaustive; story validators waivable via planning patch or scoped user waiver (imagine round 1 failure).
2. `02a1fe0` skills/imagine-edit review-and-recovery.md section 3.3 + skills/imagine-generate SKILL.md section 8.2: integrity ban is on reporting a failed strict check as clean; HARD-HF-STRICT stays user-waivable (aligned with proposal section 8.0 Q5; surfaced by imagine-edit GREEN).
3. `eaf2166` skills/imagine-deliver SKILL.md section 5.1: six replan options inline (imagine-deliver round 1 PARTIAL).
4. `9926345` agents/previz-designer.md section 6.2: inputs-manifest rule explicitly covers notes (previz round 1 PARTIAL).
5. This branch: the raster quality floor was added to every enumeration of the non-waivable list (skills/imagine SKILL.md section 8, skills/imagine references/waivers.md section 1, skills/imagine-deliver SKILL.md section 7, skills/imagine-deliver references/waivers-and-review.md section 3.3, skills/imagine-plan references/review-failures-and-recovery.md section 6.1, skills/imagine-canon references/approvals-and-recovery.md section 6). Before this, the central list was exhaustive and did not list the raster floor, while the delivery skill offered no waiver for a `replan` raster. The delivery skill and the imagine-deliver answer already treated the raster floor as non-waivable.
6. This branch: the same six enumerations now list the story validators the kit runs before G4 as non-waivable. Before this, skills/imagine SKILL.md section 8 called HARD-STORY-UNIT-ONCE waivable and the imagine scenario expected a waiver scoped to it, but the kit refuses a story error at G4 and never reads REVIEW.md, so such a waiver could not have cleared the gate. `docs/contracts/rules.yaml` HARD-NON-WAIVABLE was updated to name the raster floor and the story validators, and a test now fails when the registry and the skill enumerations disagree.
7. This branch: `run.mjs` parses the yaml in a stored answer with a real yaml parser instead of an indentation heuristic, fails closed when a scenario that requires an applicable patch gets none, and binds a GREEN result to the bundle that was actually uploaded rather than to the checkout at save time.

## WP7 conclusions for WP8

- Instruction comprehension holds under the same model family that failed RED, once the files are loaded the way Claude Code loads them. RED's failures were not luck: the fixed instructions flip every one.
- Cross-cutting RED pattern "unobserved outcomes reported as fact" faded everywhere (rev 7, `{"ok": true}`, "fixed automatically" all gone) without a dedicated fix.
- A scenario is only GREEN for the bundle it was tested with. Recording the bundle sha256 and the tested commit with every result is what makes that auditable; without it, "all 11 scenarios pass" cannot be checked.
- A rule the kit decides cannot be waived, so the skills must not offer one. The imagine scenario's HARD-WAIVER-SCOPED criterion changed with that policy: it no longer accepts a waiver scoped to HARD-STORY-UNIT-ONCE, because no such waiver can clear G4. The positive path of scoping a waiver to one rule is therefore no longer covered by any scenario; WP8 should cover it with a rule the kit does not decide.
- Remaining known gaps, carried to WP8 as beads, not instruction work:
  - `imagine-z8p.8` telemetry env prefix vs hook (scene-builder GREEN supports the plugin-settings option).
  - ChatGPT-with-attachment behaviour is not representative of Claude Code; WP8 runs the real plugin.
- Minor off-target observations, no action: previz asks for already-supplied style hashes (over-cautious), scene-builder cites its telemetry note as "Section 3.2".
