
# Review, Waivers, G6, and Recovery

This reference defines how imagine-edit records evidence, handles exceptions, presents G6 to the user, and recovers from blocked or stale work.

## 1. Evidence hierarchy

Use this order when evaluating a claim:

1. Current tool results and artifact measurements for technical HARD requirements.
2. Current approved project/canon sources for narrative and design invariants.
3. Current human review for visual and listening judgements.
4. Current user gate answers for approval and lock decisions.
5. Agent recommendations for advisory questions only.

Evidence from a lower level never substitutes for evidence required at a higher level.

In particular:
- A user saying a render looks fine does not create a successful strict-check result.
- An agent saying the audio sounds fine is not evidence if the agent did not hear it.
- A successful check does not create human picture-lock consent.
- A pre-change approval does not approve new source content.
- A subagent report is not an observed tool execution by the main agent.

When a required observation is unavailable, record `NOT_RUN`, `UNKNOWN`, or `HARD_NOT_RUN` rather than PASS.

Never invent measurements or claim a tool executed based on an expected result.

## 2. Review file

The project review ledger is:

`review/REVIEW.md`

Follow the installed HyperFrames `references/review.md` convention (SKILL.md section 2.1 says how to locate it).

Use P0/P1/P2 classifications, not a free-form PASS/FAIL report in place of structured findings.

### 2.1 Severity

P0:
- Fundamental integrity, provenance, ownership, or critical delivery failure.
- Missing required approved content.
- A broken or untrustworthy output where release would be unsafe or misleading.

P1:
- A blocking technical or creative requirement not met.
- A HARD check failure.
- Missing mandatory evidence or unresolved material continuity.
- Incorrect timing, audio mapping, or composition structure.

P2:
- Editorial advice, refinement, and non-blocking preferences.
- Soft quality-tier findings with reasons and disposition.

The exact severity convention from HyperFrames `references/review.md` takes precedence where it provides a more specific classification.

Do not downgrade a HARD violation to P2 to bypass blocking behavior.

### 2.2 Finding schema

Each finding should preserve:

- Finding id.
- P0/P1/P2 tier.
- Project stage and current revision.
- Affected shot ids, script-unit ids, or canon ids.
- Exact observed problem.
- Supporting file path, timestamp, line, frame, tool result, or measurement.
- Expected condition.
- Exact corrective action.
- Current disposition.
- Reviewer and evidence type.

A continuity finding must cite the affected canon identifiers and the exact conflicting elements or changes.

Avoid vague reports such as "continuity looks off" or "timing needs work" without identifying a concrete target.

### 2.3 Retained advice

When retaining an advisory finding instead of fixing it, record:
- Finding and source.
- Why the recommendation was kept or rejected.
- Which approved style override applies, if any.
- Responsible decision maker.
- Whether it has any downstream impact.

Do not silently discard advice.

## 3. Three distinct exception mechanisms

### 3.1 Automatic D10 allowlist

Only the strict-check finding named:

`contrast_aa_failure`

may become advisory when the failing sample is demonstrably inside an active shader-transition window.

Require evidence of:
- The actual reported failure.
- The affected frame or time interval.
- The exact shader-transition interval.
- That the reported failure lies inside the transition interval.

Record the disposition and its evidence in REVIEW.md.

A warning occurring just before or just after the transition does not qualify.

No other HyperFrames strict-check category is automatically allowlisted.

A mixed check with any unallowlisted error or warning remains blocking.

### 3.2 User-granted scoped waiver

A waiver is a human decision, not an agent-inferred allowance.

Agents may:
- Identify a potentially waivable limitation.
- Explain the risk and scope.
- Propose mitigation.
- Ask the user whether they accept the exception.

Agents may not:
- Grant the waiver.
- Record silence as approval.
- Reuse an earlier gate answer as waiver consent.
- Expand the waiver to unrelated shots.
- Ignore changed scope hashes.

Subagents may report a limitation but must not issue or record a granted waiver.

A valid REVIEW.md waiver entry follows the imagine skill's format:
`W-<nnn>` id, `status` (`proposed | active | revoked | invalid`; only
`active` counts), `rule: HARD-<RULE-ID>`, `items` and `item_hashes`
(source-format item refs and the hashes from `imagine-kit status`),
`reason`, `consequence`, `manual_check`, the exact `asked` question, the
verbatim affirmative `quote`, `granted` date, and `history`. A scoped
hash change marks the entry `invalid`; entries are never deleted.

No hidden or implicit waivers exist.

If any scoped source hash changes, mark the waiver stale and ask again if the exception is still needed.

A waiver for one aspect ratio, asset, shot, or version does not apply to another.

### 3.3 Non-waivable invariants

Do not offer waivers that would authorize:
- Fabricating tool results or observed measurements.
- Reporting a failed unallowlisted strict check as clean or passed.
- Omitting the required explicit G6 answer.
- Claiming to have heard audio that was not heard.
- Bypassing dispatch ownership and protected-file integrity.
- Secretly editing approved sources without impact confirmation.
- Concealing missing or unknown third-party audio licensing.
- Replacing approved assets with unapproved versions.
- Silently dropping required narration or other mandated content.
- Rendering with best-effort omission while claiming strict delivery.
- Circumventing the three-attempt scene lint limit.

These are integrity bans, not additions to the non-waivable HARD list in the imagine skill's `references/waivers.md`, which is exhaustive. A failed strict check (HARD-HF-STRICT) stays waivable: the user may grant a waiver scoped to the exact findings and items, and the check is then reported as failed and waived, never as clean. Fixing through scene-builder remains the default to offer first.

Where a requirement is legitimately changeable, the user may authorize a new approved source specification through the appropriate impact and reopening workflow.

Changing the requirement is not equivalent to waiving evidence that the new requirement was met.

The Phase 1 manual safe-band `HARD_NOT_RUN` condition may be presented for a specifically scoped user waiver where the workflow permits such an exception. The user must understand that the layout has not been verified.

Do not convert lack of inspection into a technical PASS.

## 4. Approved-source change impact

Before editing an approved source, show:

| Field | Required content |
|---|---|
| Proposed change | Exact source and intended modification |
| Canon impact | Affected bible/style/script entries |
| Story impact | Affected shot and unit ids |
| Asset impact | References, voice, media, or versions affected |
| Timing impact | Duration, shot starts, cuts, and assertions |
| Gate impact | Which prior approvals reopen |
| Artifact impact | Which checks, sheets, mixes, or renders become stale |
| Recovery path | Steps to rebuild and reapprove |

Ask explicitly whether the user authorizes that impact.

The answer must be a clear yes to the proposed change and reopening scope.

A user saying "please adjust this" is a change request; it is not automatically approval to invalidate unrelated locked sources or record G6 again.

After approval:
1. Record the answer verbatim.
2. Apply only the authorized source change through its owning workflow.
3. Mark affected downstream evidence stale.
4. Rebuild and revalidate dependent artifacts.
5. Repeat any required human approvals.

This applies after G6 as well as before it.

Do not make a post-lock mix adjustment without showing its impact and reopening the relevant approval.

## 5. G6 prerequisites

G6 is picture lock for the current complete film.

Before asking the user:

### 5.1 Technical evidence

Verify:
- Current G0, canon, and STORY.md sources.
- Completed and promoted required scenes.
- Strict HyperFrames check is clean under D10.
- Root motion assertions are current.
- All scenes resolve.
- No unintended overflow.
- All required audio has ids.
- All narrated L## units are present.
- No unintended VO overlap.
- Duration meets G0.
- FPS, dimensions, and aspect meet G0.
- All required asset versions are approved.
- Third-party audio metadata is complete.
- No shipping placeholders remain.
- QC has observed the actual draft artifact.
- All P0/P1 findings are resolved.

Do not substitute an earlier check performed against a different edit revision.

### 5.2 Visual review

Produce current review snapshots.

Review actual frames for:
- Canonical character and object continuity.
- Approved references and shot identity.
- Text visibility and hierarchy.
- Layout, overflow, and clipping.
- Platform-safe bands in 9:16 output.
- Minimum readable text size of 28 px.
- Action rail obstruction.
- Shader-transition behavior.
- Camera and motion intent.
- Missing or placeholder content.

Use the continuity-reviewer for relevant continuity findings.

Read its actual report. Translate findings into HyperFrames P0/P1/P2 conventions where necessary, retaining exact canon ids and observed changes.

### 5.3 Manual safe-band check

For portrait 9:16 output:
1. Read the G0 platform setting.
2. Establish the applicable platform band and action rail exclusion.
3. Inspect snapshots from the actual draft.
4. Check relevant text bounds against the band.
5. Measure or verify font sizes at final output scale.
6. Record at least the affected frames, elements, and results.
7. Mark uncovered cases `HARD_NOT_RUN`.

A generic stays-in-frame check only proves containment inside the video frame. It does not prove that platform UI will not obscure text.

Do not mark safe-band PASS from a frame-boundary check alone.

### 5.4 Audio review

Produce the full draft rough mix as an MP4.

The audio review must assess:
- Speech intelligibility.
- Music ducking under narration.
- SFX entry and exit timing.
- Perceived loudness balance.
- Unintended overlaps or masking.
- Awkward gaps and abrupt cuts.
- Music-led cut synchrony where relevant.

Separate objective measurements from listening judgements.

Examples of objective evidence:
- Integrated LUFS.
- True peak.
- Audio-stream presence.
- WAV length.
- Cue timestamps.
- Beat timing deltas.

These do not prove the audio sounds good.

If Claude did not directly hear the audio, state:

"Audio measurements were checked, but I did not hear the audio. Human listening is still required."

Do not replace that statement with "listening passed" unless real listening evidence exists.

The user must have an accessible draft MP4 or usable audio files for G6 review.

## 6. G6 gate question and answer

After technical and review prerequisites are satisfied, ask a question specific to the current artifact.

For example:

"Have you watched and listened to the full draft MP4 at [actual path/version], including the voice, music ducking, and SFX timing, and do you approve G6 picture lock for this version?"

The user must explicitly answer this G6 question.

Qualifying answers must identify approval, not merely acknowledge the question.

Do not record:
- "Looks good" from an unrelated earlier message.
- A request to change a shot.
- Approval of an isolated still.
- G5a voice approval.
- G5r reference approval.
- Silence.
- An agent-generated approval.

Record the exact affirmative user answer as the quote through `imagine-kit gate` using its actual supported contract.

Read the returned JSON envelope to confirm the state transition.

If the user requests changes:
1. Do not lock.
2. Record the requested changes.
3. Produce the required impact report when approved sources are affected.
4. Apply authorized changes.
5. Repeat affected checks and renders.
6. Ask the G6 question for the new version.

A G6 answer is version-specific.

## 7. Recovery matrix

| Failure | Required response |
|---|---|
| Mandatory source absent | Block, identify missing path, do not guess |
| Upstream approval absent | Return to owning gate |
| Source hash changed | Mark dependent outputs stale |
| Unauthorized subagent write | Restore protected copy, verify hashes, reject output |
| Scene lint attempt 3 fails | Block with actual lint JSON; no fourth attempt |
| Unsupported visual mechanism | Block or report unsupported; do not silently substitute |
| Promotion conflict | Reconcile revision and revalidate |
| Root motion missing | Regenerate through correct promotion workflow |
| Strict-check error/warning | Correct or block; D10 exception only when proven |
| Unapproved asset version | Return to appropriate asset approval |
| Missing VO | Regenerate or recover the approved line |
| Audio licence incomplete | Exclude or resolve provenance; block delivery |
| No audio listening evidence | Report NOT_HEARD; obtain human review |
| No manual safe-band inspection | Record HARD_NOT_RUN; inspect or seek valid scoped waiver |
| QC failure | Preserve report, fix, rerun |
| Render dependency absent | Report missing dependency or offline mirror |
| Gate answer ambiguous | Ask explicit gate question; do not record approval |
| Post-G6 source change | Impact report, user yes, reopen affected approvals |
| Context compacted | Reread full mandatory stage files and revalidate freshness |

A failed action's only permitted continuation is a contract-compliant correction, resumption, or reported block.

Do not silently downgrade the requirement, skip the failed step, or replace missing evidence with an estimated result.

## 8. Handoff and final status

Each return to the user or parent workflow should state:
- Current stage and edit revision.
- Current gate state.
- Completed and blocked shot ids.
- Source hashes or version identifiers relied on.
- Actual tool result references.
- Root composition and motion state.
- Draft and delivery artifact paths when observed.
- P0/P1/P2 findings.
- Current waivers and their scope validity.
- Audio measurement and listening status.
- Required approval or corrective action.

Distinguish clearly:
- Proposed.
- Implemented.
- Validated.
- Promoted.
- Rendered.
- Human-reviewed.
- Picture-locked.
- Delivered.

No transition should be claimed without its corresponding evidence.

## 9. Final audit checklist

Before calling the stage complete:

1. Mandatory files were reread after the latest resume or compaction.
2. Source and approval versions match the work performed.
3. Every dispatch had protected-file hashing and verification.
4. No scene exceeded three lint attempts.
5. Every promoted composition has valid root-timed assertions.
6. The root timeline and approved script-unit placements are complete.
7. The full audio mix has verified sources, licences, and measurements.
8. Strict check and QC results are current and truthful.
9. P0/P1 findings are resolved; P2 dispositions are recorded.
10. G6 was explicitly answered by the user for the current draft, or remains pending.

If any item is missing, report the exact outstanding requirement instead of declaring completion.
