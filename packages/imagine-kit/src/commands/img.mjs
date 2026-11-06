import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { err } from "../envelope.mjs";
import { KitError, UsageError } from "../errors.mjs";
import { deriveAll } from "../derive.mjs";
import { currentAsset } from "../docs.mjs";
import { sha256, sha256File } from "../hash.mjs";
import { isUniformImage, pngInfo } from "../media.mjs";
import { resolveProject } from "../project.mjs";
import { rasterQ, round2, tierOf } from "../raster.mjs";
import { createContext, resolveRef } from "../sources.mjs";
import { compilePrompt, compileSheetPrompt, generate, revisedPrompt } from "../img/adapter.mjs";
import { commitAsset, commitAssets, recordBlocked, safePath } from "../img/commit.mjs";
import { loadPlan } from "../img/plan.mjs";
import { checkCellAlpha, sheetLayout } from "../img/sheet.mjs";
import { ensureTool, runTool, HYPERFRAMES, HF_ENV } from "../tools.mjs";

const RETRIES = 2;

// A leftover image is reusable only when meta.json (written after the checks passed) names this prompt stamp and the file's own hash.
function adoptable(dir, workRels, finalPath, stamp) {
  for (const workRel of workRels) {
    const work = safePath(dir, workRel);
    const metaPath = safePath(dir, `${workRel}/meta.json`);
    const outputPath = safePath(dir, `${workRel}/out.png`);
    const workStat = work && lstatSync(work, { throwIfNoEntry: false });
    if (!workStat?.isDirectory() || !metaPath || !outputPath || !existsSync(metaPath)) continue;
    let meta;
    try { meta = JSON.parse(readFileSync(metaPath, "utf8")); } catch { continue; }
    if (meta.prompt_sha256 !== stamp) continue;
    for (const file of [finalPath, outputPath]) {
      if (existsSync(file) && sha256File(file) === meta.png_sha256 && pngInfo(readFileSync(file))) return { file, revised: meta.revised_prompt ?? null, work: workRel };
    }
  }
  return null;
}
const DIR_OF = { ref: "refs", img: "img" };
const report = (a) => ({ id: a.id, v: a.v, w: a.w ?? null, h: a.h ?? null, q: a.q ?? null, tier: a.tier ?? null, sha256: a.sha256, revised_prompt: a.revised_prompt ?? null });

// HARD-REFS-APPROVED: every referenced ref is the current version, approved in the manifest and in the project, and its file hash still matches.
function refsGate(dir, sctx, planned, byId, derived) {
  const problems = [];
  for (const p of planned) {
    for (const r of p.refs ?? []) {
      const cur = currentAsset(sctx.manifest, r);
      const item = cur && derived.items.find((i) => i.id === `asset:${cur.id}.v${cur.v}`);
      const safe = cur ? safePath(dir, cur.path) : null;
      if (!cur || cur.kind !== "ref") problems.push(`${p.id}: ref "${r}" has no generated version${byId.get(r) ? "; run img --ref " + r : " and is not in assets/plan.yaml"}`);
      else if (cur.status !== "approved" || item?.status !== "approved") problems.push(`${p.id}: ref "${r}" v${cur.v} is not approved at G5r (${item?.status ?? cur.status})`);
      else if (!safe) problems.push(`${p.id}: ref "${r}" v${cur.v} is outside the project`);
      else if (!existsSync(safe) || sha256File(safe) !== cur.sha256) problems.push(`${p.id}: ref "${r}" v${cur.v} no longer matches its recorded hash`);
    }
  }
  return problems;
}

async function makeOne(ctx, dir, sctx, p, v, note, advice) {
  const kind = p.kind;
  const rel = `assets/${DIR_OF[kind]}/${p.id}.v${v}.png`;
  const finalPath = safePath(dir, rel);
  if (!finalPath) throw new KitError("HARD", `${rel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });

  const workBaseRel = `tmp/img/${p.id}.v${v}`;
  if (!safePath(dir, workBaseRel)) throw new KitError("HARD", `${workBaseRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });
  const workRel = `${workBaseRel}.${randomBytes(6).toString("hex")}`;
  const work = safePath(dir, workRel);
  if (!work) throw new KitError("HARD", `${workRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });

  const outRel = `${workRel}/out.png`;
  const outFile = safePath(dir, outRel);
  if (!outFile) throw new KitError("HARD", `${outRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });

  const metaRel = `${workRel}/meta.json`;
  const metaFile = safePath(dir, metaRel);
  if (!metaFile) throw new KitError("HARD", `${metaRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });

  const refEntries = (p.refs ?? []).map((r) => currentAsset(sctx.manifest, r));
  const refPaths = refEntries.map((e) => {
    const s = safePath(dir, e.path);
    if (!s) throw new KitError("HARD", `${e.path} is outside the project`, { rule: "HARD-REFS-APPROVED", item: p.id });
    return s;
  });
  const text = compilePrompt({ prompt: p.prompt, framing: p.framing, size: p.size, refs: p.refs ?? [] });
  const base = { id: p.id, kind, v, path: rel, status: "pending", ...(p.refs?.length ? { refs: refEntries.map((e) => e.id) } : {}),
    ...(p.required_px ? { required_px: p.required_px } : {}), prompt: text, ...(note ? { note } : {}) };

  // Crash recovery: a finished file that never reached the manifest is adopted, not regenerated, but only when meta.json proves
  // it was made from this exact prompt and these exact ref files and the file is still the bytes that were checked.
  const stamp = sha256(`${text}\n${refEntries.map((e) => e.sha256).join(",")}`);
  const adopted = finalPath;
  const safeImgRoot = safePath(dir, "tmp/img");
  const priorWorkRels = [];
  const baseWorkPath = safePath(dir, workBaseRel);
  if (baseWorkPath && lstatSync(baseWorkPath, { throwIfNoEntry: false })?.isDirectory()) priorWorkRels.push(workBaseRel);
  if (safeImgRoot && existsSync(safeImgRoot)) {
    priorWorkRels.push(...readdirSync(safeImgRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${p.id}.v${v}.`))
      .map((entry) => `tmp/img/${entry.name}`));
  }
  const found = adoptable(dir, priorWorkRels, adopted, stamp);
  let png = found?.file ?? null;
  let revised = found?.revised ?? null;
  if (png) {
    advice.push({ rule: "PROC-RESUME-IDEMPOTENT", item: `${p.id}.v${v}`, source: "assets", message: `adopted ${png === adopted ? rel : `${found.work}/out.png`} left by an interrupted run; nothing was regenerated` });
  } else {
    if (!safePath(dir, workRel)) throw new KitError("HARD", `${workRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });
    mkdirSync(work, { recursive: true });
    let lastWhy = "";
    for (let attempt = 0; attempt <= RETRIES && !png; attempt += 1) {
      const curOut = safePath(dir, outRel);
      if (!curOut) throw new KitError("HARD", `${outRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });
      rmSync(curOut, { force: true });

      const curWork = safePath(dir, workRel);
      if (!curWork) throw new KitError("HARD", `${workRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });
      for (const e of refEntries) {
        if (!safePath(dir, e.path)) throw new KitError("HARD", `${e.path} is outside the project`, { rule: "HARD-REFS-APPROVED", item: p.id });
      }

      const r = await generate(ctx, { workDir: curWork, text, refPaths });
      const out = safePath(dir, outRel);
      if (!out) throw new KitError("HARD", `${outRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });
      const info = r.ok && existsSync(out) ? pngInfo(readFileSync(out)) : null;
      if (!r.ok) lastWhy = `codex exited with an error ${r.stderr}`.trim();
      else if (!existsSync(out)) lastWhy = "codex produced no out.png";
      else if (!info) lastWhy = "out.png is not a real PNG";
      else if (await isUniformImage(ctx, out)) lastWhy = "out.png is a uniform (blank) image";
      else { png = out; revised = revisedPrompt(ctx, r.stdout); }
    }
    if (!png) {
      await recordBlocked(ctx, dir, { step: `img:${p.id}.v${v}`, command: `img --batch ${p.id}` });
      throw new KitError("BLOCKED", `${p.id}: no usable image after ${RETRIES + 1} attempts (${lastWhy})`, { rule: "PROC-IMG-RETRY", item: p.id });
    }
    const curMeta = safePath(dir, metaRel);
    if (!curMeta) throw new KitError("HARD", `${metaRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });
    writeFileSync(curMeta, JSON.stringify({ revised_prompt: revised, prompt_sha256: stamp, png_sha256: sha256File(png) }));
  }
  const curFinal = safePath(dir, rel);
  if (!curFinal) throw new KitError("HARD", `${rel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: `${p.id}.v${v}` });
  const info = pngInfo(readFileSync(png));
  const q = p.required_px ? rasterQ(info.w, info.h, p.required_px) : null;
  const entry = { ...base, w: info.w, h: info.h, ...(q === null ? {} : { q: round2(q), tier: tierOf(q) }), ...(revised ? { revised_prompt: revised } : {}), sha256: "0".repeat(64) };
  if (!revised) advice.push({ rule: "PROC-REVISED-PROMPT", item: `${p.id}.v${v}`, source: "codex session log", message: "the revised prompt was not found in the Codex session log; only the compiled prompt is recorded" });
  if (entry.tier === "replan") advice.push({ rule: "HARD-RASTER-TIER", item: `${p.id}.v${v}`, source: "assets/plan.yaml", message: `q ${entry.q} is below 0.75 (replan tier); regenerate larger or re-plan the shot, export-hf will refuse it` });
  const done = await commitAsset(ctx, dir, { entry, source: png === adopted ? null : png, clearBlocked: `img:${p.id}.v${v}`,
    summary: { command: "img", text: `${p.id}.v${v} ${info.w}x${info.h}${q === null ? "" : ` q=${round2(q)} ${tierOf(q)}`}` } });
  return done.entry;
}

async function makeSheet(ctx, dir, sctx, members, group, { note, advice }) {
  const n = members.length;
  const layout = sheetLayout(n);
  const [mw, mh] = members[0].size.split("x").map(Number);
  const reqSize = `${layout.cols * mw}x${layout.rows * mh}`;

  const versions = members.map((m) => {
    const all = sctx.manifest.assets.filter((a) => a.id === m.id);
    const latest = all.reduce((b, a) => (!b || a.v > b.v ? a : b), null);
    return (latest?.v ?? 0) + 1;
  });

  const refEntries = (members[0].refs ?? []).map((r) => currentAsset(sctx.manifest, r));
  const refPaths = refEntries.map((e) => {
    const s = safePath(dir, e.path);
    if (!s) throw new KitError("HARD", `${e.path} is outside the project`, { rule: "HARD-REFS-APPROVED", item: members[0].id });
    return s;
  });

  const text = compileSheetPrompt({ members, refs: members[0].refs ?? [], size: reqSize, cols: layout.cols, rows: layout.rows });
  const stamp = sha256(`${text}\n${refEntries.map((e) => e.sha256).join(",")}\n${members.map((m, i) => `${m.id}.v${versions[i]}`).join(",")}`);

  const safeImgRoot = safePath(dir, "tmp/img");
  let adopted = null;
  if (safeImgRoot && existsSync(safeImgRoot)) {
    const candidates = readdirSync(safeImgRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(`sheet-${group}.`))
      .map((e) => `tmp/img/${e.name}`);
    for (const workRel of candidates) {
      const metaPath = safePath(dir, `${workRel}/meta.json`);
      const outPath = safePath(dir, `${workRel}/out.png`);
      if (!metaPath || !outPath || !existsSync(metaPath) || !existsSync(outPath)) continue;
      let meta;
      try { meta = JSON.parse(readFileSync(metaPath, "utf8")); } catch { continue; }
      if (meta.prompt_sha256 !== stamp) continue;
      if (sha256File(outPath) === meta.png_sha256 && pngInfo(readFileSync(outPath))) {
        adopted = { workRel, outPath, revised: meta.revised_prompt ?? null };
        break;
      }
    }
  }

  let workRel;
  let work;
  let sheetPng = null;
  let revised = null;

  if (adopted) {
    workRel = adopted.workRel;
    work = safePath(dir, workRel);
    sheetPng = adopted.outPath;
    revised = adopted.revised;
    advice.push({ rule: "PROC-RESUME-IDEMPOTENT", item: group, source: "assets", message: `adopted ${adopted.workRel}/out.png left by an interrupted run; nothing was regenerated` });
  } else {
    const workBaseRel = `tmp/img/sheet-${group}`;
    if (!safePath(dir, workBaseRel)) throw new KitError("HARD", `${workBaseRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: group });
    workRel = `${workBaseRel}.${randomBytes(6).toString("hex")}`;
    work = safePath(dir, workRel);
    if (!work) throw new KitError("HARD", `${workRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: group });
    mkdirSync(work, { recursive: true });
  }

  let lastWhy = "";
  let cellCuts = null;

  for (let attempt = 0; attempt <= RETRIES && !cellCuts; attempt += 1) {
    if (!sheetPng) {
      const prevOut = safePath(dir, `${workRel}/out.png`);
      if (prevOut) rmSync(prevOut, { force: true });
      const prevMeta = safePath(dir, `${workRel}/meta.json`);
      if (prevMeta) rmSync(prevMeta, { force: true });

      const r = await generate(ctx, { workDir: work, text, refPaths });
      const out = safePath(dir, `${workRel}/out.png`);
      if (!out) throw new KitError("HARD", `${workRel}/out.png is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: group });
      const info = r.ok && existsSync(out) ? pngInfo(readFileSync(out)) : null;
      if (!r.ok) { lastWhy = `codex exited with an error ${r.stderr}`.trim(); continue; }
      if (!existsSync(out)) { lastWhy = "codex produced no out.png"; continue; }
      if (!info) { lastWhy = "out.png is not a real PNG"; continue; }
      if (await isUniformImage(ctx, out)) { lastWhy = "out.png is a uniform (blank) image"; continue; }

      sheetPng = out;
      revised = revisedPrompt(ctx, r.stdout);
      const curMeta = safePath(dir, `${workRel}/meta.json`);
      if (!curMeta) throw new KitError("HARD", `${workRel}/meta.json is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: group });
      writeFileSync(curMeta, JSON.stringify({ revised_prompt: revised, prompt_sha256: stamp, png_sha256: sha256File(sheetPng) }));
    }

    const info = pngInfo(readFileSync(sheetPng));
    const cw = Math.floor(info.w / layout.cols);
    const ch = Math.floor(info.h / layout.rows);
    let cellProblem = null;
    const cuts = [];

    for (let k = 1; k <= n; k++) {
      const x = ((k - 1) % layout.cols) * cw;
      const y = Math.floor((k - 1) / layout.cols) * ch;
      const cellRel = `${workRel}/cell-${k}.png`;
      const cellPng = safePath(dir, cellRel);
      if (!cellPng) throw new KitError("HARD", `${cellRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: group });

      const rCrop = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-y", "-i", sheetPng, "-vf", `crop=${cw}:${ch}:${x}:${y}`, cellPng]), "ffmpeg", "PROC-POSE-SHEET");
      if (rCrop.status !== 0 || !existsSync(cellPng)) throw new KitError("HARD_NOT_RUN", `ffmpeg crop failed: ${rCrop.stderr}`, { rule: "PROC-POSE-SHEET" });

      const cutRel = `${workRel}/cut-${k}.png`;
      const cutPng = safePath(dir, cutRel);
      if (!cutPng) throw new KitError("HARD", `${cutRel} is outside the project`, { rule: "HARD-ASSETS-APPROVED", item: group });

      const rRb = ensureTool(await runTool(ctx, "npx", ["--yes", HYPERFRAMES, "remove-background", cellPng, "-o", cutPng], { cwd: work, env: HF_ENV, timeoutMs: 900000 }), "npx", "PROC-CUTOUT-FALLBACK");
      if (rRb.status !== 0 || rRb.timedOut || !existsSync(cutPng)) {
        const tail = (rRb.stderr || rRb.stdout).slice(-300).trim();
        throw new KitError("BLOCKED", `hyperframes remove-background failed: ${tail}`, { rule: "PROC-CUTOUT-FALLBACK", item: members[k - 1].id });
      }

      const cutInfo = pngInfo(readFileSync(cutPng));
      if (!cutInfo || cutInfo.w !== cw || cutInfo.h !== ch) {
        cellProblem = `cell ${k} (${members[k - 1].id}) cutout is ${cutInfo ? `${cutInfo.w}x${cutInfo.h}` : "not a PNG"}, expected ${cw}x${ch}`;
        break;
      }

      const rAlpha = ensureTool(await runTool(ctx, "ffmpeg", ["-v", "error", "-i", cutPng, "-vf", "format=rgba,alphaextract", "-f", "rawvideo", "-"]), "ffmpeg", "HARD-SHEET-CELL");
      if (rAlpha.status !== 0 || rAlpha.stdoutBuf.length < cutInfo.w * cutInfo.h) throw new KitError("HARD_NOT_RUN", `ffmpeg alphaextract failed: ${rAlpha.stderr}`, { rule: "HARD-SHEET-CELL" });

      const check = checkCellAlpha(rAlpha.stdoutBuf, cutInfo.w, cutInfo.h, { k, id: members[k - 1].id });
      if (check.problem) {
        cellProblem = check.problem;
        break;
      }
      cuts.push({ path: cutPng, w: cutInfo.w, h: cutInfo.h });
    }

    if (cellProblem) {
      lastWhy = cellProblem;
      sheetPng = null;
      continue;
    }

    cellCuts = { cuts };
  }

  if (!cellCuts) {
    await recordBlocked(ctx, dir, { step: `img:sheet-${group}`, command: `img --batch ${members.map((m) => m.id).join(",")}` });
    throw new KitError("BLOCKED", `${group}: no usable sheet after ${RETRIES + 1} attempts (${lastWhy})`, { rule: "PROC-IMG-RETRY", item: group });
  }

  const sheetSha = sha256File(sheetPng);
  const sha12 = sheetSha.slice(0, 12);
  const sheetRel = `assets/sheets/${group}.${sha12}.png`;
  const extraFiles = [{ source: sheetPng, rel: sheetRel }];

  const items = [];
  for (let k = 1; k <= n; k++) {
    const member = members[k - 1];
    const v = versions[k - 1];
    const rel = `assets/img/${member.id}.v${v}.png`;
    const cut = cellCuts.cuts[k - 1];
    const q = member.required_px ? rasterQ(cut.w, cut.h, member.required_px) : null;
    const entry = {
      id: member.id,
      kind: "img",
      v,
      path: rel,
      status: "pending",
      ...(member.refs?.length ? { refs: refEntries.map((e) => e.id) } : {}),
      ...(member.required_px ? { required_px: member.required_px } : {}),
      prompt: text,
      sheet: sheetRel,
      sheet_sha256: sheetSha,
      cell: k,
      w: cut.w,
      h: cut.h,
      ...(q === null ? {} : { q: round2(q), tier: tierOf(q) }),
      ...(revised ? { revised_prompt: revised } : {}),
      ...(note ? { note } : {}),
      sha256: "0".repeat(64),
    };
    if (!revised) advice.push({ rule: "PROC-REVISED-PROMPT", item: `${member.id}.v${v}`, source: "codex session log", message: "the revised prompt was not found in the Codex session log; only the compiled prompt is recorded" });
    if (entry.tier === "replan") advice.push({ rule: "HARD-RASTER-TIER", item: `${member.id}.v${v}`, source: "assets/plan.yaml", message: `q ${entry.q} is below 0.75 (replan tier); regenerate larger or re-plan the shot, export-hf will refuse it` });
    items.push({ entry, source: cut.path });
  }

  const summaryText = `sheet ${group}: ${items.map((i) => `${i.entry.id}.v${i.entry.v} ${i.entry.w}x${i.entry.h}`).join(" ")}`;
  const summary = { command: "img", text: summaryText };
  const done = await commitAssets(ctx, dir, { items, extraFiles, summary, clearBlocked: `img:sheet-${group}` });
  return done.entries;
}

export default {
  locks: false,   // the project lock is held only around each commit (cli-contract "Decisions frozen" WP2)
  options: { ref: { type: "string" }, batch: { type: "string" }, redo: { type: "string" }, note: { type: "string" } },
  async run({ values }, ctx) {
    if ((values.ref === undefined) === (values.batch === undefined)) throw new UsageError("usage: img --ref <ref_id> | img --batch <asset_id,...> [--redo <asset_id> --note <text>]");
    if ((values.redo === undefined) !== (values.note === undefined)) throw new UsageError("--redo and --note go together");
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const wanted = values.ref !== undefined ? [values.ref] : values.batch.split(",").map((s) => s.trim()).filter(Boolean);
    if (wanted.length === 0) throw new UsageError("--batch needs at least one asset id");
    if (values.redo !== undefined && !wanted.includes(values.redo)) throw new UsageError("--redo must name one of the requested ids");

    const sctx = createContext(dir);
    const derived = deriveAll(sctx);
    if (derived.gates.G4.state !== "approved") {
      return { project: rel, data: { assets: [] }, errors: [err("HARD-GATES-RECORDED", "HARD", "G4", `gate G4 must be approved before img (state: ${derived.gates.G4.state})`)] };
    }
    const plan = loadPlan(dir);
    // G4 approval freezes assets/plan.yaml only when the file existed at that moment; a plan written or changed later is not approved.
    const frozen = sctx.project.items.g4?.inputs?.["file:assets/plan.yaml"];
    if (frozen !== resolveRef(sctx, "file:assets/plan.yaml", undefined)) {
      return { project: rel, data: { assets: [] }, errors: [err("HARD-ASSETS-APPROVED", "HARD", "G4", frozen === undefined
        ? "assets/plan.yaml was written after G4 was approved; approve G4 again so the asset list is covered by the approval"
        : "assets/plan.yaml changed after G4 was approved; approve G4 again") ] };
    }
    const byId = new Map(plan.map((a) => [a.id, a]));
    const want = values.ref !== undefined ? "ref" : "img";
    for (const id of wanted) {
      const p = byId.get(id);
      if (!p) throw new UsageError(`"${id}" is not in assets/plan.yaml`);
      if (p.kind !== want) throw new UsageError(`"${id}" is a ${p.kind} asset; use ${p.kind === "ref" ? "--ref" : "--batch"}`);
    }

    const planned = [];
    const seenIds = new Set();
    for (const id of wanted) {
      const p = byId.get(id);
      if (p.sheet && values.redo !== p.id) {
        const groupMembers = plan.filter((a) => a.sheet === p.sheet);
        for (const gm of groupMembers) {
          if (!seenIds.has(gm.id)) {
            seenIds.add(gm.id);
            planned.push(gm);
          }
        }
      } else {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          planned.push(p);
        }
      }
    }

    const problems = refsGate(dir, sctx, planned, byId, derived);
    if (problems.length) {
      return { project: rel, code: "REFS_NOT_APPROVED", data: { assets: [] }, errors: problems.map((m) => err("HARD-REFS-APPROVED", "REFS_NOT_APPROVED", null, m)) };
    }

    const advice = [];
    const out = [];
    const processedSheets = new Set();

    for (const p of planned) {
      if (!p.sheet) {
        const fresh = createContext(dir);
        const all = fresh.manifest.assets.filter((a) => a.id === p.id);
        const latest = all.reduce((b, a) => (!b || a.v > b.v ? a : b), null);
        const cur = currentAsset(fresh.manifest, p.id);
        const redo = values.redo === p.id;
        if (cur && !redo) {
          advice.push({ rule: "PROC-RESUME-IDEMPOTENT", item: `${p.id}.v${cur.v}`, source: "assets/manifest.yaml", message: `${p.id} v${cur.v} already exists; nothing was regenerated (use --redo ${p.id} --note <why> for a new version)` });
          out.push(report(cur));
          continue;
        }
        const made = await makeOne(ctx, dir, fresh, p, (latest?.v ?? 0) + 1, redo ? values.note : undefined, advice);
        if (made) out.push(report(made));
      } else if (values.redo === p.id) {
        const fresh = createContext(dir);
        const madeEntries = await makeSheet(ctx, dir, fresh, [p], p.sheet, { note: values.note, advice });
        for (const made of madeEntries) {
          out.push(report(made));
        }
      } else {
        if (processedSheets.has(p.sheet)) continue;
        processedSheets.add(p.sheet);

        const groupMembers = plan.filter((a) => a.sheet === p.sheet);
        const fresh = createContext(dir);
        const toGenerate = [];
        for (const m of groupMembers) {
          const cur = currentAsset(fresh.manifest, m.id);
          if (cur) {
            advice.push({ rule: "PROC-RESUME-IDEMPOTENT", item: `${m.id}.v${cur.v}`, source: "assets/manifest.yaml", message: `${m.id} v${cur.v} already exists; nothing was regenerated (use --redo ${m.id} --note <why> for a new version)` });
          } else {
            toGenerate.push(m);
          }
        }

        if (toGenerate.length > 0) {
          await makeSheet(ctx, dir, fresh, toGenerate, p.sheet, { advice });
        }

        const freshAfter = createContext(dir);
        for (const m of groupMembers) {
          const curAfter = currentAsset(freshAfter.manifest, m.id);
          if (curAfter) out.push(report(curAfter));
        }
      }
    }
    return { project: rel, advice, data: { assets: out } };
  },
};
