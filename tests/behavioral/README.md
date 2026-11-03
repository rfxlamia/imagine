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

   This writes `red/imagine.chatgpt.md` with a header (model, date, prompt hash) and refuses to write if the answer names a forbidden research reference.

5. Run the repo check before committing:

   ```bash
   node tools/check-forbidden-names.mjs
   ```

Model slugs used in file names: `chatgpt`, `gemini`. A scenario may be run on one model or both. GREEN for a scenario reuses exactly the slug and model label of its RED run, so the two are comparable.

The saved header records the first 12 hex characters of the prompt's sha256. GREEN must show the same hash as RED; a different hash means the prompt changed and RED must be re-run.

## GREEN runs (WP7)

1. Build the upload once per instruction revision:

   ```bash
   node tests/behavioral/run.mjs pack
   ```

   This writes `imagine-green.zip` and `imagine-green.md` (one file with `===== FILE: <path> =====` markers) to `$TMPDIR/imagine-green/`, or to the directory given as an argument. Only tracked files under `skills/`, `agents/` and `.claude-plugin/plugin.json` are packed, so the gitignored placeholders never ship. Scenarios are not packed: their targets and pass criteria would leak the grading. Packing refuses if any file names a forbidden research reference.
2. Open a temporary chat on the same model as the scenario's RED run, attach the upload (the `.md` bundle when the chat cannot read a zip), and paste the prompt from `run.mjs prompt <name>` as the only message.
3. Save the answer with `save green`. It refuses when `red/<name>.<slug>.md` is missing or its prompt hash differs from the current prompt, and warns when the model label differs from RED.
4. Grade it. `node tests/behavioral/run.mjs compare <name> <slug>` prints the targets, pass criteria, the RED grade and the GREEN answer side by side; add a `## Grade` table to the GREEN file in the same format as RED.
5. On a failed rule, fix the instruction file, re-pack, and re-run that scenario only.

## Rules for prompts and pasted answers

- Never include the image-bridge reference skill, or any image model name, in a prompt or an upload.
- Every saved answer must pass `node tools/check-forbidden-names.mjs`.
- Rule IDs in this folder count as test coverage for `check-traceability` (decision D7 in WP1). A RED run proves the gap, not the fix; GREEN results are the evidence that matters.
