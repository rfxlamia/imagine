import { existsSync } from "node:fs";
import { KitError } from "../errors.mjs";
import { ensureTool, runTool } from "../tools.mjs";

// rgba:false is exactly the crop the legacy sheet path always used. rgba:true pins an alpha-bearing pixel format so no
// step between the generated sheet and the committed cell can drop alpha.
export async function cropCell(ctx, sheetPng, cellPng, { x, y, cw, ch, rgba }) {
  const crop = `crop=${cw}:${ch}:${x}:${y}`;
  const args = rgba
    ? ["-v", "error", "-y", "-i", sheetPng, "-vf", `${crop},format=rgba`, "-c:v", "png", "-pix_fmt", "rgba", cellPng]
    : ["-v", "error", "-y", "-i", sheetPng, "-vf", crop, cellPng];
  const r = ensureTool(await runTool(ctx, "ffmpeg", args), "ffmpeg", "PROC-POSE-SHEET");
  if (r.status !== 0 || !existsSync(cellPng)) throw new KitError("HARD_NOT_RUN", `ffmpeg crop failed: ${r.stderr}`, { rule: "PROC-POSE-SHEET" });
}

export async function readRgba(ctx, path, w, h) {
  const r = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-i", path, "-vf", "format=rgba", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]), "ffmpeg", "HARD-SHEET-CELL");
  if (r.status !== 0 || r.stdoutBuf.length < w * h * 4) throw new KitError("HARD_NOT_RUN", `ffmpeg rgba decode failed: ${r.stderr}`, { rule: "HARD-SHEET-CELL" });
  return r.stdoutBuf.subarray(0, w * h * 4);
}

// Blank = no RGB variation AND no alpha variation. media.mjs isUniformImage looks at gray only, which ignores alpha, so a dark
// figure on a clear background (transparent pixels are often RGB 0) would read as blank there. Used for transparent intent only.
export async function isBlankImage(ctx, path) {
  const view = async (vf, what) => {
    const r = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-i", path, "-vf", vf, "-frames:v", "1", "-f", "rawvideo", "-"]), "ffmpeg", "HARD-REAL-RASTER");
    if (r.status !== 0 || r.stdoutBuf.length < 1024) throw new KitError("HARD_NOT_RUN", `ffmpeg could not decode the ${what} of the image`, { rule: "HARD-REAL-RASTER", detail: r.stderr.slice(-300) });
    let lo = 255, hi = 0;
    for (const b of r.stdoutBuf.subarray(0, 1024)) { if (b < lo) lo = b; if (b > hi) hi = b; }
    return hi - lo <= 2;
  };
  return (await view("scale=32:32:flags=area,format=gray", "colour")) && (await view("format=rgba,alphaextract,scale=32:32:flags=area,format=gray", "alpha"));
}

// Review aid for G5b: the cutout over saturated magenta, beside the raw crop. Never an approved asset.
export async function writeReviewComposite(ctx, cutPng, rawCellPng, outPng, { w, h }) {
  const graph = `[0:v]format=rgba[c];color=c=0xFF00FF:s=${w}x${h}:d=1,format=rgba[bg];[bg][c]overlay=format=auto,format=rgb24[comp];[1:v]format=rgb24[raw];[comp][raw]hstack=inputs=2`;
  const r = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-y", "-i", cutPng, "-i", rawCellPng, "-filter_complex", graph, "-frames:v", "1", outPng]), "ffmpeg", "HARD-SHEET-CELL");
  if (r.status !== 0 || !existsSync(outPng)) throw new KitError("HARD_NOT_RUN", `ffmpeg review composite failed: ${r.stderr}`, { rule: "HARD-SHEET-CELL" });
}
