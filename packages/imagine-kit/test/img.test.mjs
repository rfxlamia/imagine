import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256File } from "../src/hash.mjs";
import YAML from "yaml";
import { approveThrough, cli, cliWith, getManifest, getProject, makeProject, put, seedCanon, seedMinimalStory } from "./helpers/fixture.mjs";
import { FAKE_CODEX, PLAN, imgProject } from "./helpers/img.mjs";
import { hasFfmpeg } from "./helpers/media.mjs";

const t = hasFfmpeg ? test : test.skip;
const approveRefs = async (p) => {
  assert.equal((await cli(p.cwd, "gate", "G5r", "approve", "--quote", "refs ok")).exit, 0);
};

t("PROC-REVISED-PROMPT, PROC-FRAMING-IN-PROMPT: img --ref generates a pending ref version with measured dims, prompt and revised prompt", async () => {
  const p = await imgProject();
  const r = await p.run({ FAKE_CODEX_SIZE: "1024x1536" }, "img", "--ref", "mara-ref");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  const [a] = r.env.data.assets;
  assert.deepEqual(Object.keys(a), ["id", "v", "w", "h", "q", "tier", "sha256", "revised_prompt"]);
  assert.equal(a.id, "mara-ref");
  assert.equal(a.v, 1);
  assert.equal(a.w, 1024);
  assert.match(a.revised_prompt, /^REVISED: PROMPT: Mara/);
  const entry = getManifest(p.dir).assets.find((x) => x.id === "mara-ref");
  assert.equal(entry.status, "pending");
  assert.equal(entry.kind, "ref");
  assert.equal(entry.path, "assets/refs/mara-ref.v1.png");
  assert.equal(entry.sha256, sha256File(join(p.dir, entry.path)));
  assert.match(entry.prompt, /FRAMING: full body, neutral background/);
  assert.match(entry.prompt, /Do NOT write a script/);
  const [call] = p.calls();
  assert.ok(call.argv.includes("--skip-git-repo-check") && call.argv.includes("workspace-write"));
  assert.ok(call.argv.at(-1).startsWith("PROMPT: Mara"));
  assert.ok(existsSync(join(p.dir, "tmp/img/mara-ref.v1/out.png")));
  assert.match(readFileSync(join(p.dir, "journal.md"), "utf8"), /img: mara-ref\.v1 1024x1536/);
});

t("PROC-RESUME-IDEMPOTENT: running the same request again does not call the tool or change the file", async () => {
  const p = await imgProject();
  await p.run({}, "img", "--ref", "mara-ref");
  const sha = getManifest(p.dir).assets[0].sha256;
  const again = await p.run({}, "img", "--ref", "mara-ref");
  assert.equal(again.exit, 0);
  assert.equal(p.calls().length, 1);
  assert.equal(again.env.data.assets[0].sha256, sha);
  assert.ok(again.env.advice.some((a) => a.rule === "PROC-RESUME-IDEMPOTENT"));
  assert.equal(getManifest(p.dir).assets.length, 1);
});

t("AC-15 HARD-REFS-APPROVED: a batch with an unapproved ref exits 6 and never calls the tool", async () => {
  const p = await imgProject();
  const none = await p.run({}, "img", "--batch", "hero");
  assert.equal(none.exit, 6);
  assert.equal(none.env.code, "REFS_NOT_APPROVED");
  assert.match(none.env.errors[0].message, /no generated version/);
  await p.run({}, "img", "--ref", "mara-ref");
  const pending = await p.run({}, "img", "--batch", "hero");
  assert.equal(pending.exit, 6);
  assert.match(pending.env.errors[0].message, /not approved at G5r/);
  assert.equal(p.calls().length, 1, "only the ref call happened");
  assert.equal(getManifest(p.dir).assets.some((a) => a.id === "hero"), false);
});

t("a batch uses the approved ref as --image and records q and tier against required_px (section 7.2: 0.71 replan)", async () => {
  const p = await imgProject();
  await p.run({}, "img", "--ref", "mara-ref");
  await approveRefs(p);
  const r = await p.run({ FAKE_CODEX_SIZE: "1536x1024" }, "img", "--batch", "hero,bg");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  const [hero, bg] = r.env.data.assets;
  assert.deepEqual([hero.q, hero.tier], [0.71, "replan"]);
  assert.deepEqual([bg.q, bg.tier], [1, "native"]);
  assert.ok(r.env.advice.some((a) => a.rule === "HARD-RASTER-TIER" && a.item === "hero.v1"));
  const heroCall = p.calls()[1];
  assert.ok(heroCall.argv.some((x) => x === `--image=${join(p.dir, "assets/refs/mara-ref.v1.png")}`));
  const bgCall = p.calls()[2];
  assert.equal(bgCall.argv.some((x) => x.startsWith("--image=")), false);
  assert.deepEqual(getManifest(p.dir).assets.find((x) => x.id === "hero").refs, ["mara-ref"]);
});

t("a ref whose file changed after approval fails the refs gate", async () => {
  const p = await imgProject();
  await p.run({}, "img", "--ref", "mara-ref");
  await approveRefs(p);
  writeFileSync(join(p.dir, "assets/refs/mara-ref.v1.png"), "tampered");
  const r = await p.run({}, "img", "--batch", "hero");
  assert.equal(r.exit, 6);
  assert.match(r.env.errors[0].message, /no longer matches/);
});

t("PROC-VERSIONS-IMMUTABLE: --redo creates v2 with its note and leaves v1 untouched; --redo needs --note", async () => {
  const p = await imgProject();
  await p.run({}, "img", "--ref", "mara-ref");
  const v1 = sha256File(join(p.dir, "assets/refs/mara-ref.v1.png"));
  assert.equal((await p.run({}, "img", "--ref", "mara-ref", "--redo", "mara-ref")).exit, 2);
  const r = await p.run({}, "img", "--ref", "mara-ref", "--redo", "mara-ref", "--note", "braid too short");
  assert.equal(r.exit, 0);
  assert.equal(r.env.data.assets[0].v, 2);
  const m = getManifest(p.dir).assets;
  assert.equal(m.find((a) => a.v === 2).note, "braid too short");
  assert.equal(sha256File(join(p.dir, "assets/refs/mara-ref.v1.png")), v1);
  assert.equal(m.length, 2);
});

t("PROC-IMG-RETRY: two bad outputs then a good one succeeds; three bad ones are BLOCKED and recorded", async () => {
  const p = await imgProject();
  const ok = await p.run({ FAKE_CODEX_MODES: "uniform,notpng,ok" }, "img", "--ref", "mara-ref");
  assert.equal(ok.exit, 0, JSON.stringify(ok.env.errors));
  assert.equal(p.calls().length, 3);
  const bad = await p.run({ FAKE_CODEX_MODES: "uniform,nofile,fail" }, "img", "--ref", "lamp-ref");
  assert.equal(bad.exit, 3);
  assert.equal(bad.env.code, "BLOCKED");
  assert.equal(bad.env.errors[0].rule, "PROC-IMG-RETRY");
  assert.equal(p.calls().length, 6);
  assert.equal(getManifest(p.dir).assets.some((a) => a.id === "lamp-ref"), false);
  assert.equal(getProject(p.dir).blocked[0].step, "img:lamp-ref.v1");
  // A later good run clears the blocked entry.
  const fixed = await p.run({}, "img", "--ref", "lamp-ref");
  assert.equal(fixed.exit, 0);
  assert.deepEqual(getProject(p.dir).blocked, []);
});

t("AC-08: a finished file that never reached the manifest is adopted without calling the tool", async () => {
  const p = await imgProject();
  await p.run({}, "img", "--ref", "mara-ref");
  const first = getManifest(p.dir);
  const png = join(p.dir, "assets/refs/mara-ref.v1.png");
  const sha = sha256File(png);
  // Simulate a crash after the copy and before the manifest write.
  writeFileSync(join(p.dir, "assets/manifest.yaml"), "assets: []\n");
  const r = await p.run({}, "img", "--ref", "mara-ref");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.equal(p.calls().length, 1);
  assert.equal(getManifest(p.dir).assets[0].sha256, sha);
  assert.match(getManifest(p.dir).assets[0].revised_prompt, /^REVISED/, "revised prompt survives through meta.json");
  assert.notEqual(first, null);
});

t("AC-08: a leftover file that is not the checked output (garbage, or made from another prompt) is regenerated, never adopted", async () => {
  const p = await imgProject();
  await p.run({}, "img", "--ref", "mara-ref");
  const final = join(p.dir, "assets/refs/mara-ref.v1.png");
  const meta = join(p.dir, "tmp/img/mara-ref.v1/meta.json");
  // Garbage at the final path and no good copy in tmp: the meta hash no longer matches, so the tool runs again.
  writeFileSync(join(p.dir, "assets/manifest.yaml"), "assets: []\n");
  writeFileSync(final, "not a png");
  rmSync(join(p.dir, "tmp/img/mara-ref.v1/out.png"));
  const garbage = await p.run({}, "img", "--ref", "mara-ref");
  assert.equal(garbage.exit, 0, JSON.stringify(garbage.env.errors));
  assert.equal(p.calls().length, 2, "garbage was not adopted");
  assert.ok(sha256File(final) === getManifest(p.dir).assets[0].sha256 && readFileSync(final).subarray(1, 4).toString() === "PNG");
  // A meta written for another prompt: the image would not match the recorded prompt, so it is regenerated.
  writeFileSync(join(p.dir, "assets/manifest.yaml"), "assets: []\n");
  const doc = JSON.parse(readFileSync(meta, "utf8"));
  writeFileSync(meta, JSON.stringify({ ...doc, prompt_sha256: "f".repeat(64) }));
  const other = await p.run({}, "img", "--ref", "mara-ref");
  assert.equal(other.exit, 0);
  assert.equal(p.calls().length, 3, "an image from another prompt was not adopted");
});

t("AC-08: a crash between generation and the copy into assets/ adopts tmp/img/<id>.vN/out.png without calling the tool", async () => {
  const p = await imgProject();
  await p.run({}, "img", "--ref", "mara-ref");
  const sha = sha256File(join(p.dir, "assets/refs/mara-ref.v1.png"));
  writeFileSync(join(p.dir, "assets/manifest.yaml"), "assets: []\n");
  rmSync(join(p.dir, "assets/refs/mara-ref.v1.png"));
  const r = await p.run({}, "img", "--ref", "mara-ref");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.equal(p.calls().length, 1);
  assert.equal(getManifest(p.dir).assets[0].sha256, sha);
});

t("the project lock is not held while the tool runs: gate works during a slow generation", async () => {
  const p = await imgProject();
  const slow = p.run({ FAKE_CODEX_SLEEP_MS: "1500" }, "img", "--ref", "mara-ref");
  await new Promise((r) => setTimeout(r, 400));
  const g = await cli(p.cwd, "gate", "G5r", "approve", "--quote", "x");
  assert.notEqual(g.exit, 5, "gate must not hit LOCKED");
  const done = await slow;
  assert.equal(done.exit, 0, JSON.stringify(done.env.errors));
  assert.equal(getManifest(p.dir).assets.length, 1);
});

t("img needs G4, a plan entry of the right kind, and an installed tool", async () => {
  const p = await imgProject();
  assert.equal((await p.run({}, "img", "--ref", "nope")).exit, 2);
  assert.equal((await p.run({}, "img", "--ref", "hero")).exit, 2);
  assert.equal((await p.run({}, "img", "--batch", "mara-ref")).exit, 2);
  assert.equal((await p.run({}, "img")).exit, 2);
  const missing = await (await import("./helpers/fixture.mjs")).cliWith(p.cwd, { tools: { codex: ["/nonexistent/codex"] } }, "img", "--ref", "mara-ref");
  assert.equal(missing.exit, 3);
  assert.equal(missing.env.code, "BLOCKED");
  await cli(p.cwd, "gate", "G4", "reject", "--quote", "no");
  const closed = await p.run({}, "img", "--ref", "mara-ref");
  assert.equal(closed.exit, 1);
  assert.equal(closed.env.errors[0].rule, "HARD-GATES-RECORDED");
});

t("HARD-ASSETS-APPROVED: a plan.yaml written after G4 is not covered by the approval and img refuses it", async () => {
  const p = await makeProject();
  seedCanon(p.dir);
  await approveThrough(p.cwd, "G3");
  await seedMinimalStory(p.dir);
  const g4 = await cli(p.cwd, "gate", "G4", "approve", "--quote", "story ok");
  assert.equal(g4.exit, 0, JSON.stringify(g4.env.errors));
  assert.ok(g4.env.advice.some((a) => a.rule === "HARD-ASSETS-APPROVED" && /plan\.yaml does not exist/.test(a.message)), "G4 approve warns that plan.yaml is missing");
  put(p.dir, "assets/plan.yaml", YAML.stringify(PLAN));
  const r = await cliWith(p.cwd, { tools: { codex: [process.execPath, FAKE_CODEX] } }, "img", "--ref", "mara-ref");
  assert.equal(r.exit, 1);
  assert.equal(r.env.errors[0].rule, "HARD-ASSETS-APPROVED");
  assert.match(r.env.errors[0].message, /written after G4 was approved/);
  const again = await cli(p.cwd, "gate", "G4", "approve", "--quote", "plan reviewed");
  assert.equal(again.exit, 0);
  const ok = await cliWith(p.cwd, { tools: { codex: [process.execPath, FAKE_CODEX] } }, "img", "--ref", "mara-ref");
  assert.notEqual(ok.env.errors?.[0]?.rule, "HARD-ASSETS-APPROVED");
});

t("HARD-ASSETS-APPROVED: editing plan.yaml after G4 makes G4 stale and img refuses", async () => {
  const p = await imgProject();
  const file = join(p.dir, "assets/plan.yaml");
  writeFileSync(file, `${readFileSync(file, "utf8")}\n# edited\n`);
  const r = await p.run({}, "img", "--ref", "mara-ref");
  assert.equal(r.exit, 1);
  assert.match(r.env.errors[0].message, /G4/);
});

t("a symlinked tmp/img/<id>.vN outside is rejected before the tool runs and no outside file changes", async () => {
  const p = await imgProject();
  const outside = mkdtempSync(join(tmpdir(), "imagine-outside-work-"));
  mkdirSync(join(p.dir, "tmp/img"), { recursive: true });
  symlinkSync(outside, join(p.dir, "tmp/img/mara-ref.v1"));
  const r = await p.run({}, "img", "--ref", "mara-ref");
  assert.notEqual(r.exit, 0);
  assert.equal(r.env.errors[0].rule, "HARD-ASSETS-APPROVED");
  assert.match(r.env.errors[0].message, /outside the project/);
  assert.equal(p.calls().length, 0, "tool was not called");
  assert.deepEqual(readdirSync(outside), [], "no outside file changes");
});

t("a referenced asset path symlinked outside is rejected before Codex runs, even if the external file bytes match the approved hash", async () => {
  const p = await imgProject();
  await p.run({}, "img", "--ref", "mara-ref");
  await approveRefs(p);
  assert.equal(p.calls().length, 1, "only the ref call happened");

  const outside = mkdtempSync(join(tmpdir(), "imagine-outside-ref-"));
  const refFinal = join(p.dir, "assets/refs/mara-ref.v1.png");
  const outsideRef = join(outside, "mara-ref.v1.png");
  writeFileSync(outsideRef, readFileSync(refFinal));
  rmSync(refFinal);
  symlinkSync(outsideRef, refFinal);

  assert.equal(sha256File(refFinal), sha256File(outsideRef));

  const r = await p.run({}, "img", "--batch", "hero");
  assert.notEqual(r.exit, 0);
  assert.equal(p.calls().length, 1, "Codex did not run for batch");
});

t("an existing final destination symlink outside is not adopted or overwritten", async () => {
  const p = await imgProject();
  const outside = mkdtempSync(join(tmpdir(), "imagine-outside-dest-"));
  const outsideTarget = join(outside, "target.png");
  writeFileSync(outsideTarget, "original-outside-bytes");

  mkdirSync(join(p.dir, "assets/refs"), { recursive: true });
  const finalPath = join(p.dir, "assets/refs/mara-ref.v1.png");
  symlinkSync(outsideTarget, finalPath);

  const r = await p.run({}, "img", "--ref", "mara-ref");
  assert.notEqual(r.exit, 0);
  assert.equal(readFileSync(outsideTarget, "utf8"), "original-outside-bytes", "outside target not overwritten");
  assert.equal(getManifest(p.dir).assets.some((a) => a.id === "mara-ref"), false, "outside target not adopted");
  assert.equal(p.calls().length, 0, "tool was not called");
});
