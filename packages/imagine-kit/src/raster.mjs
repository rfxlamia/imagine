// Resolution policy (proposal section 7.2). Compare unrounded q against the thresholds; round only for reports.
export const SOFT_MIN = 0.75;
export const rasterQ = (w, h, req) => Math.min(w / req.w, h / req.h);
export const tierOf = (q) => (q >= 1 ? "native" : q >= SOFT_MIN ? "soft" : "replan");
export const round2 = (q) => Math.round(q * 100) / 100;
