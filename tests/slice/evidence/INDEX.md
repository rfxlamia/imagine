# WP8 slice evidence

Plugin commits and harness: `session.txt` (pins fdff64d, r2 bb42347, r3 ad4bade). Isolation check: `isolation-interactive.txt`.

Two films were delivered end to end: slice-landscape (`2026-11-04-keeper-3`) and slice-portrait (`2026-11-05-keeper-3-portrait`). On 2026-11-05 the user stopped the third film (slice-textled, Task 7). Their reasons: a third run of the same story added little, and real-world use is better tested with their own stories.

| AC | Evidence | Pin | Verdict |
|---|---|---|---|
| 1 | `qc-slice-landscape.json`, `qc-slice-portrait.json` | bb42347 | PASS (landscape 1920x1080 13.5 s, portrait 1080x1920 13.3 s, -16.5 LUFS, 0 errors; text-led film not run) |
| 2 | `ac02-patch-reject.json` | bb42347 | PASS |
| 3 | deferred: guard cut; instruction-level restore observed in WP7 GREEN runs | | deferred |
| 4 | `ac04-status.json`, `ac04-impact.md` | bb42347 | FAIL: only bible:characters.mara goes stale; the ref and plates follow the contract (they record plan.yaml, not the bible). Decision bead imagine-z8p.6.15 |
| 5 | `ac05-status.json`, `ac05-impact.md` | bb42347 | FAIL (partial): L02 VO and s02 previz go stale, but so do s01/s03 previz (patch-level inputs). Bead imagine-z8p.6.16 |
| 6 | `ac06-g5a.md` | bb42347 | PASS (slice-portrait; carried over from landscape) |
| 7 | `qc-slice-landscape.json` (raster), `ac07-delivery-note.md`, `portrait-band-g6.md` | bb42347 | PASS (both delivery notes list every soft raster with its G4/G5b acceptance) |
| 8 | `ac08-interrupt.json`, `ac08-resume.log` | bb42347 | PASS (slice-portrait; no survivors, no duplicate versions) |
| 9 | deferred: safe-band cut; manual G6 check in `portrait-band-g6.md` | bb42347 | deferred (manual check partial: the user's G6 quote does not state the band, imagine-z8p.6.17) |
| 10 | deferred: capabilities cut | | deferred |
| 11 | `../../behavioral/green/SUMMARY.md` | | PASS (WP7, 69/69) |
| 12 | `ac12-stale-inputs.json`, `ac12-stale-inputs.md` | bb42347 | PASS (round 2; round 1 snapshot lacked scratch clocks, imagine-z8p.6.11) |
| 13 | deferred: safe-band and waiver CLI cut | | deferred |
| 14 | deferred: slice-textled not run (user decision 2026-11-05); text-led and music paths untested | | deferred |
| 15 | `ac15-refs.json` | bb42347 | PASS (a and b) |
| 16 | deferred: brief and stage start cut | | deferred |
| 17 | `ac17-hook.wp0.txt`, `ac17-hook.final.txt` | fdff64d, bb42347, ad4bade | PASS (round 2 symlink deny; round 3 after the session-root anchor fix, with cwd drift) |
| env | `env-telemetry.txt` (imagine-z8p.6.5) | fdff64d, bb42347 | PASS |
| tts | `tts-determinism.txt` (imagine-z8p.6.4) | ad4bade | FAIL: 5 of 10 live runs pass; regeneration is not byte-identical. Bead stays open for the user's decision on the test guarantee |

## Follow-ups filed during the slice

- imagine-z8p.6.7: probe minors (paths with spaces, lsof, codex substring, TOCTOU, leftover interrupted work dir)
- imagine-z8p.6.10: journal timestamps and non-verbatim gate quotes written by the main agent
- imagine-z8p.6.11: `probe adopt` does not copy scratch clock inputs
- imagine-z8p.6.14: scene-builder motion assertion kinds for still-plate shots
- imagine-z8p.6.15 (P1): bible edits do not stale the assets that depict the entity
- imagine-z8p.6.16: patch-level inputs over-propagate staleness
- imagine-z8p.6.17: portrait band confirmation at G6
