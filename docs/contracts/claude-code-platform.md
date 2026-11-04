# Claude Code platform facts (verified 2026-10-31)

Claude Code 2.1.314. Probe plugin: throwaway `imagine` plugin in a temp dir outside the repo (manifest `name` + `version` only, exec-form PreToolUse `Write` hook that appends its stdin to a log, and `agents/scene-builder.md`).

## Status and ISOLATION_FLAGS

**ISOLATION_FLAGS (ACCEPTED 2026-10-31):** `--setting-sources project,local --strict-mcp-config`

**Base command (same for every run):** `claude -p "<prompt>" --model claude-haiku-5-5 --plugin-dir <P> --permission-mode acceptEdits --output-format stream-json --verbose --include-hook-events` with stdin `< /dev/null`.

The proposed set removes every user-owned plugin, skill, agent, MCP server, SessionStart hook and CLAUDE.md effect, and the plugin hook still fires. It does **not** meet the literal acceptance test "plugins lists only `imagine`": the init event still lists three builtin plugins (`cc-plugin-agents-md`, `cc-plugin-telemetry`, `cc-plugin-plugin-authoring`, `path: builtin`). See D5. Controller decision: the three builtin plugins (`path: "builtin"`) ship with Claude Code itself, not with the user's configuration, so they are accepted. The isolation acceptance test is restated as: init `plugins` lists `imagine` plus only `path: "builtin"` entries, `mcp_servers` is empty, no user SessionStart hook output appears, and the user's CLAUDE.md has no effect. Fixtures must not contain an `AGENTS.md` (the builtin `cc-plugin-agents-md` may load it).

## Deviations

- **D1 (VERIFIED-DOC, not exercised):** Hook failure semantics. `"onFailure": "block"` (v2.1.295+, installed 2.1.314) makes a crash, timeout or can't-start block. Without it, those are non-blocking. Task 2 `hooks/hooks.json` should set `onFailure: "block"`.
- **D2 (VERIFIED-RUN):** Exec form (`command` + `args`) works with `${CLAUDE_PLUGIN_ROOT}` inside `args`. Use exec form in Task 2.
- **D3 (VERIFIED-DOC for the default):** `claude -p` starts in Manual permission mode (v2.1.302+). The probe passed `--permission-mode acceptEdits` and the Write ran. Behaviour without the flag was not tested.
- **D4 (UNRESOLVED):** `--bare` cannot be used for this spike. Run B returned `Not logged in · Please run /login`: `--bare` reads only `ANTHROPIC_API_KEY` or `apiKeyHelper`, not OAuth. Its init still listed every user plugin. The plugin hook did not fire, but the run died before any tool call, so "does `--bare` fire `--plugin-dir` hooks" remains UNVERIFIED.
- **D5 (blocks the literal AC):** Builtin plugins are always listed in init `plugins` (`path: "builtin"`): `cc-plugin-agents-md`, `cc-plugin-telemetry`, `cc-plugin-plugin-authoring`. They appear in run A, run C (fresh `CLAUDE_CONFIG_DIR`) and the safe-mode diagnostic. No tested flag removed them.
- **D6:** Candidate C (`CLAUDE_CONFIG_DIR` set to a fresh empty dir) fails with `Not logged in · Please run /login`. A fresh config dir does not carry the login. Per the brief, C was not retried, no login was attempted and no credentials were copied.
- **D7:** `--safe-mode` is unusable. It still loaded every user plugin in init, and the plugin hook did not fire (the probe `Write` ran but the hook log stayed empty). `--plugin-dir` is not exempt from safe-mode.
- **D8:** Dispatch tool name. Init `tools` lists `Task`, but the actual subagent dispatch tool_use was named `Agent`. Both names exist; `Task` is documented as an alias.
- **Step 5 trigger (controller action):** The brief's stop condition fires. Task 2 `hooks/hooks.json` must use exec form plus `"onFailure": "block"` (D1, D2). The plan was not edited, per the rules. The `agent_type` format matched the WP0 assumption (`imagine:scene-builder`).

## Facts

| Fact | Value | Source | Status |
|---|---|---|---|
| Manifest path | `.claude-plugin/plugin.json` at plugin root | plugins-reference.md "Manifest file" | VERIFIED-DOC |
| Manifest required fields | Only `name` (kebab-case); `version` string; `author` needs `name` if present | plugins-reference.md "Fields" | VERIFIED-DOC |
| Manifest with `name` + `version` only loads | init `plugins`: `{name: "imagine", version: "0.0.0", source: "imagine@inline"}` | Run A init event | VERIFIED-RUN |
| Hooks file | `hooks/hooks.json`, event map wrapped in top-level `"hooks"` | hooks.md; plugins-reference.md "hooks" | VERIFIED-DOC |
| Hook shape (exec form) | `{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/hooks/log.mjs"]}` inside `PreToolUse[].hooks[]` with `"matcher":"Write"` | hooks.md "exec-form and shell-form"; Run A hook fired | VERIFIED-RUN |
| `${CLAUDE_PLUGIN_ROOT}` | Expands to installed plugin root (here `/private/tmp/claude-501/probe-plugin.hARe`), also in exec `args` | plugins-reference.md "Environment variables"; Run A hook log | VERIFIED-RUN |
| PreToolUse stdin, common keys (main thread) | `session_id, transcript_path, cwd, scratchpad_dir, prompt_id, permission_mode, effort, hook_event_name, tool_name, tool_input, tool_use_id` | Run A hook log | VERIFIED-RUN |
| `tool_input.file_path` | Present for `Write` (absolute path) | Run A hook log | VERIFIED-RUN |
| `tool_input.command` | Shape only; `Bash` not exercised | hooks.md "Hook input" | VERIFIED-DOC |
| `cwd` | Present (main thread, run A) | Run A hook log | VERIFIED-RUN |
| `agent_id` / `agent_type` (main thread) | Absent | Run A hook log (no such keys) | VERIFIED-RUN |
| `agent_id` / `agent_type` (inside subagent) | Both present; `agent_id` e.g. `a48ee51fefbcb4979` | Run E hook log | VERIFIED-RUN |
| Plugin agent `agent_type` string | `imagine:scene-builder` (plugin `imagine`, agent from `agents/scene-builder.md` frontmatter `name: scene-builder`) | Run E hook log; init `agents` lists `imagine:scene-builder` | VERIFIED-RUN |
| Subagent dispatch tool | tool_use name `Agent` with `subagent_type: "imagine:scene-builder"`; init `tools` lists `Task` (alias) | Run E stream | VERIFIED-RUN |
| Deny output shape | stdout JSON `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<text>"}}`, exit 0. Decisions: allow / deny / ask / defer (deny shape not exercised) | hooks.md "PreToolUse"; permissions.md "Precedence among rules, hooks, and mods" | VERIFIED-DOC |
| Exit code 0 | Apply JSON output (not exercised) | hooks.md "Exit code output" | VERIFIED-DOC |
| Exit code 2 | Blocking error; PreToolUse call blocked, reason from stderr (not exercised) | hooks.md "Exit code output" | VERIFIED-DOC |
| Other non-zero / can't start / timeout (600 s default) | Non-blocking; action proceeds, unless `"onFailure": "block"` (v2.1.295+) (not exercised) | hooks.md "Exit code output", "onFailure" | VERIFIED-DOC |
| Signal-kill exit status | Not known | none | UNVERIFIED |
| SessionStart env (`CLAUDE_ENV_FILE`) | A SessionStart hook appends `export` lines to the file at `CLAUDE_ENV_FILE`; Claude Code runs that file before each later Bash command of the session. `hooks/session-env.mjs` writes `export HYPERFRAMES_NO_TELEMETRY=1` (imagine-z8p.8) so scene-builder's bare `npx hyperframes@0.8.223` commands run with telemetry off | hooks.md "Persist environment variables"; env-vars.md `CLAUDE_ENV_FILE` | VERIFIED-DOC |
| Plugin SessionStart hook gets `CLAUDE_ENV_FILE` | 2026-11-04 `claude -p --plugin-dir <repo>` (haiku, `--setting-sources project,local --strict-mcp-config`): `SessionStart:startup` hook_response exit 0, empty stdout and stderr; `session-env.mjs` exits 1 when the variable is unset, so the file was provided and written | stream-json hook events | VERIFIED-RUN |
| `CLAUDE_ENV_FILE` reaches subagent Bash | 2026-11-04 WP8 slice session (interactive, Claude Code 2.1.318, plugin pin bb42347): a general-purpose haiku subagent ran `printenv HYPERFRAMES_NO_TELEMETRY; echo exit=$?` and got `1` / `exit=0` | `tests/slice/evidence/env-telemetry.txt` | VERIFIED-RUN |
| Subagent report channel | 2.1.318 subagents return their final report through a tool call named `SubagentHandback`, which reaches PreToolUse hooks like any tool; a default-deny agent hook must allow it (imagine-z8p.6.9, fixed in bb42347) | WP8 slice transcript; `tests/slice/evidence/ac17-hook.final.txt` | VERIFIED-RUN |
| Isolated interactive session | `--setting-sources project,local` does not stop `~/.claude/CLAUDE.md` and `~/.claude/rules` loading, and `--strict-mcp-config` does not drop claude.ai connectors. WP8 adds `CLAUDE_CONFIG_DIR=<fresh dir>`, `ENABLE_CLAUDEAI_MCP_SERVERS=false`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`; transcripts then land under `<fresh dir>/projects/` | `tests/slice/evidence/isolation-interactive.txt` (imagine-z8p.6.8) | VERIFIED-RUN |
| `-p` | Headless print mode; runs succeeded | `claude --help`; cli-reference.md | VERIFIED-RUN |
| `--plugin-dir <path>` | Loads plugin for session; its hooks fire | `claude --help` line 163; Run A | VERIFIED-RUN |
| `--model claude-haiku-5-5` | init `model: "claude-haiku-5-5"` | `claude --help` line 135; Run A init | VERIFIED-RUN |
| `--output-format stream-json` | Emits `system/init`, hook events, `assistant`, `result` | `claude --help` line 146; Run A | VERIFIED-RUN |
| `--verbose` | Accepted and used; whether stream-json requires it is untested | `claude --help` line 260; Run A | VERIFIED-RUN |
| `--include-hook-events` | Streams `hook_started` / `hook_response` for PreToolUse; baseline also streams SessionStart:startup | `claude --help` line 117; Run A and baseline streams | VERIFIED-RUN |
| `--permission-mode acceptEdits` | `Write` runs without prompt; PreToolUse plugin hook still fires; init `permissionMode: "acceptEdits"` | `claude --help` line 151; Run A | VERIFIED-RUN |
| Isolation: user plugins excluded | `--setting-sources project,local` removes pocketto, caveman, etc. from init `plugins` (baseline lists 15 plugins, A lists imagine plus 3 builtins) | Run A init; baseline init | VERIFIED-RUN |
| Isolation: builtin plugins | `cc-plugin-agents-md`, `cc-plugin-telemetry`, `cc-plugin-plugin-authoring` still listed, `path: builtin`. Literal AC "only imagine" fails (D5) | Run A, C, safe-mode init | VERIFIED-RUN |
| Isolation: MCP servers | `mcp_servers: []` with the proposed flags; baseline lists 8 user and claude.ai servers | Run A init; baseline init | VERIFIED-RUN |
| Isolation: user SessionStart output | None with the proposed flags (only PreToolUse events in stream); baseline shows `SessionStart:startup` x8 | Run A stream; baseline stream | VERIFIED-RUN |
| Isolation: user skills and commands | init `skills` / `slash_commands` contain only built-ins with the proposed flags (no caveman:*, pocketto:*) | Run A init | VERIFIED-RUN |
| Isolation: user agents | init `agents` lists only builtins (plus `imagine:scene-builder` in run E) | Run A, E init | VERIFIED-RUN |
| Isolation: user CLAUDE.md not loaded | With the proposed flags the model answers "No"; the baseline with no isolation answers "Yes" and cites the user's global CLAUDE.md. This is an answer-based control, not a direct dump | Run A and baseline `assistant` text | VERIFIED-RUN |
| Isolation: auto-memory path | With the proposed flags `memory_paths.auto` = `~/.claude/projects/<probe-cwd-slug>/memory/` (a per-cwd dir, not the user's project memory) | Run A init | VERIFIED-RUN |
| Isolation: transcripts | Still written under `~/.claude/projects/` (`transcript_path` in hook input) | Run A hook log | VERIFIED-RUN |
| Isolation: `--bare` | Fails on auth (`Not logged in`); user plugins still listed; hook not observed (D4) | Run B | UNVERIFIED |
| Isolation: `--safe-mode` | Unusable: user plugins loaded, plugin hook did not fire (D7) | Diagnostic run | VERIFIED-RUN |
| Isolation: fresh `CLAUDE_CONFIG_DIR` | Unusable: `Not logged in` (D6) | Run C | VERIFIED-RUN |

## Init-event evidence

Full streams: `/private/tmp/claude-501/probe-A/stream.jsonl`, `probe-B`, `probe-C`, `probe-A-subagent`, `diag-safemode`, `probe-baseline`.

- **A (proposed)** `--setting-sources project,local --strict-mcp-config`: `plugins = [imagine, cc-plugin-agents-md, cc-plugin-telemetry, cc-plugin-plugin-authoring]`, `mcp_servers = []`, `skills` and `slash_commands` built-in only. Plugin hook fired once on main-thread Write. probe.txt contains `ok`. Answer "No". Fails literal "only imagine" (D5).
- **Baseline (control, no isolation flags)**: `plugins` lists 15 entries (imagine, pocketto, frontend-design, caveman, searchfit-seo, i-have-adhd, brag, foreman, warp, skillkit, beads-superpowers, cowork-plugin-management and the three builtins). `mcp_servers` lists 8 (context7, tavily, agentpair, rea, wonder and three claude.ai connectors). SessionStart:startup fired 8 times. Plugin hook fired once. Answer "Yes", citing the user's global CLAUDE.md.
- **B** `--bare`: `plugins` still lists user plugins. Result `Not logged in · Please run /login`. No tool call, no hook. Rejected (D4).
- **C** A plus `CLAUDE_CONFIG_DIR=<fresh empty dir>`: `plugins = [imagine, cc-plugin-agents-md, cc-plugin-telemetry, cc-plugin-plugin-authoring]`, `mcp_servers = []`. Result `Not logged in · Please run /login`. Stopped per brief (D6).
- **Safe-mode (diagnostic, not a candidate)**: `plugins` still lists all user plugins and builtins; plugin hook did not fire (D7).

## Notes for Task 3

- Redirect stdin with `< /dev/null`. Without it the CLI waits 3 s and prints a warning on stderr.
- Subagent file writes went to the session scratchpad, not the cwd (the model chose the scratchpad). Give absolute target paths in the spike prompt.
- Isolation does not hide transcripts; they still land under `~/.claude/projects/`.
