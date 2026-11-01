# RED: previz-designer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-01
- prompt sha256: c616f6762a1f
- chat: temporary, memory off, prompt sent verbatim, no follow-up

## Answer

1. Status: done with issues — resolution budget (`bg max_scale: 1.04`, `mara max_scale: 1.10`) caps physical raster scaling well below `style.md#camera`'s `1.00->1.15` mandate, and `L04` scratch VO (`6.9 s`) exceeds `duration_est` (`5.0 s`).
2. Patch:

```yaml
stage: previz
author: previz-designer
base_story_rev: 7
inputs:
  bible: { status: "read" }
  style: { camera: "c09e", motion: "e4b0" }
  units: { bg_res: "941x1672", bg_max_scale: 1.04, mara_max_scale: 1.10, duration_est: 5.0 }
  clock: { L04: "scratch:6.9s" }
ops:
  - shot: s03
    set:
      duration: 7.4
      camera:
        rig: "multiplane-stage"
        move: "push-in"
        ease: "power2.inOut"
        target_feel_scale: "1.00->1.15"
      parallax:
        bg: { scale: [1.00, 1.04], y: [0, -12] }
        mara: { scale: [1.00, 1.10], y: [0, -28] }
        fg: { scale: [1.00, 1.28], y: [0, -65], opacity: [0.55, 0.90] }
      motion:
        ease: "power2.inOut"
        mara_idle: { y_drift: -6, duration: 7.4 }
        fg_spray: { drift_x: -40, drift_y: -25 }
      beats:
        - { t: 0.0, event: "transition_in_start", ref: "s03_open" }
        - { t: 0.3, event: "vo_start", ref: "L04" }
        - { t: 3.7, event: "camera_mid_swell", note: "power2.inOut inflection" }
        - { t: 7.2, event: "vo_end", ref: "L04" }
      transition_in:
        type: "crossfade-from-dusk"
        duration: 0.6
        ease: "power2.inOut"
      sound:
        vo: "L04"
        ambience: "waves_wind_dusk_low"
      poster: 3.7
      motion_asserts:
        - "bg.scale <= 1.04"
        - "mara.scale <= 1.10"
        - "duration >= clock.L04 + 0.5"
        - "all_tweens.ease == 'power2.inOut'"
    reasons:
      duration: "Extended from 5.0s to 7.4s to fit 6.9s L04 VO plus 0.3s lead-in and 0.2s tail."
      camera: "Simulates 1.15x epic push-in via multiplane depth without violating raster budgets."
      parallax: "Caps bg at 1.04 and mara at 1.10; vector/CSS fg scales to 1.28 to sell the 1.15x push."
      motion: "Applies power2.inOut globally per style.md#motion with slow atmospheric drift."
      beats: "Anchors L04 VO window and mid-push inflection point."
      transition_in: "Gentle 0.6s dissolve matching dusk tone and non-snappy motion rule."
      sound: "Binds L04 scratch timing with coastal dusk bed."
      poster: "Captures balanced framing and spray density at mid-push."
      motion_asserts: "Enforces raster resolution ceilings, VO containment, and easing rules."

```

3. Notes to the main agent:

* **Rejected direct `bg <img>` 1.15x scale:** Scaling `bg` (941x1672) to `1.15` breaches `bg max_scale: 1.04` and causes raster softness. Instead, I rigged a multiplane push (`bg: 1.04`, `mara: 1.10`, CSS `fg: 1.28`) to deliver the optical feel of a `1.15x` push-in safely. If a true `1.15` bg scale is mandatory, regenerate or upscale `bg` to at least `1082x1923` first.
* **Timeline delta (+2.4s):** Extending `s03` from `5.0s` to `7.4s` for `L04` (`6.9s`) adds `2.4s` to total runtime. Rebalance neighboring shots if the 40–60s global ceiling is tight, or trim `L04`.

## Grade

| Rule | Result | Evidence |
|---|---|---|
| PROC-PREVIZ-NO-STRETCH | FAIL | Sets duration 7.4 s itself (5.0 s planned, +48 %) and only reports the delta; it does not flag a storyboard issue for the main agent to settle. |
| HARD-PREVIZ-SCALE-BUDGET | PASS | bg <= 1.04, mara <= 1.10, with motion_asserts. |
| PROC-HARD-OVER-STYLE | PASS | Refuses the 1.15 style mandate on rasters and says why. |
| PROC-STYLE-FIRST / PROC-ADV-REASON | PASS | power2.inOut from style.md#motion; one-line reason per key. |
| PROC-CAMERA-WRAPPER | FAIL | Rejects the dispatch note only for budget reasons; tweens bg/mara scale with no wrapper element, never addresses tweening the timed media. |
| HARD-PATCH-KEYS | FAIL | Set keys are allowed, but `inputs` is invented (`bible: {status: read}`, budget numbers under `units`, `clock: scratch:6.9s` without a version hash). |
| PROC-SUBAGENT-NO-USER | PASS | Notes go to the main agent. |

Off-target findings:
- "regenerate or upscale bg to at least 1082x1923": suggests an upscaler again (PROC-NO-UPSCALER).
- Scales a CSS foreground to 1.28 to "sell the 1.15x push": a legitimate layered-plate idea, recorded here as a GREEN check that it survives.

Rationalizations to counter in WP6:
- "Extended from 5.0s to 7.4s to fit 6.9s L04 VO" — a timing conflict is solved inside previz instead of being sent back to storyboard.
- Patch `inputs` treated as free-form notes rather than hashes of sources actually read (same failure as storyboard-artist).
