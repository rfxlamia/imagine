# Delivery Recovery and G7 Acceptance

This reference describes stage-10 failures, impact recovery, human decisions, and final handoff.

## 1. State transitions

The normal delivery sequence is:

```text
G6 approved
    |
    v
Read mandatory files and fresh status
    |
    v
Validate current assets and active waivers
    |
    v
Strict HyperFrames preflight
    |
    v
Final render
    |
    v
QC and licence/raster verification
    |
    v
REVIEW.md findings and delivery note
    |
    v
Present final MP4 to user
    |
    v
Explicit G7 question and answer
    |
    v
G7 recorded and verified
    |
    v
Delivered
```

Any failed mandatory step interrupts the sequence.

Do not skip it because a deadline is approaching.

## 2. Stage-state vocabulary

Use precise state descriptions.

| State | Meaning |
|---|---|
| `ready_for_render` | G6 approved and preflight requirements satisfied |
| `render_blocked` | Render cannot safely run |
| `rendered_unverified` | Output produced but QC or audit incomplete |
| `qc_failed` | Actual QC returned blocking findings |
| `qc_verified` | Technical result verified for current output |
| `awaiting_g7` | Final artifact presented; user acceptance outstanding |
| `delivered` | G7 explicitly approved and verified |
| `stale` | Relevant source or approval changed |
| `blocked` | Mandatory evidence or capability unavailable |

These are descriptive workflow labels, not new values to write into the kit's recorded item statuses.

Only the kit's contract-defined records represent its state.

## 3. Error handling

Every command response must be interpreted using its actual envelope and exit code.

Useful exit-code classifications:

| Exit | Interpretation | Response |
|---|---|---|
| 0 | Reported success | Inspect actual data and evidence |
| 1 | HARD failure | Report failing rule and item |
| 2 | Usage error | Correct documented invocation |
| 3 | Capability blocked | Identify missing dependency |
| 4 | Stale or conflicting inputs | Reread sources and reconcile |
| 5 | Project write lock | Stop; avoid conflicting writes |
| 6 | References not approved | Return to asset approval |
| 7 | User decision required | Ask the appropriate user question |

Do not equate a process invocation with successful execution.

If an envelope is missing, invalid, or inconsistent with the output file, block the dependent step.

### 3.1 Missing HARD capability

When a required check:
- Is unsupported.
- Is not implemented.
- Cannot start.
- Times out.
- Crashes.
- Cannot access its required dependency.

Record `HARD_NOT_RUN` and the actual cause.

No agent-generated PASS can replace the missing result.

An eligible user-scoped exception may be discussed only through the waiver procedure. A non-waivable invariant always remains blocking.

### 3.2 Advisory not run

If an advisory check does not run, record its actual `not_run` result.

Never report it as passed.

The absence of advisory evidence must not be turned into an invented success claim.

## 4. Failure and recovery matrix

| Failure | Required recovery |
|---|---|
| Mandatory file missing | Block with exact path; locate or restore the required source |
| G6 missing | Return to imagine-edit for picture-lock review |
| G6 stale | Identify changed inputs and repeat affected approvals |
| Approved source changed | Impact report, user yes, owner-stage rebuild |
| Unauthorized protected-file change | Restore recorded copy, reject dispatch result |
| Patch CONFLICT | Reread mandatory sources and redispatch; no assumed auto-rebase |
| Asset ref missing or unapproved | Return to G5r/G5b as appropriate |
| Narrated L## missing | Return to audio owner; regenerate/reapprove |
| Audio licence incomplete | Obtain source and rights evidence or remove through approved edit |
| Strict-check error/warning | Fix the finding or block; only D10's exact proven exception is automatic advice |
| Renderer unavailable | Report missing runtime/dependency |
| Offline CDN unavailable | Configure and verify a working GSAP mirror |
| Render timeout/crash | Preserve failure evidence; diagnose and rerun |
| Final MP4 missing/unplayable | Block; re-render after fixing the cause |
| FPS/size mismatch | Correct the approved render configuration, or reopen G0 if necessary |
| Duration mismatch | Route timing repair through the owning edit or planning stage |
| Audio stream absent | Repair render/mix and repeat QC |
| Loudness/true peak failure | Impact approval if G6 locked; repair mix and repeat G6/QC |
| Missing audio listening | Report not heard; obtain appropriate human listening evidence |
| Raster soft without G4/G5b consent | Return to affected approval decisions |
| Raster replan | Present geometry options, user choice, rebuild |
| Safe-band unverified | Obtain manual evidence or eligible user-scoped waiver |
| Waiver source hash changed | Mark invalid, restore HARD requirement |
| G7 answer ambiguous | Leave G7 pending and ask its exact question |
| G7 rejected | Record actual rejection; route requested changes |
| Resume/compaction | Reread all mandatory files, status and evidence |

A blocked step must not be declared repaired merely because a plausible correction has been described.

## 5. Approved-source impact procedure

This procedure is mandatory even after G6 or a previous final render.

### 5.1 Impact report

Before modifying an approved source, show:

| Field | Content |
|---|---|
| Source | Exact file/item to change |
| Proposed edit | Precise requested modification |
| Canon impact | Affected bible/style/script facts |
| Shot impact | Affected shot ids and timing |
| Asset impact | Versions, references and approvals affected |
| Audio impact | VO, mix, music/SFX, ducking and cue timing |
| Gate impact | Items and gates reopened |
| Render impact | Draft/final MP4s and QC evidence invalidated |
| Recovery | Required rebuild, validation and user review |

This report is a prerequisite to the edit.

### 5.2 Obtain authorization

Ask:

"Do you authorize this exact change and the listed reopened approvals, including repeating G6 review where required?"

Require an explicit yes to that impact.

Do not treat:
- An earlier G6 approval.
- A generic "fix it".
- A deadline reminder.
- A previous waiver.
- Silence.

as approval of newly disclosed downstream impact.

### 5.3 Apply and reconcile

After permission:
1. Preserve the user's exact answer.
2. Route changes to the source-owning workflow.
3. Edit only the authorized material.
4. Refresh `imagine-kit status`.
5. Identify and resolve stale dependencies.
6. Rebuild affected images/audio/scenes/mix.
7. Repeat impacted technical checks.
8. Repeat affected asset approvals and G6.
9. Create a new final render and QC record.
10. Return to G7 for the new final artifact.

Never mutate an immutable delivered final version.

## 6. Final audit

Before presenting G7, verify:

### 6.1 Source and approvals

- G0–G6 prerequisite state is current.
- Current assets are approved.
- No required dependencies are stale.
- Exact locked source revision is identified.
- Current active waiver hashes match.

### 6.2 Technical result

- Final MP4 path exists.
- Render evidence identifies that file.
- QC was performed on the same file.
- G0 fps, dimensions and duration match.
- Audio stream exists.
- Applicable LUFS and true-peak checks pass.
- Required narrated VO is present.
- No prohibited placeholders remain.
- Third-party audio licences and credits are complete.
- No unapproved raster tier remains.
- No non-waivable invariant is failing.

### 6.3 Review

- P0/P1/P2 findings are recorded.
- All blocking P0/P1 findings are resolved.
- Retained advice has a reason.
- Soft tiers have their acceptance evidence.
- Manual 9:16 review is current when applicable.
- Audio listening evidence is accurately described.
- The delivery note lists every active waiver.

Do not use a review note to hide an unresolved technical failure.

## 7. G7 presentation

Present the user with:

1. Exact final MP4 path and version.
2. Its actual SHA-256, when observed.
3. Final duration, frame size and frame rate.
4. Audio stream, loudness, and peak measurements.
5. Raster-resolution summary and accepted soft tiers.
6. Licence and credit status.
7. Remaining P2 advice.
8. Every active waiver and its consequence.
9. Any known limitation.
10. A direct G7 approval question.

Suggested question:

"Have you reviewed the final MP4 at `<actual path>`, together with its QC findings and listed limitations, and do you explicitly accept this version as the final delivered film at G7?"

The user must answer this specific question.

A prior G6 answer is not enough.

## 8. Gate recording

### 8.1 Approval

After an explicit affirmative answer:

`imagine-kit gate G7 approve --quote "<exact user answer>"`

Copy the user's answer literally, preserving its meaning and wording.

Do not write a paraphrase, summary, or invented approval.

Read the returned envelope.

Verify:
- `ok` and `errors[]`.
- `data.gate`, `data.decision`, and `data.items` when supplied.
- The actual output exit status.
- A fresh `imagine-kit status` showing the relevant G7 state.

Only then may the main agent report the film accepted.

### 8.2 Rejection

If the user explicitly rejects the final artifact, record that decision through the documented gate operation using their verbatim rejection quote when applicable.

Do not mark G7 approved.

Preserve:
- Rejected artifact version.
- User's exact decision.
- Requested changes.
- Impact on previous approvals.
- Next recovery action.

Return to the appropriate owning stage.

### 8.3 Unanswered question

If the user has not answered the current G7 question:
- Leave G7 pending.
- Do not invent a quote.
- Do not claim final acceptance.
- Keep the verified MP4 available for review.
- Report precisely what decision is outstanding.

## 9. Post-delivery changes

An accepted G7 film is an immutable delivered version.

A later requested change is a new revision workflow, not permission to alter the accepted output.

Before editing:
1. Identify affected approved sources.
2. Show the impact and reopened gates.
3. Obtain the user's explicit approval.
4. Make a new version through the owning stages.
5. Revalidate and repeat G6.
6. Render and QC a new final MP4.
7. Obtain a separate G7 answer.

Do not reuse the old G7 quote for the new version.

## 10. Handoff contract

The final response from stage 10 must distinguish:

- Source-approved.
- Picture-locked at G6.
- Rendered.
- QC-verified.
- Human-reviewed.
- G7-approved.
- Delivered.

A film can be rendered without being QC-verified.

It can be QC-verified without being G7-approved.

It can be G7-pending while a valid MP4 exists.

Report the actual observed state, not the desired state.

Include the specific corrective action for every unresolved blocker.

Never fabricate a successful tool result, a completed human review, a waiver, or a delivery approval.
