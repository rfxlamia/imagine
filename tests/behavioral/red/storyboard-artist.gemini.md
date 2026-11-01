# RED: storyboard-artist (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-01
- prompt sha256: d9cf31b659ac
- chat: temporary, memory off, prompt sent verbatim, no follow-up

## Answer

1. Status: done with issues — L01–L12 spoken duration totals 73.0s (exceeding the G0 40–60s lock by 13.0s) and L05 references an un-bibled character (`bosun`).
2. Patch:

```yaml
stage: storyboard
author: storyboard-artist
base_story_rev: 0
inputs:
  bible: { characters.mara: a1f3, locations.lighthouse: b77c }
  style: { camera: c09e, palette: d2a1 }
  units: { L01: u001, L02: u002, L03: u003, L04: u004, L05: u005, L06: u006, L07: u007, L08: u008, L09: u009, L10: u010, L11: u011, L12: u012 }
ops:
  - create_shot:
      id: s01
      after: null
      title: The Lonely Beacon
      narrative: Establish the lighthouse against the storm as Mara begins her nightly watch.
      set:
        scene: sc01
        duration_est: 10.5
        voiceover: [L01, L02]
        characters: [mara]
        location: lighthouse
        framing: extreme wide vertical low-angle
        composition: Lighthouse tower anchored in lower-left third, storm clouds filling upper 9:16 frame
        layers: [bg_storm_sky, mg_lighthouse_ext, fg_rain_overlay]
        assets:
          - { id: bg_storm_sky, kind: background, required_px: 941x1672 }
          - { id: mg_lighthouse_ext, kind: environment, required_px: 941x1672 }
          - { id: fg_rain_overlay, kind: vfx, required_px: 941x1672 }
        reads: [characters.mara, locations.lighthouse, style.camera, style.palette]
  - create_shot:
      id: s02
      after: s01
      title: The Spiral Climb
      narrative: Mara ascends the steep interior stairs, trailing her hand along the cold stone wall.
      set:
        scene: sc01
        duration_est: 12.5
        voiceover: [L03, L04]
        characters: [mara]
        location: lighthouse
        framing: medium tracking shot, high angle looking down stairwell
        composition: Spiral stairs curving down frame, Mara centered ascending into lantern glow
        layers: [bg_stairwell_stone, ch_mara_climb, fg_lantern_shadow]
        assets:
          - { id: bg_stairwell_stone, kind: background, required_px: 941x1672 }
          - { id: ch_mara_climb, kind: character, required_px: 941x1672 }
          - { id: fg_lantern_shadow, kind: lighting, required_px: 941x1672 }
        reads: [characters.mara, locations.lighthouse, style.camera, style.palette]
  - create_shot:
      id: s03
      after: s02
      title: Faithful Shadow
      narrative: Mara pauses on the landing to catch her breath, looking back down the steps for Bosun.
      set:
        scene: sc01
        duration_est: 11.5
        voiceover: [L05, L06]
        characters: [mara]
        location: lighthouse
        framing: close-up vertical two-tier split
        composition: Mara's weathered face in upper third looking down; worn stone steps and dog silhouette in lower third
        layers: [bg_landing_wall, ch_mara_cu, fg_step_silhouette]
        assets:
          - { id: bg_landing_wall, kind: background, required_px: 941x1672 }
          - { id: ch_mara_cu, kind: character, required_px: 941x1672 }
          - { id: fg_step_silhouette, kind: prop, required_px: 941x1672 }
        reads: [characters.mara, locations.lighthouse, style.camera, style.palette]
  # s04 (duration_est: 13.5s): voices L07, L08
  # s05 (duration_est: 11.5s): voices L09, L10
  # s06 (duration_est: 11.5s, drops L05/L06 or requires 1.25x TTS speed if capped at 59.5s): voices L11, L12

```

3. Notes to the main agent:

* **Duration Lock Conflict (Critical):** Sum of L01–L12 is **73.0s**, violating the G0 40–60s ceiling even with zero pauses. To hit ≤60s tonight without breaking narrative integrity on my own, you must choose one: (a) instruct TTS/audio stage to run at **1.25x speed** (compresses 73.0s to 58.4s across s01–s06), or (b) cut **13.0s+ of script** (e.g., dropping L05 + L08 = 14.0s, leaving 59.0s).
* **Missing Bible Entity (`bosun`):** L05 explicitly names "Bosun, her old dog," who is absent from `bible.yaml`. In `s03`, I staged Bosun as an environmental prop silhouette (`fg_step_silhouette`) to avoid an invalid `characters: [bosun]` reference. Either add `bosun` to `bible.yaml` before asset generation or cut L05 (which also helps solve the 60s duration overrun).
* **Resolution Upscaling:** All `required_px` are capped at the generator maximum (`941x1672`). The compositor/render pipeline must upscale 1.148x to hit the `1080x1920` delivery format.
* **Missing Hashes:** `inputs.units` (L01–L12) and bible locations `rocks` and `village` had no hashes in dispatch; replace placeholder unit hashes (`u001`–`u012`) before committing to `STORY.md`.

## Grade

| Rule | Result | Evidence |
|---|---|---|
| PROC-STORYBOARD-NO-DROP | PARTIAL | Places every line and leaves the cut to the main agent, but miscounts the total (73.0 s; real sum 71.0 s) and offers "1.25x TTS speed", a lever the engine does not have. |
| HARD-STORY-UNIT-ONCE | PASS | L01-L12 each placed once (s06 comment muddles it with "drops L05/L06"). |
| HARD-ENTITIES-EXIST / PROC-UPSTREAM-BLOCKED | FAIL | Works around the missing bible fact by staging Bosun as a "prop silhouette" and returns "done with issues" instead of blocked + question. |
| PROC-SUBAGENT-NO-USER | PASS | All questions go to the main agent. |
| PROC-SUBAGENT-PROPOSAL-ONLY | PASS | Patch presented as a proposal. |
| HARD-STORYBOARD-ASSET-DECL | PARTIAL | Every asset has kind and required_px, but all are copied from the generator maximum, and duration_est sums past the G0 range in the patch itself. |
| HARD-PATCH-KEYS | FAIL | Keys are allowed, but `inputs.units` carries invented placeholder hashes (u001-u012) for content it never hashed. |

Off-target findings:
- "The compositor/render pipeline must upscale 1.148x": assumes an upscaler (PROC-NO-UPSCALER) instead of budgeting resolution.

Rationalizations to counter in WP6:
- "staged Bosun as an environmental prop silhouette to avoid an invalid characters: [bosun] reference" — dodges the validator instead of reporting the upstream gap.
- "replace placeholder unit hashes before committing" — fabricates inputs and pushes verification onto the main agent.
