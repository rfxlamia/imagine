# Host Adapter Mapping: Claude Code

Host ID: `claude-code`

This document specifies the mapping of Imagine's portable action contract to the Claude Code platform (Claude Code 2.1.314+). Empirical evidence, platform facts, and verified deviations are recorded in `docs/contracts/claude-code-platform.md`.

## 1. Plugin root and kit discovery

- **Discovery mechanisms**:
  - Skill execution context: `${CLAUDE_SKILL_DIR}/../..`
  - Plugin hooks context: `${CLAUDE_PLUGIN_ROOT}`
  - Environment variable fallback: `env.CLAUDE_PLUGIN_ROOT` is a protocol candidate (`imagine-root/1`, section 4 of `harness-portability.md`), not a verified Claude Code behavior
- **Kit invocation**:
  ```bash
  node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...
  ```
- **Session project root anchor**: `CLAUDE_PROJECT_DIR` is provided by Claude Code to plugin hooks, fixing the session start directory even when child processes change working directories (`VERIFIED-RUN`).

## 2. Portable action mapping

The twelve portable actions defined in Section 5 of `docs/contracts/harness-portability.md` map to native Claude Code primitives as follows:

| Action | Claude Code Mechanism | Evidence / Source |
|---|---|---|
| 1. Load skill | Automatic skill directory loading (`skills/imagine-*/SKILL.md`) via `--plugin-dir` or installed plugin manifest (`.claude-plugin/plugin.json`). | UNKNOWN (not covered by claude-code-platform.md) |
| 2. Load reference | Native `Read` tool on absolute or project paths under `skills/imagine-*/references/` or `docs/contracts/`. | UNKNOWN (not covered by claude-code-platform.md) |
| 3. Read | Native `Read` tool. | UNKNOWN (not covered by claude-code-platform.md) |
| 4. Search | Native `Glob` (directory listing) and `Grep` (content search) tools. | UNKNOWN (not covered by claude-code-platform.md) |
| 5. Edit/write | Native `Write`, `Edit`, and `MultiEdit` tools. Main agent writes project files; `scene-builder` writes are filtered by PreToolUse hook. | UNKNOWN (not covered by claude-code-platform.md) |
| 6. Run process | Native `Bash` tool. | UNKNOWN (not covered by claude-code-platform.md) |
| 7. Dispatch planning agent | Native `Agent` tool (alias `Task`) with `subagent_type: "imagine:<agent>"` (`imagine:storyboard-artist`, `imagine:previz-designer`, `imagine:fx-designer`). | `claude-code-platform.md` D8 and `Agent` dispatch fact (`VERIFIED-RUN`) |
| 8. Dispatch review agent | Native `Agent` tool with `subagent_type: "imagine:continuity-reviewer"`. | `claude-code-platform.md` `Agent` dispatch fact (`VERIFIED-RUN`) |
| 9. Dispatch scene agent | Native `Agent` tool with `subagent_type: "imagine:scene-builder"`, constrained by `hooks/scene-builder-scope.mjs`. | `claude-code-platform.md` D8 and `Agent` dispatch fact (`VERIFIED-RUN`) |
| 10. Return patch | Native `SubagentHandback` tool call. | `claude-code-platform.md` `SubagentHandback` fact (`VERIFIED-RUN`) |
| 11. Recover after compaction | Main-agent prompt execution: instruction-driven reread of all stage mandatory files (`PROC-BRIEF-START`) and state refresh via `imagine-kit status`. | `skills/imagine/SKILL.md` Section 3 |
| 12. Report error or BLOCKED | Output to user interface and appending failure entry to `journal.md` (`PROC-JOURNAL`, `CAP-BLOCKED-STOP`). | `docs/contracts/rules.yaml` |

## 3. Hook architecture and safety enforcement

- **Hook configuration**: Declared in `hooks/hooks.json` using exec-form commands with `${CLAUDE_PLUGIN_ROOT}` arguments.
- **SessionStart**: Executes `hooks/session-env.mjs`, appending `export HYPERFRAMES_NO_TELEMETRY=1` to the file indicated by `CLAUDE_ENV_FILE` (`VERIFIED-RUN`).
- **PreToolUse**: Executes `hooks/scene-builder-scope.mjs` with matcher `*` and `"onFailure": "block"` (`VERIFIED-DOC`).
- **Error handling**: Exit code 2 blocking semantics are `VERIFIED-DOC` per the platform file; the repo hook entry exiting 2 on a load or parse failure is `VERIFIED-TEST`.
- **Corroboration**: Stage check corroborates Claude Code execution environment via `CLAUDECODE=1` in `process.env`.
