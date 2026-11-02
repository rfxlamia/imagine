# Clocks, resolution budgets, and production planning

This reference governs section 4.1 timing, storyboard and previz constraints, G4 production artifacts, and the capability limits planning must respect.

## 1. G0 audio mode controls planning

The `audio_mode` selected at G0 is authoritative.

| Mode | Script source | Unit type | Previz clock | Voice |
|---|---|---|---|---|
| `narrated` | `script/narration.md` | `L##` | Measured scratch-VO durations | Required |
| `music-led` | `script/copy.md` | `T##` | Licensed track's beat grid | N/A |
| `text-led` | `script/copy.md` | `T##` | Calculated or approved read-time plan | N/A |

Never convert one mode into another because a timing problem seems easier to solve in a different mode.

A change to `audio_mode` after G0 requires an explicit user decision, re-opens G1, and invalidates the dependent plan. Route the change through the owning upstream skill.

## 2. Narrated clock

### 2.1 Scratch voice

Before stage 6, produce and measure a scratch voice reading of the locked narration units.

The scratch clock provides:

- Each `L##` unit's measured spoken duration.
- Intended pauses.
- Required pronunciation assumptions.
- Unit order.
- Proposed lead and tail allowances.
- Timeline anchor and offsets.
- Measured total speech duration.
- Source and measurement evidence.

Keep scratch VO, temporary voice auditions, and any intermediate timing audio under `tmp/`; never register or present them as approved production assets. <!-- rule:PROC-SCRATCH-NOT-ASSET -->

Scratch voice is a timing instrument only.

Do not use a temporary audio file as a substitute for G5a approval, and do not label it as final audio.

### 2.2 Scratch creation constraints

The planned voice and lexicon must come from the approved G2 bible.

Use `imagine-kit tts` only within the command's documented capabilities.

If the documented TTS interface cannot produce scratch output without turning it into a production asset, do not invent a hidden scratch flag. Use a measured temporary human reading or another explicitly authorized scratch method, and keep it outside the approved asset pipeline.

Do not assume there is a TTS speed control.

Do not claim punctuation makes the TTS voice reliably slower. Measure the actual generated or recorded duration.

If a required reading cannot be measured, stage 6 is blocked.

### 2.3 From scratch to final voice

At previz, use measured scratch durations to establish an executable timing plan.

At G5a, the generation owner obtains and presents final VO audio for listening approval. Final audio has its own asset identity and measured duration.

If final VO differs materially from the scratch clock, calculate the affected timing and shot dependencies and re-open only the required planning items.

A final-VO increase exceeding 20% relative to its intended allowance is a material storyboard/previz issue; do not hide it by silently lengthening shots or shrinking pauses.

The final timeline must fit every approved voice line without unintended overlap and remain within the G0 range.

Captions in narrated mode derive from the locked `L##` lines.

## 3. Music-led clock

### 3.1 Music provenance

Plan music from a user-supplied source with a recorded licence, source, and credit, or explicitly plan no music where the G0 mode permits it; MusicGen is available only by deliberate user opt-in with a non-commercial restriction. <!-- rule:PROC-MUSIC-SOURCE -->

For `music-led`, the absence of acceptable music blocks planning because its clock requires music.

For narrated or text-led work, music can be absent if permitted by the G0 decision.

Do not imply commercial rights from a download, a tool capability, or a lack of visible copyright notice.

A track using MusicGen under the stated non-commercial licence cannot be represented as commercially cleared.

### 3.2 Beat extraction

For a licensed track, extract a beat grid through the pinned HyperFrames command:

```bash
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats
```

Use only documented input and output arguments.

Persist the actual output and record:

- Track identity and hash.
- Track version and licence reference.
- Sampled or selected edit range.
- Measured beat positions.
- Frame rate from G0.
- Beat-grid version.
- Manual corrections and their reasons, if any.
- Any unresolved detection uncertainty.

Do not make up BPM, beat timestamps, downbeats, or the command's output fields.

### 3.3 Beat-to-frame validation

Convert beat positions to the G0 frame grid using the project's documented timebase.

For every STORY cut explicitly marked `on_beat`, compute its distance from the assigned grid position.

Allow an error of at most one frame, positive or negative.

Do not enforce beat alignment on a cut that is intentionally unmarked, but do not remove `on_beat` merely to evade a failed alignment check.

If a grid is unreliable, request correction or a new acceptable source; do not invent beats.

A changed music version invalidates the derived beat grid and dependent cuts.

## 4. Text-led clock

### 4.1 Read-time calculation

For each locked `T##`, calculate seconds as:

`max(1.2, 0.5 + 0.3 x words)`

Use this formula as the default lower bound for the text-led on-screen duration. Count the actual visible words in the locked copy unit, and record the count and resulting duration.

Example calculations:

| Word count | Calculation | Minimum hold |
|---|---|---|
| 1 | max(1.2, 0.8) | 1.2 s |
| 3 | max(1.2, 1.4) | 1.4 s |
| 5 | max(1.2, 2.0) | 2.0 s |
| 10 | max(1.2, 3.5) | 3.5 s |

Do not replace this formula with an invented tool call.

An explicit user override must be recorded per unit and checked against applicable hard readability requirements before use. Do not infer consent to shorten a unit from an earlier broad pacing preference.

### 4.2 Holds and reading windows

As an advisory pacing target, provide a visible reading hold of at least 0.5 seconds plus 0.3 seconds per word for non-copy explanatory text where no locked unit duration already governs it. <!-- rule:ADV-READ-WINDOW -->

The locked `T##` minimum from section 4.1 remains the hard requirement for text-led script units.

For animated text, count only time when the required complete text is readable; do not count unreadable entrance, exit, obstruction, or off-screen intervals as full reading time.

Maintain unit IDs and uniquely anchored placements across cuts.

### 4.3 Silence

Text-led output may be intentionally silent only when the applicable G0 decision permits and records that choice.

When G0 explicitly records `silence: intentional`, treat an otherwise applicable `film_silent` warning according to its documented advisory treatment, with that reason. This exception does not suppress unrelated warnings.

At downstream QC, require the documented platform-compatible digital-silence audio-stream behavior rather than inventing a loudness result.

Do not promise that every player accepts a video lacking an audio stream.

## 5. Timing reconciliation

Before accepting a previz patch, build one coherent root timeline.

For each shot, identify:

- Shot `sNN`.
- Planned start and end.
- Unit anchor and any cross-cut continuation.
- Unit's source clock duration.
- Intended transition overlap or non-overlap.
- Sound and beat cues.
- Text hold interval.
- Camera and effects ranges.

Validate:

1. Every script unit has exactly one anchor.
2. Each anchored unit has enough valid timeline duration.
3. The same unit is not unintentionally played twice.
4. Required voice is not unintentionally simultaneous.
5. Text stays readable throughout its required hold.
6. Music-led beat-marked cuts meet frame tolerance.
7. All motion and transition intervals fall inside permitted ranges.
8. The root duration satisfies G0.
9. The clock's source hashes remain current.

Do not sum overlapping transitions as additional duration unless the actual composition time semantics require it.

If the timing cannot fit, propose explicit cuts or structural changes to the user or owning storyboard process. Do not silently omit script units or speed up final voice.

## 6. Resolution budget

### 6.1 Per-layer calculation

For every raster layer in every shot, compute:

```text
required_w = box_w × max_scale ÷ crop_w + 2 × parallax_travel_x
required_h = box_h × max_scale ÷ crop_h + 2 × parallax_travel_y

q = min(src_w / required_w, src_h / required_h)
```

Interpret:

- `box_w`, `box_h`: layer's delivery-pixel display box.
- `max_scale`: highest effective animation scale over the full shot, including inherited transforms.
- `crop_w`, `crop_h`: retained crop fractions on the corresponding axis, expressed as values in the interval (0, 1].
- `parallax_travel_x`, `parallax_travel_y`: maximum required extra horizontal and vertical travel, in delivery pixels.
- `src_w`, `src_h`: available raster source pixels.
- `q`: effective source-pixel coverage ratio.

Use the formula's required dimensions consistently. Do not treat crop fractions, zoom levels, or parallax units as interchangeable.

For composites, assess each independently animated raster rather than averaging good and poor layers.

Use the worst applicable `q` to characterize a shot's raster risk.

### 6.2 Measured generator budget

The planning reference maxima supplied by spike S2 are:

| Aspect | Maximum source dimensions |
|---|---|
| 16:9 | 1672 × 941 |
| 9:16 | 941 × 1672 |
| 3:2 | 1536 × 1024 |

Use those as measured Phase 1 constraints unless a newer verified project measurement explicitly supersedes them.

Do not treat a target delivery size as evidence that the raster generator supplies that many native pixels.

Before generation, budget against measured available output dimensions. After G5b, recalculate against each actual asset's measured dimensions.

Retain aspect and orientation information for every source.

### 6.3 Resolution tiers

| Tier | Effective ratio | Decision |
|---|---|---|
| `native` | `q >= 1.0` | Acceptable |
| `soft` | `0.75 <= q < 1.0` | Requires advance G4 acceptance and measured G5b item acceptance |
| `replan` | `q < 0.75` | Hard block |

A `soft` tier is allowed only if its planned limitation was accepted at G4 and the actual affected asset was accepted at G5b; `replan` is never an approval tier. <!-- rule:HARD-RASTER-TIER -->

Do not use a waiver to relabel a `replan` result as `soft` or `native`.

A pre-generation `soft` estimate is provisional. Real asset dimensions can make it worse, and G5b must reassess it.

The delivery note must retain accepted soft limitations. Describe a film as fully native only when every relevant raster meets `q >= 1.0`.

### 6.4 Required replan

When `q < 0.75`, present the user with the actual shot-level numbers and let the user choose among reducing scale/travel, reducing crop, splitting imagery into layered rasters, replacing suitable grounds with HTML/CSS/vector construction, or lowering delivery size. <!-- rule:PROC-REPLAN-USER-CHOICE -->

Do not implement a delivery-size change without explicit human authorization because it changes G0.

A smaller delivery size may require reopening upstream format specifications and dependent approvals.

When motion changes, re-run the resolution calculation for every affected layer.

If a new plan still produces `replan`, the shot remains blocked.

### 6.5 No assumed upscaling

Do not assume an upscaler exists in the supported stack, and never count Lanczos interpolation or HyperFrames render DPR as additional native raster pixels when calculating `q`. <!-- rule:PROC-NO-UPSCALER -->

HyperFrames resolution or browser device-pixel-ratio changes may improve rendering of vectors and HTML text but do not restore missing source-raster detail.

A future learned-upscaling extension is outside the verified Phase 1 capability unless separately licensed, tested, and accepted.

### 6.6 Layering and vertical composition

Use multiple raster layers when that improves parallax budget, reuse, continuity, or asset size.

Typical roles are:

- Background.
- Midground.
- Character or foreground subject cutout.
- Foreground occluder.
- HTML/CSS/vector text and simple graphic structures.

Each independently transformed raster gets its own budget.

For 9:16:

- Recompose scenes around a clear primary subject.
- Stack visual hierarchy vertically where useful.
- Do not merely squeeze a landscape source.
- Keep required text and subject action inside the intended safe composition.
- Plan a poster frame that functions in the target platform.
- Treat short-shot and large-title defaults as advisory unless locked by style.

No hard rule is excused simply because the video is vertical.

## 7. FX and mechanism constraints

FX planning is limited to verified supported tools and names.

Permitted mechanism classes are:

- `shader`
- `vfx-chain`
- `media-treatment`
- `registry` (with the mechanism identifier supplied separately as `name: <registry-name>`)
- `css-blend`
- `css-mask`

For each effect record:

- Stable ID.
- Tool and verified mechanism.
- Parameters.
- Start/end range.
- Required underlying asset.
- Whether the effect needs the final asset.
- Fallback mechanism.
- Style rationale when material.

Do not invent a capability-discovery command. Use actual bundled contracts and registry definitions.

No CSS raster `filter` is allowed as a disguised fallback for an unsupported mechanism.

An effect requiring unavailable features must explicitly state `unsupported` and give a real fallback where possible.

If no compliant alternative exists, block that requirement and report it.

## 8. Production-plan compilation

### 8.1 Shot asset records

For every shot, compile:

- Shot ID and creative purpose.
- Script-unit IDs and clock timing.
- Required character and environment IDs.
- Canonical-reference dependencies.
- Required image types and layers.
- Prompt content grounded in bible and style.
- Negative or banned constraints derived from style.
- Target aspect ratio and required source pixels.
- Expected per-layer `q` and shot tier.
- Regeneration and reuse strategy.
- Supported movement and FX.
- Dependencies on approved music or audio.

Never embed unsupported visual facts in a prompt simply to make it look complete.

Keep canonical reference creation separate from production batch generation.

### 8.2 Canonical-reference inventory

List:

- Character sheets and necessary poses.
- Environment reference keys.
- Style frame.
- Version and provenance plan.
- All shots and assets that will depend on each reference.
- Intended reference use, such as conditioning or cutout composition.

G4 approves the planned reference inventory, not the images that do not yet exist.

At G5r, the actual reference images must be generated, continuity-reviewed, and individually approved.

Batch images cannot be treated as eligible when they reference an unapproved reference version.

A new approved reference version may invalidate dependent generated assets and requires dependency-based reopening.

### 8.3 Estimate

Provide a defensible estimate of:

- Unique canonical references.
- Batch image generations.
- Expected regeneration reserve.
- Required voice lines or audio cues.
- Shot implementation count.
- Likely human review workload.
- Total expected time.
- Known quota or cost exposure.
- Unsupported or uncertain cost drivers.

Label estimates as estimates and state their assumptions.

Do not present unknown prices, speed, quotas, or model limits as measured values.

Do not omit material generation or review work to make the estimate attractive.

### 8.4 Music and SFX

Music requires provenance and rights metadata. Music-led work cannot use unlicensed music as a temporary approved clock.

SFX can use the supported HyperFrames media-use route, appropriately licensed Openverse CC0/CC-BY sources with attribution where required, or the bundled offline library when available.

Do not claim Openverse supplies a supported music-generation route.

Do not claim an optional catalogue is mandatory.

Record music and SFX dependencies for G5a and eventual delivery credits.

## 9. Planning exit conditions

Stage 6 is ready for FX only when the actual patch has been applied and its timing and resolution invariants hold.

Stage 8a is ready for G4 only when every effect is supported or explicitly marked with a valid nonblocking alternative, and no hard rule remains violated.

G4 is ready to be asked only when the full production plan has been assembled with real source evidence.

Anything requiring a changed G0–G3 source must go through impact analysis and upstream authorization before downstream completion.
