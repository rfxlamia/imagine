import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findViolations, loadPatterns } from "./check-forbidden-names.mjs";

const patterns = loadPatterns();
// Decoded at runtime so this file never contains the name itself.
const firstLine = readFileSync(new URL("./forbidden-names.b64", import.meta.url), "utf8").split("\n")[0];
const word = Buffer.from(firstLine, "base64").toString("utf8");

test("patterns decode", () => assert.equal(patterns.length, 2));
test("flags a file containing a pattern, case-insensitive", () => {
  const files = [{ path: "skills/x/SKILL.md", text: `line one\nuse ${word.toUpperCase()} here\n` }];
  assert.deepEqual(findViolations(files, patterns), [{ path: "skills/x/SKILL.md", line: 2 }]);
});
test("clean file passes", () => {
  assert.deepEqual(findViolations([{ path: "a.md", text: "codex image adapter" }], patterns), []);
});
