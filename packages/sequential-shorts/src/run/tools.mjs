import { spawn } from "node:child_process";
import { ShortsError } from "../errors.mjs";

// One seam for every external program. Tests point `ctx.tools.<name>` at a fake (a command string or an argv array).
// ffmpeg/ffprobe may be redirected with env vars (for example to Homebrew ffmpeg-full, which is keg-only).
const ENV_OVERRIDE = { ffmpeg: "SEQ_SHORTS_FFMPEG", ffprobe: "SEQ_SHORTS_FFPROBE" };

export function toolArgv(ctx, name) {
  const env = ctx.env ?? process.env;
  const t = ctx.tools?.[name] ?? (ENV_OVERRIDE[name] && env[ENV_OVERRIDE[name]]) ?? name;
  return Array.isArray(t) ? t : [t];
}

export function runTool(ctx, name, args, { cwd, env, input, timeoutMs = 900000 } = {}) {
  const [cmd, ...pre] = toolArgv(ctx, name);
  return new Promise((resolve) => {
    const child = spawn(cmd, [...pre, ...args], { cwd, env: { ...(ctx.env ?? process.env), ...env }, stdio: ["pipe", "pipe", "pipe"], detached: true });
    const out = [];
    const errs = [];
    let timedOut = false;
    // The child leads its own process group so a timeout also takes down grandchildren (uv -> python).
    const killGroup = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
    // A detached group no longer receives the terminal's Ctrl-C, so forward it: kill the group, then die of the same signal.
    const forward = (sig) => () => { killGroup(); process.removeListener("SIGINT", onInt); process.removeListener("SIGTERM", onTerm); process.kill(process.pid, sig); };
    const onInt = forward("SIGINT");
    const onTerm = forward("SIGTERM");
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    const release = () => { clearTimeout(timer); process.removeListener("SIGINT", onInt); process.removeListener("SIGTERM", onTerm); };
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => errs.push(d));
    child.stdin.on("error", () => {});
    child.on("error", (e) => {
      release();
      resolve({ status: null, missing: e.code === "ENOENT", timedOut, stdout: "", stdoutBuf: Buffer.alloc(0), stderr: String(e.message) });
    });
    child.on("close", (status) => {
      release();
      const buf = Buffer.concat(out);
      resolve({ status, missing: false, timedOut, stdout: buf.toString("utf8"), stdoutBuf: buf, stderr: Buffer.concat(errs).toString("utf8") });
    });
    child.stdin.end(input ?? "");
  });
}

// A tool that is not installed is a capability problem (BLOCKED), never a pass.
export function ensureTool(result, name, check) {
  if (result.missing) {
    throw new ShortsError("BLOCKED", `required tool "${name}" is not available`, { check, item: name, notRun: [{ check: name, item: null, reason: "tool not available" }] });
  }
  return result;
}

export const tail = (text, n = 400) => String(text ?? "").trim().slice(-n);
