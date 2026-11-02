# Review, approvals, invalidation, failures, and recovery

This reference governs G4, item-level approval state, protected upstream edits, waiver handling, downstream consequences, and reporting.

## 1. Authority of human decisions

The main agent may ask questions, prepare material, audit proposals, and record actual answers.

It may not:

- Approve its own work.
- Infer approval from silence.
- Convert a change request into an approval.
- Reuse a prior unrelated statement as a gate answer.
- Record a user quote the user did not say.
- Treat an earlier approval as covering a newly changed item.
- Grant a waiver on behalf of the user.

A gate record is valid only after the user has answered the exact current gate question.

If the user asks for changes instead, record the requested changes and return to the affected planning step. Do not write an approved gate record.

## 2. G4 presentation and record

Present the G4 review using the actual applied planning revision.

The review must show:

- Approved G0 target specification.
- Script and canon versions used.
- Full shot plan, including timing and FX intentions.
- Compiled asset prompts.
- Canonical reference inventory.
- Per-shot resolution tiers and limitations.
- Estimates and uncertainty.
- Music source and rights, or permitted absence.
- Known unsupported features.
- Material risks and dependency conditions.
- The exact proposed decision.

Ask the user a direct question identifying the specific plan revision being approved.

For example, ask whether they approve the named production plan revision, its listed asset/prompts, canonical references, resolution tiers, estimate, and music-rights assumptions for generation.

Do not phrase an approval question as a request for general feedback.

### 2.1 Suggested REVIEW.md gate record

Use the canonical format required by `docs/contracts/source-formats.md`. The following describes the information that must be preserved; it does not authorize a second incompatible schema.

```markdown
### G4 — Production plan

- Decision scope: project production plan
- Source revision: [actual STORY.md revision]
- Source evidence: [actual relevant hashes]
- Presented items: [identifiers and versions]
- Question asked: [exact current gate question]
- User answer, verbatim: [the user's actual answer]
- Decision: [approved / rejected / changes requested]
- Recorded evidence: [actual conversation or journal reference]
- Invalidated or excluded items: [actual affected identifiers]
```

Bracketed descriptors are documentation notation, not values permitted in a real approval record. A real record must contain the actual data.

Do not create an approval record when the answer is pending.

If recording through `imagine-kit gate`, use only its documented arguments and inspect the returned envelope. Do not manufacture a successful result when recording fails.

## 3. Item-level approvals and invalidation

Record decisions at their defined scope and reopen only the items dependent on a changed source, leaving unrelated valid approvals intact. <!-- rule:GATE-PER-ITEM -->

Approval scopes:

| Gate | Item scope |
|---|---|
| G0 | Project specification |
| G1 | Each `L##` or `T##` unit |
| G2 | Each bible entity and applicable voice/lexicon decision |
| G3 | Each style anchor |
| G4 | Production plan for the identified revision and dependencies |
| G5r | Each canonical reference image/version |
| G5a | Each voice line or relevant music/SFX cue |
| G5b | Each generated visual asset/version |
| G6 | Project picture lock, with shot-level notes |
| G7 | Delivered MP4 |

Do not confuse G4's project scope with G5 per-item decisions.

The main agent must maintain source versions and dependency edges sufficient to identify affected items.

Reopening one item does not automatically revoke unrelated approvals, but a project-level plan gate can become stale if a material covered dependency changes.

When the dependency graph cannot establish which approvals remain safe, block the affected downstream work until the ambiguity is resolved. Do not choose a convenient minimal impact set without evidence.

## 4. Upstream discovery

When storyboard or previz work needs a fact absent from the approved bible, stop the affected work, report the missing fact as blocked, obtain the authorized bible edit, and then recompute downstream impacts. <!-- rule:PROC-UPSTREAM-BLOCKED -->

Examples include:

- An undefined character or named prop being used as an approved entity.
- Missing character features required for a canonical reference.
- An unspecified relationship that an action depends on.
- A required environment or object whose canonical identity is absent.
- A pronunciation or voice-casting dependency missing for narrated work.

Do not:

- Invent the fact.
- Turn the missing entity into an unapproved generic prop.
- Quietly redefine a character.
- Ask the planning subagent to edit the bible.
- Work around a missing fact by changing the story's meaning.

The main agent reports the question and routes the edit to the owning canonical stage.

A downstream agent may propose options, but they are not canonical until authorized and recorded.

## 5. Impact-before-edit protocol

Before changing any approved source, enumerate affected gates and items, show that impact report to the user, and obtain an explicit yes to the specific upstream modification before performing it. <!-- rule:PROC-IMPACT-CONFIRM -->

This applies to:

- G0 format, duration, platform, or `audio_mode`.
- G1 locked units.
- G2 approved bible facts and voice decisions.
- G3 style anchors.
- G4-approved planning material.
- G5-approved references, audio, and visuals.
- Changes to sources covered by G6 picture lock.
- Any otherwise approved source with downstream consumers.

### 5.1 Impact report

Show:

1. Proposed source and exact item to change.
2. Current approved value and proposed new value.
3. Reason for the change.
4. Directly dependent items and hashes.
5. Gates that will reopen.
6. Downstream reference/audio/image/shot changes required.
7. Unaffected approvals that should remain valid.
8. Expected regeneration, timing, or rendering consequences.
9. The specific user authorization requested.

Wait for a direct answer to that report.

A user's initial request to explore a change is not necessarily approval of its complete invalidation impact.

If the user declines, preserve the approved source and report the blocked dependent action.

### 5.2 Cascade

After authorization:

1. Route the source edit through its owning skill and documented write path.
2. Inspect the actual edit result.
3. Recompute hashes of affected source sections.
4. Identify every dependent planning or generated item.
5. Re-open only affected gate items and project-level gates whose covered plan changed.
6. Mark stale outputs using the documented project state mechanism.
7. Re-read planning mandatory files.
8. Recalculate clock, unit coverage, resolution, prompts, and references as applicable.
9. Re-dispatch affected planning subagents under new revisions.
10. Require new human decisions at reopened gates.

Never present an old artifact as current merely because its filename is unchanged.

### 5.3 After G6

G6 picture lock does not exempt the project from impact review.

If a post-G6 source change affects the film:

- Show the same impact report.
- Obtain explicit authorization.
- Re-open G6 when its locked picture or full mix changes.
- Re-open relevant G5 decisions when assets or cues change.
- Regenerate the affected draft evidence.
- Re-run required checks and reviews.
- Require new G6 approval before a G7-dependent delivery can rely on the change.

Do not modify an approved mix or source under an earlier broad G6 approval.

## 6. Hard rules, advice, and waivers

### 6.1 Non-waivable requirements

Never grant, request, or imply a waiver for gate-answer authenticity, patch/key isolation, matching base revision, dispatch guard integrity, required asset and reference approval/hash provenance, audio licence, forbidden placeholders, or a playable MP4 satisfying the G0 specification. <!-- rule:HARD-NON-WAIVABLE -->

These are hard requirements independent of style or schedule.

A non-waivable failure must be fixed through an authorized workflow or remain blocked.

Do not label an impossible requirement as waived to keep the pipeline moving.

### 6.2 Automatic D10 advice exception

The only D10 automatic demotion is `contrast_aa_failure` occurring inside a verified shader-transition window.

For that exception:

- Verify the precise diagnostic code.
- Verify the affected frames lie within the actual shader-transition range.
- Record why the exception applies.
- Demote only that scoped diagnostic to advice.

Every other HyperFrames check warning or error remains blocking under the strict-check policy.

Do not treat all contrast issues as demotable.

Do not demote a warning because it is short-lived, visually subtle, or difficult to fix.

Do not use a new or guessed diagnostic code as an equivalent exception.

### 6.3 User-granted scoped waiver

For a genuinely waivable requirement outside the non-waivable set, the user may explicitly grant a scoped waiver.

The main agent must:

1. Identify the exact requirement and affected items.
2. Show the concrete failed condition.
3. Explain the risk and available compliant repair.
4. Identify the proposed waiver scope and duration.
5. Ask for an explicit human decision.
6. Record the verbatim answer in `REVIEW.md`.
7. Preserve the applicable source evidence and versions.
8. Keep other violations blocked.
9. Re-evaluate the waiver when its affected inputs change.

A waiver must not be inferred from the user's acceptance of a different item.

There is no independent waiver CLI workflow in Phase 1.

### 6.4 Suggested waiver entry

Follow the canonical `REVIEW.md` syntax in the source-format contract. Preserve at least:

```markdown
### Scoped waiver — [actual identifier]

- Requirement: [actual rule or diagnostic]
- Scope: [exact shots, items, frames, or versions]
- Evidence: [actual measured failure]
- Risk explained: [specific consequence]
- Compliant alternative offered: [actual repair]
- Question asked: [actual waiver question]
- User answer, verbatim: [actual answer]
- Decision: [granted / refused]
- Expiration or invalidation condition: [specific dependency]
```

Never leave descriptor text in a real waiver entry.

Record the user's decision, not the main agent's proposed disposition.

An explicit scoped waiver is separate from the automatic D10 advice exception and does not expand that allowlist.

## 7. Strict downstream checks

At the implementation and review boundary, the owning edit workflow must run the pinned strict HyperFrames check with telemetry disabled:

```bash
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict
```

Inspect the real diagnostics.

Do not report that warnings were fixed automatically without observed evidence.

All diagnostics outside the single applicable D10 automatic exception must be resolved or handled through an actually authorized, non-hard scoped waiver where the contract permits it.

The planning skill must not claim G6 merely because the planned FX and camera parameters appear valid.

At G6, check the format-specific 9:16 safe band manually in the actual draft and record the inspection and any resulting decision in `REVIEW.md`.

The review must include both the Studio preview and a playable draft MP4 with the full mix listened to by the user.

Planning does not substitute for this downstream inspection.

## 8. Failure classification and response

| Failure | Required response |
|---|---|
| Missing mandatory file | Block stage; obtain actual source |
| Missing approved canon fact | Block affected work; route bible change and cascade |
| Missing or stale clock | Recompute from current approved source |
| Unauthorized protected-file modification | Restore snapshot; reject dispatch |
| Invalid patch schema or keys | Reject; return actionable findings to same subagent |
| Undeclared or fake input hashes | Reject; obtain real read/hash evidence |
| `CONFLICT` | Re-read mandatory files; re-dispatch; never auto-rebase |
| `STALE_INPUTS` | Re-read changed sources; recompute impacts and re-dispatch |
| Unverified effect mechanism | Mark unsupported or block; do not invent |
| Narration longer than plan | Recalculate timing; affected storyboard/previz replan |
| Missing licensed music in music-led mode | Block clock and G4 |
| Failed music beat tolerance | Repair grid or timing within legitimate constraints |
| Read-time violation | Increase hold or obtain authorized upstream change |
| Resolution `replan` tier | Present choices and obtain user decision |
| Failed kit envelope | Treat as unobserved or failed, not success |
| Third rejected patch | Block and report; never launch round four |
| No explicit gate answer | Keep gate pending |
| Post-approval source change | Impact report, yes, source edit, selective cascade |

Every recovery must start from the actual current disk state, not a hypothesized state inferred from a failed operation.

## 9. Upstream and downstream ownership

### 9.1 Upstream

`imagine` owns project setup, G0, routing, and project-level impact handling.

`imagine-canon` owns G1 script, G2 bible, and G3 style. Planning subagents cannot create approved canonical entities.

When planning discovers an upstream problem, report it and route it to the owner.

### 9.2 Downstream

`imagine-generate` owns:

- Creating canonical references after G4.
- Continuity review and G5r.
- Approved VO and audio listening G5a.
- Production batch images.
- Visual continuity and G5b.
- Measured source dimensions and post-generation resolution confirmation.

`imagine-edit` owns:

- Shot implementation.
- Shadow stage and promotion.
- Root composition and mix.
- Strict rendering checks.
- Draft review and G6.

`imagine-deliver` owns:

- Final render.
- QC and licence/credit verification.
- Delivery review and G7.

The planning skill may identify invalidation requirements for these stages but must not impersonate their completion.

## 10. Reporting without invented success

### 10.1 Completed planning stage

Report:

- Stage and patch identity.
- Actual applied revision from observed evidence.
- Changed shot IDs and keys.
- Remaining open findings.
- Source and clock versions.
- Expected next gate or stage.

Do not present an unverified revision number, synthetic exit envelope, or assumed command result.

### 10.2 Blocked stage

Report:

- The exact blocking condition.
- Its severity.
- Affected project and shot or unit IDs.
- Supporting source references.
- Attempts already used.
- Why it cannot continue automatically.
- Required user or upstream action.
- What remains valid.

Do not erase a blocking finding when summarizing progress.

### 10.3 G4 awaiting answer

Make clear that:

- The production plan is a proposal.
- No G4 approval has yet been recorded.
- Specific soft tiers or music limitations require the stated decision.
- Batch generation remains gated.
- Only the human answer can advance the gate.

### 10.4 Selective replan

Report:

- Approved source change.
- Gates/items reopened.
- Existing approvals retained.
- Regeneration or reimplementation scope.
- Current patch cycle and attempts.
- New approvals required.

Do not restart all work unnecessarily, and do not preserve an approval whose supporting hashes have changed.

## 11. Final planning checklist

Before reporting that planning is complete, verify all of the following against actual available evidence:

- [ ] G0–G3 prerequisites remain valid.
- [ ] Every stage's mandatory files were fully read in the current context.
- [ ] Every subagent received a complete brief with real source hashes.
- [ ] Every dispatch was guarded before and after.
- [ ] Every patch was saved verbatim under the correct stage and round.
- [ ] No stage exceeded three rejected attempts.
- [ ] All required inputs and dependency references were declared.
- [ ] No stage wrote keys outside its ownership.
- [ ] The independent bible and style audit was performed.
- [ ] Applied patches have observed kit result and disk-state evidence.
- [ ] All shot IDs and script-unit placements validate.
- [ ] The clock matches G0 `audio_mode`.
- [ ] Timing and root duration meet hard constraints.
- [ ] Music rights and beat evidence meet mode requirements.
- [ ] Every raster has a recorded budget and permitted tier.
- [ ] No `replan` tier was accepted as an approved soft tier.
- [ ] All FX use supported mechanisms or explicitly handled limitations.
- [ ] Canonical references, prompts, and estimates are included in the production plan.
- [ ] Approved-source changes received impact review and explicit authorization.
- [ ] No non-waivable rule was bypassed.
- [ ] The user's direct G4 answer was recorded verbatim.
- [ ] Pending downstream G5 and G6 approvals were not misrepresented as complete.

If any required condition remains unsatisfied, report the precise blocker instead of declaring planning complete.
