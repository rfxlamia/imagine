# sequential-shorts live slice

Plugin commit: 1f1b762 (branch `foreman/shorts-t1`, with the uncommitted sequential-shorts package on top). Date: 2026-11-10. Machine: macOS, ffmpeg-full `ffmpeg version 9.0.2 Copyright (c) 2000-2026 the FFmpeg developers`.

Input: `~/content/.imagine/2026-11-07-kontrak-yang-bikin-kamu-gak-bisa-resign/post/kontrak-yang-bikin-kamu-gak-bisa-resign.v1.mp4` (sha256 `2de67cf8f65a4fe72e6fef50b83b912eae813e0e171cc5f3a69dcfefa9c75bbe`), 250.8 s, 1080x1920 30 fps CFR, AAC 48 kHz stereo.
Output: `~/content/.imagine/2026-11-07-kontrak-yang-bikin-kamu-gak-bisa-resign/tmp/sequential-shorts-live` (inside the project's tmp/, allowed by the write boundary). MP4 and WAV files are not committed.

ASR: faster-whisper 1.2.1, model `mobiuslabsgmbh/faster-whisper-large-v3-turbo` at revision `0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf`, language `id` (probability 1).

| Check | Evidence | Verdict |
| --- | --- | --- |
| Real ASR, Indonesian | `manifest.json` transcript.language, provenance.model.revision | PASS |
| Parts within max, chronological, exact coverage | `qc.json` coverage (frames 7524/7524, samples 12038400/12038400) | PASS |
| Per-part QC | `qc.json` parts[] (4 parts: 61.43 s, 60.4 s, 56.07 s, 72.9 s) | PASS |
| Source unchanged | `manifest.json` source.unchanged | PASS |
| Imagine records unchanged (project.yaml, journal.md, review/) | `manifest.json` imagine_records.changed | PASS |
| Visual review of each cut | `review.json`, `cut-*.png` | PASS (01-02), PASS (02-03), PASS (03-04) |
| Listening review of each cut | `review.json` | PASS (01-02), PASS (02-03), PASS (03-04), from the user |

The user listened and said, verbatim: "sudah aku dengar. wav nya sih terpotong di bagian lagi ngomong. tapi mp4 nya aman". The `cut-*.wav` excerpts span 1.5 s on each side of the cut, so their own edges fall mid-speech by design; the cuts themselves were judged clean in the rendered parts. The listening verdicts were recorded after the last render (`manifest.json` created 2026-11-10T02:15:27Z), so `manifest.json` `not_run` still lists the three listening items; `review.json` is the source of truth for review verdicts. The user then moved the rendered parts out of the output directory, so no further render was run.

Boundary moves during the semantic pass:

- Part 3/4: from t 180.333333 (`c0662`, clause gap after "Tahun 1930,") to t 177.9 (`c0657`, sentence end after "Viral doang belum tentu bikin sistem berubah."). The original cut separated the year from its event ("Tahun 1930, | Amerika mengesahkan ..."). Part 3 went from 58.5 s to 56.07 s, part 4 from 70.47 s to 72.9 s. `render` returned CONFLICT on parts 3 and 4 as designed, and `render --replace` moved them to `superseded/`.

Titles and descriptions use the standard spellings of names the transcript misheard ("Delhi" as Deli, "Klee Ordenanti" and "Kule Ordonante" as Koeli Ordonnantie). No other facts were added beyond the transcript.

Deviation from the plan during this slice: the first live run failed with `TypeError: open() got an unexpected keyword argument 'metadata_errors'`. `uv run --with faster-whisper==1.2.1` resolved PyAV 19, which removed that argument. The ASR worker now also pins `av==18.0.0` (`src/analyze/asr.mjs`, `PYAV`), and the live run passed after that.
