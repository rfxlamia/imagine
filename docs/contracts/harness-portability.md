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
5. **Enforced scene-builder isolation**: The `scene-builder` subagent write isolation is enforced by a PreToolUse hook where available; on a host without a verified write hook, the kit guard detects, after stage-shot, changes to canon, plan inputs and media; it does not prevent writes, and it does not cover other shots' promoted compositions, the root motion file, or the project state (including gate approvals) (`HARD-SHADOW-ONLY`, `CAP-HOST-ENFORCEMENT`). Writes outside the shadow directory are rejected or detected.

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

The repository exhibits couplings across path variables, tool invocations, agent frontmatter, hooks, and environment configuration. Each coupling is categorized as either `core` (essential system policy) or `adapter` (host-specific binding), with its resolution status documented.

| File:Line | Coupling | Kind | Class | Resolution / Status |
|---|---|---|---|---|
| `skills/imagine/SKILL.md:38` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter | Intentional Claude adapter; host-neutral invocation recipe via `host/plugin-root.mjs` documented inline (lines 40–41) |
| `skills/imagine/SKILL.md:124` | `R = ${CLAUDE_SKILL_DIR}/../..` plugin root anchor | path variable | adapter | Intentional Claude adapter; other hosts resolve `R` via Section 4 protocol (documented line 124) |
| `skills/imagine/SKILL.md:27` | Mandatory read of `claude-code-platform.md` | bootstrap or compaction | adapter | Intentional Claude adapter; read is conditional on `host-id` `claude-code` |
| `skills/imagine/SKILL.md:139` | Mandatory stage read of `claude-code-platform.md` | bootstrap or compaction | adapter | Intentional Claude adapter; read is conditional on `host-id` `claude-code` |
| `skills/imagine-canon/SKILL.md:32` | Mandatory read of `claude-code-platform.md` | bootstrap or compaction | adapter | Intentional Claude adapter; read is conditional on `host-id` `claude-code` |
| `skills/imagine-canon/SKILL.md:43` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter | Intentional Claude adapter; host-neutral invocation recipe via `host/plugin-root.mjs` documented inline (line 45) |
| `skills/imagine-canon/SKILL.md:139` | `R = ${CLAUDE_SKILL_DIR}/../..` plugin root anchor | path variable | adapter | Intentional Claude adapter; other hosts resolve `R` via Section 4 protocol (documented line 139) |
| `skills/imagine-canon/SKILL.md:155` | Mandatory stage read of `claude-code-platform.md` | bootstrap or compaction | adapter | Intentional Claude adapter; read is conditional on `host-id` `claude-code` |
| `skills/imagine-plan/SKILL.md:33` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter | Intentional Claude adapter; host-neutral invocation recipe via `host/plugin-root.mjs` documented inline (line 36) |
| `skills/imagine-plan/SKILL.md:101` | Mandatory stage read of `claude-code-platform.md` | bootstrap or compaction | adapter | Intentional Claude adapter; read is conditional on `host-id` `claude-code` |
| `skills/imagine-generate/SKILL.md:29` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter | Intentional Claude adapter; host-neutral invocation recipe via `host/plugin-root.mjs` documented inline (line 31) |
| `skills/imagine-edit/SKILL.md:18` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter | Intentional Claude adapter; host-neutral invocation recipe via `host/plugin-root.mjs` documented inline (line 20) |
| `skills/imagine-deliver/SKILL.md:35` | `${CLAUDE_SKILL_DIR}` invocation path for `imagine-kit` | path variable | adapter | Intentional Claude adapter; host-neutral invocation recipe via `host/plugin-root.mjs` documented inline (line 37) |
| `skills/imagine-deliver/SKILL.md:95` | `R = ${CLAUDE_SKILL_DIR}/../..` plugin root anchor | path variable | adapter | Intentional Claude adapter; other hosts resolve `R` via Section 4 protocol (documented line 95) |
| `skills/imagine-canon/references/elevenlabs-voices.md:110` | `${CLAUDE_SKILL_DIR}` external skill path reference | path variable | adapter | Intentional Claude adapter; host-neutral alternative (`R/...`) documented inline (line 110) |
| `hooks/hooks.json:9` | `${CLAUDE_PLUGIN_ROOT}/hooks/session-env.mjs` path argument | path variable | adapter | Intentional Claude adapter in Claude Code plugin hook configuration |
| `hooks/hooks.json:21` | `${CLAUDE_PLUGIN_ROOT}/hooks/scene-builder-scope.mjs` path argument | path variable | adapter | Intentional Claude adapter in Claude Code plugin hook configuration |
| `hooks/hooks.json:3` | `SessionStart` hook event trigger | hook event or I/O | adapter | Intentional Claude adapter in Claude Code plugin hook configuration |
| `hooks/hooks.json:14` | `PreToolUse` hook event trigger with `*` matcher | hook event or I/O | adapter | Intentional Claude adapter in Claude Code plugin hook configuration |
| `hooks/hooks.json:22` | `"onFailure": "block"` configuration | hook event or I/O | adapter | Intentional Claude adapter in Claude Code plugin hook configuration |
| `hooks/session-env-lib.mjs:11` | `CLAUDE_ENV_FILE` environment variable read | env persistence | adapter | Intentional Claude adapter; core policy also accepts explicit `HYPERFRAMES_NO_TELEMETRY=1` token |
| `hooks/session-env-lib.mjs:25` | `persistEnv(env.CLAUDE_ENV_FILE)` file append | env persistence | adapter | Intentional Claude adapter; persists telemetry variable for Claude Code session commands |
| `hooks/scene-builder-scope-lib.mjs:285` | `CLAUDE_PROJECT_DIR` fallback session-root anchor | path variable | adapter | Intentional Claude adapter; falls back to `input.cwd` on other hosts |
| `agents/storyboard-artist.md:4` | `tools: Read, Glob, Grep` declaration | tool name | adapter | Resolved: portable `actions: [read, search]` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `agents/storyboard-artist.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter | Resolved: portable `model_tier: standard` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `agents/previz-designer.md:4` | `tools: Read, Glob, Grep` declaration | tool name | adapter | Resolved: portable `actions: [read, search]` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `agents/previz-designer.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter | Resolved: portable `model_tier: standard` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `agents/fx-designer.md:4` | `tools: Read, Glob, Grep` declaration | tool name | adapter | Resolved: portable `actions: [read, search]` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `agents/fx-designer.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter | Resolved: portable `model_tier: standard` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `agents/continuity-reviewer.md:4` | `tools: Read, Glob, Grep` declaration | tool name | adapter | Resolved: portable `actions: [read, search]` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `agents/continuity-reviewer.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter | Resolved: portable `model_tier: standard` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `agents/scene-builder.md:4` | `tools: Read, Glob, Grep, Write, Edit, Bash` declaration | tool name | adapter | Resolved: portable `actions: [read, search, write, run-process]` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `agents/scene-builder.md:5` | `model: sonnet` model tier selection | agent frontmatter | adapter | Resolved: portable `model_tier: standard` in `agents.manifest.json` generated by `tools/agent-manifest.mjs` |
| `hooks/scene-builder-scope-lib.mjs:29` | `SCENE_BUILDER_TYPES` agent type matching | agent frontmatter | adapter | Hardened with NFKC/regex normalization and alias field check in `isSceneBuilderIdentity()` |
| `hooks/scene-builder-scope-lib.mjs:71` | `READ_ONLY_TOOLS` (`Read`, `Glob`, `Grep`) | tool name | adapter | Intentional Claude tool names; mapped by host adapters (e.g., `scene-builder-scope-grok.mjs`) |
| `hooks/scene-builder-scope-lib.mjs:72` | `WRITE_TOOLS` (`Write`, `Edit`, `MultiEdit`) | tool name | adapter | Intentional Claude tool names; mapped by host adapters (e.g., `scene-builder-scope-grok.mjs`) |
| `hooks/scene-builder-scope-lib.mjs:290` | `NotebookEdit` tool check | tool name | adapter | Intentional Claude tool check; denies mutation outside shadow |
| `hooks/scene-builder-scope-lib.mjs:291` | `SubagentHandback` report tool | tool name | adapter | Intentional Claude tool check; allows final report to parent |
| `hooks/scene-builder-scope-lib.mjs:292` | `Bash` tool check | tool name | adapter | Intentional Claude tool check; mapped by host adapters (e.g., Grok `run_terminal_command`) |
| `hooks/scene-builder-scope-lib.mjs:310–316` | `hookSpecificOutput` / `PreToolUse` response format | hook event or I/O | adapter | Intentional Claude hook response schema; adapter formats output |
| `hooks/scene-builder-scope.mjs:8` | `GROK_HOOK_EVENT` runtime environment switch | hook event or I/O | adapter | Dispatches to Grok adapter when `GROK_HOOK_EVENT` is present |
| `hooks/session-env.mjs:8` | `GROK_HOOK_EVENT` runtime environment switch | hook event or I/O | adapter | Dispatches to Grok adapter when `GROK_HOOK_EVENT` is present |
| `hooks/scene-builder-scope-grok.mjs:7–15` | Grok tool name mapping table | tool name | adapter | Maps Grok tools to canonical names; verified in `hooks/scene-builder-scope.grok.test.mjs` |
| `hooks/scene-builder-scope-grok.mjs:41` | `subagentType` parameter | hook event or I/O | adapter | Grok adapter identity parameter (issue #24 pending: non-exact values pass through before `decide()`) |
| `hooks/scene-builder-scope-grok.mjs:43` | `toolInputTruncated` check | hook event or I/O | adapter | Denies truncated tool inputs (`VERIFIED-TEST`) |
| `hooks/scene-builder-scope-grok.mjs:66` | `updatedInput` command rewrite | hook event or I/O | adapter | Rewrites allowed Bash command to reattach `HYPERFRAMES_NO_TELEMETRY=1 ` prefix |
| `.claude-plugin/plugin.json:1` | Claude Code plugin manifest | dependency | adapter | Intentional Claude adapter packaging manifest |
| `.claude-plugin/marketplace.json:1` | Claude Code marketplace catalog | dependency | adapter | Intentional Claude adapter marketplace catalog |
| `docs/contracts/claude-code-platform.md:7` | `ISOLATION_FLAGS` (`--setting-sources project,local --strict-mcp-config`) | bootstrap or compaction | adapter | Intentional Claude adapter isolation flags |
| `docs/contracts/claude-code-platform.md:22` | Subagent dispatch tool name `Agent` / `Task` alias | tool name | adapter | Intentional Claude adapter dispatch tool name |
| `hooks/scene-builder-scope-lib.mjs:74–98` | HyperFrames CLI prefix and allowed subcommands | tool name | core | Pinned HyperFrames prefix `npx hyperframes@0.8.223` and subcommands `lint`, `snapshot`, `check`, `validate`; accepts `TELEMETRY_TOKEN` (`HYPERFRAMES_NO_TELEMETRY=1`) |
| `hooks/scene-builder-scope-lib.mjs:102–161` | Shadow project path containment and symlink/hardlink checks | path variable | core | Core isolation logic: `insideShadowWrite`, `insideShadowArg`, `shadowRel` |
| `packages/imagine-kit/bin/imagine-kit.mjs:1` | Kit executable CLI entry point | dependency | core | Pinned CLI entry point for all 12 Phase 1 commands |
| `packages/imagine-kit/src/index.mjs:1` | Kit command runner and JSON envelope emitter | dependency | core | Core command runner, validation, and JSON envelope output |

## 4. Plugin root and kit resolution (protocol `imagine-root/1`)

To eliminate hardcoded host paths while preventing fallback hazards, plugin root discovery and kit resolution follow the `imagine-root/1` protocol.

### 4.1 Module API (`host/plugin-root.mjs`)

The module `host/plugin-root.mjs` exports:
- `RESOLUTION_PROTOCOL = "imagine-root/1"`
- `isPluginRoot(dir)`
- `resolvePluginRoot({ skillDir, env = process.env } = {})`

### 4.2 Candidate evaluation order and strict fail-closed rule

Candidates are evaluated strictly in the following priority:
1. `env.IMAGINE_PLUGIN_ROOT` (candidate source: `"IMAGINE_PLUGIN_ROOT"`)
2. `env.CLAUDE_PLUGIN_ROOT` (candidate source: `"CLAUDE_PLUGIN_ROOT"`)
3. `path.resolve(skillDir, "..", "..")` when `skillDir` is an absolute path, or `skillDir` (candidate source: `"skill-dir"`)

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
- **On failure (no candidates specified)**:
  ```json
  {
    "ok": false,
    "protocol": "imagine-root/1",
    "reason": "no plugin root candidate",
    "tried": []
  }
  ```
- **On failure (invalid candidate)**:
  ```json
  {
    "ok": false,
    "protocol": "imagine-root/1",
    "reason": "candidate from <source> is not a valid plugin root: <path>",
    "tried": [
      { "source": "<source>", "path": "<path>" }
    ]
  }
  ```

### 4.5 CLI contract

The module provides a command-line interface:
```bash
node host/plugin-root.mjs [--skill-dir <DIR>]
```
The CLI emits exactly one single-line JSON object on stdout. Exit codes:
- `0`: resolution succeeded (`ok: true`);
- `1`: resolution failed (`ok: false`);
- `2`: CLI usage error (unexpected flag or invalid argument shape).

### 4.6 Skill-text invocation recipe

- **Claude Code**: Retains the existing tested invocation pattern:
  ```bash
  node "${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...
  ```
- **All other hosts**: Resolves the root via `host/plugin-root.mjs`, assigning the validated root path to `<R>`, and invokes:
  ```bash
  node "<R>/packages/imagine-kit/bin/imagine-kit.mjs" <command> ...
  ```
  where `<R>` is the absolute directory two levels above the loaded `SKILL.md`, confirmed by `node "<R>/host/plugin-root.mjs" --skill-dir "<R>/skills/<skill>"` printing `"ok":true`.

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
- **Failure behaviour**: Any write attempt outside the shadow directory is denied. If the host lacks verified write enforcement, execution is blocked by the stage check (`CAP-HOST-ENFORCEMENT`).

### 5.10 Return patch
- **Semantics**: A planning subagent returns a structured YAML patch proposal to the parent agent.
- **Host guarantees**: Delivers the patch text verbatim via the host's return channel or report message (`PROC-PATCH-VERBATIM`).
- **Failure behaviour**: Patches missing declared inputs or base revisions are rejected with `CONFLICT` or `STALE_INPUTS` by `imagine-kit patch apply`.

### 5.11 Recover after compaction
- **Semantics**: Restore execution state after context compaction, truncation, or session resumption.
- **Host guarantees**: The main agent rereads all stage mandatory files in full (`PROC-BRIEF-START`), re-runs the host stage check (`CAP-HOST-ENFORCEMENT`), runs `imagine-kit status`, and verifies source hashes against the ledger (`DAG-STALE-VS-REVIEW`).
- **Failure behaviour**: If mandatory files cannot be reread or state hashes disagree, progress is halted with `BLOCKED`.

### 5.12 Report error or BLOCKED
- **Semantics**: Communicate an unrecoverable failure, missing capability, or safety denial to the human operator and journal.
- **Host guarantees**: Appends an entry to `journal.md` (`PROC-JOURNAL`), writes `BLOCKED` status to `project.yaml`, and presents the blocking condition clearly to the user.
- **Failure behaviour**: None; this action constitutes the terminal failure state.

## 6. Agent packaging strategy

The markdown files under `agents/*.md` serve as the single source of truth for agent specifications.

### 6.1 Manifest generation (`tools/agent-manifest.mjs`)

The utility `tools/agent-manifest.mjs` compiles `agents/*.md` into `docs/contracts/agents.manifest.json`.

Exports from `tools/agent-manifest.mjs`:
- `TOOL_ACTIONS`: maps native Claude tool names to portable actions (`Read` -> `read`, `Glob` -> `search`, `Grep` -> `search`, `Write` -> `write`, `Edit` -> `write`, `MultiEdit` -> `write`, `NotebookEdit` -> `write`, `Bash` -> `run-process`).
- `MODEL_TIERS`: maps Claude model identifiers to tier labels (`haiku` -> `small`, `sonnet` -> `standard`, `opus` -> `large`).
- `POLICY`: frozen map of agent policies defining `writes`, `requires_enforced_isolation`, `inline_fallback`, and `output`.
- `buildManifest(repoRoot)`: parses frontmatter from `agents/*.md` and generates the manifest object.

For each agent, `docs/contracts/agents.manifest.json` records:
- `name`: agent identifier (e.g., `scene-builder`, `continuity-reviewer`);
- `source`: relative path to the markdown file under `agents/`;
- `source_sha256`: hexadecimal SHA-256 hash of the source markdown file;
- `description`: verbatim frontmatter description;
- `claude`: `{ tools: [...], model: "..." }`;
- `portable`: `{ actions: [...], model_tier: "...", writes: "none"|"shadow-only", output: "patch"|"findings"|"proposal", requires_enforced_isolation: boolean, isolation_modes?: ["hook", "kit-guard"], inline_fallback: "allowed-patch-only"|"blocked" }`.

### 6.2 Inline fallback policy

When operating on a host that lacks subagent dispatch capabilities, the inline fallback policies apply:
- `storyboard-artist`, `previz-designer`, `fx-designer`: `allowed-patch-only`. The parent agent executes the prompt inline, but the generated output must strictly follow the patch format and must be committed only via `imagine-kit patch apply`.
- `continuity-reviewer`: `blocked`. An author cannot objectively review their own work; an independent audit perspective is required.
- `scene-builder`: `blocked`. Confining file mutations requires enforced write isolation (`HARD-SHADOW-ONLY`, `CAP-HOST-ENFORCEMENT`). Inlined execution cannot guarantee write confinement.

### 6.3 Drift detection and CLI contract

The manifest CLI utility supports:
```bash
node tools/agent-manifest.mjs [--write | --check]
```
The environment variable `IMAGINE_REPO_ROOT` overrides the repo root for the CLI (used by the tests on a temp tree).

- `--write`: writes the formatted manifest to `docs/contracts/agents.manifest.json`.
- `--check`: validates that the committed manifest exactly matches current definitions in `agents/*.md`.
- Exit codes:
  - `0`: `--write` succeeded, or `--check` found the manifest in sync;
  - `1`: `--check` found the manifest stale or missing (message `agents.manifest.json is stale; run node tools/agent-manifest.mjs --write`), OR `buildManifest` threw a validation error (missing or unparsable frontmatter, name mismatch, unknown tool or model, missing POLICY entry, write/run-process action with `writes: "none"`), in both `--write` and `--check`;
  - `2`: no flag, an unknown flag, or more than one argument (usage message).

The check is automated in CI via `npm run check:agents`. Host-specific agent packaging files will be generated from this manifest in follow-on host issues (#19, #20, #21, #24).

## 7. Safety contract

The safety policy for workspace mutation is implemented in `hooks/scene-builder-scope-lib.mjs` (`decide`).

### 7.1 Policy vs adapter responsibilities

- **Pure policy (`hooks/scene-builder-scope-lib.mjs`)**:
  - Exports `SCENE_BUILDER_TYPES = ["imagine:scene-builder", "scene-builder"]`.
  - Exports `TELEMETRY_TOKEN = "HYPERFRAMES_NO_TELEMETRY=1"`.
  - Encapsulates canonical path resolution (`shadowRel`), symlink avoidance, hardlink checks (`st.nlink > 1`), shadow directory containment (`insideShadowWrite`, `insideShadowArg`), and HyperFrames CLI flag validation.
  - Fail-safe identity normalization and alias check (`isSceneBuilderIdentity`): normalizes values using NFKC, removes zero-width characters, replaces Unicode dashes with `-`, trims, lowercases, replaces `_` with `-`, and strips `.md`, `@version`, and numeric instance suffixes (`[#-]\d+$`) in a loop repeating until stable (capped at 8 passes). Recursively inspects nested arrays and objects up to depth 3.
  - Fail-safe alias deny: if a scene-builder identity is detected in any of the 16 recognized alias fields:
    `agentType`, `agent_name`, `agentName`, `subagent_type`, `subagentType`, `subagent_name`, `subagentName`, `agent`, `subagent`, `agent_id`, `agentId`, `subagent_id`, `subagentId`, `role`, `agent_role`, `agentRole`,
    or in `agent_type` without an exact match in `SCENE_BUILDER_TYPES`, `decide()` returns `{ decision: "deny", reason: "scene-builder identity in an unrecognised host field; no verified adapter" }`.
- **Host adapters**: Responsible for translating native host hook events into the format expected by `decide()`, formatting the decision response, and enforcing fail-closed semantics on hook crashes or parsing errors.

### 7.2 Capability registry and stage check

The host capability registry is implemented in `host/capabilities.mjs` and exercised via `host/check-stage.mjs`:
- `host/capabilities.mjs` exports:
  - `HOST_IDS = Object.freeze(["claude-code", "grok", "antigravity", "cursor", "pi"])`
  - `HOSTS`: frozen capability dictionary per host id
  - `PROTECTED_STAGES = Object.freeze(["scene-builder"])`
  - `KIT_GUARD_TEST_FILE = "packages/imagine-kit/test/guard-integration.test.mjs"`
  - `checkStage({ host, stage, env = process.env, hosts = HOSTS, rootDir })`
- Each entry in `HOSTS` specifies `subagents`, `pretooluse_hook`, `hook_failure`, `scene_builder_enforcement`, `evidence`, `corroborate` (`{ name, value }` or `null`), and `kit_guard_run` (`string` evidence path or `null`).
- Dispatching `scene-builder` evaluates the host's own claim:
  1. **Hook enforcement path**: Chosen when the host claims `scene_builder_enforcement: "VERIFIED-RUN"`. Requires `hook_failure: "block"` and environment corroboration. Failure stays `BLOCKED` with hook evidence reasons and never falls through to the kit-guard branch. Passes with `isolation: "hook"`.
  2. **Kit-guard path**: For hosts making no hook claim. Requires `subagents: "VERIFIED-RUN"`, `kit_guard_run` referencing an existing repo-relative evidence file on disk, and the kit guard test file (`packages/imagine-kit/test/guard-integration.test.mjs`) present on disk. Passes with `isolation: "kit-guard"` and `coverage: "detective; detects changes to canon, plan inputs and media after stage-shot; does not prevent writes"`.
- CLI utility:
  ```bash
  node host/check-stage.mjs --host <id> --stage scene-builder
  ```
  The CLI outputs exactly one single-line JSON object:
  ```json
  {"ok": true, "status": "ok", "host": "claude-code", "stage": "scene-builder", "isolation": "hook", "reason": null}
  ```
  And for kit-guard:
  ```json
  {"ok": true, "status": "ok", "host": "<id>", "stage": "scene-builder", "isolation": "kit-guard", "coverage": "detective; detects changes to canon, plan inputs and media after stage-shot; does not prevent writes", "reason": null}
  ```
  Exit codes:
  - `0`: status is `"ok"` (`ok: true`);
  - `3`: status is `"BLOCKED"` (`ok: false`);
  - `2`: CLI usage error or unrecognized stage (`status: "error"`).

### 7.3 Stage check results for `scene-builder`

- `claude-code` returns `ok` for the `scene-builder` stage only when `CLAUDECODE=1` is present in the environment (`VERIFIED-RUN`, based on `tests/slice/evidence/ac17-hook.final.txt`), carrying `isolation: "hook"`.
- `antigravity` returns `ok` with `isolation: "kit-guard"` (detective; does not prevent writes), based on `docs/harnesses/evidence/antigravity-8b-run.md`.
- When `CLAUDECODE=1` is absent, `claude-code` returns `BLOCKED` with reason `"host claim not corroborated by environment"`.
- Every other host identifier (`grok`, `cursor`, `pi`), empty string, and any unknown identifier returns `BLOCKED` (`CAP-HOST-ENFORCEMENT`). Hosts with no hook claim report missing `kit_guard_run` evidence and unverified subagents.

### 7.4 Corroboration boundaries and known limits

Corroboration checks provide defense against accidental misconfiguration, but do not represent cryptographic security proof. The following limits are stated plainly:
1. `CLAUDECODE=1` can be set in any environment; the Claude entry in `HOSTS` is corroboration against accidental misconfiguration, not cryptographic proof.
2. `decide()` passes through non-matching inputs, which means unlisted identity field names, nested values at depth 3 or greater, or unsupported separator patterns such as `scene.builder` would pass through rather than deny if passed by an unverified adapter.
3. The Grok adapter (`hooks/scene-builder-scope-grok.mjs`, lines 51–54) denies a doubled telemetry prefix or any prefix not at the very start with reason `"doubled telemetry prefix"`.
4. In `hooks/scene-builder-scope-grok.mjs` (lines 41–42), `adapt()` returns `{ decision: "pass", reason: "" }` for any `subagentType` that does not exactly match `SCENE_BUILDER_TYPES` before `decide()` is invoked. As a result, the alias-field deny from `scene-builder-scope-lib.mjs` does not execute on the Grok path. Grok stays strictly `BLOCKED` by the stage check (`host/check-stage.mjs`), with hardening tracked under issue #24.

### 7.5 Defense-in-depth rules

1. **Unrecognized identity fields**: If a subagent identity appears in an unverified alias field without an exact type match, the core hook logic denies the call (`scene-builder identity in an unrecognised host field; no verified adapter`).
2. **Main-agent hash guard**: The parent agent's before-and-after cryptographic hashing of protected files (`PROC-DISPATCH-GUARD`) remains mandatory across all hosts.
3. **Unhooked host protection and gap**: On a host without a verified write hook, the kit guard detects, after stage-shot, changes to canon, plan inputs and media; it does not prevent writes, and it does not cover other shots' promoted compositions, the root motion file, or the project state (including gate approvals). Safety requires both the stage check (`host/check-stage.mjs`) and the kit guard (`HARD-SHADOW-ONLY`, `CAP-HOST-ENFORCEMENT`).

## 8. Runtime environment and dependencies

### 8.1 Telemetry configuration

Core execution policy accepts an optional leading `HYPERFRAMES_NO_TELEMETRY=1 ` prefix before `npx hyperframes@0.8.223` in `decideBash` (`hooks/scene-builder-scope-lib.mjs`). The token is exported as `TELEMETRY_TOKEN = "HYPERFRAMES_NO_TELEMETRY=1"`.

The `scene-builder` subagent prepends this token to all generated HyperFrames commands (`agents/scene-builder.md`). On Claude Code, the `CLAUDE_ENV_FILE` SessionStart hook persists this variable as a second layer of defense.

HyperFrames remains pinned to version `0.8.223` across all hosts (`PROC-TELEMETRY-OFF`).

### 8.2 Dependency preflight (`host/preflight.mjs`)

The CLI utility `node host/preflight.mjs [--require <a,b,...>]` verifies runtime dependencies:
- Exports `TOOLS`, `probeTool(tool, options)`, and `preflight(options)`.
- Probes available binaries: `node` (requires >= 22 via `ok_version`), `npx`, `uv`, `ffmpeg`, `ffprobe`, `codex`.
- Executes non-destructive version checks for each binary.
- Emits a JSON summary to stdout: `{"ok": boolean, "tools": [...]}`.
- Never installs or modifies host packages.
- Exit codes:
  - `0`: all required dependencies are present and valid;
  - `1`: any required dependency is missing or node version is below 22;
  - `2`: CLI usage error or unknown required tool name.

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
| `claude-code` | UNKNOWN (not covered by claude-code-platform.md) | `${CLAUDE_PLUGIN_ROOT}` (`VERIFIED-RUN`, `claude-code-platform.md` D2 and `${CLAUDE_PLUGIN_ROOT}` fact); `${CLAUDE_SKILL_DIR}` is UNKNOWN (not covered by claude-code-platform.md) | `Agent` / `Task` tool (`VERIFIED-RUN`, `claude-code-platform.md` D8) | UNKNOWN (not covered by claude-code-platform.md) | `PreToolUse` in `hooks.json` (`VERIFIED-RUN`, `tests/slice/evidence/ac17-hook.final.txt`) | `block` via `onFailure` (`VERIFIED-DOC`, `claude-code-platform.md` D1), repo entry exit 2 on load/parse failure (`VERIFIED-TEST`, `hooks/scene-builder-scope.test.mjs`) | UNKNOWN (not covered by claude-code-platform.md) | `CLAUDE_ENV_FILE` in `SessionStart` (`VERIFIED-RUN`, `claude-code-platform.md` fact) | UNKNOWN (not covered by claude-code-platform.md) | Supported via hook + root anchor + hash guard (`VERIFIED-RUN`, allow/deny decisions only, per `tests/slice/evidence/ac17-hook.final.txt`) |
| `grok` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `GROK_HOOK_EVENT` translation (`VERIFIED-TEST`, `hooks/scene-builder-scope.grok.test.mjs`) | `UNKNOWN` | `updatedInput` supported (`VERIFIED-TEST`, `hooks/scene-builder-scope.grok.test.mjs`) | `UNKNOWN` | `UNKNOWN` | `BLOCKED` via `host/check-stage.mjs` (issue #24 pending hardening; `adapt()` lines 41–42 returns `pass` for non-exact `subagentType` before `decide()` runs, so alias deny does not apply on Grok path; all execution capabilities remain `UNKNOWN`) |
| `antigravity` | `UNKNOWN` | `UNKNOWN` | `VERIFIED-RUN` (`docs/harnesses/evidence/antigravity-8b-run.md`) | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `ok` via kit-guard in `host/check-stage.mjs` (detective; does not prevent writes; issue #19) |
| `cursor` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `BLOCKED` via `host/check-stage.mjs` (issue #20) |
| `pi` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `BLOCKED` via `host/check-stage.mjs` (issue #21) |

*Note on Claude Code Hook Failure Mode*: The platform fact specifying `"onFailure": "block"` blocks crashes and timeouts is `VERIFIED-DOC` (platform deviation D1, not exercised). Platform exit-2 semantics are `VERIFIED-DOC` (not exercised in platform runs); only the repo hook entry's own exit 2 on a load or parse failure is `VERIFIED-TEST` (covered by `hooks/scene-builder-scope.test.mjs`). `VERIFIED-RUN` from `ac17-hook.final.txt` covers allow and deny decisions during active runs, not hook crashes.

*Note on Grok and Follow-on Issues*: Grok capabilities are marked `VERIFIED-TEST` only for the tool-name translation and input preparation tested in `hooks/scene-builder-scope-grok.mjs` and `hooks/scene-builder-scope.grok.test.mjs`. All runtime execution capabilities remain `UNKNOWN`. In addition, `adapt()` (lines 41–42) returns `pass` for any non-exact `subagentType` before calling `decide()`, bypassing the alias-field deny on the Grok path. Hardening is tracked under issue #24. Follow-on adapter packaging and runtime evidence are tracked under #19 (Antigravity), #20 (Cursor), and #21 (Pi).

## 10. Adapter implementation checklist

Follow-on host integration tasks must complete the following checklist before claiming compatibility:

1. **Root discovery**: Update candidate resolution in `host/plugin-root.mjs` (`resolvePluginRoot`) to satisfy the `imagine-root/1` protocol; verify execution via `node host/plugin-root.mjs --skill-dir <dir>` and test suite `node --test tests/portability/plugin-root.test.mjs`.
2. **Action mapping document**: Author `docs/contracts/hosts/<host>.md`, mapping all twelve actions from Section 5 to native primitives.
3. **Agent wrappers**: Generate native host agent configs from `docs/contracts/agents.manifest.json` and verify drift with `node tools/agent-manifest.mjs --check`.
4. **Hook adapter**: Implement a native hook adapter module (e.g., `hooks/scene-builder-scope-<host>.mjs`) wrapping `hooks/scene-builder-scope-lib.mjs` (`decide`), verifying fail-closed exit 2 on unreadable input via `node --test hooks/scene-builder-scope.<host>.test.mjs`.
5. **Stage check registry update**: Add the host entry and corroborating environment checks to `host/capabilities.mjs` (`HOSTS`, `HOST_IDS`), verified by `node host/check-stage.mjs --host <host> --stage scene-builder` and `node --test tests/portability/host-capabilities.test.mjs`.
6. **Preflight verification**: Validate `host/preflight.mjs` execution within the host environment via `node host/preflight.mjs [--require ...]` and `node --test tests/portability/preflight.test.mjs`.
7. **Runtime probe evidence**: Execute host integration scenarios and commit evidence artifacts to `tests/slice/evidence/<host>-*.txt`.
8. **Shared test suite pass**: Run `npm run check:names`, `npm run check:rules`, `npm run check:agents`, and ensure all relevant test suites under `tests/portability/*.test.mjs` pass without regressions.

## 11. Shared test matrix

The shared test matrix tracks automated verification of portability concerns across the repository:

| Concern | Test File | Test Titles / Evidence | Status |
|---|---|---|---|
| Plugin root discovery (`imagine-root/1`) | `tests/portability/plugin-root.test.mjs` | `resolves valid skill-dir`, `IMAGINE_PLUGIN_ROOT wins over CLAUDE_PLUGIN_ROOT`, `a set but invalid IMAGINE_PLUGIN_ROOT fails and does not fall through`, `no candidates returns failure`, `a relative path is rejected`, `a wrong kit package name is rejected`, `a symlinked root resolves to its realpath`, `a different process.cwd() has no effect`, `the real repo root resolves when skillDir = <repo>/skills/imagine`, `CLI exits 0 with JSON on success, exits 1 on failure` | `VERIFIED-TEST` |
| Tool mapping translation | `hooks/scene-builder-scope.grok.test.mjs`, `tools/agent-manifest.test.mjs` | `hooks/scene-builder-scope.grok.test.mjs`: `write and hashline_edit outside the shadow are denied`, `read_file, grep and list_dir stay allowed outside the shadow`, `an allowed hyperframes command gains one telemetry prefix`; `tools/agent-manifest.test.mjs`: `TOOL_ACTIONS table matches spec and is frozen`, `POLICY table contains all agents and matches spec`, `committed manifest is not stale: buildManifest on repo root serialises equal to file` | `VERIFIED-TEST` |
| Native hook denial | `hooks/scene-builder-scope.test.mjs`, `hooks/scene-builder-scope.grok.test.mjs`, `tests/slice/probe.test.mjs`, `tests/slice/evidence/ac17-hook.final.txt` | `hooks/scene-builder-scope.test.mjs`: `scene-builder may not write STORY.md`, `dot-dot escape is denied`, `symlinked ancestor resolving outside is denied`, `hardened identity match: agent_type variants deny write outside shadow`, `hardened identity match: nested and extended alias fields deny write outside shadow`; `hooks/scene-builder-scope.grok.test.mjs`: `search_replace outside the shadow is denied`, `write and hashline_edit outside the shadow are denied`; `tests/slice/evidence/ac17-hook.final.txt` | `VERIFIED-TEST`, `VERIFIED-RUN` (Claude Code) |
| Unknown host rejection | `tests/portability/host-capabilities.test.mjs` | `CAP-HOST-ENFORCEMENT: claude-code scene-builder with CLAUDECODE=1 returns ok`, `claude-code with env: {} or { CLAUDECODE: '0' } gives BLOCKED with corroboration reason`, `grok, cursor, pi, '', 'unknown', and 'claude' give BLOCKED, even with CLAUDECODE=1 set`, `CLI: spawned with env CLAUDECODE=1 exits 0 for claude-code; spawned without CLAUDECODE exits 3`, `CLI: exits 3 for cursor and stdout is JSON` | `VERIFIED-TEST` |
| Unapproved source immutability | `packages/imagine-kit/test/patch-apply.test.mjs`, `packages/imagine-kit/test/stage-promote.test.mjs`, `packages/imagine-kit/test/commit.test.mjs`, `hooks/scene-builder-scope.test.mjs` | `packages/imagine-kit/test/patch-apply.test.mjs`: patch validation rejects unapproved source edits; `hooks/scene-builder-scope.test.mjs`: `scene-builder may not write STORY.md` | `VERIFIED-TEST` |
| Gate quote and provenance enforcement | `packages/imagine-kit/test/gate.test.mjs`, `packages/imagine-kit/test/gate-assets.test.mjs`, `packages/imagine-kit/test/gate-flagged.test.mjs` | Gate quote validation (`NEEDS_USER` on empty quote) and provenance tracking across G0–G7 | `VERIFIED-TEST` |
| Session restart and compaction recovery | `tests/behavioral/run.test.mjs`, `packages/imagine-kit/test/wp2-ledger.test.mjs` | Instruction-only coverage via `PROC-BRIEF-START` and `CAP-HOST-ENFORCEMENT` (main agent rereads mandatory files in full and re-runs `host/check-stage.mjs` after compaction/resume; runtime probe pending per host). State ledger mechanics covered by `packages/imagine-kit/test/wp2-ledger.test.mjs` and `tests/behavioral/run.test.mjs` | `VERIFIED-TEST` (ledger & behavioral restart mechanics) / instruction-only (agent compaction prompt recovery; runtime probe pending per host) |
| Skill mandatory reads portability | `tests/portability/skill-reads.test.mjs` | `every skill read of claude-code-platform.md is conditional on claude-code host-id`, `every skill that mentions harness-portability.md as a read also mentions hosts/<host-id>.md` | `VERIFIED-TEST` |
| Clean checkout installation | `tests/slice/probe.test.mjs`, `tests/portability/preflight.test.mjs` | `tests/portability/preflight.test.mjs`: `a found tool returns found: true and first non-empty stdout line`, `the node version check passes for >= 22 and fails for < 22`, `CLI prints JSON and handles exit codes`; `tests/slice/probe.test.mjs` | `VERIFIED-TEST` |

## 12. Definition of done evidence (issue #18)

This section maps each of the five Definition of Done (DoD) requirements for issue #18 to the files, tests, and commands that satisfy it, embedding the exact execution output collected on the integration branch.

### 12.1 Item 1: Cross-host contract and capability matrix with adapter checklist

*Requirement*: Cross-host contract and capability matrix exist with a concrete adapter implementation checklist.

*Satisfied by*:
- `docs/contracts/harness-portability.md` (Sections 1, 5, 9, 10).
- `docs/contracts/hosts/*.md` (`claude-code.md`, `grok.md`, `antigravity.md`, `cursor.md`, `pi.md`).
- Validation scripts `tools/check-forbidden-names.mjs` and `tools/check-traceability.mjs`.

*Embedded evidence*:
```
$ npm run check:names
> node tools/check-forbidden-names.mjs

forbidden names: clean
$ npm run check:rules
> node tools/check-traceability.mjs --registry-only

registry ok: 203 rules
```

### 12.2 Item 2: Testable, versioned root/CLI resolution and action mapping

*Requirement*: A testable, versioned root/CLI resolution + action-mapping approach exists; no new host must depend on `CLAUDE_SKILL_DIR` or `CLAUDE_ENV_FILE`.

*Satisfied by*:
- Module `host/plugin-root.mjs` implementing the `imagine-root/1` protocol with strict fail-closed priority order.
- Module `host/preflight.mjs` probing required execution binaries.
- Host-neutral kit invocation recipe in Section 4.6 and across all stage skills (`skills/*/SKILL.md`).
- Portable action mapping in Section 5.
- Test suites `tests/portability/plugin-root.test.mjs` and `tests/portability/preflight.test.mjs`.

*Embedded evidence*:
```
$ node host/plugin-root.mjs --skill-dir "$PWD/skills/imagine"
{"ok":true,"protocol":"imagine-root/1","root":"<repo>","kit":"<repo>/packages/imagine-kit/bin/imagine-kit.mjs","source":"skill-dir"}
exit=0
$ node host/preflight.mjs
{"ok":true,"tools":[{"name":"node","found":true,"version":"v22.23.4","required":false},{"name":"npx","found":true,"version":"10.9.9","required":false},{"name":"uv","found":true,"version":"uv 0.12.18 (Homebrew 2026-09-22 aarch64-apple-darwin)","required":false},{"name":"ffmpeg","found":true,"version":"ffmpeg version 9.0.2 Copyright (c) 2000-2026 the FFmpeg developers","required":false},{"name":"ffprobe","found":true,"version":"ffprobe version 9.0.2 Copyright (c) 2007-2026 the FFmpeg developers","required":false},{"name":"codex","found":true,"version":"codex-cli 0.166.0","required":false}]}
exit=0
```

### 12.3 Item 3: Existing Claude Code flow remains green

*Requirement*: Existing Claude Code flow remains green, including negative isolation tests and gate/provenance tests.

*Satisfied by*:
- Passing root test suite (212 pass, 0 fail).
- Passing `packages/imagine-kit` test suite (425 pass, 0 fail, 3 skipped). (Note: the kit suite showed one transient failure in two earlier runs, not reproduced in this run).

*Embedded evidence*:
```
$ npm test
  ...
1..212
# tests 212
# suites 0
# pass 212
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 30578.969833
$ npm --prefix packages/imagine-kit test
  ...
1..428
# tests 428
# suites 0
# pass 425
# fail 0
# cancelled 0
# skipped 3
# todo 0
# duration_ms 127659.5815
```

### 12.4 Item 4: Rejection of forbidden writes and unverified stage blocking

*Requirement*: At least one contract/fixture test proves a forbidden worker write is rejected or the stage is blocked when host enforcement is absent.

*Satisfied by*:
- Stage blocking on unverified hosts and missing environment corroboration in `host/capabilities.mjs` and `host/check-stage.mjs`, verified by tests in `tests/portability/host-capabilities.test.mjs`:
  - `CAP-HOST-ENFORCEMENT: claude-code scene-builder with CLAUDECODE=1 returns ok`
  - `claude-code with env: {} or { CLAUDECODE: '0' } gives BLOCKED with corroboration reason`
  - `grok, cursor, pi, '', 'unknown', and 'claude' give BLOCKED, even with CLAUDECODE=1 set`
  - `CLI: spawned with env CLAUDECODE=1 exits 0 for claude-code; spawned without CLAUDECODE exits 3`
  - `CLI: exits 3 for cursor and stdout is JSON`
- Rejection of forbidden subagent writes in `hooks/scene-builder-scope-lib.mjs`, verified by tests in `hooks/scene-builder-scope.test.mjs`:
  - `scene-builder may not write STORY.md`
  - `dot-dot escape is denied`
  - `symlinked ancestor resolving outside is denied`
  - `hardened identity match: agent_type variants deny write outside shadow`
  - `hardened identity match: nested and extended alias fields deny write outside shadow`

*Embedded evidence*:
```
$ CLAUDECODE=1 node host/check-stage.mjs --host claude-code --stage scene-builder
{"ok":true,"status":"ok","host":"claude-code","stage":"scene-builder","reason":null}
exit=0
$ env -u CLAUDECODE node host/check-stage.mjs --host claude-code --stage scene-builder
{"ok":false,"status":"BLOCKED","host":"claude-code","stage":"scene-builder","reason":"host claim not corroborated by environment"}
exit=3
$ node host/check-stage.mjs --host cursor --stage scene-builder
{"ok":false,"status":"BLOCKED","host":"cursor","stage":"scene-builder","reason":"missing verified enforcement evidence: scene_builder_enforcement (UNKNOWN), hook_failure (UNKNOWN)"}
exit=3
```

### 12.5 Item 5: Independent follow-on host packaging and runtime probes

*Requirement*: The follow-on issues can implement host packaging and runtime probes independently without changing core production semantics.

*Satisfied by*:
- Portable agent manifest compilation via `tools/agent-manifest.mjs` into `docs/contracts/agents.manifest.json`, decoupling host adapters from core `agents/*.md` definitions.
- Host mapping documents defining concrete extension points for follow-on issues: #19 (Antigravity), #20 (Cursor), #21 (Pi), and #24 (Grok hardening).

*Embedded evidence*:
```
$ npm run check:agents
> check:agents
> node tools/agent-manifest.mjs --check
```
