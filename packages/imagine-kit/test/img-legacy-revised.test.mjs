import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli, getManifest } from "./helpers/fixture.mjs";
import { imgProject, sheetProject, ROOSTER_PLAN } from "./helpers/img.mjs";
import { hasFfmpeg } from "./helpers/media.mjs";
import * as adapter from "../src/img/adapter.mjs";

const t = hasFfmpeg ? test : test.skip;

const generateAndApproveRef = async (p, refId = "rooster-ref") => {
  const gen = await p.run({}, "img", "--ref", refId);
  assert.equal(gen.exit, 0, JSON.stringify(gen.env.errors));
  assert.equal((await cli(p.cwd, "gate", "G5r", "approve", "--quote", "refs ok")).exit, 0);
};

function rig() {
  const home = mkdtempSync(join(tmpdir(), "codex-home-"));
  const sid = "01a17000-0000-4000-8000-000000000001";
  const out = join(home, "out.png");
  writeFileSync(out, "AAAA-image-bytes");
  mkdirSync(join(home, "generated_images", sid), { recursive: true });
  const saved = (name, bytes) => {
    const p = join(home, "generated_images", sid, name);
    writeFileSync(p, bytes);
    return p;
  };
  const log = (items) => {
    const d = join(home, "sessions", "2026", "11", "01");
    mkdirSync(d, { recursive: true });
    writeFileSync(
      join(d, `rollout-2026-11-01T10-00-00-${sid}.jsonl`),
      items.map((item) => JSON.stringify({ type: "event_msg", payload: { item: { kind: "image_gen.generation", ...item } } })).join("\n") + "\n",
    );
  };
  return { ctx: { env: { CODEX_HOME: home } }, stdout: `session id: ${sid}\n`, out, saved, log, home };
}

t("opaque single image with FAKE_CODEX_NO_SAVED=1: manifest entry still has revised_prompt starting with REVISED:", async () => {
  const p = await imgProject();
  const r = await p.run({ FAKE_CODEX_SIZE: "1024x1536", FAKE_CODEX_NO_SAVED: "1" }, "img", "--ref", "mara-ref");
  assert.equal(r.exit, 0, JSON.stringify(r.env?.errors));
  const entry = getManifest(p.dir).assets.find((x) => x.id === "mara-ref");
  assert.ok(entry, "mara-ref entry exists in manifest");
  assert.ok(entry.revised_prompt, "entry has revised_prompt");
  assert.match(entry.revised_prompt, /^REVISED:/);
});

t("legacy pose sheet with FAKE_CODEX_NO_SAVED=1: each committed entry has revised_prompt", async () => {
  const p = await sheetProject();
  await generateAndApproveRef(p);

  const r = await p.run({ FAKE_CODEX_SIZE: "1200x1200", FAKE_CODEX_NO_SAVED: "1" }, "img", "--batch", "rooster-stand");
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  const entries = getManifest(p.dir).assets.filter((a) => a.kind === "img" && a.sheet);
  assert.ok(entries.length > 0, "has committed sheet entries");
  for (const entry of entries) {
    assert.ok(entry.revised_prompt, `entry ${entry.id} has revised_prompt`);
    assert.match(entry.revised_prompt, /^REVISED:/);
  }
});

test("adapter unit test: lastRevisedPrompt returns the last item's revisedPrompt even when its savedPath file differs from any out.png, and null when the log is missing", () => {
  assert.equal(typeof adapter.lastRevisedPrompt, "function", "lastRevisedPrompt is exported");
  const r = rig();
  const a = r.saved("a.png", "DIFFERENT-BYTES-1");
  const b = r.saved("b.png", "DIFFERENT-BYTES-2");
  r.log([
    { revisedPrompt: "FIRST", savedPath: a },
    { revisedPrompt: "SECOND_REVISED", savedPath: b },
  ]);
  assert.equal(adapter.lastRevisedPrompt(r.ctx, r.stdout), "SECOND_REVISED");

  const emptyHome = mkdtempSync(join(tmpdir(), "codex-empty-"));
  const emptyCtx = { env: { CODEX_HOME: emptyHome } };
  assert.equal(adapter.lastRevisedPrompt(emptyCtx, r.stdout), null);
  assert.equal(adapter.lastRevisedPrompt(r.ctx, "no session id"), null);
});

t("transparent sheet with FAKE_CODEX_NO_SAVED=1: entry has NO revised_prompt and transparent_flag === null", async () => {
  const plan = {
    assets: ROOSTER_PLAN.assets.map((a) => (a.sheet ? { ...a, background: "transparent" } : a)),
  };
  const p = await sheetProject(plan);
  await generateAndApproveRef(p);

  const r = await p.run(
    { FAKE_CODEX_MODES: "native", FAKE_CODEX_SIZE: "1200x1200", FAKE_CODEX_NO_SAVED: "1" },
    "img",
    "--batch",
    "rooster-stand",
  );
  assert.equal(r.exit, 0, JSON.stringify(r.env.errors));
  const entries = getManifest(p.dir).assets.filter((a) => a.kind === "img" && a.sheet);
  assert.ok(entries.length > 0, "has committed sheet entries");
  for (const entry of entries) {
    assert.equal(entry.revised_prompt, undefined, `entry ${entry.id} has NO revised_prompt`);
    assert.equal(entry.transparent_flag, null, `entry ${entry.id} has transparent_flag === null`);
  }
});
