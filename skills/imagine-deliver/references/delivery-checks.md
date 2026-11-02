# Delivery Checks — Final Render and QC

This reference supplies the technical verification details for Imagine stage 10. It does not grant approvals or authorize changes to locked sources.

## 1. Preflight requirements

The main agent must establish a coherent chain from the G0 contract through the current G6 approval to the exact edit being rendered.

Required conditions:

- G0 configuration is approved and unchanged.
- Script, bible, style, production plan, and asset approvals are current.
- Every script unit appears exactly once in STORY.md.
- Shot ids and scene headings are valid.
- Every required edit composition exists.
- The root motion manifest reflects promoted shot assertions.
- Audio clips have stable identifiers and approved sources.
- No required assets are rejected, missing, or superseded.
- No unresolved placeholders remain.
- G6 picture lock refers to the current edit and mix.
- Active waivers have been checked against current source hashes.
- The strict check is current for the exact edit to be rendered.

Do not use an old check result after a composition, media, assertion, or approved source has changed.

## 2. Strict HyperFrames check

Run the pinned strict check from the correct HyperFrames project context:

```bash
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict
```

Examine the actual exit status and full JSON.

Strict errors and warnings are blocking unless the exact D10 condition is proven.

### 2.1 D10 exception

The only automatically advisory finding is:

`contrast_aa_failure`

It qualifies only when the failing sample falls inside an active shader-transition interval.

Require evidence of:
- The finding's exact code.
- Frame or timestamp where it occurred.
- Transition identifier and active interval.
- The sample's containment inside that interval.

Retain the finding and supporting evidence as advice in REVIEW.md.

A contrast failure outside that interval blocks.

Any other warning or error, including motion or structural findings, blocks.

A mixed result containing both allowlisted advice and unrelated blockers is still blocking.

Do not describe an automatic demotion as a user-granted waiver.

## 3. Render contract

### 3.1 Preconditions

Before `imagine-kit render --final`:

- Refresh status and verify G6 remains approved.
- Revalidate scoped waivers.
- Verify every final media reference.
- Verify licence metadata for external audio.
- Inspect current strict-check evidence.
- Verify that no source changed after the last relevant approval.
- Confirm the render uses the approved G0 specification.

The kit handles its documented `--fps 30`, `--quality delivery`, and `--no-best-effort` behavior.

Do not add undocumented kit options to the invocation.

### 3.2 Output

The expected final path is:

`post/<slug>.v<N>.mp4`

The final version is immutable and must not overwrite another final version.

A successful render envelope provides a path and SHA-256 in `data`.

Capture:
- Actual project and command.
- Exit status.
- `ok` value.
- Output path and hash.
- Errors or advice.
- Journal id, if returned.

The render result does not by itself establish QC success.

A renderer timeout, dependency failure, absent output, or invalid JSON is a failed render, not a partial delivery.

### 3.3 Offline dependency

Offline rendering may require GSAP and related CDN resources.

Set `HYPERFRAMES_GSAP_BASE_URL` to a functioning local mirror when offline.

Verify the mirror is reachable and serves the needed resources.

Do not claim offline readiness merely because that environment variable is defined.

## 4. MP4 technical QC

Run:

`imagine-kit qc <actual-final-mp4-path>`

Read the real envelope and `review/qc.json`.

### 4.1 Required checks

| Property | Requirement |
|---|---|
| Container | Readable, playable MP4 |
| Video | Present |
| FPS | 30, QC tolerance 0.01 |
| Landscape | G0-approved 1920×1080 |
| Portrait | G0-approved 1080×1920 |
| Aspect | Exactly the G0-approved format |
| Duration | Inside G0 range, QC tolerance 0.05 seconds |
| Audio stream | Present, including intentional digital silence |
| Non-silent LUFS | -17.5 to -14.5 |
| Non-silent true peak | No greater than -1 dBTP |
| Intentional silence | Loudness skipped; audio stream still required |
| Narrated VO | Every required L## has a current approved take |
| Raster quality | No `replan`; soft only if accepted |
| Media | Every source exists, approved, hash matches |
| Credits | Required third-party licence/source/credit complete |
| Placeholders | None |

The kit computes the applicable measurements. Read actual values instead of copying expected values into the delivery report.

### 4.2 Audio

For narrated work:
- Map every locked L## to its approved WAV.
- Verify the clip is included in the root timeline.
- Verify placement and end time.
- Verify no unintended voice overlap.
- Verify no required L## is truncated or omitted.

For music-led work:
- Verify the approved and licensed music source exists.
- Retain the approved beat grid and on-beat cut decisions.
- Where cuts are marked `on_beat`, check the documented ±1-frame alignment requirement using observed timing evidence.

For text-led work:
- Preserve every T## unit's approved placement.
- The reading-time formula is:

`max(1.2, 0.5 + 0.3 x words)` seconds.

- Every T## must remain visible for at least its required time, including any approved override.

Non-narrated casting and TTS requirements are N/A, not silently omitted.

### 4.3 Loudness repair

Before G6, normalization may use:

```bash
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 normalize-audio
```

The actual final MP4 must still pass QC afterward.

A loudness miss does not authorize automatic gain or mix changes after G6.

If final QC identifies a loudness or peak problem after G6:
1. Preserve the failed report.
2. Explain the exact measured difference.
3. Show the locked-mix change impact.
4. Obtain the user's explicit approval to reopen affected work.
5. Normalize or repair through the owning edit workflow.
6. Re-render the draft as needed and repeat G6 listening and approval.
7. Run final rendering and QC again.

An arbitrary TTS speed control is unavailable. Do not promise to fix speech timing through punctuation alone.

## 5. Effective raster resolution

### 5.1 Formula

For every raster layer in each shot, use the layer's actual source dimensions and its planned display geometry:

```text
required_w = box_w × max_scale ÷ crop_w + 2 × parallax_travel_x
required_h = box_h × max_scale ÷ crop_h + 2 × parallax_travel_y

q = min(src_w / required_w, src_h / required_h)
```

Definitions:

- `box_w`, `box_h`: layer's destination bounds in output pixels.
- `max_scale`: maximum planned camera or layer enlargement.
- `crop_w`, `crop_h`: remaining crop fractions for each axis.
- `parallax_travel_x`, `parallax_travel_y`: maximum movement budget in pixels.
- `src_w`, `src_h`: actual raster dimensions.

Use actual measured geometry or approved `required_px` records. Do not invent values for unmeasured layers.

The Phase 1 kit QC computes effective `q` from recorded source dimensions and `required_px`; compare that output with the approved planning assumptions. It does not automatically reconstruct every camera transform from the rendered image.

### 5.2 Tiers

| Tier | Effective q | Delivery behavior |
|---|---|---|
| `native` | q >= 1.0 | Allowed |
| `soft` | 0.75 <= q < 1.0 | Allowed only with G4 planned and G5b measured acceptance for the asset |
| `replan` | q < 0.75 | HARD block |

Use unrounded `q` for classification. A value displayed as 0.75 after rounding may still be below the threshold.

QC exposes:

```text
data.raster.assets
data.raster.shots
data.raster.below_native
data.raster.unmeasured
data.raster.native
```

`shots[].worst_q` identifies the worst raster coverage for a shot.

Any required unmeasured layer is an evidence gap; never call it native without source data.

### 5.3 Soft-tier approval

For each soft asset, verify:
- It was disclosed as soft in the G4 plan.
- The user accepted the relevant G4 plan.
- The actual generated dimensions and measured q were shown at G5b.
- The user approved that asset version and the measured quality.
- No later change made that approval stale.

A new version cannot inherit a previous version's soft-tier consent.

Record the asset id, version, shot, measured q, approved G4/G5b evidence, and visual consequence in REVIEW.md and the delivery note.

An approved G5b asset by itself does not prove that G4 explicitly accepted its soft quality tier.

### 5.4 Replan recovery

When `q < 0.75`, report the shot, asset, geometry, actual dimensions, and budget shortfall.

Offer technically supported changes for user selection:
- Reduce camera push or maximum scale.
- Reduce parallax travel.
- Crop less of the source.
- Break a full-frame raster into smaller layered elements.
- Use vector, HTML, or CSS ground elements.
- Consider a different delivery specification only through an approved G0 change and only if the actual kit supports it.

There is no Phase 1 upscaler guarantee and no automatic format-fork operation.

Changing the delivery specification reopens G0 and affected downstream approvals; it cannot be silently done in QC.

### 5.5 Renderer scaling

Chrome DPR and HyperFrames resolution settings improve HTML, vector, and text rendering. They do not add source pixels to raster images.

ffmpeg Lanczos is interpolation, not learned detail recovery.

Do not count either mechanism as increasing `q`.

Only describe the film as native-resolution when **every** raster layer has `q >= 1.0`.

If one or more rasters are soft, report the actual tier and worst q instead.

## 6. Asset and licence audit

For every referenced asset:
- Resolve the manifest id and version.
- Verify the current approved status.
- Verify the recorded hash and physical file.
- Check that the path stays inside the project.
- Reject missing, rejected, or superseded references.
- Preserve approved canonical reference associations.

For music and SFX, verify:
- Licence identifier and applicable terms.
- Source URL or other reliable origin.
- Required attribution text.
- Matching `assets/CREDITS.md` entry where applicable.
- Any non-commercial limitation accepted in the approved project.

User possession of a music file is not evidence of distribution rights.

Do not fabricate a creator, source, licence, or credit.

Unknown provenance blocks delivery.

## 7. Visual and structural integrity

Check:
- Every planned shot has a real composition.
- No duplicate or missing shot ids.
- All required narration/copy units are represented.
- Root timeline timing matches STORY.md.
- Motion assertions correspond to current promoted shots.
- Elements intended to remain visible stay in frame.
- Any permitted overflow has a documented declaration and reason.
- Every HTML audio element has a unique `id`.
- No `TODO`, `TBD`, `lorem`, `status: outline`, unresolved `{{`, or missing `src` remains.
- The film is not silently truncated or incomplete.

A snapshot or source inspection is not a substitute for the actual final render and QC.

## 8. Portrait delivery

For generic 1080×1920 output:
- Default vertical safe band: 168–1330 px.
- Text must not be hidden by the platform's right action rail.
- Readable text must be at least 28 px at output scale.

Review the G6 manual evidence for affected frames, text bounds, and font size.

If the applicable inspection was not performed, record `HARD_NOT_RUN`. Do not infer platform compliance from a generic `staysInFrame` result.

If the current edit differs from the inspected edit, require fresh review and the appropriate gate reopening.

## 9. QC outcome

A current QC success requires:
- Actual MP4 measurements.
- No unresolved non-waivable failures.
- No `replan` raster.
- Valid G4/G5b evidence for every soft raster.
- Current asset and audio provenance.
- Current G6 approval.
- Current waiver validity where applicable.
- No unresolved P0/P1 blocker.

A failed `imagine-kit qc` must remain recorded as failed, even when the user chooses to pursue an eligible exception for a separate waivable issue.

Do not manufacture an `ok: true` result or modify the QC file to conceal errors.
