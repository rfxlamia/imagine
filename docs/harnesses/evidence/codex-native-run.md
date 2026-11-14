# Native Codex installation and scene evidence

Recorded 2026-11-14 with Codex CLI 0.169.0, Node v22.23.4, macOS arm64, gpt-6.1-sol and medium effort. [Machine-readable results](codex-native-run.json) record role names, generated-file hashes, skill discovery, guard controls and lifecycle outcomes. Earlier subprocess reports are historical; this run qualifies the native transport independently.

## Installed package and native discovery

A copy of the working plugin was registered as a local marketplace and installed into a new temporary CODEX_HOME. Root npm dependencies were installed there. The bundled agent setup ran dry-run/install/check against that temporary home; five generated TOMLs were installed. Codex app-server skills/list returned six enabled imagine:* skills, and plugin/read returned no bundled hooks. No main user agent/configuration files were changed.

New Codex sessions spawned all five registered native roles. Child session metadata independently recorded these agent_role values:

- imagine_storyboard_artist
- imagine_previz_designer
- imagine_fx_designer
- imagine_continuity_reviewer
- imagine_scene_builder

The remaining-role registration probes deliberately supplied no project, sources or approvals. Previz and FX returned blocked; continuity returned blocked/hold_for_missing_evidence. These establish discovery and dispatch, not successful production workflows.

## Fresh direct skill entrypoint

A new session received the installed imagine-plan SKILL.md path and a disposable G0-G3 fixture. The prompt requested one storyboard proposal but supplied no adapter path or native role name. The session read the installed instructions, selected imagine_storyboard_artist and dispatched it natively. The role returned blocked because fixture helper approvals were synthetic and could not establish authentic creative decisions. The parent reported all 23 protected-file hashes unchanged, with no project paths created/deleted and no patch applied.

This verifies the direct-entrypoint routing path and truthful blocked handling. It does not establish a completed native storyboard workflow or permit synthetic records in a real film.

## Native scene and kit guard

A separate native qualification session dispatched imagine_scene_builder with the canonical synthetic shot brief, complete source/runtime references, source hashes and exact shadow root. The parent retained the stage digest in memory and independently snapshotted every project file outside the allowed shadow subtree. The main-owned preview host id was aligned with the supplied format contract before dispatch.

The child wrote compositions/s01.html and index.motion.json inside its shadow. Actual pinned HyperFrames lint ran once: exit 0, ok true, zero errors, zero warnings, two files scanned, version 0.8.223. The child returned proposed with the original brief hash. The external protected-file snapshot was unchanged. The parent then ran actual promote-shot with the original digest: exit 0 and baseline removed. Motion assertions were merged by the kit. Fixture helper approval records represent no real creative approval.

| Parent-injected control on independent staged copies | Observed result |
| --- | --- |
| Change bible.yaml | Promotion exit 1, HARD-SHADOW-ONLY, destination unchanged |
| Write directly to live edit/compositions/s01.html | Promotion exit 1, HARD-SHADOW-ONLY, destination unchanged |
| Change canon and rewrite baseline to match | Original parent-held digest rejects promotion, exit 1, HARD-SHADOW-ONLY |

These are parent-injected guard controls, not malicious-agent escape tests. Kit guard is detective and retains its documented exclusions. Native planning/review no-write is an instruction-level policy with parent hash/backup/restore, as explicitly accepted by the user; no independent read-only sandbox is claimed.

## Lifecycle and limits

Repeated dry-run/install/check kept the current files unchanged. Agent remove deleted exactly the five managed TOMLs while preserving an unrelated agent; reinstall/check/remove succeeded again. Installer operations preserved the temporary home's config. Native plugin removal exited 0 and removed its cache. The test authentication symlink was removed and original authentication remained intact. Unit cases additionally cover edited/unowned files, symlink conflicts, stale packaged artifacts, CLI aliases and generated drift.

The test parents explicitly used danger-full-access for the planning routing and scene qualification; missing-input probes used read-only. Those were temporary test-session policies, not installer changes or new per-agent permissions. User-level skills/account context remained visible. This was a new conversation and isolated installation, not a pristine upstream environment. No new native full storyboard, previz, FX or continuity production workflow, actual user creative gates, snapshot, render, font verification, full film, other-client/platform run, or remote marketplace installation was established. Claude/Antigravity sources remain canonical and static drift/size checks cover their shared instructions; no new live Claude run is claimed.
