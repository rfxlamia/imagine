import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintProject } from "../src/edit/composition.mjs";
import { probeMedia } from "../src/media.mjs";
import { HF_ENV, HYPERFRAMES, runTool } from "../src/tools.mjs";

// The fakes in the other tests mimic hyperframes; this one runs the pinned CLI for real (network on first use).
// Skipped unless IMAGINE_LIVE=1.
const live = process.env.IMAGINE_LIVE === "1" ? test : test.skip;

live("live: the pinned hyperframes lints a fresh portrait project and renders a draft at 1080x1920, 30 fps", async () => {
  const root = mkdtempSync(join(tmpdir(), "imagine-hf-live-"));
  const ctx = { env: process.env };
  const init = await runTool(ctx, "npx", ["--yes", HYPERFRAMES, "init", "edit", "--non-interactive", "--skip-skills", "--skip-transcribe", "--resolution", "portrait"], { cwd: root, env: HF_ENV, timeoutMs: 300000 });
  assert.equal(init.status, 0, init.stderr.slice(-400));
  const dir = join(root, "edit");
  assert.ok(existsSync(join(dir, "hyperframes.json")), "init writes hyperframes.json");

  const lint = await lintProject(ctx, dir);
  assert.deepEqual(lint.errors, [], JSON.stringify(lint.errors));

  const out = join(root, "draft.mp4");
  const render = await runTool(ctx, "npx", ["--yes", HYPERFRAMES, "render", dir, "-o", out, "--fps", "30", "--quality", "draft", "--no-best-effort"], { cwd: root, env: HF_ENV, timeoutMs: 900000 });
  assert.equal(render.status, 0, render.stderr.slice(-400));
  const info = await probeMedia(ctx, out);
  assert.equal(info.w, 1080);
  assert.equal(info.h, 1920);
  assert.ok(Math.abs(info.fps - 30) < 0.01, `fps ${info.fps}`);
});
