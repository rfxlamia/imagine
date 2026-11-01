import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.mjs";
import { cli, getProject, makeProject, setManifest, asset } from "./helpers/fixture.mjs";
import { renderProject } from "./helpers/edit.mjs";
import { hasFfmpeg, makeMp4, makePng } from "./helpers/media.mjs";

const t = hasFfmpeg ? test : test.skip;
const rules = (r) => r.env.errors.map((e) => e.rule);
const PHASE0 = process.env.IMAGINE_PHASE0_MP4 ?? join(dirname(fileURLToPath(import.meta.url)), "../../../spikes/phase0/s4/out/portrait.mp4");

t("qc reports spec, loudness and raster data and writes review/qc.json", async () => {
  const p = await renderProject();
  const r = await cli(p.cwd, "qc", p.mp4);
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.deepEqual(Object.keys(r.env.data), ["w", "h", "fps", "duration_s", "audio", "lufs", "true_peak", "raster", "credits"]);
  assert.deepEqual([r.env.data.w, r.env.data.h, r.env.data.fps], [1080, 1920, 30]);
  assert.ok(Math.abs(r.env.data.duration_s - 13) < 0.1);
  assert.equal(r.env.data.audio.codec, "aac");
  assert.ok(Math.abs(r.env.data.lufs + 16) < 1, `lufs ${r.env.data.lufs}`);
  assert.ok(r.env.data.true_peak <= -1);
  assert.deepEqual(r.env.data.credits, { ok: true, items: [{ id: "bed", v: 1, kind: "music", license: "CC-BY-4.0", source: "https://example.org/bed", credit: "Bed by Example" }] });
  const saved = JSON.parse(readFileSync(join(p.dir, "review/qc.json"), "utf8"));
  assert.equal(saved.w, 1080);
  assert.deepEqual(saved.errors, []);
  assert.equal(getProject(p.dir).items["render:draft"], undefined, "qc records no item");
});

t("qc accepts a path relative to the project too and needs exactly one file", async () => {
  const p = await renderProject();
  assert.equal((await cli(p.cwd, "qc")).exit, 2);
  assert.equal((await cli(p.cwd, "qc", join(p.dir, "missing.mp4"))).exit, 2);
  const rendered = await p.render({}, "render", "--draft");
  const rel = await cli(p.cwd, "qc", rendered.env.data.path);
  assert.equal(rel.exit, 0, JSON.stringify(rel.env.errors));
  assert.equal(JSON.parse(readFileSync(join(p.dir, "review/qc.json"), "utf8")).file, "review/keeper.draft.mp4");
});

t("qc fails loudness (-21.8 LUFS), size, fps, duration and a missing audio stream", async () => {
  const p = await makeProject();
  const quiet = makeMp4(join(p.cwd, "quiet.mp4"), { volume: 1.0 });
  const r = await cli(p.cwd, "qc", quiet);
  assert.equal(r.exit, 1);
  assert.deepEqual(rules(r), ["HARD-LOUDNESS"]);
  assert.ok(Math.abs(r.env.data.lufs + 21.8) < 0.3, `lufs ${r.env.data.lufs}`);
  assert.match(r.env.errors[0].message, /change the mix gain by \+(5\.[5-9]|6\.[01]) dB/);
  assert.ok(existsSync(join(p.dir, "review/qc.json")), "safe review/qc.json is written even when QC finds HARD errors");
  const wrong = makeMp4(join(p.cwd, "wrong.mp4"), { w: 1920, h: 1080, fps: 25, seconds: 6, audio: false });
  const w = await cli(p.cwd, "qc", wrong);
  assert.equal(w.exit, 1);
  assert.deepEqual([...new Set(rules(w))].sort(), ["HARD-AUDIO-STREAM", "HARD-DURATION", "HARD-FPS-SIZE"]);
  assert.equal(w.env.data.lufs, null);
  assert.equal(w.env.data.audio, null);
});

t("qc skips loudness for intentional silence but still needs an audio stream", async () => {
  const p = await makeProject({ mode: "text-led", extra: ["--silence", "intentional"] });
  const silent = makeMp4(join(p.cwd, "silent.mp4"), { silent: true });
  const ok = await cli(p.cwd, "qc", silent);
  assert.equal(ok.exit, 0, JSON.stringify(ok.env.errors));
  assert.equal(ok.env.data.lufs, null);
  assert.ok(ok.env.advice.some((a) => a.rule === "HARD-LOUDNESS"));
  const none = makeMp4(join(p.cwd, "none.mp4"), { audio: false });
  assert.deepEqual(rules(await cli(p.cwd, "qc", none)), ["HARD-AUDIO-STREAM"]);
});

t("AC-07: qc reproduces the proposal section 7.2 worked examples", async () => {
  const p = await makeProject();
  const mp4 = makeMp4(join(p.cwd, "ok.mp4"));
  const cases = [
    ["a", 1536, 1024, 2172, 1188, 0.71, "replan"],
    ["b", 1536, 1024, 1997, 1123, 0.77, "soft"],
    ["c", 1024, 1536, 1080, 1920, 0.8, "soft"],
    ["d", 1672, 941, 1920, 1080, 0.87, "soft"],
    ["e", 2000, 2000, 1920, 1080, 1.04, "native"],
  ];
  for (const [id, w, h] of cases) {
    makePng(join(p.dir, `assets/img/${id}.v1.bin`), w, h, () => 0);
  }
  setManifest(p.dir, (m) => {
    for (const [id, w, h, rw, rh] of cases) m.assets.push(asset(id, "img", 1, { w, h, required_px: { w: rw, h: rh }, q: 9, tier: "native" }));
  });
  const r = await cli(p.cwd, "qc", mp4);
  assert.equal(r.exit, 1);
  const byId = Object.fromEntries(r.env.data.raster.assets.map((a) => [a.id, a]));
  for (const [id, , , , , q, tier] of cases) assert.deepEqual([byId[id].q, byId[id].tier], [q, tier], id);
  assert.deepEqual(rules(r).sort(), ["HARD-RASTER-TIER", "HARD-RASTER-TIER", "HARD-RASTER-TIER", "HARD-RASTER-TIER"], "replan plus three unaccepted soft rasters");
  assert.deepEqual(r.env.data.raster.below_native, ["a.v1", "b.v1", "c.v1", "d.v1"]);
  assert.equal(r.env.data.raster.native, false);
  assert.ok(r.env.advice.some((a) => a.rule === "HARD-NO-NATIVE-CLAIM"));
});

t("qc compares unrounded q: 0.7496 is replan even though it rounds to 0.75", async () => {
  const p = await makeProject();
  const mp4 = makeMp4(join(p.cwd, "ok.mp4"));
  makePng(join(p.dir, "assets/img/edge.v1.bin"), 7496, 10000, () => 0);
  setManifest(p.dir, (m) => { m.assets.push(asset("edge", "img", 1, { w: 7496, h: 10000, required_px: { w: 10000, h: 10000 } })); });
  const r = await cli(p.cwd, "qc", mp4);
  assert.equal(r.env.data.raster.assets[0].tier, "replan");
  assert.equal(r.env.data.raster.assets[0].q, 0.75);
});

t("qc accepts a soft raster that was approved at G5b and reports the worst q per shot", async () => {
  const p = await renderProject();
  setManifest(p.dir, (m) => { m.assets.find((a) => a.id === "bg").required_px = { w: 80, h: 64 }; });
  const r = await cli(p.cwd, "qc", p.mp4);
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  const bg = r.env.data.raster.assets.find((a) => a.id === "bg");
  assert.deepEqual([bg.q, bg.tier, bg.accepted], [0.8, "soft", true]);
  assert.deepEqual(r.env.data.raster.shots.find((s) => s.id === "s01"), { id: "s01", worst_q: 0.8, tier: "soft", asset: "bg.v1" });
  assert.equal(r.env.data.raster.shots.find((s) => s.id === "s02").worst_q, null);
});

t("qc lists third-party audio credits and refuses a manifest without them (HARD-AUDIO-LICENCE)", async () => {
  const p = await renderProject();
  const ok = await cli(p.cwd, "qc", p.mp4);
  assert.deepEqual(ok.env.data.credits.items.map((c) => [c.id, c.license, c.credit]), [["bed", "CC-BY-4.0", "Bed by Example"]]);
  setManifest(p.dir, (m) => { delete m.assets.find((a) => a.id === "bed").credit; });
  const r = await cli(p.cwd, "qc", p.mp4);
  assert.equal(r.exit, 1);
  assert.deepEqual(rules(r), ["HARD-AUDIO-LICENCE"]);
  assert.match(r.env.errors[0].cause, /credit/);
});

t("qc records the manifest size check: a PNG that differs from the manifest is HARD-REAL-RASTER", async () => {
  const p = await renderProject();
  setManifest(p.dir, (m) => { const a = m.assets.find((x) => x.id === "bg"); a.w = 128; a.h = 128; });
  const r = await cli(p.cwd, "qc", p.mp4);
  assert.ok(rules(r).includes("HARD-REAL-RASTER"));
});

t("HARD-ASSETS-APPROVED: symlinking review/ outside fails before writing any outside file", async () => {
  const p = await renderProject();
  const outside = mkdtempSync(join(tmpdir(), "imagine-outside-review-"));
  rmSync(join(p.dir, "review"), { recursive: true, force: true });
  symlinkSync(outside, join(p.dir, "review"));

  const r = await cli(p.cwd, "qc", p.mp4);
  assert.equal(r.exit, 1);
  assert.ok(rules(r).includes("HARD-ASSETS-APPROVED"));
  assert.match(r.env.errors.find((e) => e.rule === "HARD-ASSETS-APPROVED").message, /outside the project/);
  assert.equal(existsSync(join(outside, "qc.json")), false, "outside qc.json must not be written");
  assert.equal(readdirSync(outside).length, 0, "no files created in outside directory");
  assert.equal(existsSync(join(p.dir, "journal.md")) && readFileSync(join(p.dir, "journal.md"), "utf8").includes("qc:"), false, "journal must not record failed outside write");
});

t("HARD-ASSETS-APPROVED: review/qc.json as an outside symlink leaf fails before writing any outside file", async () => {
  const p = await renderProject();
  mkdirSync(join(p.dir, "review"), { recursive: true });
  const outside = mkdtempSync(join(tmpdir(), "imagine-outside-leaf-"));
  const outsideFile = join(outside, "qc.json");
  symlinkSync(outsideFile, join(p.dir, "review/qc.json"));

  const r = await cli(p.cwd, "qc", p.mp4);
  assert.equal(r.exit, 1);
  assert.ok(rules(r).includes("HARD-ASSETS-APPROVED"));
  assert.match(r.env.errors.find((e) => e.rule === "HARD-ASSETS-APPROVED").message, /outside the project/);
  assert.equal(existsSync(outsideFile), false, "outside symlink target must not be written");
  assert.equal(readdirSync(outside).length, 0, "no files created in outside directory");
  assert.equal(existsSync(join(p.dir, "journal.md")) && readFileSync(join(p.dir, "journal.md"), "utf8").includes("qc:"), false, "journal must not record failed outside write");
});

t("qc writes a fresh safe review/qc.json on probe failure with nulls and structured errors", async () => {
  const p = await makeProject();
  mkdirSync(join(p.dir, "review"), { recursive: true });
  writeFileSync(join(p.dir, "review/qc.json"), JSON.stringify({ stale: true, w: 9999 }));

  const zero = join(p.cwd, "zero.mp4");
  writeFileSync(zero, Buffer.alloc(0));

  const r = await cli(p.cwd, "qc", zero);
  assert.equal(r.exit, 1);
  assert.equal(r.env.code, "HARD_NOT_RUN");
  assert.ok(rules(r).includes("HARD-FPS-SIZE"));
  assert.equal(r.env.data.w, null);
  assert.equal(r.env.data.h, null);
  assert.equal(r.env.data.fps, null);
  assert.equal(r.env.data.duration_s, null);
  assert.equal(r.env.data.audio, null);
  assert.equal(r.env.data.lufs, null);
  assert.equal(r.env.data.true_peak, null);
  assert.ok(r.env.data.raster);
  assert.ok(r.env.data.credits);

  const saved = JSON.parse(readFileSync(join(p.dir, "review/qc.json"), "utf8"));
  assert.equal(saved.stale, undefined, "stale report must be replaced");
  assert.equal(saved.w, null);
  assert.equal(saved.h, null);
  assert.equal(saved.fps, null);
  assert.equal(saved.duration_s, null);
  assert.equal(saved.audio, null);
  assert.equal(saved.lufs, null);
  assert.equal(saved.true_peak, null);
  assert.ok(saved.errors.some((e) => e.rule === "HARD-FPS-SIZE" && /ffprobe/.test(e.message)));
});

t("qc preserves BLOCKED exit 3 when a required tool is missing", async () => {
  const p = await makeProject();
  const mp4 = makeMp4(join(p.cwd, "ok.mp4"));
  const r = await run(["qc", mp4], { cwd: p.cwd, tools: { ffprobe: ["nonexistent-ffprobe-binary-xyz"] } });
  assert.equal(r.exit, 3);
  assert.equal(r.env.code, "BLOCKED");
  assert.equal(existsSync(join(p.dir, "review/qc.json")), false, "report must not be written when blocked");
});

t("qc fails closed on missing current image file (HARD-ASSETS-APPROVED, unmeasured, not native)", async () => {
  const p = await makeProject();
  const mp4 = makeMp4(join(p.cwd, "ok.mp4"));
  setManifest(p.dir, (m) => {
    m.assets.push(asset("missing_img", "img", 1, { w: 1000, h: 1000, required_px: { w: 1000, h: 1000 }, status: "approved" }));
  });

  const r = await cli(p.cwd, "qc", mp4);
  assert.equal(r.exit, 1);
  assert.ok(rules(r).includes("HARD-ASSETS-APPROVED"));
  assert.match(r.env.errors.find((e) => e.rule === "HARD-ASSETS-APPROVED").message, /does not exist/);

  const missingAsset = r.env.data.raster.assets.find((a) => a.id === "missing_img");
  assert.equal(missingAsset.q, null);
  assert.equal(missingAsset.tier, null);
  assert.equal(missingAsset.w, null);
  assert.equal(missingAsset.h, null);
  assert.ok(r.env.data.raster.unmeasured.includes("missing_img.v1"));
  assert.equal(r.env.data.raster.native, false);
  assert.ok(r.env.advice.some((a) => a.rule === "HARD-NO-NATIVE-CLAIM"));

  const saved = JSON.parse(readFileSync(join(p.dir, "review/qc.json"), "utf8"));
  assert.equal(saved.raster.native, false);
  assert.ok(saved.errors.some((e) => e.rule === "HARD-ASSETS-APPROVED"));
});

t("qc fails closed on corrupt non-PNG current asset (HARD-REAL-RASTER, unmeasured, not native)", async () => {
  const p = await makeProject();
  const mp4 = makeMp4(join(p.cwd, "ok.mp4"));
  const imgPath = join(p.dir, "assets/img/corrupt.v1.bin");
  mkdirSync(dirname(imgPath), { recursive: true });
  writeFileSync(imgPath, "corrupt non-png file content payload");

  setManifest(p.dir, (m) => {
    m.assets.push(asset("corrupt", "img", 1, { w: 1000, h: 1000, required_px: { w: 1000, h: 1000 }, status: "approved" }));
  });

  const r = await cli(p.cwd, "qc", mp4);
  assert.equal(r.exit, 1);
  assert.ok(rules(r).includes("HARD-REAL-RASTER"));
  assert.match(r.env.errors.find((e) => e.rule === "HARD-REAL-RASTER").message, /cannot be parsed as PNG/);

  const corruptAsset = r.env.data.raster.assets.find((a) => a.id === "corrupt");
  assert.equal(corruptAsset.q, null);
  assert.equal(corruptAsset.tier, null);
  assert.equal(corruptAsset.w, null);
  assert.equal(corruptAsset.h, null);
  assert.ok(r.env.data.raster.unmeasured.includes("corrupt.v1"));
  assert.equal(r.env.data.raster.native, false);
  assert.ok(r.env.advice.some((a) => a.rule === "HARD-NO-NATIVE-CLAIM"));

  const saved = JSON.parse(readFileSync(join(p.dir, "review/qc.json"), "utf8"));
  assert.equal(saved.raster.native, false);
  assert.ok(saved.errors.some((e) => e.rule === "HARD-REAL-RASTER"));
});

t("qc fails HARD-RASTER-TIER on missing required_px, never claims native", async () => {
  const p = await makeProject();
  const mp4 = makeMp4(join(p.cwd, "ok.mp4"));
  makePng(join(p.dir, "assets/img/no_budget.v1.bin"), 100, 100, () => 0);
  setManifest(p.dir, (m) => {
    m.assets.push(asset("no_budget", "img", 1, { w: 100, h: 100, status: "approved" }));
  });

  const r = await cli(p.cwd, "qc", mp4);
  assert.equal(r.exit, 1);
  assert.ok(rules(r).includes("HARD-RASTER-TIER"));
  assert.match(r.env.errors.find((e) => e.rule === "HARD-RASTER-TIER").message, /missing or non-positive required_px/);

  const row = r.env.data.raster.assets.find((a) => a.id === "no_budget");
  assert.equal(row.q, null);
  assert.equal(row.tier, null);
  assert.ok(r.env.data.raster.unmeasured.includes("no_budget.v1"));
  assert.equal(r.env.data.raster.native, false);

  const saved = JSON.parse(readFileSync(join(p.dir, "review/qc.json"), "utf8"));
  assert.equal(saved.raster.native, false);
  assert.ok(saved.errors.some((e) => e.rule === "HARD-RASTER-TIER"));
});

t("qc fails HARD-RASTER-TIER on zero or non-finite required_px, never yields native:true", async () => {
  const p = await makeProject();
  const mp4 = makeMp4(join(p.cwd, "ok.mp4"));
  makePng(join(p.dir, "assets/img/zero_budget.v1.bin"), 100, 100, () => 0);
  setManifest(p.dir, (m) => {
    m.assets.push(asset("zero_budget", "img", 1, { w: 100, h: 100, required_px: { w: 0, h: 0 }, status: "approved" }));
  });

  const r = await cli(p.cwd, "qc", mp4);
  assert.equal(r.exit, 1);
  assert.ok(rules(r).includes("HARD-RASTER-TIER"));
  assert.match(r.env.errors.find((e) => e.rule === "HARD-RASTER-TIER").message, /missing or non-positive required_px/);

  const row = r.env.data.raster.assets.find((a) => a.id === "zero_budget");
  assert.equal(row.q, null);
  assert.equal(row.tier, null);
  assert.ok(r.env.data.raster.unmeasured.includes("zero_budget.v1"));
  assert.equal(r.env.data.raster.native, false);

  const saved = JSON.parse(readFileSync(join(p.dir, "review/qc.json"), "utf8"));
  assert.equal(saved.raster.native, false);
  assert.ok(saved.errors.some((e) => e.rule === "HARD-RASTER-TIER"));
});

t("probeMedia/qc: ffprobe duration N/A or non-finite fps returns HARD errors, writes safe review/qc.json", async () => {
  const p = await makeProject();
  const mp4 = makeMp4(join(p.cwd, "ok.mp4"));

  // Fake ffprobe with format.duration: "N/A"
  const fakeDir = mkdtempSync(join(tmpdir(), "ffprobe-fake-"));
  const fakeScript = join(fakeDir, "fake-probe.mjs");
  const fakeJson = JSON.stringify({
    streams: [
      { codec_type: "video", width: 1080, height: 1920, r_frame_rate: "30/1", codec_name: "h264" },
      { codec_type: "audio", codec_name: "aac", channels: 2, sample_rate: "48000" }
    ],
    format: { duration: "N/A" }
  });
  writeFileSync(fakeScript, `process.stdout.write(${JSON.stringify(fakeJson)});\n`);

  const r = await run(["qc", mp4], { cwd: p.cwd, tools: { ffprobe: [process.execPath, fakeScript] } });
  assert.equal(r.exit, 1);
  assert.ok(rules(r).includes("HARD-DURATION"));
  assert.equal(r.env.data.duration_s, null);
  assert.notEqual(r.env.data.duration_s, NaN);

  const saved = JSON.parse(readFileSync(join(p.dir, "review/qc.json"), "utf8"));
  assert.equal(saved.duration_s, null);
  assert.ok(saved.errors.some((e) => e.rule === "HARD-DURATION"));

  // Fake ffprobe with r_frame_rate: "N/A"
  const fakeFpsJson = JSON.stringify({
    streams: [
      { codec_type: "video", width: 1080, height: 1920, r_frame_rate: "N/A", codec_name: "h264" },
      { codec_type: "audio", codec_name: "aac", channels: 2, sample_rate: "48000" }
    ],
    format: { duration: "13.000" }
  });
  writeFileSync(fakeScript, `process.stdout.write(${JSON.stringify(fakeFpsJson)});\n`);

  const rFps = await run(["qc", mp4], { cwd: p.cwd, tools: { ffprobe: [process.execPath, fakeScript] } });
  assert.equal(rFps.exit, 1);
  assert.ok(rules(rFps).includes("HARD-FPS-SIZE"));
  assert.equal(rFps.env.data.fps, null);
});

const phase0 = existsSync(PHASE0) ? test : test.skip;
phase0("AC-01: qc runs on a Phase 0 MP4 fixture and reports its real spec", async () => {
  const p = await makeProject();
  const r = await cli(p.cwd, "qc", PHASE0);
  assert.deepEqual([r.env.data.w, r.env.data.h, r.env.data.fps], [1080, 1920, 30]);
  assert.ok(r.env.data.audio);
  assert.equal(typeof r.env.data.lufs, "number");
  assert.ok(existsSync(join(p.dir, "review/qc.json")));
  assert.ok(!rules(r).includes("HARD-FPS-SIZE"), "the Phase 0 render matches the G0 size and fps");
  assert.ok(rules(r).includes("HARD-DURATION"), "a 6 s spike is shorter than the 12-15 s range");
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-LOUDNESS" && /change the mix gain by \+1[67](\.\d)? dB/.test(e.message)), "the spike mix is about -33 LUFS and the kit never normalises it");
});
