#!/usr/bin/env node
// Forwards to the real ffmpeg (FAKE_REAL_FFMPEG) except for the render of the part named by FAKE_FAIL_PART.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const target = process.env.FAKE_FAIL_PART ?? ".part-02-of-";
if (args.includes("-filter_complex") && args.some((a) => a.includes(target))) {
  process.stderr.write("simulated render failure\n");
  process.exit(1);
}
const r = spawnSync(process.env.FAKE_REAL_FFMPEG ?? "ffmpeg", args, { stdio: "inherit" });
process.exit(r.status ?? 1);
