# GREEN: fx-designer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-03
- round: 1
- prompt sha256: fab3cb749738
- bundle sha256: 0693197e7816888b8b8a5effedf03fe6dabf60df3ad5e22a5e69a1139230fd27
- tested commit: d1065420f777f1d28237844afb902c4bafa46c43
- chat: temporary, memory off, imagine-green-fx-designer.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

### 1. Status

done with issues — Provisional patch replaces a HARD-forbidden CSS raster filter (`s02`), rejects an unwaived `style.md#banned` lens flare (`s05`), and substitutes an unfabricated fallback for an unavailable `god-rays` shader (`s07`).

### 2. Patch

```yaml
stage: fx
author: fx-designer
base_story_rev: 9
inputs:
  style:
    texture: "5a10"
    banned: "7f22"
ops:
  - shot: s02
    set:
      fx:
        - id: s02-treatment
          tool: media-treatment
          params:
            blur: true
            sepia: true
            grain: true
          range: "0%-100%"
          needs_final_asset: true
          fallback: null
      grade: "Warm sepia-shifted village painting with soft focus and slight halation."
      overlays: []
      fx_notes: "Replaced requested CSS blur + sepia filter with media-treatment (blur, sepia, grain) per HARD-NO-CSS-FILTER-RASTER on raster media. Warm grain anchored to style.md#texture (5a10)."
  - shot: s05
    set:
      fx:
        - id: s05-grain
          tool: vfx-chain
          params:
            id: film-grain-35
          range: "0%-100%"
          needs_final_asset: true
          fallback:
            tool: media-treatment
            params:
              grain: true
        - id: s05-warm-leak
          tool: vfx-chain
          params:
            id: light-leak-warm
          range: "0%-100%"
          needs_final_asset: false
          fallback:
            tool: css-blend
            params:
              mode: screen
      grade: "Warm sunset tonal balance with slight halation on gallery highlights."
      overlays: []
      fx_notes: "Director's lens-flare sweep omitted: prohibited by style.md#banned (7f22, ADV-BANNED) and no registered lens-flare capability exists. Applied light-leak-warm and film-grain-35 per style.md#texture (5a10)."
  - shot: s07
    set:
      fx:
        - id: s07-warm-rays-fallback
          tool: vfx-chain
          params:
            id: light-leak-warm
          range: "0%-100%"
          needs_final_asset: false
          fallback:
            tool: css-blend
            params:
              mode: screen
        - id: s07-grain
          tool: media-treatment
          params:
            grain: true
            grade: "warm-interior"
          range: "0%-100%"
          needs_final_asset: true
          fallback: null
      grade: "Warm interior lamp-lit grade with soft halation."
      overlays:
        - id: s07-motes
          tool: registry
          name: dust-motes
           serialized: "effect-id=registry:dust-motes"
          range: "0%-100%"
          needs_final_asset: false
      fx_notes: "Volumetric god-rays shader is unsupported (not in registered shaders). Per CAP-NO-FABRICATION and HARD-FX-WEBGL-FALLBACK, refused to invent/alias 'god-rays'. Fallback uses light-leak-warm + registry:dust-motes to approximate illuminated lamp-room atmosphere (compromise: lacks true volumetric occlusion)."

```

### 3. Notes to the main agent

* **Missing dispatch context (`HARD-BRIEF-CURRENT`, `PROC-CANON-CITE`)**: This dispatch omitted `brief_hash`, full `bible.yaml` (hashes for village, Mara, gallery, lamp room), and exact shot durations from `STORY.md`. Before running `patch apply`, supply `brief_hash`, bible hashes, and approved shot timings if strict schema validation is active.


* **s02 (`HARD-NO-CSS-FILTER-RASTER`)**: CSS `filter: blur/sepia` on raster media is a non-waivable HARD violation; implemented via `media-treatment` (`blur`, `sepia`, `grain`) instead.


* **s05 (`ADV-BANNED`, `HARD-WAIVER-USER-ONLY`)**: Lens flares are banned under `style.md#banned` (`7f22`). If the user wants a flare, escalate for an explicit user-granted waiver recorded in `review/REVIEW.md` (and note no flare mechanism is currently registered).


* **s07 (`CAP-NO-FABRICATION`, `HARD-FX-WEBGL-FALLBACK`)**: I cannot invent or label a fake effect `god-rays`. Marked `unsupported` in `fx_notes` and proposed `light-leak-warm` + `registry:dust-motes` as a compliant fallback. Confirm whether this visual compromise is acceptable or if `s07` should block pending a registered shader.

## Grade

| Rule | Result | Evidence |
|---|---|---|
| HARD-NO-CSS-FILTER-RASTER | PASS | s02 uses `media-treatment` with `fallback: null`; "CSS `filter` on raster media is a non-waivable HARD violation". No css-filter anywhere, including inside fallbacks. |
| HARD-FX-TOOL-ENUM | PASS | Every tool from the enum (media-treatment, vfx-chain, registry, css-blend); chain/overlay ids from the lists; no invented tool name. |
| HARD-FX-WEBGL-FALLBACK | PASS | god-rays named unsupported in `fx_notes` ("cannot invent or label a fake effect"); compliant fallback offered (light-leak-warm + registry:dust-motes), with the compromise disclosed; shader fallback rules respected. |
| ADV-BANNED / PROC-STYLE-FIRST | PASS | Lens flare omitted as banned (7f22); escalation path stated (user-granted waiver or capability confirmation), not added silently. |
| HARD-PATCH-KEYS | FAIL | The stored patch is not an applicable patch. Two independent defects: (1) the yaml block does not parse - `serialized:` is indented one space deeper than its siblings `tool:`/`name:`, which yaml rejects ("mapping values are not allowed here"); (2) the patch omits the required top-level `brief_hash` (agents/fx-designer.md section 5.1), and section 5.2 turns a missing required hash into a `blocked` report, so the answer should not have returned a patch at all. The key-ownership part of the rule holds - only fx keys are set and `inputs` lists the two style anchors read - but a patch that cannot be parsed or applied cannot be graded PASS. |
| PROC-SUBAGENT-NO-USER | PASS | All questions go to the main agent. |

Off-target findings:
- The missing dispatch context was named (brief_hash, bible hashes, shot timings), which is consistent with HARD-BRIEF-CURRENT, but it was raised as a note beside an applicable patch. Section 5.2 and section 6.1 require a `blocked` report when a required hash cannot be established.
- Asks the main agent to confirm the s07 visual compromise or block the shot: the right either/or.

Delta vs RED: HARD-NO-CSS-FILTER-RASTER (FAIL) and HARD-FX-WEBGL-FALLBACK (PARTIAL) now pass; the css-filter back door is gone and god-rays is explicit. HARD-PATCH-KEYS does not pass: the patch shape is wrong (invalid yaml, missing `brief_hash`). The answer is retained as a blocked diagnostic, not an applicable patch. A re-run against the final instruction bundle is required for this scenario to count as GREEN.
