# Imagine Canon — Script Ingestion and Style Derivation

This reference defines the stage 2 and stage 4 source contracts.
Read it in full with the stage's mandatory files, after resume,
and after context compaction.

## 1. Stage 2 — script intake

### 1.1 Preconditions

Require approved G0 and inspect its actual:

- `format`, dimensions and `fps`
- `audio_mode`
- narration `language` where applicable
- `duration_s`
- `platform`
- `silence`

Read the user's source text from `script/raw.md`.
Do not overwrite it merely to simplify downstream parsing.

If `script/raw.md` contains contradictory instructions,
unresolved alternatives, absent creative decisions or an
unexplained duration mismatch, ask the user rather than treating
an interpretation as approved canon.

### 1.2 Source format

The selected script file is:

| Audio mode | Canonical file | Unit prefix |
|---|---|---|
| narrated | `script/narration.md` | `L##` |
| music-led | `script/copy.md` | `T##` |
| text-led | `script/copy.md` | `T##` |

Each recognized unit occupies a single source line:

```text
L01 [narrator]: Tonight the sea was quiet.
L02 [mara]: The lighthouse is still burning.
- T01: Forty years.
- T02: One light.
```

Parsing follows `docs/contracts/source-formats.md`:

```text
^(?:[-*]\s+)?([LT]\d{2})(?:\s+\[([a-z0-9-]+)\])?:\s+(\S.*?)\s*$
```

Only units with the prefix appropriate to G0 count.
Other lines do not become approved units automatically.

The line IDs must be unique within the selected unit file.
Speaker IDs are lowercase letters, digits or hyphens, and must
resolve to appropriate bible speaker entries before final casting.

### 1.3 Segmentation

1. Preserve the intended meaning and original wording.
2. Divide narrated speech at meaningful delivery boundaries.
3. Make every intended visible copy statement an explicit `T##`.
4. Preserve stable identifiers when editing existing units.
5. Assign a new identifier for genuinely new material.
6. Identify referenced speakers and named entities.
7. Record unresolved facts as interview questions.
8. Check that the amount of content plausibly fits G0 duration.
9. Show the complete unit list and the proposed unit-by-unit lock.

Never silently remove script units to fit a duration target.
Propose cuts to the user and obtain authorization before edits.

Do not rewrite dialogue merely because a voice model might prefer
a different spelling or sentence length.

### 1.4 Mode semantics

For narrated mode, each approved `L##` is a source for later VO
and captions. Keep captions derived from the approved `L##`
wording, not from an improvised transcription. <!-- rule:PROC-CAPTIONS-FROM-UNITS -->

For non-narrated modes, each `T##` is the actual visible copy.
The same caption legibility and placement constraints apply to
these units.

In all modes, the visible caption or copy preserves the original
approved spelling; a pronunciation lexicon changes only
`tts_text`, never visible text. <!-- rule:PROC-CAPTION-ORIGINAL -->

For text-led mode, calculate each unit's minimum reading time:

`max(1.2, 0.5 + 0.3 x words)` seconds.

`words` is the word count of the actual displayed unit.
A user may explicitly approve a per-unit duration override.
Record calculated or approved values in
`script/readtime.yaml` using:

```yaml
units:
  T01:
    words: 2
    seconds: 1.2
```

The downstream previz must display every `T##` exactly once,
for at least its recorded reading time. Do not use an absent
readtime executable or silently reduce the minimum.

For music-led mode, the timing clock is the beat grid of the
user-supplied, licensed track. The planning skill uses
`HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats`
with its documented arguments. An `on_beat` cut must be within
one frame of the approved beat grid.

For narrated mode, scratch VO gives measured timing before
previz, and final VO replaces the clock after audio approval.

Do not invent a clock source or substitute rough estimated
speech timing for an available measured scratch recording.

### 1.5 G1 review and approval

Present each script unit with:

- ID and speaker, where applicable.
- Original text.
- Proposed purpose or context.
- Outstanding wording or meaning questions.
- Any identified duration concerns.

Ask the user which specific units they approve.
Do not interpret "change this line" as approval of the
changed line.

For each eligible approval or rejection:

`imagine-kit gate G1 approve --scope <unit-ids> --quote "<answer>"`

Use `reject` for explicit rejection.

Read the resulting envelope. Verify `data.gate`,
`data.decision` and `data.items`, along with `ok`,
`errors` and `code`.

The user-approved unit, not merely the file itself, is the
immutable dependency until an authorized change reopens it.

## 2. Stage 4 — style derivation

### 2.1 Preconditions

Require G1 and G2 approval.
Read the complete current script and bible before proposing
style; neither may be substituted by a previous summary.

Style answers how the approved world is depicted, not what
the world contains. The bible determines facts, identities,
places, personalities and continuity.

### 2.2 Anchored document

Use level-2 headings matching the source-format parser:

```markdown
## output
## medium
## palette
## proportions
## lighting
## camera
## typography
## motion
## texture
## prompt-tokens
## banned
## overrides
```

Anchors must be lowercase and conform to the parser's
`[a-z][a-z0-9-]*` rule.

The `output` body must match G0's generated content exactly.
For example, a project configured at G0 as portrait, narrated,
English, generic, 12—15 seconds and nonsilent has:

```markdown
## output
- format: portrait 1080x1920 @ 30 fps
- audio_mode: narrated
- language: en
- duration: 12-15 s
- platform: generic
- silence: no
```

Do not edit this body to alter aspect ratio, language,
duration, frame rate or audio mode. Refer such changes to the
controller's G0 impact procedure.

### 2.3 Derivation interview

Establish the following before locking the corresponding anchor:

| Anchor | Required decision |
|---|---|
| medium | Illustration, stylisation, realism and material language |
| palette | Main colors, contrast and color relationships |
| proportions | Character shape and visual consistency |
| lighting | Source, direction, mood and treatment |
| camera | Framing, perspective, lens language and movement limits |
| typography | Font roles, hierarchy, readable copy and captions |
| motion | Pacing, easing, transitions and choreography |
| texture | Grain, surface treatment and grading style |
| prompt-tokens | Reusable positive creative constraints |
| banned | Forbidden visual motifs, effects and deviations |
| overrides | Explicit exceptions to advisory defaults, with reasons |

When unspecified, propose a stylised or illustrated look before
photorealism, while allowing user direction and approved canon
to override that advisory starting point. <!-- rule:ADV-STYLISED-FIRST -->

Avoid defaulting to film grain, cinematic lenses, blur, glow,
flashy transitions or high-detail realism without creative
justification and source agreement.

An advisory choice may be changed with a concise reason.
A HARD constraint cannot be changed by a style preference.

### 2.4 Bible/style ownership separation

Store objective world and character truth in `bible.yaml`,
referencing style anchors such as `style.md#palette` without
duplicating lens, color grading or grain as bible facts.
<!-- rule:PROC-BIBLE-REFS-STYLE -->

Examples:

- Bible: Mara wears an oilskin coat and has short dark hair.
- Style: proportions are graphic, with simplified shapes.
- Bible: the lighthouse exterior is red and white.
- Style: lighting uses cool shadows with amber highlights.
- Bible: the setting is an isolated coastal town.
- Style: camera favors wide compositions and slow pushes.

A style choice never changes a factual entity attribute
without first updating the bible through the impact procedure.

### 2.5 Captions and layout

Style typography must establish:

- Readable minimum sizes for the chosen delivery format.
- Consistent placement and margins.
- Contrast against moving backgrounds.
- Line wrapping and avoidance of important imagery.
- Captions derived from approved script units.

For portrait 1080x1920 at the generic platform setting,
reserve the conservative vertical safe region from
y=168 through y=1330 for readable text and avoid the
platform action rail. Text must be at least 28 px.

This band is checked manually at G6 and its outcome recorded
in `review/REVIEW.md`; no automatic safe-band capability
exists in Phase 1.

Motion must preserve intended visibility and legibility.
Do not assume that animated typography is readable merely
because it is on screen for the calculated duration.

### 2.6 G3 review and approval

Show the complete style file, but ask explicit approval per
anchor. For each anchor provide:

- Its proposed constraints.
- The relevant bible or script justification.
- Any advisory choice or deliberate override.
- The consequences for downstream assets and motion.

Record scoped human decisions with:

`imagine-kit gate G3 approve --scope <anchors> --quote "<answer>"`

Verify the actual response. Never claim a whole-file G3 lock
when any applicable anchor is unapproved or stale.

## 3. Cross-stage dependency consequences

Use the controller's dependency graph for exact propagation.

| Changed source | Expected consequences |
|---|---|
| Script `L##` | Its VO stale; affected storyboards re-reviewed; affected timing and edits may reopen |
| Script `T##` | Affected copy placement and previz stale; text-led readtime recalculated |
| Narration language | Voice casting reconsidered; VO versions stale |
| Audio mode | G1 reopened and the planning clock rebuilt |
| Bible character appearance | Affected canonical refs, images and related approvals reopen |
| Bible voice | That speaker's VO becomes stale |
| Pronunciation entry | VO containing the term becomes stale |
| Bible world | Style, storyboards and imagery require semantic review |
| Style anchor | Dependent prompts, shots or assets need review or regeneration |

Preserve all unaffected approved units and anchors.

A changed source must not be disguised as a new asset-only
revision when it changes canon meaning.

## 4. Handoff audit

Before routing to planning:

1. Re-read `script/narration.md` or `script/copy.md` in full.
2. Re-read `bible.yaml` and `style.md` in full.
3. Compare actual unit IDs with project gate items.
4. Verify speaker and entity references.
5. Verify all required bible entities are approved.
6. Verify each style anchor has a valid G3 decision.
7. Verify output requirements still match G0.
8. Inspect status for stale or unresolved inputs.
9. Record unresolved issues as blockers, not assumptions.
10. Report the approved source versions and limitations.

The final handoff includes the approved script unit list,
bible entity list, style anchors, active mode, language,
duration and any remaining downstream dependencies.

No generated image, unmeasured audio duration or provisional
storyboard may be represented as an already approved outcome.
