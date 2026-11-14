# Install Imagine on Codex

This initial adapter supports macOS arm64 with Codex CLI 0.169.0. It packages the six Imagine skills and canonical agent instructions, with read-only worker transport for planning/review and a staged scene-builder transport using the detective kit guard. A real single-shot build/lint/promotion is verified; a complete film workflow remains unverified.

The worker currently requires projects without `.codex/config.toml` or `.codex/hooks.json` in their project ancestry. It blocks those layers rather than trusting project MCP suppression. Use an independent working directory that already meets this condition; do not delete or change existing project configuration to bypass the guard.

## Install

```bash
codex plugin marketplace add rfxlamia/imagine
codex plugin add imagine@rfxlamia --json
codex plugin list --json
```

This repository must contain the Codex adapter changes before a Git install can include them. For an uncommitted development checkout, use its absolute local path instead of `rfxlamia/imagine` in marketplace add, with an isolated test Codex home. Do not claim a remote install includes unpublished files.

To try a published PR branch before merge, add the marketplace with `codex plugin marketplace add rfxlamia/imagine --ref "<branch>"`, replacing `<branch>` with the PR's branch name, then run plugin add and inspect the installed files. The unqualified marketplace command above uses the default branch.

Read the `installedPath` returned by plugin add. Install dependencies there:

```bash
cd "<installedPath>"
npm install
node host/plugin-root.mjs --skill-dir "<installedPath>/skills/imagine"
node host/preflight.mjs
node host/check-stage.mjs --host codex --stage scene-builder
```

The final command should return `status: ok`, `isolation: kit-guard`, exit 0. This records the verified Codex subprocess/kit path and does not claim a preventive hook. Missing pipeline tools still block their later steps. Before each scene dispatch, the main agent stages the shot, retains the original guard digest in parent context and provisions HyperFrames 0.8.223 in the shadow's offline cache. Follow the scene procedure in [the Codex host mapping](../contracts/hosts/codex.md#scene-transport-and-kit-guard); promotion must use the original digest. Runtime and tamper evidence are recorded in [the stage 8b report](evidence/codex-8b-run.md).

Start a new Codex session and ask to use Imagine. Namespaced skills appear as `imagine:imagine`, `imagine:imagine-canon`, `imagine:imagine-plan`, `imagine:imagine-generate`, `imagine:imagine-edit` and `imagine:imagine-deliver`. Projects use `./.imagine/` in the user's working directory. Every creative gate still requires the user's own answer.

The `.codex-plugin/plugin.json` manifest explicitly disables bundled Claude hooks. It does not claim preventive scene-builder enforcement. Project configuration/hook rejection also covers the shadow's ancestry. No setup copies agent files to `~/.codex/agents` or project `.codex/agents`, and no user trust settings are changed persistently. The main agent must read [the Codex host mapping](../contracts/hosts/codex.md) for dispatch and handoff, rather than treating native custom agents as equivalent.

## Update and remove

Refresh the catalog with `codex plugin marketplace upgrade rfxlamia`, then use `codex plugin add imagine@rfxlamia` to refresh the plugin and inspect the returned installed path/version. Run npm install in that installed root after refresh. Verify skill discovery in a fresh session. Exact update behavior must be checked on the pinned client; catalog refresh alone is not proof that the active installed files changed.

```bash
codex plugin remove imagine@rfxlamia
```

Removal should affect only the plugin's cache/configuration; the adapter installs no personal agent files. It does not delete `.imagine` projects. The public plugin directory submission process is separate from this repository marketplace path.

Do not automatically upgrade Codex, change the model/provider, copy authentication credentials into the repository, or relax BLOCKED checks during installation. Authenticate with the user's normal Codex installation if an existing OpenAI auth.json is unavailable; keychain-only and custom-provider workers need further adapter work.
