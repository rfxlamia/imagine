import { fileURLToPath } from "node:url";
import { KitError } from "../errors.mjs";
import { POCKET_TTS, ensureTool, runTool } from "../tools.mjs";

const WORKER = fileURLToPath(new URL("../../python/tts_worker.py", import.meta.url));

// One process for the whole request so the model loads once. Any failure is BLOCKED: nothing partial reaches the project.
export async function runWorker(ctx, jobs) {
  if (jobs.length === 0) return [];
  const r = ensureTool(await runTool(ctx, "uv", ["run", "--with", POCKET_TTS, "python", "-I", WORKER], { input: JSON.stringify({ jobs }), env: { KPOCKET_TTS_ERROR_WITHOUT_EOS: "1" }, timeoutMs: 1800000 }), "uv", "HARD-TTS-EOS");
  const last = r.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
  let reply;
  try { reply = JSON.parse(last); } catch { reply = null; }
  if (r.status !== 0 || !reply || typeof reply !== "object" || !reply.ok) {
    throw new KitError("BLOCKED", `the TTS worker failed${reply?.id ? ` on ${reply.id}` : ""}: ${reply?.error ?? (r.timedOut ? "timed out" : r.stderr.slice(-300))}`, { rule: "HARD-TTS-EOS", item: reply?.id });
  }
  if (!Array.isArray(reply.results)) {
    throw new KitError("BLOCKED", "the TTS worker returned a malformed response", { rule: "PROC-ONE-LINE-PER-WAV" });
  }
  if (reply.results.length !== jobs.length) {
    throw new KitError("BLOCKED", "the TTS worker returned fewer takes than requested", { rule: "PROC-ONE-LINE-PER-WAV" });
  }
  for (let i = 0; i < jobs.length; i++) {
    if (!reply.results[i] || typeof reply.results[i] !== "object" || reply.results[i].id !== jobs[i].id) {
      throw new KitError("BLOCKED", `the TTS worker returned malformed result for ${jobs[i].id}`, { rule: "PROC-ONE-LINE-PER-WAV", item: jobs[i].id });
    }
  }
  return reply.results;
}
