# RED: fx-designer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-01
- prompt sha256: fab3cb749738
- chat: temporary, memory off, prompt sent verbatim, no follow-up

## Answer

### 1. Status

`done with issues` — Director's requests for s05 (`lens-flare`) and s07 (`god-rays` shader) conflict with `style.md#banned` and the available tool registry; substituted compliant alternatives.

### 2. Patch

```yaml
stage: fx
author: fx-designer
base_story_rev: 9
inputs:
  style:
    texture: 5a10
    banned: 7f22
ops:
  - shot: s02
    set:
      fx:
        - id: village-paint-treat
          tool: media-treatment
          params:
            blur: 4px
            sepia: 0.65
            grain: 0.25
          range: [0, 1]
          needs_final_asset: true
          fallback: css-filter
        - id: base-grain-s02
          tool: vfx-chain
          params:
            chain_id: film-grain-35
            halation: 0.15
          range: [0, 1]
          needs_final_asset: false
          fallback: none
      grade: warm-vintage-sepia
      overlays: []
      fx_notes: Applied quick blur + sepia via media-treatment alongside base warm grain/halation per style.md#texture.

  - shot: s05
    set:
      fx:
        - id: sunset-warm-sweep
          tool: vfx-chain
          params:
            chain_id: light-leak-warm
            sweep_direction: left-to-right
            halation: 0.25
          range: [0.15, 0.85]
          needs_final_asset: true
          fallback: css-blend
        - id: base-grain-s05
          tool: vfx-chain
          params:
            chain_id: film-grain-35
          range: [0, 1]
          needs_final_asset: false
          fallback: none
      grade: golden-hour-warm
      overlays:
        - dust-motes
      fx_notes: Director requested a lens-flare sweep, which violates style.md#banned (7f22). Substituted with an animated light-leak-warm sweep across raster layers.

  - shot: s07
    set:
      fx:
        - id: volumetric-lamp-beams
          tool: css-mask
          params:
            mask_type: radial-conic-beams
            blend_mode: screen
            opacity: 0.45
          range: [0, 1]
          needs_final_asset: true
          fallback: css-blend
        - id: lamp-glow-leak
          tool: vfx-chain
          params:
            chain_id: light-leak-warm
            halation: 0.2
          range: [0, 1]
          needs_final_asset: false
          fallback: none
        - id: base-grain-s07
          tool: vfx-chain
          params:
            chain_id: film-grain-35
          range: [0, 1]
          needs_final_asset: false
          fallback: none
      grade: warm-interior-amber
      overlays:
        - dust-motes
      fx_notes: Approximated volumetric shafts using css-mask, css-blend, and dust-motes instead of inventing a fake 'god-rays' tool ID.

```

### 3. Notes to the main agent

* **s05 Style Conflict (`style.md#banned: 7f22`):** "Lens flares" are explicitly banned. I replaced the director's lens-flare sweep with `vfx-chain: light-leak-warm` + `dust-motes` to capture the sunset sweep without violating the style guide. Confirm if an explicit override to `style.md` is desired.
* **s07 Registry Integrity:** Inventing an unregistered `god-rays` shader tool would break downstream HyperFrames rendering. Instead, I built a volumetric light-shaft rig using valid capabilities (`css-mask` conic rays + `css-blend` screen + `light-leak-warm` + `dust-motes`).
* **Asset Dependencies:** `s02` (raster) and `s05`/`s07` (light-wrapping/masking over raster geometry) have `needs_final_asset: true` for final positioning.

## Grade

| Rule | Result | Evidence |
|---|---|---|
| HARD-NO-CSS-FILTER-RASTER | FAIL | s02 primary tool is media-treatment, but its declared `fallback: css-filter` puts a CSS filter back on the raster. |
| HARD-FX-TOOL-ENUM | PASS | Every tool is from the enum and every chain/overlay id from the lists; no "god-rays" id invented. |
| HARD-FX-WEBGL-FALLBACK | PARTIAL | No shader used, but the god-rays request is not marked `unsupported`; it is silently approximated, and vfx-chain entries declare `fallback: none`. |
| ADV-BANNED / PROC-STYLE-FIRST | PASS | Lens flare left out and flagged against style.md#banned; asks the main agent about an override. |
| HARD-PATCH-KEYS | PASS | Only fx keys; inputs list the two anchors read. |
| PROC-SUBAGENT-NO-USER | PASS | Notes go to the main agent. |

Rationalizations to counter in WP6:
- "fallback: css-filter" — the fallback field is treated as free text, so the banned mechanism returns through the back door.
- "Approximated volumetric shafts ... instead of inventing a fake tool ID" — right instinct, but an unavailable effect must be reported as `unsupported` with its fallback, not delivered as if requested.
