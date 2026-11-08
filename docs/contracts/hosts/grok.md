# Host Adapter Mapping: Grok

Host ID: `grok`

This document specifies the adapter mapping and verified boundaries for the Grok platform. Follow-on adapter hardening and runtime probe evidence are tracked in issue #24.

## 1. Tool name translation

The module `hooks/scene-builder-scope-grok.mjs` (lines 7–15) translates native Grok tool invocations into the canonical tool names expected by `hooks/scene-builder-scope-lib.mjs` (`decide`):

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

- **Activation**: Entry points `hooks/scene-builder-scope.mjs` and `hooks/session-env.mjs` inspect `process.env.GROK_HOOK_EVENT` (line 8 in each).
- **Subagent filtering and issue #24 hardening note**: In `hooks/scene-builder-scope-grok.mjs` (lines 41–42), `adapt()` checks `subagentType`:
  ```javascript
  const subagentType = input?.subagentType;
  if (!SCENE_BUILDER_TYPES.includes(subagentType)) return { decision: "pass", reason: "" };
  ```
  Because `adapt()` returns `pass` for any non-exact `subagentType` before `decide()` runs, the alias-field deny from `hooks/scene-builder-scope-lib.mjs` does not apply on the Grok path. Hardening this filtering is tracked in follow-on issue #24; Grok stays strictly `BLOCKED` by the stage check.
- **Payload parsing**: Accommodates camelCase keys (`subagentType`, `toolName`, `toolInput`) and snake_case keys (`agent_type`, `tool_name`, `tool_input`).
- **Truncation detection**: An input payload with `toolInputTruncated === true` is immediately denied with reason `"scene-builder hook input is truncated"` (lines 43–45, `VERIFIED-TEST`).
- **Telemetry command rewriting and known limits**:
  - `TELEMETRY_PREFIX` is `"HYPERFRAMES_NO_TELEMETRY=1 "` (line 17).
  - The adapter strips at most one leading prefix before calling `decide()`, and reattaches it in `updatedInput` (lines 61–68, `VERIFIED-TEST`).
  - Commands with a doubled telemetry prefix or any prefix not at the very start are denied with reason `"doubled telemetry prefix"` (lines 51–54, `VERIFIED-TEST`).
- **Error handling**: Unreadable stdin causes the hook entry to exit 2 (line 76, `VERIFIED-TEST`).

## 3. Runtime capability status

All interactive runtime capabilities for Grok remain unverified in real host sessions:

| Action / Capability | Status | Notes |
|---|---|---|
| Skill loading | `UNKNOWN` | No host session evidence |
| Plugin root discovery | `UNKNOWN` | No host session evidence |
| Subagent dispatch | `UNKNOWN` | No host session evidence |
| Per-agent tool allowlist | `UNKNOWN` | No host session evidence |
| PreToolUse execution | `UNKNOWN` | Native hook wiring unexercised in runtime session |
| Hook failure behavior | `UNKNOWN` | Fail-closed behavior unexercised in runtime session |
| Session env persistence | `UNKNOWN` | No host session evidence |
| Compaction / resume signal | `UNKNOWN` | No host session evidence |
| Scene-builder enforcement | `UNKNOWN` | Blocked by stage check (`host/check-stage.mjs`) |

Adapter checklist status: partial. Translation and input rewriting unit tests exist in `hooks/scene-builder-scope.grok.test.mjs`; runtime probe evidence is missing and hardening is pending under issue #24, so `host/check-stage.mjs --host grok --stage scene-builder` returns `BLOCKED`.
