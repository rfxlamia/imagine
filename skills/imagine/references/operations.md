# Imagine — Operations, Dependencies, and Recovery

This reference is mandatory for the Imagine controller and supplements
the CLI and source-format contracts. It defines the practical workflow
without adding commands to the kit.

## 1. Dependency-driven execution

Always inspect current recorded source hashes and identify the
smallest valid work scope before dispatching a stage.

A stage cannot consume:

- An unapproved upstream item.
- A `stale`, `needs_review`, or `blocked` dependency.
- A canonical reference whose current version lacks G5r approval.
- A rejected, pending, or outdated image version.
- Unlicensed third-party audio.
- A patch whose base revision or inputs no longer match.
- A result from a dispatch that failed its protected-source guard.

The dependency graph below describes mandatory invalidation behavior.
Other dependencies defined by the source-format contract still apply.

### 1.1 G0 dependencies

When G0 format changes, reopen style `#output` and `#typography` for
review and invalidate all dependent shots, images, edits, and renders;
because each project has one format, perform new-format production in
a separate project. <!-- rule:DAG-G0-FORMAT -->

When narration language changes, reopen voice choices for review
and mark all narration VO versions stale before new timing or edit
work. <!-- rule:DAG-G0-LANGUAGE -->

When audio_mode changes with the user's permission, reopen G1
and rebuild the clock and the whole dependent plan.

When duration or platform requirements change, assess affected clocks,
layout, plan, G0-derived output, and downstream artifacts before edits.

### 1.2 Script dependencies

For changed narration line `L##`, reopen the storyboard review of
each shot voicing that line while preserving unrelated shots.
<!-- rule:DAG-SCRIPT-L-STORYBOARD -->

For changed `L##` or `T##`, present possible bible and style canon
impacts as `needs_review`, including affected entities and new
proper nouns, rather than automatically rewriting them.
<!-- rule:DAG-SCRIPT-CANON -->

Additional dependencies:

- Changed `L##` -> its VO becomes stale.
- New VO version -> recompute timing of shots containing the line.
- VO duration difference at most 0.1 second -> automatic retiming
  is allowed with a journal record.
- VO duration difference above 0.1 second -> reopen affected
  previz items, then invalidate dependent edits.
- Changed `T##` -> affected shots' previz becomes stale; recompute
  read time in text-led mode.
- Changed per-unit read-time override -> affected previz stale.
- Changed music version -> recompute beat grid; invalidate music-led
  previz and dependent edits.

Preserve unit identifiers where meanings remain stable. Do not
silently rewrite approved copy or narration to fix timing.

### 1.3 Bible dependencies

When a bible entity changes, invalidate images and canonical
references citing it, and mark storyboards featuring that entity
as needing review. <!-- rule:DAG-BIBLE-ENTITY -->

When `bible.world` changes, reopen style, all storyboards, and all
images for semantic review instead of assuming the change is harmless.
<!-- rule:DAG-BIBLE-WORLD -->

Finer-grained dependencies:

- Character voice change -> that speaker's VO stale.
- Pronunciation change -> VO containing the term stale.
- Character appearance change -> affected canonical refs stale.
- Canonical ref version change -> G5r of that ref reopens and
  every batch image using the former version becomes stale.

Missing character, location, period, or environment facts must
be reported upstream, not replaced by improvised substitutes.

### 1.4 Style dependencies

For an edited style anchor, track every artifact recording that
anchor as an input.

Typical relationships:

- `#medium`, `#palette`, `#prompt-tokens`, `#proportions`,
  `#lighting` -> canonical refs and generated images.
- `#camera`, `#motion` -> previz.
- `#texture`, `#banned` -> FX.
- `#typography`, `#motion`, `#palette` -> compositions.

A new style value does not authorize bypassing a stale canonical
reference. Generate or review its version through G5r.

`#output` is not an editable creative anchor; G0 owns it.

### 1.5 Shot dependencies

When `sNN.storyboard` changes, mark its previz stale, FX
`needs_review`, and edit stale; added assets become pending while
removed assets remain preserved as orphaned, unused versions.
<!-- rule:DAG-SHOT-STORYBOARD -->

When `sNN.previz` changes, mark its FX `needs_review`, its edit
stale, and recompute the affected resolution budget.
<!-- rule:DAG-SHOT-PREVIZ -->

Additional dependencies:

- Changed `sNN.fx` -> edit of that shot stale.
- Changed approved asset -> consuming compositions stale.
- Changed edit or mix -> render stale, G6/G7 reopen.
- Changed reference input -> dependent generation stale.
- Orphaned assets remain preserved but unused.

Do not invalidate unrelated shots merely because they share a stage.

### 1.6 Waiver and review dependencies

Any source-hash change within an active waiver's recorded scope
invalidates that waiver and restores the HARD blocking condition.
<!-- rule:DAG-WAIVER-SCOPE -->

Treat `stale` as a hash mismatch requiring redo and per-item
re-approval, and `needs_review` as a semantic question requiring
user confirmation or authorized editing. <!-- rule:DAG-STALE-VS-REVIEW -->

A semantic confirmation that the existing document remains accurate
does not need a revision bump. An actual edit creates a revision
and propagates the appropriate cascade.

## 2. Impact reports

Before changing approved sources, prepare:

1. Original approved item and revision.
2. Exact proposed edit or newly changed input.
3. Directly affected source references.
4. Transitive downstream references.
5. Gates or item approvals that reopen.
6. Items requiring semantic review.
7. Items remaining valid and untouched.
8. Regeneration, timing, quota, or licence consequences.
9. An explicit question authorizing this particular change.

For `needs_review`, include:

- Changed script lines or canon paths.
- Relevant bible entities mentioned in those lines.
- Newly introduced proper nouns absent from the bible.
- Applicable style anchors and shot IDs.
- Specific consequences if the prior interpretation is wrong.

The user may confirm "still true" for the disclosed scope, or
authorize the proposed edit. Do not interpret unrelated consent
as approval.

If the user confirms unchanged semantics, record the decision
without unnecessary revisions.

If the user authorizes editing, apply the owning stage's approved
write procedure and recompute dependent hashes.

If the user rejects the edit, preserve approved sources and
report the unresolved issue.

Upstream missing facts produce BLOCKED until corrected in the
appropriate authoritative document, followed by the normal cascade.

## 3. Planning dispatch and patch safety

Before dispatch, the main agent must read the owning stage's
complete Mandatory files list.

A planning dispatch contains:

- Stage request and item scope.
- Current approved constraints and gates.
- Relevant source contents, IDs, anchors, and hashes.
- Allowed STORY.md key ownership.
- Patch schema and current base revision.
- Explicit prohibition on canonical writes.
- Instruction to report missing upstream information as blocked.
- Instruction not to fabricate `inputs`, approvals, or tool output.

Planning subagents return patches through their final message.
The main agent preserves the original returned patch text.

Patch `inputs` identify hashes of sources actually read, one entry
per referenced ID, anchor, or unit. Never use placeholders, notes,
guessed digests, or stale revisions.

The main agent must:

1. Re-read mandatory inputs when required.
2. Confirm the dispatch guard passed.
3. Compare patch inputs against current source evidence.
4. Confirm base STORY revision.
5. Confirm key ownership and item scope.
6. Store the returned patch in `stage/`.
7. Use the authorized kit patch-application operation.
8. Parse its actual JSON envelope before claiming success.
9. Journal resulting revisions and item IDs.
10. Re-audit against bible.yaml and style.md.

Patch application, not agent prose, determines whether a patch
was accepted. A failed patch stays in staging for diagnosis.

Only stage-owned planning keys may change. Edit-stage convenience
is not a reason to rewrite approved planning keys.

## 4. Production clocks and G4

### 4.1 Narrated

Scratch VO is temporary timing evidence, never an approved final
VO asset. Final measured duration replaces scratch timing.

For each narration line, use actual duration. If final VO changes
timing beyond the allowed tolerance, reopen the affected previz
rather than stretching the shot without authorization.

### 4.2 Music-led

Run direct HyperFrames beat analysis on the authorized source:

`HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats`

Supply its documented arguments. Record the actual beat evidence
and source version. Never invent beat positions.

Require music source, licence, credit, and manifest provenance
before G4 approval.

### 4.3 Text-led

For each copy unit:

`readtime_seconds = max(1.2, 0.5 + 0.3 * word_count)`

Use a user-approved override if available. Record the resulting
duration in the appropriate project source format.

Every `T##` appears once and remains visible at least that long.

### 4.4 Production-plan completeness

Before G4, verify:

- Valid STORY.md with complete planned shot stages.
- Asset IDs and compiled image prompts.
- Canonical reference inventory and dependency list.
- Per-shot resolution budgets and native/soft/replan tiers.
- Clock source and timing evidence.
- Camera, motion, transitions, FX, and audio cues.
- Music/SFX source, licence, and credit.
- Estimated time, quota, and resource requirements.
- Explicit unsupported effects and remaining uncertainties.
- Planned manual checks.

Unsupported functionality must not be disguised as an available
automatic fallback.

## 5. Generation and approvals

Canonical references must be reviewed and approved before
dependent batch generation.

G5r review checks:

- Identity and visual consistency against bible.yaml.
- Required character pose coverage.
- Environment keys and shot-specific references.
- Style frames and current approved direction.
- Exact ref version and hash.

At G5b, review images as contact sheets and record accept,
reject, or redo decisions for each asset.

Resolution evidence includes:

- Required pixel dimensions.
- Measured width and height.
- Effective raster quality.
- Tier selection: native, soft, or replan.

A soft tier requires disclosure and user approval, not an invented
upscaler.

Preserve old and rejected asset versions. A new version reopens
only its affected dependencies.

For narrated output, store each VO line's original text,
synthesized text, speaker, seed, take, duration, and listening
state in the asset manifest.

A measured duration does not prove that an agent heard the audio.
Require the user's actual listening decision.

## 6. HyperFrames integration

Always pin direct HyperFrames calls to version `0.8.223`, with
`HYPERFRAMES_NO_TELEMETRY=1` in the main agent's command.

Approved direct operations:

`HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict`

`HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 normalize-audio`

`HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats`

Supply documented input arguments. Never replace them with
unsupported kit commands or unpinned versions.

Record actual normalization output before using it as an audio
source.

### 6.1 D10 strict-check policy

All strict-check errors and warnings block except this one
narrow automatic demotion:

- Identifier: `contrast_aa_failure`.
- Context: the failure occurs within a verified shader-transition
  window.
- Scope: only findings actually inside that window.
- Result: record as advice with evidence and explanation.

A contrast failure outside that window blocks.

Every other error or warning blocks, including warnings that seem
visually harmless.

This allowlist is automatic advice, not a waiver. Do not extend it
through personal judgement or create a waiver for it.

A command's successful execution does not imply that its findings
are non-blocking. Inspect the actual returned results.

Record finding ID, severity, source position, transition window,
evidence, and disposition.

### 6.2 Shot implementation

Use the supported export, staging, promotion, and rendering
operations.

A scene-builder works in an isolated shadow project, not the
canonical edit or protected STORY.md.

Promote only after:

- The shadow implementation completed with observed evidence.
- Protected-source guard passed.
- Relevant checks returned acceptable outcomes.
- Shot output corresponds to approved source versions.
- No unauthorized upstream edit was introduced.

An unpromoted shadow project is not a finished shot.

## 7. Review and delivery

Before G6, produce and review the interactive Studio result and
a draft MP4 containing the complete current mix.

Require human listening for:

- Music balance and ducking.
- VO intelligibility.
- SFX placement.
- Timing and sync.

Record the user's exact corrections or approval.

For portrait 9:16, manually review:

- Platform band at 168–1330 px.
- Essential text and subjects within the required region.
- No readable text under the right action rail.
- Text size at least 28 px.
- Motion and composition remain legible.

Document the manual outcome in `review/REVIEW.md`. Do not claim
a nonexistent automatic safe-band validator passed.

G7 requires:

- Existing, playable MP4.
- Resolution matching G0 exactly.
- Frame rate matching G0: 30 fps.
- Duration acceptable against the approved target.
- Required audio or digital-silence track.
- Actual audio and loudness evidence where applicable.
- Effective raster report and disclosed soft tiers.
- Approved current asset and reference versions.
- Complete third-party licences and credits.
- No placeholders.
- Valid active waivers, listed in delivery notes.
- QC and review artifacts matching this render version.

Run the supported QC operation and inspect its real envelope.
Missing hard evidence means delivery remains blocked.

## 8. Incident recovery

Classify failure before recovery:

| Incident | Response |
|---|---|
| Missing mandatory file | BLOCKED, identify path and stage |
| Missing upstream canon | BLOCKED, request authorized correction |
| Invalid patch/revision | Preserve staging, re-read, correct |
| Protected hash mismatch | Restore backup, reject output, journal incident |
| Stale source | Rebuild affected item and reopen its gate |
| Semantic change | Impact report, user confirms or authorizes edit |
| Invalid waiver hash | Set invalid and restore HARD failure |
| Missing capability | BLOCKED unless an exact documented fallback exists |
| HARD validator unavailable | Record HARD_NOT_RUN, fail closed |
| Strict-check finding | Correct; only the D10 narrow allowlist may demote |
| Incomplete render/QC | Preserve evidence, retry within cap |
| Retry cap exhausted | BLOCKED and report failure history |

Every failed attempt counts toward the owning stage's retry cap,
including the attempt that just failed.

Recovery must preserve:

- Approved unaffected items.
- Source and asset provenance.
- Old versions and rejected candidates.
- Journal and waiver history.
- Staged patches and shadow projects.
- Item-specific dependency records.

Partial adapter output belongs in `tmp/`, not an approved asset path.
Rejected assets remain traceable under `_rejected/`.

On resume:

1. Resolve and verify `.imagine/ACTIVE`.
2. Read complete mandatory resume references.
3. Inspect current status and evidence.
4. Re-check every active waiver's scoped hashes.
5. Identify pending, stale, needs_review, and blocked items.
6. Inspect patches and unpromoted shadow projects.
7. Build the smallest dependency-ordered worklist.
8. Route to the earliest stage needing valid resolution.

Do not reset the whole project to conceal a narrow failure.
Do not hand-edit stale flags or reuse gate quotes.
