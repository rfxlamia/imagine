# Host Adapter Mapping: Grok

Host ID: `grok`

This document specifies the adapter mapping and verified boundaries for the Grok platform.

## 1. Tool name translation

The module `hooks/scene-builder-scope-grok.mjs` translates native Grok tool invocations into the canonical tool names expected by `hooks/scene-builder-scope-lib.mjs` (`decide`):

| Grok Tool Name | Canonical Tool Name | Evidence Status |
|---|---|---|
| `read_file` | `Read` | `VERIFIED-TEST` |
| `grep` | `Grep` | `VERIFIED-TEST` |
| `list_dir` | `Glob` | `VERIFIED-TEST` |
| `search_replace` | `Edit` | `VERIFIED-TEST` |
| `hashline_edit` | `Edit` | `VERIFIED-TEST` |
| `write` | `Write` | `VERIFIED-TEST` |
| `run_terminal_command` | `Bash` | `VERIFIED-TEST` |

## 2. Hook interface and input rewriting

- **Activation**: Entry points `hooks/scene-builder-scope.mjs` and `hooks/session-env.mjs` inspect `process.env.GROK_HOOK_EVENT`.
- **Payload parsing**: Accommodates camelCase keys (`subagentType`, `toolName`, `toolInput`) and snake_case keys (`agent_type`, `tool_name`, `tool_input`).
- **Truncation detection**: An input payload with `toolInputTruncated === true` is immediately denied (`VERIFIED-TEST`).
- **Telemetry command rewriting**: The Grok adapter strips and reattaches the prefix (`VERIFIED-TEST`). Whether Grok sources `CLAUDE_ENV_FILE` is `UNKNOWN`.

## 3. Runtime capability status

All interactive runtime capabilities for Grok remain unverified in real host sessions:

| Action / Capability | Status | Notes |
|---|---|---|
| Skill loading | `UNKNOWN` | No host session evidence |
| Plugin root discovery | `UNKNOWN` | No host session evidence |
| Subagent dispatch | `UNKNOWN` | No host session evidence |
| Per-agent tool allowlist | `UNKNOWN` | No host session evidence |
| PreToolUse execution | `UNKNOWN` | Native hook wiring unexercised |
| Hook failure behavior | `UNKNOWN` | Fail-closed behavior unexercised |
| Session env persistence | `UNKNOWN` | No host session evidence |
| Compaction / resume signal | `UNKNOWN` | No host session evidence |
| Scene-builder enforcement | `UNKNOWN` | Blocked by stage check |

Adapter checklist status: partial. Translation unit tests exist in `hooks/scene-builder-scope.grok.test.mjs` and `hooks/session-env.grok.test.mjs`; runtime probe evidence is missing, so the stage check returns `BLOCKED`.
