# Install Imagine on Codex

The plugin distributes six production skills and five generated native-agent TOMLs. Plugin installation exposes the skills; the one-time setup below registers the agents. Canonical Markdown sources remain shared with Claude and Antigravity. Codex-specific dispatch is described in [the host mapping](../contracts/hosts/codex.md).

The [recorded native run](evidence/codex-native-run.md) used Codex CLI 0.169.0 on macOS arm64. Generation/setup are portable Node.js code; runtime behavior on other clients/platforms and a complete production film remain unverified.

## Install

```bash
codex plugin marketplace add rfxlamia/imagine
codex plugin add imagine@rfxlamia --json
codex plugin list --json
```

Before these changes reach main, add the marketplace with `--ref "<PR-branch>"`, or use an absolute local checkout path for development. Inspect installed files; unpublished files are not included in a normal remote install.

Use the `installedPath` returned by plugin add:

```bash
cd "<installedPath>"
npm install
node host/plugin-root.mjs --skill-dir "<installedPath>/skills/imagine"
node host/codex-agents.mjs --dry-run
node host/codex-agents.mjs --install
node host/codex-agents.mjs --check
```

Require each setup result's `ok: true`. Setup manages only five `imagine_*.toml` files under `$CODEX_HOME/agents` (default `~/.codex/agents`). It changes no model, provider, sandbox, authentication or hook configuration. Conflicting or edited agent files are preserved and reported; inspect and resolve them explicitly. There is no force-overwrite option. `--codex-home <absolute-directory>` selects an isolated test destination.

Restart Codex. Confirm its native role inventory contains `imagine_storyboard_artist`, `imagine_previz_designer`, `imagine_fx_designer`, `imagine_continuity_reviewer` and `imagine_scene_builder`. Production skills appear under `imagine:*`. Ask to use Imagine from your working directory; film projects remain under `.imagine/`, and creative gates require the user's own answers.

Skills direct the main agent to the active host mapping before dispatch. Codex uses registered native roles, which inherit parent capabilities and permissions. Planning/review no-write policy is backed by the parent hash/backup/restore guard; it is not a separate read-only sandbox. Scene promotion uses kit guard and the original parent-held stage digest. No subprocess or per-dispatch credential setup is required.

## Update and remove

Refresh with `codex plugin marketplace upgrade rfxlamia`, then `codex plugin add imagine@rfxlamia --json`. In the returned installed root, run npm install and repeat agent dry-run/install/check. Install is idempotent and refreshes unedited Imagine-owned files to the new source revision. Restart and verify discovery again. Edited files are reported as conflicts.

Before removing the plugin, run from its installed root:

```bash
node host/codex-agents.mjs --remove
codex plugin remove imagine@rfxlamia
```

Require successful removal, then restart. Plugin-manager removal alone does not remove standalone TOMLs. Edited agent files are preserved for explicit resolution. Film projects, unrelated agents, user configuration and authentication remain intact. Contributors regenerate `codex-agents/` from `agents/*.md`; `npm run check:codex-agents` verifies drift.
