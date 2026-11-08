
# Shot Dispatch, Promotion, and Root Timeline

This reference extends the imagine-edit SKILL.md. Its rules apply during stage 8b implementation and stage 9 timeline assembly.

## 1. Stage 8b state machine

The allowed progression is:

`ready -> staged -> implementing -> linting -> validated -> promoted`

A shot may instead enter:

- `blocked`: missing input, unauthorized mutation, unsupported mechanism, exhausted lint attempts, or failed validation.
- `stale`: a source revision, approved reference, asset hash, timing, or canon dependency has changed.
- `needs_user`: an upstream approval or explicit impact confirmation is required.

These are workflow states. Do not invent a persisted state field or schema if the actual kit does not expose one.

Only claim a persisted transition when supported by an observed kit result.

A blocked shot may resume after its stated cause has been corrected, but the three-attempt lint limit applies to the current implementation attempt. Do not reset the counter merely to evade the cap.

## 2. Pre-dispatch source manifest

Build an evidence record containing:

- Current project root and STORY.md revision.
- G0-approved mode, format, dimensions, aspect ratio, frame rate, and duration range.
- Current approved `bible.yaml` and `style.md` hashes.
- Exact selected shot id.
- Its frame block, script-unit mapping, source anchors, and timing.
- G5r-approved reference ids and version hashes.
- G5a voice/audio approval where required.
- Every approved asset path and current hash actually used.
- Installed HyperFrames contract version.
- Expected shadow output paths.
- Protected-file hash manifest.

Every source must have been read, not merely named in the frame block.

Do not invent missing anchors, units, assets, licences, durations, reference versions, or source hashes.

When a referenced id has no matching approved record, block and report the missing id.

When an image version differs from G5r approval, return to the appropriate approval process rather than using the nearest-looking image.

When project metadata identifies a script or G0 configuration under a different path, use that explicitly recorded path. Do not create duplicate source files to satisfy an assumed naming convention.

## 3. Dispatch integrity

### 3.1 Protected set

Before starting a scene-builder dispatch, enumerate all existing files whose ownership is not delegated to that subagent.

At minimum protect:

- `STORY.md`
- `bible.yaml`
- `style.md`
- G0 configuration and script sources
- Approved reference records and asset/version manifests
- `edit/STORYBOARD.md`
- `edit/index.html`
- `edit/index.motion.json`
- Existing root compositions
- `review/REVIEW.md`
- Recorded gate and approval evidence
- Any other project file outside the assigned shadow project

Include existing referenced files even if they are outside the minimal list.

The writable area for the dispatched scene-builder is only `stage/edit/<id>/`.

### 3.2 Before dispatch

1. Resolve the project's canonical root.
2. Enumerate protected files and ensure each path resolves inside its intended ownership boundary.
3. Compute SHA-256 for each protected file.
4. Preserve a restorable copy of each protected file before giving control to the subagent.
5. Record the file list, hashes, and backup locations in the main agent's execution evidence.
6. Confirm the selected shadow directory has the expected shot id.
7. Dispatch only after the main agent has read the required sources.

Hash file content, not merely modification timestamps.

Do not rely on Git status alone: an existing dirty file may still be an approved input, and an unauthorized change may occur without a useful Git diff.

### 3.3 After dispatch

Immediately re-enumerate and hash protected files.

Compare:
- Existing protected files against their original hashes.
- Unexpectedly removed files.
- Newly created protected paths.
- Changes outside the designated shadow directory.

If any unauthorized mutation occurred:

1. Reject the scene-builder result regardless of apparent usefulness.
2. Restore protected files from the recorded copies.
3. Verify restored hashes.
4. Quarantine or discard the violating shadow output.
5. Report exact affected paths, original and observed hashes, and restoration results.
6. Block the shot.

If restoration cannot be verified, remain blocked and request recovery. Do not claim the project is restored merely because a copy operation returned successfully.

Where available, the PreToolUse hook blocks scene-builder writes outside the shadow directory before they happen. On a host without a verified write hook, the kit guard detects, after stage-shot, changes to canon, plan inputs and media; it does not prevent writes, and it does not cover other shots' promoted compositions, the root motion file, or the project state (including gate approvals). The hash guard independently detects boundary failures and unanticipated side effects.

### 3.4 Kit guard and staged shot constraints

On a host without a verified write hook, the kit guard detects, after stage-shot, changes to canon, plan inputs and media; it does not prevent writes, and it does not cover other shots' promoted compositions, the root motion file, or the project state (including gate approvals).

While a shot is staged, do not run commands that modify canon, plan inputs, or media: `img`, `tts`, `patch apply`, `gate`, and `export-hf` (when its inputs changed). Running any of these commands mutates baseline-tracked files and causes `promote-shot` to refuse promotion with HARD-SHADOW-ONLY.

In contrast, `status`, `qc`, and `render --draft` do not trip the guard, per the kit tests.

If `promote-shot` refuses with HARD-SHADOW-ONLY, restore the changed files first. Use `stage-shot --rebaseline` only for a change the user made or approved and has been told about. Never write the `guard_digest` to a file.

## 4. Scene-builder contract

### 4.1 Dispatch payload

Give the subagent a self-contained brief containing:

- Shot id and exact shadow location.
- Full relevant STORY.md frame block.
- Approved visual mechanism and target timing.
- Relevant canon facts and style instructions.
- Allowed asset paths and identity hashes.
- Current format/motion contract.
- Explicit prohibition on writes outside its shadow.
- Expected output files and validation requirements.
- Unsupported capabilities and the blocked-return policy.

Do not ask the subagent to discover an alternate story, revise canon, select an unapproved asset, or alter root film timing.

If an instruction depends on absent information, the subagent must return blocked with the missing fact and its source identifier.

### 4.2 Shadow layout

Expected structure:

`stage/edit/<id>/compositions/<id>.html`

and

`stage/edit/<id>/index.motion.json`

The composition is a sub-composition suitable for mounting in the root film.

The shadow project's root `index.motion.json` contains assertions for that shot in shadow-local seconds.

HyperFrames reads the root motion file for the active project. A motion file stored beside the composition does not automatically supply the expected assertions.

The scene-builder must use supported HyperFrames composition syntax.

Use GSAP `fromTo` for explicit state transitions where required by the motion contract.

Register its timeline under the selected shot id.

Do not work around an unsupported feature by hiding it in a CSS fallback or inventing a different mechanism while claiming the requested effect was implemented.

### 4.3 Lint attempts

The first completed lint check is attempt 1.

After a failure:
1. Capture the complete returned check JSON and process status.
2. Identify the exact error or warning.
3. Repair only the authorized shadow project.
4. Check again.

After attempt 3 fails, stop.

Return:
- Shot id.
- `blocked`.
- Actual lint JSON from the final failed attempt.
- Previous attempt summaries.
- The unresolved requirement.
- The minimum corrective action or upstream decision needed.

Do not run attempt 4 because a deadline is near, the errors look cosmetic, or the main agent believes the scene is probably fine.

An unexecuted check never counts as a pass.

## 5. Promotion contract

### 5.1 Conditions

Promote only when:

- The shot's source hashes still match.
- All required approvals are current.
- Shadow output is present at the expected path.
- The protected-file comparison passed.
- The scene has satisfied the required strict validation.
- No blocking review findings remain.
- The shot id and selected revision match the intended target.

Invoke `imagine-kit promote-shot` using the actual supported arguments.

Read the resulting JSON envelope before reporting promotion.

### 5.2 Assertion retiming

Suppose a shot-local assertion covers local interval `[a, b]` and the shot starts at film time `s`.

The promoted assertion must cover film interval:

`[s + a, s + b]`

Keep the assertion's intended target, threshold, and semantics.

Apply the same transformation to assertion timestamps regardless of whether the assertion concerns a scene element or another supported motion target.

Do not double-add the start offset when re-promoting a scene.

Do not treat per-scene `index.motion.json` as the film's final assertion file.

All promoted assertions must be present in:

`edit/index.motion.json`

Recheck this file after every promotion and after any change to shot start times.

`export-hf` does not own or regenerate these motion assertions.

### 5.3 Promotion validation

Confirm:
- Promoted composition exists at the returned path.
- The selected shot id matches.
- Source and output versions are traceable.
- Assertions occupy expected absolute time intervals.
- Existing unrelated assertions have not disappeared.
- The promoted scene can be mounted by the root film.
- No unauthorized protected file changes occurred during dispatch.

If the envelope reports a conflict, do not manually forge a successful transition.

Reconcile the current revision and stage again when necessary.

## 6. Root edit construction

### 6.1 Inputs

The root editor uses the current STORY.md and promoted compositions.

Run `imagine-kit export-hf` to synchronize the HyperFrames storyboard and approved media records.

Read the generated `edit/STORYBOARD.md` in full.

The main agent builds or updates:

`edit/index.html`

The promoted assertions live in:

`edit/index.motion.json`

Do not replace root assertions with descriptive comments or per-shot motion files.

### 6.2 Scene hosts

Each scene host must:
- Use `class="scene"`.
- Supply the correct `data-composition-src`.
- Carry its cumulative start time.
- Preserve the approved duration.
- Reference a promoted, existing composition.
- Follow the installed HyperFrames composition contract.

The `scene` class is required for shader transition compositing.

Use the appropriate root duration metadata so the film's timeline equals the sum of its shot durations.

For a sequence of shots with durations `d1, d2, ...`:

- Shot 1 starts at `0`.
- Shot 2 starts at `d1`.
- Shot 3 starts at `d1 + d2`.
- Film duration is `sum(d_i)`.

Never mix absolute and shot-local seconds in the final root assertion file.

### 6.3 Camera and treatments

Prefer a camera wrapper around the composition, with supported GSAP transforms applied to the wrapper.

Use the HyperFrames media-treatment mechanism for intended grade and grain operations when available.

Preserve the approved visual mechanism and style.

A scene that was approved as a particular effect cannot be silently replaced with a different effect because the implementation is easier.

An unsupported requested mechanism is an explicit limitation, not an invitation to reclassify the fallback as approved.

### 6.4 Story modes

Narrated:
- Every L## has its mapped approved VO.
- Each unit appears exactly once.
- Audio placement respects line timing and film duration.

Text-led:
- Every T## appears exactly once.
- Display time meets the approved locked read window.
- Recalculate after copy changes.

Music-led:
- Approved music must exist.
- Cuts marked `on_beat` align with measured beats within the allowed frame tolerance.
- Do not invent a beat grid without observing the actual analysis.

Intentionally silent:
- Respect G0's choice.
- Preserve the delivery-required audio stream, using digital silence if appropriate.
- Record why silence findings are suppressed.

### 6.5 Read time

For a text copy unit containing `words`:

`required_seconds = max(1.2, 0.5 + 0.3 * words)`

Use the actual displayed copy to count words.

For example:
- 1 word: 1.2 seconds
- 3 words: 1.4 seconds
- 5 words: 2.0 seconds
- 10 words: 3.5 seconds

For text-led T##, this is the locked minimum unless a stronger approved requirement exists.

For ordinary titles and supplementary text, use it as editorial advice unless otherwise locked.

Do not lengthen the film beyond G0 constraints to accommodate unapproved copy. Report the conflict for an approved change.

### 6.6 Duration changes

When an approved duration changes:
1. Compute downstream shot start offsets again.
2. Reconcile root assertion timestamps.
3. Check audio, transitions, text windows, and SFX cues.
4. Revalidate the total film duration.
5. Regenerate stale snapshots and draft renders.
6. Reopen dependent review findings.

Never hide a missing script beat by extending unrelated scenes.

## 7. Required stage 9 verification

Before advancing to audio review:
- The STORY.md revision is current.
- Every approved selected shot is promoted.
- Every script unit has exactly one intended placement.
- Root hosts resolve to existing promoted compositions.
- Every scene host has its required class and composition source.
- Root duration matches the timeline.
- Root motion assertions use film-absolute time.
- The strict HyperFrames check has current observable evidence.
- No placeholders or broken media references remain.
- Any intentional overflow has an explicit reason.
- Approved assets and source hashes still match.

A failure blocks stage progression. Record the actual result rather than treating a previous successful check as current.
