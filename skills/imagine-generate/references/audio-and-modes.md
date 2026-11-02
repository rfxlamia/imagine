# Audio Generation, Modes, and Human Listening

## 1. Mode selection

Use the exact `audio_mode` approved at G0.

| Mode | Primary units | Timing source | Production audio |
|---|---|---|---|
| narrated | `L##` in `script/narration.md` | Scratch then final VO | One approved final WAV per line |
| music-led | `T##` in `script/copy.md` | Measured music beat grid | Licensed music, optional SFX |
| text-led | `T##` in `script/copy.md` | Minimum read time per unit | Optional music/SFX or approved silence |

Do not assume every project is narrated.

### 1.1 Narrated clock

Scratch VO estimates line timing before the final recordings exist.

Final approved VO durations supersede scratch timing and may invalidate dependent previz or edit timing.

Scratch files are non-production evidence and cannot satisfy G5a.

### 1.2 Music-led clock

Use the licensed source track and directly invoke the pinned HyperFrames beats capability with telemetry disabled.

Store observed beat times and actual source hash.

When STORY marks an event `on_beat`, the final relevant cut must lie within ±1 frame of its intended beat.

Do not use a fictional beat-detection kit command or invent beat timestamps.

Music must have a valid source and licence recorded at G4.

### 1.3 Text-led clock

Use:

`read_seconds = max(1.2, 0.5 + 0.3 × words)`

Count the approved text unit's words and retain the value for the exact current unit.

The user may explicitly override a unit duration. Record that override with the unit ID and source revision.

Every text unit must appear exactly once, with on-screen duration at least its planned read time.

The timing clock changes if the audio mode changes; reopen G1 and downstream planning.

### 1.4 Silence

Silence is permitted only when the G0 choice includes `silence: intentional`.

In that case:
- Casting and TTS are recorded N/A.
- G5a records N/A with the G0 basis.
- HyperFrames `film_silent` is treated as advisory with its documented reason.
- Final QC still checks a digital-silence audio stream when platform compatibility requires one.
- Do not report an actual audio listening pass for a silent project.

Do not treat an unexpected missing music/VO stream as intentional silence.

## 2. TTS production identity

The production worker uses pinned Pocket TTS code and a known model/configuration revision.

Run through the supported `imagine-kit tts` adapter. Do not replace its production mechanism with a generic untracked TTS call.

For each production take, identity includes:
- Script line ID and approved text revision.
- Exact `tts_text`.
- Model configuration and revision.
- Voice identifier or voice-source file hash.
- Seed and temperature.
- Resulting immutable WAV hash.
- Explicit take number.

The worker may load the model once for multiple lines, but each line is a distinct WAV and review item.

Use a stable seed policy, such as `seed_base + take`, and record the observed parameters.

Do not depend on bit-exact regeneration, including across languages, runtime versions, or hardware.

The exact approved WAV bytes, not theoretical deterministic generation, define an approved take.

## 3. WAV requirements

Production files live in `assets/vo/` with immutable `.vN` names.

Each file contains one complete source script line.

Expected format:
- WAV container.
- 24 kHz sample rate.
- Mono.
- 16-bit PCM.
- Duration measured from actual frame count.

Verify the physical format, decode success, duration, file hash, and identity before requesting approval.

Do not accept a model-complete text message as evidence of a valid waveform.

Use `KPOCKET_TTS_ERROR_WITHOUT_EOS=1` so a missing end-of-sequence condition fails rather than silently producing an apparently complete take.

## 4. Audition, scratch, and production separation

Three distinct purposes:

**Auditions**

Stored in `tmp/audition/`, used during casting and G2 decisions. They are never production assets.

**Scratch VO**

Stored in `tmp/scratch-vo/`, used only to estimate timing before final VO. It has no G5a production approval.

**Final VO**

Stored in `assets/vo/`, measured, versioned, reviewed by ear, and eligible for G5a.

Never move an audition or scratch file into the final manifest merely to avoid generating production audio.

Casting is an upstream human decision; generation cannot silently change it.

## 5. Pronunciation and delivery

The supported levers are:
- Pronunciation lexicon and controlled respelling in `tts_text`.
- Punctuation or user-approved line splitting.
- Voice selection.
- Seed for a different take.
- Temperature.

These levers influence synthesis but do not guarantee speed, mood, or pronunciation outcomes.

Unsupported native controls:
- SSML.
- Phoneme-level input.
- Speed.
- Pitch.
- Emotion.

Do not claim that punctuation deterministically slows speech.

Optional ffmpeg `atempo` adjustment within ±10% is a post-processing choice, only on request, with an audible-quality warning and its own new version.

A lexicon change must never silently modify original captions or approved script text.

## 6. Language and voice limitations

### 6.1 English

English is the baseline supported language.

Use approved built-in voices by default unless the user explicitly selected an available file voice with verified cloning support.

Voice cloning is opt-in, not assumed.

### 6.2 Indonesian

Indonesian is experimental through the community configuration:

`anak10thn/pocket-tts-indonesian`

Pinned revision:

`382fe85ca848546efb04bf1b7fdba78c6396e2ce`

Associated licence: CC-BY-4.0.

The configuration requires compatible audio-file voice references rather than built-in English voice names.

The source contains four Common Voice reference clips and may require the audio dependency extra to load them.

Treat observed language and pronunciation quality as unverified until the user listens.

Never claim Indonesian production quality solely from successful waveform generation.

### 6.3 Voice cloning

A voice-file request is permitted only when the actual loaded model reports:

`has_voice_cloning = true`

If cloning weights fail to load or the model falls back to non-cloning weights, stop with a blocking capability failure.

Do not interpret a successful model initialization as confirmation that voice cloning is available.

Do not silently substitute a built-in voice for a requested file voice.

## 7. Fallbacks

Allowed alternatives are limited to:

**Kokoro via pinned HyperFrames**

Call the pinned HyperFrames TTS capability directly, with telemetry disabled.

Do not claim Indonesian support for this fallback.

The resulting audio still requires actual format checks, version identity, and user listening.

**User-recorded audio**

Accept one user-provided WAV per approved line.

Validate format, duration, line mapping, identity, and hash. If format conversion is needed, disclose and record the processed file as a new version.

Do not fabricate missing lines or silently join multiple lines into one file.

Fallback selection is a disclosed production decision, not an automatic workaround for a failed model.

## 8. G5a listening procedure

For narrated work:
1. Finish the intended production take for each line.
2. Verify waveform format and measured duration.
3. Present the line ID, speaker, original caption text, `tts_text`, voice, seed, take number, and WAV path.
4. Make the actual WAV accessible to the user.
5. Request a per-line approve/redo decision after listening.
6. Record the explicit user answer and exact approved version.
7. Regenerate only rejected or invalidated lines.

There is no Phase 1 generated audio listening webpage.

List the WAV files directly. When the user is on another device, use `SendUserFile` for those files rather than providing a broken page with relative audio links.

For music-led or sounded text-led work, present the music cut and each required SFX cue for human listening, including their timing and licence/source records.

Do not require a narrated VO approval in modes where narration is N/A.

### 8.1 Human assessment

The user evaluates pronunciation, intelligibility, timing, sound quality, and suitability.

Claude may report:
- Measured duration.
- Sample rate and channels.
- Decode/format result.
- Peak or other measured values when actually obtained.
- Source identity and file hash.

Claude must explicitly state that it did not hear the audio.

Do not write "sounds natural", "music is balanced", "pronunciation is correct", or "listening passed" unless reporting the user's own expressed assessment and quote.

## 9. Final VO timing and downstream changes

When a new approved take changes duration:
1. Compare measured duration with the timing source.
2. Identify affected line, beat/cue alignment, shot duration, and dependent edits.
3. Record impact before modifying approved timing.
4. Seek authorization for any locked timing changes.
5. Invalidate only the affected downstream work.

Final VO may be processed while images are generated. G5a and G5b are independent human review paths.

Neither approval substitutes for the other.

## 10. Audio evidence and recovery

Each production record must include:
- Line/cue ID and source revision.
- Actual WAV or music file path.
- sha256 and physical audio properties.
- Exact synthesis parameters or supplied-file identity.
- Immutable version and take.
- Measured duration.
- User listening answer and exact quote.
- Current approval/staleness status.
- Relevant timing dependencies.

If TTS fails, preserve the actual error. If recovery needs a different voice, model, script, or timing decision, request the appropriate upstream approval first.

Do not regenerate an already approved take after resume merely to prove that generation is repeatable.
