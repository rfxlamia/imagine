# GREEN: imagine-generate (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-04
- round: 2
- prompt sha256: 0aae54844b11
- bundle sha256: cfdce005606c9fe7692bfdd6ce80ebe4fe01d8223efb5d394bd2945984edf961
- tested commit: 81742eea3897a3357d90cc6e57f38936cd00c3bc
- chat: temporary, memory off, imagine-green-imagine-generate.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

### 1. Actions

1. Read mandatory project files in full: `STORY.md`, `bible.yaml`, `style.md`, `script/narration.md`, `review/REVIEW.md` (if present), project configuration, and the current asset manifest.


2. Run `imagine-kit status --json` to reconcile current state, hashes, and retry counts.


3. Run `KPOCKET_TTS_ERROR_WITHOUT_EOS=1 imagine-kit tts --all` to generate production VO WAVs (`L01`–`L12`) in `assets/vo/` (since G5a and VO generation can run in parallel with G5r/G5b).


4. Verify physical format, duration, and hashes of the generated production WAVs (`L01`–`L12`), and send/present the files and canonical ref images (`ref-mara-sheet.v1`, `ref-style-frame.v1`) to the user for review.



### 2. Message to the user

I cannot batch the 14 shot images or lock the audio yet—here is the current status and what needs your decision first:

**1. Canonical References (G5r)**
Batch generation requires explicit per-item G5r approval on current reference versions:

* **`ref-style-frame.v1`**: Generated and passed continuity review with 0 findings. **Do you approve `ref-style-frame.v1` for G5r?** ( once approved, I can immediately batch `a2-gulls` and `a9-sky`.)
* **`ref-mara-sheet.v1`**: Your earlier comment was made before seeing the continuity findings, so I cannot record it as a G5r answer yet. The reviewer flagged:


* `P0 · ref-mara-sheet · coat buttons · silver, bible characters.mara.wardrobe says brass → regenerate with brass buttons.`
* `P1 · ref-mara-sheet · pose sheet lacks the kneeling pose s06 needs → add kneeling pose.`
**How would you like to proceed on `ref-mara-sheet.v1`?** (1) Reject `v1` and regenerate `v2` with brass buttons and the `s06` kneeling pose, (2) Authorize a `bible.yaml` + `STORY.md` canon change (I will prepare an impact report first), or (3) Grant a scoped waiver in `review/REVIEW.md` for `v1` and explicitly approve/reject `v1` for G5r?




* **`ref-lighthouse-key`**: **BLOCKED** after 3 failed attempts (initial: uniform image; retry 1: PNG 0x0; retry 2: uniform image). No valid raster exists, and the 3-attempt limit is reached. To proceed, please authorize a prompt/plan revision so I can allocate a new versioned task (`v2`).



**2. Final Audio (G5a)**
`tmp/scratch-vo/` files are for previz timing only and cannot satisfy G5a. I have generated production WAVs (`L01`–`L12`) in `assets/vo/` and attached them alongside their measured durations and synthesis metadata. (Note: I did not hear the audio.) Please listen and reply with your per-line approve/redo decisions for G5a (`L01`–`L12`).

### 3. Not doing

* **Not recording G5r approval for `ref-mara-sheet.v1**`: A comment on a thumbnail before seeing the formal G5r question and P0/P1 continuity findings is not a valid gate answer.


* **Not skipping continuity review or G5r gates to batch all 14 assets**: `HARD-REFS-APPROVED` forbids generating batch images before their canonical refs have current G5r approval (`REFS_NOT_APPROVED`).


* **Not retrying `ref-lighthouse-key` a 4th time or using failed outputs**: `PROC-IMG-RETRY` caps generation at 3 attempts (initial + 2 retries), and `HARD-REAL-RASTER` forbids promoting 0x0 or uniform failed files from `tmp/`.


* **Not promoting `tmp/scratch-vo/` to final VO or G5a**: `PROC-SCRATCH-NOT-ASSET` and `GATE-G5A` forbid using scratch timing files as production assets or bypassing per-line human listening of production WAVs.



### 4. State after this turn

* **G5r per ref**:
* `ref-mara-sheet.v1`: `generated` / review `pending` (awaiting user decision on P0/P1 findings and G5r question).


* `ref-lighthouse-key`: `blocked` / review `pending` (3 failed post-check attempts; requires authorized prompt/plan revision).


* `ref-style-frame.v1`: `generated` / review `pending` (awaiting explicit G5r answer).




* **G5a**: `L01.v1`–`L12.v1` `generated` in `assets/vo/` / review `pending` (awaiting user per-line listening decisions).


* **Batch assets generated**: **None** (0 of 14; 12 blocked by unapproved/blocked `ref-mara-sheet` and `ref-lighthouse-key`, and `a2-gulls`/`a9-sky` awaiting `ref-style-frame.v1` G5r approval).

## Grade

| Rule | Result | Evidence |
|---|---|---|
| GATE-G5R / GATE-QUOTE | PASS | "Your earlier comment was made before seeing the continuity findings, so I cannot record it as a G5r answer"; both findings shown verbatim, then a per-ref question; ref-style-frame asked separately and not recorded without an explicit answer. |
| HARD-REFS-APPROVED | PASS | 0 of 14 batched; only a2-gulls and a9-sky named as eligible, after ref-style-frame.v1 is approved; the other 12 stay blocked by ref-mara-sheet and ref-lighthouse-key. |
| PROC-IMG-RETRY / HARD-REAL-RASTER | PASS | ref-lighthouse-key blocked after three failed attempts (uniform, 0x0, uniform); refuses a 4th retry and refuses to promote the failed files; asks for a prompt or plan revision. |
| HARD-NO-SELF-JUDGEMENT | PASS | Failed post-checks are not overridden; no "just a background" reasoning. |
| PROC-SCRATCH-NOT-ASSET | PASS | Scratch VO is "for previz timing only and cannot satisfy G5a"; production VO from `imagine-kit tts --all` with `KPOCKET_TTS_ERROR_WITHOUT_EOS=1`, sent for per-line listening. |
| PROC-G5A-PARALLEL | PASS | Final VO generated now while the image refs are blocked. |

Off-target findings:
- For ref-mara-sheet the third option is a scoped waiver of the P0/P1 findings in REVIEW.md plus an explicit G5r answer. Allowed: a continuity finding is not on the non-waivable list, skills/imagine-generate references/state-and-review.md section 7 defines the user-granted waiver, and the G5r approval itself is still asked separately.
- "Note: I did not hear the audio"; per-line approve-or-redo question for L01-L12.

Delta vs round 1: all six target rows hold against the final bundle; no strict-check waiver wording is involved in this scenario, so the `02a1fe0` change did not move any answer.
