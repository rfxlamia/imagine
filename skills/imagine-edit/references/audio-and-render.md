
# Audio, Media, Rendering, and Technical Evidence

This reference governs stage 9 audio construction, media provenance, rough-mix rendering, and delivery checks.

## 1. Approved media authority

The edit may use only assets with approved identity and current version records.

The main agent must distinguish:
- User-supplied licensed assets.
- Approved generated assets.
- Licensed third-party SFX.
- Bundled offline-library SFX.
- Intentionally absent music or voice under the approved G0 mode.

A file's presence on disk does not prove that it is approved, licensed, or the correct version.

If the approved source was replaced, revalidate its identity and dependent approvals before using it.

Do not make a replacement asset appear approved by reusing the previous filename.

## 2. SFX selection

Use the HyperFrames media-use workflow for supported SFX retrieval.

Selection order:
1. Search supported Openverse CC0 assets.
2. Consider Openverse CC-BY assets with the required attribution.
3. Use the bundled offline SFX library when online retrieval is unavailable or unsuitable.
4. If no suitable permitted source exists, report the gap.

For each external SFX preserve:
- Exact local file path.
- Source URL or other source identifier.
- Creator attribution where applicable.
- Licence name and applicable version.
- Required credit text.
- Approved usage and timing.

Never claim that all Creative Commons licences are equivalent.

CC0 has different credit obligations from CC-BY. Preserve provenance even when attribution is not legally required.

Do not fabricate source URLs, creator names, or licence facts.

A fetched file with unknown usage rights is not approved SFX.

## 3. Music policy

Supported music options are:

### 3.1 User-supplied

A user-provided music asset in the project's approved music area, conventionally `assets/music/`, may be used when its licence, source, and credit are recorded.

Do not infer that possession proves a licence for commercial publication.

If the user has not supplied usable music and G0 allows no music, leave music absent.

### 3.2 MusicGen

MusicGen is optional and requires:
- Explicit user opt-in before generation/use.
- Acceptance of the applicable non-commercial restriction.
- Recorded provenance and licence.
- A non-commercial label for the affected output.

Do not silently introduce MusicGen into a commercially intended film.

Do not promise unrestricted commercial rights.

### 3.3 Other catalogues

A separately available catalogue can be considered only when the workflow actually supports it and the asset's licence is documented.

Do not treat an optional catalogue as required infrastructure.

Do not claim that Openverse music search is supplied by the HyperFrames SFX media-use engine.

## 4. Narration

### 4.1 Voice identity and coverage

Use approved G5a voice assets where narration is required.

Every L## must resolve to the intended current VO version.

Check:
- L## identity.
- Local path.
- Source and approval version.
- Placement start.
- Audio duration.
- End time.
- Adjacent VO overlaps.
- Total film duration.

Do not add narration to a mode for which narration was not approved.

No absent L## may be silently replaced by a subtitle or on-screen text.

### 4.2 Timing

Use the actual WAV duration and intended line placement.

A line beginning at `t` with duration `d` ends at `t + d`.

Unless specifically approved as intentional, line speech must not overlap another line's speech.

All line intervals must fit inside the root film duration.

When voice duration conflicts with a locked cut, report it. Do not silently truncate the WAV or claim the delivery was slowed by punctuation.

### 4.3 No invented speed controls

Phase 1 does not expose an arbitrary TTS speech-rate controller.

Do not advertise:
- An undocumented TTS speed option.
- Punctuation as a dependable duration control.
- A promised voice duration without measuring the actual output.
- An automatic voice-retiming feature that is not present.

Only when the user explicitly requests time-stretching may ffmpeg `atempo` be used within ±10%.

Warn before using it that time-stretching may audibly affect cadence, transients, and voice quality.

Keep the original audio available and verify the processed duration afterward.

### 4.4 Remote listening

There is no Phase 1 audio review page.

List the actual WAV paths and their L## mappings so the user can locate them.

For listening on another device, send the WAVs through SendUserFile if the capability is available.

If transfer is unavailable, explain that limitation and preserve local file paths.

Never claim that the user received or heard a file without corresponding evidence.

## 5. Root audio composition

Every HTML audio element requires an explicit unique `id`.

Attach audio using the supported HyperFrames timing and automation contract.

For narration:
- Use the approved L## source.
- Schedule it at its locked beat.
- Preserve enough surrounding room for intelligibility.

For music:
- Use an approved track.
- Place music over the intended film interval.
- Define ducking with the supported `data-automation` mechanism.

For SFX:
- Use approved cue ids and timing.
- Avoid unintended masking of speech.
- Preserve the source record.

Do not assume the renderer mixes a source correctly simply because its path appears in HTML.

A missing `id` can cause silently dropped audio.

## 6. Normalization and loudness

### 6.1 Normalization

Run the pinned HyperFrames audio normalization command with telemetry disabled:

`HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 normalize-audio`

Use only supported arguments from the installed HyperFrames skill.

Inspect the resulting tool output rather than claiming that normalization succeeded merely because the command was attempted.

### 6.2 Delivery targets

For non-silent output, target:
- Integrated loudness: -16 LUFS ±1.5 LU.
- True peak: no greater than -1 dBTP.
- No audible or measured clipping.
- Intelligible narration and appropriately ducked music.

Use the actual measurement procedure supported by the installed toolchain and verify using ffmpeg/ebur128 where applicable.

A reported amplitude or file size is not a substitute for loudness measurements.

Do not infer successful ducking from static automation attributes without checking the resulting mix.

For intentional silence, document that G0 chose silence and omit the non-silent loudness requirement while retaining any required output audio stream.

### 6.3 Beat analysis

For music-led cuts, use:

`HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 beats`

Use the returned actual beat grid.

The target tolerance for cuts explicitly marked `on_beat` is ±1 frame at the G0 frame rate unless the approved project contract is stricter.

At 30 fps, one frame is approximately 0.0333 seconds.

Do not manufacture beat timestamps or treat the nearest guessed musical accent as a verified beat.

## 7. Rendering

### 7.1 Pre-render checks

Before draft or delivery rendering, confirm:
- Current STORY.md and G0 constraints.
- Every required composition exists.
- Every scene source resolves.
- Root duration is correct.
- Root motion assertions are current.
- All asset hashes are approved.
- All required audio sources are present.
- Every audio element has an id.
- Third-party audio licence metadata is complete.
- There are no unresolved placeholders.
- Strict HyperFrames validation has been performed.

Do not intentionally skip failing or missing media to obtain an MP4.

### 7.2 Offline dependencies

HyperFrames may need GSAP/CDN resources during rendering.

Offline operation requires a suitable local mirror exposed through:

`HYPERFRAMES_GSAP_BASE_URL`

Verify that the mirror actually serves the resources required by the edit.

If absent, fail with a dependency explanation.

Do not claim offline reliability from the mere presence of the environment variable.

### 7.3 Draft render

The draft is a complete film, not a short isolated shot.

It must include:
- The entire root timeline.
- All current promoted scenes.
- Intended transitions.
- VO where required.
- Music and ducking.
- SFX at their current cues.
- An audio stream when required.

Use `imagine-kit render --draft` as the canonical G6 draft render path. It writes `review/<slug>.draft.mp4` and records the `render:draft` item and journal evidence. The pinned HyperFrames renderer may be used only for diagnostics; its output is noncanonical and must not serve as G6 review evidence unless a documented mechanism reconciles its path, hash, and kit state.

Read the actual kit result and output metadata before claiming that the canonical draft was rendered.

A valid draft is the basis of G6 listening and picture review.

### 7.4 Delivery render

After G6 approval and any required freshness revalidation, use `imagine-kit render --final` as the only canonical delivery render path. It writes the immutable final version at `post/<slug>.v<N>.mp4` and records the kit-managed render state and journal evidence. Do not render a changed post-G6 edit as though it were the locked version.

Direct HyperFrames rendering may be used for diagnostics only. Its output is noncanonical and must not be accepted as a G7 deliverable; it does not replace the kit's preflight, version selection, freshness checks, or state recording.

If the source has changed, apply the impact procedure and reopen the affected gate.

### 7.5 Output verification

Run the supported kit QC procedure through `imagine-kit qc`.

For the actual MP4 verify:
- Output path exists.
- Container is readable.
- Video stream exists.
- Frame rate is 30 fps.
- Width, height, and aspect match G0.
- Duration satisfies G0.
- Audio stream exists when required.
- VO coverage and placement are consistent with STORY.md.
- Loudness and true peak satisfy applicable targets.
- No missing/unready media was bypassed.
- Required licence metadata is complete.
- The output corresponds to the current approved source hashes.

Do not claim that QC examined a particular property unless the actual QC report or an additional observed measurement supports it.

## 8. Strict HyperFrames checks

Use:

`HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 check --json --strict`

Evaluate the entire returned JSON.

Strict mode includes structural warnings and motion assertions.

Do not ignore a warning because the scene rendered.

A structural warning may indicate:
- Unsupported nesting.
- Missing sub-composition structure.
- Static or mistimed motion.
- Dropped audio.
- Missing or unresolved sources.
- A runtime condition that can stall a render.

The only automatic D10 demotion is `contrast_aa_failure` inside a verified shader-transition interval.

A contrast failure outside that interval is blocking.

Any other strict-check error or warning remains blocking.

If a check result includes both an allowlisted occurrence and a separate blocking finding, report both separately and block.

Advisory editorial categories such as line_unread, dead_stretch, and text_below_floor may be recorded as advice only when they are not being returned as active, unallowlisted strict-check failures.

Do not transform a HARD strict-check warning into a subjective advisory merely by assigning it P2.

## 9. Manual visual and audio evidence

For G6 capture review snapshots using the supported pinned HyperFrames snapshot workflow.

Inspect the actual returned frames.

Verify shot continuity, frame boundaries, text size, safe bands, shader intervals, and intended composition.

The 9:16 platform band is a manual check because the Phase 1 kit has no safe-band command.

Use the G0 platform specification. Where the documented default applies, compare against the 168–1330 px safe band and the relevant action rail exclusion.

Record:
- Frame or timestamp examined.
- Text element and measured size.
- Whether it meets the 28 px minimum.
- Whether it is inside the G0 platform band.
- Whether platform UI would obscure it.
- Reviewer and evidence source.

Missing manual inspection is `HARD_NOT_RUN`, not a pass.

For audio, distinguish:
- Measured technical evidence.
- A human listening report.
- Claude's own direct audio observation, if actually available.
- Checks not performed.

A machine-measured waveform cannot prove that a sound effect feels correctly timed or the music ducking is aesthetically successful.

Human listening is required for G6.
