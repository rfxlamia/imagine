import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const LINES = [
  "Every night for forty years, Mara climbed the stairs and lit the lamp.",
  "Tonight the sea was quiet, and no ship was coming.",
  "She lit it anyway.",
];

test("keeper-3 narration carries the three runbook lines in kit format", () => {
  const text = readFileSync(join(here, "scripts", "keeper-3.md"), "utf8");
  assert.deepEqual(text.trim().split("\n"), LINES.map((l, i) => `L0${i + 1} [narrator]: ${l}`));
});

test("keeper-3 copy carries the same sentences as T units", () => {
  const text = readFileSync(join(here, "scripts", "keeper-3-copy.md"), "utf8");
  assert.deepEqual(text.trim().split("\n"), LINES.map((l, i) => `T0${i + 1}: ${l}`));
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const sfx = (out) => spawnSync("bash", [join(here, "make-sfx.sh"), out], { encoding: "utf8" });

test("make-sfx.sh is deterministic and writes a 48 kHz mono 16-bit 0.40 s WAV", { skip: !hasFfmpeg }, () => {
  const a = mkdtempSync(join(tmpdir(), "sfx-a-"));
  const b = mkdtempSync(join(tmpdir(), "sfx-b-"));
  assert.equal(sfx(a).status, 0);
  assert.equal(sfx(b).status, 0);
  assert.deepEqual(readFileSync(join(a, "lamp-on.wav")), readFileSync(join(b, "lamp-on.wav")));
  const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels,bits_per_sample:format=duration",
    "-of", "json", join(a, "lamp-on.wav")], { encoding: "utf8" });
  const j = JSON.parse(p.stdout);
  assert.equal(j.streams[0].sample_rate, "48000");
  assert.equal(j.streams[0].channels, 1);
  assert.equal(j.streams[0].bits_per_sample, 16);
  assert.ok(Math.abs(Number(j.format.duration) - 0.4) <= 0.01);
});

test("make-sfx.sh writes the three licence fields the manifest requires", { skip: !hasFfmpeg }, () => {
  const d = mkdtempSync(join(tmpdir(), "sfx-l-"));
  assert.equal(sfx(d).status, 0);
  const lic = YAML.parse(readFileSync(join(d, "lamp-on.licence.yaml"), "utf8"));
  assert.equal(lic.license, "original");
  assert.match(lic.source, /make-sfx\.sh/);
  assert.ok(lic.credit.length > 0);
});

import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { approveThrough, asset, cli, makeProject, put, seedCanon, setManifest } from "../../packages/imagine-kit/test/helpers/fixture.mjs";
import { FAKE_CODEX, PLAN, imgProject } from "../../packages/imagine-kit/test/helpers/img.mjs";

const PROBE = join(here, "probe.mjs");
// Every probe test gets its own slice home, so writing probes accept only that home's snapshots.
// realpath: on macOS the temp dir sits behind a /var -> /private/var symlink, which would mask an unresolved-path bypass.
const sliceHome = () => realpathSync(mkdtempSync(join(tmpdir(), "slice-home-")));
const probe = (args, env = {}) => {
  const r = spawnSync(process.execPath, [PROBE, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : null, stderr: r.stderr };
};
const snap = (dir, home, label = "t") => probe(["snapshot", "--project", dir, "--label", label], { IMAGINE_SLICE_HOME: home }).out.path;

// Mirrors storyboardPatch() in packages/imagine-kit/test/patch-apply.test.mjs: one storyboard patch staged against
// the current canon and not yet applied. Returns its path relative to the project.
async function stageStoryboard(p) {
  const s = (await cli(p.cwd, "status", "--ref", "bible:characters.mara,unit:L01,unit:L02,unit:L03")).env.data.sources;
  const patch = { stage: "storyboard", author: "storyboard-artist", base_story_rev: 0,
    inputs: { bible: { "characters.mara": s["bible:characters.mara"] },
      units: { L01: s["unit:L01"], L02: s["unit:L02"], L03: s["unit:L03"] } },
    ops: [{ create_shot: { id: "s01", after: null, title: "Stairs", narrative: "She climbs.",
      set: { scene: "stairs", duration_est: "13s", voiceover: ["L01", "L02", "L03"], characters: ["mara"] } } }] };
  const rel = "stage/storyboard/r1.patch.yaml";
  put(p.dir, rel, YAML.stringify(patch));
  return rel;
}
async function canonThrough(gate) {
  const p = await makeProject({ format: "landscape" });
  seedCanon(p.dir);
  await approveThrough(p.cwd, gate);
  return p;
}

test("P1 flow: snapshot while waiting for G3, adopt the live storyboard patch, ac12 passes on the copy", async () => {
  const p = await canonThrough("G2");
  const home = sliceHome();
  const S = snap(p.dir, home);
  assert.equal((await cli(p.cwd, "gate", "G3", "approve", "--quote", "style ok")).exit, 0);
  const rel = await stageStoryboard(p);
  const env = { IMAGINE_SLICE_HOME: home };
  const a = probe(["adopt", "--project", S, "--from", p.dir, "--patch", rel, "--gate", "G3"], env);
  assert.equal(a.status, 0, JSON.stringify(a.out));
  const r = probe(["ac12", "--project", S, "--patch", rel], env);
  assert.equal(r.out.verdict, "PASS", JSON.stringify(r.out));
  assert.equal(r.out.control.exit, 0);
  assert.equal(r.out.probe.code, "STALE_INPUTS");
  assert.equal(r.out.edited_entity, "characters.mara");
  assert.equal(r.out.story_sha_before, r.out.story_sha_after);
  assert.match(readFileSync(join(S, "journal.md"), "utf8"), /gate: G3 approve .*WP8 probe on a snapshot copy/);
  assert.doesNotMatch(readFileSync(join(p.dir, "journal.md"), "utf8"), /WP8 probe/);
});

test("ac02: a key the patch's stage does not own is KEY_NOT_OWNED and STORY.md is unchanged", async () => {
  const p = await canonThrough("G3");
  const rel = await stageStoryboard(p);
  const home = sliceHome();
  const r = probe(["ac02", "--project", snap(p.dir, home), "--patch", rel], { IMAGINE_SLICE_HOME: home });
  assert.equal(r.out.code, "KEY_NOT_OWNED", JSON.stringify(r.out));
  assert.equal(r.out.exit, 1);
  assert.equal(r.out.injected, "storyboard op 1 set.camera");
  assert.equal(r.out.story_sha_before, r.out.story_sha_after);
  assert.equal(r.out.verdict, "PASS");
});

// sha256 of every file under a tree (sorted relative path + digest), so "byte-identical" covers the whole tree.
const treeHash = (root) => {
  const h = createHash("sha256");
  for (const e of readdirSync(root, { withFileTypes: true, recursive: true }).filter((x) => x.isFile())
    .map((x) => join(x.parentPath, x.name)).sort()) {
    h.update(`${relative(root, e)}\0${createHash("sha256").update(readFileSync(e)).digest("hex")}\n`);
  }
  return h.digest("hex");
};
const WRITERS = (p, rel) => [["ac12", "--patch", rel], ["ac02", "--patch", rel], ["ac15a"], ["ac15b", "--ref", "mara-ref"],
  ["adopt", "--from", p.dir, "--patch", rel, "--gate", "G3"]];

test("writing probes refuse every project path that is not a real directory under snapshots/ and leave the live tree untouched", async () => {
  const p = await canonThrough("G3");
  const rel = await stageStoryboard(p);
  const home = sliceHome();
  const snaps = join(home, "snapshots");
  mkdirSync(snaps); // exists, so the refusal comes from the path logic and not from a missing root
  const evil = join(home, "snapshots-evil");
  mkdirSync(evil);
  cpSync(p.dir, join(evil, "copy"), { recursive: true });
  symlinkSync(p.dir, join(snaps, "lnk"));
  const cases = {
    "live project beside snapshots/": p.dir,
    "snapshots-evil sibling": join(evil, "copy"),
    "symlink inside snapshots/ to a live dir": join(snaps, "lnk"),
    "nonexistent child under that symlink": join(snaps, "lnk", "newproj"),
    "nonexistent path under snapshots/": join(snaps, "nope", "newproj"),
    "snapshots/ itself": snaps,
  };
  const env = { IMAGINE_SLICE_HOME: home };
  for (const [name, project] of Object.entries(cases)) {
    for (const args of WRITERS(p, rel)) {
      const live = treeHash(p.dir);
      const sibling = treeHash(evil);
      const r = probe([args[0], "--project", project, ...args.slice(1)], env);
      assert.equal(r.status, 2, `${name} / ${args[0]}: ${r.stderr}`);
      assert.match(r.stderr, /writing probes run only on|does not exist/, `${name} / ${args[0]}`);
      assert.equal(treeHash(p.dir), live, `${name} / ${args[0]}: live project changed`);
      assert.equal(treeHash(evil), sibling, `${name} / ${args[0]}: sibling changed`);
    }
  }
});

test("snapshot --label cannot place the copy outside snapshots/", async () => {
  const p = await makeProject({ format: "landscape" });
  const home = sliceHome();
  for (const label of ["..", "../up", "a/b", "/abs", ".hidden", "", "a..b/c"]) {
    const before = readdirSync(home, { recursive: true }).sort();
    const r = probe(["snapshot", "--project", p.dir, "--label", label], { IMAGINE_SLICE_HOME: home });
    assert.equal(r.status, 2, `label ${JSON.stringify(label)}: ${r.stderr}`);
    assert.deepEqual(readdirSync(home, { recursive: true }).sort(), before, `label ${JSON.stringify(label)} wrote something`);
  }
});

test("a --patch that climbs out of the project is refused before anything is written", async () => {
  const p = await canonThrough("G3");
  const rel = await stageStoryboard(p);
  const home = sliceHome();
  const env = { IMAGINE_SLICE_HOME: home };
  const S = snap(p.dir, home);
  // A readable patch just outside the snapshot, and the same patch outside the live project.
  const outside = join(dirname(S), "esc.patch.yaml");
  copyFileSync(join(p.dir, rel), outside);
  copyFileSync(join(p.dir, rel), join(dirname(p.dir), "esc.patch.yaml"));
  for (const bad of ["../esc.patch.yaml", "stage/../../esc.patch.yaml"]) {
    for (const args of [["adopt", "--from", p.dir, "--patch", bad], ["ac02", "--patch", bad], ["ac12", "--patch", bad]]) {
      const snapHash = treeHash(S);
      const before = readdirSync(dirname(S)).sort();
      const r = probe([args[0], "--project", S, ...args.slice(1)], env);
      assert.equal(r.status, 2, `${args[0]} ${bad}: ${r.stderr}`);
      assert.equal(treeHash(S), snapHash);
      assert.deepEqual(readdirSync(dirname(S)).sort(), before);
    }
  }
  assert.equal(existsSync(join(dirname(S), "ac02-forbidden.patch.yaml")), false);
});

test("a symlink inside the snapshot cannot carry a --patch write outside it", async () => {
  const p = await canonThrough("G3");
  const rel = await stageStoryboard(p);
  const home = sliceHome();
  const env = { IMAGINE_SLICE_HOME: home };
  const S = snap(p.dir, home);
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "probe-outside-")));
  mkdirSync(join(outside, "storyboard"));
  copyFileSync(join(p.dir, rel), join(outside, "storyboard", "r1.patch.yaml"));
  rmSync(join(S, "stage"), { recursive: true });
  symlinkSync(outside, join(S, "stage")); // stage -> an outside dir
  symlinkSync(join(outside, "not-yet"), join(S, "dangling")); // a dangling link whose target would be created outside
  for (const args of [["adopt", "--from", p.dir, "--patch", rel], ["ac02", "--patch", rel], ["ac12", "--patch", rel],
    ["adopt", "--from", p.dir, "--patch", "dangling/x.patch.yaml"]]) {
    const before = treeHash(outside);
    const listing = readdirSync(outside, { recursive: true }).sort();
    const r = probe([args[0], "--project", S, ...args.slice(1)], env);
    assert.equal(r.status, 2, `${args[0]} ${args.at(-1)}: ${r.stderr}`);
    assert.equal(treeHash(outside), before);
    assert.deepEqual(readdirSync(outside, { recursive: true }).sort(), listing);
  }
});

test("snapshot refuses a project holding a symlink that leaves it, and accepts one that stays inside", async () => {
  const p = await makeProject({ format: "landscape" });
  const home = sliceHome();
  const env = { IMAGINE_SLICE_HOME: home };
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "probe-outside-")));
  symlinkSync("assets", join(p.dir, "inner-link")); // stays inside: fine
  assert.equal(probe(["snapshot", "--project", p.dir, "--label", "ok"], env).status, 0);
  symlinkSync(outside, join(p.dir, "stage-link"));
  const r = probe(["snapshot", "--project", p.dir, "--label", "bad"], env);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /symlink/);
  assert.equal(existsSync(join(home, "snapshots", "bad")), false);
});

test("usage errors and unmet preconditions exit 2, not 1 (1 is a FAIL verdict)", async () => {
  const p = await makeProject({ format: "landscape" });
  const home = sliceHome();
  const env = { IMAGINE_SLICE_HOME: home };
  assert.equal(probe(["snapshot", "--label", "x"], env).status, 2, "missing --project");
  assert.equal(probe(["snapshot", "--project", p.dir], env).status, 2, "missing --label");
  assert.equal(probe(["status", "--project", p.dir, "--bogus", "1"], env).status, 2, "unknown option");
  assert.equal(probe(["snapshot", "--project", join(home, "nope"), "--label", "x"], env).status, 2, "missing project dir");
  assert.equal(probe(["manifest-check", "--project", mkdtempSync(join(tmpdir(), "bare-"))], env).status, 2, "no manifest.yaml");
  assert.equal(probe(["diff-status", "--before", join(home, "a.json")], env).status, 2, "missing --after");
});

test("ac15a: a batch before G5r exits 6, never calls codex and writes no asset", { skip: !hasFfmpeg }, async () => {
  const p = await imgProject();
  const home = sliceHome();
  const r = probe(["ac15a", "--project", snap(p.dir, home)], { IMAGINE_SLICE_HOME: home });
  assert.equal(r.out.code, "REFS_NOT_APPROVED", JSON.stringify(r.out));
  assert.deepEqual(r.out.batch, ["hero", "bg"]);
  assert.equal(r.out.tool_called, false);
  assert.deepEqual(r.out.new_files, []);
  assert.equal(r.out.verdict, "PASS");
});

// Approves refs and images (hero at full required size so G5b can approve it) and returns a probe-ready environment.
async function approvedImages(heroRefs) {
  const plan = { assets: PLAN.assets.map((a) => {
    if (a.id !== "hero") return a;
    const { refs, ...rest } = a;
    return { ...rest, ...(heroRefs ? { refs } : {}), required_px: { w: 1536, h: 1024 } };
  }) };
  const p = await imgProject(plan);
  assert.equal((await p.run({}, "img", "--ref", "mara-ref")).exit, 0);
  assert.equal((await cli(p.cwd, "gate", "G5r", "approve", "--quote", "refs ok")).exit, 0);
  assert.equal((await p.run({}, "img", "--batch", "hero,bg")).exit, 0);
  assert.equal((await cli(p.cwd, "gate", "G5b", "approve", "--quote", "images ok")).exit, 0);
  const bin = mkdtempSync(join(tmpdir(), "fake-codex-bin-"));
  writeFileSync(join(bin, "codex"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_CODEX}" "$@"\n`);
  chmodSync(join(bin, "codex"), 0o755);
  const home = sliceHome();
  return { p, home, env: { IMAGINE_SLICE_HOME: home, PATH: `${bin}:${process.env.PATH}`, CODEX_HOME: p.home } };
}

test("ac15b: a new ref version after G5b turns the images that cite it stale", { skip: !hasFfmpeg }, async () => {
  const { p, home, env } = await approvedImages(true);
  const r = probe(["ac15b", "--project", snap(p.dir, home), "--ref", "mara-ref"], env);
  assert.equal(r.out.verdict, "PASS", JSON.stringify(r.out));
  assert.equal(r.out.new_ref, "mara-ref.v2");
  // The superseded ref version and the image citing it go stale; bg cites no ref and stays approved.
  assert.deepEqual(r.out.newly_stale.map((i) => i.id).sort(), ["asset:hero.v1", "asset:mara-ref.v1"]);
  // The PASS evidence names the citing image itself, not just the superseded ref.
  assert.deepEqual(r.out.citing_stale, ["asset:hero.v1"]);
});

test("ac15b: FAIL when only the superseded ref turns stale (no image cites it)", { skip: !hasFfmpeg }, async () => {
  const { p, home, env } = await approvedImages(false);
  const r = probe(["ac15b", "--project", snap(p.dir, home), "--ref", "mara-ref"], env);
  assert.equal(r.status, 1, JSON.stringify(r.out));
  assert.equal(r.out.verdict, "FAIL");
  assert.deepEqual(r.out.newly_stale.map((i) => i.id), ["asset:mara-ref.v1"]);
  assert.deepEqual(r.out.citing_stale, []);
});

test("diff-status lists only items that turned stale", () => {
  const d = mkdtempSync(join(tmpdir(), "diff-"));
  const env = (items) => ({ ok: true, data: { items } });
  writeFileSync(join(d, "a.json"), JSON.stringify(env([{ id: "x", status: "approved" }, { id: "y", status: "approved" }, { id: "z", status: "stale" }])));
  writeFileSync(join(d, "b.json"), JSON.stringify(env([{ id: "x", status: "stale", reasons: ["r"] }, { id: "y", status: "approved" }, { id: "z", status: "stale" }])));
  const r = probe(["diff-status", "--before", join(d, "a.json"), "--after", join(d, "b.json")]);
  assert.deepEqual(r.out.newly_stale.map((i) => i.id), ["x"]);
  assert.equal(r.out.others_count, 2);
});

test("interrupt-batch signals only this project's batch, once a new image is committed, and checks nothing survives", async () => {
  const p = await makeProject({ format: "landscape" });
  const other = await makeProject({ format: "landscape" });
  // Stand-ins for running kit batches: the same command-line shape, exiting on SIGINT like the kit.
  const d = mkdtempSync(join(tmpdir(), "fake-kit-"));
  writeFileSync(join(d, "imagine-kit.mjs"), "process.on('SIGINT', () => process.exit(130));\nsetInterval(() => {}, 1000);\n");
  const start = (proj) => {
    const c = spawn(process.execPath, [join(d, "imagine-kit.mjs"), "img", "--batch", "hero,bg", "--project", proj], { stdio: "ignore" });
    return { c, exit: new Promise((resolve) => c.on("exit", (code, sig) => resolve(sig ?? code))) };
  };
  const mine = start(p.dir);
  const decoy = start(other.dir); // another project's batch on the same machine: must not be signalled
  try {
    const watcher = spawn(process.execPath, [PROBE, "interrupt-batch", "--project", p.dir, "--timeout", "30"]);
    let stdout = "";
    let stderr = "";
    watcher.stdout.on("data", (b) => { stdout += b; });
    watcher.stderr.on("data", (b) => { stderr += b; });
    const watcherExit = new Promise((resolve) => watcher.on("exit", (code) => resolve(code)));
    // Poll for the watcher's readiness line (its baseline is taken) instead of sleeping a fixed time.
    const t0 = Date.now();
    while (!/watching/.test(stderr)) {
      assert.ok(Date.now() - t0 < 10000, "the watcher never reported readiness");
      await new Promise((r) => setTimeout(r, 50));
    }
    setManifest(p.dir, (m) => { m.assets.push(asset("hero", "img", 1)); });
    assert.equal(await mine.exit, 130);
    assert.equal(await watcherExit, 0, stdout);
    const out = JSON.parse(stdout);
    assert.equal(out.committed_before_signal, "hero.v1");
    assert.deepEqual(out.signalled, [mine.c.pid]);
    assert.deepEqual(out.survivors, { kit: [], codex: [] });
    assert.equal(decoy.c.exitCode, null, "the other project's batch was signalled");
    assert.equal(decoy.c.signalCode, null);
  } finally {
    decoy.c.kill("SIGKILL");
    mine.c.kill("SIGKILL");
  }
});

test("interrupt-batch resolves the batch's project like the kit: ACTIVE, relative --project, and never a prefix sibling", async () => {
  const p = await makeProject({ format: "landscape" });
  const other = await makeProject({ format: "landscape" });
  const name = p.dir.split("/").at(-1);
  writeFileSync(join(p.cwd, ".imagine", "ACTIVE"), `${name}\n`);
  const sibling = `${p.dir}2`; // shares the name prefix of p.dir
  mkdirSync(sibling);
  const d = mkdtempSync(join(tmpdir(), "fake-kit-"));
  writeFileSync(join(d, "imagine-kit.mjs"), "process.on('SIGINT', () => process.exit(130));\nsetInterval(() => {}, 1000);\n");
  const all = [];
  let watcherProc;
  const start = (cwd, ...flag) => {
    const c = spawn(process.execPath, [join(d, "imagine-kit.mjs"), "img", "--batch", "hero,bg", ...flag], { cwd, stdio: "ignore" });
    const h = { c, exit: new Promise((resolve) => c.on("exit", (code, sig) => resolve(sig ?? code))) };
    all.push(h);
    return h;
  };
  try {
    const viaActive = start(p.cwd); // no --project: cwd/.imagine/ACTIVE
    const viaRelative = start(p.cwd, "--project", join(".imagine", name));
    const viaRelativeUp = start(join(p.cwd, ".imagine"), `--project`, name);
    const viaDotDot = start(join(p.cwd, ".imagine", name), "--project", ".");
    const decoys = [start(p.cwd, "--project", sibling), start(p.cwd, "--project", other.dir), start(other.cwd)];
    const watcher = watcherProc = spawn(process.execPath, [PROBE, "interrupt-batch", "--project", p.dir, "--timeout", "30"]);
    let stdout = "";
    let stderr = "";
    watcher.stdout.on("data", (b) => { stdout += b; });
    watcher.stderr.on("data", (b) => { stderr += b; });
    const watcherExit = new Promise((resolve) => watcher.on("exit", (code) => resolve(code)));
    const t0 = Date.now();
    while (!/watching/.test(stderr)) {
      assert.ok(Date.now() - t0 < 10000, "the watcher never reported readiness");
      await new Promise((r) => setTimeout(r, 50));
    }
    setManifest(p.dir, (m) => { m.assets.push(asset("hero", "img", 1)); });
    const mineAll = [viaActive, viaRelative, viaRelativeUp, viaDotDot];
    // A bounded wait, so a probe that signals nothing fails here and the finally block still kills every stand-in.
    const bounded = (pr) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error(`no exit in time; probe stderr: ${stderr}`)), 15000))]);
    assert.deepEqual(await bounded(Promise.all(mineAll.map((m) => m.exit))), [130, 130, 130, 130]);
    assert.equal(await bounded(watcherExit), 0, stdout);
    const out = JSON.parse(stdout);
    assert.deepEqual([...out.signalled].sort(), mineAll.map((m) => m.c.pid).sort());
    assert.deepEqual(out.survivors, { kit: [], codex: [] });
    for (const x of decoys) assert.equal(x.c.signalCode ?? x.c.exitCode, null, "a batch of another project was signalled");
  } finally {
    for (const h of all) h.c.kill("SIGKILL");
    watcherProc?.kill("SIGKILL");
  }
});

test("--out records the latest plugin pin from session.txt, a re-pin included", () => {
  const d = mkdtempSync(join(tmpdir(), "pin-"));
  writeFileSync(join(d, "session.txt"), "plugin_commit=aaa111\nlaunch=x\nplugin_commit_r2=bbb222\n");
  const env = (items) => JSON.stringify({ ok: true, data: { items } });
  writeFileSync(join(d, "a.json"), env([]));
  writeFileSync(join(d, "b.json"), env([]));
  const r = probe(["diff-status", "--before", join(d, "a.json"), "--after", join(d, "b.json"), "--out", join(d, "o.json")],
    { IMAGINE_SLICE_SESSION: join(d, "session.txt") });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(readFileSync(join(d, "o.json"), "utf8"))._pin, "bbb222");
  assert.equal(r.out._pin, undefined);
});

test("manifest-check flags an id and version recorded twice", async () => {
  const p = await makeProject({ format: "landscape" });
  setManifest(p.dir, (m) => { m.assets.push(asset("bg", "img", 1), asset("bg", "img", 1), asset("bg", "img", 2)); });
  const r = probe(["manifest-check", "--project", p.dir]);
  assert.equal(r.status, 1);
  assert.deepEqual(r.out.duplicates, ["bg.v1"]);
});

test("snapshot copies the project under IMAGINE_SLICE_HOME and refuses to overwrite one", async () => {
  const p = await makeProject({ format: "landscape" });
  const home = sliceHome();
  const path = snap(p.dir, home, "p1");
  assert.equal(path, join(home, "snapshots", "p1", p.dir.split("/").pop()));
  assert.ok(existsSync(join(path, "project.yaml")));
  assert.equal(probe(["snapshot", "--project", p.dir, "--label", "p1"], { IMAGINE_SLICE_HOME: home }).status, 2);
});

test("redact writes the home path as $HOME", () => {
  const d = mkdtempSync(join(tmpdir(), "redact-"));
  writeFileSync(join(d, "in.json"), JSON.stringify({ path: join(homedir(), "imagine-slice", "x.mp4") }));
  const r = probe(["redact", "--in", join(d, "in.json"), "--out", join(d, "out.json")]);
  assert.equal(r.status, 0);
  assert.equal(r.out.replaced, 1);
  assert.equal(JSON.parse(readFileSync(join(d, "out.json"), "utf8")).path, "$HOME/imagine-slice/x.mp4");
});

test("index-check fails on a missing evidence file and resolves paths against the index", () => {
  const d = mkdtempSync(join(tmpdir(), "idx-"));
  writeFileSync(join(d, "present.json"), "{}");
  writeFileSync(join(d, "INDEX.md"), "| 1 | `present.json` | PASS |\n| 2 | `absent.json` | PASS |\n");
  const r = probe(["index-check", "--index", join(d, "INDEX.md")]);
  assert.equal(r.status, 1);
  assert.deepEqual(r.out.missing, ["absent.json"]);
});
