# Harness Portability Contract

This document defines the portability architecture for the Imagine production system. It establishes the boundary between core behavior and host adapters, specifies the root and kit resolution protocol (`imagine-root/1`), defines the portable action contract and agent packaging strategy, formalizes safety and stage check policies, and provides a host capability matrix with strict evidence accounting.

## 1. Purpose and invariants

Imagine coordinates an auditable, gated motion-graphics production workflow. All hosts share a single canonical project format and execute the identical G0–G7 creative and technical gate sequence.

### 1.1 Core invariants across all hosts

Every host adapter and environment must preserve these core invariants without exception:

1. **Verbatim user quote**: Gate approvals are valid only when accompanied by the user's verbatim words (`GATE-QUOTE`, `HARD-NON-WAIVABLE`). Synthetic, paraphrased, inferred, or agent-generated approval quotes are strictly prohibited. The CLI and ledger reject empty or missing quotes (`NEEDS_USER`).
2. **Cryptographic source hashes**: Every dependency relationship between script, canon, style, assets, composition, and renders is tracked through SHA-256 hashes (`HARD-PATCH-REVERIFY`, `HARD-STATUS-DERIVED`, `PROC-DISPATCH-GUARD`). The `imagine-kit status` command computes item staleness directly from recorded input hashes without subjective evaluation.
3. **Audit and journal rules**: Every project state transition appends an immutable entry to `journal.md` (`PROC-JOURNAL`). Main-agent semantic audits must reread `bible.yaml` and `style.md` directly from disk before evaluation (`PROC-AUDIT-REREAD`).
4. **Planning-key writer exclusivity**: The planning subagents have no filesystem write access. `STORY.md` planning keys are written exclusively through atomic, verified execution of `imagine-kit patch apply` (`PROC-LOCK-HASHED-WRITES`, `HARD-PATCH-KEYS`, `HARD-STORY-WRITERS`).
5. **Enforced scene-builder isolation**: The `scene-builder` subagent is strictly confined to writing inside its assigned shadow project directory at `.imagine/<project>/stage/edit/s<NN>/` (`HARD-SHADOW-ONLY`). Writes to any path outside that directory are denied.

### 1.2 Instruction file uniformity

There are no per-host variants or duplicates of the stage skills (`skills/imagine-*/SKILL.md`). The stage instructions are written once, define universal workflow rules, and remain host-agnostic. Host-specific mappings, environment differences, and platform mechanisms reside exclusively in host mapping documents under `docs/contracts/hosts/*.md` and within dedicated host adapter modules.

### 1.3 Non-goals

This contract explicitly excludes the following goals:
- **No adapter publication**: Adapters are internal bindings within the repository, not packages published to external registries.
- **No creative-gate redesign**: The G0–G7 gate lifecycle, signoff gates, and user interaction model remain unchanged.
- **No new backend**: Imagine does not introduce a database daemon, background service, or cloud execution platform.
- **No new kit command or flag**: The CLI contract is frozen at the 12 Phase 1 commands defined in `docs/contracts/cli-contract.md`. No new commands, subcommands, or flags are introduced for portability.

## 2. Evidence status vocabulary

Host capability claims and platform facts must use one of four standardized evidence statuses:

- `VERIFIED-RUN`: Observed and confirmed in a real host session, supported by concrete evidence (transcripts, execution logs, or probe artifacts) committed to the repository (e.g., in `tests/slice/evidence/`).
- `VERIFIED-TEST`: Proven exclusively by automated repository unit, integration, or fixture tests (e.g., `node --test` suites under `hooks/` or `packages/imagine-kit/test/`), without interactive host session validation.
- `VERIFIED-DOC`: Documented in vendor platform specifications, manuals, or official references, but not yet exercised or demonstrated within repo tests or execution runs.
- `UNKNOWN`: No empirical evidence or platform documentation has been verified in this repository. Any capability marked `UNKNOWN` is treated as unsupported, and operations requiring it must fail closed.

A status must never be upgraded without committing supporting evidence to the repository.

## 3. Coupling inventory

The repository currently exhibits couplings across path variables, tool invocations, agent frontmatter, hooks, and environment configuration. Each coupling is categorized as either `core` (essential system policy) or `adapter` (host-specific binding).

| File:Line | Coupling | Kind | Class |
|---|---|---|---|
| `skills/imagine/SKILL.md:35` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter |
| `skills/imagine/SKILL.md:119` | `R = ${CLAUDE_SKILL_DIR}/../..` plugin root anchor | path variable | adapter |
| `skills/imagine/SKILL.md:27` | Mandatory read of `claude-code-platform.md` | bootstrap or compaction | adapter |
| `skills/imagine/SKILL.md:134` | Mandatory stage read of `claude-code-platform.md` | bootstrap or compaction | adapter |
| `skills/imagine-canon/SKILL.md:32` | Mandatory read of `claude-code-platform.md` | bootstrap or compaction | adapter |
| `skills/imagine-canon/SKILL.md:40` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter |
| `skills/imagine-canon/SKILL.md:134` | `R = ${CLAUDE_SKILL_DIR}/../..` plugin root anchor | path variable | adapter |
| `skills/imagine-canon/SKILL.md:150` | Mandatory stage read of `claude-code-platform.md` | bootstrap or compaction | adapter |
| `skills/imagine-plan/SKILL.md:33` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter |
| `skills/imagine-plan/SKILL.md:99` | Mandatory stage read of `claude-code-platform.md` | bootstrap or compaction | adapter |
| `skills/imagine-generate/SKILL.md:29` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter |
| `skills/imagine-edit/SKILL.md:18` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter |
| `skills/imagine-deliver/SKILL.md:35` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter |
| `skills/imagine-deliver/SKILL.md:93` | `R = ${CLAUDE_SKILL_DIR}/../..` plugin root anchor | path variable | adapter |
| `skills/imagine-canon/references/elevenlabs-voices.md:110` | `${CLAUDE_SKILL_DIR}` external skill path reference | path variable | adapter |
| `hooks/hooks.json:9` | `${CLAUDE_PLUGIN_ROOT}/hooks/session-env.mjs` path argument | path variable | adapter |
| `hooks/hooks.json:21` | `${CLAUDE_PLUGIN_ROOT}/hooks/scene-builder-scope.mjs` path argument | path variable | adapter |
| `hooks/hooks.json:3` | `SessionStart` hook event trigger | hook event or I/O | adapter |
| `hooks/hooks.json:14` | `PreToolUse` hook event trigger with `*` matcher | hook event or I/O | adapter |
| `hooks/hooks.json:22` | `"onFailure": "block"` configuration | hook event or I/O | adapter |
| `hooks/session-env-lib.mjs:12` | `CLAUDE_ENV_FILE` environment variable read | env persistence | adapter |
| `hooks/session-env-lib.mjs:26` | `persistEnv(env.CLAUDE_ENV_FILE)` file append | env persistence | adapter |
| `hooks/scene-builder-scope-lib.mjs:219` | `CLAUDE_PROJECT_DIR` fallback session-root anchor | path variable | adapter |
| `agents/storyboard-artist.md:4` | `tools: Read, Glob, Grep` declaration | tool name | adapter |
| `agents/storyboard-artist.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter |
| `agents/previz-designer.md:4` | `tools: Read, Glob, Grep` declaration | tool name | adapter |
| `agents/previz-designer.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter |
| `agents/fx-designer.md:4` | `tools: Read, Glob, Grep` declaration | tool name | adapter |
| `agents/fx-designer.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter |
| `agents/continuity-reviewer.md:4` | `tools: Read, Glob, Grep` declaration | tool name | adapter |
| `agents/continuity-reviewer.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter |
| `agents/scene-builder.md:4` | `tools: Read, Glob, Grep, Write, Edit, Bash` declaration | tool name | adapter |
| `agents/scene-builder.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter |
| `hooks/scene-builder-scope-lib.mjs:22` | `SCENE_BUILDER_TYPES` agent type matching | agent frontmatter | adapter |
| `hooks/scene-builder-scope-lib.mjs:23` | `READ_ONLY_TOOLS` (`Read`, `Glob`, `Grep`) | tool name | adapter |
| `hooks/scene-builder-scope-lib.mjs:24` | `WRITE_TOOLS` (`Write`, `Edit`, `MultiEdit`) | tool name | adapter |
| `hooks/scene-builder-scope-lib.mjs:224` | `NotebookEdit` tool check | tool name | adapter |
| `hooks/scene-builder-scope-lib.mjs:225` | `SubagentHandback` report tool | tool name | adapter |
| `hooks/scene-builder-scope-lib.mjs:226` | `Bash` tool check | tool name | adapter |
| `hooks/scene-builder-scope-lib.mjs:245-250` | `hookSpecificOutput` / `PreToolUse` response format | hook event or I/O | adapter |
| `hooks/scene-builder-scope.mjs:8` | `GROK_HOOK_EVENT` runtime environment switch | hook event or I/O | adapter |
| `hooks/session-env.mjs:8` | `GROK_HOOK_EVENT` runtime environment switch | hook event or I/O | adapter |
| `hooks/scene-builder-scope-grok.mjs:7-15` | Grok tool name mapping table | tool name | adapter |
| `hooks/scene-builder-scope-grok.mjs:41` | `subagentType` parameter | hook event or I/O | adapter |
| `hooks/scene-builder-scope-grok.mjs:43` | `toolInputTruncated` check | hook event or I/O | adapter |
| `hooks/scene-builder-scope-grok.mjs:62` | `updatedInput` command rewrite | hook event or I/O | adapter |
| `.claude-plugin/plugin.json:1` | Claude Code plugin manifest | dependency | adapter |
| `.claude-plugin/marketplace.json:1` | Claude Code marketplace catalog | dependency | adapter |
| `docs/contracts/claude-code-platform.md:7` | `ISOLATION_FLAGS` (`--setting-sources project,local --strict-mcp-config`) | bootstrap or compaction | adapter |
| `docs/contracts/claude-code-platform.md:22` | Subagent dispatch tool name `Agent` / `Task` alias | tool name | adapter |
| `hooks/scene-builder-scope-lib.mjs:26-50` | HyperFrames CLI prefix and allowed subcommands | tool name | core |
| `hooks/scene-builder-scope-lib.mjs:54-113` | Shadow project path containment and symlink/hardlink checks | path variable | core |
| `packages/imagine-kit/bin/imagine-kit.mjs:1` | Kit executable CLI entry point | dependency | core |
| `packages/imagine-kit/src/index.mjs:1` | Kit command runner and JSON envelope emitter | dependency | core |

## 4. Plugin root and kit resolution (protocol `imagine-root/1`)

To eliminate hardcoded host paths while preventing fallback hazards, plugin root discovery and kit resolution follow the `imagine-root/1` protocol.

### 4.1 Module API (`host/plugin-root.mjs`)

The module `host/plugin-root.mjs` exports:
- `RESOLUTION_PROTOCOL = "imagine-root/1"`
- `isPluginRoot(dir)`
- `resolvePluginRoot({ skillDir, env })`

### 4.2 Candidate evaluation order and strict fail-closed rule

Candidates are evaluated strictly in the following priority:
1. `env.IMAGINE_PLUGIN_ROOT`
2. `env.CLAUDE_PLUGIN_ROOT`
3. `<skillDir>/../..` (when `skillDir` is provided)

**Fail-closed priority rule**: The first candidate in the list that is defined (non-empty string) must be a valid plugin root. If that candidate is set but fails validation, resolution immediately fails. It **never falls through** to a subsequent candidate.

Resolution never searches the current working directory, does not inspect `PATH`, and never attempts to resolve global package installations.

### 4.3 Validation criteria (`isPluginRoot`)

A directory path `dir` is a valid root if and only if:
1. The path is absolute (`path.isAbsolute(dir) === true`).
2. Its canonical resolved path (`fs.realpathSync(dir)`) exists and contains:
   - `packages/imagine-kit/package.json`, which must be valid JSON containing `"name": "imagine-kit"`;
   - `packages/imagine-kit/bin/imagine-kit.mjs` as an existing, readable regular file;
   - `skills/imagine/SKILL.md` as an existing, readable regular file.

### 4.4 Return signatures

- **On success**:
  ```json
  {
    "ok": true,
    "protocol": "imagine-root/1",
    "root": "<realpath-of-plugin-root>",
    "kit": "<realpath-of-plugin-root>/packages/imagine-kit/bin/imagine-kit.mjs",
    "source": "IMAGINE_PLUGIN_ROOT" | "CLAUDE_PLUGIN_ROOT" | "skill-dir"
  }
  ```
- **On failure**:
  ```json
  {
    "ok": false,
    "protocol": "imagine-root/1",
    "reason": "<detailed-failure-description>",
    "tried": ["<candidate-1>", ...]
  }
  ```

### 4.5 CLI contract

The module provides a command-line interface:
```bash
node host/plugin-root.mjs [--skill-dir <DIR>]
```
The CLI emits exactly one single-line JSON object on stdout. It exits `0` on success and `1` on failure.

### 4.6 Skill-text invocation recipe

- **Claude Code**: Retains the existing tested invocation pattern:
  ```bash
  node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...
  ```
- **All other hosts**: Resolves the root via `host/plugin-root.mjs`, assigning the validated root path to `<R>`, and invokes:
  ```bash
  node "<R>/packages/imagine-kit/bin/imagine-kit.mjs" <command> ...
  ```
  where `<R>` is the absolute directory two levels above the loaded `SKILL.md`.

### 4.7 Project directory isolation

Resolution of `.imagine/ACTIVE` and project-relative paths (e.g., `.imagine/<project>/`) remains strictly relative to the user's workspace project directory. They are never resolved relative to the plugin root.

## 5. Portable action contract

This contract specifies the twelve atomic actions required to execute Imagine across any host. Each action defines its semantic requirements, the host guarantees needed, and mandatory failure behaviors.

The mandatory-file reading requirements (`PROC-BRIEF-START`, `PROC-BRIEF-EMBED`) and dispatch file protection checks (`PROC-DISPATCH-GUARD`) apply across all hosts without alteration.

### 5.1 Load skill
- **Semantics**: Ingest markdown instructions and YAML frontmatter from a stage skill file (`skills/imagine-<stage>/SKILL.md`).
- **Host guarantees**: The host injects the complete text of the skill file into the agent context without truncation or editorial compression.
- **Failure behaviour**: If the skill file cannot be located or read, the operation fails immediately with status `BLOCKED` (`CAP-BLOCKED-STOP`). The agent must never invent or assume missing skill instructions (`CAP-NO-FABRICATION`).

### 5.2 Load reference
- **Semantics**: Ingest supporting contract, reference, or schema files from `skills/<skill>/references/` or `docs/contracts/`.
- **Host guarantees**: Exact, unmodified text is delivered into the context on demand.
- **Failure behaviour**: Missing references halt execution with `BLOCKED`. Fabricating reference content is forbidden.

### 5.3 Read
- **Semantics**: Retrieve contents of arbitrary workspace files by absolute or project-relative path.
- **Host guarantees**: Returns unmodified UTF-8 file contents. Mandatory files must be read in full per `PROC-BRIEF-START` and `PROC-BRIEF-AUDIT-CANON`.
- **Failure behaviour**: Non-existent or unreadable paths yield an immediate error. Missing inputs must never be hallucinated.

### 5.4 Search
- **Semantics**: Enumerate directory entries or search text content matching patterns (glob or regular expression).
- **Host guarantees**: Deterministic, complete file and match listings.
- **Failure behaviour**: If search operations fail or return incomplete results, dependent steps must fail closed.

### 5.5 Edit/write
- **Semantics**: Create or overwrite workspace files.
- **Host guarantees**: Writes are atomic where required (`PROC-ATOMIC-COMMIT`). Main-agent writes are permitted across the project tree; subagent writes are restricted based on declared capabilities.
- **Failure behaviour**: Filesystem permission errors or write rejections halt the operation with an explicit error.

### 5.6 Run process
- **Semantics**: Spawn an external command-line process (such as `node packages/imagine-kit/bin/imagine-kit.mjs` or `npx hyperframes@0.8.223`).
- **Host guarantees**: Captures stdout, stderr, and exit status. Preserves the final line of stdout intact for JSON envelope parsing.
- **Failure behaviour**: Process failure, missing binaries, or unparsable JSON output blocks execution (`CAP-BLOCKED-STOP`). Command results must never be fabricated (`CAP-NO-FABRICATION`).

### 5.7 Dispatch planning agent
- **Semantics**: Launch a specialized planning subagent (`storyboard-artist`, `previz-designer`, `fx-designer`) to design scenes and timing.
- **Host guarantees**: The host provides the full text of mandatory files in the prompt (`PROC-BRIEF-EMBED`). The subagent is denied write tools (`PROC-LOCK-HASHED-WRITES`). The parent agent hashes protected files before and after dispatch (`PROC-DISPATCH-GUARD`).
- **Failure behaviour**: Subagent failures or non-conforming patch proposals trigger structured retry rounds up to 3 attempts (`PROC-PATCH-ROUNDS`), then stop with `BLOCKED`.

### 5.8 Dispatch review agent
- **Semantics**: Launch an independent auditing subagent (`continuity-reviewer`) to evaluate visual and continuity coherence.
- **Host guarantees**: Read-only workspace access. Operates independently from the authoring agent (`PROC-SUBAGENT-PROPOSAL-ONLY`).
- **Failure behaviour**: A reviewer unable to open or decode an image explicitly reports that failure (`PROC-CANNOT-OPEN`); it must never assume the asset passed review.

### 5.9 Dispatch scene agent
- **Semantics**: Launch `scene-builder` to implement and validate an isolated shot within `stage/edit/<id>/`.
- **Host guarantees**: The host enforces write confinement exclusively to `stage/edit/<id>/` (`HARD-SHADOW-ONLY`). Telemetry is disabled (`PROC-TELEMETRY-OFF`).
- **Failure behaviour**: Any write attempt outside the shadow directory is denied. If the host lacks an enforced hook, execution is blocked by the stage check.

### 5.10 Return patch
- **Semantics**: A planning subagent returns a structured YAML patch proposal to the parent agent.
- **Host guarantees**: Delivers the patch text verbatim via the host's return channel or report message (`PROC-PATCH-VERBATIM`).
- **Failure behaviour**: Patches missing declared inputs or base revisions are rejected with `CONFLICT` or `STALE_INPUTS` by `imagine-kit patch apply`.

### 5.11 Recover after compaction
- **Semantics**: Restore execution state after context compaction, truncation, or session resumption.
- **Host guarantees**: The main agent rereads all stage mandatory files in full (`PROC-BRIEF-START`), runs `imagine-kit status`, and verifies source hashes against the ledger (`DAG-STALE-VS-REVIEW`).
- **Failure behaviour**: If mandatory files cannot be reread or state hashes disagree, progress is halted with `BLOCKED`.

### 5.12 Report error or BLOCKED
- **Semantics**: Communicate an unrecoverable failure, missing capability, or safety denial to the human operator and journal.
- **Host guarantees**: Appends an entry to `journal.md` (`PROC-JOURNAL`), writes `BLOCKED` status to `project.yaml`, and presents the blocking condition clearly to the user.
- **Failure behaviour**: None; this action constitutes the terminal failure state.

## 6. Agent packaging strategy

The markdown files under `agents/*.md` serve as the single source of truth for agent specifications.

### 6.1 Manifest generation (`docs/contracts/agents.manifest.json`)

Task B5 introduces `tools/agent-manifest.mjs`, which compiles `agents/*.md` into `docs/contracts/agents.manifest.json`.

For each agent, the manifest records:
- Native Claude tools and Claude model tier;
- Portable `actions` (from Section 5);
- `model_tier`: mapped from Claude models where `haiku` is `small`, `sonnet` is `standard`, and `opus` is `large`;
- `writes`: `none` or `shadow-only`;
- `output`: `patch`, `findings`, or `proposal`;
- `requires_enforced_isolation`: boolean (true for `scene-builder`);
- `inline_fallback`: policy for execution when subagent dispatch is unavailable.

### 6.2 Inline fallback policy

When operating on a host that lacks subagent dispatch capabilities, the inline fallback policies apply:
- `storyboard-artist`, `previz-designer`, `fx-designer`: `allowed-patch-only`. The parent agent executes the prompt inline, but the generated output must strictly follow the patch format and must be committed only via `imagine-kit patch apply`.
- `continuity-reviewer`: `blocked`. An author cannot objectively review their own work; an independent audit perspective is required.
- `scene-builder`: `blocked`. Confining file mutations requires enforced write isolation (`HARD-SHADOW-ONLY`). Inlined execution cannot guarantee write confinement.

### 6.3 Drift detection

The manifest records the SHA-256 hash of each source file under `agents/*.md`. Any modification to an agent definition must be followed by:
```bash
node tools/agent-manifest.mjs --write
```
The test suite (`npm test`) executes `node tools/agent-manifest.mjs --check` to prevent drift.

Host-specific agent wrappers are not generated in this issue; they will be generated from the manifest in follow-on host issues once host schemas have verified evidence.

## 7. Safety contract

The safety policy for workspace mutation remains implemented in `hooks/scene-builder-scope-lib.mjs` (`decide`).

### 7.1 Policy vs adapter responsibilities

- **Pure policy (`scene-builder-scope-lib.mjs`)**: Encapsulates canonical path resolution, symlink avoidance, hardlink checks (`st.nlink > 1`), shadow directory containment, and HyperFrames CLI flag validation.
- **Host adapters**: Responsible for translating native host hook events into the format expected by `decide()`, formatting the decision response, and enforcing fail-closed semantics on hook crashes or parsing errors.

### 7.2 Capability registry and stage check

Task B3 implements the host capability registry and stage check:
- `host/capabilities.mjs` exports `HOST_IDS`, `HOSTS`, and `checkStage({ host, stage, env })`.
- Each entry in `HOSTS` specifies a `corroborate` field of shape `{ name, value }` or `null`. For `claude-code`, this is `{ name: "CLAUDECODE", value: "1" }` (observed in the execution environment of Claude Code 2.1.319).
- CLI utility:
  ```bash
  node host/check-stage.mjs --host <id> --stage scene-builder
  ```
  The CLI outputs one JSON line. It exits:
  - `0` when status is `ok`;
  - `3` when status is `BLOCKED`;
  - `2` on usage error.

### 7.3 Stage check results for `scene-builder`

- Only `claude-code` returns `ok` for the `scene-builder` stage, and only when `CLAUDECODE=1` is present in the environment. This relies on the `VERIFIED-RUN` evidence in `tests/slice/evidence/ac17-hook.final.txt`.
- When `CLAUDECODE=1` is absent, `claude-code` returns `BLOCKED` with reason `host claim not corroborated by environment`.
- Every other host identifier, and any unknown identifier, returns `BLOCKED`.

### 7.4 Corroboration boundaries

Corroboration checks provide defense against accidental misconfiguration, but do not represent cryptographic security proof. The model declares its host identifier, and child processes can manipulate environment variables.

### 7.5 Defense-in-depth rules

1. **Unrecognized identity fields**: If a subagent's identity arrives in an unrecognized hook field (such as `agentType` or `subagent_type` when an adapter expects another key), the hook must deny the call rather than pass it through.
2. **Main-agent hash guard**: The parent agent's before-and-after cryptographic hashing of protected files (`PROC-DISPATCH-GUARD`) remains mandatory across all hosts.
3. **Unhooked host protection**: On a host that does not run the hook, safety is enforced solely by two layers: the stage check (`host/check-stage.mjs`), which blocks execution of `scene-builder`, and the main agent's hash guard.

## 8. Runtime environment and dependencies

### 8.1 Telemetry configuration

Core execution policy accepts exactly one leading `HYPERFRAMES_NO_TELEMETRY=1 ` prefix before `npx hyperframes@0.8.223` (Task B4). The `scene-builder` subagent must prepend this token to all generated HyperFrames commands. On Claude Code, the `CLAUDE_ENV_FILE` SessionStart hook persists this variable as a second layer of defense.

HyperFrames remains pinned to version `0.8.223` across all hosts (`PROC-TELEMETRY-OFF`).

### 8.2 Dependency preflight (`host/preflight.mjs`)

The CLI utility `node host/preflight.mjs [--require <a,b,...>]` verifies runtime dependencies:
- Probes available binaries: `node` (>= 22), `npx`, `uv`, `ffmpeg`, `ffprobe`, `codex`.
- Executes non-destructive version checks for each binary.
- Emits a JSON summary to stdout.
- Never installs or modifies host packages.
- Exits `0` if all required dependencies are present and valid; exits `1` if any required dependency is missing.

### 8.3 Stage-to-tool mapping

Tools are mapped to stages only where explicitly mandated by `cli-contract.md` or the skill instructions. Where neither contract specifies a mapping, it is listed as `unspecified`:

| Stage / Command | Required Binaries | Source |
|---|---|---|
| Project Initialization (`new`) | `node` | `cli-contract.md` (runs `imagine-kit new`) |
| Status Inspection (`status`) | `node` | `cli-contract.md` (runs `imagine-kit status`) |
| Approval Gates (`gate`) | `node` | `cli-contract.md` (runs `imagine-kit gate`) |
| Story Validation (`validate story`) | `node` | `cli-contract.md` (runs `imagine-kit validate story`) |
| Patch Application (`patch apply`) | `node` | `cli-contract.md` (runs `imagine-kit patch apply`) |
| Narration Generation (`tts`) | `node`, `uv`, `ffmpeg` (atempo optional) | `cli-contract.md` (runs `imagine-kit tts` with `pocket-tts` or `elevenlabs==2.73.0`) |
| Image Generation (`img`) | `node`, `codex`, `ffmpeg`, `npx` (HyperFrames) | `cli-contract.md` (runs `imagine-kit img`, crops pose sheets, fallback background removal) |
| Shot Staging / Promotion | `node` | `cli-contract.md` (runs `stage-shot`, `promote-shot`) |
| Scene Implementation (`scene-builder`) | `npx` (HyperFrames `0.8.223`) | `skills/imagine-edit/SKILL.md` (lint, snapshot, check, validate) |
| HyperFrames Export (`export-hf`) | `node`, `npx` (HyperFrames `0.8.223`) | `cli-contract.md`, `skills/imagine-edit/SKILL.md` |
| Timeline & Mix (`imagine-edit`) | `npx` (HyperFrames `0.8.223`) | `skills/imagine-edit/SKILL.md` (`check`, `normalize-audio`, `beats`) |
| Draft / Final Render (`render`) | `node`, `npx` (HyperFrames `0.8.223`) | `cli-contract.md`, `skills/imagine-deliver/SKILL.md` |
| Quality Control (`qc`) | `node`, `ffprobe` | `cli-contract.md` (runs `imagine-kit qc` with ffprobe / ebur128) |
| Canon Stages (`imagine-canon`) | unspecified | no kit/binary mapping in contracts |
| Planning Stages (`imagine-plan`) | unspecified | no kit/binary mapping in contracts |

## 9. Host capability matrix

The matrix evaluates host platforms against required adapter capabilities. Status values reflect the strict evidence standards defined in Section 2.

| Host ID | Skill Loading | Root Discovery | Subagent Dispatch | Per-Agent Tool Allowlist | PreToolUse Hook | Hook Failure Mode | Input Rewrite | Session Env Persistence | Compaction Signal | Scene-Builder Enforcement |
|---|---|---|---|---|---|---|---|---|---|---|
| `claude-code` | UNKNOWN (not covered by claude-code-platform.md) | `${CLAUDE_PLUGIN_ROOT}` (`VERIFIED-RUN`, platform D2 and `${CLAUDE_PLUGIN_ROOT}` fact); `${CLAUDE_SKILL_DIR}` is UNKNOWN (not covered by claude-code-platform.md) | `Agent` / `Task` tool (`VERIFIED-RUN`, D8) | UNKNOWN (not covered by claude-code-platform.md) | `PreToolUse` in `hooks.json` (`VERIFIED-RUN`) | `block` via `onFailure` (`VERIFIED-DOC`), repo entry exit 2 on load/parse failure (`VERIFIED-TEST`) | UNKNOWN (not covered by claude-code-platform.md) | `CLAUDE_ENV_FILE` in `SessionStart` (`VERIFIED-RUN`) | UNKNOWN (not covered by claude-code-platform.md) | Supported via hook + root anchor + hash guard (`VERIFIED-RUN`, allow/deny decisions only, per ac17) |
| `grok` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `GROK_HOOK_EVENT` translation (`VERIFIED-TEST`) | `UNKNOWN` | `updatedInput` supported (`VERIFIED-TEST`) | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` |
| `antigravity` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` |
| `cursor` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` |
| `pi` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` |

*Note on Claude Code Hook Failure Mode*: The platform fact specifying `"onFailure": "block"` blocks crashes and timeouts is `VERIFIED-DOC` (platform deviation D1, not exercised). Platform exit-2 semantics are `VERIFIED-DOC` (not exercised in platform runs); only the repo hook entry's own exit 2 on a load or parse failure is `VERIFIED-TEST` (covered by `hooks/scene-builder-scope.test.mjs`). `VERIFIED-RUN` from `ac17-hook.final.txt` covers allow and deny decisions during active runs, not hook crashes.

*Note on Grok*: Grok capabilities are marked `VERIFIED-TEST` only for the tool-name translation and input preparation tested in `hooks/scene-builder-scope-grok.mjs` and `hooks/scene-builder-scope.grok.test.mjs`. All runtime execution capabilities remain `UNKNOWN`.

## 10. Adapter implementation checklist

Follow-on host integration tasks must complete the following checklist before claiming compatibility:

1. **Root discovery**: Verify or implement the host candidate in `host/plugin-root.mjs` and ensure it passes the `imagine-root/1` protocol checks.
2. **Action mapping document**: Author `docs/contracts/hosts/<host>.md`, mapping all twelve actions from Section 5 to native primitives.
3. **Agent wrappers**: Generate native host agent wrappers from `docs/contracts/agents.manifest.json`.
4. **Hook adapter**: Implement a native hook adapter wrapping `hooks/scene-builder-scope-lib.mjs` (`decide`), demonstrating fail-closed behavior on unreadable input or hook errors.
5. **Stage check registry update**: Add the host entry and corroborating environment checks to `host/capabilities.mjs`, verified by interactive run evidence.
6. **Preflight verification**: Validate `host/preflight.mjs` execution within the host environment.
7. **Runtime probe evidence**: Execute integration scenarios and commit evidence artifacts to `tests/slice/evidence/`.
8. **Shared test suite pass**: Ensure all applicable shared test rows pass without regressions.

## 11. Shared test matrix

The shared test matrix tracks automated verification of portability concerns:

| Concern | Test File | Status |
|---|---|---|
| Plugin root discovery (`imagine-root/1`) | `tests/portability/plugin-root.test.mjs` | planned (B2) |
| Tool mapping translation | `hooks/scene-builder-scope.grok.test.mjs`, `tools/agent-manifest.test.mjs` | `VERIFIED-TEST` (Grok), planned (B5) (Manifest) |
| Native hook denial | `hooks/scene-builder-scope.test.mjs`, `hooks/scene-builder-scope.grok.test.mjs`, `tests/slice/probe.test.mjs`, `tests/slice/evidence/ac17-hook.final.txt` | `VERIFIED-TEST`, `VERIFIED-RUN` |
| Unknown host rejection | `tests/portability/host-capabilities.test.mjs` | planned (B3) |
| Unapproved source immutability | `packages/imagine-kit/test/patch-apply.test.mjs`, `packages/imagine-kit/test/stage-promote.test.mjs`, `packages/imagine-kit/test/commit.test.mjs`, `hooks/scene-builder-scope.test.mjs` | `VERIFIED-TEST` |
| Gate quote and provenance enforcement | `packages/imagine-kit/test/gate.test.mjs`, `packages/imagine-kit/test/gate-assets.test.mjs`, `packages/imagine-kit/test/gate-flagged.test.mjs` | `VERIFIED-TEST` |
| Session restart and compaction recovery | `tests/behavioral/run.test.mjs`, `packages/imagine-kit/test/wp2-ledger.test.mjs` | `VERIFIED-TEST` |
| Clean checkout installation | `tests/slice/probe.test.mjs`, `tests/portability/preflight.test.mjs` | `VERIFIED-TEST`, planned (B2) |
