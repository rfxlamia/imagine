# Imagine Canon — Bible Interview, Voice Casting and Audio

This reference owns stage 3 canon interviews, narrated voice
casting, audition review, pronunciation and audio capability
boundaries.

The user chooses voices by listening. The main agent records
configuration and measured facts; it does not claim to hear
or judge an audio recording itself.

## 1. Bible interview

### 1.1 Preconditions

G1 must be approved before G2 approval.

Read the complete script, current bible and style source.
The style may still be a proposal, but G0 output requirements
must remain intact.

Interview for every entity actually required by the script.

For a character, collect when relevant:

- Stable ID and identity.
- Appearance and identifying features.
- Wardrobe and recurring props.
- Personality, motivations and speaking manner.
- Relationships and continuity requirements.
- Narration or dialogue responsibilities.
- Voice specification and audition outcome if narrated.

For a location, collect:

- Stable ID and distinguishing properties.
- Geography and spatial relationships.
- Time period, structures and significant objects.
- Continuity facts affecting visual generation.

For world canon, record rules of the setting, chronology,
facts shared across scenes and explicit creative constraints.

Unknown facts remain questions. Never invent identity,
appearance, environment or continuity merely to satisfy
a downstream prompt.

### 1.2 Bible paths

Follow the parsed `bible.yaml` schema in
`docs/contracts/source-formats.md`.

Array entities have stable `id` values, while pronunciation
entries use `term`. Entity IDs must not contain dots.

Examples of valid source references:

- `bible:characters.mara`
- `bible:locations.lighthouse`
- `bible:narrator`
- `bible:pronunciation.Skerryvore`

G2 approval items follow the actual parsed top-level bible
values: arrays of objects with IDs become per-entity items;
other nonempty values become their respective top-level items.

Do not invent nested approval scopes that the resolver does
not support.

## 2. Voice mode and language

### 2.1 Narrated mode

In narrated mode, cast every speaker with audible lines
before approving the affected G2 entity.

Use English built-in voices as the default for English narration and offline work.
For a non-English G0 language, recommend auditioning an ElevenLabs voice
(see `elevenlabs-voices.md`) next to the experimental Pocket option;
the user chooses by listening. <!-- rule:ADV-HOSTED-TTS-NON-ENGLISH -->
Voice cloning is not the default and must not be inferred
from the presence of an example WAV.

### 2.2 Non-narrated modes

Music-led and text-led projects have no voice casting or
TTS requirement.

Record casting and TTS as N/A in the project journal.
Do not create a fictional speaker, use scratch VO to fill
silence, or require a voice approval for on-screen copy.

Music-led timing comes from the licensed track's beat grid.
Text-led timing comes from its read-time plan.

### 2.3 Indonesian support

Treat Indonesian Pocket TTS as EXPERIMENTAL; audition each
candidate configuration and judge usability separately for
each clip instead of assuming English-quality output.
<!-- rule:PROC-ID-EXPERIMENTAL -->

For non-English narration such as Indonesian, recommend
auditioning an ElevenLabs voice alongside the experimental
Pocket option (see `elevenlabs-voices.md`).

The experimental community configuration is identified as:

```text
anak10thn/pocket-tts-indonesian
revision: 382fe85ca848546efb04bf1b7fdba78c6396e2ce
licence: CC-BY-4.0
```

Use only the explicitly supported and accessible configuration.
The pinned revision includes the relevant voice examples;
do not assume another revision has identical files.

Built-in English voice names do not work with that custom
Indonesian configuration. It requires a supported file-based
voice source and the audio-loading dependencies.

Record uncertainty about quality, provenance and runtime.
No automatic Indonesian-to-English voice substitution is
permitted.

## 3. Cloning authority

Offer built-in English voices first; enable voice cloning
only after the user's explicit opt-in and after reading the
on-demand `voice-cloning.md` reference. <!-- rule:PROC-CLONING-OPT-IN -->

Imagine must never accept gated model terms, authenticate to
Hugging Face, obtain credentials or perform gated-model login
on the user's behalf. <!-- rule:PROC-NO-GATED-LOGIN -->

Before using a cloned voice, obtain the voice owner's written
consent for the intended use and record that consent and
provenance in the bible. <!-- rule:PROC-VOICE-CONSENT -->

A user-uploaded recording, a public clip or a familiar voice
does not by itself establish permission to clone it.

For any `file:` voice source, verify the actual loaded model
reports `has_voice_cloning = true`; otherwise stop BLOCKED
rather than generating an unverified substituted voice.
<!-- rule:HARD-HAS-VOICE-CLONING -->

The Pocket TTS loader can fall back to weights without cloning
support. Never infer cloning capability merely because model
initialization returned successfully.

If a required model is gated or unavailable, explain the
restriction and offer only documented supported alternatives.

## 4. Voice representation

Use documented voice fields in `bible.yaml`. For Pocket TTS,
for example:

```yaml
characters:
  - id: mara
    name: Mara
    voice:
      engine: pocket-tts
      model: english
      source: builtin:eve
      seed_base: 1301
      temperature: 0.3
      audition:
        line: L02
        takes:
          - tmp/audition/mara-eve.wav
          - tmp/audition/mara-jane.wav
        chosen: eve

narrator:
  id: narrator
  voice:
    engine: pocket-tts
    model: english
    source: builtin:jane
    seed_base: 2201
    temperature: 0.3

pronunciation:
  - term: Skerryvore
    say: SKERRY-vor
```

The example is illustrative, not evidence that these takes
exist or that the selected voices have been approved.

Use actual supported voice identifiers and paths.
For cloned or other file-based voices, record the supported
project-relative `file:` path and provenance.

Do not invent unrecognized voice configuration controls.
Use the parser and adapter contract for supported fields.
For ElevenLabs voice configuration, see `elevenlabs-voices.md`.

## 5. Casting workflow

### 5.1 Candidate preparation

For each narrated speaker:

1. Choose a representative approved `L##` line.
2. Confirm the intended language.
3. Identify supported built-in or consented file voices.
4. Record voice source and actual engine/model choice.
5. Choose reproducible seed and temperature settings.
6. Prepare traceable candidate takes.
7. Generate auditions with the supported kit command.
8. Present the resulting WAV paths for the user's listening.
9. Ask which specific candidate the user chooses.
10. Record the audition evidence and actual selection.

Use documented audition syntax, such as:

`imagine-kit tts --audition --voices <voice-a,voice-b> --line <L##>`

Do not invent generated output paths. Use returned data and
the actual files created by the operation.

An audition is a casting sample, not an approval of future
production speech.

### 5.2 Audition isolation

Keep all audition recordings under `tmp/audition/` and all
scratch timing VO under `tmp/scratch-vo/`; neither is an
approved production asset. <!-- rule:PROC-SCRATCH-NOT-ASSET -->

Examples:

```text
tmp/audition/mara-eve.wav
tmp/audition/mara-jane.wav
tmp/scratch-vo/L02.wav
```

Only production takes belong to `assets/vo/` and its
versioned manifest.

Never copy an audition into the approved asset namespace
and claim G5a has already been satisfied.

### 5.3 Listening review

No generated audio-review HTML page exists in Phase 1:
present exact WAV paths to the user and, for listening on
another device, send the WAV files using `SendUserFile`.
<!-- rule:PROC-REMOTE-LISTEN -->

Do not provide a fictitious audio page or claim that a
relative HTML audio link works on another device.

Ask the user for specific audible observations:

- Is the identity and timbre suitable?
- Are names and difficult words pronounced acceptably?
- Is the delivery clear?
- Is the cadence suitable for the intended scene?
- Should this take be chosen or redone?

If a user cannot hear the recording, casting remains
unapproved. Do not select a winner based on file size
or an estimated quality metric.

Report duration, channels, sample rate, waveform statistics
or synthesis parameters only when measured, and explicitly
state that Claude did not hear the audio. <!-- rule:PROC-NOT-HEARD -->

## 6. Pronunciation lexicon

### 6.1 Separation of text

Maintain three separate concepts:

- Original approved script text.
- TTS-only `tts_text`, after applying approved respellings.
- Visible captions, using original script spelling.

Lexicon transformations must not alter what the viewer
reads or what the user approved at G1.

### 6.2 Supported controls

Pronunciation and delivery may be influenced only through
the documented levers: lexicon respelling, punctuation or
line boundaries, voice choice, seed and temperature; there
is no SSML, direct phoneme input, speed, pitch or emotion
control. <!-- rule:PROC-PRONUNCIATION-LEVERS -->

These levers influence generation but do not guarantee
a specific pace or correct pronunciation.

In particular, do not claim that adding punctuation
reliably slows delivery by a fixed amount.

A changed lexicon term affects VO lines containing that
term, not all unrelated narration.

Changing approved script punctuation or unit boundaries
may require G1 impact approval before resynthesis.

## 7. Synthesis contract

### 7.1 Supported operation

Production and scratch VO use `imagine-kit tts`, not
an undocumented external adapter invocation.

The documented command supports line IDs or `--all`,
audition and scratch modes, and versioned production redo.

Use the actual CLI contract for flag combinations.
Do not invent options for unavailable voice controls.

### 7.2 Per-line synthesis

Generate exactly one script line per WAV, preserving the
relationship between its `L##`, parameters, measured duration
and manifest record. <!-- rule:PROC-ONE-LINE-PER-WAV -->

A production line uses a versioned path such as:

```text
assets/vo/L02.v1.wav
assets/vo/L02.v2.wav
```

Approved versions are immutable.
A redo creates a new version rather than overwriting
the accepted take.

Expected adapter output is 24 kHz, mono, 16-bit WAV.
Verify measured properties instead of assuming compliance.

### 7.3 Reproducibility

For Pocket TTS, retain:

- Engine and model/configuration revision.
- Voice identifier or voice source file hash.
- `tts_text` actually submitted.
- Seed, including the take offset.
- Temperature.
- Parameters hash.
- Output file SHA-256.
- Measured duration.
- Version and approval status.

Take `n` uses `seed_base + n` under the documented worker
contract. Do not claim independently generated recordings
are bit-identical unless verified.

One model load per supported batch is preferred.
Do not promise parallel execution when unsupported.

Set `KPOCKET_TTS_ERROR_WITHOUT_EOS=1` for Pocket TTS
synthesis; missing end-of-sequence termination must surface
as an error rather than an apparently successful take.
<!-- rule:HARD-TTS-EOS -->

A production take's identity includes the parameters
and approved versioned file hash, not just a line ID.

### 7.4 Timing

Scratch VO measures early line durations for planning.
Production VO measures the actual final take.

Do not invent measured seconds or silently stretch a
shot to absorb a substantially longer final recording.

If final timing differs from the approved plan, use
the dependency rules to identify affected previz and
edit items.

For changes no larger than 0.1 second, the controller's
automatic retiming procedure may apply with a journal
entry. Larger changes reopen affected previz approvals.

### 7.5 Resynthesis and optional time stretch

Use fresh takes when pronunciation is unacceptable.

Only at the user's explicit request may ffmpeg `atempo`
adjust playback rate by up to plus or minus 10 percent;
warn that this can audibly degrade quality and does not
replace genuine delivery control. <!-- rule:PROC-ATEMPO-WARN -->

Do not silently use `atempo`, change pitch, or fabricate
an unavailable native TTS speed parameter.

A changed recording is a new candidate and still needs
the appropriate human listening review.

## 8. Documented fallbacks

If Pocket TTS cannot perform a supported task, offer
only Kokoro through pinned HyperFrames TTS (without
Indonesian support) or user-recorded WAV files supplied
per script line. <!-- rule:PROC-TTS-FALLBACK -->

For a supported HyperFrames fallback, use the command
family beginning with:

`HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 tts`

Consult the installed HyperFrames command syntax before
adding flags. Do not invent arguments or output formats.

A user recording must be attributable to the appropriate
line and validated for supported technical properties.

Neither fallback automatically satisfies audition,
consent, voice-identity or G5a listening requirements.

Do not assume an alternative voice engine, cloud API,
local clone service or language model exists.

If no listed fallback meets the user's requirements,
report BLOCKED and ask for a supported change.

## 9. G2 approval

Before approval, present each entity's factual canon and,
when narrated, its selected voice and audition evidence.

Show pronunciation entries with both original spellings
and TTS respellings. Explain which lines are affected.

Ask the user to approve the explicit entity scope.
Record the response with:

`imagine-kit gate G2 approve --scope <entity-items> --quote "<answer>"`

Verify the actual returned envelope and resulting status.

If a speaker is approved factually but its required audition
is unresolved, do not report its narrated G2 item as ready.

Do not treat selecting a voice as blanket approval of every
later generated VO line.

Final production takes require separate human listening
approval at G5a, owned by imagine-generate.

## 10. Failure and recovery

| Failure | Required response |
|---|---|
| Missing speaker fact | Block and ask for the missing canon |
| Missing or invalid audition | Regenerate supported audition, then ask user |
| Inaccessible WAV | Report inaccessible; do not claim it was heard |
| Missing cloning consent | Block cloning and offer built-in voices |
| Cloning weights unavailable | Block file voice; offer documented fallback |
| Experimental language failure | Report failure per clip |
| Wrong pronunciation | Change supported lever, redo affected line |
| Changed lexicon | Reopen affected VO dependencies |
| Changed voice choice | Reopen that speaker's VO dependencies |
| Failed command envelope | Preserve diagnostics and stop affected step |

Record actual errors and recovery decisions in the project
journal. No fallback is silently approved by an agent.

Always preserve prior approved takes and unaffected voices.
