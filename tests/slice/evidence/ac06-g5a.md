# AC6 G5a VO redo by seed (slice-portrait, 2026-11-05)

Project: `$HOME/imagine-slice/work/.imagine/2026-11-05-keeper-3-portrait`

## Redo request (user's words, as recorded in the journal at j-main-036; kit reject j-000031)

> redo L02 with a different seed, the pause is too long

## WAV paths and hashes after the redo

- `assets/vo/L01.v1.wav` 30e627718d856cb50562c99267dbd3a382ce85fded433956ddb53c31251aea29
- `assets/vo/L02.v1.wav` 14740cd33fd8e9c7944ca9faee57ee1057e16292c0ff22848780d330c2678265
- `assets/vo/L02.v2.wav` e4acbda1c958ea4b66336c6d0e64c6189b3337cb8ea0d1dc70a2c55094867229
- `assets/vo/L02.v3.wav` 45d7996faac1cb4251f77041c1588dcd3856d6886aba28de06d3ec8d9dfec0c1
- `assets/vo/L02.v4.wav` 699ee784c63c41b90a78081b4e937f498294c955c1ab09a8716ecbbba90dda6f
- `assets/vo/L03.v1.wav` efcaa78588e7d3ffd2bda641eebcc0bd02da19d53162656b7dc07954a1514f48

## Redone line L02

| Take | Seed | Duration | sha256 (prefix) | Status |
|---|---|---|---|---|
| L02.v1 | 1301 | 3.28 s | 14740cd3 | rejected (listen_status redo) |
| L02.v2 | 1302 | 3.36 s | e4acbda1 | pending |
| L02.v3 | 1303 | 3.20 s | 45d7996f | pending (extra take by the agent) |
| L02.v4 | 1304 | 3.20 s | 699ee784 | pending (extra take by the agent) |

The agent measured the mid-sentence pause for each take: v1 0.256 s, v2 0.342 s, v3 0.297 s, v4 0.248 s. A new seed barely moves the pause (journal j-main-037).

## Unchanged lines

L01.v1 (seed 1301, 4.00 s) and L03.v1 (seed 1301, 1.60 s) have the same sha256 before and after the redo. Before the redo: L01 30e62771..., L03 efcaa785...; after: listed above.

## diff-status (g5a-before vs g5a-after)

```json
{
  "newly_stale": [],
  "others_count": 37
}
```
