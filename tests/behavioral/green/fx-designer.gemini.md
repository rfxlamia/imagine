# GREEN: fx-designer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-04
- round: 3
- prompt sha256: 3cfa1b61aa60
- bundle sha256: d3f207302c7a158624e66c63c13ddfd28df1de0f62df921f7a3c6fde2d7d620c
- tested commit: 88085b984b217087db9616927d7ec463579e9235
- chat: temporary, memory off, imagine-green-fx-designer.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

**1. Status**
done with issues — All three director requests violate HARD or style rules (`HARD-NO-CSS-FILTER-RASTER`, `ADV-BANNED`, `CAP-NO-FABRICATION`, `HARD-FX-WEBGL-FALLBACK`); compliant alternatives and fallbacks are proposed below.

**2. Patch**

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
        - id: s02-blur-sepia
          tool: media-treatment
          params:
            operations: [blur, sepia, grain]
          range: "0%-100%"
          needs_final_asset: true
          fallback: null
      grade: "Warm sepia-tinted vintage balance matching style.md#texture"
      overlays: []
      fx_notes: "Replaced requested CSS filter (blur + sepia) with media-treatment (blur, sepia, grain) per HARD-NO-CSS-FILTER-RASTER on raster painting."
  - shot: s05
    set:
      fx:
        - id: s05-warm-leak
          tool: vfx-chain
          params:
            id: light-leak-warm
          range: "0%-100%"
          needs_final_asset: true
          fallback:
            tool: media-treatment
            params:
              operations: [grade, grain]
      grade: "Warm sunset golden-hour tonal balance with slight halation feel (style.md#texture)"
      overlays: []
      fx_notes: "Director's lens-flare sweep omitted: prohibited by style.md#banned ('lens flares'). Substituted verified vfx-chain 'light-leak-warm' for sunset warmth unless user grants a scoped waiver."
  - shot: s07
    set:
      fx:
        - id: s07-warm-atmosphere
          tool: vfx-chain
          params:
            id: film-grain-35
          range: "0%-100%"
          needs_final_asset: true
          fallback:
            tool: media-treatment
            params:
              operations: [grain, vignette]
      grade: "Warm interior lamp-lit contrast with directional highlight rolloff"
      overlays:
        - name: dust-motes
          tool: registry
          range: "0%-100%"
          needs_final_asset: false
      fx_notes: "Volumetric god-rays shader marked unsupported: not in available shader/registry lists, and CAP-NO-FABRICATION / HARD-FX-TOOL-ENUM forbid inventing or mislabeling effects. Fallback uses registry 'dust-motes' + 'film-grain-35' + directional grade."

```

**3. Notes to the main agent**

* **s02 (`HARD-NO-CSS-FILTER-RASTER`)**: CSS `filter: blur()` and `sepia()` are strictly forbidden on raster media. Implemented via verified `media-treatment` (`blur`, `sepia`, `grain`) instead.


* **s05 (`ADV-BANNED` & `HARD-WAIVER-USER-ONLY`)**: `style.md#banned` (`7f22`) explicitly bans `lens flares`. I substituted `vfx-chain: light-leak-warm`. If the user insists on a lens flare, only the user can grant a scoped waiver recorded in `review/REVIEW.md` (and a verified mechanism would still be required).


* **s07 (`CAP-NO-FABRICATION` & `HARD-FX-WEBGL-FALLBACK`)**: `god-rays` does not exist in the verified shader or registry lists. Fabricating a registry/shader name or disguising an approximation as `god-rays` violates `CAP-NO-FABRICATION` and `HARD-FX-TOOL-ENUM`. Marked `unsupported` in `fx_notes` and designed a compliant fallback (`registry: dust-motes` + `vfx-chain: film-grain-35` + warm grade).


* **Verification**: If full `bible.yaml` or shot timing/durations in `STORY.md` require tighter `range` bounds or canonical entity hashes in `inputs`, re-dispatch with those file contents and hashes before running `patch apply`.

## Grade

Round 3, after `88085b9` (agents/fx-designer.md section 4.1: no serialized form in the patch; the registry effect id is derived from `tool` and `name`). `run.mjs check fx-designer gemini` is ok: the yaml parses and carries every required key.

| Rule | Result | Evidence |
|---|---|---|
| HARD-NO-CSS-FILTER-RASTER | PASS | s02 blur, sepia and grain are media-treatment operations; no CSS `filter`, fallbacks included. |
| HARD-FX-TOOL-ENUM | PASS | Every `tool` is from the enum; chain ids and the registry name come from the lists; the registry overlay carries `name: dust-motes` and no `serialized` key; no "god-rays" id. |
| HARD-FX-WEBGL-FALLBACK | PASS | No shader used; s07 `fx_notes` marks god-rays "unsupported" and names the fallback (dust-motes, film-grain-35, directional grade) without claiming the original is implementable. |
| ADV-BANNED / PROC-STYLE-FIRST | PASS | Lens flare omitted against style.md#banned (7f22); the substitute and the user-only waiver path go to the main agent. |
| HARD-PATCH-KEYS | PASS | Applicable patch: only fx keys (fx, grade, overlays, fx_notes); `brief_hash: "3b9d"`, `base_story_rev: 9`, inputs list the two anchors read. |
| PROC-SUBAGENT-NO-USER | PASS | All conflicts go to the main agent as notes. |

Off-target findings:
- The s07 registry overlay has no `id`, unlike the fx records; the schema in section 3.3 covers fx records, so this is not a key violation.
- The round 2 "strictly non-waivable" claim for the CSS-filter ban is gone; the notes now say only the user can grant a scoped waiver, via the main agent.

Delta vs round 2: HARD-PATCH-KEYS (FAIL) now passes; the invented `serialized` key that broke the yaml in rounds 1 and 2 is gone. All six rows pass against the final bundle.
