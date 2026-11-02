# Dispatch, structured patches, and write isolation

This reference governs every `storyboard-artist`, `previz-designer`, and `fx-designer` dispatch.

## 1. Ownership and protected state

The main agent alone owns:

- Mandatory source reads and brief construction.
- SHA-256 snapshots and dispatch guard verification.
- Round number and dispatch identity.
- Patch staging files.
- Schema and semantic preflight.
- Invocation and inspection of the patch applier.
- Audit reporting.
- Routing of upstream changes to the owning skill.

Planning subagents have only `Read`, `Grep`, and `Glob`. They may inspect approved sources but may not use Write, Edit, Bash, external mutation routes, or another agent as a writing proxy.

Their final message must contain either a complete proposed patch or an explicit `blocked` response with the unresolved reason and a question for the main agent.

No subagent may claim a gate is approved, change an approved canon value, or claim a patch has been applied.

## 2. Dispatch evidence

### 2.1 Construct the dispatch

Include the following in every dispatch:

- Project identity, stage, author identity, and round.
- G0 format, frame rate, duration range, platform, language applicability, and `audio_mode`.
- Current `STORY.md` revision and source hash.
- Complete contents of every stage-mandatory project and plugin file.
- Source-path and full-file-hash inventory.
- Current script units and their immutable identifiers.
- G1–G3 approval state and relevant approved item versions.
- Current clock and resolution budget, where required.
- Exact stage-specific permitted keys.
- Supported mechanisms and their verified registry references.
- Explicit hard constraints, advisory defaults, and blocked unknowns.
- Required structured-patch output format.

Compute a `brief_hash` from a deterministic serialization of the dispatch's actual content and source inventory. Use a stable ordering and document the serialization choice so that later checks can reproduce it. The patch author must echo that exact `brief_hash` in the patch.

The main agent obtains authoritative scoped source hashes from `imagine-kit status --ref <source-refs>` and copies the actual values from `data.sources` into the dispatch. The patch author echoes those supplied values in `inputs`, labeling them as supplied rather than independently verified. The main agent rechecks the same scoped values before patch application.

A full-file hash is not interchangeable with a section hash. Use the actual scoped `data.sources` value for each declared source reference; never substitute a full-file digest or invent a hash because a referenced section was not read.

Do not dispatch a brief containing an unresolved required source fact as though it were approved canon.

### 2.2 Dispatch guard

Before each dispatch, record the SHA-256 of every protected file and preserve a restorable copy; immediately after the subagent completes, re-hash them, restore the recorded copy on any unauthorized difference, and reject the result. <!-- rule:PROC-DISPATCH-GUARD -->

Protect at least:

- `project.yaml`
- `STORY.md`
- `bible.yaml`
- `style.md`
- The active script file
- `assets/manifest.yaml` if present
- `review/REVIEW.md` if present
- Every additional source whose hash is used by the dispatch
- Every approved reference or audio file exposed to the dispatch

Include relevant files outside the project root where the dispatch can access them.

For each protected path, record its existence, file type, hash, and snapshot identity. An unauthorized creation or deletion is also a mismatch.

Use reliable byte-for-byte restoration, not a reconstruction from agent memory. Record the paths restored and inform the user if the restoration displaced a concurrent external edit.

The guard is a main-agent operation independent of the subagent's read-only tool policy. Do not consider the tool policy a replacement for the guard.

When a guard fails, do not inspect the proposed patch as though the dispatch were clean and do not merge it.

## 3. Patch staging and rounds

### 3.1 Naming and storage

Store each subagent's returned patch byte-for-byte in `stage/<stage>/r<n>.patch.yaml` without changing whitespace, ordering, metadata, hashes, or values. <!-- rule:PROC-PATCH-VERBATIM -->

Here, `<stage>` is the schema stage identifier `storyboard`, `previz`, or `fx`.

The literal filename pattern is `r<n>.patch.yaml`; replace `n` with the attempt number, starting at 1.

Do not let the subagent select its own round number or staging path.

Record the saved patch's SHA-256, stage, author, round, current source hashes, and preflight outcome in the audit trail.

Never silently repair a malformed subagent patch in place. Either reject it for a new round or require the owning subagent to return a corrected complete patch.

### 3.2 Retry ceiling

When a patch is rejected, return the concrete findings to the same planning subagent for the next round; allow at most three total attempts, including the attempt that just failed, and after the third rejection mark the stage blocked with a report. <!-- rule:PROC-PATCH-ROUNDS -->

The permitted round sequence is:

| Round | Result if rejected |
|---|---|
| 1 | Re-dispatch same subagent for round 2 |
| 2 | Re-dispatch same subagent for round 3 |
| 3 | `blocked` and report; no fourth dispatch |

Deadlines, user urgency, small apparent errors, and near-success do not extend the limit.

A blocked stage cannot be unblocked by pretending a new subagent identity or a cosmetic restaging of the same failed attempt starts a new cycle.

A genuinely new planning cycle requires a documented changed prerequisite, new source revision, or explicit user-directed restart. Record its relationship to the prior blocked cycle; do not disguise an exhausted retry.

## 4. Structured patch schema

A planning patch is YAML with the contract fields:

| Field | Meaning |
|---|---|
| `stage` | One of `storyboard`, `previz`, `fx` |
| `author` | Registered proposing subagent |
| `base_story_rev` | Exact `STORY.md` revision read by the author |
| `brief_hash` | Hash of the actual dispatch brief |
| `inputs` | Source-section and clock-version hashes actually read and referenced |
| `ops` | Structured operations scoped to the selected stage |

The patch format and key/value schema in `docs/contracts/source-formats.md` are authoritative.

The `inputs` map must enumerate the actual hash of every bible ID, style anchor, script unit, and clock source referenced by an operation; missing, invented, explanatory, or placeholder input values are invalid. <!-- rule:HARD-PATCH-INPUTS-DECLARED -->

Source inputs include, when applicable:

- `bible`: referenced entity paths.
- `style`: referenced style anchors.
- `units`: referenced `L##` or `T##` entries.
- `clock`: actual scratch-VO, beat-grid, or read-time versions and their source hashes.
- Other contract-defined dependencies required by a selected mechanism.

A patch must not list an input hash copied from an older brief without reading and verifying the corresponding source.

Citations in operation reasons are not a substitute for the actual `inputs` map.

### 4.1 Permitted stage keys

| Stage | Permitted planning keys |
|---|---|
| `storyboard` | `id`, `title`, `scene`, `duration_est`, `voiceover`, `characters`, `location`, `framing`, `composition`, `layers`, `assets`, `reads`, plus the shot narrative |
| `previz` | `duration`, `camera`, `parallax`, `motion`, `beats`, `transition_in`, `sound`, `poster`, `motion_asserts` |
| `fx` | `fx`, `grade`, `overlays`, `fx_notes` |

Each patch operation may modify only keys belonging to its registered stage; only storyboard operations may create, remove, reorder, or replace shot narrative. <!-- rule:HARD-PATCH-KEYS -->

Storyboard structural operations may include the documented `create_shot`, `remove_shot`, and `reorder` forms. Require the exact formats described by the source-format contract.

The `create_shot` operation must provide a valid new identifier and position. A `remove_shot` or `reorder` must not orphan script units or references.

An operation targeting a shot must reference an existing shot or one created within the same valid storyboard patch.

Do not interpret arbitrary prose in `ops` as an instruction to make extra changes.

### 4.2 Revision isolation

Require the patch's `base_story_rev` to equal the actual on-disk `STORY.md` revision at application time; a difference is `CONFLICT`, never permission to merge against a newer revision. <!-- rule:HARD-PATCH-BASE-REV -->

For initial storyboard creation, use the exact initial-revision representation defined by the source-format contract.

Never invent revision zero or a synthetic revision token if the contract defines a different initial state.

### 4.3 Operation and field validation

Before applying, manually check:

1. YAML is complete and parses unambiguously.
2. Every required top-level field is present.
3. Stage and author match the dispatch.
4. Round and saved patch identity match the audit record.
5. `brief_hash` matches the current dispatch.
6. `base_story_rev` matches the current story.
7. Every operation uses a permitted form.
8. Every written key belongs to the allowed stage.
9. Referenced shot and unit identifiers exist and are unambiguous.
10. Every referenced bible entity and style anchor exists.
11. Every referenced capability, registry name, shader, and effect is supported.
12. Every required `inputs` hash is present and sourced from real reads.
13. No protected narrative or canon would be rewritten by a non-owner.
14. Timing and resolution rules are satisfied.
15. All stage-specific invariants and active approvals remain valid.

Do not assume the main agent's manual preflight is an atomic schema validator or an authorization to write.

The command `patch apply` is the only available kit transaction for committing a planning patch.

## 5. Independent semantic audit

Before every semantic audit of a planning patch, independently re-read the complete current `bible.yaml` and `style.md` from disk rather than relying on the dispatch brief or the subagent's citations. <!-- rule:PROC-AUDIT-REREAD -->

Also re-read the current script units, story, clock, and referenced capabilities as needed.

Audit the proposed actual changes, not merely YAML validity.

### 5.1 Storyboard audit

Verify:

- Narrative preserves every locked script unit's meaning.
- Characters, relationships, props, environments, and visual attributes match bible IDs.
- Camera and visual choices respect style anchors.
- Each shot communicates an identifiable purpose.
- Shot order preserves causal and temporal continuity.
- Every script unit has exactly one anchor.
- Assets are declared with kind and required dimensions.
- Resolution demands are achievable or explicitly qualified.
- Total estimated duration meets G0.
- No approved upstream value was silently changed.

### 5.2 Previz audit

Verify:

- Motion follows the approved storyboard rather than replacing it.
- Camera transforms apply to appropriate wrappers or layers.
- Motion ranges and unit offsets are time-valid.
- Voiceover does not accidentally overlap.
- Text remains readable for its required hold.
- Music beats and cuts meet frame tolerance.
- Transitions are supported and intentional.
- Camera scale, crop, and parallax fit every layer's budget.
- Root duration meets G0.
- Text-bearing movement respects the delivery format's safe areas.

### 5.3 FX audit

Verify:

- Each effect has an identifiable purpose.
- `tool` is one of `shader`, `vfx-chain`, `media-treatment`, `registry`, `css-blend`, or `css-mask`.
- Each named mechanism (`shader`, `vfx-chain`, `media-treatment`, or `registry`) exists in the verified capability source; for `tool: registry`, `name` carries the registry mechanism identifier.
- Range and parameters match that mechanism's contract.
- Raster CSS `filter` is not used, including in `fallback`.
- WebGL-dependent effects have a valid fallback.
- Unsupported effects are explicitly identified as such.
- Dependencies on unapproved final assets are not presented as satisfied.
- Style's banned choices are respected unless an authorized style decision permits otherwise.

### 5.4 Audit findings

Return actionable findings with:

- Severity: `P0`, `P1`, or `P2`.
- Shot ID and affected operation.
- Cited bible ID, style anchor, script unit, or contract requirement.
- Exact proposed correction.
- Whether the issue blocks patch application.

Use `P0` for fundamental integrity or non-waivable violations, `P1` for material correctness failures, and `P2` for advisory improvements that do not violate a hard constraint.

Do not replace actionable findings with a generic PASS/FAIL response.

A patch with an unresolved blocking finding must not be applied.

## 6. Applying the patch

After clean guard verification, successful preflight, and an acceptable semantic audit:

1. Confirm the saved patch has not changed since preflight by checking its SHA-256.
2. Invoke `imagine-kit patch apply` using only the documented arguments.
3. Capture the actual exit status and final JSON envelope.
4. Require the kit to re-read the patch and current project state.
5. Inspect its result before asserting a revision was written.
6. Read the resulting `STORY.md` and validate its parsed state.
7. Verify the expected history and touched-item evidence through documented project state.
8. Record the actual applied revision and affected shots.

The patch applier must re-hash source dependencies and repeat applicable validation at commit time; a mismatch produces `STALE_INPUTS` without modifying the story. <!-- rule:HARD-PATCH-REVERIFY -->

Application is not authorized merely because an earlier human audit, cached hash, or preflight succeeded.

The kit's locking and atomic-write contract governs the actual transaction. A competing writer must not interleave changes between input re-verification and commit.

Never simulate a successful lock, atomic rename, history write, or revision increment in an agent response.

A crash or failed call requires inspecting actual disk state before retrying. Never infer that a partial log means an atomic commit happened.

## 7. Conflicts and stale sources

When `CONFLICT` occurs, re-read all stage-mandatory files, rebuild the dispatch against the new story revision, and re-dispatch the original planning subagent; automatic rebasing is not implemented. <!-- rule:PROC-CONFLICT-REDISPATCH -->

On `STALE_INPUTS`:

- Identify the changed source sections from the actual result.
- Re-read current sources.
- Determine whether approvals or upstream documents were invalidated.
- Rebuild the clock or budget if its inputs changed.
- Re-dispatch where a new proposal is required.
- Preserve the original rejected patch and failure evidence.

Do not change `base_story_rev`, substitute fresh-looking hashes, or rewrite a stale patch manually to force acceptance.

The three-round ceiling applies to rejected attempts within the current dispatch cycle. A changed upstream revision may require a documented new cycle, not an invisible fourth attempt.

## 8. Audit trail

For each dispatch and application, record at least:

- Project and stage.
- Dispatch identity, author, and round.
- Mandatory read completion and source hashes.
- Protected-file snapshot and verification result.
- `brief_hash`.
- Patch path and patch SHA-256.
- Preflight findings and semantic-audit findings.
- Actual kit invocation identity and result evidence.
- Actual applied revision or exact block reason.
- Changed shot IDs and dependency invalidations.
- Next permitted action.

Use the journal and source format defined in the installed project contract. Do not create a second authoritative journal or claim a kit journal facility beyond the documented contract.

A staged patch is evidence of a proposal, not evidence of an applied change.
