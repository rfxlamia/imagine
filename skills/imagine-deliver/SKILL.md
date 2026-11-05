---
name: imagine-deliver
description: Deliver the final approved Imagine film after G6 picture lock. Use for stage 10 final rendering, strict HyperFrames verification, MP4 technical QC, effective raster-resolution assessment, audio loudness and licence checks, review/REVIEW.md completion, scoped waiver validation, delivery notes, and explicit G7 final acceptance. This skill owns delivery evidence and release decisions, not upstream creative changes or G6 approval. It blocks on stale approvals, unverified HARD checks, unapproved assets, missing provenance, and unsupported capabilities.
---

# Imagine Deliver — Stage 10

## 1. Responsibility and authority

Stage 10 converts a current, G6-approved edit into an immutable final MP4 under `post/`, verifies that exact artifact, records delivery evidence, and obtains G7 acceptance.

The main agent owns:
- Pre-delivery source and gate audit.
- Final strict checks and render orchestration.
- Technical QC and raster-resolution assessment.
- Audio, licence, credits, and placeholder verification.
- `review/REVIEW.md`, waiver validity, and delivery note.
- The G7 question, verbatim user answer, and gate recording.
- Failure reporting, impact disclosure, and recovery routing.

Stage 10 does not own:
- G0–G3 canon decisions.
- G4 production planning or planning patch authoring.
- G5r/G5a/G5b asset approvals.
- Scene implementation or G6 picture lock.
- Silent modification of any approved source.
- Independent grant of a waiver.

Route changes to their owning stage. Do not call an artifact delivered merely because rendering produced a file.

### 1.1 Kit invocation

Invoke the bundled kit from this skill as:

`node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`

Call this invocation `imagine-kit` throughout this skill. Run against the actual active project, using the documented `--project <dir>` option when needed.

Phase 1 supports exactly twelve commands:

`new`, `status`, `gate`, `validate story`, `patch apply`, `img`, `tts`, `stage-shot`, `promote-shot`, `export-hf`, `render`, `qc`.

No other kit operations exist in Phase 1. In particular, there is no brief, stage start/finish, guard, lock, doc write, waiver, review confirm, capabilities, readtime, beats, loudness, check, safe-band, res-budget, res-report, audio-page, assets command family, expanded validate targets, patch validate, diff-keys, or fork command.

A cut capability must not be invoked under an invented alias.

The kit's last non-empty stdout line is a single-line JSON envelope. Parse the actual result and exit status before making a claim.

Relevant envelope fields:

- `ok`: reported command success.
- `command`: operation actually executed.
- `project`: resolved project.
- `code`: failure classification, if present.
- `data`: command-specific observed results.
- `errors[]`: blocking failures.
- `advice[]`: non-blocking recommendations.
- `not_run[]`: advisory checks not performed, never PASS.
- `waived[]`: reserved and always empty in Phase 1.
- `journal_id`: journal event when supplied.

A HARD check that cannot run appears in `errors[]` with `code: HARD_NOT_RUN` and a cause. Read the real envelope, including exact fields used to justify a decision.

Never fabricate output, measurements, completed repairs, command capabilities, or successful transitions. <!-- rule:CAP-NO-FABRICATION -->

### 1.2 HyperFrames execution

The main agent invokes HyperFrames directly with its pinned version and telemetry disabled:

```bash
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 normalize-audio
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats
```

Use only applicable commands and supported arguments from the installed HyperFrames contract.

Do not normalize or otherwise change a G6-locked mix without the impact and approval procedure in section 6.

For offline rendering, verify a functioning GSAP/CDN mirror configured through `HYPERFRAMES_GSAP_BASE_URL`; its absence or failure blocks offline rendering. <!-- rule:PROC-OFFLINE-MIRROR -->

No automatic upscaler, arbitrary TTS speed control, automatic 9:16 platform-band validator, or audio review page is assumed.

## 2. Mandatory files

### 2.1 Read rule and paths

Before each stage-10 operation, after resuming, and after context compaction, read its mandatory text files **in full**, not merely summaries or selected excerpts.

Use these roots:

- `P` = active film project, resolved from `.imagine/ACTIVE`.
- `R` = installed Imagine plugin root, `${CLAUDE_SKILL_DIR}/../..`.
- `U` = `P/script/narration.md` when G0 is `narrated`.
- `U` = `P/script/copy.md` when G0 is `music-led` or `text-led`.

Read the following common files in full for every stage-10 operation:

**Plugin**
- `R/skills/imagine-deliver/SKILL.md`
- `R/skills/imagine-deliver/references/delivery-checks.md`
- `R/skills/imagine-deliver/references/waivers-and-review.md`
- `R/skills/imagine-deliver/references/recovery-and-approval.md`
- `R/skills/imagine/SKILL.md`
- `R/skills/imagine-edit/SKILL.md`
- `R/skills/imagine-edit/references/audio-and-render.md`
- `R/skills/imagine-edit/references/review-and-recovery.md`

**Project**
- `P/project.yaml`
- `P/journal.md`
- `U`
- `P/bible.yaml`
- `P/style.md`
- `P/STORY.md`
- `P/assets/manifest.yaml`
- `P/assets/plan.yaml` when raster assets were planned
- `P/review/REVIEW.md`

An existing required file that cannot be read blocks the operation. A conditional file that was never applicable must be explicitly recorded as N/A.

For binary media, inspect actual files and measurements rather than pretending that a textual read proves their content.

### 2.2 Operation-specific mandatory files

All files below are additional to section 2.1.

| Operation | Additional project files, read in full when textual |
|---|---|
| Preflight / G6 verification | `edit/hyperframes.json`, `edit/STORYBOARD.md`, `edit/index.html`, `edit/index.motion.json`, every referenced `edit/compositions/<sNN>.html`, `review/check.json` if present, existing `review/qc.json` |
| Final strict check | All current edit source files, referenced media metadata, motion assertions, applicable installed HyperFrames `SKILL.md`, `references/format.md`, `references/motion.md`, and `references/review.md` (located as in imagine-edit SKILL.md section 2.1) |
| Final render | All preflight files, applicable `assets/CREDITS.md`, current approved asset records, current audio source records, G6 draft evidence |
| Final QC | The actual rendered MP4, current asset manifest, `assets/plan.yaml` if applicable, `assets/CREDITS.md` if applicable, `review/qc.json`, recorded G0 requirements |
| Delivery review / G7 | All current QC and check reports, `review/REVIEW.md`, G6 decision and quote, final MP4 metadata, current source and gate state |
| Impact / recovery | All affected source files, current approved versions, related edit files, render records, relevant review evidence, and current project state |

Require `assets/CREDITS.md` when third-party audio is used. If there is no third-party audio, record that the credits requirement is N/A rather than inventing credits.

Read `bible.yaml` and `style.md` in full before every audit and review, including after compaction. An old review report is not a substitute for reading them.

If an existing referenced source is unavailable, stop with its exact path and unresolved dependency.

## 3. Entry conditions and state

### 3.1 Fresh status

Run `imagine-kit status` before delivery work.

Inspect `data.stage`, `data.gates`, `data.items`, `data.blocked`, `data.sources`, `data.unresolved`, and `data.decisions` when present.

Confirm:

1. G0 target format, dimensions, fps, duration, audio mode, platform and silence choice are approved.
2. G1/G2/G3/G4 approvals remain valid.
3. G5r, G5a and G5b are satisfied for all applicable current assets.
4. G6 is approved for the exact current picture and full mix.
5. No required item is stale, rejected, missing, or blocked.
6. Every required edit composition and root motion assertion matches the locked edit.
7. The final render will use the current approved source versions.

A gate with no applicable assets may be `empty` under the project contract. Do not interpret a missing required asset as an empty gate.

`status` derives staleness from source hashes and upstream dependencies. Do not manually rewrite recorded state to turn stale work into approved work.

### 3.2 Approval versus evidence

The G6 quote establishes picture-lock consent, not final MP4 acceptance.

A gate is recorded only after the user explicitly answers **that gate's current question**; copy that answer verbatim, never an earlier request, change instruction, or unrelated acknowledgement. <!-- rule:GATE-QUOTE -->

A G7 decision is independent of G6. It must refer to the actual final MP4 and its QC evidence.

### 3.3 Source integrity

Do not hand-edit `STORY.md`, its history copy, script units, bible, style, approved assets, or locked mix merely to make a delivery check pass.

Planning agents return a patch in their final response without Write access. The main agent stores the patch verbatim, obtains required upstream permission, and uses `imagine-kit patch apply`.

For any subagent dispatch, record SHA-256 hashes and restorable backups of protected files before dispatch; recheck immediately afterward. On unauthorized change, restore the saved copies, reject the result, and report the incident.

Read the real status and patch envelopes; do not infer a successful revision advance.

## 4. Delivery workflow

### 4.1 Preflight

Follow [delivery-checks.md](references/delivery-checks.md).

Perform the following in order:

1. Read mandatory files.
2. Resolve the active project and current source hashes.
3. Verify the G6-approved edit and prerequisites.
4. Revalidate all active scoped waivers.
5. Run `imagine-kit validate story`.
6. Verify approved asset versions, paths, SHA-256 values, and third-party audio provenance.
7. Verify scene files, required audio ids, root duration, and motion assertions.
8. Run the pinned HyperFrames strict check against the actual edit.
9. Resolve blocking findings before rendering.

Only the exact `contrast_aa_failure` occurring inside a proven shader-transition window may be classified as automatic D10 advice. Every other strict-check error or warning blocks; record the exception's timing evidence rather than declaring the entire check clean without qualification.

Agent judgement, appearance, or an earlier result never substitutes for a current HARD tool result. <!-- rule:HARD-NO-SELF-JUDGEMENT -->

If a required HARD check cannot execute, record `HARD_NOT_RUN` and its cause; do not silently replace it with visual intuition.

### 4.2 Render

Use `imagine-kit render --final` only after the current G6 approval and strict preflight.

The final rendering path is:

`post/<slug>.v<N>.mp4`

Final versions are immutable; never overwrite an accepted final MP4.

Every render must enforce `--no-best-effort`, including through the kit's render implementation; missing or unready media must block, not be omitted to finish the film. <!-- rule:HARD-NO-BEST-EFFORT -->

The final kit render owns the documented delivery-quality, 30-fps, and no-best-effort behavior. Do not invent additional kit flags.

Inspect the real render envelope, especially `ok`, `errors`, `data.path`, `data.sha256`, and the process exit status.

Do not report a rendered artifact until its path and observed result exist.

### 4.3 QC

Run `imagine-kit qc <actual-final-mp4-path>` on the precise file reported by render.

Inspect the QC envelope and `review/qc.json`, including:

- `data.w`, `data.h`, `data.fps`
- `data.duration_s`, `data.audio`
- `data.lufs`, `data.true_peak`
- `data.raster`
- `data.credits`
- `errors[]`, `advice[]`, `not_run[]`

Confirm the file is a playable MP4 with video and audio streams.

Final output must be 30 fps and match the exact G0-approved dimensions and aspect ratio. <!-- rule:HARD-FPS-SIZE -->

Actual MP4 duration must fall within the G0 range, subject only to the QC contract's 0.05-second measurement tolerance. <!-- rule:HARD-DURATION -->

An output audio stream is mandatory, including digital silence when intentional silence was chosen. <!-- rule:HARD-AUDIO-STREAM -->

For non-silent delivery, integrated loudness must be -16 LUFS ±1.5 and true peak no greater than -1 dBTP; intentional silence skips the loudness limits, not the audio-stream requirement. <!-- rule:HARD-LOUDNESS -->

In `narrated` mode, the delivered timeline must include the approved VO for every `L##` unit. <!-- rule:HARD-VO-PRESENT -->

All referenced assets must exist, be approved at their current versions, and match recorded hashes; this includes canonical references. <!-- rule:HARD-ASSETS-APPROVED -->

Third-party music and SFX must carry verifiable licence, source, and credit records; unresolved rights block delivery. <!-- rule:HARD-AUDIO-LICENCE -->

Use [delivery-checks.md](references/delivery-checks.md) for raster mathematics, audio findings, motion and placeholder checks, and blocked QC outcomes.

## 5. Raster and platform compliance

### 5.1 Effective resolution

Raster quality is based on effective source-pixel coverage, not MP4 dimensions or renderer DPR.

Apply the per-layer source-resolution calculation in [delivery-checks.md](references/delivery-checks.md).

No `replan` raster tier may ship; a `soft` tier requires evidence of explicit acceptance at **both G4 and G5b**, for the affected asset and planned/measured quality. <!-- rule:HARD-RASTER-TIER -->

For a `replan` raster, report the shot, asset, geometry, dimensions and shortfall, then offer all six options for the user to choose: reduce camera push or maximum scale; reduce parallax travel; crop less of the source; break a full-frame raster into smaller layered elements; use vector, HTML or CSS ground elements; or a different delivery size through an approved G0 change. No upscaler and no waiver are among the options. Details are in `references/delivery-checks.md` section 5.4.

The label `native` is permitted only when every raster layer in the delivered film has effective `q >= 1.0`. <!-- rule:HARD-NO-NATIVE-CLAIM -->

No upscaler is assumed or treated as part of Phase 1; ffmpeg Lanczos interpolation and Chrome DPR do not increase raster `q`. <!-- rule:PROC-NO-UPSCALER -->

A soft raster must be disclosed in REVIEW.md and in the delivery note even when approved.

### 5.2 Portrait safe band

For 9:16 output, verify that readable text remains inside the applicable G0 platform band, avoids the action rail, and has an output-size font of at least 28 px; this is a manual G6 check recorded in REVIEW.md, not an automatic validation claim. <!-- rule:HARD-SAFE-BAND -->

For generic 1080×1920 portrait, the default vertical band is 168–1330 px.

Before final delivery, confirm that the G6 result covers the current locked frames. A post-G6 change invalidates the affected inspection.

## 6. Approved-source changes

Before editing any approved source, including a soundtrack adjustment after G6, show the user:

- Exact proposed source change.
- Affected canon, script units, shots, and assets.
- Reopened gates and item approvals.
- Stale previews, QC evidence, renders, and review records.
- Rebuild and reapproval path.

Obtain an explicit **yes** to that specific impact before editing, even after G6 picture lock. <!-- rule:PROC-IMPACT-CONFIRM -->

A change request alone is not authorization to rewrite approved sources or to record a new gate.

If approved, route to the owning skill, apply only the authorized modification, recompute status, rebuild affected items, and obtain fresh G6 approval before final delivery resumes.

If the user declines or does not answer, leave the approved sources unchanged.

## 7. Waivers and HARD limits

Use [waivers-and-review.md](references/waivers-and-review.md) for the exact ledger format.

Non-waivable invariants are gate quotes; patch/key isolation and base revisions; protected-source guard integrity; approved assets and hash-bound references; third-party audio licensing; absence of shipping placeholders; a playable G0-spec MP4; the raster quality floor (no `replan` tier may ship; a `soft` tier needs explicit G4 and G5b acceptance); and the story validators the kit runs before G4, such as HARD-STORY-UNIT-ONCE. A rule the kit itself decides is never waivable: `imagine-kit gate G4 approve` refuses a story error whatever REVIEW.md says, so a waiver for one would leave G4 blocked and only misstate the evidence. Never create even a proposed waiver for these. <!-- rule:HARD-NON-WAIVABLE -->

Only the user may grant an eligible waiver after seeing its exact scope, consequences and manual check; the main agent may propose, but subagents may neither propose nor grant one. <!-- rule:HARD-WAIVER-USER-ONLY -->

Record user-granted exceptions under `## Waivers` in `review/REVIEW.md`, preserve the verbatim quote, and list every active waiver by ID, rule and items in the delivery note. <!-- rule:HARD-WAIVER-LISTED -->

Before each gate, render, or delivery action, compare every active waiver's current scoped hashes with its recorded hashes and verify the user's exact affirmative quote; any changed or missing evidence makes the waiver invalid. <!-- rule:HARD-WAIVERS-VALID -->

Never convert a D10 automatic advisory demotion into a user waiver, or use an exception to claim a failed check passed.

## 8. Review and G7

### 8.1 Review record

Record findings, retained advice with reasons, soft tiers, scoped waivers, and applicable technical evidence in `review/REVIEW.md`, using the installed HyperFrames `references/review.md` P0/P1/P2 conventions. <!-- rule:PROC-REVIEW-MD -->

A finding should identify its timestamp, location, problem, exact change, and what stays.

No unresolved P0/P1 release blocker may be silently described as advice.

### 8.2 Audio reporting

Report objectively measured audio facts separately from listening judgements. If Claude has not heard the audio, explicitly state that it did not hear the audio; measured LUFS, peak and duration do not prove listening quality. <!-- rule:PROC-NOT-HEARD -->

Retain the actual G6 user listening decision rather than inventing a new auditory review.

### 8.3 G7 acceptance

After a verified final render, current QC, complete delivery note, and all required approvals, show the actual final MP4, evidence, risks, and active waivers to the user.

Ask explicitly whether the user has reviewed that final version and accepts it for G7.

Only after the user answers that question affirmatively, run:

`imagine-kit gate G7 approve --quote "<verbatim user answer>"`

The final MP4 is accepted only when G7 is recorded and verified for that artifact. <!-- rule:GATE-G7 -->

Inspect the returned gate envelope and refresh status to verify approval.

If the user rejects the final MP4, record the decision only with their actual response, leave G7 unapproved, and route corrections through their owning stage.

Use [recovery-and-approval.md](references/recovery-and-approval.md) for the full gate, delivery-note, and recovery procedures.

## 9. Completion

A successful delivery report identifies:

1. Exact final MP4 path and observed SHA-256.
2. G0 output specification and measured QC facts.
3. Current source revision, asset approvals, and G6 status.
4. Strict-check result and any D10 advice.
5. Raster quality, worst `q`, and all accepted soft tiers.
6. Audio stream, loudness, peak, and listening evidence.
7. Third-party licence and credit status.
8. P0/P1/P2 dispositions and all active waivers.
9. G7 approval state and actual user quote, if approved.
10. Any remaining blocker or required next action.

Never claim a successful render, repair, inspection, QC pass, audio listening, or gate transition without evidence from the corresponding observed operation.
