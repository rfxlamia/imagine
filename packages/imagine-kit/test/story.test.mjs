import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseValue, normalizeValue } from "../src/story/keys.mjs";
import { parseStory } from "../src/story/parse.mjs";
import { renderStory } from "../src/story/render.mjs";
import { blockHash } from "../src/story/block.mjs";
import { checkStoryIntegrity, commitStory, historyPath } from "../src/story/commit.mjs";
import { makeProject, shot } from "./helpers/fixture.mjs";

const SAMPLE = [
  "---", "imagine_rev: 2", "---", "",
  "## Scene s01 — The stairs",
  "- scene: Mara climbs",
  "- duration_est: 4.5s",
  "- voiceover: [L01, L02@1.2]",
  "- characters: [mara]",
  "- camera: push-in 1.00-1.08",
  "", "She climbs every night.", "",
  "## Scene s02 — The lamp",
  "- duration_est: 3s",
  ""].join("\n");

test("parseStory: frontmatter, shots, keys and narrative", () => {
  const s = parseStory(SAMPLE);
  assert.deepEqual(s.errors, []);
  assert.equal(s.front.imagine_rev, 2);
  assert.deepEqual(s.shots.map((x) => x.id), ["s01", "s02"]);
  assert.equal(s.shots[0].title, "The stairs");
  assert.equal(s.shots[0].keys.duration_est, "4.5s");
  assert.equal(s.shots[0].narrative, "She climbs every night.");
  assert.equal(s.shots[1].narrative, "");
});

test("renderStory is the inverse of parseStory for canonical text", () => {
  assert.equal(renderStory(parseStory(SAMPLE)), SAMPLE);
  assert.equal(renderStory({ front: { imagine_rev: 0 }, shots: [] }), "---\nimagine_rev: 0\n---\n");
});

test("HARD-STORY-IDS: only 'Scene sNN — Title' headings are accepted", () => {
  for (const heading of ["## Shot s01 — X", "## Scene s1 — X", "## Scene s01 - X", "### Frame 1 — X", "# Title"]) {
    const s = parseStory(`---\nimagine_rev: 0\n---\n\n${heading}\n- scene: a\n`);
    assert.ok(s.errors.length > 0, heading);
  }
});

test("parseStory: structure errors", () => {
  const front = "---\nimagine_rev: 0\n---\n";
  const cases = {
    "no frontmatter": "## Scene s01 — A\n",
    "bad revision": "---\nimagine_rev: x\n---\n",
    "unknown key": `${front}\n## Scene s01 — A\n- colour: red\n`,
    "duplicate key": `${front}\n## Scene s01 — A\n- scene: a\n- scene: b\n`,
    "id bullet": `${front}\n## Scene s01 — A\n- id: s01\n`,
    "content before heading": `${front}\nhello\n## Scene s01 — A\n`,
    "empty value": `${front}\n## Scene s01 — A\n- scene: \n`,
  };
  for (const [name, text] of Object.entries(cases)) assert.ok(parseStory(text).errors.length > 0, name);
});

test("parseValue: typed keys", () => {
  assert.deepEqual(parseValue("duration_est", "4.5s"), { value: 4.5 });
  assert.ok(parseValue("duration_est", "4.5").error);
  assert.deepEqual(parseValue("voiceover", "[L01, L02@1.2, T03]").value,
    [{ unit: "L01", offset: 0 }, { unit: "L02", offset: 1.2 }, { unit: "T03", offset: 0 }]);
  assert.ok(parseValue("voiceover", "[L1]").error);
  assert.ok(parseValue("voiceover", "L01").error);
  assert.deepEqual(parseValue("characters", "[]").value, []);
  assert.deepEqual(parseValue("beats", "[0.5s, 1s]").value, [0.5, 1]);
  assert.deepEqual(parseValue("assets", "[bg:img:1672x941, mara:ref:600x900, line1:vo]").value,
    [{ id: "bg", kind: "img", w: 1672, h: 941 }, { id: "mara", kind: "ref", w: 600, h: 900 }, { id: "line1", kind: "vo" }]);
  assert.ok(parseValue("assets", "[bg:img]").error);
  const fx = parseValue("fx", "[fog=registry:fractal-noise;fallback=static-plate;range=0-5.2, grain=media-treatment:film-grain]");
  assert.deepEqual(fx.value[0], { id: "fog", tool: "registry", name: "fractal-noise", fallback: "static-plate", range: "0-5.2" });
  assert.ok(parseValue("fx", "[fog]").error);
  assert.ok(parseValue("status", "wip").error);
  assert.deepEqual(parseValue("location", "lighthouse"), { value: "lighthouse" });
});

test("normalizeValue: patch values become canonical single-line text", () => {
  assert.equal(normalizeValue("duration", 5.2).raw, "5.2s");
  assert.equal(normalizeValue("voiceover", ["L01", "L02@1.2"]).raw, "[L01, L02@1.2]");
  assert.equal(normalizeValue("beats", [0.5, 1]).raw, "[0.5s, 1s]");
  assert.equal(normalizeValue("fx", [{ id: "fog", tool: "registry:fractal-noise", fallback: "static-plate" }]).raw,
    "[fog=registry:fractal-noise;fallback=static-plate]");
  assert.equal(normalizeValue("camera", "  push-in  ").raw, "push-in");
  for (const bad of ["a\nb", "", true, { a: 1 }]) assert.ok(normalizeValue("camera", bad).error, String(bad));
});

test("HARD-STORY-IDS: a narrative that looks like a bullet or a frontmatter fence does not change the structure", () => {
  const text = renderStory({ front: { imagine_rev: 1 }, shots: [shot("s01", {}, "T", "- scene: evil\n---\nplain")] });
  const s = parseStory(text);
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.shots[0].keys, {});
  assert.equal(s.shots[0].narrative, "- scene: evil\n---\nplain");
});

test("blockHash: stage blocks are independent; the storyboard block includes title and narrative", () => {
  const a = shot("s01", { scene: "x", camera: "c1" }, "T", "N");
  const sb = blockHash(a, "storyboard");
  const pv = blockHash(a, "previz");
  assert.notEqual(blockHash({ ...a, narrative: "M" }, "storyboard"), sb);
  assert.notEqual(blockHash({ ...a, title: "U" }, "storyboard"), sb);
  assert.equal(blockHash({ ...a, keys: { ...a.keys, camera: "c2" } }, "storyboard"), sb);
  assert.notEqual(blockHash({ ...a, keys: { ...a.keys, camera: "c2" } }, "previz"), pv);
  assert.equal(blockHash(a, "fx"), blockHash({ ...a, narrative: "other" }, "fx"));
});

test("HARD-STORY-WRITERS: integrity holds after commitStory and fails after a manual edit", async () => {
  const { dir } = await makeProject();
  assert.equal(checkStoryIntegrity(dir).ok, true);
  const parsed = parseStory(SAMPLE);
  commitStory({ dir, front: { imagine_rev: 1 }, shots: parsed.shots });
  const ok = checkStoryIntegrity(dir);
  assert.equal(ok.ok, true);
  assert.equal(ok.rev, 1);
  assert.equal(existsSync(historyPath(dir, 1)), true);
  appendFileSync(join(dir, "STORY.md"), "tampered\n");
  const bad = checkStoryIntegrity(dir);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /patch apply/);
});

test("PROC-ATOMIC-COMMIT: a failure before the STORY.md rename keeps the old file; between() runs first", async () => {
  const { dir } = await makeProject();
  const before = readFileSync(join(dir, "STORY.md"), "utf8");
  const order = [];
  const parsed = parseStory(SAMPLE);
  assert.throws(() => commitStory({ dir, front: { imagine_rev: 1 }, shots: parsed.shots,
    between: () => order.push("between"), hooks: { beforeStoryRename: () => { order.push("rename"); throw new Error("crash"); } } }), /crash/);
  assert.deepEqual(order, ["between", "rename"]);
  assert.equal(readFileSync(join(dir, "STORY.md"), "utf8"), before);
  assert.equal(checkStoryIntegrity(dir).ok, true);
  commitStory({ dir, front: { imagine_rev: 1 }, shots: parsed.shots });
  assert.equal(checkStoryIntegrity(dir).rev, 1);
});
