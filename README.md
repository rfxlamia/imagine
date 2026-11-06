<div align="center">

<img src="./img/logo.png" alt="Imagine logo" width="320" />

# Imagine

Turn a rough script into a 40–60 s motion-graphics MP4, with gated canon, planning, generation, edit, and delivery.

</div>

Imagine is a Claude Code plugin, version 0.1.0, for one short film at a time. A script line, a voice, a still, or a cut is locked only when you answer that gate's question in your own words. An earlier "go ahead" does not carry forward.

> [!IMPORTANT]
> `imagine-kit gate` stores an approval only when `--quote` is your verbatim answer. A blank quote exits 7 (`NEEDS_USER`) and records nothing.

## Getting started

The kit is not published to npm, and it is not assumed to be on `PATH`.

```bash
git clone https://github.com/rfxlamia/imagine.git
cd imagine
npm install --prefix packages/imagine-kit
claude --plugin-dir "$PWD"
```

In that session, invoke `/imagine`. The first questions are G0: format, platform, audio mode, language, duration range, and whether silence is intentional. After you approve them, the plugin creates `.imagine/<YYYY-MM-DD>-<slug>/` and points `.imagine/ACTIVE` at it.

One project is one format, both at 30 fps: landscape 1920×1080 or portrait 1080×1920. A second format is a second project. Phase 1 accepts platform `generic` only.

> [!NOTE]
> A missing tool stops that step as `BLOCKED` (exit 3). The plugin does not substitute a drawn PNG, a silent take, or a check it did not run.

## Gates

| Gate | What you decide | Scope |
| --- | --- | --- |
| G0 | Format, platform, audio mode, language, duration, silence | Project |
| G1 | Locked script units | Per unit |
| G2 | Bible, and the voice cast when the film is narrated | Per entity |
| G3 | Visual and motion style | Per anchor |
| G4 | Story, prompts, reference list, resolution tiers, estimate, music licence | Project |
| G5r | Canonical reference stills, after a continuity review | Per ref |
| G5a | Heard voice lines, or music and effects. Not applicable if you chose silence | Per line or cue |
| G5b | Shot images, including any soft resolution tier | Per asset |
| G6 | Studio preview and a draft MP4 of the full mix | Project |
| G7 | Final MP4 and QC evidence | Project |

G5a and G5b can run separately after G4. Batch images wait until every reference they use is approved at its current version. If one is not, `img --batch` exits 6 (`REFS_NOT_APPROVED`).

Planning agents return a patch. They do not write `STORY.md`. `patch apply` is the only writer of planning keys, and a rejected patch leaves the file unchanged. `scene-builder` may edit only inside `stage/edit/<id>/` for the shot it was given. The PreToolUse hook denies a write outside that shadow project. Read-only tools are not limited to that directory.

On a portrait film, whether text sits inside the platform band is a manual check at G6, written into `review/REVIEW.md`. Phase 1 has no `safe-band` command.

The approval is stored on the project with your quote and the source hashes from that moment. `journal.md` is append-only. Findings and waivers live in `review/REVIEW.md`. Editing an approved document reopens only the items that depend on it, and the workflow asks before it writes.

## Audio mode

This is locked at G0. Changing it reopens G1 and invalidates the timing plan. Only you can change it.

| Mode | Script | Clock |
| --- | --- | --- |
| `narrated` | `L##` lines in `script/narration.md` | Scratch voice, then the duration of the final take |
| `music-led` | `T##` units in `script/copy.md` | Beat grid of a licensed track. An `on_beat` cut stays within one frame of the grid |
| `text-led` | `T##` units in `script/copy.md` | `max(1.2, 0.5 + 0.3 * words)` seconds, unless you override that unit |

Casting and `tts` apply only in `narrated` mode. English is the baseline. Another language is a G0 choice, and the cast voice still has to be one the worker can load.

A silent `text-led` film needs `silence: intentional` at G0. If you bring music or effects, the licence is part of the G4 decision: you place the file and fill the manifest. `export-hf` then checks that third-party audio exists, is approved, matches its hash, and has licence fields.

## Requirements

| Tool | Why it has to be available |
| --- | --- |
| Claude Code | Loads this directory with `--plugin-dir`. Checked here on 2.1.314 and 2.1.318 |
| Node.js 22 or later | `imagine-kit` and the plugin hooks |
| `codex` | Still images, via `codex exec` |
| `ffmpeg` | Decodes rasters and measures loudness |
| `ffprobe` | `qc` reads the MP4 |
| `npx` | Skills pin `npx hyperframes@0.8.223` |
| `uv` | Narration worker: `uv run --with 'pocket-tts[audio]==4.0.1'` (Python 3.10–3.14) |

The SessionStart hook exports `HYPERFRAMES_NO_TELEMETRY=1` for later commands in the session. Loudness normalisation, beat grids, and `check --json --strict` are direct HyperFrames calls in this version, not kit commands. `qc` still measures the file you rendered.

## Commands

From the repo root:

```bash
node packages/imagine-kit/bin/imagine-kit.mjs <command> [--project <dir>] [--pretty]
```

The active project is the directory named in `.imagine/ACTIVE`.

> [!NOTE]
> Parsers read the last non-empty stdout line. That line is the JSON envelope. `--pretty` is for people. Diagnostics go to stderr.

| Command | Effect |
| --- | --- |
| `new` | Create the workspace and a pending G0 proposal |
| `status` | Read stage, gates, and staleness from recorded hashes |
| `gate` | Record approve or reject with your quote |
| `validate story` | Strict-parse `STORY.md` |
| `patch apply` | Validate a planning patch and write it, or leave `STORY.md` unchanged |
| `img` | Generate a canonical reference, or a batch once those refs are approved |
| `tts` | Generate narration takes |
| `stage-shot` | Prepare one shot's isolated edit |
| `promote-shot` | Promote an accepted shot into the root timeline |
| `export-hf` | Check approved assets, write `edit/STORYBOARD.md`, and sync files into `edit/` |
| `render` | Render a draft or final MP4 at 30 fps, with no best-effort frames. Final uses delivery quality |
| `qc` | Probe size, frame rate, loudness, raster, and credits |

Phase 1 ships these 12 commands. The [CLI contract](docs/contracts/cli-contract.md) still lists the others and marks them deferred. Do not call a deferred command. Nothing in this version depends on one.

## Repository

| Path | Role |
| --- | --- |
| `skills/imagine` | Workspace, G0, routing, gates |
| `skills/imagine-canon` | Script, bible, voice, style |
| `skills/imagine-plan` | Storyboard, previz, effects plan, G4 |
| `skills/imagine-generate` | References, audio, batch images |
| `skills/imagine-edit` | Shot implementation, mix, G6 |
| `skills/imagine-deliver` | Final render, QC, G7 |
| `agents/` | `storyboard-artist`, `previz-designer`, `fx-designer`, `continuity-reviewer`, `scene-builder` |
| `hooks/` | SessionStart env, and a PreToolUse hook that denies a scene-builder write outside its shot |
| `packages/imagine-kit/` | The CLI and the Python narration worker |
| `docs/contracts/` | Commands, source formats, rules |

## Tests

```bash
npm install --prefix packages/imagine-kit
npm test --prefix packages/imagine-kit

npm install
npm test
npm run check:names
npm run check:rules
```

The root install is for the repo checks. It is not required to load the plugin.

## Contracts

- [CLI contract](docs/contracts/cli-contract.md): commands, the JSON envelope, and exit codes
- [Source formats](docs/contracts/source-formats.md): project files, gates, and hashes
- [Rules](docs/contracts/rules.yaml): HARD, GATE, and process rules
