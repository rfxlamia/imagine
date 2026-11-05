plugin_commit: bb42347c5c740dc8bce1ff4b8599e739833c2100

# AC12 run notes (slice-landscape, 2026-11-04)

Round 1 on snapshot `p1-ac12` gave FAIL with a failing control (`exit 1, code HARD`,
"clock:L01 does not exist"). Cause: the storyboard patch declares `clock:L01..L03`
inputs that point at `tmp/scratch-vo/L0N.wav`. The main agent created those scratch
VO files at 23:23 local, after the G3-wait snapshot (23:22), while preparing the
storyboard brief. `probe.mjs adopt` copies only the patch file, so the snapshot
lacked the clock inputs. The kit was right to refuse; the probe setup was incomplete.

Round 2 (the JSON next to this note): snapshot `p1-ac12b` was taken from the adopted
`p1-ac02` snapshot (G3 recorded with the probe quote, patch present, canon unchanged),
and the three live scratch WAVs plus durations.yaml were copied into its
`tmp/scratch-vo/` (sha256 prefixes e604f283, d9a996d4, e15fefe7, equal to the hashes
the patch records). Control apply exits 0; the probe apply after editing
`bible.characters.mara` exits 4 with STALE_INPUTS and STORY.md is unchanged. The live
STORY.md and project.yaml hashes were unchanged throughout (`shasum -c` OK).
Follow-up: imagine-z8p.6.11 (adopt should also bring the patch's scratch clock inputs).
