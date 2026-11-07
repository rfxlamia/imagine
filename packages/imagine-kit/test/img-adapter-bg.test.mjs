import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compilePrompt, compileSheetPrompt, generate, generationInfo } from "../src/img/adapter.mjs";
import { FAKE_CODEX } from "./helpers/img.mjs";

const members = [{ prompt: "stands", framing: "full body" }, { prompt: "sits", framing: "full body" }, { prompt: "runs", framing: "full body" }];
const base = { members, refs: ["r1"], size: "1200x1200", cols: 2, rows: 2 };

// Golden literals captured from main before any edit (git HEAD of src/img/adapter.mjs). They must never be regenerated from the new code.
const LEGACY_SHEET = "PROMPT: Pose sheet of one character: 3 separate poses of the same character in one image, laid out as a grid of 2 columns and 2 rows of equal cells, read left to right, top to bottom.\nCELL 1: stands | FRAMING: full body\nCELL 2: sits | FRAMING: full body\nCELL 3: runs | FRAMING: full body\nCELL 4: leave this cell empty background.\nLAYOUT: each figure sits fully inside its own cell, centred, with a wide empty margin; no figure crosses or touches a cell edge; no grid lines, borders, labels, numbers or text; one plain flat solid light background across the whole image; no ground, no shadows, no scenery.\nSIZE: 1200x1200\nREFERENCE: the attached images are approved references; keep the same identity, palette and proportions (r1).\nYou MUST call the image_generation tool to produce this image.\nDo NOT write a script, draw with code or fabricate a PNG by any other means.\nSave the generated image as out.png in the current working directory.";
const LEGACY_SINGLE_REFS = "PROMPT: p\nFRAMING: f\nSIZE: 10x10\nREFERENCE: the attached images are approved references; keep the same identity, palette and proportions (r1).\nYou MUST call the image_generation tool to produce this image.\nDo NOT write a script, draw with code or fabricate a PNG by any other means.\nSave the generated image as out.png in the current working directory.";
const LEGACY_SINGLE_NONE = "PROMPT: p\nFRAMING: f\nSIZE: 10x10\nREFERENCE: none.\nYou MUST call the image_generation tool to produce this image.\nDo NOT write a script, draw with code or fabricate a PNG by any other means.\nSave the generated image as out.png in the current working directory.";

test("legacy sheet and single prompts equal the captured main output, with background absent or opaque", () => {
  assert.equal(compileSheetPrompt(base), LEGACY_SHEET);
  assert.equal(compileSheetPrompt({ ...base, background: "opaque" }), LEGACY_SHEET);
  assert.equal(compileSheetPrompt({ ...base, background: "legacy" }), LEGACY_SHEET);
  assert.equal(compilePrompt({ prompt: "p", framing: "f", size: "10x10", refs: ["r1"] }), LEGACY_SINGLE_REFS);
  assert.equal(compilePrompt({ prompt: "p", framing: "f", size: "10x10", refs: [], background: "opaque" }), LEGACY_SINGLE_NONE);
});

test("transparent sheet prompt demands the flag outright and drops the flat backdrop", () => {
  const s = compileSheetPrompt({ ...base, background: "transparent" });
  assert.match(s, /transparent_background set to true/);
  assert.match(s, /CELL 4: leave this cell empty and fully transparent\./);
  assert.match(s, /identity references only/);
  assert.match(s, /checkerboard/);
  assert.doesNotMatch(s, /solid light background/);
  assert.doesNotMatch(s, /if (real )?alpha is unavailable|if unavailable/i);
});

test("transparent single prompt carries the same requirements", () => {
  const s = compilePrompt({ prompt: "p", framing: "f", size: "10x10", refs: ["r1"], background: "transparent" });
  assert.match(s, /transparent_background set to true/);
  assert.match(s, /identity references only/);
});

// --- bound generation info -------------------------------------------------
function rig() {
  const home = mkdtempSync(join(tmpdir(), "codex-home-"));
  const sid = "01a17000-0000-4000-8000-000000000001";
  const out = join(home, "out.png");
  writeFileSync(out, "AAAA-image-bytes");
  mkdirSync(join(home, "generated_images", sid), { recursive: true });
  const saved = (name, bytes) => { const p = join(home, "generated_images", sid, name); writeFileSync(p, bytes); return p; };
  const log = (items) => {
    const d = join(home, "sessions", "2026", "11", "01");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, `rollout-2026-11-01T10-00-00-${sid}.jsonl`),
      items.map((item) => JSON.stringify({ type: "event_msg", payload: { item: { kind: "image_gen.generation", ...item } } })).join("\n") + "\n");
  };
  return { ctx: { env: { CODEX_HOME: home } }, stdout: `session id: ${sid}\n`, out, saved, log, home };
}

test("generationInfo returns the item whose saved file matches out.png, not the last item", () => {
  const r = rig();
  const a = r.saved("a.png", "AAAA-image-bytes");
  const b = r.saved("b.png", "OTHER");
  r.log([{ revisedPrompt: "MINE", transparentBackground: true, savedPath: a }, { revisedPrompt: "DECOY", transparentBackground: false, savedPath: b }]);
  assert.deepEqual(generationInfo(r.ctx, r.stdout, r.out), { revisedPrompt: "MINE", transparentBackground: true });
});

test("generationInfo returns nulls when nothing matches or no outPath is given", () => {
  const r = rig();
  r.log([{ revisedPrompt: "X", transparentBackground: true, savedPath: r.saved("b.png", "OTHER") }]);
  assert.deepEqual(generationInfo(r.ctx, r.stdout, r.out), { revisedPrompt: null, transparentBackground: null });
  assert.deepEqual(generationInfo(r.ctx, r.stdout, undefined), { revisedPrompt: null, transparentBackground: null });
});

test("generationInfo ignores a savedPath outside generated_images and symlink escapes", () => {
  const r = rig();
  const outside = join(mkdtempSync(join(tmpdir(), "outside-")), "x.png");
  writeFileSync(outside, "AAAA-image-bytes");
  const link = join(r.home, "generated_images", "01a17000-0000-4000-8000-000000000001", "link.png");
  symlinkSync(outside, link);
  r.log([{ revisedPrompt: "OUT", transparentBackground: true, savedPath: outside }, { revisedPrompt: "LINK", transparentBackground: true, savedPath: link }]);
  assert.deepEqual(generationInfo(r.ctx, r.stdout, r.out), { revisedPrompt: null, transparentBackground: null });
});

test("generate() returns trace with session id while stdout does not", async () => {
  const home = mkdtempSync(join(tmpdir(), "codex-home-"));
  const workDir = mkdtempSync(join(tmpdir(), "codex-work-"));
  const ctx = {
    tools: { codex: [process.execPath, FAKE_CODEX] },
    env: { ...process.env, CODEX_HOME: home },
  };
  const r = await generate(ctx, { workDir, text: "PROMPT: test\nFRAMING: full\nSIZE: 100x100", refPaths: [] });
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.stdout, /session id:/i);
  assert.match(r.trace, /session id:/i);
});
