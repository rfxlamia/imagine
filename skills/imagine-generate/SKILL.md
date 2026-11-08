---
name: imagine-generate
description: Generate and review canonical image references, shot rasters, and final voice assets for an Imagine film after the G4 production-plan approval. Load this skill for Stage 7 generation, prompt compilation, image/TTS adapters, asset manifests, continuity review, G5r/G5a/G5b approvals, selective regeneration, resolution measurement, or recovery of interrupted generation. Enforce human gates, immutable versions, real tool evidence, and downstream invalidation before handing approved assets to editing.
---

# Imagine Generate — Stage 7

## 1. Responsibility and boundaries

Generate approved production assets without changing approved creative decisions. Own canonical reference generation, shot-image batches, final VO, asset identity, continuity evidence, resolution measurements, selective regeneration, and G5r/G5a/G5b review coordination.

The main agent owns all writes, tool execution, state reconciliation, user questions, approvals, and recovery. Subagents provide analysis only. No agent may substitute its own aesthetic judgment for a human gate or a measured HARD result.

### 1.1 Entry and exit

Enter only after a valid G4 production plan contains:
- Approved `STORY.md`, asset requirements, compiled image prompts, canonical reference inventory, and per-shot raster tiers.
- Approved bible, style, framing, timing, audio mode, generation budget, and music-source/licence decisions.
- Exact source versions and dependency identities for each proposed output.

Exit when every required reference and batch asset has the appropriate gate disposition, every required final audio item has its G5a disposition, and the manifest accurately records versions, hashes, dimensions, provenance, approval, and staleness.

Never begin editing, silently alter an upstream lock, or mark generation complete while dependencies are missing, unapproved, stale, or blocked.

### 1.2 Executable capabilities

Invoke the kit from this skill as:

`node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`

On a host other than Claude Code, the `CLAUDE_SKILL_DIR` placeholder above is not substituted: use `node "<R>/packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`, where `<R>` is the absolute directory two levels above this SKILL.md, confirmed by `node "<R>/host/plugin-root.mjs" --skill-dir "<R>/skills/imagine-generate"` printing `"ok":true` (protocol `imagine-root/1`, `docs/contracts/harness-portability.md` section 4). Never resolve the kit from the working directory, `PATH`, or a global install.

Call this invocation `imagine-kit` below.

Phase 1 kit commands are exactly `new`, `status`, `gate`, `validate story`, `patch apply`, `img`, `tts`, `stage-shot`, `promote-shot`, `export-hf`, `render`, and `qc`.

The kit has no separate brief, stage lifecycle, guard, lock, document-writing, waiver, review-confirmation, capability-probing, read-time, beat, loudness, preflight-check, safe-band, resolution-budget, audio-page, asset-management, extended validation, patch-validation, diff-key, or fork commands. Perform required checks directly or through the supported interfaces.

Use HyperFrames directly only with the pinned `npx hyperframes@0.8.223` package and set `HYPERFRAMES_NO_TELEMETRY=1` on every invocation, including checks, beats, TTS, audio normalization, and background removal. <!-- rule:PROC-TELEMETRY-OFF -->

Supported direct entrypoints include:
- `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats`
- `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 normalize-audio`
- `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict`

Use only documented options. Do not invent command flags, adapters, format fields, or successful tool observations.

### 1.3 Tool-result authority

The last stdout line of each kit invocation is its JSON envelope. Parse that line, inspect the actual success/error result, and retain the exact reported output paths, codes, diagnostics, and version data.

When present, quote the observed envelope fields such as `"ok"`, `"code"`, `"message"`, and `"data"` rather than replacing them with invented values. A field absent from the returned envelope is unknown, not implicitly successful.

Preserve stderr, process exit code, and relevant stdout evidence. A nonzero exit, malformed envelope, missing expected artifact, or contradictory verification leaves the operation blocked.

Never report a generated asset, gate approval, hash, revision, or successful validation before reading its corresponding real tool result.

## 2. Mandatory files and authority

### 2.1 Mandatory files

Read the listed files **in full** before beginning each applicable stage, and read them again after resume or context compaction. A remembered summary is not a substitute for the current files.

Always load this `SKILL.md`. Load these references for their corresponding work:
- `references/image-and-resolution.md` for prompt compilation, canonical refs, image batches, raster validation, and resolution measurement.
- `references/audio-and-modes.md` for clock selection, auditions, scratch VO, production TTS, G5a, and non-narrated audio.
- `references/state-and-review.md` for audit, gate recording, dependency invalidation, manifest reconciliation, recovery, and downstream handoff.

Project files required by activity:

| Activity | Mandatory project files |
|---|---|
| Entry/G4 verification | `STORY.md`, `bible.yaml`, `style.md`, `review/REVIEW.md` if present, project configuration, current asset manifest |
| Canonical ref generation | `STORY.md`, `bible.yaml`, `style.md`, `review/REVIEW.md` if present, current asset manifest, referenced prompt/plan records |
| Canonical continuity audit/G5r | `STORY.md`, `bible.yaml`, `style.md`, `review/REVIEW.md` if present, current asset manifest, all affected reference images |
| Batch image generation | `STORY.md`, `bible.yaml`, `style.md`, `review/REVIEW.md` if present, current asset manifest, approved source reference images |
| Batch continuity audit/G5b | `STORY.md`, `bible.yaml`, `style.md`, `review/REVIEW.md` if present, current asset manifest, affected batch images and reference images |
| Narrated audio/G5a | `script/narration.md`, `bible.yaml`, `style.md`, `STORY.md`, `review/REVIEW.md` if present, current asset manifest, approved casting/lexicon |
| Music-led/text-led audio/G5a | `script/copy.md`, `bible.yaml`, `style.md`, `STORY.md`, `review/REVIEW.md` if present, current asset manifest, source audio/cue records |
| Post-generation budget audit | `STORY.md`, `bible.yaml`, `style.md`, `review/REVIEW.md` if present, current asset manifest, measured raster records |
| Regeneration/impact/recovery | `STORY.md`, `bible.yaml`, `style.md`, `review/REVIEW.md` if present, current asset manifest, all affected source and output versions |

The project configuration and asset manifest must be read at their actual paths as established by the initialized project and observed kit results; never invent a different path or silently initialize a replacement.

If a required file does not yet exist, distinguish an expected not-yet-produced output from a missing prerequisite. Missing prerequisites block the stage. `review/REVIEW.md` is optional until the review workflow creates it: read it when present, but its absence alone does not block generation. Create it through the documented review workflow before recording the first finding, decision, or waiver that belongs there.

Audits and reviews always include the complete current `bible.yaml` and `style.md`, not excerpts or previously cached descriptions. <!-- rule:PROC-BRIEF-AUDIT-CANON -->

### 2.2 Sources of truth

Authority, in descending order:
1. Actual tool results and non-waivable HARD checks.
2. Explicit, current user gate decisions.
3. Approved project canon, plan, and recorded source versions.
4. Proposed patches, compiled prompts, and generated evidence.
5. Agent assessment.

Higher authority cannot be overridden by lower authority.

Never silently change approved script, bible, style, STORY, timing, source reference, asset tier, audio mode, or license information.

### 2.3 Approved-source changes

Before changing an approved source:
1. Stop dependent work.
2. Identify the exact item, old/new value, source hash, and affected dependency IDs.
3. Produce an impact report showing affected refs, assets, shots, audio, gates, and delivery outputs.
4. Ask the user whether to authorize that specific change.
5. Only after explicit authorization, apply the change through a permitted mechanism and invalidate the dependent versions.

This rule remains active after G6 picture lock and after G7 delivery. Never edit an approved source first and seek retrospective permission.

### 2.4 Gate answers

Ask the exact gate question with the item ID, current version, review evidence, and available decisions. Record approval or rejection through `imagine-kit gate` only after the user explicitly answers that particular question, and preserve the verbatim answer as the gate quote; an earlier request, change instruction, or unrelated user statement is not approval. <!-- rule:GATE-QUOTE -->

No implicit approval, automatic gate recording, simulated user answer, or agent-authored quote.

### 2.5 Waivers

Three mechanisms are distinct:
- Automatic advice: only a check explicitly covered by the D10 exception.
- User-scoped waiver: an explicit user answer recorded in `review/REVIEW.md` against the exact finding, version, scope, risk, and quote.
- Non-waivable HARD rule: cannot be bypassed, even by a user-scoped waiver.

A waiver must not change the actual tool result, make stale evidence current, or turn a failed HARD check into a pass. Never create, expand, renew, or infer a waiver on the user's behalf.

### 2.6 Audit evidence

Every audit records the actual files and versions inspected, their hashes where applicable, observed results, unresolved items, gate state, and the next permitted action.

Never describe an unobserved image/audio result as reviewed, and never substitute a self-written PASS verdict for evidence.

## 3. Generation coordination

### 3.1 Sequence

The normal Stage 7 sequence is:
1. Verify G4, approved canon, current production plan, source hashes, quotas, and supported capabilities.
2. Compile and verify canonical reference prompts.
3. Generate only the planned canonical refs.
4. Run canonical continuity review.
5. Present each ref for G5r and record individual decisions.
6. Generate batch assets only from current G5r-approved references.
7. Generate final narrated VO or prepare required non-narrated audio review.
8. Run batch continuity review and prepare G5b contact sheets.
9. Present G5a/G5b review evidence and record item-level decisions.
10. Recalculate the shot resolution budget from measured dimensions.
11. Reconcile the manifest, dependencies, hashes, stale states, and remaining blockers.
12. Handoff only the approved, current outputs needed for editing.

Do not generate the entire batch speculatively while canonical refs await G5r.

### 3.2 Protected-file dispatch

Before every subagent dispatch, save a recoverable copy and sha256 for each protected project file in the dispatch scope; re-hash those files afterward, restore any mismatched file from its recorded copy, reject the dispatch output, and report the attempted mutation. <!-- rule:PROC-DISPATCH-GUARD -->

Protect approved canon, project settings, script/copy, STORY, gates, manifest, and other authoritative inputs. Keep snapshots outside approved asset locations.

Do not silently overwrite legitimate concurrent user edits: if ownership or timing is ambiguous, stop and request reconciliation before restoration.

Planning agents return proposed patches in their final messages and have no Write access. If a planning patch is required, store it verbatim and let the main agent use `imagine-kit patch apply`; do not invent patch `inputs` hashes or claim acceptance without the actual envelope.

### 3.3 Ownership and parallelism

The main agent alone:
- Executes adapters and validates outputs.
- Maintains the manifest and version dependencies.
- Presents user reviews and records gates.
- Decides whether a task is ready, stale, invalid, or blocked.

Parallel workers may generate independent items only after verifying their input versions and file ownership. Parallel output must reconcile against fresh state before promotion.

### 3.7 Continuity reviewer

Run continuity review in three modes: canonical refs against bible/style before G5r; batch images against bible/style and their approved references before G5b; and snapshot sheets during editing. <!-- rule:PROC-CONTINUITY-MODES -->

The reviewer is read-only. Require P0/P1/P2 findings with `asset/time · where · problem → exact change`; P0 must identify the violated bible ID or style anchor. If the reviewer cannot inspect an image, record that limitation and do not claim an image-level pass.

## 4. Human approval gates

### 4.1 Audio-mode behavior

At G0, one of `narrated`, `music-led`, or `text-led` is locked. For non-narrated modes, casting and TTS are explicitly recorded N/A instead of being silently skipped. <!-- rule:PROC-MODE-NA-RECORDED -->

- `narrated`: `L##` units in `script/narration.md`; final VO drives timing and G5a reviews every line.
- `music-led`: `T##` units in `script/copy.md`; the licensed track and measured beat grid drive timing and G5a reviews the music cut and SFX cues.
- `text-led`: `T##` copy units; each has minimum read time `max(1.2, 0.5 + 0.3 × words)` seconds, unless the user explicitly overrides that unit. G5a reviews audio cues or records N/A when silence was chosen.

A change to audio mode reopens G1 and invalidates the dependent plan. Silence is intentional only when recorded at G0; other missing audio is not implicit silence.

### 4.2 G5r — Canonical references

Generate only the G4-approved reference inventory, perform continuity review, and obtain a separate G5r answer for each current canonical reference before it can be used by batch generation. <!-- rule:GATE-G5R -->

Batch image requests must use reference IDs whose exact current versions and hashes have G5r approval; otherwise stop with `REFS_NOT_APPROVED`, including when using cutout compositing. <!-- rule:HARD-REFS-APPROVED -->

A replacement ref version cannot inherit the previous version's approval.

### 4.3 G5a — Audio

For narrated work, the user must hear and decide on every production VO line/take; for music-led or sounded text-led work, the user reviews every required music cut/SFX cue. If G0 chose intentional silence, record G5a N/A with its reason. <!-- rule:GATE-G5A -->

Final VO production and G5a listening review may run concurrently with batch image generation and G5b preparation; neither needs to wait for the other. <!-- rule:PROC-G5A-PARALLEL -->

The agent must not represent measured audio properties as a substitute for listening.

### 4.4 G5b — Batch visual approval

After continuity review, show every generated batch image, including every planned or measured `soft` tier, and collect the user's G5b answer for that individual current asset version. <!-- rule:GATE-G5B -->

Record decisions per item and version; a later change reopens only the affected item approvals and their actual dependents, not unrelated approved items. <!-- rule:GATE-PER-ITEM -->

A contact sheet helps review but does not turn an entire batch into one blanket approval.

### 4.5 Gate state

Track pending, approved, rejected, stale, and blocked separately. A rejected item is a revision request, not an approval. A stale approval is not valid for a new version.

G6 picture-lock review and G7 delivery acceptance remain separate downstream gates; Stage 7 must never claim they occurred.

## 5. Text, prompts, and identity

### 5.1 Source-text fidelity

Captions preserve the original approved spelling from `L##` or `T##`; pronunciation lexicon transformations apply only to `tts_text`, never to caption text. <!-- rule:PROC-CAPTION-ORIGINAL -->

Maintain stable unit IDs, exact approved wording, speaker/entity IDs, style anchor references, and source hashes.

### 5.2 Prompt lineage

Persist compiled prompt, revision, dependency IDs, style anchors, banned tokens, intended framing, reference hashes, output version, and actual generator response as audit data.

Prompt changes are versioned and can invalidate derived images. Do not silently recompile against a different bible/style revision.

## 6. Assets, versions, and recovery

### 6.1 Asset identity

Treat adapter work as idempotent per `(asset id, version)`; keep partial files in `tmp/`, verify completed outputs on resume, and never regenerate or duplicate an approved asset merely because execution was interrupted. <!-- rule:PROC-RESUME-IDEMPOTENT -->

Use immutable `.vN` asset filenames; never overwrite an existing version or an approved production take. New content requires a new version and a fresh disposition. <!-- rule:PROC-VERSIONS-IMMUTABLE -->

The manifest must capture exact location, hash, source dependencies, approved gate version, dimensions/duration where applicable, producer/config identity, and current/stale/blocked status.

### 6.2 Dependency invalidation

A source mutation invalidates only assets whose recorded dependency graph reaches that source.

Typical edges:
- Bible/style/prompt → canonical refs → G5r → batch images → G5b → edited shots.
- Script line/lexicon/voice parameters → production WAV → G5a → mix.
- Shot framing/scale/crop/travel → raster budget → shot assembly.
- Audio mode/timing clock → STORY and downstream audio/visual timing.

Never transfer approval from an old hash to a new version. Retain historical artifacts and recorded decisions for audit.

### 6.3 Selective regeneration

Regenerate only the rejected or invalidated item and the actual downstream dependents. Preserve unaffected approved assets.

For each replacement:
1. Identify the precise reason and affected source IDs.
2. Recheck current versions, authorization, and quota.
3. Allocate a new immutable version.
4. Run the relevant adapter, post-checks, and review.
5. Reopen the item's required gate.
6. Reconcile the manifest and report remaining stale dependents.

### 6.4 Resume and failure

On resume, reread Mandatory files, parse current kit status, reconcile files against manifest hashes, and inspect any partial `tmp/` outputs.

Unknown, mismatched, unmeasured, or missing output is not an approved asset. Restore protected sources if a dispatch caused unauthorized modification; otherwise retain evidence and report the blocker.

Never use deadline pressure to bypass a retry limit, a gate, a measured failure, or a stale dependency.

## 7. Generation adapters

### 7.1 Image adapter

Use `imagine-kit img` for generation and its recorded result. Its capabilities are prompt-based generation with size hints and reference images; do not assume edit or mask support.

Store the image tool's actual revised prompt alongside the original compiled prompt, rather than treating the tool revision as the approved source prompt. <!-- rule:PROC-REVISED-PROMPT -->

Every batch prompt explicitly describes the intended framing and composition, even when reference images are supplied. <!-- rule:PROC-FRAMING-IN-PROMPT -->

When a raster post-check fails, allow at most two retries after the failed initial attempt (three total attempts); after the third failure, mark blocked and report instead of retrying again. <!-- rule:PROC-IMG-RETRY -->

A valid output must be a real, non-uniform PNG raster with measured dimensions and sha256; prohibit asking the generator to script, fabricate, or otherwise write a placeholder PNG instead of generating an image. <!-- rule:HARD-REAL-RASTER -->

For transparent-intent assets planned with `background: transparent`, the kit uses native alpha when decoded pixels demonstrate it. Prompts steer Codex by requesting transparent background generation, but the setting is agent-mediated and cannot be forced; `transparent_flag` is recorded for provenance only and never gates. The kit verifies by pixels alone. Native cells keep their alpha and HyperFrames is never run on them. Opaque cells trigger per-cell background removal via `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 remove-background` as an audited fallback, committing with the `hyperframes_fallback` flag. Derived review composites (`assets/composites/<id>.v<N>.png`) present each cutout over saturated magenta beside the raw crop. Flagged assets require a scoped G5b approval (`gate G5b approve --scope <id>.v<N>`). <!-- rule:PROC-CUTOUT-FALLBACK -->

When generating pose sheets, `img --batch <id>` naming any sheet member expands to every member of that group lacking a current version and draws them in a single grid image. The kit crops each cell with ffmpeg: native alpha is kept when present, otherwise the cell is cut by `npx --yes hyperframes@0.8.223 remove-background` (telemetry off) inside the kit and flagged with `hyperframes_fallback`. The resulting cutout assets are committed under `assets/img/figure/<id>.v<N>.png`, and downstream stages use them directly. Running `img --batch <id> --redo <id> --note <why>` regenerates only that pose as a 1×1 sheet while preserving approved sibling poses. Review and G5b approval proceed per individual pose, presenting the provenance sheet image and review composite for context. <!-- rule:PROC-POSE-SHEET -->

Authoring rule: `background: transparent` is for figures only (characters, props, creatures as a cutout). The prompt of a transparent asset must describe only the figure: no background, backdrop, ground, floor, scenery, shadows or color-field wording, and nothing like "isolated on a plain grey background". The kit already adds the transparency instruction. Scenes, ground and backgrounds are planned as non-transparent (`opaque`) assets and saved under `assets/img/world`.

Two distinct failure paths apply to transparent-intent pose-sheet extraction. Under the retry path, only a `suspect` classification (`empty`, `edge`, `checkerboard`, `alpha_shape`) fails the attempt and spends one of the 3 attempts (`PROC-IMG-RETRY`); after 3 attempts the batch is BLOCKED naming the cell and reason per attempt. Under the immediate block path (no retry, nothing committed), HyperFrames remove-background crash or timeout blocks immediately under `PROC-CUTOUT-FALLBACK`, while fallback output whose size differs from the cell or fallback output that is empty (fill < 1%) or touches the cell edge (> 2% opaque pixels in 2-px border) blocks immediately under `HARD-SHEET-CELL`. Review findings commit with `integrity_flags` (`hyperframes_fallback`, `foreground_loss`, `edge_near`, `fragmented`, `ghosting`); `gate G5b approve` without `--scope` is refused while flagged items exist, requiring `gate G5b approve --scope <id>.v<N>` to acknowledge. <!-- rule:HARD-SHEET-CELL -->

Detailed compilation, reference conditioning, validation, and attempts are in `references/image-and-resolution.md`.

### 7.2 Raster resolution

No verified upscaler exists in the production stack; lanczos interpolation, DPR upsampling, and resizing never increase the measured raster quality factor `q`. <!-- rule:PROC-NO-UPSCALER -->

Use `native` for `q >= 1`, `soft` for `0.75 <= q < 1` only with explicit G4 plan acceptance and per-asset G5b acceptance, and HARD-block `q < 0.75` rather than inventing a replan tier. <!-- rule:HARD-RASTER-TIER -->

After G5b, recalculate each shot's budget using actual image dimensions; a failed budget reopens that shot's previz and affected downstream work. <!-- rule:DAG-MEASURED-BUDGET -->

See `references/image-and-resolution.md` for exact formulas and alternatives.

### 7.3 TTS adapter

Use `imagine-kit tts` only for the applicable narrated workflow; casting auditions and scratch timing outputs remain in `tmp/` and never count as approved production assets. <!-- rule:PROC-SCRATCH-NOT-ASSET -->

Synthesize exactly one approved script line per production WAV, with independent identity, duration, take number, and approval. <!-- rule:PROC-ONE-LINE-PER-WAV -->

Set `KPOCKET_TTS_ERROR_WITHOUT_EOS=1` for the Pocket TTS worker to fail explicitly on incomplete generation. <!-- rule:HARD-TTS-EOS -->

When using a voice audio file, require the loaded worker to report `has_voice_cloning = true` before proceeding; fallback non-cloning weights are not acceptable. <!-- rule:HARD-HAS-VOICE-CLONING -->

Provider API keys come only from the environment or a mode-600 file outside the project and never reach stdout, stderr, the journal, envelopes or project files. <!-- rule:HARD-SECRET-NEVER-WRITTEN -->

Any ElevenLabs API, network, or worker failure exits with code 3 (BLOCKED), and a missing or badly permissioned key exits 7 (NEEDS_USER); never silently fall back to Pocket TTS or swap engines.

Hosted TTS takes record provider, voice, model, plan tier and licence terms in the manifest and assets/CREDITS.md automatically; free or unverified plans are flagged. <!-- rule:PROC-HOSTED-TTS-LICENCE -->

Before requesting G5a, read `data.total_duration_s`, `data.duration_range` and `data.missing_lines` from `tts`; when the `ADV-VO-DURATION-RANGE` advice appears, present the total and the G0 range to the user and resolve it (trim or revise the script and its approval, or change G0 with the user's approval) before asking for G5a; never trim audio silently. <!-- rule:ADV-VO-DURATION-RANGE -->

Before generating production takes, estimate and disclose the character count of the selected `tts_text`. After the run, check that estimate against `data.characters`, the count actually sent.

Allowed pronunciation/delivery levers are lexicon, punctuation, voice, seed, and temperature, plus engine-specific `voice_settings` and `model_id` levers for elevenlabs voices only; SSML, audio tags, phonemes, native pitch, or emotion controls remain not allowed. <!-- rule:PROC-PRONUNCIATION-LEVERS -->

Supported fallbacks are Kokoro through pinned HyperFrames TTS (without Indonesian support) or a user-recorded WAV for each script line; disclose the tradeoffs and never silently swap engines. <!-- rule:PROC-TTS-FALLBACK -->

There is no Phase 1 audio review page: list actual WAV paths for playback and use `SendUserFile` to provide the files when review occurs on another device. <!-- rule:PROC-REMOTE-LISTEN -->

Report actual measured audio facts and explicitly state that Claude did not hear the audio; only the human listener can approve what it sounds like. <!-- rule:PROC-NOT-HEARD -->

See `references/audio-and-modes.md` for audio identity, language constraints, and G5a procedure.

## 8. Verification and handoff

### 8.0 HARD results

Do not replace any HARD validation, adapter failure, missing output, hash mismatch, or gate failure with an agent's subjective PASS assessment. <!-- rule:HARD-NO-SELF-JUDGEMENT -->

### 8.1 Asset integrity

Before handoff, verify that every required asset reference exists, has the correct approved current version, and matches the exact recorded sha256; reject missing, unapproved, stale, or mismatched assets. <!-- rule:HARD-ASSETS-APPROVED -->

Audit each generated image's real format, non-uniform pixels, dimensions, provenance, current reference approval, and G5b disposition; audit audio's physical format, line identity, duration, source, and G5a disposition.

### 8.2 Downstream validation

Editing must use the same asset versions that Stage 7 handed off.

For applicable HyperFrames checking, run `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict`. Under D10, only `contrast_aa_failure` located inside a documented shader-transition window is automatically demoted to advice; every other check error or warning is blocking.

Never report a failed strict check as clean. A blocking finding is fixed, or bypassed only by a user-granted waiver scoped to that rule and its items and reported as failed and waived; non-waivable checks are never waived.

The later edit review must include snapshot sheets, a draft MP4 containing the full mix, the user's G6 visual/audio assessment, and the manual 9:16 safe-band check recorded in `review/REVIEW.md`.

### 8.3 Reporting

For each item, report ID, `.vN`, real output path, source hashes, measured dimensions or duration, resolution tier if image, gate status, and unresolved findings.

Document user decisions and waivers in `review/REVIEW.md`, with exact quotes and affected versions. Describe audio as measured or user-reviewed, never agent-heard.

If blocked, give the exact failed operation, actual evidence, retry count, affected dependencies, and the smallest permissible recovery action.

Detailed state, waiver, and recovery procedures are in `references/state-and-review.md`.

## 9. Completion checklist

- [ ] G4 and mandatory source files are current; approved-source changes are authorized.
- [ ] Protected-file hashes and dispatch snapshots were verified.
- [ ] Canonical refs passed continuity review and each received current G5r approval.
- [ ] Batch images use approved refs, passed real raster checks, and received per-item G5b decisions.
- [ ] Pose-sheet groups expanded, cells verified against alpha constraints, and cutouts committed with provenance.
- [ ] Final audio uses correct mode, one line per WAV when narrated, and complete G5a decisions or recorded N/A.
- [ ] All immutable versions, revised prompts, hashes, source IDs, and measured resolution budgets agree with the manifest.
- [ ] Stale/rejected/blocked items and downstream invalidations are accurately recorded; no HARD result is overridden.
- [ ] Handoff contains only verified current approvals, exact paths, and honest review evidence.
