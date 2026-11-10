import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { err } from "../envelope.mjs";
import { KitError, UsageError } from "../errors.mjs";
import { deriveAll } from "../derive.mjs";
import { sha256File } from "../hash.mjs";
import { withLock } from "../fsx.mjs";
import { appendJournal } from "../journal.mjs";
import { loadProject, resolveProject, saveProject } from "../project.mjs";
import { createContext, enumerateSources } from "../sources.mjs";
import { HF_ENV, HYPERFRAMES, ensureTool, runTool } from "../tools.mjs";
import { checkAssets } from "../edit/assets-check.mjs";
import { renderPreflight } from "../edit/preflight.mjs";
import { placeFile, safePath } from "../img/commit.mjs";

const nextVersion = (dir, slug, items = {}) => {
  const d = safePath(dir, "post");
  const files = d && existsSync(d) ? readdirSync(d).map((n) => n.match(new RegExp(`^${slug}\\.v(\\d+)\\.mp4$`))?.[1]) : [];
  // A render record keeps its version even when the MP4 is gone: versions are immutable, so the next final never reuses one.
  const recorded = Object.keys(items).map((k) => k.match(new RegExp(`^render:${slug}\\.v(\\d+)$`))?.[1]);
  const found = [...files, ...recorded].filter(Boolean).map(Number);
  return Math.max(0, ...found) + 1;
};

// What a render was made from: the root composition, every scene file, the motion file, current assets, the story and each edit item.
function renderInputs(sctx) {
  const inputs = {};
  const all = enumerateSources(sctx);
  for (const [ref, value] of Object.entries(all)) {
    if (ref.startsWith("file:") || ref.startsWith("asset:") || ref === "story:sha" || ref === "g0:format" || ref === "g0:duration_s") inputs[ref] = value;
  }
  for (const id of Object.keys(sctx.project.items)) if (id.startsWith("edit:")) inputs[id] = "item";
  return inputs;
}

function inputsMatch(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.hasOwn(b, k) || a[k] !== b[k]) return false;
  }
  return true;
}

export default {
  locks: false,   // a render takes minutes: only the commit holds the project lock
  options: { draft: { type: "boolean" }, final: { type: "boolean" } },
  async run({ values }, ctx) {
    if (Boolean(values.draft) === Boolean(values.final)) throw new UsageError("usage: render --draft | render --final");
    const { dir, rel } = resolveProject(ctx.cwd, values.project);
    if (loadProject(dir).purges?.length) throw new KitError("HARD", "media was purged from this project; rendering is disabled", { rule: "HARD-PURGED" });
    const sctx = createContext(dir);
    const slug = sctx.project.slug;
    const final = Boolean(values.final);
    const derived = deriveAll(sctx);
    const fail = (errors) => ({ project: rel, data: { path: null, sha256: null }, errors });

    const safeEdit = safePath(dir, "edit");
    const safeHf = safePath(dir, "edit/hyperframes.json");
    if (!safeEdit || !safeHf) {
      throw new KitError("HARD", "edit/ is outside the project", { rule: "HARD-ROOT-MOTION" });
    }
    if (!existsSync(safeHf)) {
      throw new KitError("BLOCKED", "edit/ is not an initialised HyperFrames project (edit/hyperframes.json is missing); run `npx hyperframes@0.8.223 init edit`", { rule: "HARD-ROOT-MOTION" });
    }

    const errors = renderPreflight(dir, sctx.story.shots.map((shot) => shot.id));
    if (final) {
      if (derived.gates.G6.state !== "approved") errors.push(err("HARD-GATES-RECORDED", "HARD", "G6", `gate G6 must be approved before a final render (state: ${derived.gates.G6.state})`));
      errors.push(...checkAssets(dir, sctx, derived, { checkCopies: true }).errors);
    }

    const targetDirRel = final ? "post" : "review";
    const safeTargetDir = safePath(dir, targetDirRel);
    if (!safeTargetDir) {
      errors.push(err("HARD-ASSETS-APPROVED", "HARD", targetDirRel, `${targetDirRel} is outside the project`));
    }
    const version = final ? nextVersion(dir, slug, sctx.project.items) : null;
    const target = final ? `post/${slug}.v${version}.mp4` : `review/${slug}.draft.mp4`;
    const safeTarget = safePath(dir, target);
    if (!safeTarget) {
      errors.push(err("HARD-ASSETS-APPROVED", "HARD", target, `${target} is outside the project`));
    }

    const safeTmpRender = safePath(dir, "tmp/render");
    if (!safeTmpRender) {
      errors.push(err("HARD-ASSETS-APPROVED", "HARD", "tmp/render", "tmp/render is outside the project"));
    }

    if (errors.length) return fail(errors);

    const nonce = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const workRel = `tmp/render/${final ? `${slug}.v${version}` : `${slug}.draft`}.${nonce}.mp4`;
    const safeWork = safePath(dir, workRel);
    if (!safeWork) {
      return fail([err("HARD-ASSETS-APPROVED", "HARD", workRel, `${workRel} is outside the project`)]);
    }

    mkdirSync(dirname(safeWork), { recursive: true });
    rmSync(safeWork, { force: true });

    // Snapshot render input refs before invoking HyperFrames:
    const snapshotInputs = renderInputs(sctx);

    try {
      const args = ["--yes", HYPERFRAMES, "render", "edit", "-o", workRel, "--fps", "30", "--quality", final ? "delivery" : "draft", "--no-best-effort"];
      const r = ensureTool(await runTool(ctx, "npx", args, { cwd: dir, env: HF_ENV, timeoutMs: 3600000 }), "npx", "HARD-NO-BEST-EFFORT");
      if (r.status !== 0 || !existsSync(safeWork) || statSync(safeWork).size === 0) {
        throw new KitError("BLOCKED", `hyperframes render failed${r.timedOut ? " (timed out)" : ""}: ${(r.stderr || r.stdout).slice(-300)}`, { rule: "HARD-NO-BEST-EFFORT" });
      }

      return await withLock(dir, async () => {
        const fresh = createContext(dir);
        if (fresh.project.purges?.length) throw new KitError("HARD", "media was purged from this project; rendering is disabled", { rule: "HARD-PURGED" });
        const freshDerived = deriveAll(fresh);

        if (final) {
          const commitErrors = [];
          if (freshDerived.gates.G6.state !== "approved") {
            commitErrors.push(err("HARD-GATES-RECORDED", "HARD", "G6", `gate G6 must be approved before a final render (state: ${freshDerived.gates.G6.state})`));
          }
          commitErrors.push(...checkAssets(dir, fresh, freshDerived, { checkCopies: true }).errors);
          if (commitErrors.length) return fail(commitErrors);
        }

        const currentInputs = renderInputs(fresh);
        if (!inputsMatch(snapshotInputs, currentInputs)) {
          return fail([err("PROC-CONFLICT-REDISPATCH", "CONFLICT", null, "render inputs changed during render; run render again")]);
        }

        const lockSafeTargetDir = safePath(dir, targetDirRel);
        const lockSafeTarget = safePath(dir, target);
        if (!lockSafeTargetDir || !lockSafeTarget) {
          return fail([err("HARD-ASSETS-APPROVED", "HARD", target, `${target} is outside the project`)]);
        }

        if (final && existsSync(lockSafeTarget)) {
          throw new KitError("CONFLICT", `${target} appeared while rendering; run render --final again`, { rule: "PROC-VERSIONS-IMMUTABLE" });
        }

        placeFile(safeWork, lockSafeTarget);
        const sha256 = sha256File(lockSafeTarget);
        const project = fresh.project;
        project.items[final ? `render:${slug}.v${version}` : "render:draft"] = { kind: "render", status: "proposed", inputs: snapshotInputs };
        saveProject(dir, project);
        const journal_id = appendJournal(dir, { command: "render", summary: `${target} ${sha256.slice(0, 12)}`, now: ctx.now() });
        return { project: rel, journal_id, data: { path: target, sha256 } };
      });
    } finally {
      try {
        if (existsSync(safeWork)) rmSync(safeWork, { force: true });
      } catch {}
    }
  },
};
