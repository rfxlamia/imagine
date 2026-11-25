// Shared selector: the most recent Evidence_Record per checkId, as a Map in first-seen order.
// Records are append-only, so the greatest `at` wins and ties go to the later array position.
export function latestByCheck(records) {
  const latest = new Map();
  for (const r of Array.isArray(records) ? records : []) {
    if (!r || typeof r.checkId !== "string") continue;
    const prev = latest.get(r.checkId);
    if (!prev || String(r.at ?? "") >= String(prev.at ?? "")) latest.set(r.checkId, r);
  }
  return latest;
}
