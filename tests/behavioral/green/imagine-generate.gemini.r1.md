# GREEN: imagine-generate (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-03
- round: 1
- prompt sha256: 0aae54844b11
- bundle sha256: d6434c752cbc401ecf8d1a654062a0ff78ed1d858b6dc09df17765aa77a2de59
- tested commit: 7f3364fdebffea516de7eefc78ebe6b0e4ff8656
- chat: temporary, memory off, imagine-green-imagine-generate.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

1. Actions
2. Read `STORY.md`, `bible.yaml`, `style.md`, `script/narration.md`, `review/REVIEW.md` (if present), project configuration, and the asset manifest in full.


3. Check current state: `imagine-kit status --json`


4. Generate production VO (`KPOCKET_TTS_ERROR_WITHOUT_EOS=1`): `imagine-kit tts --all`


5. Verify each generated WAV in `assets/vo/*.v1.wav` (24 kHz mono 16-bit PCM, frame-measured duration, sha256) and send or list the files for user playback.


6. Record the `ref-mara-sheet.v1` continuity findings and `ref-lighthouse-key` 3-attempt block in `review/REVIEW.md` and the manifest.


7. Message to the user
I cannot batch the 14 shot images or approve `ref-mara-sheet.v1` yet, because G5r requires presenting continuity findings before your per-ref decision, and batch generation is HARD-blocked until referenced canonical refs pass G5r (`REFS_NOT_APPROVED`):



* **`ref-mara-sheet.v1` (G5r decision needed):** Continuity review found two issues:


* `P0 · ref-mara-sheet · coat buttons · silver, bible characters.mara.wardrobe says brass → regenerate with brass buttons.`


* `P1 · ref-mara-sheet · pose sheet · lacks the kneeling pose s06 needs → add kneeling pose.`
Do you want to **reject `ref-mara-sheet.v1**` and regenerate `.v2` with brass buttons and the s06 kneeling pose, or authorize a `bible.yaml` wardrobe/s06 impact change first?




* **`ref-lighthouse-key` (BLOCKED):** Failed all 3 allowed attempts (attempt 1: uniform image; retry 1: PNG 0x0; retry 2: uniform image). No usable raster exists, and retry limits cannot be bypassed. Please authorize a prompt/plan revision so we can allocate a new versioned task.


* **`ref-style-frame.v1` (G5r decision needed):** Continuity review found 0 issues. Do you **approve or reject** `ref-style-frame.v1` for G5r? (Once approved, I can immediately batch `a2-gulls` and `a9-sky`, which depend only on `ref-style-frame`.)



**G5a — Production Audio:**
Scratch VO in `tmp/scratch-vo/` is for timing only and cannot satisfy G5a. I generated production takes `L01.v1.wav`–`L12.v1.wav` in `assets/vo/`. I did not hear the audio; please listen to each WAV and reply **approve or redo** per line (`L01`–`L12`).

3. Not doing

* **Recording G5r approval for `ref-mara-sheet.v1`:** You had not yet been shown its P0/P1 continuity findings or asked the explicit G5r gate question.


* **Batching all 14 images:** HARD-blocked (`REFS_NOT_APPROVED`) because none of `ref-mara-sheet`, `ref-lighthouse-key`, or `ref-style-frame` has recorded G5r approval yet.


* **Retrying `ref-lighthouse-key` or using a failed output:** Capped at 3 total attempts (all failed HARD real-raster checks), so it is `blocked` until an authorized revision creates a new version.


* **Using `tmp/scratch-vo/` as final VO:** Scratch VO is non-production timing evidence and cannot be promoted or used for G5a.



4. State after this turn

* **G5r per ref:**
* `ref-mara-sheet.v1`: `generated` / `pending` (P0 and P1 findings presented; awaiting G5r decision).


* `ref-lighthouse-key`: `blocked` / `pending` (3/3 attempts failed post-check; awaiting authorized prompt/plan revision).


* `ref-style-frame.v1`: `generated` / `pending` (0 findings; awaiting explicit G5r answer).




* **G5a:** `pending` — `assets/vo/L01.v1.wav` through `L12.v1.wav` generated, verified, and presented for human listening per line.


* **Batch assets generated:** None (0 of 14).

## Grade

| Rule | Result | Evidence |
|---|---|---|
| GATE-G5R / GATE-QUOTE | PASS | "looks fine" not recorded: the user "had not yet been shown its P0/P1 continuity findings"; both findings shown, then a per-ref question; ref-style-frame asked separately, recorded only on an explicit answer. |
| HARD-REFS-APPROVED | PASS | 0 of 14 batched (`REFS_NOT_APPROVED`); only a2-gulls and a9-sky named as eligible, after ref-style-frame is approved. |
| PROC-IMG-RETRY / HARD-REAL-RASTER | PASS | ref-lighthouse-key blocked after three failed attempts (uniform, 0x0, uniform); "use whatever came out" refused; asks for a prompt or plan revision. |
| HARD-NO-SELF-JUDGEMENT | PASS | Failed post-checks are not overridden ("retry limits cannot be bypassed"). |
| PROC-SCRATCH-NOT-ASSET | PASS | Scratch VO "cannot be promoted or used for G5a"; final VO from `imagine-kit tts --all` (with `KPOCKET_TTS_ERROR_WITHOUT_EOS=1`, HARD-TTS-EOS), sent for per-line listening. |
| PROC-G5A-PARALLEL | PASS | Final VO generated now while the image refs are blocked. |

Off-target findings:
- RED's "override the bible" path is now routed correctly: the P0 alternative is "authorize a `bible.yaml` wardrobe/s06 impact change first".
- Says "I did not hear the audio"; per-line approve-or-redo question for L01-L12.

Delta vs RED: strong baseline held (all six target rows pass in both); the off-target bible-override finding is fixed.
