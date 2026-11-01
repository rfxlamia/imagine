import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { approveThrough, cliWith, makeProject, put, seedCanon } from "./fixture.mjs";

export const FAKE_UV = fileURLToPath(new URL("../fakes/uv.mjs", import.meta.url));
export const NARRATOR = "narrator:\n  voice:\n    engine: pocket-tts\n    model: english\n    source: builtin:george\n    seed_base: 1300\n";

// A narrated project whose bible casts the narrator and whose G2 is approved.
export async function ttsProject({ upTo = "G2", edit = (t) => t } = {}) {
  const p = await makeProject();
  seedCanon(p.dir);
  appendFileSync(join(p.dir, "bible.yaml"), NARRATOR);
  put(p.dir, "script/narration.md", edit(readFileSync(join(p.dir, "script/narration.md"), "utf8")));
  await approveThrough(p.cwd, upTo);
  const home = mkdtempSync(join(tmpdir(), "imagine-uv-"));
  const log = join(home, "uv.jsonl");
  const run = (env, ...args) => cliWith(p.cwd, { tools: { uv: [process.execPath, FAKE_UV] }, env: { ...process.env, FAKE_UV_LOG: log, ...env } }, ...args);
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { ...p, run, calls, writeFileSync };
}
