# GREEN: previz-designer (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-03
- prompt sha256: c616f6762a1f
- chat: temporary, memory off, imagine-green-previz-designer.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

**1. Status:**
blocked — `s03` violates HARD timing, resolution-budget, and source-contract rules (`PROC-PREVIZ-NO-STRETCH`, `HARD-PREVIZ-SCALE-BUDGET`, `HARD-PATCH-INPUTS-DECLARED`, `HARD-BRIEF-CURRENT`).

**2. Patch:**

```yaml
# No patch emitted. Per Section 9 & 10, speculative patches, placeholder hashes, and empty operations are prohibited when blocked[cite: 1].

```

**3. Notes to the main agent:**

* **Affected shot:** `s03` (and stage-wide dispatch contract).


* **VO timing overrun (`PROC-PREVIZ-NO-STRETCH`):** Measured scratch VO `L04` is `6.9 s`, exceeding `s03` storyboard `duration_est` (`5.0 s`) by **38%** (`1.9 s / 5.0 s > 20%`). I cannot silently stretch `s03` or root duration. *Action:* Resolve the storyboard timing allocation, trim `L04`, or explicitly plan a narration lead/trail across adjacent shots (confirming no overlap via `HARD-VO-NO-OVERLAP`).


* **Resolution budget vs. style conflict (`HARD-PREVIZ-SCALE-BUDGET`, `PROC-HARD-OVER-STYLE`):** `style.md#camera` (`c09e`) requires a `1.00 -> 1.15` push-in on establishing shots, but `s03` caps `bg` at `max_scale: 1.04` (`941x1672` raster; assuming 9:16 `900x1600` frame: `941 / 900 = 1.0455` max scale) and `mara` at `1.10`. A `1.15` push-in violates the HARD scale budget, and no upscaler may be assumed (`PROC-NO-UPSCALER`). *Action:* Regenerate/upsize `bg` (≥ `1.15x` frame coverage) and `mara`, or obtain a user-authorized waiver in `REVIEW.md` (`HARD-WAIVER-USER-ONLY`) to cap the push-in at `<= 1.04`.


* **Wrapper transform rule (`PROC-CAMERA-WRAPPER`):** The dispatch asks to animate the `bg <img>` scale directly. Per rule, Ken Burns (`scale`, `x`, `y`) must be tweened on a wrapper transform rather than directly on the timed media element.


* **Missing mandatory files and provenance (`HARD-BRIEF-CURRENT`, `HARD-PATCH-INPUTS-DECLARED`):** Full `STORY.md` (and approval status), project format/FPS/G0 bounds, approved registry/capability names (`HARD-PREVIZ-NAMES-EXIST`), and `mara` pixel dimensions were not read. For read/referenced sources, the dispatch is missing `brief_hash`, `inputs.bible` hashes (read `bible.yaml` entities for `mara`/lighthouse), `inputs.units.L04` hash, and `inputs.clock.L04` version + hash. *Action:* Supply the unread mandatory files and the missing hashes on redispatch.


* **Downstream impact:** `s03` duration, camera scale, parallax factors, beats, and adjacent shot cut timings must be reconsidered after resolution.

## Grade

Round 2, after `9926345` (inputs rule extended to notes).

| Rule | Result | Evidence |
|---|---|---|
| PROC-PREVIZ-NO-STRETCH | PASS | Blocked; "+38%"; duration decision routed to the main agent (reallocations, trim, or lead/trail under HARD-VO-NO-OVERLAP). |
| HARD-PREVIZ-SCALE-BUDGET | PASS | Refuses the 1.15 push on 941x1672; asks for higher-coverage assets or a user-authorized waiver to cap at 1.04. |
| PROC-HARD-OVER-STYLE | PASS | "HARD scale budget ... no upscaler may be assumed"; conflict stated, not traded. |
| PROC-STYLE-FIRST / PROC-ADV-REASON | PASS | Kept style.md#motion easing implicit; the only proposed departure (cap at 1.04) is explicit and reasoned. |
| PROC-CAMERA-WRAPPER | PASS | Tween "on a wrapper transform rather than directly on the timed media element". |
| HARD-PATCH-KEYS | PASS | No patch emitted while blocked; no placeholder hashes; the notes now only ask for unread files and the actual missing hashes on redispatch ("For read/referenced sources..."). |
| PROC-SUBAGENT-NO-USER | PASS | Notes go to the main agent. |

Off-target findings:
- The format arithmetic (941/900 = 1.0455 vs the stated 1.04 cap) assumes a 900x1600 frame the dispatch never gave; the reasoning is off, but it is flagged as an assumption and does not affect any target rule.
- Reviewer note: the dispatch says style hashes were already supplied ("style camera c09e, motion e4b0"), so asking for inputs.style on redispatch is over-cautious; the notes do scope the ask to "read/referenced sources" and name the genuinely missing pieces.

Delta vs RED: PROC-PREVIZ-NO-STRETCH and PROC-CAMERA-WRAPPER fixed; HARD-PATCH-KEYS PARTIAL resolved by `9926345`. All targets pass.
