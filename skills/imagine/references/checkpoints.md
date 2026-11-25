# Checkpoint commands

## Running a Checkpoint

`imagine-kit checkpoint <Q1|Q2|Q3> run [--scope <id,…>] [--mp4 <file>] [--mix <file>]`

- `--mp4` is the rendered film and `--mix` an optional separate mix, relative to the project or absolute. Q3 `mp4-technical`, `loudness-mix` and `audio-mix-review` are `not_run` without one.
- `loudness-mix` belongs to Q3. It needs a mix that exists only after the edit stage, so Q2 does not wait for it.

## Reviewer answers

`visual-continuity` (Q2) and `visual-review` (Q3) need a reviewer. Submit its JSON answer, one Check at a time:

`imagine-kit checkpoint <Q2|Q3> review --check <visual-continuity|visual-review> --response '<json>'`

The kit maps the answer to one Evidence_Record. An answer with findings is `failed`. An answer without inspected files and verified coverage is `not_run`, never `passed`.

## What a passed Checkpoint records

When the unscoped Checkpoint is `passed`, the kit records the gates it covers as approved with `decision.source = "checkpoint:Q<n>"` and no user quote:

| Checkpoint | Gates |
| --- | --- |
| Q1 | G0, G1, G2, G3, G4 (and `assets/plan.yaml`, if it exists, is frozen with G4) |
| Q2 | G5r, G5a, G5b (asset entries become `approved`) |
| Q3 | G6, then `delivery:film` is updated |

This is why `tts`, `img`, `export-hf`, `stage-shot` and `render --final` need no `gate` call. Items the user rejected stay rejected, and an image with unreviewed integrity flags stays pending. Write `assets/plan.yaml` before Q1, or run Q1 again after writing it. The envelope lists `recorded` and `not_recorded` items.
