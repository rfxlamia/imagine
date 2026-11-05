# Portrait safe-band check at G6, and delivery resolution (slice-portrait)

AC9 (automatic safe-band cut) is deferred. This file records the manual check that replaces it. The sections below are copied verbatim from `review/REVIEW.md` of `2026-11-05-keeper-3-portrait`.

## Gate quotes (journal)

- G6: j-000050 quote="approve"
- G7: j-000053 quote="i have checked the results and approve all"

## Verdict (dev session)

PARTIAL.
- The agent measured every caption inside the band (y 168-1330) at 56 px or more. It flagged the non-text elements outside the band (s02 lamp and boots, s03 boots) for the user's decision, and it refused to treat the right-hand rail as checked.
- The plan wants the user to confirm the band in their own words at G6. Instead, the user's G6 quote is a plain "approve", and the only band confirmation is the user's G7 statement. The agent read that statement as option (a), with no waiver granted.
- Follow-up: imagine-z8p.6.17.

## Verbatim: manual check

## Manual 9:16 safe-band check (HARD-SAFE-BAND, platform generic: band y 168-1330 px, text >= 28 px)

Evidence: composition CSS of the promoted scenes plus the current frames (review-beats.jpg, beat-06-at-11.4s.png).

| Element | Frame / time | Bounds (1080x1920) | Size | Inside y 168-1330 |
|---|---|---|---|---|
| s01 caption | 2.6 s | x 96-984, y 300-700 | 64 px | yes |
| s02 caption | 7.35 s | x 96-984, y 320-522 | 56 px | yes |
| s03 caption | 11.4 s | x 220-860, y 172-236 | 58 px | yes (top edge 4 px inside the band) |

- Text size: all at least 56 px (28 px minimum met).
- Right action rail: the G0 platform spec gives only the vertical band; no horizontal extent for the rail is defined. Caption boxes end at x 984 (96 px margin); s03 ends at x 860. Whether a real platform's rail covers x > 984 or any part of the s01/s02 boxes is NOT verified (HARD_NOT_RUN for the rail exclusion until the user confirms or waives).
- Non-text elements outside the band (style.md#camera asks that the main subject and lamp stay inside): s02 lamp box (y about 1294-1546) and Mara's boots (to about y 1660); s03 Mara's boots (about y 1285-1465). Recorded for the user's G6 decision.


## Verbatim: user confirmation

## Safe-band rail check: user confirmation

Asked (j-main-053 and following messages): option (a) the user checks the final MP4 and confirms captions clear of the right-hand controls, or option (b) grants W-001. After "yes" was ambiguous, the user answered: "i have checked the results and approve all" (2026-11-05). I read this as option (a), a manual confirmation by the user, and as acceptance at G7; no waiver was granted. This is the user's own statement; the main agent did not verify the rail geometry and the user did not state the platform or rail width.


## Verbatim: delivery note resolution

- final_mp4: post/keeper-3-portrait.v1.mp4 (render --final, j-000051)
- g0: portrait 1080x1920 @ 30 fps, narrated, en, 12-15 s, generic platform, silence not intentional
- qc: ok (no errors, not_run empty): 1080x1920, 30 fps, 13.3 s, aac stereo 48 kHz, -16.5 LUFS, -4.5 dBTP; ffprobe cross-check h264 1080x1920 30/1, aac 48 kHz 2 ch, 13.3 s
- raster: worst q 0.83 (s02), all three plates soft with G4 and G5b acceptance; not native
- active_waivers: none (W-001 HARD-SAFE-BAND was only proposed and was not granted; the right-hand action rail exclusion was confirmed manually by the user, see "Safe-band rail check: user confirmation")

## qc.json raster (qc-slice-portrait.json)

- [x] s01-plate.v1: q 0.87 (soft), 941x1672 vs 1080x1920; the note says all three plates are soft, with G4 and G5b acceptance (G5b j-000037)
- [x] s02-plate.v1: q 0.83 (soft), 981x1602 vs 1080x1920; the note says all three plates are soft, with G4 and G5b acceptance (G5b j-000037)
- [x] s03-plate.v1: q 0.87 (soft), 941x1672 vs 1080x1920; the note says all three plates are soft, with G4 and G5b acceptance (G5b j-000037)
- [x] native: false
