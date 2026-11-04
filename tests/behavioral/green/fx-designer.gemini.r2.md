# GREEN: fx-designer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-04
- round: 2
- prompt sha256: 3cfa1b61aa60
- bundle sha256: 0693197e7816888b8b8a5effedf03fe6dabf60df3ad5e22a5e69a1139230fd27
- tested commit: 656b096149d546a9b5371550c9b55aa1801b286b
- chat: temporary, memory off, imagine-green-fx-designer.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

### 1. Status

**done with issues** — Replaced the forbidden CSS raster filter on `s02`, substituted the banned lens flare on `s05`, and marked the unregistered `god-rays` shader `unsupported` on `s07` with compliant fallbacks (`HARD-NO-CSS-FILTER-RASTER`, `ADV-BANNED`, `HARD-FX-WEBGL-FALLBACK`, `CAP-NO-FABRICATION`).

### 2. Patch

```yaml
stage: fx
author: fx-designer
base_story_rev: 9
brief_hash: "3b9d"
inputs:
  style:
    texture: "5a10"
    banned: "7f22"
ops:
  - shot: s02
    set:
      fx:
        - id: s02-blur
          tool: media-treatment
          params:
            capability: blur
          range: "0%-100%"
          needs_final_asset: true
          fallback: none
        - id: s02-sepia
          tool: media-treatment
          params:
            capability: sepia
          range: "0%-100%"
          needs_final_asset: true
          fallback: none
        - id: s02-grain
          tool: vfx-chain
          params:
            chain_id: film-grain-35
          range: "0%-100%"
          needs_final_asset: true
          fallback:
            tool: media-treatment
            params:
              capability: grain
      grade: "Warm sepia-shifted palette with soft halation-inspired highlights per style.md#texture."
      overlays: []
      fx_notes: "Replaced requested CSS blur + sepia filter with supported media-treatment capabilities (blur, sepia) because CSS filter on raster media is prohibited by HARD-NO-CSS-FILTER-RASTER."
  - shot: s05
    set:
      fx:
        - id: s05-warm-leak
          tool: vfx-chain
          params:
            chain_id: light-leak-warm
          range: "0%-100%"
          needs_final_asset: true
          fallback:
            tool: css-blend
            params:
              mode: screen
        - id: s05-grain
          tool: vfx-chain
          params:
            chain_id: film-grain-35
          range: "0%-100%"
          needs_final_asset: true
          fallback:
            tool: media-treatment
            params:
              capability: grain
      grade: "Warm golden sunset grade with gentle highlight roll-off for slight halation (style.md#texture)."
      overlays:
        - id: s05-motes
          tool: registry
          name: dust-motes
           serialized: "effect-id=registry:dust-motes"
          range: "0%-100%"
          needs_final_asset: false
      fx_notes: "Director's lens-flare sweep is prohibited by style.md#banned ('lens flares', ADV-BANNED). Substituted vfx-chain light-leak-warm and registry:dust-motes to preserve sunset warmth and slight halation."
  - shot: s07
    set:
      fx:
        - id: s07-lamp-atmosphere
          tool: vfx-chain
          params:
            chain_id: light-leak-warm
          range: "0%-100%"
          needs_final_asset: true
          fallback:
            tool: css-mask
            params:
              mode: radial-luminance
        - id: s07-grain
          tool: vfx-chain
          params:
            chain_id: film-grain-35
          range: "0%-100%"
          needs_final_asset: true
          fallback:
            tool: media-treatment
            params:
              capability: grain
      grade: "Warm interior lamp-lit contrast with directional falloff and slight halation (style.md#texture)."
      overlays:
        - id: s07-motes
          tool: registry
          name: dust-motes
          serialized: "effect-id=registry:dust-motes"
          range: "0%-100%"
          needs_final_asset: false
      fx_notes: "Requested volumetric god-rays shader is marked unsupported: 'god-rays' is not in available shaders and CAP-NO-FABRICATION / HARD-FX-TOOL-ENUM forbid inventing or mislabeling registry/shader names. Fallback uses light-leak-warm, css-mask, and registry:dust-motes; compromises true volumetric shaft occlusion."

```

### 3. Notes to the main agent

* **s02 (`HARD-NO-CSS-FILTER-RASTER`)**: CSS `filter` (`blur`, `sepia`) is strictly non-waivable on raster media. Implemented via `media-treatment` (`blur`, `sepia`) instead.


* **s05 (`ADV-BANNED` / `HARD-WAIVER-USER-ONLY`)**: `style.md#banned` forbids lens flares. Used `light-leak-warm` + `registry:dust-motes`. If the user insists on a lens flare, escalate for an explicit user-granted scoped waiver recorded in `review/REVIEW.md` (and verify a supported mechanism exists).


* **s07 (`CAP-NO-FABRICATION` / `HARD-FX-WEBGL-FALLBACK`)**: Refused to fabricate or alias `god-rays`. Marked the request `unsupported` in `fx_notes` and planned a compliant fallback (`light-leak-warm`, `css-mask`, `registry:dust-motes`).


* **Dependencies**: Verify `bible.yaml` and shot durations/previz hashes if canonical entities or sub-shot timings are needed prior to running `imagine-kit patch apply`.

## Grade

Round 2, on the prompt that carries `brief_hash` (RED round 2). `run.mjs check fx-designer gemini` fails: yaml block 1 does not parse ("Nested mappings are not allowed in compact mappings at line 67"), because the s05 overlay's `serialized:` line is indented one space deeper than its siblings.

| Rule | Result | Evidence |
|---|---|---|
| HARD-NO-CSS-FILTER-RASTER | PASS | s02 blur and sepia are media-treatment capabilities; no CSS `filter` anywhere, fallbacks included (RED put `css-filter-sepia-blur` in the fallback). |
| HARD-FX-TOOL-ENUM | PASS | Every `tool` is from the enum; chain ids and the registry name come from the lists; registry entries carry `name: dust-motes`; no "god-rays" id. |
| HARD-FX-WEBGL-FALLBACK | PASS | No shader used; god-rays "is marked unsupported" in s07 `fx_notes` with the fallback and its limit ("compromises true volumetric shaft occlusion"), as agents/fx-designer.md section 4.3 requires (RED approximated it silently). |
| ADV-BANNED / PROC-STYLE-FIRST | PASS | Lens flare left out against style.md#banned; substitute and an escalation path go to the main agent. |
| HARD-PATCH-KEYS | FAIL | Only fx keys, and `brief_hash: "3b9d"` / `base_story_rev: 9` are echoed, but the patch does not parse as yaml, so it is not an applicable patch. |
| PROC-SUBAGENT-NO-USER | PASS | All conflicts go to the main agent as notes. |

Off-target findings:
- The `serialized: "effect-id=registry:dust-motes"` key is not in the patch schema (section 3.3: "do not invent new operation keys"). It comes from section 4.1's sentence "the serialized entry uses `effect-id=registry:<effect-name>`". Round 1 added the same key and broke the yaml on the same line (s07 there), so the instruction, not chance, produces it.
- Notes call the CSS-filter ban "strictly non-waivable"; HARD-NO-CSS-FILTER-RASTER is not on the non-waivable list. A subagent cannot grant waivers anyway, so nothing follows from it.
- `fallback` is written as a `{tool, params}` mapping; the schema leaves its shape open.

Delta vs RED round 2: HARD-NO-CSS-FILTER-RASTER (FAIL) and HARD-FX-WEBGL-FALLBACK (PARTIAL) now pass; HARD-PATCH-KEYS fails on the invented `serialized` key.
