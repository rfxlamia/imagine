import { ensureTool, runTool, tail } from "./tools.mjs";

// drawtext needs ffmpeg built with freetype and fontconfig; prove it by rendering one marker frame.
export async function detectCaps(ctx) {
  const args = ["-hide_banner", "-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=s=64x64:d=0.1", "-vf", "drawtext=font=Sans:text='Part 1/2'", "-f", "null", "-"];
  const r = ensureTool(await runTool(ctx, "ffmpeg", args, { timeoutMs: 60000 }), "ffmpeg", "caps");
  return { drawtext: r.status === 0, drawtext_detail: r.status === 0 ? null : tail(r.stderr, 300) };
}
