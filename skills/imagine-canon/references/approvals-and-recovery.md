# Imagine Canon — Approval, Impact, Audit and Recovery

This reference governs G1/G2/G3 state transitions, protected
source changes, REVIEW.md entries, capability failures and
recovery.

It supplements the controller's operations and waiver policies;
it does not create new kit commands or transfer authority
from the user to an agent.

## 1. Approval state

The canonical approval sequence is:

G0 -> G1 -> G2 -> G3 -> G4 -> G5r / G5a / G5b -> G6 -> G7.

Canon owns only G1, G2 and G3.

Valid recorded item statuses include `pending`, `proposed`,
`approved` and `rejected`. Derived `stale` is not a status
that the main agent writes into an item record.

The kit computes staleness from recorded source hashes and
upstream dependencies. A changed watched source is only a
review hint until a semantic impact decision is made.

Gate state is derived from the actual set of eligible items.
An item approved yesterday may be stale today.

Before acting, inspect the current gate and item state through:

`imagine-kit status`

For scoped source hashes, use:

`imagine-kit status --ref <source-refs>`

Copy values from the actual `data.sources` object.
Do not manually invent, reconstruct or substitute input hashes.

## 2. Gate decision protocol

For every G1/G2/G3 decision:

1. Read all applicable mandatory files.
2. Inspect status and prerequisite gate approvals.
3. Identify the exact eligible source items.
4. Present the relevant source content to the user.
5. State unresolved concerns and consequences.
6. Ask an explicit, scoped approval question.
7. Wait for the user's answer to that question.
8. Record the actual answer verbatim.
9. Invoke the supported gate operation.
10. Verify the returned envelope and status.
11. Append the resulting decision to the journal.

Gate questions must be specific enough for the user to
know which script units, entities or anchors are affected.

Do not use a general "looks good" from an unrelated earlier
conversation as a gate quote.

Do not use the user's edit request as a substitute for
approval of the edited result.

A user rejection must remain a rejection until a corrected
proposal receives an explicit new decision.

If a subset is approved, keep the remaining items open.
Do not expand `--scope` beyond the user's actual answer.

## 3. Protected source edits

### 3.1 Hard stop before any approved edit

When an approved source is about to change, first determine:

- Which approved source items will change.
- Which gate items will reopen.
- Which assets or audio versions become stale.
- Which planning, editing or render results are affected.
- Which downstream items only need semantic review.
- Whether the proposed change alters G0 assumptions.

Show the impact report to the user before writing anything.

Use a report format such as:

```text
Proposed change
- Source: unit:L04
- Edit: replace the last sentence with the proposed wording
- Reopen: G1 item L04
- Stale: VO L04 and shots using L04
- Needs review: related character and world canon
- Preserved: unrelated script units and approved assets
- Question: Do you authorize this exact change?
```

The example is a format, not a statement that these items
exist in the active project.

Only after the user's explicit authorization may the main
agent make the specified change.

If the user changes the proposed edit rather than authorizing
it, revise the impact report and ask again.

This requirement applies equally to changes made after G4,
G5 approvals, G6 or delivery preparation.

### 3.2 Source-write discipline

For authorized writes:

1. Read the current file in full.
2. Preserve a restorable copy and SHA-256 evidence.
3. Confirm no conflicting upstream change occurred.
4. Prepare the complete new source in a temporary file.
5. Check parsing, ownership, references and required fields.
6. Atomically replace the target.
7. Append a factual journal entry.
8. Query fresh status and identify staleness.
9. Resolve `needs_review` with the user's decision.
10. Request new gate approval where needed.

Do not edit `project.yaml` approval records to manufacture
a desired state.

Do not overwrite approved generated asset versions.

Any unapproved edit discovered during review must be
rejected and investigated rather than legitimized by
a later generic gate question.

## 4. Dependency impact

### 4.1 Script changes

Changing an `L##` requires consideration of:

- The unit's G1 approval.
- VO derived from that line.
- Storyboards using that line.
- Previz timing for those shots.
- Dependent edits and renders.
- New or changed names and bible facts.

Changing a `T##` requires consideration of:

- Its G1 approval.
- Text placement and timing.
- Read-time calculation if text-led.
- Music synchronization if music-led.
- Downstream shots and renders.
- Any introduced entity or style implications.

A script change can make related bible and style decisions
require review without automatically rewriting those files.

### 4.2 Bible changes

Character appearance changes invalidate affected visual
references and images, not unrelated characters.

Voice changes invalidate the affected speaker's VO versions.
Pronunciation changes invalidate lines containing the term.

World-level changes may affect the entire style and visual
continuity model; inspect their actual dependency scope.

Do not claim a changed bible fact was corrected automatically
in generated imagery.

A new canonical reference version requires renewed G5r
approval; batch assets citing the superseded version become
stale.

### 4.3 Style changes

A changed palette, motion, camera, typography or texture
anchor affects outputs that actually depend on that anchor.

Recompile or review the relevant prompts and plans rather
than assuming global regeneration or no impact.

Changing output format through a style edit is forbidden;
route the request to the G0 controller procedure.

### 4.4 Mode changes

Only the user may authorize a G0 audio-mode change.

It reopens G1, changes the script unit type and clock
source, and invalidates downstream plan assumptions.

Do not automatically translate all old units into another
mode and mark them approved.

## 5. Audit and review

An audit always reads `bible.yaml` and `style.md` in full,
even when the immediate finding concerns only script,
voice, assets or timing.

Audit against actual item IDs and anchors; do not rely
solely on a prose summary of the project.

Use P0/P1/P2 findings with:

- Exact location.
- Problem and relevant canon ID or style anchor.
- Consequence if not corrected.
- Precise proposed change.
- Facts or constraints that must remain unchanged.

Use the REVIEW.md convention:

```text
P1 — t=4.2s — s02 / Mara
Problem: wardrobe conflicts with bible:characters.mara
Change: restore the approved coat and color
Keep: framing, timing and background unchanged
```

Do not report generic PASS/FAIL in place of actionable
findings when a semantic review is requested.

Reviewers may propose findings; only the main agent
organizes the required corrections and user decisions.

Any reviewer unable to inspect a required artifact must
say so, and the affected check remains incomplete.

## 6. Waiver boundaries

Canon may encounter downstream HARD warnings that a user
wishes to accept. A waiver never grants permission to
invent canon, fabricate approval or bypass a missing
capability.

The D10 shader-transition allowlist is automatic advice,
not a user-granted waiver.

For a waivable HARD failure, the main agent may prepare
a proposed REVIEW.md waiver entry and ask the user.
The user alone can activate or revoke it.

Never create a waiver proposal for any non-waivable rule:

- Gate quotes or required gate approval.
- Patch key ownership and isolation.
- Patch base revision or required source hashes.
- Dispatch guard integrity.
- Asset approval, version or hash integrity, including refs.
- Third-party audio licensing.
- Prohibited placeholders.
- Playable G0-compliant MP4 delivery.
- The raster quality floor: no `replan` tier may ship; a `soft` tier needs explicit G4 and G5b acceptance.
- The story validators the kit runs before G4, such as HARD-STORY-UNIT-ONCE. `imagine-kit gate G4 approve` refuses a story error whatever REVIEW.md says, so a waiver for one would leave G4 blocked and only misstate the evidence.
<!-- rule:HARD-NON-WAIVABLE -->

An agent cannot replace an observed HARD failure with
a claim that the creative result appears acceptable.

### 6.1 Waiver entry format

Store waivers in `review/REVIEW.md`, after findings and
advice and before the final delivery note:

```markdown
## Waivers

### W-001 HARD-<RULE-ID>
- status: proposed
- rule: HARD-<RULE-ID>
- items: shot:s03.previz, asset:bg-harbor.v2
- item_hashes: shot:s03.previz=<64-hex>, asset:bg-harbor.v2=<64-hex>
- reason: <the user's reason>
- consequence: <what the film loses>
- manual_check: <what the user checks instead>
- asked: "<the exact question asked>"
- quote: "<the user's verbatim answer>"
- granted: <YYYY-MM-DD>
- history: proposed <YYYY-MM-DD>
```

These are template values, not actual user decisions.

Use `proposed`, `active`, `revoked` or `invalid` for status.

An active waiver requires one exact HARD rule, explicit
source item IDs, real source hashes, the user's reason,
consequence, manual check and the verbatim response to
the waiver question.

Never use `all`, a wildcard or an unbounded scope.

Only `active` entries can be considered, and only while
all their scoped item hashes remain unchanged.

Before every gate, render or delivery, recheck active
waiver hashes through `imagine-kit status --ref` and
compare actual `data.sources` values.

If a value changed, mark the entry invalid and append
an invalidation history record; never delete its history.

A revocation also retains its history and the user's
revocation quote.

List all active waivers and exact scopes in the final
delivery note.

A user waiver cannot cure a non-waivable failure or
create a missing technical capability.

## 7. Dispatch integrity

Canon changes may trigger downstream planning or audits.

Before a subagent dispatch, the main agent records SHA-256
values and restorable copies of protected files.

At minimum, protect all existing relevant:

- `project.yaml`
- `script/narration.md` or `script/copy.md`
- `bible.yaml`
- `style.md`
- `STORY.md`
- `.history/STORY.r<N>.md`

Add relevant manifests and approved sources for the
specific dispatch.

After the subagent completes, re-hash the same files.

On a mismatch, restore the protected copies, reject
the output and report the unauthorized change.

Planning subagents have no Write tool. Their returned
patch is a proposal, not permission to write canon.

Every patch input must be a source hash actually obtained
from current status data for a source the subagent read.
Never invent hash values or insert placeholder inputs.

Use `imagine-kit patch apply` for authorized planning
patches only.

A CONFLICT or STALE_INPUTS result requires refreshing
mandatory files and redispatching the affected work,
not an invented automatic rebase.

The planning retry cap is three total attempts, including
the failed attempt just observed. Once exhausted, report
BLOCKED with evidence rather than trying a fourth round.

## 8. Capability and validation failures

Classify failures using actual envelopes and available
tool evidence.

| Failure | Response |
|---|---|
| Missing required source | BLOCKED; identify missing path |
| Malformed unit or bible record | Correct through authorized source edit |
| Invalid style anchor | Correct before G3 |
| Missing explicit user answer | NEEDS_USER; ask actual gate question |
| Stale upstream dependency | Stop and rebuild affected work |
| Missing protected-source hash | Stop before dispatch |
| Unauthorized source change | Restore and reject dispatch |
| Unsupported TTS capability | BLOCKED or documented fallback |
| Missing voice consent | Block cloned voice |
| Unavailable required audio | Do not record listening approval |
| Incomplete audit | Report not_run or blocking failure |
| Invalid waiver | Treat HARD requirement as failing |
| Exhausted retry budget | BLOCKED and report evidence |

A missing optional file may be created during its owning
stage, but a required upstream source cannot be silently
reconstructed from memory.

If a tool reports success but the required artifact cannot
be read, do not claim the stage is complete.

Preserve stderr, exit code, actual envelope fields and
relevant file evidence for debugging.

## 9. Recovery and resume

On resume or compaction:

1. Resolve `.imagine/ACTIVE`.
2. Re-read the controller and canon mandatory files.
3. Inspect `project.yaml` and the append-only journal.
4. Re-read script, bible and style in full as applicable.
5. Inspect `imagine-kit status` and source hashes.
6. Recheck any active waivers.
7. Reconcile interrupted source writes and staging.
8. Identify approved, stale, blocked and open items.
9. Build the smallest valid recovery worklist.
10. Reopen only affected user decisions.
11. Preserve unaffected approvals and immutable asset versions.
12. Record recovery actions and evidence in the journal.

Do not assume a past operation succeeded because an
earlier message said it would.

Do not infer that a partial file or tmp recording is
an approved final artifact.

## 10. Canon completion checklist

G1:

- All intended units have unique IDs.
- The selected unit file matches G0 audio mode.
- Original wording has been preserved or explicitly revised.
- Applicable units have current user approvals.

G2:

- Required entities and factual relationships exist.
- Entity IDs resolve without dotted-ID ambiguity.
- Narrated speakers have auditioned voice choices.
- Required cloning permissions are documented.
- Pronunciation entries are specific and traceable.
- Non-narrated voice requirements are recorded N/A.
- All applicable bible items have current approvals.

G3:

- Required style anchors exist and parse correctly.
- `output` matches G0-generated requirements.
- Style does not duplicate or contradict factual canon.
- Advisory decisions and overrides have reasons.
- Typography and motion have legibility requirements.
- All applicable style anchors have current approvals.

Final handoff:

- No applicable canonical item is stale or blocked.
- Required semantic reviews are resolved.
- All quoted approvals are actual user gate answers.
- Protected source files are intact.
- Journal entries reflect real transitions.
- The main agent reports real evidence and limitations.
- imagine-plan receives the complete approved canon.

If any required condition fails, keep the applicable
canon stage open and report the precise corrective action.
