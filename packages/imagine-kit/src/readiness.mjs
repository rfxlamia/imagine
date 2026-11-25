import { deriveItemState } from "./derive.mjs";

// Per-shot readiness from the shot's own dependency states (Requirements 8.1, 8.2, 8.9).
// Pure: reads only `derived` (the result of deriveAll) and the arguments.

const SATISFIED = new Set(["approved", "passed", "published"]);
const NEEDS_VALIDATION = new Set(["validating", "repairing", "needs_input"]);

// The default audio dependency ids: the G5a gate item and any `audio:*` item.
const isAudioDependency = (id) => id === "g5a" || /^audio:/.test(id);

// Item_State of one dependency. Prefers the derived row; falls back to deriving from a raw record.
// A dependency whose inputs changed (`stale`) no longer counts as satisfied.
export function dependencyState(derived, id, records = null) {
  const row = derived?.items?.find((i) => i.id === id);
  if (row) {
    if (row.state === "failed") return "failed";
    if (row.stale || row.status === "stale") return "stale";
    // A legacy `approved` status never overrides unevaluated evidence or an explicit state that still needs validation.
    if (NEEDS_VALIDATION.has(row.state)) return row.state;
    if (SATISFIED.has(row.status) || SATISFIED.has(row.state)) return SATISFIED.has(row.state) ? row.state : row.status;
    return row.state ?? row.status ?? "pending";
  }
  if (records?.[id]) return deriveItemState(records[id], [], id);
  return "missing";
}

// opts:
//   silence             "intentional" when G0 chose intentional silence (project.g0.silence)
//   audioAssetCount     number of audio assets in the manifest (default 0)
//   audioDependencyIds  ids treated as the audio dependency (default: "g5a" and `audio:*`)
//   records             project.items, used when `derived` has no row for a dependency
// Returns "ready" | "blocked" | "pending".
export function shotReadiness(derived, shot, dependencyIds, opts = {}) {
  const { silence = null, audioAssetCount = 0, audioDependencyIds = null, records = null } = opts;
  const isAudio = audioDependencyIds ? (id) => audioDependencyIds.includes(id) : isAudioDependency;
  const silentAudio = silence === "intentional" && audioAssetCount === 0;
  const states = (dependencyIds ?? []).map((id) => (silentAudio && isAudio(id) ? "passed" : dependencyState(derived, id, records)));
  if (states.some((s) => s === "failed")) return "blocked";
  if (states.every((s) => SATISFIED.has(s))) return "ready";
  return "pending";
}
