import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMANDS } from "../src/commands/index.mjs";

test("the registry holds the Phase 1 commands and the quality-gate commands", () => {
  assert.deepEqual(Object.keys(COMMANDS).sort(),
    ["checkpoint", "consent record", "export-hf", "gate", "img", "migrate", "new", "patch apply", "promote-shot", "publish", "purge", "qc", "render", "repair", "report", "stage-shot", "status", "tts", "validate story"]);
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    assert.equal(typeof cmd.run, "function", name);
    assert.equal(typeof cmd.options, "object", name);
  }
});
