import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { err } from "../envelope.mjs";
import { UsageError } from "../errors.mjs";
import { deriveAll } from "../derive.mjs";
import { gateSatisfied } from "../gates.mjs";
import { sha256 } from "../hash.mjs";
import { appendJournal } from "../journal.mjs";
import { resolveProject, saveProject } from "../project.mjs";
import { loadValidator } from "../schemas.mjs";
import { createContext, resolveRef } from "../sources.mjs";
import { blockHash } from "../story/block.mjs";
import { checkStoryIntegrity, commitStory } from "../story/commit.mjs";
import { STAGE_KEYS } from "../story/keys.mjs";
import { STALE_KINDS, applyOps, requiredRefs } from "../story/patch.mjs";
import { inputsFrom, validateStory } from "../story/validate.mjs";

const STAGES = ["storyboard", "previz", "fx"];
const BASE_REFS = ["g0:format", "g0:duration_s", "g0:audio_mode"];
const UPSTREAM = { previz: "storyboard", fx: "previz" };
const GROUPS = { bible: "bible", style: "style", units: "unit", clock: "clock", refs: "asset" };
const PRIORITY = { CONFLICT: 0, STALE_INPUTS: 1 };

const fail = (project, errors) => ({ project, data: {}, errors });
const declaredRefs = (inputs) => {
  const out = new Map();
  for (const [group, prefix] of Object.entries(GROUPS)) for (const [k, v] of Object.entries(inputs?.[group] ?? {})) out.set(`${prefix}:${k}`, v);
  return out;
};

export default {
  locks: true,
  options: {},
  async run({ values, positionals }, ctx) {
    if (positionals.length !== 1) throw new UsageError("usage: patch apply <file>");
    const { dir, rel } = resolveProject(ctx.cwd, values.project);

    // The patch must live in stage/<stage>/ (symlinks resolved).
    const found = [resolve(ctx.cwd, positionals[0]), resolve(dir, positionals[0])].find((c) => existsSync(c));
    if (!found) throw new UsageError(`patch file not found: ${positionals[0]}`);
    const real = realpathSync(found);
    const fromStage = relative(realpathSync(join(dir, "stage")), real);
    const parts = fromStage.split(sep);
    if (isAbsolute(fromStage) || parts.length !== 2 || !STAGES.includes(parts[0])) throw new UsageError("the patch file must live in stage/storyboard|previz|fx/ of the project");

    const text = readFileSync(real, "utf8");
    let patch;
    try { patch = YAML.parse(text, { maxAliasCount: 0 }); } catch (e) {
      return fail(rel, [err("HARD-PATCH-KEYS", "HARD", null, "patch is not valid YAML", e.message)]);
    }
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return fail(rel, [err("HARD-PATCH-KEYS", "HARD", null, "patch must be a YAML mapping")]);

    // Key ownership first, so a forbidden key is KEY_NOT_OWNED and not a generic schema error (AC-02).
    const keyErrors = [];
    if (STAGES.includes(patch.stage) && Array.isArray(patch.ops)) {
      const owned = new Set(STAGE_KEYS[patch.stage]);
      for (const op of patch.ops) {
        for (const set of [op?.set, op?.create_shot?.set]) {
          if (!set || typeof set !== "object") continue;
          for (const k of Object.keys(set)) {
            if (!owned.has(k)) keyErrors.push(err("HARD-PATCH-KEYS", "KEY_NOT_OWNED", op.shot ?? op.create_shot?.id ?? null, `key "${k}" is not owned by stage ${patch.stage}`));
          }
        }
      }
    }
    if (keyErrors.length) return fail(rel, keyErrors);
    const schema = loadValidator("patch")(patch);
    if (!schema.valid) return fail(rel, [err("HARD-PATCH-KEYS", "HARD", null, "patch does not match the patch schema", schema.errors.join("; "))]);
    if (parts[0] !== patch.stage) return fail(rel, [err("HARD-PATCH-KEYS", "HARD", null, `patch stage ${patch.stage} does not match its directory stage/${parts[0]}/`)]);

    const sctx = createContext(dir);
    const integrity = checkStoryIntegrity(dir);
    if (!integrity.ok) return fail(rel, [err("HARD-STORY-WRITERS", "KEY_NOT_OWNED", null, "STORY.md was changed outside patch apply", integrity.reason)]);
    if (integrity.parsed.errors.length) return fail(rel, integrity.parsed.errors.map((e) => err("HARD-STORY-IDS", "HARD", null, `STORY.md line ${e.line}: ${e.message}`)));

    // Base revision and input re-verification: never trust an earlier validation.
    const errors = [];
    if (patch.base_story_rev !== integrity.rev) {
      errors.push(err("HARD-PATCH-BASE-REV", "CONFLICT", null, `base_story_rev ${patch.base_story_rev} but STORY.md is at revision ${integrity.rev}; re-dispatch with the new revision`));
    }
    const declared = declaredRefs(patch.inputs);
    for (const [ref, value] of declared) {
      const current = resolveRef(sctx, ref, value);
      if (current === null) errors.push(err(ref.startsWith("clock:") ? "HARD-PATCH-REVERIFY" : "HARD-ENTITIES-EXIST", "HARD", ref, `${ref} does not exist`));
      else if (current !== value) errors.push(err("HARD-PATCH-REVERIFY", "STALE_INPUTS", ref, `${ref} changed since the patch was written`, `declared ${value}, current ${current}`));
    }
    if (errors.length) return fail(rel, errors.sort((a, b) => (PRIORITY[a.code] ?? 2) - (PRIORITY[b.code] ?? 2)));

    // Canon gates G0-G3 must be satisfied (checked after re-verification, so an edited canon source answers STALE_INPUTS first).
    const { gates } = deriveAll(sctx);
    const open = ["G0", "G1", "G2", "G3"].filter((g) => !gateSatisfied(gates, g));
    if (open.length) return fail(rel, open.map((g) => err("HARD-GATES-RECORDED", "HARD", g, `gate ${g} must be approved before planning patches (state: ${gates[g].state})`)));

    // Declared inputs, then the ops, then the full validator on the result.
    const need = requiredRefs(patch.ops);
    for (const [shotId, refs] of need) for (const ref of refs) if (!declared.has(ref)) errors.push(err("HARD-PATCH-INPUTS-DECLARED", "HARD", ref, `inputs must declare ${ref} (needed by ${shotId})`));
    const applied = applyOps({ shots: integrity.parsed.shots }, patch);
    errors.push(...applied.errors);
    if (errors.length) return fail(rel, errors);
    const newRev = integrity.rev + 1;
    const newStory = { front: { ...integrity.parsed.front, imagine_rev: newRev }, shots: applied.shots };
    const result = validateStory(inputsFrom(sctx, patch.stage, newStory));
    if (result.errors.length) return { project: rel, data: {}, errors: result.errors, advice: result.advice, not_run: result.not_run };

    // Commit order: history snapshot, project.yaml, then STORY.md (the commit point).
    const project = sctx.project;
    const committedRev = integrity.rev;
    const restored = [];
    if (project.pending && Number.isInteger(project.pending.rev) && project.pending.rev > committedRev) {
      for (const [id, prevRecord] of Object.entries(project.pending.prev ?? {})) {
        if (prevRecord === null) delete project.items[id];
        else project.items[id] = prevRecord;
        restored.push(id);
      }
      delete project.pending;
    }

    const prev = {};
    for (const id of restored) {
      prev[id] = project.items[id] ? structuredClone(project.items[id]) : null;
    }
    for (const id of applied.removed) {
      for (const st of STAGES) {
        const itemId = `shot:${id}.${st}`;
        if (!Object.hasOwn(prev, itemId)) {
          prev[itemId] = project.items[itemId] ? structuredClone(project.items[itemId]) : null;
        }
        delete project.items[itemId];
      }
    }
    const staleKinds = new Set(STALE_KINDS[patch.stage]);
    const byId = new Map(applied.shots.map((s) => [s.id, s]));
    const touched = [...applied.touched].filter((id) => byId.has(id));
    const realDir = realpathSync(dir);
    for (const id of touched) {
      const itemId = `shot:${id}.${patch.stage}`;
      if (!Object.hasOwn(prev, itemId)) {
        prev[itemId] = project.items[itemId] ? structuredClone(project.items[itemId]) : null;
      }
      const inputs = {};
      const watch = {};
      for (const ref of BASE_REFS) inputs[ref] = resolveRef(sctx, ref, undefined);
      if (UPSTREAM[patch.stage]) inputs[`shot:${id}.${UPSTREAM[patch.stage]}`] = blockHash(byId.get(id), UPSTREAM[patch.stage]);
      const refs = declared.keys();
      for (const ref of refs) (staleKinds.has(ref.slice(0, ref.indexOf(":"))) ? inputs : watch)[ref] = declared.get(ref);
      project.items[itemId] = { kind: "shot-stage", status: "proposed", rev: newRev, inputs,
        ...(Object.keys(watch).length ? { watch } : {}),
        patch: { file: relative(realDir, real), sha256: sha256(text), ...(patch.brief_hash ? { brief_hash: patch.brief_hash } : {}) } };
    }
    project.pending = { rev: newRev, prev };

    commitStory({ dir, front: newStory.front, shots: applied.shots, between: () => saveProject(dir, project), hooks: ctx.hooks });
    const journal_id = appendJournal(dir, { command: "patch apply", summary: `${patch.stage} ${relative(realDir, real)} -> STORY.md rev ${newRev}; touched ${touched.join(",") || "-"}`, now: ctx.now() });
    const advice = [...result.advice, ...(restored.length
      ? [{ rule: "PROC-ATOMIC-COMMIT", item: null, source: "project.yaml", message: `restored ${restored.length} item(s) left by an uncommitted patch: ${restored.join(", ")}` }] : [])];
    return { project: rel, journal_id, advice, not_run: result.not_run, data: { story_rev: newRev, touched } };
  },
};
