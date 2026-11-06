# Changelog

This project has no git tag yet. `0.1.0` is the version in `.claude-plugin/plugin.json`. The date on that version is the day the end-to-end slice merged to `main` (2026-11-05), not a published GitHub release.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Plugin README, with the logo at `img/logo.png` exempted from the generated-media ignore rule.
- Quick start at `docs/quick-start.md`.
- This changelog.

## [0.1.0] - 2026-11-05

### Added

- Claude Code plugin `imagine` at version 0.1.0. Skills: `imagine`, `imagine-canon`, `imagine-plan`, `imagine-generate`, `imagine-edit`, `imagine-deliver`. Agents: `storyboard-artist`, `previz-designer`, `fx-designer`, `continuity-reviewer`, `scene-builder`.
- SessionStart hook exports `HYPERFRAMES_NO_TELEMETRY=1`. A PreToolUse hook denies a `scene-builder` write outside that shot's `stage/edit/<id>/` directory. Read-only tools are not limited to that directory.
- `imagine-kit` 0.1.0, invoked as `node packages/imagine-kit/bin/imagine-kit.mjs`. Phase 1 commands: `new`, `status`, `gate`, `validate story`, `patch apply`, `img`, `tts`, `stage-shot`, `promote-shot`, `export-hf`, `render`, `qc`. Other rows in the CLI contract are deferred and are not implemented.
- One format per project, 30 fps: landscape 1920×1080 or portrait 1080×1920. Platform `generic` only. A second format is a second project.
- Audio modes `narrated`, `music-led`, and `text-led`, locked at G0. Text-led read time is `max(1.2, 0.5 + 0.3 * words)` seconds unless a unit is overridden. Silent text-led output requires `silence: intentional`.
- Gate approvals require the user's verbatim answer in `--quote`. A blank quote exits 7 (`NEEDS_USER`) and records nothing.
- Still images go through `codex exec`. Narration uses the Python worker with `pocket-tts[audio]==4.0.1`. Timeline, check, and render pin `npx hyperframes@0.8.223`. `qc` uses `ffprobe` and `ffmpeg`.
- `img --batch` exits 6 (`REFS_NOT_APPROVED`) when a referenced canonical still is not approved at its current version.
- `patch apply` is the only writer of `STORY.md` planning keys. A rejected patch leaves the file unchanged.
