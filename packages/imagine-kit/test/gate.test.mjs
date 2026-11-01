import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../src/hash.mjs";
import { approveThrough, cli, getProject, makeProject, seedCanon, seedMinimalStory, snapshot } from "./helpers/fixture.mjs";

const ready = async (opts) => { const p = await makeProject(opts); seedCanon(p.dir, { copy: opts?.mode && opts.mode !== "narrated" }); return p; };
const sha = (dir, f) => sha256(readFileSync(join(dir, f)));

test("GATE-QUOTE: a missing, empty, blank or invisible-only quote is NEEDS_USER and writes nothing", async () => {
  const { cwd, dir } = await ready();
  const before = [sha(dir, "project.yaml"), sha(dir, "journal.md")];
  for (const args of [[], ["--quote", ""], ["--quote", "   "], ["--quote", "\u200b\u200d"]]) {
    const r = await cli(cwd, "gate", "G0", "approve", ...args);
    assert.equal(r.exit, 7);
    assert.equal(r.env.ok, false);
    assert.equal(r.env.code, "NEEDS_USER");
  }
  assert.deepEqual([sha(dir, "project.yaml"), sha(dir, "journal.md")], before);
});

test("GATE-QUOTE: G0 approve stores the verbatim quote, inputs and a journal entry", async () => {
  const { cwd, dir } = await ready();
  const quote = "Ya, portrait 12-15 detik, setuju.";
  const r = await cli(cwd, "gate", "G0", "approve", "--quote", quote, "--note", "locked");
  assert.equal(r.exit, 0);
  assert.equal(r.env.journal_id, "j-000002");
  assert.deepEqual(r.env.data.items, [{ id: "g0", status: "approved" }]);
  const p = getProject(dir);
  assert.equal(p.g0.status, "approved");
  assert.equal(p.items.g0.decision.quote, quote);
  assert.equal(p.items.g0.decision.note, "locked");
  assert.ok(p.items.g0.inputs["g0:format"] && p.items.g0.inputs["g0:duration_s"]);
  assert.ok(readFileSync(join(dir, "journal.md"), "utf8").includes(JSON.stringify(quote)));
  const s = await cli(cwd, "status");
  assert.equal(s.env.data.gates.G0.state, "approved");
  assert.equal(s.env.data.stage, "G1");
});

test("PROC-LOCK-HASHED-WRITES: a held project lock makes gate fail fast with LOCKED and write nothing", async () => {
  const { cwd, dir } = await ready();
  mkdirSync(join(dir, ".lock"));
  const before = sha(dir, "project.yaml");
  const r = await cli(cwd, "gate", "G0", "approve", "--quote", "ok");
  assert.equal(r.exit, 5);
  assert.equal(r.env.code, "LOCKED");
  assert.equal(sha(dir, "project.yaml"), before);
  rmSync(join(dir, ".lock"), { recursive: true });
  assert.equal((await cli(cwd, "gate", "G0", "approve", "--quote", "ok")).exit, 0);
});

test("HARD-GATES-RECORDED: prerequisites are transitive; an upstream gate that was re-opened blocks later gates", async () => {
  const { cwd, dir } = await ready();
  await approveThrough(cwd, "G3");
  writeFileSync(join(dir, "bible.yaml"), readFileSync(join(dir, "bible.yaml"), "utf8").replace("grey braid", "red braid"));
  const r = await cli(cwd, "gate", "G4", "approve", "--quote", "ok");
  assert.equal(r.exit, 1);
  assert.ok(r.env.errors.some((e) => e.rule === "HARD-GATES-RECORDED" && e.item === "G2"));
});

test("DAG-STALE-VS-REVIEW: G4 approve surfaces changed watch sources as advice without blocking", async () => {
  const { cwd, dir } = await ready();
  await approveThrough(cwd, "G3");
  await snapshot(dir, "shot:s01.storyboard", [], { status: "proposed", watch: ["bible:world"] });
  writeFileSync(join(dir, "bible.yaml"), readFileSync(join(dir, "bible.yaml"), "utf8").replace("1950s", "1960s"));
  assert.equal((await cli(cwd, "gate", "G2", "approve", "--scope", "world", "--quote", "world changed, fine")).exit, 0);
  await seedMinimalStory(dir);
  const r = await cli(cwd, "gate", "G4", "approve", "--quote", "plan ok");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  assert.ok(r.env.advice.some((a) => a.rule === "DAG-STALE-VS-REVIEW" && a.item === "shot:s01.storyboard"));
});

test("quotes that start with a dash use the --quote=<text> form", async () => {
  const { cwd, dir } = await ready();
  const r = await cli(cwd, "gate", "G0", "approve", "--quote=-ya, lanjut");
  assert.equal(r.exit, 0);
  assert.equal(getProject(dir).items.g0.decision.quote, "-ya, lanjut");
});

test("HARD-GATES-RECORDED: prerequisites must be approved and fresh", async () => {
  const { cwd, dir } = await ready();
  const before = sha(dir, "project.yaml");
  const early = await cli(cwd, "gate", "G1", "approve", "--quote", "ok");
  assert.equal(early.exit, 1);
  assert.equal(early.env.errors[0].rule, "HARD-GATES-RECORDED");
  assert.equal(sha(dir, "project.yaml"), before);
  await approveThrough(cwd, "G1");
  writeFileSync(join(dir, "script", "narration.md"), readFileSync(join(dir, "script", "narration.md"), "utf8").replace("quiet", "calm"));
  const reopened = await cli(cwd, "gate", "G2", "approve", "--quote", "ok");
  assert.equal(reopened.exit, 1);
  assert.match(reopened.env.errors[0].message, /reopened/);
});

test("GATE-PER-ITEM: scope approves only the named items; an edit re-opens only that item", async () => {
  const { cwd, dir } = await ready();
  await approveThrough(cwd, "G0");
  const one = await cli(cwd, "gate", "G1", "approve", "--scope", "L01", "--quote", "L01 ok");
  assert.deepEqual(one.env.data.items, [{ id: "unit:L01", status: "approved" }]);
  let s = await cli(cwd, "status");
  assert.equal(s.env.data.gates.G1.state, "open");
  const rest = await cli(cwd, "gate", "G1", "approve", "--scope", "L02,unit:L03", "--quote", "rest ok");
  assert.equal(rest.exit, 0);
  s = await cli(cwd, "status");
  assert.equal(s.env.data.gates.G1.state, "approved");
  writeFileSync(join(dir, "script", "narration.md"), readFileSync(join(dir, "script", "narration.md"), "utf8").replace("quiet", "calm"));
  s = await cli(cwd, "status");
  const by = Object.fromEntries(s.env.data.gates.G1.items.map((i) => [i.id, i.status]));
  assert.deepEqual(by, { "unit:L01": "approved", "unit:L02": "stale", "unit:L03": "approved" });
  assert.equal(s.env.data.gates.G1.state, "reopened");
});

test("reject records the decision; G0 reject keeps g0 pending", async () => {
  const { cwd, dir } = await ready();
  const r = await cli(cwd, "gate", "G0", "reject", "--quote", "no, landscape please");
  assert.equal(r.exit, 0);
  const p = getProject(dir);
  assert.equal(p.items.g0.status, "rejected");
  assert.equal(p.g0.status, "pending");
  assert.equal((await cli(cwd, "status")).env.data.stage, "G0");
  assert.equal((await cli(cwd, "gate", "G0", "approve", "--quote", "ok now")).exit, 0);
});

test("gate: usage errors", async () => {
  const { cwd } = await ready();
  await approveThrough(cwd, "G0");
  for (const args of [["G9", "approve"], ["G0", "maybe"], ["G0"], ["G1", "approve", "--scope", "L99"]]) {
    assert.equal((await cli(cwd, "gate", ...args, "--quote", "q")).exit, 2, args.join(" "));
  }
  const bare = await makeProject();
  await approveThrough(bare.cwd, "G0");
  assert.equal((await cli(bare.cwd, "gate", "G1", "approve", "--quote", "q")).exit, 2);
});

test("HARD-NON-WAIVABLE: gate has no waiver option", async () => {
  const { cwd, dir } = await ready();
  const r = await cli(cwd, "gate", "G0", "approve", "--quote", "q", "--waive");
  assert.equal(r.exit, 2);
  assert.equal(getProject(dir).items.g0, undefined);
});

test("gates G2-G4 enumerate the documented items and G4 records the story hash", async () => {
  const { cwd, dir } = await ready();
  await approveThrough(cwd, "G4");
  const s = await cli(cwd, "status");
  assert.deepEqual(s.env.data.gates.G2.items.map((i) => i.id), ["bible:characters.mara", "bible:locations.lighthouse", "bible:world", "bible:pronunciation"]);
  assert.deepEqual(s.env.data.gates.G3.items.map((i) => i.id).sort(), ["style:camera", "style:motion", "style:output", "style:texture"]);
  assert.ok(getProject(dir).items.g4.inputs["story:sha"]);
  assert.equal(s.env.data.stage, "G6");   // G5r, G5a and G5b are empty, which satisfies them
});

test("G5a with intentional silence and no audio assets is the g5a item", async () => {
  const { cwd, dir } = await ready({ mode: "text-led", extra: ["--silence", "intentional"] });
  await approveThrough(cwd, "G4");
  const r = await cli(cwd, "gate", "G5a", "approve", "--quote", "silent on purpose");
  assert.deepEqual(r.env.data.items, [{ id: "g5a", status: "approved" }]);
  assert.ok(getProject(dir).items.g5a.inputs["g0:silence"]);
});
