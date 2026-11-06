# Quick start

This gets a project created and G0 recorded. It does not render a film. Later gates still need your own answer, and image, voice, and render steps stop if their tool is missing.

## 1. Check the tools you need now

```bash
node -v
```

Node.js must be 22 or later. You also need Claude Code. The notes in this repo were taken on 2.1.314 and 2.1.318.

These can wait until the step that calls them:

| Command | First needed for |
| --- | --- |
| `codex` | Still images (`codex exec`) |
| `ffmpeg` | Raster and loudness checks |
| `ffprobe` | `qc` |
| `npx` | `npx hyperframes@0.8.223` |
| `uv` | Narration, Python 3.10–3.14, package `pocket-tts[audio]==4.0.1` |

A missing tool exits 3 (`BLOCKED`). Nothing is substituted.

## 2. Load the plugin

The kit is not on `PATH`. Install its dependencies, then start Claude Code with this repo as the plugin:

```bash
git clone https://github.com/rfxlamia/imagine.git
cd imagine
npm install --prefix packages/imagine-kit
claude --plugin-dir "$PWD"
```

## 3. Answer G0 in your own words

Invoke `/imagine`.

G0 locks format, platform, audio mode, language, duration range, and whether silence is intentional. Phase 1 accepts platform `generic` only. One project is one format, at 30 fps: landscape 1920×1080 or portrait 1080×1920.

An example answer, not a default:

> Landscape, platform generic, narrated, English, 40–60 seconds. Silence is not intentional.

Say different values if you want a different film. The recorded quote has to be the words you actually used for this question. "Go ahead" from an earlier message does not count.

After that answer, the plugin creates `.imagine/<YYYY-MM-DD>-<slug>/` and points `.imagine/ACTIVE` at it. The kit command it runs has this shape:

```bash
node packages/imagine-kit/bin/imagine-kit.mjs new "Harbor Lights" \
  --format landscape \
  --audio-mode narrated \
  --lang en \
  --duration 40-60 \
  --platform generic
```

`gate G0 approve` is recorded only with `--quote` set to your answer. A blank quote exits 7 (`NEEDS_USER`) and writes no decision.

Two choices that change the files you will edit next:

- `narrated` uses `L##` lines in `script/narration.md`. Casting and `tts` apply. English is the baseline.
- `music-led` and `text-led` use `T##` units in `script/copy.md`. A silent `text-led` film has to include `silence: intentional` in the G0 answer.

On a portrait project, the platform-band check is manual at G6. There is no `safe-band` command.

## 4. Confirm the project exists

From the repo root:

```bash
node packages/imagine-kit/bin/imagine-kit.mjs status --pretty
```

Read the last non-empty stdout line if you are parsing it. That line is the JSON envelope. `--pretty` is for you. Diagnostics go to stderr.

You should see the new project, G0 approved, and no later gate approved.

## 5. Stop here

The next human decision is G1: lock each script unit. Do not generate stills yet. Batch images are refused until the canonical references they use are approved (`REFS_NOT_APPROVED`, exit 6).

The gate table, audio-mode clocks, and the 12 commands are in the [README](../README.md). Command synopses and exit codes are in the [CLI contract](contracts/cli-contract.md).
