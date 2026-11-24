import { SOFT_MIN } from "./raster.mjs";
// Single source for the numeric thresholds the quality Checkpoints enforce (design, "Numeric thresholds fixed by this design").
// qc.mjs, story/validate.mjs and checkpoints.mjs read these; none redefine them.
export const THRESHOLDS = Object.freeze({
  SHOT_DURATION_EPS: 1e-6,        // Req 3.2, HARD-DURATION (shot durations vs the G0 range)
  MP4_DURATION_TOLERANCE: 0.05,   // Req 5.3, HARD-DURATION (rendered file)
  FPS_TOLERANCE: 0.01,            // Req 5.3, HARD-FPS-SIZE
  TARGET_LUFS: -16,               // Req 4.6, HARD-LOUDNESS
  LUFS_TOLERANCE: 1.5,            // Req 4.6
  MAX_TRUE_PEAK: -1,              // Req 4.6, dBTP ceiling
  RASTER_FLOOR_Q: SOFT_MIN,       // Req 4.9, 9.9: q below this is the `replan` tier and always fails
  RASTER_NATIVE_Q: 1,             // q at or above this is the `native` tier
  VO_OVER_PLAN_MAX: 0.2,          // Req 4.4: a take may exceed its planned time by at most 20% (PROC-PREVIZ-NO-STRETCH)
});
