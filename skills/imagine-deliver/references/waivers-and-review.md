# Review Ledger and Scoped Waivers

This reference defines the review and waiver records maintained by the main agent during final delivery.

## 1. Review authority

The review ledger is:

`review/REVIEW.md`

It contains:
1. Current review context and source revision.
2. P0/P1/P2 findings and their evidence.
3. Advisory items retained with reasons.
4. Effective raster tiers and G4/G5b decisions.
5. Manual platform-band findings.
6. Audio observations and user listening records.
7. Waivers.
8. Delivery note.

Follow the installed HyperFrames `review.md` conventions.

## 2. Finding format

For each finding record:
- Finding id.
- P0/P1/P2 severity.
- Film revision and affected shot/unit/asset.
- Timestamp or relevant frame.
- Exact location and source.
- Observed problem.
- Expected behavior.
- Exact corrective action.
- Elements that should remain unchanged.
- Current disposition and evidence.

Use the HyperFrames review format:

`t=4.2s · where · problem → exact change · what stays`

### 2.1 Severity

**P0**: Critical integrity, provenance, or delivery failure.

Examples: corrupt MP4, missing approved content, missing essential audio licence, or untrustworthy provenance.

**P1**: Blocking technical or material creative defect.

Examples: HARD validator failure, wrong frame size, unresolved narration, unapproved raster version, or substantial continuity defect.

**P2**: Non-blocking editorial advice.

Examples: optional pacing refinement or a fully disclosed and approved soft raster tier.

A HARD failure cannot become P2 merely because the agent believes it is harmless.

### 2.2 Retained advice

For every retained advisory finding, record:
- Original evidence and recommendation.
- Decision to retain or reject the advice.
- Concrete reason.
- Applicable style override, if any.
- Resulting delivery implication.

Do not silently discard advice.

### 2.3 Soft raster notes

For each soft asset record:
- Asset id and version.
- Shot references.
- Actual measured q.
- Accepted G4 planned tier.
- Accepted G5b measured tier.
- Expected visual consequence.
- Whether any source changed after approval.

A soft asset without both approvals remains a delivery blocker.

## 3. Three distinct exception categories

### 3.1 Automatic D10 advice

`contrast_aa_failure` is automatically advisory **only** for a proven shader-transition interval.

It is not a user waiver.

Record exact frame/time evidence and the transition interval.

All other strict-check errors and warnings remain blocking unless a separate, valid rule-specific resolution applies; never label the strict check clean when a blocking finding remains.

### 3.2 User-granted waiver

A waiver:
- Covers exactly one eligible HARD rule.
- Is scoped to explicit source references.
- States why it is needed.
- Explains the consequence.
- States the substitute manual check.
- Is granted only by the user's explicit answer.
- Is bound to the hashes of the scoped sources.
- Remains visible in the review history.

A proposed waiver is not permission to proceed.

### 3.3 Non-waivable invariant

Never propose a waiver for:
- Missing or invented gate quotes.
- Invalid patch ownership, keys, or base revisions.
- Failed protected-file guard integrity.
- Unapproved assets or hash-mismatched canonical references.
- Unknown third-party audio rights.
- Shipping placeholders.
- An unplayable MP4 or one that violates the approved G0 output specification.

A user may authorize a new source specification through the impact/reapproval workflow. That is not a waiver of the existing technical evidence.

## 4. Exact waiver format

Create the following section **after** the P0/P1/P2 notes and **before** the delivery note.

Use these keys verbatim:

```markdown
## Waivers

### W-001 HARD-<RULE-ID>
- status: proposed
- rule: HARD-<RULE-ID>
- items: shot:s03.previz, asset:bg-harbor.v2
- item_hashes: shot:s03.previz=<64-hex>, asset:bg-harbor.v2=<64-hex>
- reason: <the user's reason>
- consequence: <what the film or the delivery loses while this rule is waived>
- manual_check: <what the user checks by hand instead>
- asked: "<the exact question the main agent put to the user>"
- quote: "<the user's verbatim answer to that question>"
- granted: <YYYY-MM-DD>
- history: proposed <YYYY-MM-DD>
```

The angle-bracket values are explanatory placeholders for this template only; never leave them as live values in a delivery record.

IDs must be stable and unique.

Supported `status` values:

- `proposed`
- `active`
- `revoked`
- `invalid`

Only `active` entries count as valid exceptions.

## 5. Allowed waiver scopes

`items` contains concrete source references, not wildcards or broad descriptions.

Allowed reference families:

```text
shot:<sNN>.<stage>
asset:<id>.v<N>
unit:<L##|T##>
file:<relpath>
```

File references must be among the resolver-supported project-relative paths.

Examples:

```text
shot:s03.previz
asset:bg-harbor.v2
unit:L02
file:edit/index.motion.json
```

Do not use:

```text
all
shot:*
asset:*
entire-film
```

A waiver for one shot or asset version cannot be silently extended to another.

## 6. Proposal lifecycle

### 6.1 Create a proposal

The main agent may write a `proposed` entry with:
- Rule.
- Exact items.
- Current item hashes.
- Reason.
- Consequence.
- Manual check.
- Proposal history.

Collect the hashes from the actual `imagine-kit status --ref <items>` result.

For several references, pass the supported comma-separated `--ref` argument and read the matching values in `data.sources`.

Do not compute substitute hashes manually or copy them from a different revision.

Subagents must not create or propose waiver entries.

### 6.2 Ask the user

Explain:
- Which exact rule would be waived.
- Which explicit items are affected.
- Why the requirement could not be met.
- What the audience or delivery loses.
- Which manual check the user would perform.
- Whether the rule is eligible for waiver.

Ask a specific question.

For example:

"Do you explicitly accept the identified safe-band inspection exception for the listed shots, knowing that those captions have not been verified against the platform controls?"

Record the exact question in `asked`.

### 6.3 Activate

Only an explicit affirmative answer to that question permits activation.

Then:
1. Set `status: active`.
2. Preserve the exact question in `asked`.
3. Copy the user's answer verbatim to `quote`.
4. Record the grant date in `granted`.
5. Append `active <YYYY-MM-DD> "<verbatim answer>"` to `history`.
6. Verify that the item hashes are still current.

Do not use a previous gate answer or a change request as the waiver quote.

If the answer is unclear, leave the status `proposed`.

### 6.4 Validate before use

Before **every gate, render, and delivery**:

1. Find all active waiver entries.
2. Fetch fresh current source values with `imagine-kit status --ref <items>`.
3. Compare each value to the matching recorded `item_hashes` value.
4. Verify the rule and item scope.
5. Verify `asked`, affirmative `quote`, and `granted`.
6. Verify the rule is not non-waivable.
7. Preserve the evidence of validation.

Any changed or unresolved source reference invalidates the waiver.

Do not accept a previously active entry without rechecking it.

### 6.5 Invalidate

On any scoped hash mismatch:

```text
- status: invalid
- history: proposed <YYYY-MM-DD>; active <YYYY-MM-DD> "<quote>"; invalid <YYYY-MM-DD> <ref> changed
```

Preserve the existing history and append the invalidation event; the above is an illustrative sequence.

Never delete the entry.

Treat the original HARD requirement as failing again.

A new exception requires a new explicit user answer for the current scope and evidence.

### 6.6 Revoke

Only the user's revocation permits a revocation record.

Set `status: revoked`.

Append:

`revoked <YYYY-MM-DD> "<verbatim user words>"`

Never delete a revoked waiver or erase its prior quote.

## 7. Review after G6

G6 approval locks the currently reviewed picture and full mix.

If stage 10 reveals a need to change the mix, caption layout, asset version, or other approved source:
- Record the finding.
- Prepare an impact report.
- Obtain explicit user permission before changing the source.
- Reopen affected approval items.
- Rebuild and re-review.
- Require G6 again for a changed final picture or mix.

A waiver cannot substitute for permission to modify approved sources.

## 8. Delivery note

Add a delivery note after the waiver section.

Recommended structure:

```markdown
## Delivery note

- final_mp4: post/<slug>.v<N>.mp4
- sha256: <observed hash>
- story_revision: <observed revision>
- g0: <approved format, fps, duration, audio mode>
- g6: <approved gate evidence>
- strict_check: <current observed result and D10 advice>
- qc: <current measured result>
- raster: <worst q, native/soft details>
- audio: <stream, LUFS, true peak, listening status>
- licences: <source and credit audit result>
- findings: <open/resolved P0/P1/P2 references>
- active_waivers: <id, rule, explicit items for each>
- g7: pending
```

Fill only observed values.

Never put fake hashes or invented metrics into the real note.

If no waiver is active, record `active_waivers: none`.

After verified G7 approval, update the G7 entry with its actual decision evidence and user quote.

The delivery note is an audit summary, not a replacement for the underlying tool reports.

## 9. Audio observation language

The main agent must distinguish:
- Objective measurement.
- Human listening decision.
- Direct audio observation actually available to the agent.
- Not-performed checks.

When Claude did not hear the audio, state:

"Audio measurements were checked, but I did not hear the audio. Human listening is still required."

A recorded G6 user listening decision remains usable as human evidence only while the mix is unchanged.

Do not claim the final MP4 was listened to by Claude merely because QC measured it.
