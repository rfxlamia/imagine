# Host Adapter Mapping: Codex

Host ID: `codex`.

Codex uses the same six stage skills and canonical `agents/*.md` sources. The adapter reads agent bodies at dispatch time; it does not register personal native agents or duplicate agent files. Install with the [Codex guide](../../harnesses/codex-install.md).

## Supported transport

The initial adapter is limited to macOS arm64 and Codex CLI 0.169.0. Other platforms/versions fail as BLOCKED. The installed plugin needs its root npm dependencies and an existing OpenAI Codex `auth.json` in the caller's `CODEX_HOME` (default `~/.codex`). Keychain-only authentication and custom provider configuration are not supported by this isolated worker. Do not silently switch providers or models to make it run.

Resolve the installed plugin root using `host/plugin-root.mjs` and the active skill directory. Read stage sources in the current main-agent context and embed the required full contents, scoped hashes, base revision and brief_hash in the dispatch brief. Write that brief to a regular file. The main agent then invokes:

```bash
node "<R>/host/codex-worker.mjs" --role storyboard-artist --project "<absolute-project>" --brief "<brief-file>" --provider openai --model "<current-main-model>" --reasoning-effort "<current-main-effort>"
```

These are adapter arguments, not new imagine-kit commands or flags. Optional `--timeout-ms` defaults to 300000 and accepts 1–3600000. Pass the main agent's actual current provider, model and effort. Only provider `openai` is supported; do not pass that value for a main session using another provider. No Claude model tier is substituted.

| Portable action | Codex mapping | Evidence boundary |
| --- | --- | --- |
| Load skill/reference | Read installed canonical skill/reference | Six-skill discovery observed |
| Read/search | Read/search-only shell commands inside read-only worker | Source reading and local write denials observed |
| Dispatch planning | `codex-worker.mjs` with storyboard-artist, previz-designer or fx-designer | Storyboard handoff observed; other two need workflow runs |
| Dispatch review | Same launcher with continuity-reviewer | Transport available; review workflow unverified |
| Return patch/findings | Launcher JSON `output` contains verbatim worker response | Storyboard patch handoff observed |
| Apply planning patch | Main saves output in stage directory and calls existing `patch apply` | Stale rejection and positive apply observed |
| Dispatch scene | Same launcher with scene-builder and parent-held kit guard digest | Real staged build, lint and promotion; detective guard, no verified hook |
| Recover/error | Reread stage sources; use recorded kit state and launcher JSON | No automatic approval, repair or fallback |

## Planning and review worker boundaries

The launcher creates a private temporary Codex home and links only existing authentication. It pins canonical developer instructions, model/effort, read-only sandbox and disabled apps/plugins/hooks/generation/goals/delegation through CLI overrides. It rejects project `.codex/config.toml` and `.codex/hooks.json` layers in the project ancestry before dispatch. The normal home is excluded from this project scan because its user configuration is replaced by the private CODEX_HOME. Untrusted trust overrides are additional defense, not proof of project-layer suppression: the tested client's app-server still loaded a hostile project layer in an initial probe. Its mcp list command also omitted that project server, so it is not sufficient alone. After the project-layer rejection, an MCP preflight uses the same executable, cwd, environment and overrides; active or unrecognized server records block dispatch. Normal user config, provider definitions, personal agents and project MCP configuration are not copied. If config layers can change concurrently during dispatch, this pilot does not establish a race-proof boundary; do not claim one.

The pinned worker configuration's effective inventory was checked in the recorded storyboard spike. Worker instructions also require enumeration and rejection of unexpected tools. This instruction is not a programmatic security check before each tool call. Local writes are enforced by the sandbox; external capability restrictions depend on the tested client/configuration. User-level skills/account context can remain visible. Do not claim general data-read isolation or support for all clients.

Process timeout and SIGINT/SIGTERM terminate the worker process group. Cleanup removes only the dispatch's private home and its authentication symlink; it preserves source credentials. Abrupt OS termination such as SIGKILL cannot run cleanup. The launcher does not write the project, stage a patch, approve a gate, promote shots or repair output.

## Parent handoff

Exit 0 means a proposed response, not approval. Read the JSON envelope and save `output` verbatim. Patch-role output must pass its role/schema envelope check; findings are returned as text. Semantic checks and source re-verification remain the parent's and kit's responsibility. Check protected hashes before/after dispatch and apply with the existing kit; a stale or invalid response requires a new dispatch, never silent edits or force application.

Exit 3 is BLOCKED; exit 2 is adapter CLI usage failure. Missing CLI/authentication, unverified version/platform, active MCP, timeout, process failure, missing/empty output and invalid patch envelopes block. A returned `status: blocked` is preserved for the parent. Setup, output and processing failures must not become a fabricated successful proposal.

## Scene transport and kit guard

Before production dispatch, run `host/check-stage.mjs --host codex --stage scene-builder` and require `status: ok` with `isolation: kit-guard`. The main agent runs the existing `stage-shot <id>` and retains its original `data.guard_digest` in parent context. Never place that digest in the child brief or a worker-readable file. Read the canonical scene-builder contract and prepare its full required dispatch, including verified input hashes, exact shot identity, shadow root and `brief_hash`. Inspect the generated preview host against the supplied runtime contract; correcting that main-owned host is the parent's responsibility before dispatch.

Provision the pinned runtime in the shot's cache from the main process, which may need network access:

```bash
HYPERFRAMES_NO_TELEMETRY=1 npx --cache "<absolute-project>/stage/edit/s01/.npm-cache" --yes hyperframes@0.8.223 --version
```

Require version `0.8.223`. The scene worker pins `npm_config_offline=true` and `npm_config_cache` to that shadow's `.npm-cache`. The shared home cache was unusable in the tested sandbox; a missing/incomplete shadow cache blocks mandatory lint. The adapter does not install or upgrade dependencies automatically.

```bash
node "<R>/host/codex-worker.mjs" --role scene-builder --project "<absolute-project>" --brief "<brief-file>" --provider openai --model "<current-main-model>" --reasoning-effort "<current-main-effort>" --shot-id s01 --brief-hash "<dispatched-brief-hash>" --guard-digest "<original-parent-held-digest>"
```

The scene arguments are required only for scene-builder and rejected for read-only roles. The launcher validates `sNN`, the resolved shadow directory, the original baseline identity/digest, and the protected snapshot. Its child runs from that shadow under `workspace-write`; planning/review workers retain `read-only`. Configuration/hook scanning starts at the shadow and covers its ancestry. The same disabled apps/plugins/hooks/MCP and cleanup constraints apply. The canonical body is loaded unchanged, preceded by an explicit Codex mapping: reads/searches use read-only shell calls, Write/Edit use `apply_patch`, and canonical Bash permits only the pinned HyperFrames operations. The canonical claim of hook enforcement is superseded by this host mapping. These command restrictions are instructions, not a shell allowlist.

After the child exits, the launcher rechecks the original guard digest and protected snapshot. A proposed scene response must be an unfenced YAML mapping matching `shot_id`, `shadow_root` and `brief_hash`, with existing in-shadow artifacts including its composition and a clean lint report from 1–3 attempts. This validates the handoff envelope, not the truth of arbitrary prose. The parent inspects actual lint evidence, reviews the staged result, and invokes existing `promote-shot <id> --guard-digest <original-parent-held-digest>`. Promotion independently runs pinned lint and checks the guard again. A blocked/failed handoff is never promoted automatically. Restore unauthorized changes before retrying; never rebaseline merely to clear a worker violation.

Kit guard detects protected-file changes when checked; it does not prevent or undo writes. It intentionally excludes project state, journal, live root motion, other-shot compositions, all shadow workspaces, guard storage and runtime/output paths. See the complete `EXCLUSIONS` in `packages/imagine-kit/src/edit/guard.mjs`. A shadow cwd and workspace sandbox do not establish a universal per-file boundary, especially for runtime temporary/cache paths. Do not claim that all writes outside the assigned shadow are detected or prevented. The parent-held digest detects baseline rewriting even when the rewritten baseline matches tampered sources.

Runtime evidence: [storyboard integration and packaging](../../harnesses/evidence/codex-readonly-worker-run.md) and [scene/kit guard verification](../../harnesses/evidence/codex-8b-run.md). `HOSTS.codex.subagents` records verified subprocess dispatch; `kit_guard_run` supplies the scene path. Hook capabilities remain UNKNOWN. Storyboard and one synthetic scene have real workflow evidence; previz, fx and continuity workflows and a complete G0–G7 run remain unverified.
