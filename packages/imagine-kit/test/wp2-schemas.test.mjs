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

test("plan schema requires required_px on img and rejects non-positive dimensions, while ref may omit it", () => {
  const v = loadValidator("plan");
  // ref may omit required_px
  const p0 = plan();
  delete p0.assets[0].required_px;
  assert.equal(v(p0).valid, true, "ref may omit required_px");

  // ref may also have valid required_px
  p0.assets[0].required_px = { w: 1024, h: 1536 };
  assert.equal(v(p0).valid, true, "ref with valid required_px is valid");

  // img without required_px is rejected
  const p1 = plan();
  delete p1.assets[1].required_px;
  assert.equal(v(p1).valid, false, "img without required_px must be rejected");

  // img with zero w is rejected
  const p2 = plan();
  p2.assets[1].required_px = { w: 0, h: 1080 };
  assert.equal(v(p2).valid, false, "img with zero w must be rejected");

  // img with negative h is rejected
  const p3 = plan();
  p3.assets[1].required_px = { w: 1920, h: -5 };
  assert.equal(v(p3).valid, false, "img with negative h must be rejected");

  // ref with zero w is rejected if required_px is present
  const p4 = plan();
  p4.assets[0].required_px = { w: 0, h: 1536 };
  assert.equal(v(p4).valid, false, "ref with zero w must be rejected");
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
