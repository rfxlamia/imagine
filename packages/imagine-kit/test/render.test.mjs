import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { sha256File } from "../src/hash.mjs";
import { cli, getProject, put } from "./helpers/fixture.mjs";
import { COMPOSITION, renderProject } from "./helpers/edit.mjs";
import { hasFfmpeg } from "./helpers/media.mjs";
import { renderPreflight } from "../src/edit/preflight.mjs";

const t = hasFfmpeg ? test : test.skip;
const renderCall = (p) => p.calls().filter((c) => c.argv.includes("render")).at(-1);

t("PROC-TELEMETRY-OFF: render --draft runs the pinned CLI with --fps 30 --no-best-effort and records render:draft", async () => {
  const p = await renderProject();
  const r = await p.render({}, "render", "--draft");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.deepEqual(Object.keys(r.env.data), ["path", "sha256"]);
  assert.equal(r.env.data.path, "review/keeper.draft.mp4");
  assert.equal(r.env.data.sha256, sha256File(join(p.dir, r.env.data.path)));
  const call = renderCall(p);
  assert.deepEqual(call.argv.slice(0, 5), ["--yes", "hyperframes@0.8.223", "render", "edit", "-o"]);
  for (const flag of ["--fps", "30", "--no-best-effort"]) assert.ok(call.argv.includes(flag), flag);
  assert.equal(call.argv[call.argv.indexOf("--quality") + 1], "draft");
  assert.equal(call.telemetry_off, "1");
  assert.equal(call.cwd.endsWith("2026-11-01-keeper") || call.cwd.includes("keeper"), true);
  const item = getProject(p.dir).items["render:draft"];
  assert.equal(item.kind, "render");
  assert.ok(item.inputs["file:edit/index.html"] && item.inputs["story:sha"]);
  assert.equal(item.inputs["edit:s01"], undefined, "no edit items yet");
  assert.equal((await p.render({}, "render", "--draft")).exit, 0, "a draft is overwritten, not versioned");
});

t("render --final needs G6, uses --quality delivery and writes immutable post/<slug>.v<N>.mp4", async () => {
  const p = await renderProject();
  const early = await p.render({}, "render", "--final");
  assert.equal(early.exit, 1);
  assert.equal(early.env.errors[0].item, "G6");
  assert.equal(p.calls().some((c) => c.argv.includes("render")), false);
  assert.equal((await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok")).exit, 0);
  const one = await p.render({}, "render", "--final");
  assert.equal(one.exit, 0, JSON.stringify(one.env.errors));
  assert.equal(one.env.data.path, "post/keeper.v1.mp4");
  const call = renderCall(p);
  assert.equal(call.argv[call.argv.indexOf("--quality") + 1], "delivery");
  assert.ok(call.argv.includes("--no-best-effort"));
  const two = await p.render({}, "render", "--final");
  assert.equal(two.env.data.path, "post/keeper.v2.mp4");
  assert.ok(existsSync(join(p.dir, "post/keeper.v1.mp4")));
  assert.ok(getProject(p.dir).items["render:keeper.v1"] && getProject(p.dir).items["render:keeper.v2"]);
});

t("render --final never reuses a version whose MP4 is gone: recorded render items still count", async () => {
  const p = await renderProject();
  await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok");
  assert.equal((await p.render({}, "render", "--final")).env.data.path, "post/keeper.v1.mp4");
  assert.equal((await p.render({}, "render", "--final")).env.data.path, "post/keeper.v2.mp4");
  const v2 = JSON.stringify(getProject(p.dir).items["render:keeper.v2"]);
  unlinkSync(join(p.dir, "post/keeper.v2.mp4"));
  const three = await p.render({}, "render", "--final");
  assert.equal(three.exit, 0, JSON.stringify(three.env.errors));
  assert.equal(three.env.data.path, "post/keeper.v3.mp4", "a deleted MP4 does not free its version");
  assert.equal(JSON.stringify(getProject(p.dir).items["render:keeper.v2"]), v2, "the v2 record is preserved, not overwritten");
  rmSync(join(p.dir, "post"), { recursive: true, force: true });
  const four = await p.render({}, "render", "--final");
  assert.equal(four.exit, 0, JSON.stringify(four.env.errors));
  assert.equal(four.env.data.path, "post/keeper.v4.mp4", "a missing post/ still counts the recorded items");
  copyFileSync(join(p.dir, "post/keeper.v4.mp4"), join(p.dir, "post/keeper.v7.mp4"));
  const eight = await p.render({}, "render", "--final");
  assert.equal(eight.exit, 0, JSON.stringify(eight.env.errors));
  assert.equal(eight.env.data.path, "post/keeper.v8.mp4", "the highest filename version counts too");
});

t("render --final re-checks asset hashes: a swapped asset or edit/assets copy stops the render", async () => {
  const p = await renderProject();
  await cli(p.cwd, "gate", "G6", "approve", "--quote", "ok");
  const copy = join(p.dir, "edit/assets/bg.v1.png");
  const original = (await import("node:fs")).readFileSync(copy);
  writeFileSync(copy, "swapped");
  const a = await p.render({}, "render", "--final");
  assert.equal(a.exit, 1);
  assert.match(a.env.errors.map((e) => e.message).join(" "), /edit\/assets\/bg\.v1\.png differs/);
  writeFileSync(copy, original);
  writeFileSync(join(p.dir, "assets/vo/L01.v1.wav"), "tampered");
  const b = await p.render({}, "render", "--final");
  assert.equal(b.exit, 1);
  assert.match(b.env.errors.map((e) => e.message).join(" "), /L01\.v1\.wav no longer matches/);
  assert.equal(p.calls().some((c) => c.argv.includes("render")), false, "the render tool never ran");
  assert.deepEqual(readdirSync(join(p.dir, "post")).filter((n) => n.endsWith(".mp4")), []);
});

t("preflight: scene host without class, motion file under compositions, extra root sidecar, placeholder, missing src", async () => {
  const p = await renderProject();
  const index = (await import("node:fs")).readFileSync(join(p.dir, "edit/index.html"), "utf8");
  put(p.dir, "edit/index.html", index.replace('class="scene" data-composition-id="s01"', 'data-composition-id="s01"'));
  assert.ok((await p.render({}, "render", "--draft")).env.errors.some((e) => e.rule === "HARD-SCENE-CLASS"));
  put(p.dir, "edit/index.html", index.replace("compositions/s02.html", "compositions/nope.html"));
  assert.ok((await p.render({}, "render", "--draft")).env.errors.some((e) => e.rule === "HARD-NO-PLACEHOLDER" && /does not exist/.test(e.message)));
  put(p.dir, "edit/index.html", `${index}<!-- TODO fix -->`);
  assert.ok((await p.render({}, "render", "--draft")).env.errors.some((e) => /placeholder/.test(e.message)));
  put(p.dir, "edit/index.html", index);
  put(p.dir, "edit/compositions/s01.motion.json", "{}");
  put(p.dir, "edit/other.motion.json", "{}");
  const r = await p.render({}, "render", "--draft");
  assert.equal(r.env.errors.filter((e) => e.rule === "HARD-ROOT-MOTION").length, 2);
  assert.equal(p.calls().some((c) => c.argv.includes("render")), false);
});

t("a failing render or a missing tool is BLOCKED and places no file", async () => {
  const p = await renderProject();
  const bad = await p.render({ FAKE_NPX_MODE: "render-fail" }, "render", "--draft");
  assert.equal(bad.exit, 3);
  assert.equal(bad.env.errors[0].rule, "HARD-NO-BEST-EFFORT");
  assert.deepEqual(readdirSync(join(p.dir, "review")).filter((n) => n.endsWith(".mp4")), []);
  const { cliWith } = await import("./helpers/fixture.mjs");
  assert.equal((await cliWith(p.cwd, { tools: { npx: ["/nonexistent/npx"] } }, "render", "--draft")).exit, 3);
  assert.equal((await p.render({}, "render")).exit, 2);
  assert.equal((await p.render({}, "render", "--draft", "--final")).exit, 2);
  unlinkSync(join(p.dir, "edit/hyperframes.json"));
  assert.equal((await p.render({}, "render", "--draft")).exit, 3);
});

t("the project lock is not held during a render; an edit afterwards makes render:draft stale (DAG-EDIT-RENDER)", async () => {
  const p = await renderProject();
  const slow = p.render({ FAKE_NPX_SLEEP_MS: "1500" }, "render", "--draft");
  await new Promise((r) => setTimeout(r, 500));
  const g = await cli(p.cwd, "gate", "G6", "approve", "--quote", "x");
  assert.notEqual(g.exit, 5);
  assert.equal((await slow).exit, 0);
  let s = await cli(p.cwd, "status");
  assert.equal(s.env.data.items.find((i) => i.id === "render:draft").status, "proposed");
  put(p.dir, "edit/compositions/s01.html", "<template>changed</template>");
  s = await cli(p.cwd, "status");
  assert.equal(s.env.data.items.find((i) => i.id === "render:draft").status, "stale");
});

t("changing composition during draft render is refused with CONFLICT, places no file and records no item", async () => {
  const p = await renderProject();
  const comp = join(p.dir, "edit/compositions/s01.html");
  const slow = p.render({ FAKE_NPX_SLEEP_MS: "1500" }, "render", "--draft");
  await new Promise((r) => setTimeout(r, 400));
  writeFileSync(comp, COMPOSITION("s01").replace("opacity:1", "opacity:0.5"));
  const r = await slow;
  assert.equal(r.exit, 4);
  assert.equal(r.env.code, "CONFLICT");
  assert.equal(existsSync(join(p.dir, "review/keeper.draft.mp4")), false);
  assert.equal(getProject(p.dir).items["render:draft"], undefined);
});

t("changing edit/assets/bg.v1.png during final render fails closed under commit lock and publishes no MP4", async () => {
  const p = await renderProject();
  await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok");
  const copy = join(p.dir, "edit/assets/bg.v1.png");
  const slow = p.render({ FAKE_NPX_SLEEP_MS: "1500" }, "render", "--final");
  await new Promise((r) => setTimeout(r, 400));
  writeFileSync(copy, "tampered-during-render");
  const r = await slow;
  assert.notEqual(r.exit, 0);
  assert.equal(existsSync(join(p.dir, "post/keeper.v1.mp4")), false);
  assert.equal(getProject(p.dir).items["render:keeper.v1"], undefined);
});

t("rejecting G6 during final render fails closed under commit lock and publishes no MP4", async () => {
  const p = await renderProject();
  await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok");
  const slow = p.render({ FAKE_NPX_SLEEP_MS: "1500" }, "render", "--final");
  await new Promise((r) => setTimeout(r, 400));
  const rej = await cli(p.cwd, "gate", "G6", "reject", "--quote", "not ready");
  assert.equal(rej.exit, 0);
  const r = await slow;
  assert.notEqual(r.exit, 0);
  assert.equal(existsSync(join(p.dir, "post/keeper.v1.mp4")), false);
  assert.equal(getProject(p.dir).items["render:keeper.v1"], undefined);
});

t("symlinking tmp/render, review, or post outside the project fails and writes no MP4 outside", async () => {
  const { rmSync } = await import("node:fs");
  // Case 4a: tmp/render symlink escape
  {
    const p = await renderProject();
    const outside = mkdtempSync(join(tmpdir(), "imagine-render-tmp-"));
    mkdirSync(join(p.dir, "tmp"), { recursive: true });
    rmSync(join(p.dir, "tmp/render"), { recursive: true, force: true });
    symlinkSync(outside, join(p.dir, "tmp/render"));
    const r = await p.render({}, "render", "--draft");
    assert.notEqual(r.exit, 0);
    assert.deepEqual(readdirSync(outside).filter((n) => n.endsWith(".mp4")), []);
    assert.equal(existsSync(join(p.dir, "review/keeper.draft.mp4")), false);
  }
  // Case 4b: review symlink escape
  {
    const p = await renderProject();
    const outside = mkdtempSync(join(tmpdir(), "imagine-render-review-"));
    rmSync(join(p.dir, "review"), { recursive: true, force: true });
    symlinkSync(outside, join(p.dir, "review"));
    const r = await p.render({}, "render", "--draft");
    assert.notEqual(r.exit, 0);
    assert.deepEqual(readdirSync(outside).filter((n) => n.endsWith(".mp4")), []);
  }
  // Case 4c: post symlink escape
  {
    const p = await renderProject();
    await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok");
    const outside = mkdtempSync(join(tmpdir(), "imagine-render-post-"));
    rmSync(join(p.dir, "post"), { recursive: true, force: true });
    symlinkSync(outside, join(p.dir, "post"));
    const r = await p.render({}, "render", "--final");
    assert.notEqual(r.exit, 0);
    assert.deepEqual(readdirSync(outside).filter((n) => n.endsWith(".mp4")), []);
  }
});

t("symlinking edit/ outside the project fails preflight and tool is not invoked", async () => {
  const p = await renderProject();
  const outside = mkdtempSync(join(tmpdir(), "imagine-render-edit-"));
  renameSync(join(p.dir, "edit"), join(outside, "edit"));
  symlinkSync(join(outside, "edit"), join(p.dir, "edit"));
  const r = await p.render({}, "render", "--draft");
  assert.notEqual(r.exit, 0);
  assert.equal(p.calls().some((c) => c.argv.includes("render")), false, "render tool must not be invoked");
  const pre = renderPreflight(p.dir);
  assert.ok(pre.some((e) => /outside the project/.test(e.message)));
});

t("data-composition-src traversal to an outside HTML file fails preflight", async () => {
  const p = await renderProject();
  const outside = mkdtempSync(join(tmpdir(), "imagine-outside-src-"));
  const outsideHtml = join(outside, "scene.html");
  writeFileSync(outsideHtml, COMPOSITION("s01"));
  const index = readFileSync(join(p.dir, "edit/index.html"), "utf8");
  const relTraversal = relative(join(p.dir, "edit"), outsideHtml);
  put(p.dir, "edit/index.html", index.replace('data-composition-src="compositions/s01.html"', `data-composition-src="${relTraversal}"`));
  const r = await p.render({}, "render", "--draft");
  assert.notEqual(r.exit, 0);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-NO-PLACEHOLDER" && /outside the project/.test(e.message)));
  assert.equal(p.calls().some((c) => c.argv.includes("render")), false, "render tool must not be invoked");
});

t("directory symlink cycle under edit/ is rejected by preflight without infinite recursion", async () => {
  const p = await renderProject();
  mkdirSync(join(p.dir, "edit/cycle-sub"), { recursive: true });
  symlinkSync(join(p.dir, "edit"), join(p.dir, "edit/cycle-sub/loop"));
  const pre = renderPreflight(p.dir);
  assert.ok(pre.some((e) => e.rule === "HARD-ROOT-MOTION" && /cycle|outside/.test(e.message)));
  const r = await p.render({}, "render", "--draft");
  assert.notEqual(r.exit, 0);
  assert.equal(p.calls().some((c) => c.argv.includes("render")), false, "render tool must not be invoked");
});

t("unique temp render output per invocation and cleanup on failure", async () => {
  const p = await renderProject();
  const r1Promise = p.render({ FAKE_NPX_SLEEP_MS: "600" }, "render", "--draft");
  const r2Promise = p.render({ FAKE_NPX_SLEEP_MS: "600" }, "render", "--draft");
  const [r1, r2] = await Promise.all([r1Promise, r2Promise]);
  const calls = p.calls().filter((c) => c.argv.includes("render"));
  const out1 = calls[calls.length - 2].argv[calls[calls.length - 2].argv.indexOf("-o") + 1];
  const out2 = calls[calls.length - 1].argv[calls[calls.length - 1].argv.indexOf("-o") + 1];
  assert.notEqual(out1, out2, "concurrent renders must not share temp output work path");
  if (existsSync(join(p.dir, "tmp/render"))) {
    const tmpFiles = readdirSync(join(p.dir, "tmp/render")).filter((n) => n.endsWith(".mp4"));
    assert.deepEqual(tmpFiles, [], "temp render files must be cleaned up");
  }
});

t("render --final inherits checkAssets: rejects replan tier even if forged to native, and rejects missing shot-declared assets", async () => {
  const p = await renderProject();
  await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok");

  // Replan raster with forged native tier fails render --final
  const { setManifest } = await import("./helpers/fixture.mjs");
  setManifest(p.dir, (m) => {
    Object.assign(m.assets.find((a) => a.id === "bg"), {
      w: 64,
      h: 64,
      required_px: { w: 2172, h: 1188 },
      tier: "native",
      q: 1.0,
    });
  });
  const r1 = await p.render({}, "render", "--final");
  assert.equal(r1.exit, 1);
  assert.ok(r1.env.errors.some((e) => e.rule === "HARD-RASTER-TIER" && e.item === "bg.v1"));

  // Missing required_px with forged native tier fails render --final
  setManifest(p.dir, (m) => {
    const bg = m.assets.find((a) => a.id === "bg");
    delete bg.required_px;
    bg.tier = "native";
    bg.q = 1.0;
  });
  const r2 = await p.render({}, "render", "--final");
  assert.equal(r2.exit, 1);
  assert.ok(r2.env.errors.some((e) => e.rule === "HARD-RASTER-TIER" && e.item === "bg.v1"));

  // Zero required_px with forged native tier fails render --final
  setManifest(p.dir, (m) => {
    const bg = m.assets.find((a) => a.id === "bg");
    bg.required_px = { w: 0, h: 0 };
    bg.tier = "native";
    bg.q = 1.0;
  });
  const r3 = await p.render({}, "render", "--final");
  assert.equal(r3.exit, 1);
  assert.ok(r3.env.errors.some((e) => e.rule === "HARD-RASTER-TIER" && e.item === "bg.v1"));
});

t("HARD-REAL-RASTER: render --final rejects forged manifest dimensions and malformed PNG bytes", async () => {
  // Case 1: forged manifest dimensions (64x64 file claimed as 1536x1024)
  {
    const p = await renderProject();
    await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok");
    const { setManifest } = await import("./helpers/fixture.mjs");
    setManifest(p.dir, (m) => {
      Object.assign(m.assets.find((a) => a.id === "bg"), {
        w: 1536,
        h: 1024,
        required_px: { w: 1536, h: 1024 },
        tier: "native",
        q: 1.0,
      });
    });
    const r = await p.render({}, "render", "--final");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-REAL-RASTER" && e.item === "bg.v1"));
    assert.match(r.env.errors.find((e) => e.rule === "HARD-REAL-RASTER").message, /64x64 but the manifest records 1536x1024/);
    const postFiles = existsSync(join(p.dir, "post")) ? readdirSync(join(p.dir, "post")) : [];
    assert.equal(postFiles.length, 0, "no MP4 published on forged dimensions");
  }

  // Case 2: malformed PNG bytes
  {
    const p = await renderProject();
    await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok");
    const { setManifest } = await import("./helpers/fixture.mjs");
    const bgPath = join(p.dir, "assets/img/bg.v1.png");
    writeFileSync(bgPath, Buffer.from("not a valid png file header at all"));
    const copyPath = join(p.dir, "edit/assets/bg.v1.png");
    if (existsSync(copyPath)) writeFileSync(copyPath, Buffer.from("not a valid png file header at all"));
    setManifest(p.dir, (m) => {
      const bg = m.assets.find((a) => a.id === "bg");
      bg.sha256 = sha256File(bgPath);
    });
    await cli(p.cwd, "gate", "G5b", "approve", "--scope", "asset:bg.v1", "--quote", "ok");
    const r = await p.render({}, "render", "--final");
    assert.equal(r.exit, 1);
    assert.ok(r.env.errors.some((e) => e.rule === "HARD-REAL-RASTER" && e.item === "bg.v1"));
    assert.match(r.env.errors.find((e) => e.rule === "HARD-REAL-RASTER").message, /cannot be parsed as PNG/);
    const postFiles = existsSync(join(p.dir, "post")) ? readdirSync(join(p.dir, "post")) : [];
    assert.equal(postFiles.length, 0, "no MP4 published on malformed PNG");
  }
});
