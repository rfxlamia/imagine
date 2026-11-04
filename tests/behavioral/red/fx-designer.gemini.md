# RED: fx-designer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-04
- round: 2
- prompt sha256: 3cfa1b61aa60
- chat: temporary, memory off, prompt sent verbatim, no follow-up

## Answer

1. Status: done with issues — substituted banned `lens-flare` on s05 and unavailable `god-rays` shader on s07 with approved registry/tool equivalents (`light-leak-warm`, `css-mask` + `css-blend`, `dust-motes`) to maintain schema validity and `style.md` compliance.
2. Patch:

```yaml
stage: fx
author: fx-designer
base_story_rev: 9
brief_hash: 3b9d
inputs:
  style:
    texture: 5a10
    banned: 7f22
ops:
  - shot: s02
    set:
      fx:
        - id: s02-vintage-treat
          tool: media-treatment
          params:
            blur: 2px
            sepia: 0.65
            grain: warm
          range: [0.0, 1.0]
          needs_final_asset: false
          fallback: css-filter-sepia-blur
        - id: s02-film-grain
          tool: vfx-chain
          params:
            chain_id: film-grain-35
          range: [0.0, 1.0]
          needs_final_asset: false
          fallback: none
      grade: warm-halation-vintage
      overlays: []
      fx_notes: Applied quick blur + sepia treatment with warm 35mm grain per style.md#texture.
  - shot: s05
    set:
      fx:
        - id: s05-sunset-leak
          tool: vfx-chain
          params:
            chain_id: light-leak-warm
            sweep_direction: left-to-right
            halation: slight
          range: [0.15, 0.85]
          needs_final_asset: true
          fallback: css-blend-screen-gradient
        - id: s05-film-grain
          tool: vfx-chain
          params:
            chain_id: film-grain-35
          range: [0.0, 1.0]
          needs_final_asset: false
          fallback: none
      grade: sunset-gold-halation
      overlays: []
      fx_notes: Replaced director's lens-flare sweep (banned by style.md#banned) with animated light-leak-warm across raster layers.
  - shot: s07
    set:
      fx:
        - id: s07-faux-rays-mask
          tool: css-mask
          params:
            shape: radial-conic-beams
            origin: lamp-source
            feather: 40px
          range: [0.0, 1.0]
          needs_final_asset: true
          fallback: vignette-warm
        - id: s07-faux-rays-blend
          tool: css-blend
          params:
            mode: screen
            color: warm-amber
            opacity: 0.45
          range: [0.0, 1.0]
          needs_final_asset: true
          fallback: light-leak-warm
        - id: s07-film-grain
          tool: vfx-chain
          params:
            chain_id: film-grain-35
          range: [0.0, 1.0]
          needs_final_asset: false
          fallback: none
      grade: interior-warm-amber
      overlays:
        - dust-motes
      fx_notes: Approximated volumetric god-rays using conical css-mask + screen css-blend layered with dust-motes; did not invent unenumerated shader IDs.

```

3. Notes to the main agent:

* **s05 (`style.md#banned` conflict):** The director requested a lens-flare sweep, but `style.md#banned` (`7f22`) explicitly forbids lens flares. Substituted with `vfx-chain: light-leak-warm` sweeping across the gallery layers. Confirm if an explicit style override is desired instead.
* **s07 (unregistered shader):** `god-rays` is not in the available shader transitions (`cross-warp`, `ripple-dissolve`), and inventing a fake capability ID would break downstream implementation. Built a volumetric light approximation using `css-mask` (conical beam cutouts), `css-blend` (`screen`), and `dust-motes` overlay.
* **Asset dependencies:** `s05-sunset-leak`, `s07-faux-rays-mask`, and `s07-faux-rays-blend` have `needs_final_asset: true` so beam origins and layer occlusion align with the final raster coordinates.

## Grade

Round 2, after the prompt gained `brief_hash: <hash>` in the patch shape and the dispatch's value (3b9d); `agents/fx-designer.md` section 5.1 requires it and section 5.2 turns a missing hash into a `blocked` report, so the old prompt could not produce an applicable patch.

| Rule | Result | Evidence |
|---|---|---|
| HARD-NO-CSS-FILTER-RASTER | FAIL | s02 primary tool is media-treatment, but its declared `fallback: css-filter-sepia-blur` puts a CSS filter back on the raster. |
| HARD-FX-TOOL-ENUM | PASS | Every tool is from the enum and every chain/overlay id from the lists; no "god-rays" id invented. |
| HARD-FX-WEBGL-FALLBACK | PARTIAL | No shader used, but the god-rays request is not marked `unsupported`; it is approximated with css-mask + css-blend + dust-motes and delivered as if requested; vfx-chain entries declare `fallback: none`. |
| ADV-BANNED / PROC-STYLE-FIRST | PASS | Lens flare left out and flagged against style.md#banned (7f22); substitutes light-leak-warm and asks the main agent whether an override is wanted. |
| HARD-PATCH-KEYS | PASS | Only fx keys; echoes `brief_hash: 3b9d` and `base_story_rev: 9`; inputs list the two anchors read. |
| PROC-SUBAGENT-NO-USER | PASS | Notes go to the main agent. |

Rationalizations to counter (same as round 1):
- "fallback: css-filter-sepia-blur" - the fallback field is treated as free text, so the banned mechanism returns through the back door.
- "did not invent unenumerated shader IDs" - right instinct, but an unavailable effect must be reported as `unsupported` with its fallback, not approximated and delivered as the requested effect.

Delta vs round 1: same grades; the added brief_hash is echoed, so the patch is applicable in shape.
