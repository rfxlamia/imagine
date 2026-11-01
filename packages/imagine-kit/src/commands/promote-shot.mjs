import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { err } from "../envelope.mjs";
import { UsageError } from "../errors.mjs";
import { deriveAll } from "../derive.mjs";
import { withLock, readText, writeAtomic } from "../fsx.mjs";
import { appendJournal } from "../journal.mjs";
import { resolveProject, saveProject } from "../project.mjs";
import { createContext, resolveRef } from "../sources.mjs";
import { checkAssertions, lintProject, staticSceneChecks } from "../edit/composition.mjs";
import { editPreconditions, parsedKeys, shotAssets, shotOffset, shotOrThrow } from "../edit/shots.mjs";
import { placeFile, safePath } from "../img/commit.mjs";

const round = (n) => Math.round(n * 1000) / 1000;

function readJson(path, where) {
  try { return { doc: JSON.parse(readText(path)) }; } catch (e) { return { errors: [err("HARD-ROOT-MOTION", "HARD", where, `${where} is not valid JSON`, e.message)] }; }
}

// The item that makes a promoted shot go stale when its previz, fx, assets, voice clocks or composition change.
function editInputs(fresh, shot, assets, id) {
  const refs = [`shot:${id}.previz`, ...(shot.keys.fx ? [`shot:${id}.fx`] : []), `file:edit/compositions/${id}.html`,
    ...assets.map((a) => `asset:${a.entry.id}.v${a.entry.v}`)];
  const inputs = {};
  for (const ref of refs) inputs[ref] = resolveRef(fresh, ref, undefined);
  for (const v of parsedKeys(shot).voiceover ?? []) {
    const vo = fresh.manifest.assets.filter((a) => a.kind === "vo" && a.line === v.unit && a.status !== "rejected").reduce((b, a) => (!b || a.v > b.v ? a : b), null);
    if (vo) inputs[`clock:${v.unit}`] = resolveRef(fresh, `clock:${v.unit}`, `vo.v${vo.v}:`);
  }
  return Object.fromEntries(Object.entries(inputs).filter(([, value]) => value !== null && value !== undefined));
}

export default {
  locks: false,   // lint can take seconds: only the commit holds the project lock
  options: {},
  async run({ values, positionals }, ctx) {
    if (positionals.length !== 1) throw new UsageError("usage: promote-shot <shot id>");
    const id = positionals[0];
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    const destCompRel = `edit/compositions/${id}.html`;
    const out = (errors) => ({ project: rel, data: { shot: id, path: destCompRel }, errors });

    const sctx = createContext(dir);
    const shot = shotOrThrow(sctx, id);
    const pre = editPreconditions(dir, deriveAll(sctx), shot);
    if (pre.errors.length) return out(pre.errors);
    const assets = shotAssets(sctx, shot, dir);
    if (assets.errors.length) return out(assets.errors);

    const shadowRel = `stage/edit/${id}`;
    const shadow = safePath(dir, shadowRel);
    if (!shadow) return out([err("HARD-SCENE-LINT", "HARD", id, `${shadowRel} is outside the project`)]);

    const compRel = `stage/edit/${id}/compositions/${id}.html`;
    const comp = safePath(dir, compRel);
    if (!comp) return out([err("HARD-SCENE-LINT", "HARD", id, `${compRel} is outside the project`)]);
    if (!existsSync(comp)) return out([err("HARD-SCENE-LINT", "HARD", id, `${compRel} does not exist; run stage-shot and build the scene first`)]);

    const destComp = safePath(dir, destCompRel);
    if (!destComp) return out([err("HARD-SCENE-LINT", "HARD", id, `${destCompRel} is outside the project`)]);

    const rootMotionRel = "edit/index.motion.json";
    const destMotion = safePath(dir, rootMotionRel);
    if (!destMotion) return out([err("HARD-ROOT-MOTION", "HARD", id, `${rootMotionRel} is outside the project`)]);

    const compBytes = readFileSync(comp);
    const html = compBytes.toString("utf8");
    const problems = staticSceneChecks(html, id);
    let motionBytes = null;
    let shotAssertions = [];
    const shadowMotionRel = `stage/edit/${id}/index.motion.json`;
    const shadowMotion = safePath(dir, shadowMotionRel);
    if (!shadowMotion) {
      problems.push(err("HARD-ROOT-MOTION", "HARD", id, `${shadowMotionRel} is outside the project`));
    } else if (existsSync(shadowMotion)) {
      motionBytes = readFileSync(shadowMotion);
      const read = readJson(shadowMotion, shadowMotionRel);
      if (read.errors) problems.push(...read.errors);
      else problems.push(...checkAssertions(read.doc.assertions, shadowMotionRel));
      shotAssertions = Array.isArray(read.doc?.assertions) ? read.doc.assertions : [];
    }
    const lint = await lintProject(ctx, shadow);
    problems.push(...lint.errors);
    if (problems.length) return out(problems);

    return withLock(dir, async () => {
      const fresh = createContext(dir);
      const freshShot = shotOrThrow(fresh, id);
      const freshDerived = deriveAll(fresh);
      const freshPre = editPreconditions(dir, freshDerived, freshShot);
      if (freshPre.errors.length) return out(freshPre.errors);
      const freshAssets = shotAssets(fresh, freshShot, dir);
      if (freshAssets.errors.length) return out(freshAssets.errors);

      const lockComp = safePath(dir, compRel);
      if (!lockComp || !existsSync(lockComp)) return out([err("HARD-SCENE-LINT", "HARD", id, `${compRel} does not exist; run stage-shot and build the scene first`)]);
      const lockCompBytes = readFileSync(lockComp);
      if (!lockCompBytes.equals(compBytes)) {
        return out([err("HARD-SCENE-LINT", "CONFLICT", id, `${compRel} changed during lint; bytes do not match linted composition`)]);
      }

      const lockShadowMotion = safePath(dir, shadowMotionRel);
      if (!lockShadowMotion) return out([err("HARD-ROOT-MOTION", "HARD", id, `${shadowMotionRel} is outside the project`)]);
      if (motionBytes === null) {
        if (existsSync(lockShadowMotion)) {
          return out([err("HARD-ROOT-MOTION", "CONFLICT", id, `${shadowMotionRel} changed during lint; motion file appeared during lint`)]);
        }
      } else {
        if (!existsSync(lockShadowMotion)) {
          return out([err("HARD-ROOT-MOTION", "CONFLICT", id, `${shadowMotionRel} changed during lint; motion file was removed during lint`)]);
        }
        const lockMotionBytes = readFileSync(lockShadowMotion);
        if (!lockMotionBytes.equals(motionBytes)) {
          return out([err("HARD-ROOT-MOTION", "CONFLICT", id, `${shadowMotionRel} changed during lint; bytes do not match linted motion`)]);
        }
      }

      const lockDestComp = safePath(dir, destCompRel);
      if (!lockDestComp) return out([err("HARD-SCENE-LINT", "HARD", id, `${destCompRel} is outside the project`)]);
      const lockRootMotion = safePath(dir, rootMotionRel);
      if (!lockRootMotion) return out([err("HARD-ROOT-MOTION", "HARD", id, `${rootMotionRel} is outside the project`)]);

      const offset = shotOffset(fresh, dir, id);
      let root = { version: 1, assertions: [] };
      if (existsSync(lockRootMotion)) {
        const read = readJson(lockRootMotion, rootMotionRel);
        if (read.errors) return out(read.errors);
        root = read.doc;
        const bad = checkAssertions(root.assertions, rootMotionRel);
        if (bad.length) return out(bad);
      }
      const kept = root.assertions.filter((a) => a.shot !== id);
      const added = shotAssertions.map((a) => ({ ...a, ...(a.kind === "appearsBy" ? { bySec: round(a.bySec + offset.seconds) } : {}), shot: id }));
      const merged = [...kept, ...added];

      placeFile(lockComp, lockDestComp);
      // HyperFrames rejects a motion file with no assertions, so an empty merge removes the file instead of writing one.
      if (merged.length) writeAtomic(lockRootMotion, `${JSON.stringify({ ...root, version: 1, assertions: merged }, null, 2)}\n`);
      else if (existsSync(lockRootMotion)) unlinkSync(lockRootMotion);

      const project = fresh.project;
      project.items[`edit:${id}`] = { kind: "edit", status: "proposed", inputs: editInputs(createContext(dir), freshShot, freshAssets.found, id) };
      saveProject(dir, project);
      const journal_id = appendJournal(dir, { command: "promote-shot", summary: `${id} -> edit/compositions/${id}.html at +${offset.seconds}s (${offset.from}); ${added.length} assertion(s)`, now: ctx.now() });
      const advice = lint.warnings.length ? [{ rule: "HARD-SCENE-LINT", item: id, source: `stage/edit/${id}`, message: `lint warnings (not blocking): ${[...new Set(lint.warnings)].join(", ")}` }] : [];
      return { project: rel, journal_id, advice, data: { shot: id, path: destCompRel } };
    });
  },
};
