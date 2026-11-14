# Host Adapter Mapping: Codex

Host ID: `codex`. Imagine uses native custom agents generated from canonical `agents/*.md` sources. Codex owns spawning, waiting, follow-up, cancellation and result delivery. Install with [the Codex guide](../../harnesses/codex-install.md).

## First use and direct invocation

Resolve R from the installed skill's absolute path using `host/plugin-root.mjs`. Read this mapping before project actions, dispatch or resume, including direct stage-skill invocation. This mapping applies only to the active Codex harness.

Plugin installation exposes skills. Run `node "<R>/host/codex-agents.mjs" --check` to verify the additional native-agent setup. If missing or stale, follow the install guide: preview with `--dry-run`, apply `--install`, then restart Codex. Preserve edited/conflicting files; report their paths. Do not fabricate role availability or create agent definitions ad hoc.

After restarting, require these names in the native spawn tool's role inventory. Files on disk alone do not prove an existing session loaded them.

| Canonical role | Native agent name | Result |
| --- | --- | --- |
| storyboard-artist | imagine_storyboard_artist | Storyboard patch; canonical author unchanged |
| previz-designer | imagine_previz_designer | Previz patch; canonical author unchanged |
| fx-designer | imagine_fx_designer | FX patch; canonical author unchanged |
| continuity-reviewer | imagine_continuity_reviewer | Findings; no approvals |
| scene-builder | imagine_scene_builder | Staged scene proposal |

Dispatch through the active client's native spawn/delegation tool using its observed arguments. Supply the stage's complete mandatory-source brief, current scoped hashes and exact `brief_hash`. Wait for completion and inspect the returned response. Production dispatch uses native threads; there is no second CLI session, temporary authentication home or process launcher.

## Permissions and handoff

Native agents inherit the parent's model, effort, provider, sandbox, approvals, MCP and skills. TOMLs do not override them. Claude frontmatter remains source metadata. Generated developer instructions map Read/Glob/Grep to read-only shell inspection. Use an available read-only viewer for images. Scene Write/Edit use native editing tools, and scene Bash remains limited to canonical pinned HyperFrames operations.

User-approved native Codex policy: planning/review agents have no authorized write action; technical capabilities inherit from the parent. This is instruction-level read-only with mandatory parent integrity checks, not a separate enforced read-only sandbox. Before dispatch, record hashes and restorable copies of the stage's full protected set. After completion, detect edits, created paths and deletions; restore unauthorized differences, reject the result and report the violation. Coordinate concurrent writers; do not silently overwrite their work. The narrower kit guard does not replace this parent guard.

Save planning patches byte-for-byte and invoke existing `patch apply` only after provenance, semantic and protected-state checks pass. Findings never approve gates or waivers. A completed thread returning `status: blocked` or reviewer `outcome: blocked` remains blocked. Do not silently repair stale or invalid output.

## Scene staging and promotion

Before the first scene dispatch and after resume/compaction, run `node "<R>/host/check-stage.mjs" --host codex --stage scene-builder`; require exit 0 and `status: ok`. The parent runs `stage-shot <id>` and retains `data.guard_digest` in context. Never include that digest in the child brief or a worker-readable file.

Provide the exact shot/shadow identity, approved frame, source and asset evidence, `brief_hash`, and actual installed HyperFrames skill/format/motion references. The generated preview host belongs to the parent; verify it against the runtime contract before dispatch. The scene agent writes only inside its assigned shadow. Review actual pinned lint outcomes and the three-attempt limit. Parent network/cache permissions govern runtime availability; prepare dependencies through authorized setup when needed.

The canonical scene instruction's hook-enforcement claim is superseded for Codex: bundled Claude hooks are disabled. Protection consists of the parent hash/backup/restore guard and the detective kit guard. Only the parent invokes `promote-shot <id> --guard-digest <original-parent-held-digest>` after accepting the proposal. Promotion re-lints, verifies the baseline, and merges local assertions into the live root. No child promotes or approves itself.

Kit guard detects protected changes and refuses promotion; it does not prevent or undo writes. Exclusions include project state, journal, root motion, other-shot compositions, all staging, guard storage and runtime/output paths. See `EXCLUSIONS` in `packages/imagine-kit/src/edit/guard.mjs`. Restore unauthorized changes before retrying; rebaseline only for an actual user-made or approved change.

## Maintenance and evidence

`node tools/agent-codex.mjs --write` regenerates TOMLs; `--check` detects missing, edited or extra artifacts. The installer verifies packaged drift and preflights all five destinations, refusing symlinks, unowned files and edited managed files. Install/update refreshes only unedited Imagine-owned agents; remove deletes only those files. Neither operation changes config, authentication, hooks, unrelated agents or film projects. Restart to refresh the native inventory.

The [native run](../../harnesses/evidence/codex-native-run.md) verifies six-skill installation, all five native role dispatches, a fresh direct planning entrypoint and a synthetic scene/lint/promotion with tamper controls on Codex CLI 0.169.0/macOS arm64. Missing-input probes and a truthful blocked storyboard do not establish completed production workflows for those roles. A full film and other clients/platforms remain unverified. Earlier subprocess reports are historical and do not qualify native dispatch. Generation/installation require Node.js and the plugin's root dependencies.
