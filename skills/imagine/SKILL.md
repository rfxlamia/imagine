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

Before any project action or agent dispatch, including direct invocation and resume, resolve R and read `R/docs/contracts/hosts/<host-id>.md` for the active harness in full. Use its registered roles and dispatch mechanism.

Imagine coordinates an auditable production workflow. The main agent owns project state, consent, protected-source writes, and routing. Stage skills own specialized work. No agent may substitute an unobserved result or personal judgement for required evidence.

## 1. Authority and executable contract

Before operating, read these repository contracts in full:

- `docs/contracts/rules.yaml`: authoritative rule registry.
- `docs/contracts/cli-contract.md`: commands, parameters, JSON envelope, exit codes, errors.
- `docs/contracts/source-formats.md`: project files, source references, ownership, patches, gates, state.
- `docs/contracts/claude-code-platform.md` (read only when the active host-id is `claude-code`): plugin runtime and dispatch constraints.
- `docs/contracts/harness-portability.md`: cross-host contract.
- `docs/contracts/hosts/<host-id>.md`: the active host's mapping.

When a detail is unspecified, consult its contract. Never invent flags, schema fields, exceptions, or successful outcomes.

Invoke the kit using:

`node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`

On a host other than Claude Code, the `CLAUDE_SKILL_DIR` placeholder above is not substituted: use `node "<R>/packages/imagine-kit/bin/imagine-kit.mjs" <command> ...`, where `<R>` is the absolute directory two levels above this SKILL.md, confirmed by `node "<R>/host/plugin-root.mjs" --skill-dir "<R>/skills/imagine"` printing `"ok":true` (protocol `imagine-root/1`, `docs/contracts/harness-portability.md` section 4). Never resolve the kit from the working directory, `PATH`, or a global install.

Hereafter, `imagine-kit` means this invocation. Use only documented arguments.

Kit commands:

| Command | Responsibility |
|---|---|
| `imagine-kit new` | Initialize a project |
| `imagine-kit status` | Inspect project state, item states, and source hashes |
| `imagine-kit checkpoint <Q1\|Q2\|Q3> run\|review` | Run a Checkpoint's Checks, or submit a reviewer answer |
| `imagine-kit consent record --kind <material_change\|publication> --scope <item-or-platform> --quote "<user words>" [--file-hash <sha256>]` | Store a Consent_Record with the user's quote |
| `imagine-kit migrate [--apply]` | Convert legacy gate records; dry run unless `--apply` |
| `imagine-kit publish --platform <name> --file <path>` | Publish only with a matching `publication` Consent_Record |
| `imagine-kit gate` | **Deprecated.** Legacy approval recorder for unmigrated projects; not for new work |
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

There are no kit commands beyond those listed (no brief, stage start/finish, guard, lock, waiver, capabilities, loudness, check, safe-band, asset-management, patch-validation, diff-keys, or fork command). Those responsibilities live in agent instructions, the supported commands, or direct pinned HyperFrames operations.

For every kit invocation:

1. Preserve stdout, stderr, exit status, and the last stdout line, and parse that line as the JSON envelope in the CLI contract.
2. Interpret success, errors, and advice by that contract. Exit zero alone does not prove the artifact is valid. Quote the envelope fields you rely on.
3. Take authoritative scoped hashes from `data.sources` in the `imagine-kit status --ref` envelope.
4. Treat missing, malformed, contradictory, or unreadable evidence as failure, never as permission to invent a replacement.

## 1A. Autonomous flow

Imagine separates quality checks from consent. Three automated Checkpoints replace the per-stage approval gates: Q1 pre-production (script, bible, style, storyboard, timing, production plan), Q2 assets (references, images, voice-over, audio, continuity, provenance), Q3 film (scene lint, motion, visual review, mix, MP4 QC). A Checkpoint passes only from verified Evidence_Records, never from a user quote or your own judgement.

Run without stopping:

1. **Brief_Completion.** Fill every Creative_Brief parameter the user did not state (format, platform, audio_mode, language, duration, silence choice) and record each as defaulted in `project.yaml` and `journal.md`. A stated value always wins. A complete brief needs no second approval.
2. **Q1.** Produce script, bible, style, storyboard, timing and production plan, then run `imagine-kit checkpoint Q1 run`.
3. **Q2.** When Q1 is `passed`, produce assets and run `imagine-kit checkpoint Q2 run`.
4. **Q3.** When Q2 is `passed`, produce the film and run `imagine-kit checkpoint Q3 run --mp4 <final.mp4> [--mix <mix>]`.
5. **Production_Complete.** When Q3 is `passed`, the project is `ready`. Present the video and a quality report with every Checkpoint result and its Evidence_Record references. Report visual-review and audio-mix results apart from technical validation, and list checks no Evaluator could run as unevaluated. Do not publish.

Do not ask "may I continue?" between stages. A stage starts when the previous Checkpoint is `passed` in the envelope. Stage each shot as soon as its own dependencies are `passed`.

**Repair.** While a Check returns `failed`, withhold the next stage and repair. For an error class with a defined strategy, set the item to `repairing`, fix it inside the Creative_Brief, then re-run the failed Check and every Check of its dependents. Track attempts per item and error class against the Repair_Budget and choose a different strategy on each retry. If a scene cannot pass scene lint within budget, change build strategy before escalating. Journal raster-replan choices with the rejected alternatives. When an upstream edit invalidates passed items and stays inside the brief, repair them in place without asking, and journal which items were invalidated and re-validated. Pick the recovery for a rejected patch by error class and budget, with no fixed rejection count. <!-- rule:PROC-REPAIR-BY-CLASS -->

**Escalation.** When the Repair_Budget for an error class is exhausted, or a Check cannot run for lack of a capable Evaluator and no fallback exists, set the item to `needs_input` with the failing Evidence_Records and the options open to the user. Report unavailable checks as `not_run`, never `passed`.

**When to ask the user.** Ask only for:

- an item in `needs_input`;
- a Material_Change: a change to format, platform, audio_mode, language, duration or silence choice, or to approved script meaning, cast, or delivery size beyond the brief. Before applying it, record the answer with `imagine-kit consent record --kind material_change --scope <id> --quote "<verbatim answer>"`;
- Publication_Authorization, only when the user asks to publish: `imagine-kit consent record --kind publication --scope <platform> --quote "<verbatim answer>" --file-hash <sha256 of the final MP4>`, then `imagine-kit publish --platform <name> --file <path>`. A changed file needs a new authorization.

Never infer, paraphrase, or write a quote yourself; an empty or synthetic quote is rejected. Quotes exist only for Consent_Records, not for quality checks. <!-- rule:PROC-CONSENT-QUOTE -->

**Older projects.** Run `imagine-kit migrate` (dry run), show the result including unmapped records, then `imagine-kit migrate --apply`. Items whose input hashes still match are not re-checked. Use deprecated `imagine-kit gate` only for a project that has not migrated.

## 2. Ownership and routing

The main agent owns:

- Project creation, activation, resume, and G0 lock.
- Human questions and recorded consent.
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

Do not perform another skill's work because it is unavailable. Load its instructions and mandatory references before routing, or report BLOCKED.

Planning subagents `storyboard-artist`, `previz-designer`, and `fx-designer` only read, search, and return patches; the host mapping defines enforcement. The main agent stores each patch verbatim and invokes the authorized patch-application operation. Review subagents provide findings, not approvals or waivers.

### Storage purge on request

When the user asks to purge or free disk space, handle it here at any stage, without gates. Read `R/skills/imagine/references/purge.md` in full and follow it. A purge needs a final MP4 in `post/` <!-- rule:HARD-PURGE-FINAL-EXISTS --> and `--apply` only after the user's verbatim yes. <!-- rule:PROC-PURGE-QUOTE -->

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

Read `R/skills/imagine/references/stage-manifest.md` before routing to a stage; the owner skill's own list extends it.


Every audit and review, including storyboard, previz, FX, shot,
continuity, G5r/G5b preparation, and delivery audits, must have
`P/bible.yaml` and `P/style.md` read in the current context. Missing canon
blocks the audit. When an audit starts, re-read only the dependencies whose
hashes changed since the previous audit; read canon in full on the first
audit in a context. <!-- rule:PROC-AUDIT-REREAD --> <!-- rule:PROC-AUDIT-CHANGED-ONLY -->

Read any additionally referenced source, patch, manifest entry, or
approved asset before relying on its contents.

Before every stage, and after resume or context compaction, read by version and hash instead of re-reading everything: take the authoritative scoped hashes from `data.sources` in `imagine-kit status --ref`, compare them with the hashes you read in this context, and read in full only files you have not read or whose hash changed. Read a file in full whenever the task depends on all of it; otherwise read targeted sections and record the hash. <!-- rule:PROC-BRIEF-START --> <!-- rule:PROC-TARGETED-READ -->

Reading mandatory files proves context delivery, not comprehension.
<!-- rule:PROC-BRIEF-LIMIT -->

A stage starts only after its mandatory files were read, by hash, in the
current context; planning patches must echo actual source hashes, which the
main agent independently checks rather than treating as tool-verified.
<!-- rule:HARD-BRIEF-CURRENT -->

Once the user opts into an on-demand procedure, add its reference to the stage's mandatory list, including `R/skills/imagine/references/voice-cloning.md` for cloning. <!-- rule:PROC-OPT-IN-MANDATORY -->

Missing or unreadable mandatory inputs produce BLOCKED. Changed references invalidate outstanding dispatch context; re-read and re-plan.

## 4. G0 and audio-mode lock

For a new project:

1. Collect creative intent and the G0 settings the user stated.
2. Run Brief_Completion: fill unstated settings, never override a stated one, and mark each as defaulted. Ask only when a setting is ambiguous or the user's statements conflict.
3. Execute `imagine-kit new` with documented parameters, then read and verify the workspace and envelope.
4. Append creation and the defaulted values to the journal, and show the user the configuration in your report without waiting for a reply.
5. Route to `imagine-canon` and continue per section 1A.

Changing a G0 setting afterward is a Material_Change.

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

Before downstream work, require verified Evidence_Records and dependency
readiness for the items it uses (for older, unmigrated projects: the
recorded legacy gate with the user's verbatim quote).
<!-- rule:HARD-GATES-RECORDED -->

A requested change is not consent. Apply the impact-and-edit procedure and
ask only when it is a Material_Change.

**Autonomous projects.** Section 1A replaces the per-stage human gates (G1 to G7) with the Q1/Q2/Q3 Checkpoints. Do not ask the user to approve them or run `imagine-kit gate`: a passed Checkpoint records the gates it covers, so no `gate` call is needed. Details: `references/checkpoints.md`. The gate table is the dependency order and the reference for older projects.

## 6. Source ownership and dispatch

`project.yaml` records project and item state; `journal.md` is the
append-only history; `assets/manifest.yaml` tracks versions.

Append a journal entry for every state transition, with timestamp,
actor, affected items, evidence, and reason. <!-- rule:PROC-JOURNAL -->

Only the main agent or authorized patch application may write hashed
project sources; planning subagents are not authorized to write and source-hash
changes must remain detectable by status. <!-- rule:PROC-LOCK-HASHED-WRITES -->

When dispatching a Subagent, send the relevant references as a path plus
SHA-256 hash (from `data.sources` of `imagine-kit status --ref`), and embed
a file's full contents only when the Subagent's task needs the whole file.
The Subagent reads what it needs and echoes the hashes it used in its
patch; verify them yourself. <!-- rule:PROC-BRIEF-EMBED --> <!-- rule:PROC-DISPATCH-REFS-HASHED -->

Before dispatch, record SHA-256 hashes and restorable backups for
protected files; after every dispatch, immediately re-hash and compare
with the recorded hashes. <!-- rule:PROC-DISPATCH-GUARD -->

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

Planning subagents return patches as final messages. Store them verbatim in `stage/`, verify input hashes, base revision and key ownership, then use the kit's patch operation. Never claim a patch, promotion, or render succeeded without its observed result. See `references/operations.md`.

## 7. Impact and review

Before editing any approved or passed document, compute and journal the exact affected items. When the edit stays inside the Creative_Brief, repair them in place without asking. When it is a Material_Change, disclose the affected items, obtain the user's explicit approval, and record it with `imagine-kit consent record --kind material_change`, including after the film is `ready`. <!-- rule:PROC-IMPACT-CONFIRM --> <!-- rule:PROC-AUTO-REPAIR-IN-BRIEF -->

Resolve `needs_review` with an impact report and the user's explicit confirmation that prior meaning remains valid or authorization to edit.
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

The non-waivable list in `references/waivers.md` is exhaustive. It covers gate and consent quotes, patch/key isolation, base revision, guard integrity, asset approvals and hashes, audio licensing, placeholders, a playable MP4 at the G0 spec, the raster quality floor, and the story validators the kit runs. A rule the kit decides is never waivable: say it must be corrected, route the fix through its normal path, and apply nothing until the user answers the fix question. For every other HARD failure, ask the user to choose between correcting it and a waiver scoped to that rule and items, and record nothing until they answer. <!-- rule:HARD-NON-WAIVABLE -->

The required entry keys, lifecycle, and exact `## Waivers` format are in `references/waivers.md`. Only populated, active, hash-valid entries can affect a HARD result.

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

No automatic upscaler, TTS speed control, punctuation pacing, project fork, safe-band check, waiver service, or unsupported kit validator exists.

Direct HyperFrames calls must pin `npx hyperframes@0.8.223`, with
`HYPERFRAMES_NO_TELEMETRY=1` in each main-agent command. See
`references/operations.md` for D10 strict-check policy.

## 10. Reviews, delivery, and recovery

Record P0/P1/P2 findings, accepted advice with reasons, soft tiers, and waivers in `review/REVIEW.md` using the HyperFrames review convention. <!-- rule:PROC-REVIEW-MD -->
Use findings of the form: `t=4.2s · where · problem -> exact change · what stays`.

At G6, require Studio preview and draft MP4 full-mix review by the user. For portrait, manually check the 9:16 safe band and record it in REVIEW.md.

At Q3 (G7 in older projects), require an observed playable MP4 matching G0 dimensions and frame rate, valid QC, licences, credits, current approvals, and all active waiver disclosures.

On resume, read the entire resume manifest, query status, re-check waivers, inspect staging, and rebuild the smallest valid dependency worklist. Never assume a prior attempt succeeded. Preserve approved unaffected items, old asset versions, staging evidence, and append-only journal history.

A retry cap includes the attempt that just failed. When exhausted, stop BLOCKED and report the failures; deadlines never override caps. The project finishes when Q3 has passed and `delivery:film` is `ready`; older projects need explicit G7 acceptance.
