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
Install from a local directory, install from the repository URL (`agy plugin install https://github.com/rfxlamia/imagine`), and discovery of the 6 skills are verified on agy 1.5.3 (macOS) by the maintainer. `agy plugin install` does not install npm dependencies: run `npm install` in `~/.gemini/config/plugins/imagine` after every install, or the kit fails with `Cannot find package 'yaml'`. The end-user path is [antigravity-install.md](antigravity-install.md). The manifest schema, the `repository` string format, and uninstall are still unverified. No install or uninstall commands are invented beyond the ones the maintainer used (`agy plugin install <dir>`, `agy plugin list`, `agy plugin uninstall <name>`; the last one is documented by `agy plugin` help, not observed by us). For harness porting context and reference documentation, see:
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

No shell export is needed on Antigravity. The kit passes `HYPERFRAMES_NO_TELEMETRY=1` in the environment of every HyperFrames process it spawns (`HF_ENV` in `packages/imagine-kit/src/tools.mjs`), and the skills prefix every direct HyperFrames command with `HYPERFRAMES_NO_TELEMETRY=1`. The Claude Code `SessionStart` hook is an extra layer that Antigravity does not need.

## Antigravity Agent Generation

Antigravity cannot load Claude-formatted `agents/*.md` because `tools: Read, Glob, Grep` is a comma-delimited string rather than a YAML list of Antigravity tool names. The repository preserves `agents/*.md` as the single Claude-format source and generates an Antigravity-compatible copy in `agy-agents/`, registered via root `agents.json`.

All five agents defined in `agents/*.md` (including `scene-builder`) are emitted into `agy-agents/`. Dispatch gating is enforced by `check-stage` (`host/check-stage.mjs`) and skill rules, not by omitting the agent file.

### Generation Workflow

1. Edit the canonical agent definition in `agents/*.md`.
2. Run `node tools/agent-antigravity.mjs --write`.
3. Commit both the source files in `agents/` and the generated outputs in `agy-agents/` and `agents.json`.
4. Run `npm run check:agy-agents` (or `node tools/agent-antigravity.mjs --check`) in CI to catch drift.

### Verified Tool-Name Mapping

Antigravity accepts a specific set of tool names in the agent frontmatter `tools` block list. Invalid or unknown names cause startup errors with `unknown component: tool "<name>" not found in registry` (no hang was observed).

| Claude Tool | Antigravity Tool | Probe Result |
|---|---|---|
| `Read` | `view_file` | Accepted |
| `Glob` | `find_by_name` | Accepted |
| `Grep` | `grep_search` | Accepted |
| `Write` | `write_to_file` | Accepted |
| `Edit` | `replace_file_content` | Accepted |
| `Bash` | `run_command` | Accepted |

Rejected tool names during live probe: `find_file`, `search_directory`, `create_file`, `edit_file`.

### Security Boundaries and Tool Allowlist

The `tools:` frontmatter allowlist is NOT a verified restriction or security boundary on Antigravity: in live testing, an agent with 2 declared tools was observed invoking other tools and reading files outside its workspace.

The actual security and integrity boundary in Imagine relies entirely on:
- The patch-only subagent contract (subagents propose YAML patches without writing directly).
- The `patch apply` command in `imagine-kit` as the sole writer of story and planning keys.
- Source-hash and base revision validation checks.
- For Stage 8b, the kit guard baseline detection mechanism.

### Validation and Installation Limitations

- `agy plugin validate` (and `--strict`) reports 5 validation errors from root `agents/` because it attempts to parse the Claude-format files. This is a known harmless limitation; `agy plugin install` succeeds.
- Generated `agy-agents/` are recognized (`components.agents` = 5 in `agy plugin validate . --json`).
- Because `agy plugin install` copies the repository tree into its cache, code or agent changes require uninstalling and reinstalling the plugin (`agy plugin uninstall imagine` followed by `agy plugin install .`), then `npm install` in `~/.gemini/config/plugins/imagine`.

### Unverified Aspects

The following behaviors remain unverified on Antigravity:
- Frontmatter fields `subagent: true`, `mainAgent: false`, and `model: inherit` were not probed live (`model: inherit` deliberately drops the `sonnet` model tier from the Claude source).
- Prompt text alignment: generated agent markdown bodies still instruct the agent using Claude tool names (e.g. `Read`, `Glob`, `Grep`), so how models interpret these on Antigravity is unknown.
- Cross-host isolation: whether other hosts ignore root `agents.json`.

## Stage 8b (scene-builder) and the Kit Guard Model

Stage 8b on Antigravity is gated by `host/check-stage.mjs`, which returns `ok` with `isolation: "kit-guard"` since the maintainer's live run was recorded in `docs/harnesses/evidence/antigravity-8b-run.md`. The skill rule still applies: dispatch scene-builder only when check-stage returns ok, and never run it inline.

### 1. What the Kit Guard Is

- `stage-shot` records a baseline hash of the protected project state at `stage/guard/<id>.json` and returns `guard_digest`.
- `promote-shot` refuses (`HARD-SHADOW-ONLY`) if the protected state changed, and refuses without a baseline.
- Passing `--guard-digest` detects a rewritten baseline only while the main agent still holds the digest in memory (this protection is lost after context compaction).
- `--rebaseline` is permitted only for changes the user intentionally made or approved and was explicitly informed about.

### 2. What It Detects

- Changes, creations, and deletions in canon, plan inputs, and media files.
- The own shot's composition written straight into `edit/compositions/` bypassing the shadow directory.

### 3. What It Does NOT Do

The kit guard is strictly detective; it does not claim to prevent any action:
- **Does not prevent writes**: an untrusted agent can write anywhere the process has OS permissions to write.
- **No restore**: it reports violations upon promotion; it does not revert files, and a project outside git has no restore mechanism.
- **Limited scope**: does not cover other shots' promoted compositions, `edit/index.motion.json`, or overall project state (including gate approvals).
- **Baseline tampering evasion**: an agent that rewrites both a protected file AND the baseline file evades detection unless `--guard-digest` is passed and still held by the caller.
- **No exfiltration detection**: writes outside the project folder, reads, and exfiltration are not detected.
- **Unpromoted shots ignored**: violations caused by a shot that is abandoned or never promoted are never evaluated.
- **Cross-shadow writes undetected**: agent A writing into another shot's shadow (`stage/edit/B/`) is not detected.
- **Claude Code hook distinction**: Claude Code's PreToolUse hook is the only preventive layer in the repository.

### 4. Commands That Trip the Guard

Kit tests verify that the guard trips if any of the following commands modify protected state while a shot is staged:
- Tripping commands: `img`, `tts`, `patch apply`, `gate`, and `export-hf` (when its inputs changed).
- Non-tripping commands (read-only or non-protected state): `status`, `qc`, `render --draft`.

### 5. Why Not a Host-Native Mechanism on Antigravity

Extensive testing on Antigravity showed that a host-native preventive mechanism is currently unavailable (see discussions and evidence in issue #19):
- **Hook payload has no agent identity**: hooks cannot distinguish main-agent operations from subagent operations.
- **`invoke_subagent` Workspace restrictions**: `Workspace` accepts only `inherit|branch|share`, not an arbitrary directory path.
- **CWD scoping**: a workspace hook fires only when a session's current working directory is the shadow directory.
- **Guard bypass**: interpreter indirection (`python3 -c`) and filesystem hardlinks bypassed tested path guards.
- **Sandbox boundaries**: `agy --sandbox` did not confine file writes to a subfolder when tested inside a git worktree (non-git projects were not tested).
- **Allowlist failure**: the `tools:` frontmatter allowlist is not an enforced security restriction.
- **Fail-open behavior**: a malformed or unrecognized `hooks.json` fails open.

### 6. Current Status

Stage 8b runs on Antigravity through the kit-guard path. Isolation is detective only (see section 3).

`node host/check-stage.mjs --host antigravity --stage scene-builder`:
```json
{"ok":true,"status":"ok","host":"antigravity","stage":"scene-builder","isolation":"kit-guard","coverage":"detective; detects changes to canon, plan inputs and media after stage-shot; does not prevent writes","reason":null}
```

## Manual Evidence-Run Procedure

This procedure was used to unlock Stage 8b on Antigravity. The run is recorded in `docs/harnesses/evidence/antigravity-8b-run.md`. Keep it for re-verifying after a major agy or kit change.

1. Reinstall the plugin from the local checkout:
   ```bash
   agy plugin uninstall imagine
   agy plugin install <path-to-checkout>
   (cd ~/.gemini/config/plugins/imagine && npm install)
   ```
2. No telemetry export is needed (see Telemetry).
3. Prepare a non-git project that has progressed to the point where `stage-shot` can be executed.
4. Stage a shot and record the returned `guard_digest`:
   ```bash
   node packages/imagine-kit/bin/imagine-kit.mjs stage-shot <id>
   ```
   Note the `guard_digest` output.
5. Run the `scene-builder` agent on Antigravity for that shot (via `agy --agent scene-builder` with the shadow brief, or via `invoke_subagent`).
6. Perform validation checks:
   - **(a) Positive promotion test**:
     ```bash
     node packages/imagine-kit/bin/imagine-kit.mjs promote-shot <id> --guard-digest <digest>
     ```
     Verify that the command succeeds.
   - **(b) Negative tamper test**:
     Stage another shot (`stage-shot <id2>`), modify `bible.yaml`, and run `promote-shot`. Verify that it refuses with `HARD-SHADOW-ONLY` and identifies `bible.yaml`. Revert `bible.yaml` and verify promotion succeeds.
   - **(c) Negative direct target write test**:
     Write `edit/compositions/<id>.html` directly outside the shadow. Run `promote-shot <id> --guard-digest <digest>`. Verify that promotion refuses.
7. Record environment versions (`agy --version`, `node --version`), exact commands, and raw console outputs in:
   `docs/harnesses/evidence/antigravity-8b-run.md`
   *(Do NOT create this file in advance; `checkStage` treats the existence of this file as verification proof).*

## Flip Procedure (Maintainer Follow-On)

Done after the live run recorded in `docs/harnesses/evidence/antigravity-8b-run.md`. The flip consisted of:
1. In `host/capabilities.mjs`, update the `HOSTS["antigravity"]` object:
   - Set `subagents: "VERIFIED-RUN"`.
   - Set `kit_guard_run: "docs/harnesses/evidence/antigravity-8b-run.md"`.
2. Update characterization tests in `tests/portability/host-capabilities.test.mjs` and `tests/portability/antigravity-manifest.test.mjs` to assert `checkStage` returns `status: "ok"` with `isolation: "kit-guard"`.
3. Run the full test suite to confirm all checks pass.

## Verified / Unverified Status

| Capability / Surface | Status | Notes |
|---|---|---|
| Manifest packaging (`.antigravity-plugin/plugin.json`) | Landed (unverified) | Modeled after superpowers reference manifest |
| Live plugin installation | Verified for the 6 skills; agents-after-install Unverified | Observed on agy 1.5.3 (macOS) at commit 0563af4: `agy plugin install <local checkout>` reported "skills: 6 installed" and nothing for agents; `agy plugin list --json` listed the 6 skills and no agents; install copies repository tree to `~/.gemini/config/plugins/imagine` without `node_modules`, so `npm install` must run there afterwards (maintainer-observed: `imagine-kit status` fails with `Cannot find package 'yaml'` otherwise). The `agy-agents/` + `agents.json` agents are recognized by `agy plugin validate . --json` (`components.agents` = 5) but an install that includes them has NOT been observed yet |
| Skill discovery | Verified on agy 1.5.3 (macOS) | 6 skills installed (imagine, imagine-canon, imagine-deliver, imagine-edit, imagine-generate, imagine-plan) and listed via `agy plugin list --json` |
| Tool execution | Unverified | Untested against live Antigravity harness |
| Subagent dispatch | Verified on agy 1.5.3 (macOS) | `invoke_subagent` dispatched storyboard-artist, previz-designer, fx-designer, continuity-reviewer and scene-builder in a live run (`docs/harnesses/evidence/antigravity-8b-run.md`) |
| Kit guard (host-neutral) | Verified | Verified by host-neutral kit test suite (`packages/imagine-kit/test/guard-integration.test.mjs`) |
| Kit guard on Antigravity (live) | Verified | `stage-shot` baseline and full pipeline to G7 on agy (`docs/harnesses/evidence/antigravity-8b-run.md`); tamper checks 6(b)/6(c) covered by the kit suite, not run live |
| PreToolUse / write-scope enforcement | Unavailable | No host-native preventive mechanism exists; Stage 8b relies on the detective kit guard |
| Stage 8b (scene-builder) | ok (kit-guard) | `check-stage` returns ok with `isolation: "kit-guard"`; detective, does not prevent writes |
| Telemetry off | Not needed as a hook | Kit passes `HF_ENV` to every HyperFrames process; skills prefix direct commands. No shell export |
| Repository license | Gap | No LICENSE file exists in the repository |
