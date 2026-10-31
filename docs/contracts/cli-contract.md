# imagine-kit CLI contract (frozen 2026-10-31, kit contract v1)

Invocation: `node packages/imagine-kit/bin/imagine-kit.mjs <command> [args] [--project <dir>] [--pretty]`.
Default project: the directory named in `.imagine/ACTIVE`. Output: the **last line of stdout** is the JSON envelope, always single-line (`--pretty` is for humans only and is never parsed). Only `brief` writes anything before it (delimited reference blocks); every other command writes only the envelope. Parsers read the last non-empty stdout line. Diagnostics go to stderr.

## Envelope

```json
{ "ok": true, "command": "patch apply", "kit_version": "0.1.0", "contract": 1,
  "project": ".imagine/2026-10-31-keeper", "code": null,
  "data": {}, "errors": [], "advice": [], "not_run": [], "waived": [], "journal_id": "j-000042" }
```

- `errors[]`: `{ rule, code, item, message, cause? }` — HARD; any entry ⇒ `ok: false`.
- `advice[]`: `{ rule, item, message, source }` — ADVISORY; never blocks.
- `not_run[]`: `{ rule, item, cause }` — ADVISORY checks that did not run; never counted as pass.
- `waived[]`: `{ rule, item, waiver_id }`.
- A HARD check that cannot run appears in `errors` with `code: "HARD_NOT_RUN"` and `cause`.

## Exit codes

| Exit | Meaning | `code` values |
|---|---|---|
| 0 | ok | null |
| 1 | HARD errors | `HARD_NOT_RUN`, `KEY_NOT_OWNED`, `PLACEHOLDER`, `GUARD_VIOLATION`, `INVALID_WAIVER`, `HARD` |
| 2 | usage | `USAGE` |
| 3 | capability missing | `BLOCKED` |
| 4 | inputs moved | `STALE_INPUTS`, `CONFLICT`, `BRIEF_OUTDATED` |
| 5 | lock timeout (30 s) | `LOCKED` |
| 6 | refs not approved | `REFS_NOT_APPROVED` |
| 7 | user decision required | `NEEDS_USER` |

## Commands

Each row: synopsis · preconditions · effect · `data` · capability key (Phase 1 status).

| Command | Preconditions | Effect | `data` | Phase 1 |
|---|---|---|---|---|
| `capabilities` | none | read-only | `{ version, contract, commands: { "<key>": { status, note? } } }` | implemented |
| `new "<title>" --format landscape\|portrait --audio-mode narrated\|music-led\|text-led --lang <bcp47> --duration <min>-<max> [--platform generic] [--silence intentional]` | no project with same slug today | creates `.imagine/<YYYY-MM-DD>-<slug>/` tree (§5), writes `project.yaml` with G0 **proposal** (status `pending`), sets `ACTIVE`, journal | `{ project, g0 }` | implemented; `--platform` values other than `generic` → `BLOCKED` |
| `status [--item <id>]` | project | read-only; derives `stale` / `needs_review` from recorded hashes (§6.2) | `{ stage, gates, items: [{ id, kind, status, reasons[] }], blocked[] }` | implemented |
| `gate <G0\|G1\|G2\|G3\|G4\|G5r\|G5a\|G5b\|G6\|G7> approve\|reject [--scope <id,…>] --quote "<user words>" [--note <text>]` | quote non-empty; gate open for the scoped items | records decision per item with quote + hashes, journal | `{ gate, decision, items[] }` | implemented; missing quote → `NEEDS_USER` |
| `review confirm <item,…> --quote "<user words>"` | items are `needs_review` | records "still true", no rev bump | `{ items[] }` | implemented |
| `validate <script\|bible\|style\|story\|assets> [--stage storyboard\|previz\|fx]` | project | read-only HARD + ADVISORY run | `{ target, checked[] }` | implemented |
| `doc write <raw\|narration\|copy\|readtime\|bible\|style> --from <draft> [--confirm-impact <impact_id> --quote "<user words>"]` | lock | without confirm on an approved doc: returns impact report, writes nothing (`NEEDS_USER`); with confirm: atomic write, rev+1, `.history/`, journal | `{ doc, rev, impact: { reopen[], stale[], needs_review[] }, impact_id }` | implemented |
| `brief <stage> [--item <id>]` | manifest resolvable | prints every mandatory reference in full to stdout **before** the envelope, between `=== BEGIN <path> sha256:<h> ===` / `=== END <path> ===` lines; envelope last | `{ stage, files: [{ path, sha256 }], brief_hash }` | implemented |
| `stage start\|finish <stage> [--item <id>] --brief <hash>` | `brief_hash` current | state transition + journal | `{ stage, item, status }` | implemented; outdated → `BRIEF_OUTDATED` |
| `waiver propose --rule <id> --scope <id,…> --reason <text> --consequence <text>` | rule waivable; scope explicit (no `all`) | writes proposal (not active) | `{ waiver_id, status: "proposed" }` | implemented |
| `waiver grant <waiver_id> --quote "<user words>" [--manual-check <text>]` | proposal exists; quote | activates, stores scope hashes | `{ waiver_id, status: "active" }` | implemented |
| `waiver revoke <waiver_id> --quote "<user words>"` · `waiver list` | — | — | `{ waivers[] }` | implemented |
| `patch validate <file>` | patch under `stage/<stage>/` | read-only; records patch sha256 | `{ patch, sha256, ops }` | implemented |
| `patch apply <file>` | prior validate with same sha | §3.2 steps 1–6 | `{ story_rev, touched[] }` | implemented; auto-rebase `not_implemented` (always `CONFLICT`) |
| `diff-keys <before> <after> --stage <s>` | — | read-only | `{ changed: [{ shot, key }] }` | implemented |
| `guard begin <dispatch_id> --stage <s> [--shot <id>]` · `guard verify <dispatch_id>` | lock for verify-restore | hashes protected files to `.history/guard/<id>/`; verify restores + reports | `{ protected[], violations[] }` | implemented |
| `stage-shot <id>` · `promote-shot <id>` | edit stage open; shot previz+fx approved | shadow project create; promote re-lints, copies composition, re-times and merges that shot's assertions into root `edit/index.motion.json` | `{ shot, path }` | implemented |
| `img --ref <ref_id>` · `img --batch <asset_id,…> [--redo <asset_id> --note <text>]` | G4 approved; batch: every `refs[]` G5r-approved at current version | Codex adapter (§7.1), new `.vN` | `{ assets: [{ id, v, w, h, q, tier, sha256, revised_prompt }] }` | implemented; parallel `not_implemented` |
| `tts <line,…\|--all> [--audition --voices <a,b,c> --line <L##>] [--scratch] [--redo <line> --note <text>]` | narrated; voice cast (production) | Python worker (§7.3) | `{ takes: [{ line, v, seed, duration_s, sha256, params_hash }] }` | implemented |
| `readtime [--unit <T##> --override <s>]` | text-led | writes `script/readtime.yaml` via lock | `{ units: [{ id, words, seconds, override? }] }` | implemented |
| `beats <music_asset_id>` | music asset imported | wraps `npx hyperframes@0.8.223 beats` | `{ bpm, beats_s[] }` | implemented (fixtures; live run Phase 2) |
| `audio-page` | VO or cues exist | writes `review/audio/index.html` | `{ path, lines }` | implemented; zip bundle `not_implemented` |
| `assets import <music\|sfx\|vo> --file <path> --license <id> --source <url\|text> --credit <text> [--id <id>]` | licence fields non-empty | copies to `assets/<kind>/<id>.v1.<ext>`, manifest entry, CREDITS.md | `{ id, v }` | implemented |
| `assets check` | — | HARD: every referenced asset exists, approved, hash matches | `{ checked }` | implemented |
| `res-budget [--shot <id>]` · `res-report` | storyboard/previz present · assets measured | §7.2 | `{ shots: [{ id, layers: [{ id, required_px, q?, tier? }] }] }` | implemented |
| `export-hf` | G5a + G5b approved | writes `edit/STORYBOARD.md`, syncs approved asset versions into `edit/assets/` | `{ shots, assets }` | implemented |
| `check` | `edit/` exists | `npx hyperframes@0.8.223 check --json --strict` + D10 allowlist → `review/check.json` | `{ raw_counts, errors, advice }` | implemented |
| `loudness [--target -16]` | `edit/` exists | wraps `npx hyperframes@0.8.223 normalize-audio`; journal | `{ before_lufs, after_lufs }` | implemented |
| `safe-band` | portrait | HARD 9:16 band check | `{ boxes: [{ shot, t, box, inside }] }` | implemented; no Chrome → `HARD_NOT_RUN` |
| `render --draft\|--final` | draft: `check` clean; final: G6 | `--fps 30 --no-best-effort`; final `--quality delivery` → `post/<slug>.v<n>.mp4` | `{ path, sha256 }` | implemented |
| `qc <mp4>` | file exists | ffprobe + ebur128 + spec + `res-report` + credits + waivers → `review/qc.json` | `{ w, h, fps, duration_s, audio, lufs, true_peak, raster, credits, waivers }` | implemented |
| `fork --format <f>` | — | — | — | not_implemented |

## Decisions frozen here

- Q1 soft threshold 0.75 · Q2 conflicts always re-dispatch · Q3 fork later · Q4 `platform` default `generic` (band 168–1330 px on 1080×1920, −16 LUFS ±1.5, true peak ≤ −1 dBTP) · Q5 non-waivable list as §8.0.
- Motion-assertion merge owner: `promote-shot`. `export-hf` never touches `index.motion.json`.
- Loudness owner: `loudness` (before draft render) and `qc` (verification).
- Test-only: `IMAGINE_KIT_CAPABILITY_OVERRIDES=<json>` honoured only when `IMAGINE_KIT_TEST=1`; otherwise ignored with an `advice` entry.
