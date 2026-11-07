# Native transparent foreground: smoke run

Date: 2026-11-08. Scope: one real probe generation, as step 2 of the smoke plan. The run stopped after the probe. This file records observed outputs only.

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
4. By the plan's stop rule (`transparent_flag` is not `true`) the run stopped here. No other pose was generated. Rollout step 3 stays blocked.

5. Owner review (2026-11-08): the owner opened the output and reported that the cutout has no background. One sample only.

## Not observed

- Any pose other than `kuli-modern-phone` (`kuli-dipaksa-balik` and the complex poses were not run).
- Whether native alpha repeats across attempts or poses, and the suspect/fallback rate.
- Whether the resize-before-save behavior is constant or varies per run.
- Whether `foreground_loss` or the other flags fire on real fallback output.

## Follow-up: binding fix

The hash binding assumes `out.png` is byte-identical to Codex's `savedPath`; this run shows it is not when the agent resizes. Effects seen: `transparent_flag` and `revised_prompt` were `null` for the transparent image. For non-transparent images the same binding would also have dropped `revised_prompt`. Commit `d287ffb` restores the previous last-item lookup for legacy and opaque flows (pinned by tests that simulate an unbindable session item). Transparent flows keep the bound lookup, so an unbound image still records `transparent_flag: null`. A real resized run of a non-transparent image has not been repeated.
