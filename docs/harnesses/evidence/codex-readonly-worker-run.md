# Codex read-only adapter smoke evidence

This records the initial read-only pilot. Scene support was subsequently verified through the [Codex stage 8b kit-guard run](codex-8b-run.md); its conditional capability opening supersedes the scene BLOCKED state recorded below.

- Recorded: 2026-11-14, macOS arm64, Codex CLI 0.169.0.
- Source: uncommitted adapter changes based on repository commit `4f47f007654635c9083a7066f9d240ee67f7a955`.
- Scope: local marketplace packaging, read-only storyboard transport, configuration rejection and lifecycle tests. No scene-builder or full film verification.

## Packaging

A separate temporary Codex home installed a copy of the current checkout through its local marketplace. The copy excluded ignored research clones, caches, personal settings and templates. Root npm dependencies were installed with lifecycle scripts disabled. The installed root passed `host/plugin-root.mjs`.

Actual skills/list returned the six `imagine:*` skills. Actual plugin/read returned `hooks: []` after the manifest used the explicit inline object `hooks: {hooks: {}}`. A first trial using `hooks: []` still discovered Claude hooks; that representation was rejected and covered by the manifest regression test. The final installed manifest bytes matched the source manifest. Reinstall refreshed those bytes in the local cache. Plugin removal returned exit 0 and removed the isolated installed path. No personal agent files were installed or removed.

These are local-cache results for unpublished files, not proof that the GitHub marketplace currently contains this adapter. No git commit or push was performed.

## Project configuration

An initial runtime probe found that CLI untrusted trust overrides did not suppress a project layer in the tested app-server, and mcp list omitted a project MCP server that config/read exposed. Thus neither mechanism is treated as sufficient for project-layer isolation.

The final launcher rejects project config/hook layers before any worker starts. A real temporary project containing hostile instructions/model/feature flags and a fake mutating MCP command was rejected as BLOCKED. The MCP startup marker was absent. On a clean fixture, config/read confirmed the pinned main model, canonical instruction marker, disabled apps/generation/delegation and no MCP server; mcp list was empty. These probes did not invoke the fake mutating tool.

## Production launcher handoff

The actual `host/codex-worker.mjs` launched storyboard-artist with provider openai, model gpt-6.1-sol and medium effort in a read-only session with the configured feature restrictions. The fixture used the kit's synthetic unit-test approvals and simulated S2 evidence; neither represents actual user approvals or image generation.

The canonical source SHA-256 returned by the launcher was `da1780fd8bd28c4b55001cf253c27cce73f75757578ef3189262349713f82d80`. The response contained 6214 characters and was returned as proposed, without parent edits. The pre/post worker project snapshot matched. A changed-canon clone rejected that patch with exit 4 and preserved STORY. On the original fixture, patch apply exited 0, created STORY revision 1 and proposed s01/s02/s03. validate story exited 0; L01–L03 each occurred once and duration totaled 13 seconds. Bible, style and narration hashes remained unchanged.

The first parent verifier incorrectly counted characters when the valid voiceover grammar was a string. Its counting was corrected to inspect unit IDs; the original worker output and already-successful kit apply/validation were not changed. Advisory creative checks reported as not_run remain unverified.

## Regression and review

- Final focused adapter tests: 21 passing, including process failure/timeout, unsupported configurations, output rejection and signal cleanup.
- Final repository suite: 257 passing.
- Kit suite: 476 passing, 2 skipped, 0 failures.
- Rule registry and canonical/Antigravity agent drift checks passed.
- SIGINT and SIGTERM subprocess tests confirmed child/grandchild termination, private-home deletion and intact original authentication.
- Independent final code review found one Important issue: canonical continuity-reviewer `outcome: blocked` was classified as proposed. YAML and Markdown regression cases first failed, then passed after the launcher preserved them as BLOCKED.
- The existing name checker still reports hits only in ignored local `.internal`, `.opencode` and `copilot` material. Those unrelated files were not modified.

No four-role workflow claim is inferred from one storyboard handoff. At the time of this pilot, `HOSTS.codex` remained UNKNOWN for scene capabilities and stage 8b was BLOCKED; the subsequent stage 8b report supplies its separate qualification. The restricted inventory is based on pinned client/configuration and live spike evidence, not a programmatic check before every tool call. Concurrent configuration changes and other platforms/versions are not verified.

This report records the observed packaging and storyboard results. Detailed research logs remain local and are excluded from distribution; no runtime capability depends on those files. See the [Codex host mapping](../../contracts/hosts/codex.md) for the reproducible dispatch and parent-handoff procedure.
