import { test } from "node:test";
import assert from "node:assert/strict";
import { loadValidator } from "../src/schemas.mjs";

const plan = () => ({ assets: [
  { id: "mara-sheet", kind: "ref", prompt: "Reference sheet of Mara", framing: "full body, front view", size: "1024x1536" },
  { id: "s01-plate", kind: "img", prompt: "Lighthouse at dusk", framing: "wide establishing shot", size: "1536x1024", refs: ["mara-sheet"],
    required_px: { w: 1920, h: 1080 } },
] });

test("plan schema accepts the documented shape", () => {
  const r = loadValidator("plan")(plan());
  assert.equal(r.valid, true, r.errors.join("; "));
});

test("plan schema rejects missing framing, bad size, bad id and unknown keys", () => {
  const v = loadValidator("plan");
  for (const mutate of [
    (p) => { delete p.assets[0].framing; },
    (p) => { p.assets[0].framing = "  "; },
    (p) => { p.assets[0].size = "1024*1536"; },
    (p) => { p.assets[0].id = "../etc"; },
    (p) => { p.assets[0].extra = 1; },
    (p) => { p.assets[1].required_px = { w: 0, h: 10 }; },
    (p) => { p.assets[0].kind = "vo"; },
  ]) {
    const p = plan();
    mutate(p);
    assert.equal(v(p).valid, false, JSON.stringify(p.assets[0]));
  }
});

test("plan schema rejects dotted id and dotted refs[]", () => {
  const v = loadValidator("plan");
  const p1 = plan();
  p1.assets[0].id = "mara.sheet";
  assert.equal(v(p1).valid, false, "dotted id must be rejected");

  const p2 = plan();
  p2.assets[1].refs = ["mara.sheet"];
  assert.equal(v(p2).valid, false, "dotted refs[] must be rejected");
});
