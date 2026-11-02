# Imagine — Optional Voice-Cloning Reference

This reference becomes mandatory for voice casting only after the user
explicitly opts into voice cloning. It supplements, rather than
replaces, the imagine-canon stage's mandatory files and source
contracts.

## 1. Activation and scope

Before casting with cloning, the main agent must:

1. Confirm that the user wants cloning rather than a built-in voice.
2. Identify the intended speaker, approved source recording, and
   permitted use.
3. Confirm that the user has the necessary permission to clone the
   voice and use the recording in this production.
4. Record the selection and relevant provenance in the project's
   supported source fields.
5. Read this reference in full before casting, after resuming, and
   after context compaction.

Do not enable cloning by default or infer consent from the presence
of an audio file.

## 2. Supported capability

Consult the active TTS adapter contract for actual cloning support,
required reference format, sample constraints, and model limitations.

Do not assume that:

- Every installed voice engine supports cloning.
- A reference recording automatically produces usable cloning output.
- A model supports all languages equally.
- Voice rate, pitch, prosody, or emotion controls exist.
- Punctuation edits reliably slow the generated speech.
- An experimental voice configuration is production-ready.

If the chosen voice setup is unsupported, report BLOCKED and ask the
user whether to select a supported alternative. Do not silently
replace the chosen voice.

## 3. Casting and audition

Audition outputs belong under `tmp/audition/`, never in the approved
asset namespace.

The canon stage should:

1. Select a representative approved script line.
2. Prepare documented candidates with traceable settings.
3. Generate auditions only through supported TTS operations.
4. Record real candidate source paths and observed outcomes.
5. Present audition files for the user's listening.
6. Record the user's explicit choice before final voice generation.
7. Update the relevant bible voice fields through an authorized
   source-write procedure.

The user, not the agent's inferred preference, chooses the cast.

Pronunciation entries are TTS-only transformations. Captions and
approved visible copy preserve the original script wording.

## 4. Identity and version dependencies

The approved bible voice record should retain the actual supported
engine, model/configuration, reference source, seed/settings where
available, audition evidence, and chosen voice.

Changing any voice input that affects synthesis requires new VO
versions for the affected speaker.

A changed pronunciation entry invalidates VO lines containing its
term, not unrelated VO.

Measure new VO timing and propagate the clock dependencies described
in `references/operations.md` before returning to editing.

## 5. Approval and review

Every final generated line requires the appropriate G5a listening
decision. An audition approval is not a blanket approval of later
synthesized lines.

Record each line's real source, take, duration, and listen status.
Never invent a successful audition, cloning fidelity assessment, or
user listening result.

If the required voice quality or permission cannot be established,
keep the affected casting or audio stage blocked and report the
precise missing requirement.
