# imagine-kit CLI contract (frozen 2026-10-31, kit contract v1; slimmed 2026-10-31, still v1)

Re-plan note (2026-10-31, branch `phase1-replan`): Phase 1 ships **12 commands**. Every other row below is marked `deferred (<reason>)` and stays in the table so nothing is silently dropped; a deferred command is not built in Phase 1 and nothing may depend on it. Envelope shape and exit-code values are unchanged (contract v1); codes owned only by deferred commands are marked reserved. Trade-off and per-rule changes: `.internal/plans/2026-10-31-imagine-phase1-master.md`.

Invocation: `node packages/imagine-kit/bin/imagine-kit.mjs <command> [args] [--project <dir>] [--pretty]`.
Default project: the directory named in `.imagine/ACTIVE`. Output: the **last line of stdout** is the JSON envelope, always single-line (`--pretty` is for humans only and is never parsed). Every command writes only the envelope to stdout. Parsers read the last non-empty stdout line. Diagnostics go to stderr.

## Envelope

```json
{ "ok": true, "command": "patch apply", "kit_version": "0.1.0", "contract": 1,
  "project": ".imagine/2026-10-31-keeper", "code": null,
  "data": {}, "errors": [], "advice": [], "not_run": [], "waived": [], "journal_id": "j-000042" }
```

- `errors[]`: `{ rule, code, item, message, cause? }` — HARD; any entry ⇒ `ok: false`.
- `advice[]`: `{ rule, item, message, source }` — ADVISORY; never blocks.
- `not_run[]`: `{ rule, item, cause }` — ADVISORY checks that did not run; never counted as pass.
- `waived[]`: `{ rule, item, waiver_id }` — reserved; always `[]` in Phase 1 (waivers are REVIEW.md entries, not CLI state).
- A HARD check that cannot run appears in `errors` with `code: "HARD_NOT_RUN"` and `cause`.

## Exit codes

| Exit | Meaning | `code` values |
|---|---|---|
| 0 | ok | null |
| 1 | HARD errors | `HARD_NOT_RUN`, `KEY_NOT_OWNED`, `PLACEHOLDER`, `HARD`; reserved: `GUARD_VIOLATION`, `INVALID_WAIVER` |
| 2 | usage | `USAGE` |
| 3 | capability missing | `BLOCKED` |
| 4 | inputs moved | `STALE_INPUTS`, `CONFLICT`; reserved: `BRIEF_OUTDATED` |
| 5 | lock timeout (30 s) | reserved: `LOCKED` (no lock in Phase 1) |
| 6 | refs not approved | `REFS_NOT_APPROVED` |
| 7 | user decision required | `NEEDS_USER` |

Reserved = value stays in the enum and schema, no Phase 1 command emits it.

## Commands

Each row: synopsis · preconditions · effect · `data` · Phase 1 status. Status is `WP1` / `WP2` (the work package that builds it) or `deferred (<reason>)`. Counting basis: the re-plan brief counts 33 commands, of which 12 are built and 21 are cut or deferred (it counts `lock`, which has no row, and excludes `patch validate`, `res-report`, `assets check` and the non-story `validate` targets). The original table had 32 rows; this table has 34 because `validate` and `res-budget` / `res-report` are split. Four rows beyond the 21 are folded or absorbed: `patch validate` (into `patch apply`), `assets check` (into `export-hf`), `res-report` (into `qc`), `validate <script|bible|style|assets>` (deferred, with `assets` folded into `export-hf`).

| Command | Preconditions | Effect | `data` | Phase 1 |
|---|---|---|---|---|
| `capabilities` | none | read-only | `{ version, contract, commands: { "<key>": { status, note? } } }` | deferred (no per-skill fallback tables; missing tools surface as `BLOCKED` at the step) |
| `new "<title>" --format landscape\|portrait --audio-mode narrated\|music-led\|text-led --lang <bcp47> --duration <min>-<max> [--platform generic] [--silence intentional]` | no project with same slug today | creates `.imagine/<YYYY-MM-DD>-<slug>/` tree (proposal section 5), writes `project.yaml` with G0 **proposal** (status `pending`), sets `ACTIVE`, journal | `{ project, g0 }` | WP1; `--platform` values other than `generic` → `BLOCKED` |
| `status [--item <id>]` | project | read-only; derives `stale` from recorded hashes only (proposal section 6.2). `needs_review` is not computed: the main agent records it from an impact report | `{ stage, gates, items: [{ id, kind, status, reasons[] }], blocked[] }` | WP1 |
| `gate <G0\|G1\|G2\|G3\|G4\|G5r\|G5a\|G5b\|G6\|G7> approve\|reject [--scope <id,…>] --quote "<user words>" [--note <text>]` | quote non-empty; gate open for the scoped items | records decision per item with quote + hashes, journal | `{ gate, decision, items[] }` | WP1; missing quote → `NEEDS_USER` |
| `review confirm <item,…> --quote "<user words>"` | items are `needs_review` | records "still true", no rev bump | `{ items[] }` | deferred (replaced by a REVIEW.md entry with the user's quote) |
| `validate story [--stage storyboard\|previz\|fx]` | project | read-only strict `STORY.md` parser, HARD + ADVISORY run | `{ target, checked[] }` | WP1 |
| `validate <script\|bible\|style\|assets>` | project | read-only | `{ target, checked[] }` | deferred (script/bible/style are checked by audit subagents and the main agent; `assets` folded into `export-hf`) |
| `doc write <raw\|narration\|copy\|readtime\|bible\|style> --from <draft> [--confirm-impact <impact_id> --quote "<user words>"]` | lock | without confirm on an approved doc: returns impact report, writes nothing (`NEEDS_USER`); with confirm: atomic write, rev+1, `.history/`, journal | `{ doc, rev, impact: { reopen[], stale[], needs_review[] }, impact_id }` | deferred (main agent writes the file; `status` detects the hash change) |
| `brief <stage> [--item <id>]` | manifest resolvable | printed every mandatory reference in full before the envelope | `{ stage, files: [{ path, sha256 }], brief_hash }` | deferred (skill lists the files to read; brief-delivery proof is instruction-only) |
| `stage start\|finish <stage> [--item <id>] --brief <hash>` | `brief_hash` current | state transition + journal | `{ stage, item, status }` | deferred (skill instructions plus plain files) |
| `waiver propose --rule <id> --scope <id,…> --reason <text> --consequence <text>` | rule waivable; scope explicit (no `all`) | writes proposal (not active) | `{ waiver_id, status: "proposed" }` | deferred (REVIEW.md waivers section with the user's quote) |
| `waiver grant <waiver_id> --quote "<user words>" [--manual-check <text>]` | proposal exists; quote | activates, stores scope hashes | `{ waiver_id, status: "active" }` | deferred (as above; hash-bound waivers are instruction-only) |
| `waiver revoke <waiver_id> --quote "<user words>"` · `waiver list` | — | — | `{ waivers[] }` | deferred (as above) |
| `patch validate <file>` | patch under `stage/<stage>/` | read-only; records patch sha256 | `{ patch, sha256, ops }` | folded into `patch apply` (validation always runs inside apply) |
| `patch apply <file>` | patch under `stage/<stage>/` | validates, re-hashes every recorded input against the sources, atomic commit (proposal section 3.2) | `{ story_rev, touched[] }` | WP1; auto-rebase `not_implemented` (always `CONFLICT`); `brief_hash` field stays in the schema but is not verified |
| `diff-keys <before> <after> --stage <s>` | — | read-only | `{ changed: [{ shot, key }] }` | deferred (planning subagents have no Write tool; `patch apply` enforces the key set) |
| `guard begin <dispatch_id> --stage <s> [--shot <id>]` · `guard verify <dispatch_id>` | lock for verify-restore | hashes protected files to `.history/guard/<id>/`; verify restores + reports | `{ protected[], violations[] }` | deferred (main agent hashes protected files by instruction; scene-builder is still blocked by the PreToolUse hook) |
| `stage-shot <id>` · `promote-shot <id>` | edit stage open; shot previz+fx approved | shadow project create; promote re-lints, copies composition, re-times and merges that shot's assertions into root `edit/index.motion.json` | `{ shot, path }` | WP2 |
| `img --ref <ref_id>` · `img --batch <asset_id,…> [--redo <asset_id> --note <text>]` | G4 approved; batch: every `refs[]` G5r-approved at current version | Codex adapter (proposal section 7.1), new `.vN` | `{ assets: [{ id, v, w, h, q, tier, sha256, revised_prompt }] }` | WP2; parallel `not_implemented` |
| `tts <line,…\|--all> [--audition --voices <a,b,c> --line <L##>] [--scratch] [--redo <line> --note <text>]` | narrated; voice cast (production) | Python worker (proposal section 7.3) | `{ takes: [{ line, v, seed, duration_s, sha256, params_hash }] }` | WP2 |
| `readtime [--unit <T##> --override <s>]` | text-led | writes `script/readtime.yaml` via lock | `{ units: [{ id, words, seconds, override? }] }` | deferred (formula max(1.2, 0.5 + 0.3 x words) lives in the skill) |
| `beats <music_asset_id>` | music asset imported | wraps `npx hyperframes@0.8.223 beats` | `{ bpm, beats_s[] }` | deferred (skill calls `npx hyperframes@0.8.223 beats` directly) |
| `audio-page` | VO or cues exist | writes `review/audio/index.html` | `{ path, lines }` | deferred (G5a lists WAV paths; remote device gets files via SendUserFile) |
| `assets import <music\|sfx\|vo> --file <path> --license <id> --source <url\|text> --credit <text> [--id <id>]` | licence fields non-empty | copies to `assets/<kind>/<id>.v1.<ext>`, manifest entry, CREDITS.md | `{ id, v }` | deferred (user places the file and fills the manifest; `export-hf` validates it) |
| `assets check` | — | HARD: every referenced asset exists, approved, hash matches | `{ checked }` | folded into `export-hf` (runs it before syncing; `render --final` re-checks hashes) |
| `res-budget [--shot <id>]` | storyboard/previz present | proposal section 7.2 | `{ shots: [{ id, layers: [{ id, required_px, q?, tier? }] }] }` | deferred (skill computes from `required_px`; measured q comes from `qc`) |
| `res-report` | assets measured | proposal section 7.2 | `{ shots: [...] }` | absorbed by `qc` |
| `export-hf` | G5a + G5b approved | runs the asset check (exists, approved, hash matches, licence fields for third-party audio), writes `edit/STORYBOARD.md`, syncs approved asset versions into `edit/assets/` | `{ shots, assets }` | WP2 |
| `check` | `edit/` exists | `npx hyperframes@0.8.223 check --json --strict` + D10 allowlist → `review/check.json` | `{ raw_counts, errors, advice }` | deferred (skill calls `npx hyperframes@0.8.223 check --json --strict` directly and applies the D10 allowlist) |
| `loudness [--target -16]` | `edit/` exists | wraps `npx hyperframes@0.8.223 normalize-audio`; journal | `{ before_lufs, after_lufs }` | deferred (skill calls `npx hyperframes@0.8.223 normalize-audio` directly; `qc` verifies) |
| `safe-band` | portrait | HARD 9:16 band check | `{ boxes: [{ shot, t, box, inside }] }` | deferred (portrait band is a manual check at G6, recorded in REVIEW.md) |
| `render --draft\|--final` | draft: skill ran `check` clean; final: G6 | `--fps 30 --no-best-effort`; final `--quality delivery` → `post/<slug>.v<n>.mp4` | `{ path, sha256 }` | WP2 |
| `qc <mp4>` | file exists | ffprobe + ebur128 + spec + per-raster q (the former `res-report`) + credits → `review/qc.json` | `{ w, h, fps, duration_s, audio, lufs, true_peak, raster, credits }` | WP2 |
| `fork --format <f>` | — | — | — | deferred (one project, one format; later phase) |

## Decisions frozen here

- Q1 soft threshold 0.75 · Q2 conflicts always re-dispatch · Q3 fork later · Q4 `platform` default `generic` (band 168–1330 px on 1080×1920, −16 LUFS ±1.5, true peak ≤ −1 dBTP) · Q5 non-waivable list as proposal section 8.0.
- Motion-assertion merge owner: `promote-shot`. `export-hf` never touches `index.motion.json`.
- Loudness: the skill normalises with `npx hyperframes@0.8.223 normalize-audio` before the draft render; `qc` is the only tool that verifies it.
- Test-only: `IMAGINE_KIT_CAPABILITY_OVERRIDES` is dropped with `capabilities` (deferred).
- Accepted trade-off (re-plan): brief-delivery proof, hash-bound waivers, guard restore, lock, `check` strictness plus the D10 allowlist, and automatic safe-band lose tool enforcement and rely on skill instructions. Still tool-enforced: scene-builder PreToolUse hook, `gate` quotes, `patch apply` validation, `render` flags, `qc`.
