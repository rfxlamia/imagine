import { fileURLToPath } from "node:url";
import { KitError } from "../errors.mjs";
import { POCKET_TTS, ensureTool, runTool } from "../tools.mjs";
import { ELEVENLABS_SDK } from "./voices.mjs";
import { loadElevenLabsKey, redact } from "./secrets.mjs";

const WORKER = fileURLToPath(new URL("../../python/tts_worker.py", import.meta.url));
const ELEVENLABS_WORKER = fileURLToPath(new URL("../../python/elevenlabs_worker.py", import.meta.url));

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

export async function runElevenLabsWorker(ctx, jobs, key) {
  if (jobs.length === 0) return { tier: null, results: [] };
  const r = ensureTool(
    await runTool(ctx, "uv", ["run", "--with", ELEVENLABS_SDK, "python", "-I", ELEVENLABS_WORKER], {
      input: JSON.stringify({ jobs }),
      env: { ELEVENLABS_API_KEY: key },
      timeoutMs: 1800000,
    }),
    "uv",
    "HARD-SECRET-NEVER-WRITTEN"
  );
  const last = r.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
  let reply;
  try { reply = JSON.parse(last); } catch { reply = null; }
  if (r.status !== 0 || !reply || typeof reply !== "object" || !reply.ok) {
    const rawStderr = r.stderr ? redact(r.stderr, key) : "";
    const rawError = reply?.error ? redact(reply.error, key) : undefined;
    const idPart = reply?.id ? ` on ${reply.id}` : "";
    const statusPart = reply?.status ? ` (HTTP ${reply.status})` : "";
    const errText = rawError ?? (r.timedOut ? "timed out" : rawStderr.slice(-300));
    const msg = redact(`the ElevenLabs TTS worker failed${idPart}: ${errText}${statusPart}`, key);
    const detail = rawStderr ? rawStderr.slice(-300) : undefined;
    throw new KitError("BLOCKED", msg, {
      rule: "PROC-ONE-LINE-PER-WAV",
      item: reply?.id,
      ...(detail ? { detail } : {}),
    });
  }
  if (!Array.isArray(reply.results)) {
    throw new KitError("BLOCKED", redact("the ElevenLabs TTS worker returned a malformed response", key), { rule: "PROC-ONE-LINE-PER-WAV" });
  }
  if (reply.results.length !== jobs.length) {
    throw new KitError("BLOCKED", redact("the ElevenLabs TTS worker returned fewer takes than requested", key), { rule: "PROC-ONE-LINE-PER-WAV" });
  }
  for (let i = 0; i < jobs.length; i++) {
    if (!reply.results[i] || typeof reply.results[i] !== "object" || reply.results[i].id !== jobs[i].id) {
      throw new KitError("BLOCKED", redact(`the ElevenLabs TTS worker returned malformed result for ${jobs[i].id}`, key), { rule: "PROC-ONE-LINE-PER-WAV", item: jobs[i].id });
    }
  }
  return { tier: reply.tier ?? null, results: reply.results };
}

export async function runTts(ctx, jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { results: [], tier: null };
  }
  const pocketJobs = [];
  const elevenJobs = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const { engine, ...rest } = job;
    if (engine === "pocket-tts") {
      pocketJobs.push({ originalIndex: i, job: rest });
    } else if (engine === "elevenlabs") {
      elevenJobs.push({ originalIndex: i, job: rest });
    } else {
      throw new KitError("HARD", `voice engine "${engine}" is not supported; use pocket-tts or elevenlabs`, { rule: "PROC-ONE-LINE-PER-WAV", item: job.id });
    }
  }

  const key = elevenJobs.length > 0 ? loadElevenLabsKey(ctx) : null;

  let pocketResults = [];
  if (pocketJobs.length > 0) {
    pocketResults = await runWorker(ctx, pocketJobs.map((p) => p.job));
  }

  let elevenResults = [];
  let tier = null;
  if (elevenJobs.length > 0) {
    const elevenRun = await runElevenLabsWorker(ctx, elevenJobs.map((e) => e.job), key);
    elevenResults = elevenRun.results;
    tier = elevenRun.tier;
  }

  const combined = new Array(jobs.length);
  for (let k = 0; k < pocketJobs.length; k++) {
    combined[pocketJobs[k].originalIndex] = pocketResults[k];
  }
  for (let k = 0; k < elevenJobs.length; k++) {
    combined[elevenJobs[k].originalIndex] = elevenResults[k];
  }

  return { results: combined, tier };
}
