# Generation State, Gates, Audit, and Recovery

## 1. State model

Every asset has a stable logical ID and immutable versioned physical identity.

Track two independent aspects:

**Production state**
- `planned`: required but not generated.
- `generating`: active attempt with temporary outputs only.
- `generated`: real output exists and passed required adapter checks.
- `blocked`: execution, capability, validation, or dependency failure.
- `stale`: an upstream dependency changed or approval is no longer current.

**Review state**
- `pending`: not yet accepted or rejected.
- `approved`: current explicit gate approval.
- `rejected`: user requested rejection/revision.
- `N/A`: gate inapplicable under approved audio-mode rules.

Never treat `generated` as automatically `approved`.

An approval belongs to an exact `(item ID, version, content hash, gate)` tuple.

A stale asset can retain historical evidence but cannot be used as current.

## 2. Dependency graph

Represent source dependencies explicitly:
- G0 project/audio mode → G1 script units and timing basis.
- G1 script → G2 bible/cast/lexicon and downstream content.
- G2 bible → G3 style and reference identity.
- G3 style + G4 plan → canonical prompts/refs.
- Canonical ref + G5r → batch images.
- Batch images + G5b → scene/shot assets.
- Script/lexicon/voice settings → final VO + G5a.
- Actual dimensions + shot transforms → resolution result.
- Approved image/audio versions → edit, mix, review, delivery.

An asset can have multiple source dependencies.

Store each edge against the exact upstream version/hash. IDs alone are not sufficient.

If the source changes, invalidate reachable dependent outputs while preserving unaffected branches.

## 3. Approved-source impact protocol

For an approved-source mutation:
1. Detect the requested modification and current lock.
2. Stop dependent generation before writing.
3. Calculate old-to-new differences.
4. Enumerate affected asset IDs, versions, gates, and shots.
5. Explain whether the proposed change impacts audio, timing, continuity, resolution, or delivery.
6. Present the report to the user and request explicit approval.
7. Record the user's answer verbatim.
8. Apply only the authorized modification through a permitted interface.
9. Invalidate precisely the affected dependent items.
10. Reopen the required reviews and gates.

The same sequence applies after G6 and G7. Delivery status does not authorize silent canon edits.

If the upstream change is rejected, keep current versions and approvals intact.

## 4. Gate recording

Gate presentation must name:
- Gate ID.
- Item or project scope.
- Current immutable version.
- Evidence reviewed.
- Relevant outstanding findings and resolution tier.
- Requested decision.

The user's answer must respond to that actual gate question.

Record:
- Exact item ID and gate.
- Asset version and hash.
- User decision.
- Verbatim user quote.
- Review evidence location.
- Date/time supplied by the actual record/tool, if available.
- Resulting disposition and affected dependencies.

Only execute `imagine-kit gate` with supported documented arguments; never invent its syntax.

Read and preserve the real kit envelope.

Do not backfill a gate with a previously uttered "looks good" or a change request that was never an approval answer.

## 5. Per-item review

### 5.1 G5r

One reference version, one approval decision.

A continuity review must precede the human answer.

Approval of a character sheet does not approve every other character/environment/style reference.

### 5.2 G5a

One line/take or individual music/SFX cue, one disposition.

An explicit N/A is valid only for the applicable recorded mode or silence decision.

### 5.3 G5b

One image version, one approval decision.

Contact sheets may aggregate presentation but must preserve individual item identity and decisions.

A rejected image does not automatically revoke another asset with unchanged dependencies.

## 6. Continuity review findings

Require the reviewer to report concrete visual evidence against the current `bible.yaml` and `style.md`.

Finding format:

`P0|P1|P2 · asset/time · where · problem → exact change`

Use:
- P0 for blocking identity, canon, or style violations, with specific bible ID or style anchor.
- P1 for significant correction requests.
- P2 for lesser review observations.

Never downgrade a missing mandatory visual inspection into a P2 pass.

If an image was not actually opened/inspected, say so and mark the visual judgment unavailable.

Store review findings next to the associated item and version.

## 7. Waiver lifecycle

A waiver is a user-granted, narrowly scoped exception recorded in `review/REVIEW.md`.

It must contain:
- Exact finding/rule and its current result.
- Affected item, version, and hash.
- Specific permitted exception.
- Scope and applicable stage.
- Risks and downstream effect.
- Exact user-answer quote.
- Whether it remains valid against current sources.

A change to the affected finding, source version, or scope requires re-evaluation; do not silently extend the old waiver.

### 7.1 Automatic advice

Under D10, the only automatic advice downgrade is `contrast_aa_failure` within a documented shader-transition window.

The window must be identified by actual evidence. The exception does not apply globally to contrast failures.

Every other check warning or error remains blocking under strict validation.

### 7.2 Non-waivable requirements

Never allow a waiver to bypass:
- Invalid or missing real tool evidence.
- Missing required asset or mismatched hash.
- Missing G5r approval for batch references.
- A stale/incorrect gate identity.
- Invalid or fake raster output.
- A below-budget raster HARD failure.
- Failed voice-file cloning capability.
- Unauthorized approved-source modification.
- Missing mandatory validation.
- Strict-check blockers outside the explicit automatic D10 exception.

A user preference may guide a subsequent authorized replan, but does not retroactively turn the failed result into a pass.

## 8. Manifest discipline

For every output version, preserve:
- Stable logical asset ID.
- Versioned physical path.
- Actual file hash and media metadata.
- Producer and configuration/revision identity.
- Source IDs, versions, and hashes.
- Compiled/revised prompts or TTS parameters.
- Intended shots and consuming layers.
- Measured resolution/duration where relevant.
- Review results and gate dispositions.
- Current, stale, blocked, or superseded status.

Keep superseded records for audit. Never reuse version numbers.

Reconcile the actual manifest against current files before every downstream handoff.

Do not manually mark a manifest row approved merely because an operator expects the gate to have passed.

## 9. Dispatch guard and restore

Before delegating work, identify protected source files and take:
- A sha256 for each file.
- A recoverable byte-for-byte copy.
- A list of expected read-only and permitted output locations.

After return, compare the hashes.

If a protected source changed unexpectedly:
1. Reject the dispatch result.
2. Preserve evidence of the diff.
3. Restore the exact recorded copy when it is safe and unambiguously owned by the dispatch.
4. If concurrent edits could be involved, stop for reconciliation instead of blindly overwriting.
5. Report the violation and do not apply the proposed patch.

A returned planning patch must be stored verbatim before the main agent requests its supported application.

Patch inputs must be hashes of sources actually read, never placeholder identifiers or guessed hashes.

## 10. Resume protocol

After interruption or compaction:
1. Reread the applicable Mandatory files in full.
2. Obtain actual status through the supported kit.
3. Rebuild a view of current items from the real manifest.
4. Compare authoritative source hashes.
5. Examine active/pending temporary work in `tmp/`.
6. Verify each completed physical file by path, hash, and media properties.
7. Preserve current approved assets unchanged.
8. Recompute dependencies and stale states.
9. Resume only incomplete, unapproved work that still has valid inputs.
10. Report contradictory evidence rather than guessing.

Never automatically regenerate an approved output.

A partial adapter response without a verified final file is not completion.

## 11. Failure policy

Distinguish:
- Missing prerequisites.
- Invalid source or manifest data.
- Unsupported adapter capability.
- Tool execution failure.
- Failed media post-check.
- Rejected continuity/visual/audio review.
- Gate pending or explicitly rejected.
- Stale input.
- Resolution-budget failure.
- Unauthorized mutation.
- Missing/contradictory result envelope.

Each blocker report must contain:
- Exact affected item IDs and versions.
- Actual failing operation and observed result.
- Counts of attempts already consumed.
- Relevant dependency/gate state.
- What remains valid.
- The next legally permissible recovery action.

If the image post-check's initial attempt and two retries fail, stop. A deadline does not authorize additional attempts.

If a missing upstream fact prevents correct generation, return `blocked`; do not invent a substitute visual element, prop, effect, or narration fact.

## 12. Downstream handoff

Handoff must name exact approved image and audio paths, hashes, gate identities, and dependent shots.

Include:
- Canonical ref review results.
- Batch image continuity findings.
- Measured per-layer and per-shot raster q.
- Soft-tier disclosures.
- Final audio measured properties and human listening outcomes.
- Stale/rejected/blocked items.
- Required downstream validation and manual reviews.

Do not mark editing, render, or QC complete solely because generation is complete.

Editing remains responsible for:
- Actual shot assembly and snapshot continuity review.
- Strict pinned HyperFrames check and D10 classification.
- Draft full-mix review at G6.
- Manual 9:16 safe-band assessment.
- Approved output promotion.

Delivery remains responsible for the real render, QC evidence, final specification/credits, and G7 acceptance.

Never assert the final video has passed QC, listening, or delivery approval unless the respective real checks and human gates occurred.

## 13. Audit note structure

Use `review/REVIEW.md` to preserve structured evidence for each material review or exception:

- Stage and gate ID.
- Item ID and immutable version.
- Source/content hashes.
- Evidence paths and tool outcomes.
- P0/P1/P2 continuity findings where applicable.
- Measured raster/audio facts.
- Exact human question and verbatim answer.
- Approval/rejection/N/A outcome.
- Scope of any user-granted waiver.
- Stale dependencies and outstanding blockers.
- Next allowed action.

An audit is a record of observed events, not a narrative asserting that the agent probably succeeded.
