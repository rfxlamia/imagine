import { spawn } from "node:child_process";
import { KitError } from "./errors.mjs";

// One seam for every external program. Tests point `ctx.tools.<name>` at a fake (a command string or an argv array).
const DEFAULT = { codex: ["codex"], ffmpeg: ["ffmpeg"], ffprobe: ["ffprobe"], npx: ["npx"], uv: ["uv"] };
export const HYPERFRAMES = "hyperframes@0.8.223";
export const POCKET_TTS = "pocket-tts[audio]==4.0.1";
export const HF_ENV = { HYPERFRAMES_NO_TELEMETRY: "1" };

const argvOf = (ctx, name) => {
  const t = ctx.tools?.[name] ?? DEFAULT[name];
  return Array.isArray(t) ? t : [t];
};

export function runTool(ctx, name, args, { cwd, env, input, timeoutMs = 900000, onSignal } = {}) {
  const [cmd, ...pre] = argvOf(ctx, name);
  return new Promise((resolve) => {
    const child = spawn(cmd, [...pre, ...args], { cwd, env: { ...(ctx.env ?? process.env), ...env }, stdio: ["pipe", "pipe", "pipe"], detached: true });
    const out = [];
    const errs = [];
    let timedOut = false;
    // The child leads its own process group so a timeout also takes down grandchildren (npx -> node -> chrome).
    const killGroup = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
    // A detached group no longer receives the terminal's Ctrl-C, so forward it: kill the group, then die of the same signal.
    const forward = (sig) => () => {
      killGroup();
      try { onSignal?.(sig); }
      finally {
        process.removeListener("SIGINT", onInt);
        process.removeListener("SIGTERM", onTerm);
        process.kill(process.pid, sig);
      }
    };
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
export function ensureTool(result, name, rule) {
  if (result.missing) throw new KitError("BLOCKED", `required tool "${name}" is not available`, { rule });
  return result;
}
