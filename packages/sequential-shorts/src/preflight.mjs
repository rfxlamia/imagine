import { ShortsError } from "./errors.mjs";
import { runTool, toolArgv } from "./run/tools.mjs";

const VERSION_ARGS = { ffmpeg: ["-hide_banner", "-version"], ffprobe: ["-hide_banner", "-version"], uv: ["--version"] };

// Checks every named tool before any work starts. All missing tools are reported together.
export async function requireTools(ctx, names) {
  const versions = {};
  const missing = [];
  for (const name of names) {
    const r = await runTool(ctx, name, VERSION_ARGS[name] ?? ["--version"], { timeoutMs: 30000 });
    if (r.missing || r.status !== 0) { missing.push(name); continue; }
    versions[name] = r.stdout.split("\n")[0].trim();
  }
  if (missing.length) {
    throw new ShortsError("BLOCKED", `required tool(s) not available: ${missing.join(", ")}`, {
      check: "preflight",
      item: missing.join(","),
      detail: { binaries: Object.fromEntries(missing.map((m) => [m, toolArgv(ctx, m).join(" ")])) },
      notRun: missing.map((m) => ({ check: m, item: null, reason: "tool not available" })),
    });
  }
  return versions;
}
