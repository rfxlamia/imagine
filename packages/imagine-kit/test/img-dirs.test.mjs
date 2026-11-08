import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cli, getManifest, setManifest } from "./helpers/fixture.mjs";
import { imgProject, sheetProject } from "./helpers/img.mjs";
import { makePng } from "./helpers/media.mjs";
import { sha256File } from "../src/hash.mjs";
import * as planMod from "../src/img/plan.mjs";

test("imgDir helper returns refs, img/figure, or img/world according to intent", () => {
  const imgDir = planMod.imgDir;
  assert.equal(typeof imgDir, "function", "imgDir must be exported from src/img/plan.mjs");
  assert.equal(imgDir("ref", "opaque"), "refs");
  assert.equal(imgDir("ref", "transparent"), "refs");
  assert.equal(imgDir("ref", "legacy"), "refs");
  assert.equal(imgDir("img", "transparent"), "img/figure");
  assert.equal(imgDir("img", "legacy"), "img/figure");
  assert.equal(imgDir("img", "opaque"), "img/world");
});

test("a single background: transparent img (not in a sheet) commits under assets/img/figure/ and the manifest path matches", async () => {
  const plan = {
    assets: [
      { id: "cutout", kind: "img", background: "transparent", prompt: "A robot cutout", framing: "full body", size: "1200x1200", required_px: { w: 1000, h: 1000 } },
    ],
  };
  const p = await imgProject(plan);
  const res = await p.run({ FAKE_CODEX_MODES: "native", FAKE_CODEX_SIZE: "1200x1200" }, "img", "--batch", "cutout");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  const entry = getManifest(p.dir).assets.find((a) => a.id === "cutout");
  assert.ok(entry, "cutout asset entry must exist in manifest");
  assert.equal(entry.path, "assets/img/figure/cutout.v1.png");
  assert.equal(existsSync(join(p.dir, "assets/img/figure/cutout.v1.png")), true);
  assert.equal(existsSync(join(p.dir, entry.path)), true);
});

test("a single non-transparent img (no background) commits under assets/img/world/", async () => {
  const plan = {
    assets: [
      { id: "scenery", kind: "img", prompt: "A stormy sea", framing: "wide", size: "1536x1024", required_px: { w: 1536, h: 1024 } },
    ],
  };
  const p = await imgProject(plan);
  const res = await p.run({}, "img", "--batch", "scenery");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  const entry = getManifest(p.dir).assets.find((a) => a.id === "scenery");
  assert.ok(entry, "scenery asset entry must exist in manifest");
  assert.equal(entry.path, "assets/img/world/scenery.v1.png");
  assert.equal(existsSync(join(p.dir, "assets/img/world/scenery.v1.png")), true);
  assert.equal(existsSync(join(p.dir, entry.path)), true);
});

test("a sheet member with background: transparent and a legacy sheet member (no background) both commit under assets/img/figure/", async () => {
  const plan = {
    assets: [
      { id: "hero-ref", kind: "ref", prompt: "Hero reference", framing: "full body", size: "600x600" },
      { id: "hero-t1", kind: "img", sheet: "sheet-trans", background: "transparent", prompt: "Hero pose 1", framing: "full body", size: "600x600", refs: ["hero-ref"], required_px: { w: 500, h: 500 } },
      { id: "hero-t2", kind: "img", sheet: "sheet-trans", background: "transparent", prompt: "Hero pose 2", framing: "full body", size: "600x600", refs: ["hero-ref"], required_px: { w: 500, h: 500 } },
      { id: "hero-l1", kind: "img", sheet: "sheet-leg", prompt: "Hero pose 3", framing: "full body", size: "600x600", refs: ["hero-ref"], required_px: { w: 500, h: 500 } },
      { id: "hero-l2", kind: "img", sheet: "sheet-leg", prompt: "Hero pose 4", framing: "full body", size: "600x600", refs: ["hero-ref"], required_px: { w: 500, h: 500 } },
    ],
  };
  const p = await sheetProject(plan);
  const refRes = await p.run({}, "img", "--ref", "hero-ref");
  assert.equal(refRes.exit, 0, JSON.stringify(refRes.env.errors));
  const gateRes = await cli(p.cwd, "gate", "G5r", "approve", "--quote", "refs ok");
  assert.equal(gateRes.exit, 0, JSON.stringify(gateRes.env.errors));

  const transRes = await p.run({ FAKE_CODEX_MODES: "native", FAKE_CODEX_SIZE: "1200x600" }, "img", "--batch", "hero-t1,hero-t2");
  assert.equal(transRes.exit, 0, JSON.stringify(transRes.env.errors));

  const legRes = await p.run({}, "img", "--batch", "hero-l1,hero-l2");
  assert.equal(legRes.exit, 0, JSON.stringify(legRes.env.errors));

  const manifest = getManifest(p.dir);
  const t1 = manifest.assets.find((a) => a.id === "hero-t1");
  const t2 = manifest.assets.find((a) => a.id === "hero-t2");
  const l1 = manifest.assets.find((a) => a.id === "hero-l1");
  const l2 = manifest.assets.find((a) => a.id === "hero-l2");

  assert.equal(t1.path, "assets/img/figure/hero-t1.v1.png");
  assert.equal(t2.path, "assets/img/figure/hero-t2.v1.png");
  assert.equal(l1.path, "assets/img/figure/hero-l1.v1.png");
  assert.equal(l2.path, "assets/img/figure/hero-l2.v1.png");

  assert.equal(existsSync(join(p.dir, "assets/img/figure/hero-t1.v1.png")), true);
  assert.equal(existsSync(join(p.dir, "assets/img/figure/hero-t2.v1.png")), true);
  assert.equal(existsSync(join(p.dir, "assets/img/figure/hero-l1.v1.png")), true);
  assert.equal(existsSync(join(p.dir, "assets/img/figure/hero-l2.v1.png")), true);
});

test("a ref still commits under assets/refs/", async () => {
  const plan = {
    assets: [
      { id: "hero-ref", kind: "ref", prompt: "Hero reference", framing: "full body", size: "600x600" },
    ],
  };
  const p = await imgProject(plan);
  const res = await p.run({}, "img", "--ref", "hero-ref");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));
  const entry = getManifest(p.dir).assets.find((a) => a.id === "hero-ref");
  assert.ok(entry);
  assert.equal(entry.path, "assets/refs/hero-ref.v1.png");
  assert.equal(existsSync(join(p.dir, "assets/refs/hero-ref.v1.png")), true);
  assert.equal(existsSync(join(p.dir, entry.path)), true);
});

test("backward compat: a manifest that already holds kuli.v1 with path assets/img/kuli.v1.png plus its file; --redo writes kuli.v2 under the new directory, the v1 file is untouched at its old path and the v1 manifest entry's path is unchanged", async () => {
  const plan = {
    assets: [
      { id: "kuli", kind: "img", prompt: "Kuli working at desk", framing: "wide", size: "1536x1024", required_px: { w: 1536, h: 1024 } },
    ],
  };
  const p = await imgProject(plan);

  const oldRel = "assets/img/kuli.v1.png";
  const oldPath = join(p.dir, oldRel);
  makePng(oldPath, 1536, 1024, () => 42);
  const oldContent = readFileSync(oldPath);
  const oldSha = sha256File(oldPath);

  setManifest(p.dir, (m) => {
    m.assets.push({
      id: "kuli",
      kind: "img",
      v: 1,
      path: oldRel,
      status: "approved",
      prompt: "Kuli working at desk",
      w: 1536,
      h: 1024,
      required_px: { w: 1536, h: 1024 },
      q: 1,
      tier: "native",
      sha256: oldSha,
    });
  });

  const res = await p.run({}, "img", "--batch", "kuli", "--redo", "kuli", "--note", "redo kuli");
  assert.equal(res.exit, 0, JSON.stringify(res.env.errors));

  // v1 file is untouched at its old path
  assert.equal(existsSync(oldPath), true);
  assert.deepEqual(readFileSync(oldPath), oldContent);

  const manifest = getManifest(p.dir);
  const v1 = manifest.assets.find((a) => a.id === "kuli" && a.v === 1);
  const v2 = manifest.assets.find((a) => a.id === "kuli" && a.v === 2);

  assert.ok(v1, "v1 manifest entry must exist");
  assert.ok(v2, "v2 manifest entry must exist");

  // v1 manifest entry's path is unchanged
  assert.equal(v1.path, "assets/img/kuli.v1.png");

  // v2 writes under the new directory (opaque -> assets/img/world/)
  assert.equal(v2.path, "assets/img/world/kuli.v2.png");
  assert.equal(existsSync(join(p.dir, "assets/img/world/kuli.v2.png")), true);
});
