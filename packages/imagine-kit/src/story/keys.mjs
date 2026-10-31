export const STORYBOARD_BULLETS = ["scene", "duration_est", "voiceover", "characters", "location", "framing", "composition", "layers", "assets", "reads"];
export const PREVIZ_KEYS = ["duration", "camera", "parallax", "motion", "beats", "transition_in", "sound", "poster", "motion_asserts"];
export const FX_KEYS = ["fx", "grade", "overlays", "fx_notes"];
export const EDIT_KEYS = ["src", "status"];
export const STAGE_KEYS = { storyboard: ["id", "title", ...STORYBOARD_BULLETS, "narrative"], previz: PREVIZ_KEYS, fx: FX_KEYS, edit: EDIT_KEYS };
export const STAGE_BULLETS = { storyboard: STORYBOARD_BULLETS, previz: PREVIZ_KEYS, fx: FX_KEYS, edit: EDIT_KEYS };
export const KEY_ORDER = [...STORYBOARD_BULLETS, ...PREVIZ_KEYS, ...FX_KEYS, ...EDIT_KEYS];
export const FX_TOOLS = ["shader", "vfx-chain", "media-treatment", "registry", "css-blend", "css-mask"];
export const WEBGL_TOOLS = ["shader", "registry"];

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SECONDS = /^(\d+(?:\.\d+)?)s$/;
const UNIT_REF = /^([LT]\d{2})(?:@(\d+(?:\.\d+)?))?$/;
const ASSET_SIZED = /^([A-Za-z0-9][A-Za-z0-9._-]*):(ref|img):(\d+)x(\d+)$/;
const ASSET_PLAIN = /^([A-Za-z0-9][A-Za-z0-9._-]*):(vo|music|sfx)$/;
const FX_HEAD = /^([A-Za-z0-9][A-Za-z0-9._-]*)=([a-z-]+):(\S+)$/;
const FX_ATTRS = ["range", "needs_final_asset", "fallback", "params", "unsupported"];
const SECONDS_KEYS = new Set(["duration_est", "duration", "poster"]);
const ID_LIST_KEYS = new Set(["characters", "layers", "overlays"]);
const TEXT_KEYS = new Set(["scene", "framing", "composition", "reads", "camera", "parallax", "motion", "transition_in", "sound",
  "motion_asserts", "grade", "fx_notes", "src"]);

function splitList(raw) {
  const m = raw.match(/^\[(.*)\]$/s);
  if (!m) return { error: "expected a list like [a, b]" };
  const inner = m[1].trim();
  if (inner === "") return { items: [] };
  const items = inner.split(",").map((s) => s.trim());
  return items.some((s) => s === "") ? { error: "empty list entry" } : { items };
}

function parseUnitRef(item) {
  const m = item.match(UNIT_REF);
  return m ? { value: { unit: m[1], offset: m[2] ? Number(m[2]) : 0 } } : { error: `bad unit reference "${item}" (expected L## or T## with optional @seconds)` };
}
function parseSecondsItem(item) {
  const m = item.match(SECONDS);
  return m ? { value: Number(m[1]) } : { error: `bad seconds "${item}"` };
}
function parseAsset(item) {
  const sized = item.match(ASSET_SIZED);
  if (sized) return { value: { id: sized[1], kind: sized[2], w: Number(sized[3]), h: Number(sized[4]) } };
  const plain = item.match(ASSET_PLAIN);
  return plain ? { value: { id: plain[1], kind: plain[2] } } : { error: `bad asset "${item}" (expected id:ref|img:WxH or id:vo|music|sfx)` };
}
function parseFx(item) {
  const [head, ...attrs] = item.split(";").map((s) => s.trim());
  const m = head.match(FX_HEAD);
  if (!m) return { error: `bad fx entry "${item}" (expected id=tool:name[;attr=value])` };
  const value = { id: m[1], tool: m[2], name: m[3] };
  for (const a of attrs) {
    const am = a.match(/^(range|fallback|needs_final_asset|params|unsupported)=(.+)$/);
    if (!am) return { error: `bad fx attribute "${a}"` };
    value[am[1]] = am[2];
  }
  return { value };
}

export function parseValue(key, raw) {
  const bad = (m) => ({ error: `${key}: ${m}` });
  if (TEXT_KEYS.has(key)) return raw === "" ? bad("must not be empty") : { value: raw };
  if (SECONDS_KEYS.has(key)) {
    const m = raw.match(SECONDS);
    return m ? { value: Number(m[1]) } : bad('expected seconds like "4.5s"');
  }
  if (key === "status") return ["outline", "built", "animated"].includes(raw) ? { value: raw } : bad("expected outline, built or animated");
  if (key === "location") return TOKEN.test(raw) ? { value: raw } : bad("expected one id");
  const list = splitList(raw);
  if (list.error) return bad(list.error);
  const out = [];
  for (const item of list.items) {
    let r;
    if (key === "voiceover") r = parseUnitRef(item);
    else if (key === "beats") r = parseSecondsItem(item);
    else if (key === "assets") r = parseAsset(item);
    else if (key === "fx") r = parseFx(item);
    else if (ID_LIST_KEYS.has(key)) r = TOKEN.test(item) ? { value: item } : { error: `bad id "${item}"` };
    else return bad("unknown key");
    if (r.error) return bad(r.error);
    out.push(r.value);
  }
  return { value: out };
}

function itemToString(key, x) {
  if (typeof x === "string") return x.trim();
  if (typeof x === "number" && key === "beats") return `${x}s`;
  if (x && typeof x === "object" && key === "fx" && typeof x.id === "string" && typeof x.tool === "string") {
    return [`${x.id}=${x.tool}`, ...FX_ATTRS.filter((a) => x[a] !== undefined).map((a) => `${a}=${x[a]}`)].join(";");
  }
  if (x && typeof x === "object" && key === "voiceover" && typeof x.unit === "string") return x.offset ? `${x.unit}@${x.offset}` : x.unit;
  return String(x);
}

export function normalizeValue(key, v) {
  let raw;
  if (typeof v === "string") raw = v.trim();
  else if (typeof v === "number" && SECONDS_KEYS.has(key)) raw = `${v}s`;
  else if (Array.isArray(v)) raw = `[${v.map((x) => itemToString(key, x)).join(", ")}]`;
  else return { error: `${key}: unsupported value type` };
  if (raw === "" || /[\r\n]/.test(raw)) return { error: `${key}: must be a non-empty single line` };
  const parsed = parseValue(key, raw);
  return parsed.error ? parsed : { raw, value: parsed.value };
}
