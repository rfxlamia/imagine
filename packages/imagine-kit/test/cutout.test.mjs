import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodePng, encodeRgbaPng } from "./helpers/png.mjs";
import { hasFfmpeg } from "./helpers/media.mjs";
import { pngInfo } from "../src/media.mjs";
import { cropCell, isBlankImage, readRgba, writeReviewComposite } from "../src/img/cutout.mjs";

const t = hasFfmpeg ? test : test.skip;
const ctx = { env: process.env };

t("crop with rgba keeps every alpha value, including semi-transparent edges", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cutout-"));
  const w = 40, h = 20;
  const src = join(dir, "sheet.png");
  writeFileSync(src, encodeRgbaPng(w, h, (x, y) => [x * 5, y * 10, 99, x * 6]));
  const cell = join(dir, "cell.png");
  await cropCell(ctx, src, cell, { x: 10, y: 0, cw: 20, ch: 20, rgba: true });
  const px = await readRgba(ctx, cell, 20, 20);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    assert.equal(px[(y * 20 + x) * 4 + 3], (x + 10) * 6, `alpha at ${x},${y}`);
  }
});

t("cropCell with rgba:false uses exactly the legacy ffmpeg argv", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cutout-"));
  const log = join(dir, "argv.json");
  const wrapper = join(dir, "ffmpeg.mjs");
  writeFileSync(wrapper, `import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));
process.exit(spawnSync("ffmpeg", process.argv.slice(2), { stdio: "inherit" }).status ?? 1);
`);
  const src = join(dir, "sheet.png");
  writeFileSync(src, encodePng(40, 20));
  const cell = join(dir, "cell.png");
  await cropCell({ tools: { ffmpeg: [process.execPath, wrapper] }, env: process.env }, src, cell, { x: 5, y: 0, cw: 10, ch: 10, rgba: false });
  assert.deepEqual(JSON.parse(readFileSync(log, "utf8")), ["-v", "error", "-y", "-i", src, "-vf", "crop=10:10:5:0", cell]);
});

t("isBlankImage is alpha-aware", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cutout-"));
  const mk = (name, pixel) => { const f = join(dir, name); writeFileSync(f, encodeRgbaPng(64, 64, pixel)); return f; };
  const fig = (x, y) => x > 20 && x < 44 && y > 12 && y < 52;
  assert.equal(await isBlankImage(ctx, mk("black-figure.png", (x, y) => [0, 0, 0, fig(x, y) ? 252 : 0])), false, "black figure on clear");
  assert.equal(await isBlankImage(ctx, mk("clear.png", () => [0, 0, 0, 0])), true, "fully transparent");
  assert.equal(await isBlankImage(ctx, mk("flat.png", () => [200, 200, 200, 255])), true, "flat opaque");
  assert.equal(await isBlankImage(ctx, mk("busy.png", (x, y) => [x * 4, y * 4, 9, 255])), false, "busy opaque");
});

t("review composite is twice as wide as the cell", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cutout-"));
  const w = 30, h = 20;
  const cut = join(dir, "cut.png");
  const raw = join(dir, "raw.png");
  writeFileSync(cut, encodeRgbaPng(w, h, (x) => [10, 200, 10, x < 15 ? 255 : 0]));
  writeFileSync(raw, encodeRgbaPng(w, h, () => [255, 255, 255, 255]));
  const out = join(dir, "review.png");
  await writeReviewComposite(ctx, cut, raw, out, { w, h });
  assert.deepEqual(pngInfo(readFileSync(out)), { w: 60, h: 20 });
});
