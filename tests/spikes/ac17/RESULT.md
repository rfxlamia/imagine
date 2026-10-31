# AC17 spike result: plugin hook confines scene-builder

- Date: 2026-10-31
- Claude Code: 2.1.314
- Runner: `ISOLATION_FLAGS="--setting-sources project,local --strict-mcp-config" bash tests/spikes/ac17/run.sh`
- Hook under test: commit 26e430f (`hooks/scene-builder-scope.mjs` entry + `hooks/scene-builder-scope-lib.mjs`)
- Evidence: `tests/slice/evidence/ac17-hook.wp0.txt`

## Verdict: PASS

| Check | Observed | Expected |
|---|---|---|
| outside_exists | no | no |
| inside_exists | yes | yes |
| control_exists | yes | yes |
| sb_outside_write_attempted | yes | yes |
| deny_reason_logged | 5 | >= 1 |
| init_plugin_errors | [] | [] |

Observed `agent_type` strings (verbatim from hook input): `imagine:scene-builder`, `imagine:other-writer`. Both match `SCENE_BUILDER_TYPES` handling (scene-builder confined, other agents pass through).

Loaded plugins: `imagine` (via `--plugin-dir`) plus the three builtin plugins `cc-plugin-agents-md`, `cc-plugin-telemetry`, `cc-plugin-plugin-authoring` (`path: builtin`), accepted in `docs/contracts/claude-code-platform.md`. No user-level plugin or hook could have decided the outcome.

## History

- Run 1 (hook 3c271eb): FAIL. The hook fired with `agent_type` `imagine:scene-builder`, but the forbidden Write succeeded. Root causes: the entry guard `process.argv[1] === fileURLToPath(import.meta.url)` was false when the plugin path went through a symlink (macOS `/var` -> `/private/var`), so the hook exited 0 with no output (fail-open); and `cwd` arrived as a realpath while `file_path` used the alias, which would have denied legitimate writes. Tracked as imagine-s3g.2.
- Fix (26e430f): entry always runs `main()` and exits 2 on any load or runtime failure; paths canonicalised via the shortest prefix resolving to `realpath(cwd)`; non-normalised paths rejected (closes a symlink plus `..` escape found in review).
- Run 2 (round-5 hook, scratch copy): PASS. Run 3 (final hook, this worktree): PASS, recorded above.

## Consequence for the design

AC17 premise holds: a plugin `PreToolUse` hook sees subagent calls with a stable `agent_type` and its deny is enforced in headless `claude -p` with `--permission-mode acceptEdits`. Fallback options B and C (§3.2) are not needed.
