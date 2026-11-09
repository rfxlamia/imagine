# Install Imagine on Antigravity

These instructions are for the Antigravity (`agy`) agent. The user pasted a prompt asking you to read this file, install the plugin, and explain what it does. Do exactly the steps below. Do not create an Imagine project, do not run `/imagine`, and do not run commands that are not listed here.

## 1. Install the plugin

```bash
agy plugin install https://github.com/rfxlamia/imagine
```

agy copies the repository into `~/.gemini/config/plugins/imagine`.

## 2. Install the kit's npm dependencies

agy does not install npm dependencies. Without this step the kit fails with `Cannot find package 'yaml'`.

```bash
cd ~/.gemini/config/plugins/imagine && npm install
```

## 3. Verify

```bash
agy plugin list --json
node ~/.gemini/config/plugins/imagine/host/check-stage.mjs --host antigravity --stage scene-builder
```

The first command must list `imagine`. The second must print JSON with `"status":"ok"` and `"isolation":"kit-guard"`. If either check fails, stop and show the user the exact output. Do not edit files under `~/.gemini/config/plugins/imagine` to make a check pass.

Then check the external tools the pipeline calls, and report which are missing:

```bash
node --version; npx --version; uv --version; ffmpeg -version; ffprobe -version; codex --version
```

Node must be 22 or later. A missing tool does not block the install. The step that needs it stops as `BLOCKED` later.

## 4. Explain the plugin to the user

Tell the user, in their language:

- Imagine turns a story idea into a finished motion-graphics video (MP4) rendered with HyperFrames, landscape 1920×1080 or portrait 1080×1920 at 30 fps.
- It ships six skills. `imagine` is the entry point: it creates or resumes a project and routes to the others. `imagine-canon` (script, story bible, voice, style), `imagine-plan` (storyboard, previz, effects plan), `imagine-generate` (reference images, audio, image batches), `imagine-edit` (shot implementation, mix, picture lock), `imagine-deliver` (final render and QC).
- Five subagents do planning and building: `storyboard-artist`, `previz-designer`, `fx-designer`, `continuity-reviewer`, `scene-builder`.
- The work stops at approval gates (G0 to G7). Each gate records only the user's own verbatim answer.
- Projects are created under `./.imagine/` in the folder where the user starts the session.
- On Antigravity, `scene-builder` runs behind the kit guard. The guard detects changes to canon, plan inputs and media after `stage-shot` and refuses promotion. It does not prevent writes.
- To start, the user asks to make a video with Imagine (the `imagine` skill).

## Updating later

```bash
agy plugin uninstall imagine
agy plugin install https://github.com/rfxlamia/imagine
cd ~/.gemini/config/plugins/imagine && npm install
```

`agy plugin uninstall` comes from `agy plugin` help and has not been observed by the maintainer. If it fails, show the user the output.

Maintainer notes and verification status: [antigravity.md](antigravity.md).
