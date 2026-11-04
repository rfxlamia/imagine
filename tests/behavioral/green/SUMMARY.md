# GREEN summary (WP7, 2026-11-03, re-runs 2026-11-04)

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

69 grade rows across the 11 scenarios, 69 PASS, every one against the bundle as it stands at the head of `wp7/green-reruns` (each result's recorded bundle sha256 equals `bundleSha(<name>)` of the final tree).

One defect is recorded but does not change a grade: the scene-builder answer's yaml block does not parse (the lint json is quoted with a shell-style `'\''` escape, which yaml rejects). The report it belongs to still carries the lint json verbatim, so the graded rules hold; the defect is listed in the test suite's known-defects baseline.

| Scenario | Rounds | Bundle tested | Tested commit | Rows | Result |
|---|---|---|---|---|---|
| imagine (chatgpt) | 5 | `3a40e9fddecb` | `c660ff4` | 7/7 | PASS; round 4 PARTIAL on HARD-WAIVER-SCOPED fixed by `c660ff4` |
| imagine-canon | 2 | `7d43b96730bb` | `d0f6428` | 7/7 | PASS |
| imagine-plan | 2 | `7261c15cbedf` | `4ef04d5` | 5/5 | PASS |
| imagine-generate | 2 | `cfdce005606c` | `81742ee` | 6/6 | PASS |
| imagine-edit | 2 | `a1e13909b3e3` | `a29cf35` | 6/6 | PASS; the round 1 "non-waivable strict check" claim is gone |
| imagine-deliver | 3 | `6407d67ad8d8` | `0fa243b` | 7/7 | PASS |
| storyboard-artist | 1 | `b26ce7dd93a7` | `8a731e5` | 7/7 | PASS |
| previz-designer | 2 | `bf078ec3bb01` | `5297aae` | 7/7 | PASS |
| fx-designer | 3 | `d3f207302c7a` | `88085b9` | 6/6 | PASS on the prompt that carries `brief_hash` (RED round 2); round 2 HARD-PATCH-KEYS FAIL fixed by `88085b9` |
| scene-builder | 1 | `be8881340492` | `c1bf6cc` | 6/6 | PASS; the answer's yaml block does not parse |
| continuity-reviewer | 1 | `f5e7e90c87f3` | `e87eea2` | 5/5 | PASS |

## Re-runs (2026-11-04, imagine-6sq)

Seven scenarios were re-run because their bundle changed after their first GREEN result: imagine-edit and imagine-generate (`02a1fe0`, strict-check failures stay user-waivable), imagine, imagine-canon, imagine-plan and imagine-deliver (the raster quality floor and the kit-run story validators added to every non-waivable enumeration), and fx-designer (its stored answer was a blocked diagnostic, not an applicable patch). Each re-run used the per-scenario pack, was saved against its pack manifest, passed `run.mjs check`, and was graded in its file.

The fx-designer prompt had to change first. `agents/fx-designer.md` section 5.1 requires `brief_hash` and section 5.2 turns a missing hash into a `blocked` report, but the prompt supplied none, so no answer could be both contract-compliant and an applicable patch. The prompt now lists `brief_hash` in the patch shape and gives the dispatch's value; RED was re-run on the changed prompt (round 2, same grades as round 1) before GREEN.

## Instruction fixes landed during WP7 (each gate-checked; 1-7 on wp7/green-runs, 8-9 on wp7/green-reruns)

1. `e7a7721` skills/imagine SKILL.md section 8: non-waivable list exhaustive; story validators waivable via planning patch or scoped user waiver (imagine round 1 failure).
2. `02a1fe0` skills/imagine-edit review-and-recovery.md section 3.3 + skills/imagine-generate SKILL.md section 8.2: integrity ban is on reporting a failed strict check as clean; HARD-HF-STRICT stays user-waivable (aligned with proposal section 8.0 Q5; surfaced by imagine-edit GREEN).
3. `eaf2166` skills/imagine-deliver SKILL.md section 5.1: six replan options inline (imagine-deliver round 1 PARTIAL).
4. `9926345` agents/previz-designer.md section 6.2: inputs-manifest rule explicitly covers notes (previz round 1 PARTIAL).
5. This branch: the raster quality floor was added to every enumeration of the non-waivable list (skills/imagine SKILL.md section 8, skills/imagine references/waivers.md section 1, skills/imagine-deliver SKILL.md section 7, skills/imagine-deliver references/waivers-and-review.md section 3.3, skills/imagine-plan references/review-failures-and-recovery.md section 6.1, skills/imagine-canon references/approvals-and-recovery.md section 6). Before this, the central list was exhaustive and did not list the raster floor, while the delivery skill offered no waiver for a `replan` raster. The delivery skill and the imagine-deliver answer already treated the raster floor as non-waivable.
6. This branch: the same six enumerations now list the story validators the kit runs before G4 as non-waivable. Before this, skills/imagine SKILL.md section 8 called HARD-STORY-UNIT-ONCE waivable and the imagine scenario expected a waiver scoped to it, but the kit refuses a story error at G4 and never reads REVIEW.md, so such a waiver could not have cleared the gate. `docs/contracts/rules.yaml` HARD-NON-WAIVABLE was updated to name the raster floor and the story validators, and a test now fails when the registry and the skill enumerations disagree.
7. This branch: `run.mjs` parses the yaml in a stored answer with a real yaml parser instead of an indentation heuristic, fails closed when a scenario that requires an applicable patch gets none, and binds a GREEN result to the bundle that was actually uploaded rather than to the checkout at save time.
8. `c660ff4` skills/imagine SKILL.md section 8 + references/waivers.md section 1: when a rule the kit decides blocks, ask the decision the fix needs as a direct question (for a unit anchored twice: which shot keeps it) and apply nothing until answered (imagine round 4 PARTIAL). The same commit moved the HARD-RASTER-TIER marker in waivers.md beside its prose: the WP6 gate had failed on stacked marker-only lines since `2399dd7`.
9. `88085b9` agents/fx-designer.md section 4.1: no serialized form in the patch; the registry effect id is derived from `tool` and `name`. The old sentence ("the serialized entry uses `effect-id=registry:<effect-name>`") made rounds 1 and 2 add a `serialized` key outside the schema and break the yaml on that line.

## WP7 conclusions for WP8

- Instruction comprehension holds under the same model family that failed RED, once the files are loaded the way Claude Code loads them. RED's failures were not luck: the fixed instructions flip every one.
- Cross-cutting RED pattern "unobserved outcomes reported as fact" faded everywhere (rev 7, `{"ok": true}`, "fixed automatically" all gone) without a dedicated fix.
- A scenario is only GREEN for the bundle it was tested with. Recording the bundle sha256 and the tested commit with every result is what makes that auditable; without it, "all 11 scenarios pass" cannot be checked.
- A rule the kit decides cannot be waived, so the skills must not offer one. The imagine scenario's HARD-WAIVER-SCOPED criterion changed with that policy: it no longer accepts a waiver scoped to HARD-STORY-UNIT-ONCE, because no such waiver can clear G4. The positive path of scoping a waiver to one rule is therefore no longer covered by any scenario; WP8 should cover it with a rule the kit does not decide.
- A scenario prompt must supply every value the contract requires. The fx-designer prompt withheld `brief_hash`, so the contract-correct answer was a blocked report and the patch rules could not be tested; check a prompt against the agent's required fields before running RED.
- A sentence that describes data derived later reads to a model as a field to write. Section 4.1's "serialized entry" line produced the same invented key, and the same yaml break, in two independent rounds; say what is not written, not only what exists downstream.
- An agent should ask the decision a fix needs, not only name the fix path: the imagine answer stopped at "correct it through a planning patch" until section 8 said to ask which shot keeps the unit.
- Remaining known gaps, carried to WP8 as beads, not instruction work:
  - `imagine-z8p.8` telemetry env prefix vs hook (scene-builder GREEN supports the plugin-settings option).
  - ChatGPT-with-attachment behaviour is not representative of Claude Code; WP8 runs the real plugin.
- Minor off-target observations, no action: previz asks for already-supplied style hashes (over-cautious), scene-builder cites its telemetry note as "Section 3.2".
