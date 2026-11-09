import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMANDS } from "../src/commands/index.mjs";

test("the registry holds the thirteen Phase 1 commands", () => {
  assert.deepEqual(Object.keys(COMMANDS).sort(),
    ["export-hf", "gate", "img", "new", "patch apply", "promote-shot", "purge", "qc", "render", "stage-shot", "status", "tts", "validate story"]);
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    assert.equal(typeof cmd.run, "function", name);
    assert.equal(typeof cmd.options, "object", name);
  }
});
