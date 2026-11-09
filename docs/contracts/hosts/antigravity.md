# Host Adapter Mapping: Antigravity

Host ID: `antigravity`

This document records the adapter status for the Antigravity platform. Adapter implementation is tracked in follow-on issue #19. See [docs/harnesses/antigravity.md](../../harnesses/antigravity.md) for the harness guide.

## 1. Action mapping

Every portable action defined in `docs/contracts/harness-portability.md` is currently unmapped:

| Action | Native Primitive | Status |
|---|---|---|
| 1. Load skill | Unmapped | `UNKNOWN` |
| 2. Load reference | Unmapped | `UNKNOWN` |
| 3. Read | Unmapped | `UNKNOWN` |
| 4. Search | Unmapped | `UNKNOWN` |
| 5. Edit/write | Unmapped | `UNKNOWN` |
| 6. Run process | Unmapped | `UNKNOWN` |
| 7. Dispatch planning agent | Unmapped | `UNKNOWN` |
| 8. Dispatch review agent | Unmapped | `UNKNOWN` |
| 9. Dispatch scene agent | Unmapped | `UNKNOWN` |
| 10. Return patch | Unmapped | `UNKNOWN` |
| 11. Recover after compaction | Unmapped | `UNKNOWN` |
| 12. Report error or BLOCKED | Unmapped | `UNKNOWN` |

## 2. Adapter status

- **Manifest directory**: `.antigravity-plugin/` is the first tracked per-host manifest directory; all five agents are emitted in `agy-agents/` and registered via root `agents.json`.
- **Scene-builder stage check**: Returns `ok` with `isolation: "kit-guard"` via `host/check-stage.mjs` (`host/capabilities.mjs`): `subagents` is `VERIFIED-RUN` and `kit_guard_run` points at `docs/harnesses/evidence/antigravity-8b-run.md`. The kit guard is detective and does not prevent writes. Gating is enforced by `check-stage` rather than by omitting `scene-builder`.
- **Adapter checklist status**: packaging landed; subagent dispatch and kit-guard live run recorded in `docs/harnesses/evidence/antigravity-8b-run.md`. Hook capabilities remain `UNKNOWN`.
