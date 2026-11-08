---
name: imagine-edit
description: Implement Imagine's stage 8b fx-implement and stage 9 edit. Use when staged shots need scene-builder implementation, shadow-project validation and promotion, a root HyperFrames timeline, voice/music/SFX mixing, strict checks, review snapshots, a draft rough-mix render, or G6 picture lock. Owns the editing workflow, mandatory source reads, dispatch integrity, timing, motion assertions, media licensing, review findings, user-only waivers, and recovery from blocked or stale work. Never treats agent judgement as tool evidence or records picture lock without the user's explicit answer.
---

# Imagine Edit — Stages 8b and 9

This skill owns shot implementation, composition promotion, film assembly, audio mixing, technical validation, review, and G6 picture lock.

It does not approve canon, invent missing upstream decisions, silently change approved sources, or substitute agent judgement for a HARD check.

## 1. Runtime contract

### 1.1 Kit invocation

From this skill, invoke the bundled kit as:

`node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`

On a host other than Claude Code, the `CLAUDE_SKILL_DIR` placeholder above is not substituted: use `node "<R>/packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`, where `<R>` is the absolute directory two levels above this SKILL.md, confirmed by `node "<R>/host/plugin-root.mjs" --skill-dir "<R>/skills/imagine-edit"` printing `"ok":true` (protocol `imagine-root/1`, `docs/contracts/harness-portability.md` section 4). Never resolve the kit from the working directory, `PATH`, or a global install.

Call it `imagine-kit` below. Run from the film project's root unless the command contract explicitly requires another working directory.

Phase 1 exposes exactly these twelve commands:

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

No additional kit command is implied. In particular, there is no brief, stage start/finish, guard, lock, doc write, waiver, review confirm, capabilities, readtime, beats, loudness, check, safe-band, res-budget, audio-page, assets subcommand family, extended validate family, patch validate, diff-keys, or fork command.

Use the kit's actual argument contract and help where necessary. Never invent a flag, successful output, or command capability.

The last stdout line is the kit's JSON envelope. Inspect the actual envelope and process exit status. Quote the returned fields and values on which a decision depends; do not assume a field exists or fabricate an `ok` result.

An unread, unparsable, missing, or contradictory result is not success. Record the observed failure and block the dependent action.

### 1.2 HyperFrames

Pin every HyperFrames invocation to version `0.8.223`.

Use `HYPERFRAMES_NO_TELEMETRY=1` in the main agent's command for every HyperFrames invocation, including initialization, snapshots, checking, beats, audio normalization, and rendering. <!-- rule:PROC-TELEMETRY-OFF -->

Never call `snapshot --describe`; use actual review frames and human observation instead of an invented machine-generated visual description. <!-- rule:PROC-NO-DESCRIBE -->

The required direct commands include:

- `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict`
- `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 normalize-audio`
- `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats`

Use the installed HyperFrames skill contract for supported command arguments, HTML structure, motion assertions, review snapshots, and media-use behavior.

There is no Phase 1 upscaler, automatic visual-understanding substitute, arbitrary TTS speed controller, audio web page, or automatic safe-band validator. Do not claim these capabilities through another name.

### 1.3 Authority and ownership

| Owner | May change | Must not change |
|---|---|---|
| Main agent | Root edit composition, mix, REVIEW.md, permitted edit-owned state | Approved planning/canon without impact confirmation |
| scene-builder | Its assigned `stage/edit/<id>/` shadow project | Root film, other shots, canon, STORY.md |
| imagine-kit | Contract-defined files and state transitions | Files outside its command's declared ownership |
| Planning patch workflow | Planning-owned STORY.md keys through patch apply | Edit-owned keys |
| User | Gate answers, approvals, scoped waivers | Tool observations or technical evidence |

`STORY.md` may be changed only through `imagine-kit patch apply` for planning-owned keys and kit operations for edit-owned keys; never use HyperFrames `editStoryboard` or hand-edit the ledger. <!-- rule:HARD-STORY-WRITERS -->

Agents may propose decisions and exceptions, but only the user may grant a waiver; a subagent cannot request, approve, or record one as granted. <!-- rule:HARD-WAIVER-USER-ONLY -->

## 2. Mandatory files

### 2.1 Universal read rule

Before starting each stage, after resuming an interrupted run, and after context compaction, the main agent MUST reread the stage's required files in full.

A previous summary, selected excerpt, old hash, or subagent report is not an acceptable substitute for the full source.

If an expected file has not been created yet, record that fact. If an existing required file cannot be located or read, block rather than guess its contents.

Resolve installed plugin and HyperFrames skill paths from the actual installation. Never assume that an external HyperFrames skill is stored inside the film project.

The HyperFrames skill contract is the copy shipped inside the pinned package `hyperframes@0.8.223`, in its `dist/skills/hyperframes/` directory. Resolve that directory once per stage with:

```bash
npx -y -p hyperframes@0.8.223 -c 'd="$(dirname "$(command -v hyperframes)")/../hyperframes/dist/skills/hyperframes"; cd "$d" && pwd -P'
```

In this document, "installed HyperFrames skill" means that directory, and its contracts are `SKILL.md` and, in its `references` folder, `format.md`, `motion.md` and `review.md`. Do not use a HyperFrames skill copy installed for another tool or at another version, even if it is easier to find. Do not run `hyperframes skills` to install one: it updates to the latest version, not the pin. If the command fails or a named file is missing, block and report it. Do not substitute similarly named files.

The scene-builder cannot run this command. Pass it the absolute paths of `SKILL.md`, `format.md` and `motion.md` in every brief.

Read actual project files, not similarly named copies from another project.

### 2.2 Stage 8b — fx-implement

Read in full:

Project:
- `STORY.md`
- `bible.yaml`
- `style.md`
- The G0 project configuration and script source identified by the project
- The exact G5r-approved reference records and current asset/version records referenced by the selected shots
- `review/REVIEW.md`, if it exists
- Any existing `stage/edit/<id>/` files for a resumed shot

Plugin:
- `skills/imagine-edit/SKILL.md`
- `skills/imagine-edit/references/dispatch-and-timeline.md`
- `skills/imagine-edit/references/audio-and-render.md`
- `skills/imagine-edit/references/review-and-recovery.md`
- `agents/scene-builder.md`

Installed HyperFrames skill:
- Its `SKILL.md`
- Its `format.md` contract
- Its `motion.md` contract

Read the complete selected shot/frame blocks, not only their identifiers. Read every referenced canon entry and asset record needed by the shot.

### 2.3 Stage 9 — root edit and mix

Read in full:

Project:
- `STORY.md`
- `bible.yaml`
- `style.md`
- The G0 project configuration and complete relevant script source
- The current approved asset/version records and audio licence metadata
- `edit/STORYBOARD.md`, when exported
- `edit/index.html`, when present
- `edit/index.motion.json`, when present
- Each promoted `edit/compositions/<id>.html`
- `review/REVIEW.md`, when present

Plugin:
- `skills/imagine-edit/SKILL.md`
- All three `skills/imagine-edit/references/*.md` files named in section 2.2
- `agents/continuity-reviewer.md` when performing continuity review

Installed HyperFrames skill:
- Its `SKILL.md`
- Its `format.md`
- Its `motion.md`
- Its `review.md`

Read the actual per-shot implementation files before modifying the global timeline or applying a mix.

### 2.4 G6 audit and review

Reread `bible.yaml` and `style.md` in full even if they were read earlier in stage 9.

Also reread `STORY.md`, G0 configuration, approved media/licence records, current `edit/index.html`, `edit/index.motion.json`, `edit/STORYBOARD.md`, `review/REVIEW.md`, this SKILL.md, its review and audio references, and the installed HyperFrames `review.md` contract.

Check the current artifact hashes, gate state, user answers, and tool results rather than trusting a previous summary.

### 2.5 Read-state and staleness

Record which files were read, their hashes, the selected shot ids, approved upstream versions, and the edit revision being processed.

After compaction or resume:
1. Re-read all mandatory stage files.
2. Refresh hashes and state via `imagine-kit status`.
3. Compare current approved sources with dispatch/promote/render inputs.
4. Mark dependent shadow work, root composition, review evidence, and renders stale where inputs changed.
5. Regenerate or revalidate stale work before proceeding.

Do not claim a former approval covers revised content.

### 2.6 Gate quotation

A gate is recorded only after the user explicitly answers that gate's actual question; store the answer verbatim, not a paraphrase, earlier comment, or change request reused as approval. <!-- rule:GATE-QUOTE -->

Read [review-and-recovery.md](references/review-and-recovery.md) for evidence and gate recording details.

## 3. Stage 8b — shot implementation

### 3.1 Preflight

Before dispatch:
1. Confirm the current STORY.md revision and the exact selected shot id.
2. Confirm upstream G0, G5r, and applicable G5a decisions are satisfied.
3. Verify required source anchors, unit ids, approved reference versions, and staged assets.
4. Confirm no unapproved canon edits or unresolved blocking findings.
5. Establish the shot's frame block, timing, visual brief, and asset paths.
6. Allocate or resume the shot's shadow project using `imagine-kit stage-shot`.
7. Read and verify the returned envelope before locating the shadow project.

Do not dispatch an unresolved or stale shot to scene-builder.

### 3.2 Protected source guard

Before every subagent dispatch, record SHA-256 hashes and restorable copies of all protected project files, then re-hash immediately after the dispatch; if any protected file differs, restore the recorded copies, reject the subagent output, and report the violation. <!-- rule:PROC-DISPATCH-GUARD -->

The protected set includes STORY.md, canon, approved asset records, root edit files, review records, and any other file outside the subagent's allowed shadow directory.

A PreToolUse hook is defense in depth, not a substitute for the main agent's before/after hash check.

Never accept a useful-looking output if it was produced alongside an unauthorized protected-file modification.

### 3.3 Scene-builder dispatch

The scene-builder is allowed to write only inside `stage/edit/<id>/`; the PreToolUse hook must enforce this boundary, and a blocked write is not permission to choose another destination. <!-- rule:HARD-SHADOW-ONLY -->

Provide:
- The selected frame block and all referenced STORY.md ids.
- Relevant complete canon entries and style requirements.
- Approved asset paths, hashes, and versions.
- G0 resolution/aspect and shot timing.
- The absolute paths of the installed HyperFrames `SKILL.md`, `format.md` and `motion.md` (section 2.1).
- The required shadow-root motion assertion location.
- The explicit write boundary and lint retry cap.

One dispatch implements one selected shot.

Required shadow outputs:
- `stage/edit/<id>/compositions/<id>.html`
- `stage/edit/<id>/index.motion.json`, containing that shot's shadow-local motion assertions

A scene may use GSAP `fromTo` and a timeline registered under its shot id, following the installed HyperFrames contract.

Do not silently invent an unsupported visual effect or substitute a workaround for an absent upstream decision.

### 3.4 Shadow lint and retries

Run the strict HyperFrames check against the shadow project after implementation.

Count the first failed lint as attempt one. At most three total lint attempts are permitted for that scene, including the attempt that just failed.

If a scene cannot pass lint within three attempts, mark the shot `blocked`, preserve the actual lint JSON, and stop; deadlines or partial progress never authorize attempt four. <!-- rule:PROC-SCENE-LINT-BLOCKED -->

An invalid or missing lint envelope is a failed attempt, not a pass.

Do not promote a blocked, unverified, stale, or unauthorized scene.

### 3.5 Promotion

Use `imagine-kit promote-shot` only after the dispatch guard and shadow validation pass.

Promotion must:
- Copy the validated scene into the root edit's composition set.
- Preserve approved asset identity and shot mapping.
- Convert shadow-local motion assertion times into film-absolute times.
- Merge assertions into the film's root motion file.
- Produce observable results in the kit envelope.

All film motion assertions belong in root `edit/index.motion.json` and use film-absolute seconds; per-scene motion files are not a substitute, and export-hf does not generate these assertions. <!-- rule:HARD-ROOT-MOTION -->

Recheck the promoted file, root assertion mapping, and current STORY.md state before dispatching the next dependent action.

Read [dispatch-and-timeline.md](references/dispatch-and-timeline.md) for complete isolation, lint, promotion, and timing procedures.

## 4. Stage 9 — editorial assembly

### 4.1 Root timeline

Use `imagine-kit export-hf` to create or synchronize `edit/STORYBOARD.md` and approved asset versions.

Do not treat export as an implementation of root motion assertions.

The main agent owns `edit/index.html`:
- Root duration equals the sum of locked shot durations.
- Each scene host has a cumulative film start time.
- Each scene host references its promoted composition.
- Camera motion operates on a wrapper rather than corrupting scene internals.
- VO, music, and SFX are placed at script/story cues.
- Music ducking and applicable audio automation are explicit.

Every scene host uses `data-composition-src` and `class="scene"` so HyperFrames can resolve the shot and composite shader transitions. <!-- rule:HARD-SCENE-CLASS -->

### 4.2 Timing invariants

Recalculate cumulative starts after any approved timing change. Revalidate promoted motion assertions and audio timing against the new starts.

For text-led copy units, compute locked minimum display time as:

`max(1.2, 0.5 + 0.3 × words)` seconds.

Text-led timing is a HARD contract for the relevant T## units. For other text, the same read window is advisory unless G0 or an approved source imposes a stronger rule.

For music-led content, preserve the approved music asset and beat-aligned cuts within the approved tolerance (normally ±1 frame).

For narrated content, preserve L## coverage, intelligible spacing, and locked VO identity.

### 4.3 Approved-source impact

Before changing any approved source, report the exact items affected, dependent shots/assets/renders, and gates that will reopen, then obtain an explicit user yes before modifying anything. <!-- rule:PROC-IMPACT-CONFIRM -->

An impact report is required even when the proposed edit is small or the user is close to a deadline.

A refusal or ambiguous answer means stop. A user change request is not automatically permission to invalidate every downstream approval.

## 5. Audio and media

### 5.1 Sound sources

Obtain SFX through HyperFrames media-use: prefer Openverse CC0/CC-BY assets with proper credits, then the bundled offline SFX library if needed. <!-- rule:PROC-SFX-SOURCE -->

Music must be user-supplied with a valid licence/source/credit or omitted; MusicGen is allowed only with explicit user opt-in and acceptance of its non-commercial limitation. <!-- rule:PROC-MUSIC-SOURCE -->

Every third-party audio asset must have licence, source, and credit metadata before delivery. <!-- rule:HARD-AUDIO-LICENCE -->

Do not present an unspecified licence, unverified search result, or commercially restricted track as cleared for unrestricted distribution.

### 5.2 Voice and mixing

Every `<audio>` element must have a unique `id`; id-less audio can be silently dropped by HyperFrames. <!-- rule:HARD-AUDIO-ID -->

Narrated films require present, correctly mapped VO for every L## unit. <!-- rule:HARD-VO-PRESENT -->

Unintended VO overlaps are forbidden, and total VO timing must fit within the root film duration. <!-- rule:HARD-VO-NO-OVERLAP -->

Normalize audio with the pinned HyperFrames command. Verify final loudness, peak, clipping, ducking, and cue placement with actual measurement evidence.

Use ffmpeg `atempo` within ±10% only when the user requests it, and explicitly warn that time-stretching may audibly degrade voice quality. <!-- rule:PROC-ATEMPO-WARN -->

There is no audio page in Phase 1: provide WAV file paths for listening, and when the user is on another device use SendUserFile to send the WAVs if available. <!-- rule:PROC-REMOTE-LISTEN -->

### 5.3 Offline and render

An offline HyperFrames render requires a reachable GSAP/CDN mirror configured through `HYPERFRAMES_GSAP_BASE_URL`; without one, diagnose the dependency rather than claiming a reliable offline render. <!-- rule:PROC-OFFLINE-MIRROR -->

All draft and delivery renders must use `--no-best-effort`, so missing or unready media blocks rather than being silently skipped. <!-- rule:HARD-NO-BEST-EFFORT -->

Read [audio-and-render.md](references/audio-and-render.md) for licensing, automation, loudness, source limits, and render procedures.

## 6. HARD validation

### 6.1 Evidence first

Agent judgement, a visually plausible result, an old green result, or a subagent's PASS claim never substitutes for a current HARD tool observation. <!-- rule:HARD-NO-SELF-JUDGEMENT -->

Run `imagine-kit validate story`, strict HyperFrames checks, and `imagine-kit qc` at their applicable stages. Inspect real envelopes, reports, and exit statuses.

A complete HyperFrames strict check must be clean, including errors, warnings, and applicable root motion assertions. <!-- rule:HARD-HF-STRICT -->

Only `contrast_aa_failure` occurring inside a proven shader-transition window can be demoted to advisory; every other strict-check error or warning remains blocking. <!-- rule:HARD-HF-ALLOWLIST -->

### 6.2 Image, layout, and structure

The finished edit must use 30 fps and exactly the G0-approved width, height, and aspect ratio. <!-- rule:HARD-FPS-SIZE -->

Intended visible elements must stay in frame unless the element has an explicit allow-overflow declaration and reason. <!-- rule:HARD-STAYS-IN-FRAME -->

For 9:16 output, manually verify at G6 that readable text remains in the G0 platform-safe band, outside the action rail, and at least `28 px`; record the result in REVIEW.md. <!-- rule:HARD-SAFE-BAND -->

No shipping placeholders are allowed: TODO, TBD, lorem, `status: outline`, unresolved `{{` tokens, or missing media `src` values. <!-- rule:HARD-NO-PLACEHOLDER -->

Also verify unique shot identifiers, exact script-unit coverage, references, locked timings, approved asset versions, root duration, and output streams.

### 6.3 Advice

Report `line_unread`, `dead_stretch`, and `text_below_floor` as advisory findings when they are editorial/readability classifications rather than active strict-check blockers, preserving the originating evidence and disposition. <!-- rule:ADV-CHECK-WARNINGS -->

If G0 intentionally specifies silence, suppress `film_silent` with its recorded G0 reason rather than inventing music or VO. <!-- rule:ADV-FILM-SILENT -->

Other advisory guidance includes motion economy, pacing, shot variety, text readability outside locked T## timing, easing, transition rhythm, and style preferences.

An advisory recommendation does not override an explicit HARD rule. An approved `style.md#overrides` may override advisory defaults.

## 7. G6 picture lock

G6 requires a complete draft MP4 with the full mixed soundtrack and explicit user picture-lock approval; a still sheet or technical PASS alone cannot satisfy it. <!-- rule:GATE-G6 -->

Create current `snapshot --review` visual sheets, continuity findings, strict checks, QC reports, and a draft full-mix render before asking for G6.

G6 review includes actually listening to the draft rough mix for VO intelligibility, music ducking, and SFX placement/timing. <!-- rule:PROC-G6-LISTEN -->

If Claude has not heard the audio, report only measured facts and explicitly state that Claude did not hear it; do not call listening a completed agent observation. <!-- rule:PROC-NOT-HEARD -->

Ask the user to watch and listen to the exact draft artifact and explicitly answer the G6 picture-lock question.

Record findings, retained advice with reasons, soft-tier decisions, and user-granted waivers in `review/REVIEW.md` using HyperFrames `review.md` P0/P1/P2 conventions. <!-- rule:PROC-REVIEW-MD -->

Do not record G6 until:
- Current HARD evidence is satisfactory.
- All P0/P1 blockers are resolved.
- Any applicable exceptions are valid, scoped, and user-granted.
- The user has reviewed the current full mix.
- The user explicitly approves the exact G6 gate question.

Record the user's literal answer with the gate mechanism, then verify the resulting state from the kit envelope.

Read [review-and-recovery.md](references/review-and-recovery.md) for waiver scope, non-waivable controls, review format, impact handling, and recovery.

## 8. Completion contract

Report:
- Stage and current STORY.md revision.
- Implemented, promoted, blocked, and stale shot ids.
- Actual check/QC result evidence.
- Current draft or delivery artifact paths.
- Audio and licence status.
- P0/P1/P2 findings, waived items, and retained advice.
- G6 pending/approved state with the actual recorded user answer if approved.
- Required next action.

Never say implemented, promoted, rendered, validated, locked, heard, or delivered unless the corresponding observation supports that exact claim.

The next stage is blocked whenever source ownership, provenance, validation, audio evidence, or human approval is unresolved.
