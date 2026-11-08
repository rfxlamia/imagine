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

- **Manifest directory**: `.antigravity-plugin/` is the first tracked per-host manifest directory.
- **Scene-builder stage check**: Returns `BLOCKED` via `host/check-stage.mjs` (`host/capabilities.mjs`) because `scene_builder_enforcement` and `hook_failure` are `UNKNOWN`.
- **Adapter checklist status**: packaging landed (unverified); live verification pending.
