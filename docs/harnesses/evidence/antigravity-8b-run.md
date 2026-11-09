# Antigravity Stage 8b live evidence (kit-guard path)

`host/capabilities.mjs` points `HOSTS.antigravity.kit_guard_run` at this file. Its existence is what lets `checkStage` pass Antigravity through the kit-guard path, so it records only values copied from real logs on the maintainer's machine.

## Environment

- Host: Antigravity CLI `agy` 1.5.3, macOS (darwin), run as `agy --dangerously-skip-permissions` from `~/content`.
- Node: v22.23.4.
- Plugin: installed from a local checkout of this repository at commit `1f1b762` (PR #28).
- Recorded: 2026-11-09 by the maintainer.

## Subagent dispatch (`subagents: VERIFIED-RUN`)

Agy session `d2ce10a9-a775-45e7-a3fd-ddb061955b50`, project `2026-11-09-operasi-cottage-34-000-tentara-menyerbu-pulau-kosong`. The session transcript holds 9 `invoke_subagent` calls, covering `storyboard-artist`, `previz-designer`, `fx-designer`, `continuity-reviewer` and `scene-builder`.

The scene-builder dispatch descriptor (`.system_generated/subagents/8760467e-484d-458c-876d-b2562e1c7e35.json`):

```
{'conversationId': '8760467e-484d-458c-876d-b2562e1c7e35', 'subagentDescriptor': {'typeName': 'scene-builder', 'role': 'Scene Builder s01'}, 'state': 'SUBAGENT_STATE_ALIVE', 'spawnStepIndex': 848, 'workspaceUris': ['file:///Users/rfxlamia/content']}
```

## Kit guard on the live project

Project journal, verbatim:

```
- j-000050 2026-11-09T14:41:25.000Z check-stage: BLOCKED stage=scene-builder host=antigravity reason="kit_guard_run evidence missing; subagents not VERIFIED-RUN"
- j-000051 2026-11-09T14:54:50.000Z check-stage: OK stage=scene-builder host=antigravity isolation=kit-guard
- j-000052 2026-11-09T14:56:12.691Z export-hf: 9 shots, 28 assets
- j-000053 2026-11-09T14:56:25.043Z stage-shot: s01 -> stage/edit/s01
```

`stage-shot s01` wrote the guard baseline `stage/guard/s01.json` (opening lines):

```
{
  "shot": "s01",
  "files": {
    ".history/STORY.r0.md": "da129ae2a03db6b750fe376f254d4d4b49debc86f9f3216369eaa53210897beb",
    ".history/STORY.r1.md": "90d5d4536b8cc72d004a5a8ad892634211ac95bbe5964f289a2474ad2135cdb8",
```

The `OK` at j-000051 came from the installed plugin copy (`~/.gemini/config/plugins/imagine/host/capabilities.mjs`), which the agy main agent edited at the maintainer's instruction to set `subagents: "VERIFIED-RUN"` and `kit_guard_run: "tests/slice/evidence/guard-antigravity.txt"`. That local edit is superseded by this file and the matching change in the repository. Reinstall the plugin to drop it.

## Full pipeline on Antigravity

Project `2026-11-08-gaji-dipotong-lalu-kapal-perang-diambil-alih` ran on agy through stage-shot/promote-shot for 27 shots, draft render and QC, G6, final render and QC, and G7:

```
- j-000222 2026-11-09T07:26:34.950Z qc: post/gaji-dipotong-lalu-kapal-perang-diambil-alih.v1.mp4 0 error(s)
- j-000223 2026-11-09T07:34:12.659Z gate: G7 approve g7 quote="(Recommended) Setujui Pengiriman Final G7 untuk video post/gaji-dipotong-lalu-kapal-perang-diambil-alih.v1.mp4"
```

## Negative tamper checks

Procedure steps 6(b) (tamper `bible.yaml` while staged) and 6(c) (direct write to `edit/compositions/<id>.html`) were not run live on Antigravity. They are covered by the host-neutral kit suite, which passed on the same machine:

```
$ node --test packages/imagine-kit/test/guard-integration.test.mjs
# pass 21
# fail 0
```

## Coverage

The kit guard is detective. It detects changes to canon, plan inputs and media after `stage-shot` and refuses `promote-shot` with `HARD-SHADOW-ONLY`. It does not prevent writes. See `docs/harnesses/antigravity.md`, section "What It Does NOT Do".
