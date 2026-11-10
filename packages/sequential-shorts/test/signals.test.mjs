import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { analyzeSignals, parseSignalLog } from "../src/analyze/signals.mjs";
import { probe } from "../src/probe.mjs";
import { TOOLS, hasFfmpeg, makeVideo, speechWav, tmp } from "./helpers/media.mjs";

const LOG = `
[Parsed_metadata_4 @ 0x1] frame:0    pts:0       pts_time:0
[Parsed_metadata_4 @ 0x1] lavfi.scd.score=0.000
[Parsed_metadata_4 @ 0x1] frame:1    pts:512     pts_time:0.2
[Parsed_metadata_4 @ 0x1] lavfi.scd.score=12.000
[Parsed_freezedetect_2 @ 0x2] lavfi.freezedetect.freeze_start: 0
[Parsed_silencedetect_5 @ 0x3] silence_start: 1.499958
[Parsed_scdet_1 @ 0x4] lavfi.scd.score: 15.625, lavfi.scd.time: 2
[Parsed_freezedetect_2 @ 0x2] lavfi.freezedetect.freeze_duration: 2
[Parsed_freezedetect_2 @ 0x2] lavfi.freezedetect.freeze_end: 2
[Parsed_freezedetect_2 @ 0x2] lavfi.freezedetect.freeze_start: 2
[Parsed_blackdetect_3 @ 0x5] black_start:3 black_end:3.5 black_duration:0.5
[Parsed_silencedetect_5 @ 0x3] silence_end: 4 | silence_duration: 2.500042
`;

test("parseSignalLog reads every signal and closes open intervals at EOF", () => {
  const s = parseSignalLog(LOG, { duration_s: 4 });
  assert.deepEqual(s.silences, [{ start: 1.499958, end: 4 }]);
  assert.deepEqual(s.scene_cuts, [{ t: 2, score: 15.625 }]);
  assert.deepEqual(s.freezes, [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.deepEqual(s.blacks, [{ start: 3, end: 3.5 }]);
  assert.deepEqual(s.motion, [{ start: 0, end: 0.5, score: 6 }]);
});

test("parseSignalLog subtracts the format start offset", () => {
  const s = parseSignalLog("[x] silence_start: 2.5\n[x] silence_end: 3 | silence_duration: 0.5\n[s] lavfi.scd.score: 20, lavfi.scd.time: 2.25", { duration_s: 5, offset_s: 1.5 });
  assert.deepEqual(s.silences, [{ start: 1, end: 1.5 }]);
  assert.deepEqual(s.scene_cuts, [{ t: 0.75, score: 20 }]);
});

test("analyzeSignals finds the scene cut and the silence on a real fixture", { skip: !hasFfmpeg && "NOT_RUN: ffmpeg not available" }, async () => {
  const dir = tmp("sig-");
  const { duration } = speechWav(join(dir, "s.wav"), { sentences: [3], lead: 0.2, wordS: 0.3, wordGap: 0.08, tail: 2.5 });
  const p = makeVideo(join(dir, "v.mp4"), { segments: [{ color: "0xFF0000", seconds: 2 }, { color: "0x0000FF", seconds: duration - 2 }], wav: join(dir, "s.wav") });
  const s = await analyzeSignals({ tools: TOOLS }, await probe({ tools: TOOLS }, p));
  assert.ok(s.scene_cuts.some((c) => Math.abs(c.t - 2) < 0.1), JSON.stringify(s.scene_cuts));
  assert.ok(s.silences.some((x) => Math.abs(x.start - 1.26) < 0.15), JSON.stringify(s.silences));
  assert.ok(s.freezes.length >= 1);
});
