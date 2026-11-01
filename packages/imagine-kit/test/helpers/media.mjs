import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { encodePng } from "./png.mjs";

export { encodePng };
export const makePng = (path, w, h, pixel) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(w, h, pixel));
  return path;
};

// volume 1.94 on a 440 Hz sine measures about -16.0 LUFS; volume 1.0 about -21.8 LUFS.
export function makeMp4(path, { w = 1080, h = 1920, fps = 30, seconds = 13, volume = 1.94, audio = true, silent = false } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const args = ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=0x0b4f5c:s=${w}x${h}:r=${fps}:d=${seconds}`];
  if (audio) args.push("-f", "lavfi", "-i", `${silent ? "anullsrc=r=48000:cl=mono" : "sine=frequency=440:sample_rate=48000"}:d=${seconds}`, "-af", `volume=${volume}`);
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", ...(audio ? ["-c:a", "aac", "-b:a", "128k"] : []), "-shortest", path);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  return path;
}
export const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
