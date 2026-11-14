# Codex stage 8b evidence: subprocess scene-builder and kit guard

Historical subprocess experiment. The launcher was retired when distribution moved to native TOML agents; this report does not qualify native discovery or scene execution.

Recorded 2026-11-14 on macOS arm64, Node v22.23.4, Codex CLI 0.169.0, OpenAI gpt-6.1-sol with medium reasoning. The canonical scene-builder body was loaded by `host/codex-worker.mjs` from the working checkout. This is a real subprocess/HyperFrames run on a synthetic kit fixture, not a production film or actual user gate approvals.

## Verified path

The main process created a disposable edit-ready fixture with helper-generated approval records, ran real `stage-shot s01` and retained its guard digest in memory. It aligned the main-owned preview host id with the supplied format contract before dispatch, and provisioned HyperFrames 0.8.223 under the shot's `.npm-cache`. The child inherited the current model/effort, used an isolated Codex home and workspace-write sandbox from the exact shadow directory, with hooks/apps/plugins/delegation disabled and MCP preflight empty. Parent setup and promotion used actual tools; the fixture's fake npx runner was not used for these operations.

The worker read supplied canon/style/runtime sources, wrote `compositions/s01.html` and shadow-root `index.motion.json`, invoked pinned lint once and returned `status: proposed`. The observed command was:

```text
HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.8.223 lint /private/var/folders/0s/810b2f2x4qgcyztqswd7fw580000gn/T/imagine-kit-8CXtMF/.imagine/2026-11-01-keeper/stage/edit/s01 --json
exit: 0
ok: true
errorCount: 0
warningCount: 0
filesScanned: 2
version: 0.8.223
```

The parent independently confirmed the protected snapshot was unchanged. Real `promote-shot s01 --guard-digest <original-parent-held-digest>` returned exit 0, copied the exact staged composition, merged its two motion assertions and removed the baseline. Promotion leaves the edit item proposed; it grants no creative gate approval.

## Negative controls

Each control used an independent copy of the worker's valid staged fixture. Mutations were injected by the parent for testing, not attempted by the canonical worker. Every promotion ran the actual kit and HyperFrames.

| Parent-injected mutation | Promotion result | Destination and baseline |
| --- | --- | --- |
| Append unauthorized content to bible.yaml | exit 1, HARD-SHADOW-ONLY | Destination unchanged; baseline preserved |
| Write directly to live edit/compositions/s01.html | exit 1, HARD-SHADOW-ONLY | Unauthorized sentinel unchanged by promotion; baseline preserved |
| Change bible.yaml and rewrite baseline to match | exit 1, HARD-SHADOW-ONLY, original digest mismatch | Destination unchanged; baseline preserved |

The last control requires the original parent-held digest. Without it, consistent baseline tampering is a documented limitation of the generic kit path. The Codex scene launcher requires that digest and checks it and the protected snapshot before and after dispatch. Promotion must receive it again.

## Runtime cache finding

The first disposable run returned blocked after real lint failed with ENOTFOUND: the sandbox could not reach npm. A second attempt to configure offline mode failed bootstrap because an override encoded a map as a string; scalar dotted overrides corrected it. Offline mode using the shared home cache then returned ENOTCACHED. No failed attempt was promoted. The successful run used a parent-provisioned writable cache under the shadow and forced offline mode through scalar CLI overrides. This is a required setup step, not evidence that sandboxed network access works.

## Evidence and scope

- Canonical scene-builder SHA-256: `088a96891bcb4a1bc02174cf760902023d01bc46ad00b6613952d6f6caab1451`.
- Tested launcher SHA-256: `ea6fef08b7e92eae6cc7296050ecdfb45335d3cbd36608402bf20a8f3a902325`.
- Dispatched brief identity: `17e8d36a029bdacd2954fb222b2bbd93c91adfb96f5eefe6e650507b7cb7c73d`; the worker echoed it unchanged with `shot_id: s01`, the exact shadow root, `lint_attempts: 1` and `lint_clean: true`.
- Actual lint command/result, promotion outcome and all three tamper results are recorded above. Detailed research scripts and logs remain local and are excluded from distribution. The [host mapping](../../contracts/hosts/codex.md#scene-transport-and-kit-guard) documents the stage/cache/dispatch/promotion procedure; reproduce it only on disposable fixtures.
- Guard integration suite: 21 passed. Launcher regression suite: 36 passed, including identity, baseline, shadow symlink/config, malformed handoff, protected drift and existing read-only/cleanup cases. Scene-positive cases were observed RED before implementation; live tools supply the runtime proof.

`subagents: VERIFIED-RUN` records the separate-process transport observed for storyboard and scene-builder, not native plugin agent registration or successful workflows for all five roles. `kit_guard_run` points here, allowing `check-stage` to return `ok` with `isolation: kit-guard`. Hook capabilities and preventive scene enforcement remain UNKNOWN.

Kit guard is detective: it refuses promotion on changes in its protected set; it does not stop or undo writes. Its exclusions include project state, journal, live root motion, other-shot compositions, all shadow workspaces, guard storage and runtime/output paths; see `packages/imagine-kit/src/edit/guard.mjs` for the full list. A shadow cwd/workspace sandbox also permits runtime temporary/cache writes and does not prove a universal write boundary. There was no render, snapshot, font-resolution check, malicious-worker escape test, full G0–G7 run, or new previz/fx/continuity workflow verification. Platform/version/auth/provider restrictions of the initial adapter still apply.
