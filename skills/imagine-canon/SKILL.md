---
name: imagine-canon
description: >-
  Use when Imagine enters stage 2 script ingestion and G1 locking,
  stage 3 bible interviews, voice casting, auditions, pronunciation
  and G2 approval, or stage 4 style derivation and G3 approval.
  Also use when an approved script unit, bible entity, voice choice,
  pronunciation entry, or style anchor must be reviewed or changed.
  This skill owns canonical creative sources and their per-item
  approvals, not downstream planning, asset generation, editing,
  or delivery.
---

# Imagine Canon — Script, Bible, Voice and Style

Imagine Canon turns the user's creative intent into three approved
sources: script units, factual and character canon, and artistic style.
Its outputs become dependencies for planning, generation and editing.

The main agent owns all user interaction, source writes, validation,
gate decisions, journal records and recovery. Never interpret a
proposal, draft, audition or prior change request as an approval.

## 1. Authority and invocation

Read the following repository contracts in full before operating:

- `docs/contracts/rules.yaml` — rule registry.
- `docs/contracts/cli-contract.md` — kit commands and envelopes.
- `docs/contracts/source-formats.md` — canonical file schemas,
  source hashes, dependencies and gate scope.
- `docs/contracts/claude-code-platform.md` (read only when the active host-id is `claude-code`) — plugin and agent facts.
- `docs/contracts/harness-portability.md`: cross-host contract.
- `docs/contracts/hosts/<host-id>.md`: the active host's mapping, with
  `claude-code` on Claude Code.

The controller skill `skills/imagine/SKILL.md` remains authoritative
for project selection, G0, common mandatory files, routing, guards,
impact reports, waivers and journal ownership.

Invoke the kit using:

`node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`

On a host other than Claude Code, the `CLAUDE_SKILL_DIR` placeholder above is not substituted: use `node "<R>/packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`, where `<R>` is the absolute directory two levels above this SKILL.md, confirmed by `node "<R>/host/plugin-root.mjs" --skill-dir "<R>/skills/imagine-canon"` printing `"ok":true` (protocol `imagine-root/1`, `docs/contracts/harness-portability.md` section 4). Never resolve the kit from the working directory, `PATH`, or a global install.

Hereafter, `imagine-kit` means exactly that invocation, not a
globally installed executable. Use only documented flags.

Phase 1 provides exactly twelve commands:

| Command | Purpose |
|---|---|
| `new` | Initialize a project |
| `status` | Read state and source hashes |
| `gate` | Record user decisions |
| `validate story` | Validate STORY.md |
| `patch apply` | Apply planning patches |
| `img` | Generate raster assets |
| `tts` | Generate voice audio |
| `stage-shot` | Prepare a shadow edit project |
| `promote-shot` | Promote an accepted shot |
| `export-hf` | Export to HyperFrames |
| `render` | Produce video |
| `qc` | Verify rendered video |

There is no additional Phase 1 kit operation for brief delivery,
stage start/finish, guard, lock, document writing, waiver management,
review confirmation, capabilities, readtime, beats, loudness, check,
safe-band, resolution budgeting, audio pages, asset management,
alternate validation, patch validation, diff-keys or forking.

The main agent performs their remaining duties through documented
instructions and supported operations. Never invent a replacement
kit command.

Every kit command emits a JSON envelope on the last non-empty
stdout line. Preserve stdout, stderr and process exit status;
parse the envelope and inspect:

- `ok`, `code`, `command`, `project`, `contract`
- `data`, including only fields returned by that command
- `errors[]`, `advice[]`, `not_run[]`, `waived[]`
- `journal_id`, when present

An `errors[]` entry blocks success; `not_run[]` never means pass.
Phase 1 `waived[]` is always empty because waivers live in
`review/REVIEW.md`.

Report actual relevant envelope values before claiming an operation
succeeded. Never fabricate a command result, user decision, model
capability, source hash or artifact.

Exit codes: 0 success; 1 HARD error; 2 usage; 3 BLOCKED; 4 stale
inputs or conflict; 5 project lock; 6 unapproved refs; 7 user
decision required. Read the accompanying envelope instead of
guessing the cause from the exit code alone.

## 2. Ownership and stage boundaries

This skill owns:

1. Stage 2: ingest, segment, review and lock script units at G1.
2. Stage 3: interview for bible facts, cast narrated voices, audition
   candidates, maintain pronunciation and approve entities at G2.
3. Stage 4: derive anchored visual and motion style, then approve
   each style anchor at G3.
4. Canon changes: disclose their downstream impact, request explicit
   authorization, update sources and reopen affected approvals.
5. Audit: check completeness, source integrity and accurate user
   decisions before handing off to the planning skill.

The main agent writes `script/narration.md` or `script/copy.md`,
`bible.yaml` and `style.md`, except G0-generated material owned by
the controller.

Only the main agent or `imagine-kit patch apply` may update hashed
sources. Planning subagents cannot Write: they return patches in
their final messages; the main agent stores those patches verbatim
and invokes the authorized application command.

Do not directly edit `STORY.md` as a canon shortcut. The planning
skill owns storyboard, previz and FX planning keys.

Do not generate production images, approve canonical reference
images, accept final VO, implement scenes or claim delivery here.
These responsibilities belong to downstream skills.

A missing upstream fact is a blocking question, not permission to
invent canon or silently design around it.

## 3. Mandatory files

The main agent reads the entire resolved file list before starting
each stage, again after resume, and again after context compaction.

Define:

- `R` = plugin root, `${CLAUDE_SKILL_DIR}/../..`. On other hosts, R is resolved as described in docs/contracts/harness-portability.md section 4.
- `P` = project root resolved through `.imagine/ACTIVE`.
- `U` = `P/script/narration.md` for narrated mode.
- `U` = `P/script/copy.md` for music-led or text-led mode.

The controller's common mandatory-file manifest is additive and
must also be fulfilled. It includes its operational references.
This table does not replace or abbreviate that manifest.

Common files read in full for every canon stage:

- `R/skills/imagine/SKILL.md`
- `R/skills/imagine-canon/SKILL.md`
- `R/docs/contracts/rules.yaml`
- `R/docs/contracts/cli-contract.md`
- `R/docs/contracts/source-formats.md`
- `R/docs/contracts/claude-code-platform.md` (read only when the active host-id is `claude-code`)
- `R/docs/contracts/harness-portability.md`: cross-host contract.
- `R/docs/contracts/hosts/<host-id>.md`: the active host's mapping, with
  `claude-code` on Claude Code.
- `P/project.yaml`
- `P/journal.md`

Stage-specific mandatory files:

| Stage | Additional plugin files | Project files |
|---|---|---|
| 2 / G1 ingestion | `R/skills/imagine-canon/references/story-and-style.md`, `R/skills/imagine-canon/references/approvals-and-recovery.md` | `P/script/raw.md`, `U?`, `P/bible.yaml?`, `P/style.md?`, `P/review/REVIEW.md?` |
| 3 / G2 interview and casting | `R/skills/imagine-canon/references/voices-and-audio.md`, `R/skills/imagine-canon/references/elevenlabs-voices.md`, `R/skills/imagine-canon/references/approvals-and-recovery.md` | `U`, `P/script/raw.md`, `P/bible.yaml?`, `P/style.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| 4 / G3 style | `R/skills/imagine-canon/references/story-and-style.md`, `R/skills/imagine-canon/references/approvals-and-recovery.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md?`, `P/review/REVIEW.md?` |
| Canon impact/change | All four canon references | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| Canon audit/review | All four canon references | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| G1/G2/G3 decision recording | Applicable stage references plus approvals reference | Applicable stage sources, `P/project.yaml`, `P/journal.md`, `P/review/REVIEW.md?` |

A trailing `?` means read in full if the file exists; it need not
exist before the stage responsible for creating it. Never assume
that an optional missing file contains valid data.

For audit and review, `P/bible.yaml` and `P/style.md` are always
listed and must both be readable before the audit can pass.
Never declare an audit successful by omitting either source.

Additional mandatory inputs are the real audition WAVs, referenced
recordings, voice files, affected asset records, and specific
upstream documents used to make a decision.

For every on-demand procedure the user explicitly enables,
add its reference to the stage's mandatory list; for voice cloning,
read `R/skills/imagine/references/voice-cloning.md` in full during
casting and again after resume or compaction. <!-- rule:PROC-OPT-IN-MANDATORY -->

Read `imagine-kit status` after resolving the active project.
Use its actual `data.gates`, `data.items`, `data.sources`,
`data.decisions`, `data.unresolved` and `data.review_hints`
where available; do not infer approval from file presence.

A stage with a missing mandatory file, stale upstream approval,
unresolved source reference or unreadable evidence is BLOCKED.
Report the exact missing dependency and supported recovery.

## 4. Execution order and gate authority

The required sequence is:

G0 approved by controller
-> stage 2 script -> G1
-> stage 3 bible and casting -> G2
-> stage 4 style -> G3
-> handoff to imagine-plan.

Do not bypass G1 or G2 just because an existing draft appears
plausible, complete or technically usable.

### 4.1 G1 — script units

Normalize the script into the file selected by G0 `audio_mode`,
retain stable unit IDs, show every unit for review, and lock each
unit separately after the user's explicit approval. <!-- rule:GATE-G1 -->

Use `L##` for narrated dialogue or narration and `T##` for
music-led and text-led on-screen copy.

Do not combine several distinct units into one approval unless
the user's gate answer explicitly names the units being approved.

### 4.2 G2 — bible and voice canon

Interview for missing entity facts; record characters, locations,
world, narrator when applicable, pronunciation and their
dependencies, and approve each applicable bible entity after
audition-based voice selection in narrated mode. <!-- rule:GATE-G2 -->

A narrated character or narrator with dialogue needs a valid
voice selection and audition evidence before its G2 approval.

For music-led and text-led projects, record voice casting and TTS
as N/A in the project journal; do not silently skip or fabricate
a voice decision. <!-- rule:PROC-MODE-NA-RECORDED -->

### 4.3 G3 — visual style

Derive `style.md` from approved script and bible canon, present
each anchored section for human review, and record approval per
anchor rather than treating the entire draft as preapproved.
<!-- rule:GATE-G3 -->

`style.md` is the artistic source for downstream tools. Advisory
defaults fill unspecified choices but cannot override approved
style or HARD constraints.

Treat `style.md#output` as generated from G0 and read-only;
change G0 through the controller rather than editing output
requirements by hand. <!-- rule:HARD-STYLE-OUTPUT-READONLY -->

### 4.4 Gate decisions

A gate may be recorded only after the user explicitly answers
that gate's actual approval question; quote that answer verbatim,
not an earlier request, correction, instruction or inferred
agreement. <!-- rule:GATE-QUOTE -->

Record decisions per eligible item; when a dependency changes,
reopen only the affected items while preserving unrelated valid
approvals. <!-- rule:GATE-PER-ITEM -->

Use the documented command:

`imagine-kit gate <G1|G2|G3> approve --scope <ids> --quote "<exact user answer>"`

For a rejection use `reject` in place of `approve`.

`--scope` must refer to actual gate items from the active project.
G1 uses unit IDs, G2 bible source paths and G3 style anchors as
defined by the source-format contract.

A change request is not itself a gate approval. After making an
authorized correction, ask the relevant gate question again.

## 5. Approved-source changes

Before editing an approved script unit, bible entry or style anchor,
show an impact report naming the exact changed sources, reopened
gates, affected items, stale downstream assets or shots, and
semantic review candidates; obtain an explicit yes before writing,
even if G6 was already approved. <!-- rule:PROC-IMPACT-CONFIRM -->

Use the impact and recovery reference for the full procedure.

Do not use the gate approval quote as authorization for a different
edit. The edit authorization and the new gate decision are separate
user answers.

For a source write:

1. Confirm the approved edit scope.
2. Preserve the previous source and current SHA-256 evidence.
3. Write a temporary complete replacement file.
4. Validate its syntax and source-format invariants.
5. Atomically replace the target.
6. Append the source change and its consequences to `journal.md`.
7. Inspect fresh `imagine-kit status` data.
8. Reopen or re-review only the affected items.
9. Ask the user for new decisions before downstream work.

Never mark a source approved by directly modifying item status in
`project.yaml`. The gate operation owns approval records.

## 6. Capability and evidence boundaries

English is the baseline narration language; another language
requires an explicit G0 choice and supported voice workflow.
<!-- rule:PROC-EN-BASELINE -->

Do not infer that a TTS engine can synthesize arbitrary languages,
clone any voice, control speed or emotion, or produce acceptable
prosody without evidence.

A failed capability with no documented fallback is BLOCKED.
Record the blocked reason in project state and journal; ask the
user to choose among supported alternatives.

No missing HARD validator can be replaced by agent judgement.
Unsupported advisory checks are `not_run`, not pass.

The main agent calls HyperFrames directly, when applicable, with
each executable pinned and telemetry disabled:

- `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict`
- `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 normalize-audio`
- `HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats`

These are downstream operations, not additional kit commands.
Only `contrast_aa_failure` within a verified shader-transition
window may be automatically demoted to advice; every other
HyperFrames check error or warning blocks.

Planning agents return patches, not files. Store each patch
verbatim in `stage/<stage>/r<n>.patch.yaml`, inspect real source
hashes from status, then use `imagine-kit patch apply`.
Do not invent patch inputs or claim an unobserved merge succeeded.

## 7. Handoff criteria

Hand off to imagine-plan only when:

- G0 remains approved and matches the active project.
- G1 is approved for all applicable script units.
- G2 is approved for all applicable bible entities.
- G3 is approved for all applicable style anchors.
- Narrated casting and pronunciation decisions have evidence.
- Non-narrated casting/TTS is explicitly recorded N/A.
- No required source is stale, blocked or awaiting review.
- The journal records material changes and gate decisions.
- The user has received a concise summary of approved canon
  and remaining downstream limitations.

Handoff is not production-plan approval. G4 remains owned by
imagine-plan.

On resume, inspect status and source hashes before choosing the
earliest required recovery stage. Preserve unaffected approved
units, entities, anchors and asset versions.

Never declare G1, G2 or G3 complete using unverified command
results, incomplete files or remembered approvals.
