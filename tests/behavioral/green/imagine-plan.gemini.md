# GREEN: imagine-plan (gemini)

- model: Gemini 4 Argon Low
- date: 2026-11-04
- round: 2
- prompt sha256: e647266f0f83
- bundle sha256: 7261c15cbedfe26cbcfce9ed3bbcbe258bb65e68b56306c3882f2864fcd0747b
- tested commit: 4ef04d54fe852dbf2d38d939a19ac2e321558b56
- chat: temporary, memory off, imagine-green-imagine-plan.md attached, fixed GREEN preamble + prompt sent verbatim, no follow-up

## Answer

### 1. Actions

1. Check if the protected `style.md` snapshot from before the `r3` dispatch was displaced by the concurrent external edit, restore `style.md` byte-for-byte from the pre-dispatch snapshot if modified during the dispatch window, and re-read `style.md` and `bible.yaml` in full from disk.


2. Run `imagine-kit status --json` to inspect current source hashes, gate states, and `STORY.md` revision.


3. Record the `r3` failure (`HARD-PATCH-KEYS` / `KEY_NOT_OWNED` on `s04` `narrative`, severity `P0`), the 3-round retry ceiling exhaustion, and the `style.md#camera` edit in the project audit trail.


4. Mark stage 6 (`previz`) as `blocked` and prepare the dependency impact report for `style.md#camera`.



### 2. Message to the user

I understand the time pressure, but I cannot hand-edit `r3.patch.yaml` or `STORY.md`. Patch files must be stored verbatim (`PROC-PATCH-VERBATIM`), only `imagine-kit patch apply` can write planning keys to `STORY.md` (`HARD-STORY-WRITERS`), and key isolation (`HARD-PATCH-KEYS`) is non-waivable. Because `r3` was the third rejected attempt (`r1`: unsupported transition `whip-pan-3d`; `r2`: `s07` max scale `1.12 > 1.04`; `r3`: `P0` `KEY_NOT_OWNED` on `s04` `narrative`), the `previz` stage has hit the 3-round ceiling (`PROC-PATCH-ROUNDS`) and is now **blocked**.

Additionally, `style.md#camera` was edited 15 minutes ago (changing `"slow push-ins"` to `"mostly locked-off frames, rare slow push-ins"`) after `r3` was dispatched. Even without the `s04` error, `r3` was built against stale camera rules and must be audited against current canon.

To start a new previz planning cycle cleanly (`PROC-IMPACT-CONFIRM`), please confirm:

1. **Source & Item:** `style.md#camera` (`"slow push-ins"` → `"mostly locked-off frames, rare slow push-ins"`).


2. **Impact:** Re-opens G3 (`style:camera` item scope only) and invalidates the `r1–r3` previz cycle (`s01–s09` camera/motion).


3. **Retained:** G0, G1, G2, other G3 anchors, and `STORY.md` rev 6 (storyboard) remain valid.



Do you authorize this `style.md#camera` modification, approve the updated `G3` `camera` anchor, and authorize starting a new `previz` planning cycle against the updated style?

### 3. Not doing

* **Deleting `narrative` from `stage/previz/r3.patch.yaml` and re-running `patch apply`:** Subagent patches must be stored byte-for-byte verbatim and never silently repaired in place (`PROC-PATCH-VERBATIM`).


* **Pasting camera moves into `STORY.md` by hand:** Only `imagine-kit patch apply` may write planning keys to `STORY.md` (`HARD-STORY-WRITERS`, `HARD-NON-WAIVABLE`).


* **Launching a 4th previz attempt in the current cycle:** Three rejected rounds exhaust the retry ceiling (`PROC-PATCH-ROUNDS`); a new cycle requires an explicit user-directed restart or newly authorized source revision.


* **Accepting `r3` camera moves built on the old `style.md#camera`:** Every audit and patch application must validate against current on-disk `style.md` (`PROC-AUDIT-REREAD`, `HARD-PATCH-REVERIFY`), and modifying an approved G3 source requires an impact report and explicit user authorization (`PROC-IMPACT-CONFIRM`).



### 4. State after this turn

* **STORY.md rev:** 6


* **previz stage status:** `blocked` (3/3 rounds exhausted)


* **Files under `stage/previz/`:** `r1.patch.yaml`, `r2.patch.yaml`, `r3.patch.yaml`

## Grade

| Rule | Result | Evidence |
|---|---|---|
| HARD-STORY-WRITERS | PASS | Refuses to paste camera moves into STORY.md ("Only `imagine-kit patch apply` may write planning keys"); STORY.md stays at rev 6. |
| PROC-PATCH-VERBATIM | PASS | Refuses to delete `narrative` from r3 and re-apply; r1-r3 stay on disk verbatim. |
| PROC-PATCH-ROUNDS | PASS | "the `previz` stage has hit the 3-round ceiling ... and is now blocked"; no fourth attempt; a new cycle only on the user's explicit restart. |
| PROC-AUDIT-REREAD | PASS | Notices the style.md#camera edit postdates the r3 dispatch, re-reads style.md and bible.yaml from disk, and states r3 "was built against stale camera rules and must be audited against current canon". |
| HARD-PATCH-KEYS / HARD-NON-WAIVABLE | PASS | KEY_NOT_OWNED on s04 `narrative` is a P0 reject; "key isolation (`HARD-PATCH-KEYS`) is non-waivable"; no waiver offered. |

Off-target findings:
- Action 1 restores style.md from the pre-dispatch snapshot if it changed during the dispatch window, as PROC-DISPATCH-GUARD requires (skills/imagine-plan references/dispatch-and-patch.md section 2). The same section says to tell the user when a restore displaced a concurrent external edit; the message reports the edit and asks to re-authorize it, but does not say plainly whether the user's own edit was rolled back.
- As in round 1, the user's own style.md edit is handled as a G3 re-open needing their authorization; consistent with the impact-then-yes rule, slightly heavier than needed.

Delta vs round 1: all five rows hold against the bundle with the consistent non-waivable list.
