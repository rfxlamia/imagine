# GREEN: storyboard-artist (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-03
- prompt sha256: d9cf31b659ac
- chat: temporary, memory off, imagine-green-storyboard-artist.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

1. Status: blocked — Unresolved HARD constraints: total script duration (71.0s) exceeds G0 max (60s), `Bosun` in L05 is missing from `bible.yaml`, full `script/narration.md` text and required source hashes (`brief_hash`, `units` L01–L12, `locations.rocks`, `locations.village`) were not supplied, and 1080x1920 full-frame assets exceed the 941x1672 S2 generator ceiling.


2. Patch:

```yaml
# DIAGNOSTIC DRAFT ONLY — DO NOT APPLY (blocked by unresolved HARD rules; Section 8.1 prohibits mixing blockers with an applicable patch)
stage: storyboard
author: storyboard-artist
base_story_rev: 0
# BLOCKED: brief_hash missing from dispatch; cannot fabricate (HARD-BRIEF-CURRENT, CAP-NO-FABRICATION)
inputs:
  bible:
    characters.mara: a1f3
    locations.lighthouse: b77c
    # BLOCKED: missing hashes for locations.rocks, locations.village, and missing entity characters.bosun (L05)
  style:
    camera: c09e
    palette: d2a1
  units: {} # BLOCKED: missing actual hashes for L01-L12 (HARD-PATCH-INPUTS-DECLARED)
ops:
  - create_shot:
      id: s01
      after: null
      title: Mara at the Gallery Rail
      narrative: "Mara stands at the lighthouse gallery rail gripping the wet iron bar with both hands, looking out across the dark water before turning her head toward the lantern door."
      set:
        scene: sc01
        duration_est: 4.5
        voiceover: [L01]
        characters: [mara]
        location: lighthouse
        framing: "medium-wide vertical, eye-level, Mara 45% frame height"
        composition: "Mara right-of-center gripping rail; lantern housing rises upper-left; caption safe zone lower third"
        layers: [bg_sea_sky, mg_lighthouse_gallery, ch_mara, fg_rain_rail]
        assets:
          - { id: bg_sea_sky, kind: plate, required_px: "941x1672" }
          - { id: mg_lighthouse_gallery, kind: plate, required_px: "941x1672" }
          - { id: ch_mara, kind: character, required_px: "600x1100" }
        reads: [L01]
  - create_shot:
      id: s02
      after: s01
      title: Checking the Logbook
      narrative: "Inside the watch room, Mara traces a weathered finger down the open logbook page on the desk, then closes the cover firmly."
      set:
        scene: sc01
        duration_est: 6.0
        voiceover: [L02]
        characters: [mara]
        location: lighthouse
        framing: "medium close-up, high angle over desk, Mara 50% frame"
        composition: "Mara upper-center leaning over desk; logbook lower-center above caption zone"
        layers: [bg_watchroom_wall, mg_desk_logbook, ch_mara]
        assets:
          - { id: bg_watchroom_wall, kind: plate, required_px: "941x1672" }
          - { id: mg_desk_logbook, kind: prop, required_px: "700x600" }
          - { id: ch_mara, kind: character, required_px: "650x1000" }
        reads: [L02]
  - create_shot:
      id: s03
      after: s02
      title: Climb to the Lantern
      narrative: "Mara ascends the spiral iron stairs, one hand sliding up the curved handrail as her boots step firmly onto the upper landing."
      set:
        scene: sc01
        duration_est: 5.5
        voiceover: [L03]
        characters: [mara]
        location: lighthouse
        framing: "low-angle vertical tracking up stairwell, Mara 45% frame"
        composition: "Spiral stairs curve bottom-left to top-right; Mara climbs center-frame"
        layers: [bg_stairwell_shaft, mg_iron_stairs, ch_mara]
        assets:
          - { id: bg_stairwell_shaft, kind: plate, required_px: "941x1672" }
          - { id: mg_iron_stairs, kind: plate, required_px: "941x1672" }
          - { id: ch_mara, kind: character, required_px: "600x1100" }
        reads: [L03]
  # s04 voices L04 (7.0s)
  # s05 voices L05 (6.5s) — BLOCKED: references unapproved entity 'Bosun' (HARD-ENTITIES-EXIST)
  # s06 voices L06 (5.0s)
  # s07 voices L07 (6.0s)
  # s08 voices L08 (7.5s)
  # s09 voices L09 (6.0s)
  # s10 voices L10 (5.5s)
  # s11 voices L11 (6.5s)
  # s12 voices L12 (5.0s)

```

3. Notes to the main agent:

* **Duration (`HARD-DURATION`, `PROC-STORYBOARD-NO-DROP`, `HARD-STORY-UNIT-ONCE`)**: L01–L12 sum to 71.0s, exceeding the 40–60s G0 ceiling by 11.0s. I cannot silently drop units. Propose upstream script cuts of ≥11.0s (e.g., cutting two 5.5s–6.0s units such as L10+L11, or L04+L12) or a G0 target amendment, with user confirmation.


* **Missing Canon (`HARD-ENTITIES-EXIST`, `PROC-UPSTREAM-BLOCKED`)**: L05 requires `Bosun, her old dog`, which is absent from `bible.yaml`. Add `bosun` to `bible.yaml` (or cut/rewrite L05) and cascade invalidation.


* **Missing Sources & Hashes (`HARD-BRIEF-CURRENT`, `HARD-PATCH-INPUTS-DECLARED`)**: Redispatch with full `script/narration.md` text (L01–L04, L06–L12), `brief_hash`, unit hashes for L01–L12, and bible hashes for `locations.rocks`, `locations.village`, and `bosun`.


* **Resolution Ceiling (`HARD-STORYBOARD-ASSET-DECL`)**: Target is 1080x1920, but S2 max generator resolution is 941x1672 (no upscaler assumed). Confirm whether composable layered plates/framed borders within 941x1672 or pre-approved external 1080x1920 assets are authorized.


* **Advisory Departures (`PROC-ADV-REASON`)**: Shot durations follow 4.5–7.5s narration timings rather than `ADV-VERTICAL` (1–2s) to preserve single-action readability per line.

## Grade

| Rule | Result | Evidence |
|---|---|---|
| PROC-STORYBOARD-NO-DROP | PASS | L01-L12 each placed exactly once (s01-s03 fully, s04-s12 as blocked stubs); "I cannot silently drop units"; concrete cut proposals (two 5.5-6.0 s units, or L04+L12) left to the main agent. |
| HARD-STORY-UNIT-ONCE | PASS | Every unit placed once; no merge-away. |
| HARD-ENTITIES-EXIST / PROC-UPSTREAM-BLOCKED | PASS | s05 declared BLOCKED instead of staging Bosun as a prop; asks the main agent to add bosun to the bible or cut/rewrite L05. |
| PROC-SUBAGENT-NO-USER | PASS | All questions addressed to the main agent. |
| PROC-SUBAGENT-PROPOSAL-ONLY | PASS | Patch is a "DIAGNOSTIC DRAFT ONLY - DO NOT APPLY"; no approval claimed. |
| HARD-STORYBOARD-ASSET-DECL | PASS | Every asset has kind and required_px; flagged the 1080x1920 target against the 941x1672 generator ceiling (proposal section 6, D14) and asked for an authorized resolution instead of assuming an upscaler. |
| HARD-PATCH-KEYS | PASS | Only allowed storyboard keys; `inputs` blocks are explicitly marked BLOCKED with no placeholder hashes (RED invented u001-u012). |

Off-target findings:
- States the duration total is 71.0 s (correct this round; RED miscounted 73.0 s).
- The s04-s12 stubs carry no set/assets; acceptable since the patch is marked do-not-apply and the blockers are reported, but a re-dispatch must produce them.

Delta vs RED: HARD-ENTITIES-EXIST (FAIL) and HARD-PATCH-KEYS (FAIL) now pass; both PARTIALs resolved (real total, no invented TTS speed lever; resolution budgeted instead of assumed upscalable).
