# Behavioural scenarios (WP5 RED, WP7 GREEN)

One scenario file per skill or subagent lives in `scenarios/<name>.md`. Each file has three parts:

- **Targets**: the rule IDs (from `docs/contracts/rules.yaml`) the scenario probes. Not sent.
- **Prompt**: the fenced block under `## Prompt`. This is the only text sent to the web chat, verbatim.
- **Pass criteria**: one observable line per target rule, used to grade answers. Not sent.

RED (WP5) sends the prompt with no Imagine files loaded, to record what a model does without the instructions. GREEN (WP7) sends the identical prompt with `skills/`, `agents/` and the plugin manifest uploaded. Never edit a prompt between RED and GREEN; if a prompt must change, re-run RED for it.

Web chat cannot run tools. These runs test instruction comprehension only; real behaviour is proven in the WP8 vertical slice.

## Running one scenario

1. Open a **temporary chat** (ChatGPT: Temporary Chat; Gemini: memory/saved info off, new chat). Earlier Imagine conversations must not leak in.
2. Copy the prompt:

   ```bash
   node tests/behavioral/run.mjs prompt imagine | pbcopy
   ```

3. Paste it as the first and only message. Do not add anything, do not follow up.
4. Copy the whole answer, then save it (the model label is what the chat UI shows):

   ```bash
   pbpaste | node tests/behavioral/run.mjs save red imagine chatgpt "<model label>"
   ```

   This writes `red/imagine.chatgpt.md` with a header (model, date, round, prompt hash) and refuses to write if the answer names a forbidden research reference. A re-run never overwrites the previous round: it is kept as `red/imagine.chatgpt.r<N>.md`.

5. Run the repo check before committing:

   ```bash
   node tools/check-forbidden-names.mjs
   ```

Model slugs used in file names: `chatgpt`, `gemini`. A scenario may be run on one model or both. GREEN for a scenario reuses exactly the slug and model label of its RED run, so the two are comparable.

The saved header records the first 12 hex characters of the prompt's sha256. GREEN must show the same hash as RED; a different hash means the prompt changed and RED must be re-run. A GREEN header also records the sha256 of the instruction bundle that was attached and the commit that carries the result: the prompt hash says the question did not change, the bundle hash says which instructions were tested.

## GREEN runs (WP7)

1. Build the upload for the scenario after every instruction change:

   ```bash
   node tests/behavioral/run.mjs pack --for imagine ~/Desktop/imagine-green
   ```

   This writes `imagine-green-<name>.zip` and `imagine-green-<name>.md` (one file with `===== FILE: <path> =====` markers) to the given directory, or to `$TMPDIR/imagine-green/`. `--for <name>` packs only that skill's folder or that agent's file plus `.claude-plugin/plugin.json`, which is what Claude Code loads for it; without `--for` the whole plugin is packed. Use the per-scenario pack: a full bundle (about 115k tokens) is only searched on demand by ChatGPT, so instructions it does not look up are missed (seen in the first two `imagine` GREEN rounds). Only tracked files are packed, so the gitignored placeholders never ship. Scenarios are not packed: their targets and pass criteria would leak the grading. Packing refuses if any file names a forbidden research reference. The pack prints the bundle sha256; `save green` records the same value in the result header.
2. Open a temporary chat on the same model as the scenario's RED run, attach `imagine-green-<name>.md`, and paste the output of `run.mjs prompt <name> --green` as the only message. `--green` puts one fixed sentence before the prompt asking the model to read the attachment in full; the scenario prompt itself is unchanged, so the RED hash still applies.
3. Save the answer with `save green`. It refuses when `red/<name>.<slug>.md` is missing or its prompt hash differs from the current prompt, and warns when the model label differs from RED. The header records the round, the prompt hash, the bundle sha256 and the tested commit, so a result can be tied to the instructions it was tested against.
4. Grade it. `node tests/behavioral/run.mjs compare <name> <slug>` prints the targets, pass criteria, the RED grade and the GREEN answer side by side; add a `## Grade` table to the GREEN file in the same format as RED.
5. Check the answer before grading it: `node tests/behavioral/run.mjs check <name> <slug>` parses the yaml in the answer and verifies the patch keys the scenario declares under `## Required patch keys`. A patch that does not parse, or that omits a required key, is not an applicable patch and must not be graded as a pass.
6. On a failed rule, fix the instruction file, re-pack, and re-run that scenario only.

## Rules for prompts and pasted answers

- Never include the image-bridge reference skill, or any image model name, in a prompt or an upload.
- Every saved answer must pass `node tools/check-forbidden-names.mjs`.
- Rule IDs in this folder count as test coverage for `check-traceability` (decision D7 in WP1). A RED run proves the gap, not the fix; GREEN results are the evidence that matters.
