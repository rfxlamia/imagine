# Antigravity Harness Guide

This document summarizes the harness integration status and packaging for Google Antigravity. For detailed host adapter mapping and enforcement status, see [Host Adapter Mapping: Antigravity](../contracts/hosts/antigravity.md) and [host/capabilities.mjs](../../host/capabilities.mjs).

## Schema Source and Packaging

The manifest format in `.antigravity-plugin/plugin.json` is modeled on the reference manifest from obra/superpowers:
https://github.com/obra/superpowers/blob/main/.antigravity-plugin/plugin.json

The reference manifest schema defines fields:
- `name`
- `displayName`
- `version`
- `description`
- `logo`
- `suggestedPrompts`
- `category`
- `keywords`
- `author`
- `homepage`
- `repository`
- `license`

Because the manifest format contains no explicit skills-path field, skill discovery is assumed implicit.
The manifest schema, `repository` string format, skills discovery, install, and uninstall are ALL UNVERIFIED on Antigravity.
No install or uninstall commands are invented here. For harness porting context and reference documentation, see:
https://github.com/obra/superpowers/blob/main/docs/porting-to-a-new-harness.md

## Version Synchronization Rule

When updating plugin versions, the following files must change together:
- `.antigravity-plugin/plugin.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

The automated test suite (`tests/portability/antigravity-manifest.test.mjs`) enforces version parity between `.antigravity-plugin/plugin.json` and `.claude-plugin/plugin.json`. Note that `.claude-plugin/marketplace.json` is not covered by this test.

## Preflight Tools

The toolchain requirements defined in `host/preflight.mjs` apply:
- `node` (version >= 22)
- `npx`
- `uv`
- `ffmpeg`
- `ffprobe`
- `codex`

There is no claim that the preflight CLI itself runs under Antigravity.

## Telemetry

In Claude Code, `HYPERFRAMES_NO_TELEMETRY=1` is exported automatically via a `SessionStart` hook.
On Antigravity, the `SessionStart` hook is Claude-only and is NOT set automatically.
Users must export `HYPERFRAMES_NO_TELEMETRY=1` in their shell before running any `npx hyperframes` command.

## Stage 8b (scene-builder) Status

Stage 8b (`scene-builder`) is BLOCKED: no scene-builder write-scope hook or identity enforcement is verified there.
Output of `checkStage({ host: "antigravity", stage: "scene-builder" })` as of commit 650e960:
```json
{"status":"BLOCKED","host":"antigravity","stage":"scene-builder","reason":"missing verified enforcement evidence: scene_builder_enforcement (UNKNOWN), hook_failure (UNKNOWN)"}
```

Other workflow phases are expected to work, unverified.

## Verified / Unverified Status

| Capability / Surface | Status | Notes |
|---|---|---|
| Manifest packaging (`.antigravity-plugin/plugin.json`) | Landed (unverified) | Modeled after superpowers reference manifest |
| Live plugin installation | Unverified | Untested against live Antigravity harness |
| Skill discovery | Unverified | Assumed implicit; untested live |
| Tool execution | Unverified | Untested against live Antigravity harness |
| Subagent dispatch | Unverified | Untested against live Antigravity harness |
| PreToolUse / write-scope enforcement | Unverified | No enforcement mechanism verified; Stage 8b BLOCKED |
| SessionStart telemetry export | Unverified | Claude-only hook; requires manual export |
| Repository license | Gap | No LICENSE file exists in the repository |
