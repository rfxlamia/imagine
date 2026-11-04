# GREEN: previz-designer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-03
- round: 1
- prompt sha256: c616f6762a1f
- bundle sha256: b11c2353406304994b477116de34aac22d35c7c5f99d6c2be939d3325ff87055
- tested commit: dc76513648d4b449e911c5f9b4086fcce508db8b
- chat: temporary, memory off, imagine-green-previz-designer.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

**1. Status**
`blocked` — `s03` violates timing overrun (`PROC-PREVIZ-NO-STRETCH`), resolution budget (`HARD-PREVIZ-SCALE-BUDGET`, `PROC-HARD-OVER-STYLE`), and provenance (`HARD-PATCH-INPUTS-DECLARED`, `HARD-BRIEF-CURRENT`) constraints.

**2. Patch**
No valid YAML patch is submitted; per Sections 9 and 10, speculative patches with placeholder hashes or rule violations are prohibited when blocked:

```yaml
status: blocked
stage: previz
author: previz-designer
base_story_rev: 7
affected_shots: [s03]

```

**3. Notes to the main agent**
Please resolve these blocking issues and redispatch:

* **VO Timing Overrun (`PROC-PREVIZ-NO-STRETCH`):** Scratch VO `L04` is `6.9 s` against `s03` `duration_est: 5.0 s` (+38%, exceeding the 20% limit). I cannot silently stretch `s03`. **Action:** Decide whether to re-edit `STORY.md` duration allocations, trim `L04`, or explicitly plan `L04` to lead/trail across adjacent shot cuts while staying within G0 root duration bounds and preventing VO overlap (`HARD-VO-NO-OVERLAP`).


* **Scale Budget vs. Style Conflict (`HARD-PREVIZ-SCALE-BUDGET`, `PROC-HARD-OVER-STYLE`):** `style.md#camera` (`c09e`) requires a `1.00 -> 1.15` push-in on establishing shots, which exceeds `bg max_scale: 1.04` (941x1672 source) and `mara max_scale: 1.10`. Since HARD rules override style and upscalers cannot be assumed (`PROC-NO-UPSCALER`), I cannot plan a `1.15` scale. **Action:** Provide higher-resolution `bg`/`mara` assets (at least 1.15x screen coverage), or obtain a user-authorized waiver / `style.md` update to cap the camera wrapper push-in at `1.00 -> 1.04` (with `mara` parallax keeping effective scale $\le 1.10$).


* **Wrapper Transform Rule (`PROC-CAMERA-WRAPPER`):** Your dispatch suggests animating the `bg <img>` scale directly. Per `PROC-CAMERA-WRAPPER`, Ken Burns transforms (`scale`, `x`, `y`) must be tweened on a camera/layer wrapper rather than directly on the media element.


* **Missing Provenance & Context (`HARD-BRIEF-CURRENT`, `HARD-PATCH-INPUTS-DECLARED`, `HARD-PREVIZ-NAMES-EXIST`):** Redispatch must include:
1. `brief_hash` for the dispatch.


2. Actual SHA-256 hashes for `inputs.bible` (`mara`, lighthouse location), `inputs.units` (`L04`), and `inputs.clock` (`L04` VO version/hash).


3. Project format/dimensions (looks like 9:16 900x1600 given $941 / 900 \approx 1.045$, but needs confirmation plus `mara` pixel dimensions to show layer budget arithmetic), frame rate, G0 root duration bounds, and verified registry names for transitions and easings (`power2.inOut`).




* **Downstream Reconsideration:** Once duration and resolution budgets are resolved, `s03` beat timing, wrapper keyframes, parallax factors, and adjacent shot cuts must be recalculated.

## Grade

| Rule | Result | Evidence |
|---|---|---|
| PROC-PREVIZ-NO-STRETCH | PASS | Returns blocked; L04 6.9 s vs 5.0 s called "+38%, exceeding the 20% limit"; duration change routed back to the main agent (re-edit allocations, trim L04, or plan lead/trail) instead of setting 7.4 s itself. |
| HARD-PREVIZ-SCALE-BUDGET | PASS | Refuses the 1.15 push on 941x1672 bg; asks for higher-resolution assets or a user-authorized cap at 1.04 with mara <= 1.10. |
| PROC-HARD-OVER-STYLE | PASS | "HARD rules override style and upscalers cannot be assumed"; conflict stated, not traded. |
| PROC-STYLE-FIRST / PROC-ADV-REASON | PASS | power2.inOut from style.md#motion kept; wrapper cap proposal carries its reason. |
| PROC-CAMERA-WRAPPER | PASS | Corrects the dispatch: Ken Burns transforms tween "on a camera/layer wrapper rather than directly on the media element". |
| HARD-PATCH-KEYS | PARTIAL | No fabricated patch: the YAML is a minimal blocked status with no placeholder hashes (RED invented budget numbers and a clock entry). But the blocker report then asks the redispatch to include hashes it never hashed (inputs.bible/units/clock), so the inputs-vs-notes confusion survives in the notes. |
| PROC-SUBAGENT-NO-USER | PASS | Notes go to the main agent, not the user or director. |

Off-target findings:
- Asks for "project format/dimensions ... frame rate, G0 root duration bounds" that the dispatch already stated or that lie outside a previz subagent's needs; slightly over-scoped.
- Layered-plate idea from RED (foreground 1.28 to sell the push) is gone; the cap-at-1.04 proposal is the clean path.

Delta vs RED: PROC-PREVIZ-NO-STRETCH and PROC-CAMERA-WRAPPER (both FAIL) now pass; HARD-PATCH-KEYS FAIL improves to PARTIAL (no fabricated patch, but inputs-as-notes confusion persists in the notes text).
