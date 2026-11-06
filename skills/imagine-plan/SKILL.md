---
name: imagine-plan
description: Plan Imagine productions after G3 style approval and before G4 production-plan approval. Use for stage 5 storyboard, stage 6 previz, and stage 8a fx planning; dispatch read-only planning subagents, preserve canonical sources, validate and apply structured STORY.md patches, establish the audio-mode timing clock, calculate per-shot resolution budgets, compile prompts and canonical references, and obtain a quoted human decision at G4. Also use when resuming or repairing a planning stage, handling stale inputs or patch conflicts, or replanning approved shots.
---

# Imagine Plan

## 1. Responsibility and authority

This skill owns three planning stages:

| Stage | Subagent | Output | Boundary |
|---|---|---|---|
| 5 — Storyboard | `storyboard-artist` | Shot structure, narrative, composition, units, asset requirements | G3 style must already be approved |
| 6 — Previz | `previz-designer` | Timing, camera, motion, parallax, beats, transitions | Storyboard patch must be applied; clock must exist |
| 8a — FX plan | `fx-designer` | Effects, grade, overlays, supported fallbacks | Previz patch must be applied |

The main agent is the coordinator, validator, semantic auditor, patch applier, and G4 presenter. Planning subagents are proposal authors only. They never approve their own work and never modify project files.

This skill does not own G0–G3 canonical authoring, G5 asset generation and review, stage 8b implementation, stage 9 editing, G6 picture lock, or G7 delivery. Route those responsibilities to `imagine`, `imagine-canon`, `imagine-generate`, `imagine-edit`, or `imagine-deliver` as appropriate.

Stage numbers are labels, not execution order. Follow the dependency DAG: `5 storyboard → 6 previz → 8a FX plan → G4 → 7 generate → 8b implement → 9 edit`; in particular, stage 8a precedes G4 approval and stage 7 generation.

Do not bypass earlier gates, manufacture approvals, or treat a proposed plan as an approved production plan.

The governing contracts are the files under `docs/contracts/` on the installed plugin revision. If a required schema, command argument, project path, or capability cannot be confirmed from those contracts, stop the affected operation and report the missing contract information. Do not infer an interface from an earlier proposal.

## 2. CLI boundary

From this skill, invoke the kit with:

```bash
node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...
```

The command placeholder represents a documented argument sequence. Refer to this invocation as `imagine-kit` throughout this skill.

The Phase 1 kit command inventory is exactly:

- `new`
- `status`
- `gate`
- `validate story`
- `patch apply`
- `img`
- `tts`
- `stage-shot`
- `promote-shot`
- `export-hf`
- `render`
- `qc`

No other kit command is available. In particular, there is no brief, guard, stage start/finish, patch validate, diff-keys, lock, document writer, waiver manager, readtime, beats, resolution-budget calculator, or capability-discovery command. Perform the assigned responsibilities in the main agent's instructions; never synthesize an undocumented kit invocation.

The command named `imagine-kit patch apply` is the planning write boundary. `imagine-kit tts` is the documented TTS adapter; it is not evidence that a playback-speed parameter or scratch-specific output mode exists.

For every kit call:

1. Use the arguments documented in `docs/contracts/cli-contract.md`; do not invent option names.
2. Capture the process exit status, stdout, and stderr.
3. Parse the final stdout line as the JSON envelope described by that contract.
4. Record the actual returned field names and values. Quote fields such as `ok`, `code`, `data`, or `error` only if present in the actual envelope; never fabricate missing fields or substitute an assumed schema.
5. Determine success from the documented exit status and envelope together.
6. Report the actual revision, paths, failures, and changed items returned by the call; never report an unobserved success.

A failed, malformed, or missing envelope is not success, even if some earlier stdout text appears favorable.

### HyperFrames boundary

Use HyperFrames directly, always pinned to version `0.8.223`, with telemetry disabled in the main-agent command:

```bash
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 normalize-audio
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict
```

Supply additional arguments only from the applicable installed HyperFrames contract.

These are not kit subcommands. HyperFrames must never be allowed to write the canonical `STORY.md` through `editStoryboard` or another independent writer.

Do not invent registry names, shader names, transition names, unsupported audio options, or features merely because a similar tool exists elsewhere.

## 3. Mandatory files

The main agent, not the subagent, must read the full contents of the listed files before starting each stage.

Repeat the full reads after resume, after context compaction, when entering a different planning stage, and whenever a relevant canonical source or contract changes. A remembered summary, a previous subagent message, or a prior stage's hashes do not replace the current full reads.

A stage may start only after all of its mandatory files have been read in the current context. The main agent obtains authoritative scoped source hashes from `imagine-kit status --ref` and its actual `data.sources`, then includes them in the dispatch. The patch author echoes those supplied values, labels them as supplied rather than independently verified, and never substitutes a full-file hash for a required section hash. The main agent checks the values again before patch application. <!-- rule:HARD-BRIEF-CURRENT -->

### 3.1 Plugin files — every planning stage

Read all of these files in full:

- `docs/contracts/rules.yaml`
- `docs/contracts/cli-contract.md`
- `docs/contracts/source-formats.md`
- `docs/contracts/claude-code-platform.md`
- `skills/imagine/SKILL.md`
- `skills/imagine-canon/SKILL.md`
- `skills/imagine-plan/SKILL.md`
- `skills/imagine-plan/references/dispatch-and-patch.md`
- `skills/imagine-plan/references/clocks-resolution-and-production.md`
- `skills/imagine-plan/references/review-failures-and-recovery.md`

Also read the registered planning subagent definition for the stage:

| Stage | Required agent definition |
|---|---|
| 5 | `agents/storyboard-artist.md` |
| 6 | `agents/previz-designer.md` |
| 8a | `agents/fx-designer.md` |

Resolve those agent paths against the plugin registration before dispatch. If a named agent definition is absent or registered at a different path, use the verified registered definition, document the actual path, and do not dispatch an unverified agent.

Any additional plugin file required by the current rules registry, source-format contract, or selected registered mechanism must also be read in full. In particular, load the actual registry definitions for every effect, transition, shader, overlay, or treatment the plan intends to use; a name-only summary is insufficient evidence of support.

### 3.2 Project files — stage 5 storyboard

Within the active project under `.imagine/<p>/`, read in full:

- `project.yaml`
- `script/narration.md` when G0 `audio_mode` is `narrated`, otherwise `script/copy.md`
- `bible.yaml`
- `style.md`
- `STORY.md` if already created
- `review/REVIEW.md` if present, to establish current gate and item decisions
- `assets/manifest.yaml` if present, to establish existing asset identity and status

If this is the first storyboard creation and `STORY.md` does not exist, verify its absence instead of inventing its contents. Never treat missing approved canonical files as empty.

Read the actual project-file paths required by the G0 delivery specification, including its format, frame rate, platform, duration range, and mode.

### 3.3 Project files — stage 6 previz

Read in full:

- `project.yaml`
- The selected `script/narration.md` or `script/copy.md`
- `bible.yaml`
- `style.md`
- `STORY.md`, including current revision and all shots
- `review/REVIEW.md` if present
- `assets/manifest.yaml` if present
- The authoritative clock artifact for the G0 audio mode and every actual source file from which it was measured or derived
- Every current source or asset referenced by the storyboard and needed for motion or resolution planning

Resolve the clock source by G0 audio mode: narrated work uses the actual per-line scratch timing record and referenced scratch recordings. When the documented kit scratch path is used, its timing output is `tmp/scratch-vo/durations.yaml`; another explicitly authorized scratch-reading method may produce the timing record, but the measured WAV used as a `scratch` clock must be stored at the canonical kit path `tmp/scratch-vo/<line>.wav`. Distinguish how the recording was obtained from where the kit resolves its clock input. Before dispatch, verify each such clock with `imagine-kit status --ref clock:<line>=scratch` and use the returned scoped hash; unresolved clocks block stage 6. Music-led work uses the licensed music provenance and actual generated beat-grid output. Text-led work uses `script/readtime.yaml`, including an explicitly approved per-unit override. Read the applicable authoritative artifact and its actual source inputs.

The applicable clock evidence is required before previz dispatch; absence blocks stage 6.

### 3.4 Project files — stage 8a FX plan

Read in full:

- `project.yaml`
- The selected `script/narration.md` or `script/copy.md`
- `bible.yaml`
- `style.md`
- `STORY.md`, including the applied previz
- `review/REVIEW.md` if present
- `assets/manifest.yaml` if present
- The current clock record and its referenced sources
- The applicable, verified HyperFrames registry and effect capability definitions

Resolve any additional source paths referenced by the intended FX operations and read those actual files. Do not invent a capability query or assume a previously known registry is unchanged.

Every audit or review of a planning result must explicitly include the current on-disk `bible.yaml` and `style.md` as mandatory references, even if the stage's input list already contains them. <!-- rule:PROC-BRIEF-AUDIT-CANON -->

### 3.5 Required read completion

Before dispatch, record:

- Stage and project identity.
- Current G0–G3 decisions and required approval states.
- Exact file paths read and their SHA-256 hashes.
- `STORY.md` revision and hash, or its verified initial absence.
- Applicable stage key set and current script-unit inventory.
- Clock version and source hashes, if applicable.
- Applicable capability and resolution evidence.
- Any missing mandatory file or unresolved fact.

Do not dispatch while a required read is incomplete.

## 4. Stage execution

### 4.1 Common dispatch and merge

Every planning dispatch follows this sequence:

1. Confirm the prior stage and applicable gates are ready.
2. Complete the mandatory reads in section 3.
3. Assemble the full dispatch brief with current source contents and hashes.
4. Snapshot and hash protected files.
5. Dispatch the correctly registered read-only planning subagent.
6. Receive its final-message patch or explicit `blocked` report.
7. Save the patch verbatim to its stage round file.
8. Re-hash protected files and restore the recorded snapshot on unauthorized modification.
9. Manually preflight the patch structure, keys, sources, references, and clock constraints.
10. Perform an independent semantic audit against current canon.
11. If rejected, re-dispatch to the same subagent within the three-round limit.
12. If accepted, invoke `imagine-kit patch apply` and inspect its real envelope.
13. Verify the resulting `STORY.md`, revision, history, and affected item status from disk and the documented command result.
14. Report the completed stage and the next applicable stage.

The main agent must embed the complete mandatory file contents in the subagent dispatch, not paths or summaries alone, and require patch `inputs` to echo hashes for all referenced source sections. <!-- rule:PROC-BRIEF-EMBED -->

Detailed dispatch, patch, validation, and retry rules are in `references/dispatch-and-patch.md`.

### 4.2 Stage 5 — storyboard

Input: approved G1 script units, G2 bible, G3 style, G0 delivery specification, and available resolution capabilities.

The storyboard must:

- Translate each locked unit into a visual action without silently rewriting the script.
- Build an ordered sequence of uniquely identified shots.
- Identify characters, locations, assets, composition, framing, and required layers.
- Explain shot-to-shot cause and effect.
- Assign every script unit a unique timeline placement.
- Estimate durations and total production time.
- Declare per-raster resolution needs.
- Preserve canon identities and avoid unsupported invented details.

The storyboard agent owns the shot narrative, but cannot edit the canonical script or bible.

After applying the storyboard patch, verify shot headings, IDs, unit coverage, and estimated duration before entering stage 6.

### 4.3 Stage 6 — timing clock and previz

Select the clock solely from G0 `audio_mode`: measured scratch voice for narrated work, a beat grid from licensed music for music-led work, or an explicit read-time plan for text-led work. <!-- rule:PROC-CLOCK-PER-MODE -->

Build and verify that clock before dispatching `previz-designer`.

The previz must define:

- Exact shot durations and timing.
- Camera transforms and easings.
- Per-layer parallax and travel.
- Unit anchoring, voice timing, text holds, and beats.
- Transition mechanisms and ranges.
- Sound cue placements.
- Poster/thumbnail intention and motion assertions.
- Per-layer effective raster-resolution requirements.

Reject timing that stretches source material without authorization, violates G0 duration, or ignores unit and clock constraints.

### 4.4 Stage 8a — effects planning

Dispatch `fx-designer` only after the previz has been applied.

The FX plan must identify:

- Effect IDs and supported tools.
- Verified registry or shader identifiers.
- Parameter ranges and timing.
- Grade and overlay intentions.
- Dependencies on final assets.
- Real fallbacks for unsupported primary effects.
- Effects that must remain disabled until final-asset review.

An unavailable mechanism must be marked `unsupported` with a feasible alternative; do not silently approximate a required effect.

CSS raster-filter prohibitions apply equally to primary mechanisms and fallback fields.

Stage 8a produces plans, not implementation files.

## 5. Required invariants

These invariants apply to all stage proposals and all applied planning revisions.

### 5.1 Canonical writing

Only the structured patch route writes planning keys in `STORY.md`, and only the kit's documented editing route writes editing keys; do not manually rewrite the file or use HyperFrames `editStoryboard`. <!-- rule:HARD-STORY-WRITERS -->

Storyboard is the only planning stage authorized to change shot narrative. Previz and FX may change only their own registered stage keys.

Every shot has a unique `sNN` identifier, and the number of parsed shots must equal the number of shot headings. <!-- rule:HARD-STORY-IDS -->

Every locked `L##` or `T##` unit must be anchored exactly once on the film timeline; a unit may span an edit through an intentional J-cut or L-cut without acquiring a second anchor. <!-- rule:HARD-STORY-UNIT-ONCE -->

### 5.2 Timing

Narrated timing must avoid unintended simultaneous voiceover and fit all required voice material inside the root composition. <!-- rule:HARD-VO-NO-OVERLAP -->

For text-led work, display each `T##` unit for at least its calculated or explicitly approved read-time duration. <!-- rule:HARD-TEXTLED-READTIME -->

For music-led work, require an available music asset with recorded provenance and an acceptable licence before treating the beat plan as production-ready. <!-- rule:HARD-MUSICLED-ASSET -->

Music-led cuts marked `on_beat` must land within one actual G0 frame on either side of their assigned beat-grid position. <!-- rule:HARD-MUSICLED-BEAT -->

The sum of the planned timeline, including transitions as defined by the actual composition semantics, must remain inside the G0-approved duration range. <!-- rule:HARD-DURATION -->

### 5.3 Visuals

Prefer separated background, middle-ground, character, and foreground plates when parallax or reuse is needed; compose 9:16 natively rather than horizontally squeezing landscape imagery. <!-- rule:ADV-LAYERED-PLATES -->

Every character that appears in two or more distinct poses, expressions or motion phases is planned in `assets/plan.yaml` as pose-sheet groups (`sheet: <group>`, 2-4 members, identical `refs` and `size`); plan enough poses (emotions, anticipation / action / follow-through phases) that characters change pose between and within shots instead of only being slid around; a pose is planned as a single image only when its `required_px` is larger than a sheet cell delivers (about 627 px square from a ~1254 px output), and that reason is written into the G4 plan. <!-- rule:PROC-POSE-SHEET -->

For 9:16 work, prefer roughly 1–2-second shots, approximately 1.35× title sizing, and no more than about five words per claim line where the approved style does not demand otherwise. <!-- rule:ADV-VERTICAL -->

Advisory defaults guide underspecified style decisions. They never override the G0 specification, approved canon, or hard constraints. Record a short reason when intentionally departing from an advisory default.

## 6. G4 production-plan gate

G4 presents the production plan as a human decision, not an internal planning completion flag.

Before requesting approval, assemble:

1. Current `STORY.md` with applied storyboard, previz, and FX plans.
2. Per-shot coverage of all locked script units.
3. Compiled production prompts and asset requirements.
4. Complete canonical reference list with characters, required poses, pose-sheet groups and each cell's expected q, environment keys, and style frame.
5. Per-layer resolution budgets and per-shot resolution tiers.
6. Audio-mode clock and timing evidence.
7. Production time, generation count, and quota or cost estimates with stated assumptions.
8. Music source, licence, and credit metadata, or the explicit permitted absence of music.
9. Unsupported capabilities, planned alternatives, and unresolved risks.
10. Scope of the proposed G4 decision and downstream G5r, G5a, and G5b work.

Require a direct user answer to the actual G4 approval question and record that answer verbatim, rather than reusing the user's earlier request or change instruction as approval. <!-- rule:GATE-QUOTE -->

G4 covers the production plan, prompts, canonical reference inventory, resolution tiers, estimates, and music licence; do not enter batch generation until this plan has passed its human gate. <!-- rule:GATE-G4 -->

After G4, route canonical-reference creation and G5r review to `imagine-generate`. Its batch-image boundary must not be bypassed.

A G4 decision does not approve individual G5r references, G5a audio lines or cues, or G5b images.

## 7. Recovery, impact, and review

On a missing bible fact, unsupported essential requirement, rejected patch, source change, or failed gate, use `references/review-failures-and-recovery.md`.

Do not solve upstream omissions by inventing downstream material.

Do not modify an approved source until the user has seen a dependency impact report and explicitly authorized the affected source change. The same stop applies after G6.

Replanning must preserve unaffected approvals and re-open only the items actually invalidated by the change.

Record material planning actions, failures, patches, tool evidence, user decisions, and reasons in the project audit trail using the documented project format.

Do not write approval-looking records for inferred consent or missing human responses.

## 8. Completion contract

A planning run is complete only when:

- All stage-mandatory reads were performed in the current context.
- Dispatch guards and patch-round limits were respected.
- All accepted patches were applied through the documented kit operation.
- Resulting disk state and command envelopes were actually observed.
- Story, unit, timing, capability, and resolution validations pass.
- Required G4 materials are complete.
- G4 has an explicit, recorded user decision.

Report separately:

- **Applied:** verified patch outcomes and current revision.
- **Proposed:** material awaiting application or human approval.
- **Blocked:** failures, missing facts, unmet prerequisites, or exhausted retries.
- **Re-opened:** previously approved items invalidated by source changes.
- **Next:** the exact permitted next stage.

Never label a proposed, unaudited, or unobserved outcome as applied or approved.
