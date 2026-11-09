---
name: imagine
description: >-
  Use when the user invokes /imagine or asks to create, resume, inspect,
  modify, review, or deliver an Imagine motion-graphics project. This skill
  owns workspace setup, G0 configuration, routing to stage skills, approval
  gates, project status, dependency impact reports, dispatch isolation,
  waivers, journaling, failure recovery, and delivery coordination.
---

# Imagine — Workspace Controller and Stage Router

Imagine coordinates a gated, auditable production workflow. The main agent
owns project state, user approvals, protected-source writes, and routing.
Stage skills own specialized production work. No agent may substitute an
unobserved result or personal judgement for required evidence.

## 1. Authority and executable contract

Before operating, read these repository contracts in full:

- `docs/contracts/rules.yaml` — authoritative rule registry.
- `docs/contracts/cli-contract.md` — commands, parameters, JSON envelope,
  exit codes, and error semantics.
- `docs/contracts/source-formats.md` — project files, source references,
  ownership, patches, gates, and state formats.
- `docs/contracts/claude-code-platform.md` (read only when the active host-id is `claude-code`) —
  plugin runtime and dispatch constraints.
- `docs/contracts/harness-portability.md`: cross-host contract.
- `docs/contracts/hosts/<host-id>.md`: the active host's mapping, with
  `claude-code` on Claude Code.

When a detail is unspecified, consult its contract. Never invent flags,
schema fields, exceptions, or successful outcomes.

Invoke the kit using:

`node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`

On a host other than Claude Code, the `CLAUDE_SKILL_DIR` placeholder above is not substituted: use `node "<R>/packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`, where `<R>` is the absolute directory two levels above this SKILL.md, confirmed by `node "<R>/host/plugin-root.mjs" --skill-dir "<R>/skills/imagine"` printing `"ok":true` (protocol `imagine-root/1`, `docs/contracts/harness-portability.md` section 4). Never resolve the kit from the working directory, `PATH`, or a global install.

Hereafter, `imagine-kit` means this invocation, not an assumed globally
installed executable. Use only documented arguments.

Phase 1 provides twelve core commands plus the `purge` command:

| Command | Responsibility |
|---|---|
| `imagine-kit new` | Initialize a project |
| `imagine-kit status` | Inspect project state and source hashes |
| `imagine-kit gate` | Record explicit human decisions |
| `imagine-kit validate story` | Validate STORY.md |
| `imagine-kit patch apply` | Apply ownership-scoped planning patches |
| `imagine-kit img` | Generate image assets |
| `imagine-kit tts` | Generate narration assets |
| `imagine-kit stage-shot` | Prepare isolated shot implementation |
| `imagine-kit promote-shot` | Promote an accepted shot |
| `imagine-kit export-hf` | Export to HyperFrames |
| `imagine-kit render` | Render project output |
| `imagine-kit qc` | Validate delivery evidence |
| `imagine-kit purge` | Reclaim storage on user request (any stage; needs a final MP4 in `post/`) |

There are no additional kit commands beyond those listed above in Phase 1. Specifically, there is
no brief, stage start/finish, guard, lock, document-write,
waiver-management, review-confirmation, capabilities, readtime, beats,
loudness, check, safe-band, resolution-budget, audio-page,
asset-management, alternate validator, patch-validation, diff-keys, or
fork command.

Their applicable responsibilities live in agent instructions, the
supported commands, or direct pinned HyperFrames operations.

For every kit invocation:

1. Preserve stdout, stderr, process exit status, and the last stdout line.
2. Parse the last stdout line as the JSON envelope defined by the CLI
   contract.
3. Interpret success, errors, and advice using that contract.
4. Do not assume exit zero alone proves the requested artifact is valid.
5. Quote the actual envelope fields relied on when reporting an outcome.
6. Obtain authoritative scoped hashes from `data.sources` in the
   `imagine-kit status --ref` envelope.
7. Treat missing, malformed, contradictory, or unreadable evidence as
   failure, never as permission to invent a replacement.

## 2. Ownership and routing

The main agent owns:

- Project creation, activation, resume, and G0 lock.
- Human questions, gate answers, and recorded approvals.
- Mandatory file loading and stage routing.
- Protected-source backups and dispatch guards.
- Planning-patch staging and authorized application.
- Dependency impact reports and semantic review resolution.
- Project state, journal, waivers, and REVIEW.md.
- Capability failures, recovery, and final delivery coordination.

| Owner | Stages |
|---|---|
| `imagine` | Setup, resume, routing, gates, impact, waivers, audit coordination |
| `imagine-canon` | Script/G1, bible and voice casting/G2, style/G3 |
| `imagine-plan` | Storyboard, timing, previz, FX plan, production plan/G4 |
| `imagine-generate` | Canonical refs/G5r, audio/G5a, batch images/G5b |
| `imagine-edit` | FX implementation, shot promotion, timeline, rough mix/G6 |
| `imagine-deliver` | Final render, QC, credits, final approval/G7 |

Do not perform another skill's specialized work merely because that
skill is unavailable. Load its instructions and mandatory references
before routing, or report BLOCKED.

Planning subagents `storyboard-artist`, `previz-designer`, and
`fx-designer` have no Write tool. They return patches as final messages.
The main agent stores each patch verbatim and invokes the authorized
patch-application operation.

Review subagents provide findings, not gate approvals or waivers.

### Storage purge on request

When the user asks to purge, free disk space, or clean up a project's media, handle it directly here at any time and stage. Do not route to a stage skill or require any gate, stage, freshness, or G7 state. Target the active project or another project the user names with `--project <dir>`, including older projects under `.imagine/`.

Run `imagine-kit purge [--project <dir>]` as a dry-run. The project must have a final MP4 in its project-root `post/`. <!-- rule:HARD-PURGE-FINAL-EXISTS --> If the command exits 1 with `HARD-PURGE-FINAL-EXISTS`, tell the user there is no final MP4 in `post/` and stop. Otherwise, show `data.kept`, `data.total_files`, `data.total_bytes` in human-readable form, and the top `data.by_dir` rows, including any `ADV-PURGE-G7-PENDING` advice. Explain plainly that applying purge permanently deletes every PNG, MP4, and JPG outside `post/`; afterward `img`, `render`, and `export-hf` refuse for that project, while `status`, `gate`, `qc`, audio, text, and `post/` remain. Ask explicitly for approval and, only on a clear yes, run `imagine-kit purge --apply --quote "<verbatim user answer>"`. <!-- rule:PROC-PURGE-QUOTE --> Report the apply envelope result. For several projects, run one dry-run and get one explicit answer per project; never reuse a quote across projects.

## 3. Mandatory files

### 3.1 Roots and common files

Use:

- `R` = plugin root, `${CLAUDE_SKILL_DIR}/../..`. On other hosts, R is resolved as described in docs/contracts/harness-portability.md section 4.
- `P` = active project root, `.imagine/<project-id>`.
- `U` = `P/script/narration.md` for `audio_mode: narrated`.
- `U` = `P/script/copy.md` for `music-led` or `text-led`.

Resolve the project through `.imagine/ACTIVE`, verify its existence,
and check its `project.yaml`. Never silently select another project.

Every stage reads these common plugin files in full:

- `R/skills/imagine/SKILL.md`
- `R/skills/imagine/references/operations.md`
- `R/docs/contracts/rules.yaml`
- `R/docs/contracts/cli-contract.md`
- `R/docs/contracts/source-formats.md`
- `R/docs/contracts/claude-code-platform.md` (read only when the active host-id is `claude-code`)
- `R/docs/contracts/harness-portability.md`: cross-host contract.
- `R/docs/contracts/hosts/<host-id>.md`: the active host's mapping, with
  `claude-code` on Claude Code.

For an existing workspace, also read:

- `P/project.yaml`
- `P/journal.md`

Stage-specific files below are additive. The owner skill's own
mandatory list further extends them; it never replaces them.

A trailing `?` means read the file in full if it exists, but do not
require it before the stage that creates it. A required file without
`?` must exist and be readable.

### 3.2 Stage manifest

| Stage | Additional plugin files | Additional project files |
|---|---|---|
| Bootstrap/new | None | None before creation; read `P/project.yaml`, `P/journal.md` immediately afterward |
| Resume/status | None | `P/script/raw.md?`, `U?`, `P/bible.yaml?`, `P/style.md?`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| G0 lock/reconsideration | None | `P/style.md?`, `P/review/REVIEW.md?` |
| Script ingestion/G1 | `R/skills/imagine-canon/SKILL.md` | `P/script/raw.md`, `U?`, `P/bible.yaml?`, `P/style.md?` |
| Bible/casting/G2 | `R/skills/imagine-canon/SKILL.md` | `U`, `P/bible.yaml?`, `P/style.md?`, `P/assets/manifest.yaml?` |
| Style/G3 | `R/skills/imagine-canon/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md?` |
| Storyboard planning/audit | `R/skills/imagine-plan/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| Previz planning/audit | `R/skills/imagine-plan/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| FX planning/audit | `R/skills/imagine-plan/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| Production plan/G4 | `R/skills/imagine-plan/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| Canonical refs/G5r | `R/skills/imagine-generate/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| Audio/G5a | `R/skills/imagine-generate/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| Batch images/G5b | `R/skills/imagine-generate/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| FX implementation/shot audit | `R/skills/imagine-edit/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?`, `P/review/check.json?` |
| Timeline/rough mix/G6 | `R/skills/imagine-edit/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/assets/CREDITS.md?`, `P/review/REVIEW.md?`, `P/review/check.json?` |
| Render/QC/G7 | `R/skills/imagine-deliver/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/assets/CREDITS.md`, `P/review/REVIEW.md`, `P/review/check.json?`, `P/review/qc.json?` |
| Upstream impact/review | Relevant owner skill | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| Waiver/review audit | Relevant owner skill | `P/bible.yaml`, `P/style.md`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md` |
| Gate recording/journal | Relevant owner skill | Corresponding gate-stage files and approval evidence |

Every audit and review, including storyboard, previz, FX, shot,
continuity, G5r/G5b preparation, and delivery audits, must read
`P/bible.yaml` and `P/style.md` in full. Missing canon blocks the audit.

Read any additionally referenced source, patch, manifest entry, or
approved asset before relying on its contents.

Before every stage, and again after resume or context compaction, read
every resolved mandatory file in full. <!-- rule:PROC-BRIEF-START -->

Reading mandatory files proves context delivery, not comprehension;
independent audits and validators must still check understanding.
<!-- rule:PROC-BRIEF-LIMIT -->

A stage starts only after its mandatory files were read in the current
context; planning patches must echo actual source hashes, which the
main agent independently checks rather than treating as tool-verified.
<!-- rule:HARD-BRIEF-CURRENT -->

Once the user opts into an on-demand procedure, add its reference to
the stage's mandatory list, including
`R/skills/imagine/references/voice-cloning.md` for cloning-enabled
casting. <!-- rule:PROC-OPT-IN-MANDATORY -->

Missing or unreadable mandatory inputs produce BLOCKED. Changed
references invalidate outstanding dispatch context; re-read and
re-plan before using its result.

## 4. G0 and audio-mode lock

For a new project:

1. Collect creative intent and proposed G0 settings.
2. Show the user the complete configuration.
3. Ask for explicit G0 approval.
4. Execute `imagine-kit new` with documented parameters.
5. Read and verify the created workspace and command envelope.
6. Record G0 using `imagine-kit gate` and `--quote` containing the
   user's exact answer to the G0 question.
7. Append creation and approval events to the journal.
8. Route to `imagine-canon` only after G0 is verified.

G0 must lock format, platform, audio_mode, language, target duration,
and explicit silence choice. <!-- rule:GATE-G0 -->

One project has one format: landscape 1920x1080 or portrait 1080x1920,
both at 30 fps; a second format requires a separate project.
<!-- rule:PROC-FORMAT-ONE-PER-PROJECT -->

Only the user may change project-level audio_mode; this reopens G1,
changes the timing clock, and invalidates dependent planning.
<!-- rule:PROC-AUDIO-MODE-LOCKED -->

English is the baseline language; a different language requires an
explicit user choice. <!-- rule:PROC-EN-BASELINE -->

| Mode | Script | Clock | Required audio behavior |
|---|---|---|---|
| narrated | `L##` in `script/narration.md` | Scratch, then final VO duration | Casting, TTS, listening, captions |
| music-led | `T##` in `script/copy.md` | Licensed music beat grid | Music/SFX listening, on-beat cuts |
| text-led | `T##` in `script/copy.md` | Per-unit read time | Text placement, audio or intentional silence |

For text-led units calculate seconds as
`max(1.2, 0.5 + 0.3 * word_count)`, unless the user approves a
per-unit override. Every `T##` appears exactly once and remains
visible for at least its required reading time.

Music-led `on_beat` cuts must align to the authorized beat grid
within one frame.

Casting and TTS are N/A outside narrated mode. Silent text-led
output requires G0 `silence: intentional` and an appropriate digital
silence stream for platform compatibility.

## 5. Gate routing

Execute in dependency order:

G0 setup -> G1 script -> G2 bible -> G3 style -> storyboard,
previz, FX plan -> G4 production plan -> G5r canonical refs ->
G5a audio and G5b images -> implementation/edit -> G6 picture lock
-> final render/QC -> G7 acceptance.

G5a and G5b may proceed independently after their own prerequisites.
Neither bypasses G4. Batch images cannot bypass approved G5r refs.

| Gate | Human decision | Scope |
|---|---|---|
| G0 | Format, platform, mode, language, duration, silence | Project |
| G1 | Locked narration/copy units | Per unit |
| G2 | Bible, auditioned voices if narrated, lexicon | Per entity |
| G3 | Visual and motion style | Per anchor |
| G4 | STORY.md, assets/prompts, refs, resolution tiers, estimate, music licence | Project |
| G5r | Canonical reference versions after continuity review | Per ref |
| G5a | Heard VO lines or music/SFX; N/A if silent | Per line/cue |
| G5b | Contact-sheet images and accepted soft tiers | Per asset |
| G6 | Studio preview and full-mix draft MP4 | Project, with shot notes |
| G7 | Final MP4 and QC evidence | Project |

G4 must explicitly approve the production plan, prompts, reference
list, per-shot tiers, estimate, and music source/licence before
downstream production. <!-- rule:GATE-G4 -->

A gate quote must be the user's explicit answer to that particular
gate's question, never an earlier request, change instruction,
unrelated agreement, or inferred consent. <!-- rule:GATE-QUOTE -->

Record approvals per item and reopen only affected item approvals
after an invalidation. <!-- rule:GATE-PER-ITEM -->

Record and verify each required gate with the user's verbatim quote
before downstream work. <!-- rule:HARD-GATES-RECORDED -->

A requested change is not gate approval. Apply the impact-and-edit
procedure, then ask the changed gate question again.

## 6. Source ownership and dispatch

`project.yaml` records project and item state; `journal.md` is the
append-only history; `assets/manifest.yaml` tracks versions.

Append a journal entry for every state transition, with timestamp,
actor, affected items, evidence, and reason. <!-- rule:PROC-JOURNAL -->

Only the main agent or authorized patch application may write hashed
project sources; planning subagents have no Write tool and source-hash
changes must remain detectable by status. <!-- rule:PROC-LOCK-HASHED-WRITES -->

Before dispatch, record SHA-256 hashes and restorable backups for
protected files; re-hash immediately after dispatch.
<!-- rule:PROC-DISPATCH-GUARD -->

On an unauthorized protected-source mismatch, restore the backups,
reject the dispatch result, preserve evidence, and report failure.
<!-- rule:HARD-GUARD -->

Only `patch apply` writes STORY.md planning keys, and only authorized
kit edit operations write edit keys; never use HyperFrames storyboard
editing to modify STORY.md. <!-- rule:HARD-STORY-WRITERS -->

Treat `style.md#output` as generated from G0 and read-only.
<!-- rule:HARD-STYLE-OUTPUT-READONLY -->

Derive `stale` from status-recorded hash mismatches, never manual
status edits; the main agent records `needs_review` from a semantic
impact report. <!-- rule:HARD-STATUS-DERIVED -->

Planning subagents return patches as final messages. Store them
verbatim in `stage/`, verify actual input hashes, base revision and
key ownership, then use the kit's authorized patch operation.

Never claim a patch, promotion, or render succeeded without its
observed result. See `references/operations.md`.

## 7. Impact and review

Before editing any approved document, disclose the exact affected
items and reopened gates, then obtain explicit user approval for the
edit, including after G6. <!-- rule:PROC-IMPACT-CONFIRM -->

Resolve `needs_review` with an impact report and the user's explicit
confirmation that prior meaning remains valid or authorization to edit.
<!-- rule:PROC-NEEDS-REVIEW-REPORT -->

If a stage discovers a missing upstream bible fact, block the work,
resolve the bible first, then propagate its dependency cascade.
<!-- rule:PROC-UPSTREAM-BLOCKED -->

The complete dependency DAG, impact-report procedure, state
distinctions, and recovery behavior are in `references/operations.md`.

## 8. Waivers

Waivers live in `review/REVIEW.md`, after P0/P1/P2 findings and before
the delivery note. Read `references/waivers.md` in full before
proposing, activating, checking, or revoking any waiver.

The non-waivable list there is exhaustive: gate quotes, patch/key
isolation, base revision, guard integrity, asset approvals and
hashes including canonical refs, audio licensing, placeholders,
a playable MP4 at the G0 spec, the raster quality floor (no
`replan` tier may ship; a `soft` tier needs explicit G4 and G5b
acceptance), and the story validators the kit runs before G4, such
as HARD-STORY-UNIT-ONCE. A rule the kit itself decides is never
waivable: `imagine-kit gate G4 approve` refuses a story error
whatever REVIEW.md says, so a waiver for one would leave G4 blocked
and only misstate the evidence. When such a rule blocks, say that
it has to be corrected and route the fix through its normal path
(a planning patch for STORY.md). Ask the user the decision the fix
needs, as a direct question (for a unit anchored twice: which shot
keeps it), and apply nothing until they answer. Every other HARD
failure is waivable. When one of those blocks, never call it unwaivable: ask
the user to choose between correcting it through its normal path
and a waiver scoped to that one rule and its explicit items, and
record nothing until they answer.
<!-- rule:HARD-NON-WAIVABLE -->

Required entry keys, using the source-format contract's item refs:

- status: proposed
- rule: HARD-<RULE-ID>
- items: shot:s03.previz, asset:bg-harbor.v2
- item_hashes: shot:s03.previz=<64-hex>, asset:bg-harbor.v2=<64-hex>
- reason: <user reason>
- consequence: <delivery consequence>
- manual_check: <user's alternative check>
- asked: "<exact question>"
- quote: "<verbatim user answer>"
- granted: <YYYY-MM-DD>
- history: proposed <YYYY-MM-DD>

Only populated, active, hash-valid entries can affect a HARD result.
The full lifecycle, non-waivable exclusions, and exact `## Waivers`
section format are defined in `references/waivers.md`.

## 9. Capability limits and HARD validation

If a required capability has no documented allowed fallback, stop
BLOCKED, record the reason in project.yaml and journal.md, and inform
the user. <!-- rule:CAP-BLOCKED-STOP -->

HARD validators have no agent-invented fallback; only a valid
user-granted waiver can bypass a waivable HARD failure, while
non-waivable failures require correction. <!-- rule:CAP-HARD-NO-FALLBACK -->

Unavailable advisory checks must be reported as `not_run`,
never passed. <!-- rule:CAP-ADV-NOT-RUN -->

Never fabricate output, successful validation, available commands,
asset quality, listening evidence, or environmental capabilities.
<!-- rule:CAP-NO-FABRICATION -->

Agent judgement never substitutes for an observed HARD validator
result. <!-- rule:HARD-NO-SELF-JUDGEMENT -->

No automatic upscaler, guaranteed TTS speed adjustment, punctuation
pacing control, project fork, automatic safe-band check, automatic
brief, guard, waiver service, or unsupported kit validator exists.

Direct HyperFrames calls must pin `npx hyperframes@0.8.223`, with
`HYPERFRAMES_NO_TELEMETRY=1` in each main-agent command. See
`references/operations.md` for D10 strict-check policy.

## 10. Reviews, delivery, and recovery

Record P0/P1/P2 findings, accepted advice with reasons, soft tiers,
and waivers in `review/REVIEW.md` using the HyperFrames review
convention. <!-- rule:PROC-REVIEW-MD -->

Use findings of the form:
`t=4.2s · where · problem -> exact change · what stays`.

At G6, require Studio preview and draft MP4 full-mix review by
the user. For portrait, manually check the 9:16 safe band and record
the result in REVIEW.md.

At G7, require an observed playable MP4 matching G0 dimensions and
frame rate, valid QC, licences, credits, current approvals, and all
active waiver disclosures.

On resume, read the entire resume manifest, query status, re-check
waivers, inspect staging, and rebuild the smallest valid dependency
worklist. Never assume a prior attempt succeeded.

Preserve approved unaffected items, old asset versions, staging
evidence, and append-only journal history.

A retry cap includes the attempt that just failed. When exhausted,
stop BLOCKED and report the failures; deadlines never override caps.

The project finishes only after explicit G7 acceptance and valid
non-waivable delivery evidence.
