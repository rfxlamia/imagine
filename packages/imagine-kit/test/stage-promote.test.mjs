import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli, getProject, put, setProject, shot } from "./helpers/fixture.mjs";
import { addAudio, editProject, COMPOSITION } from "./helpers/edit.mjs";

const motionOf = (dir) => JSON.parse(readFileSync(join(dir, "edit/index.motion.json"), "utf8"));const MOTION = { version: 1, assertions: [
  { kind: "appearsBy", selector: "#a", bySec: 1.5 }, { kind: "staysInFrame", selector: "#a" }, { kind: "keepsMoving", maxStaticSec: 2 }] };

test("stage-shot builds the shadow project and returns {shot, path}", async () => {
  const p = await editProject();
  const r = await p.run({}, "stage-shot", "s01");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.equal(r.env.data.shot, "s01");
  assert.equal(r.env.data.path, "stage/edit/s01");
  assert.match(r.env.data.guard_digest, /^[0-9a-f]{64}$/);
  const brief = readFileSync(join(p.dir, "stage/edit/s01/SHOT.md"), "utf8");
  assert.match(brief, /1080x1920 at 30 fps/);
  assert.match(brief, /L01 at \+0s: Every night/);
  assert.match(brief, /bg \(img\) -> assets\/bg\.v1\.png/);
  assert.ok(existsSync(join(p.dir, "stage/edit/s01/assets/bg.v1.png")));
  assert.ok(existsSync(join(p.dir, "stage/edit/s01/hyperframes.json")));
  assert.match(readFileSync(join(p.dir, "stage/edit/s01/index.html"), "utf8"), /class="scene" data-composition-id="s01" data-composition-src="compositions\/s01\.html"/);
  p.buildScene("s01");
  await p.run({}, "stage-shot", "s01");
  assert.ok(existsSync(join(p.dir, "stage/edit/s01/compositions/s01.html")), "a rerun never deletes the scene-builder's composition");
});

test("stage-shot stages the exported copy under its exportName even when the source basename differs", async () => {
  const shots = [
    shot("s01", { scene: "stairs", duration_est: "6s", duration: "6s", voiceover: "[L01, L02@2.5]", characters: "[mara]", location: "lighthouse", assets: "[bg:img:1536x1024,bed:music]", framing: "wide" }, "Stairs", "She climbs."),
    shot("s02", { scene: "lamp", duration_est: "7s", duration: "7s", voiceover: "[L03]", fx: "[glow=css-blend:screen]" }, "Lamp"),
  ];
  const p = await editProject({ shots });
  await addAudio(p);
  const exported = await p.run({}, "export-hf");
  assert.equal(exported.exit, 0, JSON.stringify(exported.env.errors));
  // Distinguish the exported copy from the source file: stage-shot must sync the copy in edit/assets/, not the source.
  writeFileSync(join(p.dir, "edit/assets/bed.v1.wav"), "exported-copy");
  const r = await p.run({}, "stage-shot", "s01");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.deepEqual(readdirSync(join(p.dir, "stage/edit/s01/assets")).sort(), ["bed.v1.wav", "bg.v1.png"]);
  assert.equal(readFileSync(join(p.dir, "stage/edit/s01/assets/bed.v1.wav"), "utf8"), "exported-copy", "the exported copy was synced, not the source file");
  const brief = readFileSync(join(p.dir, "stage/edit/s01/SHOT.md"), "utf8");
  assert.match(brief, /bed \(music\) -> assets\/bed\.v1\.wav/);
  assert.doesNotMatch(brief, /music\.v1\.wav/, "the brief never names the source basename");
});

test("stage-shot preconditions: G4, export-hf output, initialised edit/, non-stale previz, usage", async () => {
  const p = await editProject();
  assert.equal((await p.run({}, "stage-shot", "s09")).exit, 2);
  assert.equal((await p.run({}, "stage-shot", "x1")).exit, 2);
  setProject(p.dir, (pr) => { pr.items["shot:s01.previz"].inputs["shot:s01.storyboard"] = "0".repeat(64); });
  const stale = await p.run({}, "stage-shot", "s01");
  assert.equal(stale.exit, 1);
  assert.match(stale.env.errors[0].message, /shot:s01.previz is stale/);
  assert.equal((await p.run({}, "stage-shot", "s02")).exit, 0, "the other shot is unaffected");
  const q = await editProject();
  setProject(q.dir, (pr) => { delete pr.items["shot:s02.fx"]; });
  assert.match((await q.run({}, "stage-shot", "s02")).env.errors[0].message, /no fx item/);
  const r = await editProject();
  const { unlinkSync } = await import("node:fs");
  unlinkSync(join(r.dir, "edit/STORYBOARD.md"));
  assert.match((await r.run({}, "stage-shot", "s01")).env.errors[0].message, /export-hf first/);
  put(r.dir, "edit/STORYBOARD.md", "x");
  unlinkSync(join(r.dir, "edit/hyperframes.json"));
  const blocked = await r.run({}, "stage-shot", "s01");
  assert.equal(blocked.exit, 3);
  const g4 = await editProject();
  await cli(g4.cwd, "gate", "G4", "reject", "--quote", "no");
  assert.equal((await g4.run({}, "stage-shot", "s01")).exit, 1);
});

test("promote-shot copies the composition, shifts appearsBy by the host start, tags assertions, records edit:s01", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s02");
  p.buildScene("s02", MOTION);
  const r = await p.run({}, "promote-shot", "s02");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.deepEqual(r.env.data, { shot: "s02", path: "edit/compositions/s02.html" });
  assert.equal(readFileSync(join(p.dir, "edit/compositions/s02.html"), "utf8"), readFileSync(join(p.dir, "stage/edit/s02/compositions/s02.html"), "utf8"));
  assert.deepEqual(motionOf(p.dir), { version: 1, assertions: [
    { kind: "appearsBy", selector: "#a", bySec: 7.5, shot: "s02" }, { kind: "staysInFrame", selector: "#a", shot: "s02" }, { kind: "keepsMoving", maxStaticSec: 2, shot: "s02" }] },
  "s01 lasts 6s in previz, so s02 starts at 6: 1.5 + 6 = 7.5");
  const item = getProject(p.dir).items["edit:s02"];
  assert.equal(item.kind, "edit");
  assert.equal(item.status, "proposed");
  for (const ref of ["shot:s02.previz", "shot:s02.fx", "file:edit/compositions/s02.html"]) assert.ok(item.inputs[ref], ref);
  const lintCall = p.calls().find((c) => c.argv.includes("lint"));
  assert.deepEqual(lintCall.argv.slice(0, 3), ["--yes", "hyperframes@0.8.223", "lint"]);
  assert.equal(lintCall.telemetry_off, "1");
  assert.ok(lintCall.argv.includes("--json"));
});

test("promote-shot uses the host data-start in edit/index.html over the previz sum, and re-promoting replaces only that shot", async () => {
  const p = await editProject();
  put(p.dir, "edit/index.html", '<div class="scene" data-composition-id="s01" data-composition-src="compositions/s01.html" data-start="10" data-duration="6"></div>');
  for (const id of ["s01", "s02"]) { await p.run({}, "stage-shot", id); p.buildScene(id, MOTION); }
  await p.run({}, "promote-shot", "s01");
  await p.run({}, "promote-shot", "s02");
  const first = motionOf(p.dir).assertions;
  assert.equal(first.find((a) => a.shot === "s01" && a.kind === "appearsBy").bySec, 11.5);
  p.buildScene("s01", { version: 1, assertions: [{ kind: "staysInFrame", selector: "#b" }] });
  await p.run({}, "stage-shot", "s01");
  await p.run({}, "promote-shot", "s01");
  const second = motionOf(p.dir).assertions;
  assert.deepEqual(second.filter((a) => a.shot === "s01").map((a) => a.selector), ["#b"]);
  assert.equal(second.filter((a) => a.shot === "s02").length, 3, "the other shot's assertions are preserved");
  put(p.dir, "edit/index.motion.json", JSON.stringify({ version: 1, assertions: [{ kind: "staysInFrame", selector: "#main-agent" }, ...second] }));
  await p.run({}, "stage-shot", "s01");
  await p.run({}, "promote-shot", "s01");
  assert.ok(motionOf(p.dir).assertions.some((a) => a.selector === "#main-agent" && a.shot === undefined), "untagged assertions belong to the main agent");
});

test("promote-shot with no assertions writes no motion file (HyperFrames rejects an empty one)", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");
  assert.equal((await p.run({}, "promote-shot", "s01")).exit, 0);
  assert.equal(existsSync(join(p.dir, "edit/index.motion.json")), false);
});

test("HARD-SCENE-LINT: from(), missing timeline, wrong composition id and lint errors are refused with nothing copied", async () => {
  const cases = [
    ["from() tween", (h) => h.replace("fromTo(\"#a\",{opacity:0},{opacity:1,duration:1}", "from(\"#a\",{opacity:0,duration:1}"), /fromTo/],
    ["no timeline", (h) => h.replace("window.__timelines[\"s01\"]=tl;", ""), /__timelines/],
    ["wrong id", (h) => h.replace('data-composition-id="s01"', 'data-composition-id="other"'), /data-composition-id="s01"/],
  ];
  for (const [name, edit, pattern] of cases) {
    const p = await editProject();
    await p.run({}, "stage-shot", "s01");
    p.buildScene("s01");
    const file = join(p.dir, "stage/edit/s01/compositions/s01.html");
    writeFileSync(file, edit(readFileSync(file, "utf8")));
    const r = await p.run({}, "promote-shot", "s01");
    assert.equal(r.exit, 1, name);
    assert.match(r.env.errors.map((e) => e.message).join(" "), pattern, name);
    assert.equal(existsSync(join(p.dir, "edit/compositions/s01.html")), false, name);
    assert.equal(getProject(p.dir).items["edit:s01"], undefined, name);
  }
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");
  const lint = await p.run({ FAKE_NPX_MODE: "lint-error" }, "promote-shot", "s01");
  assert.equal(lint.exit, 1);
  assert.equal(lint.env.errors[0].rule, "HARD-SCENE-LINT");
  const nojson = await p.run({ FAKE_NPX_MODE: "no-json" }, "promote-shot", "s01");
  assert.equal(nojson.exit, 1);
  const warn = await p.run({ FAKE_NPX_MODE: "warn" }, "promote-shot", "s01");
  assert.equal(warn.exit, 0);
  assert.ok(warn.env.advice.some((a) => /studio_missing_editable_id/.test(a.message)));
});

test("HARD-ROOT-MOTION: an invalid shot assertion is refused; a shot with no scene file is refused; a missing npx is BLOCKED", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  assert.match((await p.run({}, "promote-shot", "s01")).env.errors[0].message, /does not exist/);
  p.buildScene("s01", { version: 1, assertions: [{ kind: "appearsBy", selector: "#a" }] });
  const bad = await p.run({}, "promote-shot", "s01");
  assert.equal(bad.exit, 1);
  assert.equal(bad.env.errors[0].rule, "HARD-ROOT-MOTION");
  p.buildScene("s01");
  const { cliWith } = await import("./helpers/fixture.mjs");
  const none = await cliWith(p.cwd, { tools: { npx: ["/nonexistent/npx"] } }, "promote-shot", "s01");
  assert.equal(none.exit, 3);
});

test("DAG-EDIT-RENDER: changing the previz makes edit:s01 stale, and a stale edit item re-opens G6", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");
  await p.run({}, "promote-shot", "s01");
  let s = await cli(p.cwd, "status");
  assert.equal(s.env.data.items.find((i) => i.id === "edit:s01").status, "proposed");
  const g6 = await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit ok");
  assert.equal(g6.exit, 0, JSON.stringify(g6.env.errors));
  assert.notEqual(getProject(p.dir).items.g6.inputs["edit:s01"], "item");
  put(p.dir, "edit/compositions/s01.html", "<template>changed</template>");
  s = await cli(p.cwd, "status");
  assert.equal(s.env.data.items.find((i) => i.id === "edit:s01").status, "stale");
  assert.equal(s.env.data.items.find((i) => i.id === "g6").status, "stale");
});

test("G6 fails closed for legacy edit item inputs and reopens when an edit dependency is rejected", async () => {
  for (const mode of ["legacy", "rejected"]) {
    const p = await editProject();
    await p.run({}, "stage-shot", "s01");
    p.buildScene("s01");
    await p.run({}, "promote-shot", "s01");
    await cli(p.cwd, "gate", "G6", "approve", "--quote", "edit approved");
    setProject(p.dir, (project) => {
      if (mode === "legacy") {
        delete project.items.g6.inputs["item:edit:s01"];
        project.items.g6.inputs["edit:s01"] = "item";
      } else project.items["edit:s01"].status = "rejected";
    });
    const status = await cli(p.cwd, "status");
    assert.equal(status.env.data.gates.G6.state, "reopened", mode);
  }
});

test("shadow-project symlink escape is refused and writes/copies nothing outside or into project", async () => {
  const p = await editProject();
  const outside = mkdtempSync(join(tmpdir(), "imagine-shadow-outside-"));
  mkdirSync(join(p.dir, "stage/edit"), { recursive: true });
  symlinkSync(outside, join(p.dir, "stage/edit/s01"));

  const stageRes = await p.run({}, "stage-shot", "s01");
  assert.equal(stageRes.exit, 1);
  assert.equal(existsSync(join(outside, "SHOT.md")), false);
  assert.equal(existsSync(join(outside, "index.html")), false);

  mkdirSync(join(outside, "compositions"), { recursive: true });
  writeFileSync(join(outside, "compositions/s01.html"), COMPOSITION("s01"));
  const promoteRes = await p.run({}, "promote-shot", "s01");
  assert.equal(promoteRes.exit, 1);
  assert.equal(existsSync(join(p.dir, "edit/compositions/s01.html")), false);
  assert.equal(getProject(p.dir).items["edit:s01"], undefined);
});

test("lint emitting ok:true JSON while exiting nonzero refuses promotion with no copy or project item", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");
  const r = await p.run({ FAKE_NPX_MODE: "lint-ok-exit-nonzero" }, "promote-shot", "s01");
  assert.equal(r.exit, 1);
  assert.equal(existsSync(join(p.dir, "edit/compositions/s01.html")), false);
  assert.equal(getProject(p.dir).items["edit:s01"], undefined);
});

test("timed-out lint refuses promotion with no copy or project item", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");
  const r = await p.run({ FAKE_NPX_MODE: "lint-timeout", IMAGINE_LINT_TIMEOUT_MS: "50", FAKE_NPX_SLEEP_MS: "500" }, "promote-shot", "s01");
  assert.equal(r.exit, 1);
  assert.equal(existsSync(join(p.dir, "edit/compositions/s01.html")), false);
  assert.equal(getProject(p.dir).items["edit:s01"], undefined);
});

test("lint timeout comes only from a positive finite IMAGINE_LINT_TIMEOUT_MS; everything else uses the default", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");
  for (const [label, env] of [
    ["the test-only variable is ignored", { FAKE_NPX_TIMEOUT_MS: "50" }],
    ["empty", { IMAGINE_LINT_TIMEOUT_MS: "" }],
    ["non-numeric", { IMAGINE_LINT_TIMEOUT_MS: "junk" }],
    ["zero", { IMAGINE_LINT_TIMEOUT_MS: "0" }],
    ["negative", { IMAGINE_LINT_TIMEOUT_MS: "-5" }],
    ["Infinity", { IMAGINE_LINT_TIMEOUT_MS: "Infinity" }],
  ]) {
    await p.run({}, "stage-shot", "s01");
    const r = await p.run({ ...env, FAKE_NPX_SLEEP_MS: "500" }, "promote-shot", "s01");
    assert.equal(r.exit, 0, `${label}: ${JSON.stringify(r.env.errors)}`);
    assert.ok(existsSync(join(p.dir, "edit/compositions/s01.html")), label);
  }
});

test("source change during lint re-reads context under lock and refuses promotion of stale state", async () => {
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");
  const r = await p.run({ FAKE_NPX_UNLINK: join(p.dir, "edit/STORYBOARD.md") }, "promote-shot", "s01");
  assert.equal(r.exit, 1);
  assert.equal(existsSync(join(p.dir, "edit/compositions/s01.html")), false);
  assert.equal(getProject(p.dir).items["edit:s01"], undefined);

  const q = await editProject();
  await q.run({}, "stage-shot", "s01");
  q.buildScene("s01");
  const modifiedStory = readFileSync(join(q.dir, "STORY.md"), "utf8").replace("She climbs.", "She walks.");
  const r2 = await q.run({ FAKE_NPX_HOOK_FILE: join(q.dir, "STORY.md"), FAKE_NPX_HOOK_CONTENT: modifiedStory }, "promote-shot", "s01");
  assert.equal(r2.exit, 1);
  assert.match(r2.env.errors[0].message, /gate G4 must be approved|shot:s01.previz is stale/);
  assert.equal(existsSync(join(q.dir, "edit/compositions/s01.html")), false);
  assert.equal(getProject(q.dir).items["edit:s01"], undefined);
});

test("malformed lint JSON or schema (non-array findings, invalid counts, missing or non-boolean ok) is HARD_NOT_RUN", async () => {
  const cases = [
    ["non-array findings", { ok: true, errorCount: 0, warningCount: 0, findings: "not-an-array" }],
    ["missing ok", { errorCount: 0, warningCount: 0, findings: [] }],
    ["non-boolean ok", { ok: "true", errorCount: 0, warningCount: 0, findings: [] }],
    ["negative errorCount", { ok: true, errorCount: -1, warningCount: 0, findings: [] }],
    ["non-integer warningCount", { ok: true, errorCount: 0, warningCount: 1.5, findings: [] }],
    ["string errorCount", { ok: true, errorCount: "0", warningCount: 0, findings: [] }],
    ["null doc", null],
    ["malformed finding item", { ok: true, errorCount: 0, warningCount: 0, findings: ["invalid"] }],
  ];

  for (const [desc, payload] of cases) {
    const p = await editProject();
    await p.run({}, "stage-shot", "s01");
    p.buildScene("s01");
    const r = await p.run({ FAKE_NPX_LINT_JSON: JSON.stringify(payload) }, "promote-shot", "s01");
    assert.equal(r.exit, 1, desc);
    assert.equal(r.env.errors[0]?.rule, "HARD-SCENE-LINT", desc);
    assert.equal(r.env.errors[0]?.code, "HARD_NOT_RUN", desc);
    assert.equal(existsSync(join(p.dir, "edit/compositions/s01.html")), false, desc);
    assert.equal(getProject(p.dir).items["edit:s01"], undefined, desc);
  }
});

test("scene composition or motion change during lint is refused with CONFLICT and nothing copied", async () => {
  // Case A: composition file changed during lint (e.g. replaced with .from() scene)
  const p = await editProject();
  await p.run({}, "stage-shot", "s01");
  p.buildScene("s01");
  const badComp = COMPOSITION("s01").replace('fromTo("#a",{opacity:0},{opacity:1,duration:1}', 'from("#a",{opacity:0,duration:1}');
  const rComp = await p.run({
    FAKE_NPX_HOOK_FILE: join(p.dir, "stage/edit/s01/compositions/s01.html"),
    FAKE_NPX_HOOK_CONTENT: badComp,
  }, "promote-shot", "s01");
  assert.ok(rComp.exit === 1 || rComp.exit === 4, `expected exit 1 or 4, got ${rComp.exit}`);
  assert.ok(["CONFLICT", "HARD"].includes(rComp.env.code), `expected CONFLICT or HARD, got ${rComp.env.code}`);
  assert.equal(rComp.env.errors[0]?.rule, "HARD-SCENE-LINT");
  assert.equal(existsSync(join(p.dir, "edit/compositions/s01.html")), false, "composition must not be copied");
  assert.equal(getProject(p.dir).items["edit:s01"], undefined, "edit:s01 must not be recorded");

  // Case B: motion file changed during lint
  const q = await editProject();
  await q.run({}, "stage-shot", "s01");
  q.buildScene("s01", MOTION);
  const modifiedMotion = JSON.stringify({ version: 1, assertions: [{ kind: "appearsBy", selector: "#b", bySec: 3 }] });
  const rMotion = await q.run({
    FAKE_NPX_HOOK_FILE: join(q.dir, "stage/edit/s01/index.motion.json"),
    FAKE_NPX_HOOK_CONTENT: modifiedMotion,
  }, "promote-shot", "s01");
  assert.ok(rMotion.exit === 1 || rMotion.exit === 4, `expected exit 1 or 4, got ${rMotion.exit}`);
  assert.ok(["CONFLICT", "HARD"].includes(rMotion.env.code), `expected CONFLICT or HARD, got ${rMotion.env.code}`);
  assert.equal(rMotion.env.errors[0]?.rule, "HARD-ROOT-MOTION");
  assert.equal(existsSync(join(q.dir, "edit/compositions/s01.html")), false, "composition must not be copied");
  assert.equal(getProject(q.dir).items["edit:s01"], undefined, "edit:s01 must not be recorded");
});
