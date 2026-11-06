# Imagine Canon — ElevenLabs Voices and Casting

This reference covers casting and configuration for the hosted
`elevenlabs` TTS engine.

## 1. When to recommend ElevenLabs

Pocket TTS remains the default engine for English narration and
offline workflows.

For non-English narration (such as Indonesian or other languages
selected at G0), recommend auditioning an ElevenLabs voice
alongside the experimental Pocket TTS option. <!-- rule:ADV-HOSTED-TTS-NON-ENGLISH -->
The community Indonesian Pocket TTS model remains EXPERIMENTAL;
the user listens to both and chooses by listening.

## 2. Prerequisites and cost disclosure

Using ElevenLabs requires:
- An active internet connection during synthesis.
- An ElevenLabs account with an API key.
- A paid subscription tier if the film is intended for commercial use.

Before generating auditions or production takes, disclose the
estimated cost in characters. Each generation passes script
text to the ElevenLabs API, and `imagine-kit tts` reports
`data.characters` as the primary cost driver.

## 3. Provider API key setup

The agent must never ask the user to paste their API key into
chat, never write the key to any file, and never run onboarding
commands like `npx -y @elevenlabs/cli@latest onboard init`.

The user supplies the key out-of-band using one of two methods:
1. Setting the environment variable `ELEVENLABS_API_KEY`.
2. Storing the key in a private file at `~/.config/elevenlabs/key`
   (a regular file with permissions `0600`, not a symlink).

Provider API keys come only from the environment or a mode-600 file outside the project and never reach stdout, stderr, the journal, envelopes or project files. <!-- rule:HARD-SECRET-NEVER-WRITTEN -->

If the key is missing or has incorrect permissions, the kit exits
with code 7 (`NEEDS_USER`) and does not write assets.

## 4. Failures and no silent fallback

Any ElevenLabs API or worker failure (such as HTTP 401 invalid key,
422 unprocessable input, 429 rate limit, network disconnection,
or worker error) exits with code 3 (`BLOCKED`).

The kit never silently falls back to Pocket TTS or any other
engine on error. The failure is reported cleanly, requiring user
intervention or resolution before retrying.

## 5. Choosing a voice and auditioning

Voices are identified by their Voice Library voice ID (a string
matching `^[A-Za-z0-9]{8,64}$`). Record the friendly `voice_name`
for documentation and credits.

Auditions run through the kit CLI:

`imagine-kit tts --audition --voices elevenlabs:<voice_id> --line <L##>`

Bare voice IDs in `--voices` follow the speaker's cast engine
when the speaker is already cast in `bible.yaml`.

Audition WAVs are placed in `tmp/audition/` and do not count as
approved production assets.

## 6. Bible voice configuration

Configure ElevenLabs voices in `bible.yaml` under `narrator.voice`
or `characters[].voice`:

```yaml
voice:
  engine: elevenlabs
  voice_id: 21m00Tcm4TlvDq8ikWAM      # required, ^[A-Za-z0-9]{8,64}$
  voice_name: Rachel                  # optional, credits only
  model_id: eleven_v4                 # optional, default eleven_v4
  language_code: id                   # optional ISO 639-1; default = G0 language; not sent for eleven_multilingual_v2
  voice_settings:                     # optional levers
    stability: 0.5
    similarity_boost: 0.75
  seed_base: 1300                     # optional, 0..4294966295
```

### 6.1 Model choice

- `eleven_v4`: Default model. Supports only `stability` and
  `similarity_boost` in `voice_settings`.
- `eleven_multilingual_v2`: Multilingual alternative. Does not
  accept `language_code` (it auto-detects language from text).

### 6.2 Voice settings levers

The available voice settings keys are:
- `stability` (0.0 to 1.0): Higher values make speech more steady;
  lower values introduce more variability.
- `similarity_boost` (0.0 to 1.0): Controls adherence to the original
  voice profile.
- `style` (0.0 to 1.0): Style exaggeration (unsupported on `eleven_v4`).
- `speed` (0.7 to 1.2): Speaking rate (unsupported on `eleven_v4`).
- `use_speaker_boost` (boolean): Amplifies similarity (unsupported on `eleven_v4`).

For detailed tuning and prompt design guidance, refer to the
pinned upstream reference at:
`${CLAUDE_SKILL_DIR}/../../packages/elevenlabs-skills/text-to-speech/SKILL.md`

Remember the Imagine overrides: do not run the onboarding CLI,
generate WAV takes only via `imagine-kit tts` (`pcm_24000` to 24 kHz
mono 16-bit WAV), do not use audio tags (`[whispers]`) or request
stitching, and note the pinned worker environment (`elevenlabs==2.73.0`).

## 7. Licence and subscription plan tracking

The Python worker automatically queries the user's subscription
tier from the ElevenLabs API when generating takes.

Hosted TTS takes record provider, voice, model, plan tier and licence terms in the manifest and assets/CREDITS.md automatically; free or unverified plans are flagged. <!-- rule:PROC-HOSTED-TTS-LICENCE -->

Manifest entries for ElevenLabs takes record:
- `engine: elevenlabs`
- `model_id`
- `voice_id`
- `language_code`
- `provider_tier`: `creator` (or other paid tier), `free`, or `unknown`.
- `license`: Full terms text.
- `source`: Voice ID and model description.
- `credit`: Attribution line.

The kit automatically maintains `assets/CREDITS.md` with a bullet
under `## Voices (ElevenLabs)` for each unique voice, model, and tier:
`- <voice_name or voice_id>: ElevenLabs voice \`<voice_id>\`, model \`<model_id>\`, plan \`<tier or unknown>\`. Licence: <license>`

### 7.1 Plan tiers and commercial rights

- **Paid tiers** (`creator`, `pro`, `scale`, etc.): Commercial use is
  permitted under ElevenLabs Terms of Service and Prohibited Use
  Policy, provided the user holds rights to the text. Audio created
  on a paid plan retains commercial rights even after a plan downgrade.
- **Free tier** (`free`): No commercial use allowed. Attribution to
  ElevenLabs is required when shared non-commercially. The kit emits
  advisory `PROC-HOSTED-TTS-LICENCE`.
- **Unverified** (`unknown`): The subscription tier could not be
  verified from the API. The kit flags this with advisory
  `PROC-HOSTED-TTS-LICENCE` noting that commercial use requires a paid
  plan.

Downstream QC (`imagine-kit qc`) only lists VO entries that carry a
licence in `data.credits.items`; it validates nothing for VO. The agent
shows those credit lines (and the `free`/`unknown` plan terms) to the
user before G7.
