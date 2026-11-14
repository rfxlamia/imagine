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

Inside Claude Code, add the marketplace and install the plugin:

```
/plugin marketplace add rfxlamia/imagine
/plugin install imagine@rfxlamia
```

Update later with `/plugin marketplace update rfxlamia`.

### Antigravity

Paste this prompt into `agy`:

```
Read https://github.com/rfxlamia/imagine/blob/main/docs/harnesses/antigravity-install.md, then install the plugin and explain what it does.
```

The agent installs the plugin, runs the `npm install` that agy skips, verifies the install, and explains the plugin. On Antigravity, scene-builder runs behind the detective kit guard, which detects changes but does not prevent writes. Details are in [docs/harnesses/antigravity.md](docs/harnesses/antigravity.md).

### Codex

Requires macOS arm64, Codex CLI 0.169.0, and existing OpenAI Codex authentication. Add the marketplace and install the plugin:

```bash
codex plugin marketplace add rfxlamia/imagine
codex plugin add imagine@rfxlamia --json
codex plugin list --json
```

Use the `installedPath` returned by plugin add to install dependencies and check the adapter:

```bash
cd "<installedPath>"
npm install
node host/preflight.mjs
node host/check-stage.mjs --host codex --stage scene-builder
```

The stage check should report `status: ok` and `isolation: kit-guard`. Start a fresh Codex session and ask to use Imagine; its six skills appear under `imagine:*`.

Planning/review roles use a separate read-only worker that loads the canonical agent instructions. Scene-builder uses a staged shadow, a detective kit guard and a parent-held baseline digest; prepare its offline runtime cache as described in [the Codex install guide](docs/harnesses/codex-install.md). A real single-shot build, lint and guarded promotion are verified; a complete film run remains unverified. The Git install path requires these adapter files to have been published to the repository; before merge, use a local checkout or the PR branch as explained in the guide.

In Claude Code, invoke `/imagine` from your own working directory. Projects land in `./.imagine/` there. The shorter first-run path is the [quick start](docs/quick-start.md). The first questions are G0: format, platform, audio mode, language, duration range, and whether silence is intentional. After you approve them, the plugin creates `.imagine/<YYYY-MM-DD>-<slug>/` and points `.imagine/ACTIVE` at it.

### Develop from a clone

```bash
git clone https://github.com/rfxlamia/imagine.git
cd imagine
npm install --prefix packages/imagine-kit
claude --plugin-dir "$PWD"
```

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
| Claude Code | Installs the plugin from the `rfxlamia` marketplace, or loads a clone with `--plugin-dir`. Checked here on 2.1.314 and 2.1.318 for `--plugin-dir` |
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
| `purge` | Reclaim storage after delivery: delete PNG/MP4/JPG outside `post/` (dry-run unless `--apply --quote`) |

Phase 1 ships these 13 commands. `purge` is a post-delivery command for the main agent and runs only with the user's explicit verbatim quote. The [CLI contract](docs/contracts/cli-contract.md) still lists the other commands and marks deferred ones accordingly. Do not call a deferred command. Nothing in this version depends on one.

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

The root dependencies also serve the kit when the plugin is installed from the marketplace (Claude Code installs them automatically); from a clone, run `npm install` at the root or `--prefix packages/imagine-kit`.

## Contracts

- [CLI contract](docs/contracts/cli-contract.md): commands, the JSON envelope, and exit codes
- [Source formats](docs/contracts/source-formats.md): project files, gates, and hashes
- [Rules](docs/contracts/rules.yaml): HARD, GATE, and process rules
