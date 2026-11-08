import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256File } from "../src/hash.mjs";
import { commitAssets } from "../src/img/commit.mjs";
import { getManifest, makeProject, put } from "./helpers/fixture.mjs";

const ctx = { now: () => new Date("2026-11-01T10:00:00Z") };
const entry = (id, v) => ({ id, kind: "img", v, path: `assets/img/${id}.v${v}.png`, status: "pending", sha256: "0".repeat(64) });

// Concurrent commands in imagine-kit encounter LOCKED if another command holds the project lock,
// retrying until the other command finishes its short critical section.
async function commitWithRetry(dir, args) {
  while (true) {
    try {
      return await commitAssets(ctx, dir, args);
    } catch (e) {
      if (e.code === "LOCKED") {
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      throw e;
    }
  }
}

test("two concurrent commitAssets calls for same id/v keep the winner's composite and skip the loser's composite", async () => {
  const p = await makeProject();
  const id = "hero";
  const v = 1;
  const rel = `assets/img/${id}.v${v}.png`;
  const compRel = `assets/composites/${id}.v${v}.png`;

  put(p.dir, "tmp/a-img.png", "image-bytes-A");
  put(p.dir, "tmp/a-comp.png", "composite-bytes-A");
  put(p.dir, "tmp/b-img.png", "image-bytes-B");
  put(p.dir, "tmp/b-comp.png", "composite-bytes-B");

  const srcAImg = join(p.dir, "tmp/a-img.png");
  const srcAComp = join(p.dir, "tmp/a-comp.png");
  const srcBImg = join(p.dir, "tmp/b-img.png");
  const srcBComp = join(p.dir, "tmp/b-comp.png");

  const entryA = entry(id, v);
  const entryB = entry(id, v);

  const [resA, resB] = await Promise.all([
    commitWithRetry(p.dir, {
      items: [{ entry: entryA, source: srcAImg }],
      extraFiles: [{ source: srcAComp, rel: compRel, for: `${id}.v${v}` }],
      summary: { command: "img", text: "commit A" },
    }),
    commitWithRetry(p.dir, {
      items: [{ entry: entryB, source: srcBImg }],
      extraFiles: [{ source: srcBComp, rel: compRel, for: `${id}.v${v}` }],
      summary: { command: "img", text: "commit B" },
    }),
  ]);

  const aWon = resA.entries[0].sha256 === sha256File(srcAImg) &&
    resB.entries[0].sha256 === sha256File(srcAImg) &&
    entryB.sha256 === "0".repeat(64);
  const bWon = resB.entries[0].sha256 === sha256File(srcBImg) &&
    resA.entries[0].sha256 === sha256File(srcBImg) &&
    entryA.sha256 === "0".repeat(64);

  assert.equal(aWon || bWon, true, "exactly one runner won and one was kept");
  assert.notEqual(aWon, bWon);

  const expectedImgBytes = aWon ? "image-bytes-A" : "image-bytes-B";
  const expectedCompBytes = aWon ? "composite-bytes-A" : "composite-bytes-B";
  const expectedSha256 = aWon ? sha256File(srcAImg) : sha256File(srcBImg);

  const diskImg = readFileSync(join(p.dir, rel), "utf8");
  const diskComp = readFileSync(join(p.dir, compRel), "utf8");
  const manifestAssets = getManifest(p.dir).assets;

  assert.equal(manifestAssets.length, 1);
  assert.equal(manifestAssets[0].sha256, expectedSha256);
  assert.equal(diskImg, expectedImgBytes);
  // Before the fix, the loser's composite overwrites the winner's composite:
  assert.equal(diskComp, expectedCompBytes);
});

test("version 2 of the same id still gets its own composite written", async () => {
  const p = await makeProject();
  const id = "hero";

  put(p.dir, "tmp/v1-img.png", "img-v1");
  put(p.dir, "tmp/v1-comp.png", "comp-v1");
  put(p.dir, "tmp/v2-img.png", "img-v2");
  put(p.dir, "tmp/v2-comp.png", "comp-v2");

  await commitAssets(ctx, p.dir, {
    items: [{ entry: entry(id, 1), source: join(p.dir, "tmp/v1-img.png") }],
    extraFiles: [{ source: join(p.dir, "tmp/v1-comp.png"), rel: `assets/composites/${id}.v1.png`, for: `${id}.v1` }],
    summary: { command: "img", text: "commit v1" },
  });

  const res2 = await commitAssets(ctx, p.dir, {
    items: [{ entry: entry(id, 2), source: join(p.dir, "tmp/v2-img.png") }],
    extraFiles: [{ source: join(p.dir, "tmp/v2-comp.png"), rel: `assets/composites/${id}.v2.png`, for: `${id}.v2` }],
    summary: { command: "img", text: "commit v2" },
  });

  assert.equal(res2.entries[0].v, 2);
  assert.equal(existsSync(join(p.dir, `assets/composites/${id}.v2.png`)), true);
  assert.equal(readFileSync(join(p.dir, `assets/composites/${id}.v2.png`), "utf8"), "comp-v2");
  assert.equal(readFileSync(join(p.dir, `assets/composites/${id}.v1.png`), "utf8"), "comp-v1");
});

test("an extra without for is still written even when a version is kept or existing", async () => {
  const p = await makeProject();
  const id = "hero";

  put(p.dir, "tmp/v1-img.png", "img-v1");
  put(p.dir, "tmp/sheet-1.png", "sheet-bytes-1");
  put(p.dir, "tmp/v1-img-again.png", "img-v1-again");
  put(p.dir, "tmp/sheet-2.png", "sheet-bytes-2");

  await commitAssets(ctx, p.dir, {
    items: [{ entry: entry(id, 1), source: join(p.dir, "tmp/v1-img.png") }],
    extraFiles: [{ source: join(p.dir, "tmp/sheet-1.png"), rel: "assets/sheets/group.sheet1.png" }],
    summary: { command: "img", text: "commit v1" },
  });

  assert.equal(readFileSync(join(p.dir, "assets/sheets/group.sheet1.png"), "utf8"), "sheet-bytes-1");

  put(p.dir, "tmp/bad-comp.png", "bad-composite");
  await commitAssets(ctx, p.dir, {
    items: [{ entry: entry(id, 1), source: join(p.dir, "tmp/v1-img-again.png") }],
    extraFiles: [
      { source: join(p.dir, "tmp/sheet-2.png"), rel: "assets/sheets/group.sheet2.png" },
      { source: join(p.dir, "tmp/bad-comp.png"), rel: `assets/composites/${id}.v1.png`, for: `${id}.v1` },
    ],
    summary: { command: "img", text: "commit duplicate v1" },
  });

  assert.equal(existsSync(join(p.dir, "assets/sheets/group.sheet2.png")), true);
  assert.equal(readFileSync(join(p.dir, "assets/sheets/group.sheet2.png"), "utf8"), "sheet-bytes-2");
  assert.equal(existsSync(join(p.dir, `assets/composites/${id}.v1.png`)), false);
});
