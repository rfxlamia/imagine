# Native transparent foreground: smoke run

Date: 2026-11-08. Scope: three real generations (one probe, then two more poses). The owner ended the run after the third. This file records observed outputs only.

## Environment

- `codex --version`: codex-cli 0.166.0
- `ffmpeg -version | head -1`: ffmpeg version 9.0.2
- hyperframes pinned at `0.8.223` (not invoked in this run)
- Kit: branch `feat/native-transparent-foreground`, commits `f5ed667`..`52ca896`
- Project: a scratch copy of an existing portrait project (large bytes dirs not copied). The plan in the copy marks the four `kuli-poses` members `background: transparent`. G4 was re-approved in the copy only.

## Probe

Command: `img --batch kuli-modern-phone --redo kuli-modern-phone --note "smoke probe"` with `ref-kuli` v2 attached (approved ref). One attempt, one generation, exit 0.

| Pose | Refs attached | Logged `transparentBackground` (Codex session item) | Manifest `transparent_flag` | Classification | `cutout_method` | `remove-background` ran | `integrity_flags` | Review composite |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kuli-modern-phone.v3 | yes (ref-kuli.v2) | `true` | `null` | native (alpha min 0, max 255, transparent 0.594, partial 0.016, edge 0) | `native` | no | `[]` | `assets/composites/kuli-modern-phone.v3.png` (in the scratch copy) |

## Observations

1. With a reference image attached and explicit `transparent` intent, the generated image carried real alpha. The kit classified it `native` from pixels and did not call HyperFrames. The review composite shows a complete figure with chair and desk, no visible missing limb at normal zoom.
2. The raw Codex session item for this generation has `transparentBackground: true` and a `savedPath` PNG of 1254x1254 RGBA.
3. The file the kit received as `out.png` is 600x600 RGBA with a different sha256 from that `savedPath` file. The Codex agent re-encoded (resized) the image before saving it as `out.png`. The kit's hash binding therefore found no matching session item and recorded `transparent_flag: null`, as designed (no guess). It also found no revised prompt for this image (advice `PROC-REVISED-PROMPT`).
4. By the plan's stop rule (`transparent_flag` is not `true`) the run stopped after this probe. The owner then approved more poses (see Additional probes).
5. Owner review (2026-11-08): the owner opened the output and reported that the cutout has no background. One sample only.

## Additional probes

Two more poses were generated in the same scratch copy, with the same reference attached and `background: transparent` on each. One attempt each, exit 0.

| Pose | Classification | `cutout_method` | `remove-background` ran | `integrity_flags` | `transparent_flag` | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| kuli-dipaksa-balik.v5 | native | `native` | no | `[]` | `null` | Complete figure in the review composite. |
| kuli-rows-bawah.v4 (row of 7 figures) | native (alpha: transparent 0.739, partial 0.025, opaque 0.235, edge 0; bbox x 2..597 of 600) | `native` | no | `["edge_near"]` | `null` | `edge_near` fired as designed, because the row spans the full width. Seven complete figures. Tobacco plants between the figures are part of the foreground content. |

Totals for this run: 3 generations, 3 native results, 0 fallbacks. Across the three poses `remove-background` never ran. Owner review (2026-11-08): the owner inspected the outputs and judged the hypothesis answered: Codex image generation with `background: transparent` produces cutouts without a background. Three samples; this file claims no rate beyond them.

## Review composite

`assets/composites/<id>.v<n>.png` holds two panels side by side. Left: the cutout over saturated magenta, painted by the kit (not by Codex or the remover). Right: the raw crop rendered as RGB. For native results the right panel equals the cutout with its alpha dropped, so it shows hidden RGB under transparent pixels (stray red, green and white specks) that does not appear in the asset. The left panel is the one to judge. The magenta is a review backdrop only and is never in the approved asset. Whether to simplify the composite for native results was proposed and declined by the owner; it is unchanged.

## Binding findings

`transparent_flag` and `revised_prompt` were `null` for all three transparent images. Two causes were found:

1. The kit looked for `session id:` on stdout, but codex-cli 0.166.0 prints its banner, including the session id, on stderr. Commit `e03101b` reads it from stderr. This was a long-standing bug: no entry in the original project's manifest (80 entries) had ever recorded a `revised_prompt`.
2. The hash binding assumes `out.png` is byte-identical to Codex's `savedPath`. In probes 1 and 3 the agent re-encoded the image (1254x1254 saved, 600x600 `out.png`) before saving, so the sha256 differs and the binding finds no item, as designed (no guess). The session item itself logged `transparentBackground: true` in those runs. Probe 3 ran after `e03101b`, so its `null` is cause 2 only.

Commit `d287ffb` restores the previous last-item lookup for legacy and opaque flows (pinned by tests that simulate an unbindable session item). Transparent flows keep the bound lookup, so a resized image records `transparent_flag: null`. `transparent_flag` is provenance only and never gates classification, which is decided from pixels.

## Not observed

- Any rate of native success, fallback or flags beyond these three poses.
- Whether the resize-before-save behavior is constant or varies per run.
- Whether `foreground_loss` or the other flags fire on real fallback output.
- A real resized run of a non-transparent image after `d287ffb`.
