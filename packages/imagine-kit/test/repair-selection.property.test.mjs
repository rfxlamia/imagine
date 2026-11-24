import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import {
  REPAIR_BUDGETS, REPAIR_STRATEGIES, budgetFor, strategiesFor, selectStrategy, revalidationScope,
  beginRepair, chooseRasterReplan, recordRasterReplan,
} from "../src/repair.mjs";
import { makeProject, getProject, setProject } from "./helpers/fixture.mjs";

const NUM_RUNS = 30;
const NOW = new Date("2025-01-01T00:00:00Z");
const CLASSES = Object.keys(REPAIR_STRATEGIES);
const journalText = (dir) => readFileSync(join(dir, "journal.md"), "utf8");
const ev = (checkId, result) => ({ checkId, result, evaluator: "t", evaluatorCapabilities: ["text"], ruleVersion: "1", inputHashes: {}, outputRefs: [], at: NOW.toISOString() });
const consent = (kind, scope) => ({ kind, scope, quote: "ok", at: NOW.toISOString() });

const { dir } = await makeProject();
let counter = 0;
const freshItem = () => `shot:r${counter++}`;

// ---- Property 10 ----
// A DAG over n items: item i may depend only on items with a lower index, so it is always acyclic.
const dagArb = fc.integer({ min: 1, max: 7 }).chain((n) =>
  fc.tuple(
    fc.constant(n),
    fc.array(fc.array(fc.boolean(), { minLength: n, maxLength: n }), { minLength: n, maxLength: n }),
    fc.array(fc.array(fc.constantFrom("c1", "c2", "c3"), { maxLength: 3 }), { minLength: n, maxLength: n }),
    fc.integer({ min: 0, max: n - 1 }),
  ));

function buildItems(n, adj, checks) {
  const items = {};
  for (let i = 0; i < n; i++) {
    const inputs = {};
    for (let j = 0; j < i; j++) if (adj[i][j]) inputs[`shot:n${j}`] = "item";
    items[`shot:n${i}`] = { kind: "shot", status: "pending", inputs, evidence: checks[i].map((checkId) => ({ checkId, result: "passed" })) };
  }
  return items;
}

test("Property 10: re-validation scope is exactly the item's checks plus those of every transitive dependent", () => {
  // **Validates: Requirements 7.2**
  fc.assert(fc.property(dagArb, ([n, adj, checks, x]) => {
    const items = buildItems(n, adj, checks);
    // Independent reference: reachability over the adjacency matrix.
    const dependent = new Set();
    const grow = (k) => { for (let i = k + 1; i < n; i++) if (adj[i][k] && !dependent.has(i)) { dependent.add(i); grow(i); } };
    grow(x);
    const expected = new Set();
    for (const i of [x, ...dependent]) for (const c of new Set(checks[i])) expected.add(`shot:n${i}|${c}`);

    const scope = revalidationScope({ items }, `shot:n${x}`);
    assert.deepEqual(scope.invalidated, [...dependent].map((i) => `shot:n${i}`).sort());
    assert.deepEqual(new Set(scope.revalidated), new Set([`shot:n${x}`, ...scope.invalidated]));
    const got = scope.checks.map((c) => `${c.itemId}|${c.checkId}`);
    assert.equal(got.length, new Set(got).size, "no duplicate checks");
    assert.deepEqual(new Set(got), expected);
  }), { numRuns: 100 });
});

// ---- Property 12 ----
test("Property 12: selected strategy is never one already tried, until the class is exhausted", () => {
  // **Validates: Requirements 7.5, 7.6**
  fc.assert(fc.property(fc.constantFrom(...CLASSES), fc.boolean(), (cls, withConsent) => {
    const itemId = "shot:x";
    const project = { items: { [itemId]: { repairs: { [cls]: { attempts: 0, strategiesTried: [] } } } }, consents: withConsent ? [consent("material_change", itemId)] : [] };
    const tried = project.items[itemId].repairs[cls].strategiesTried;
    const table = strategiesFor(cls);
    const seen = [];
    for (let i = 0; i <= table.length; i++) {
      const r = selectStrategy(project, itemId, cls);
      if (r.exhausted) { assert.equal(tried.length, table.length); break; }
      if (r.consentRequired) {
        // Only after every non-material strategy was tried, and only when consent is absent.
        assert.equal(withConsent, false);
        assert.ok(r.consentRequired.materialChange);
        assert.ok(table.filter((s) => !s.materialChange).every((s) => tried.includes(s.id)));
        break;
      }
      assert.ok(!tried.includes(r.strategy.id), `${r.strategy.id} repeated`);
      assert.ok(table.some((s) => s.id === r.strategy.id));
      seen.push(r.strategy.id);
      tried.push(r.strategy.id);
    }
    assert.equal(new Set(seen).size, seen.length);
  }), { numRuns: 40 });
});

test("Property 12: beginRepair on disk never repeats a strategy while under budget", async () => {
  // **Validates: Requirements 7.5, 7.6**
  for (const cls of CLASSES) {
    const itemId = freshItem();
    setProject(dir, (p) => { p.items[itemId] = { kind: "shot", status: "pending" }; p.consents = [consent("material_change", itemId)]; });
    const used = [];
    for (let i = 0; i < budgetFor(cls); i++) {
      const r = beginRepair(dir, itemId, cls, { now: NOW });
      if (r.escalated) break;
      assert.deepEqual(r.errors, []);
      assert.ok(!used.includes(r.strategy));
      used.push(r.strategy);
    }
    assert.deepEqual(getProject(dir).items[itemId].repairs[cls].strategiesTried, used);
  }
});

// ---- Property 14 ----
test("Property 14: a repair action journals the invalidated and the re-validated items", () => {
  // **Validates: Requirements 7.4, 11.2, 11.6**
  fc.assert(fc.property(fc.integer({ min: 0, max: 4 }), fc.constantFrom(...CLASSES), (depCount, cls) => {
    const id = freshItem();
    const deps = Array.from({ length: depCount }, (_, i) => `${id}-d${i}`);
    setProject(dir, (p) => {
      p.items[id] = { kind: "shot", status: "pending", evidence: [ev("k1", "failed")] };
      deps.forEach((d, i) => { p.items[d] = { kind: "shot", status: "pending", inputs: { [i === 0 ? id : deps[i - 1]]: "item" }, evidence: [ev("k2", "passed")] }; });
    });
    const r = beginRepair(dir, id, cls, { now: NOW });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.scope.invalidated, [...deps].sort());
    assert.deepEqual(r.scope.revalidated, [id, ...[...deps].sort()]);
    const text = journalText(dir);
    assert.ok(text.includes(`invalidated=${JSON.stringify(r.scope.invalidated)}`));
    assert.ok(text.includes(`revalidate=${JSON.stringify(r.scope.checks)}`));
    assert.ok(text.includes(`${id} ${cls} strategy=${r.strategy}`));
    assert.equal(getProject(dir).items[id].state, "repairing");
  }), { numRuns: NUM_RUNS });
});

// ---- Property 7 ----
const materialCases = CLASSES.flatMap((cls) => strategiesFor(cls).filter((s) => s.materialChange).map((s) => [cls, s]));

// Marks every other strategy as tried so the Material_Change one is the only candidate.
function seedOthersTried(itemId, cls, material) {
  setProject(dir, (p) => {
    p.items[itemId] = { kind: "shot", status: "pending", repairs: { [cls]: { attempts: 0, strategiesTried: strategiesFor(cls).filter((s) => s.id !== material.id).map((s) => s.id) } } };
    delete p.consents;
  });
}

test("Property 7: a material-change strategy applies iff a matching consent record exists", () => {
  // **Validates: Requirements 7.8, 7.9, 7.10**
  assert.ok(materialCases.length > 0, "tables define at least one Material_Change strategy");
  const consentArb = fc.constantFrom("none", "item", "item#strategy", "wrong-kind", "legacy-approval", "wrong-scope", "wrong-strategy");
  fc.assert(fc.property(fc.constantFrom(...materialCases), consentArb, ([cls, material], kind) => {
    const itemId = freshItem();
    seedOthersTried(itemId, cls, material);
    const consents = {
      none: [],
      item: [consent("material_change", itemId)],
      "item#strategy": [consent("material_change", `${itemId}#${material.id}`)],
      "wrong-kind": [consent("publication", itemId)],
      "legacy-approval": [consent("legacy_approval", itemId), consent("legacy_approval", `${itemId}#${material.id}`)],
      "wrong-scope": [consent("material_change", `${itemId}-other`)],
      "wrong-strategy": [consent("material_change", `${itemId}#not-${material.id}`)],
    }[kind];
    setProject(dir, (p) => { p.consents = consents; });
    const allowed = kind === "item" || kind === "item#strategy";
    const before = getProject(dir).items[itemId];
    const r = beginRepair(dir, itemId, cls, { now: NOW });
    if (allowed) {
      assert.deepEqual(r.errors, []);
      assert.equal(r.strategy, material.id);
      assert.equal(getProject(dir).items[itemId].state, "repairing");
    } else {
      assert.equal(r.errors[0]?.rule, "CONSENT-REQUIRED");
      assert.deepEqual(getProject(dir).items[itemId], before, "refused action leaves the item untouched");
      // Forcing the strategy does not bypass consent.
      assert.equal(beginRepair(dir, itemId, cls, { now: NOW, strategy: material.id }).errors[0]?.rule, "CONSENT-REQUIRED");
    }
  }), { numRuns: NUM_RUNS });
});

test("Property 7: non-material repairs proceed without asking for consent", () => {
  // **Validates: Requirements 7.8, 7.9**
  for (const cls of CLASSES) {
    const itemId = freshItem();
    setProject(dir, (p) => { p.items[itemId] = { kind: "shot", status: "pending" }; delete p.consents; });
    const r = beginRepair(dir, itemId, cls, { now: NOW });
    assert.deepEqual(r.errors, []);
    assert.equal(strategiesFor(cls).find((s) => s.id === r.strategy).materialChange, false);
  }
});

// ---- Unit tests ----
test("every defined error class has at least one strategy and the documented budget", () => {
  // Requirement 7.1
  const documented = { "asset-regeneration": 2, "scene-lint": 3, "patch-rejection": 3, default: 2 };
  for (const cls of CLASSES) {
    assert.ok(strategiesFor(cls).length >= 1, cls);
    assert.equal(budgetFor(cls), documented[cls], cls);
    assert.equal(REPAIR_BUDGETS[cls], documented[cls]);
    const ids = strategiesFor(cls).map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${cls} strategy ids are unique`);
  }
  assert.deepEqual(Object.keys(documented).sort(), CLASSES.sort());
  assert.equal(strategiesFor("unknown-class"), REPAIR_STRATEGIES.default);
  assert.equal(budgetFor("unknown-class"), REPAIR_BUDGETS.default);
});

test("beginRepair escalates to needs_input when the budget is spent", () => {
  const cls = "asset-regeneration";
  const itemId = freshItem();
  setProject(dir, (p) => { p.items[itemId] = { kind: "shot", status: "pending" }; delete p.consents; });
  for (let i = 0; i < budgetFor(cls); i++) assert.equal(beginRepair(dir, itemId, cls, { now: NOW }).escalated, false);
  const r = beginRepair(dir, itemId, cls, { now: NOW });
  assert.equal(r.escalated, true);
  assert.equal(r.state, "needs_input");
  assert.equal(r.strategiesTried.length, budgetFor(cls));
});

test("beginRepair rejects unknown items", () => {
  assert.equal(beginRepair(dir, "shot:missing", "scene-lint", { now: NOW }).errors[0].rule, "REPAIR-ITEM");
});

test("raster replan ranks by fit desc, then cost asc, then fix id", () => {
  // Requirement 7.7
  const cands = [
    { fix: "c", fit: 0.5, cost: 1 },
    { fix: "b", fit: 0.9, cost: 5 },
    { fix: "a", fit: 0.9, cost: 5 },
    { fix: "d", fit: 0.9, cost: 2 },
  ];
  const r = chooseRasterReplan(cands);
  assert.equal(r.chosen.fix, "d");
  assert.deepEqual(r.rejected.map((c) => c.fix), ["a", "b", "c"]);
  assert.deepEqual(chooseRasterReplan([]), { chosen: null, rejected: [] });
  assert.deepEqual(chooseRasterReplan(undefined), { chosen: null, rejected: [] });
  assert.equal(cands[0].fix, "c", "input is not mutated");
});

test("recordRasterReplan journals the chosen fix and rejected alternatives", () => {
  // Requirement 7.7
  const cands = [{ fix: "inpaint", fit: 0.4, cost: 1 }, { fix: "regen", fit: 0.8, cost: 3 }];
  const r = recordRasterReplan(dir, "shot:s1", cands, { now: NOW });
  assert.equal(r.chosen.fix, "regen");
  const text = journalText(dir);
  assert.ok(text.includes(`chosen=${JSON.stringify(cands[1])}`));
  assert.ok(text.includes(`rejected=${JSON.stringify([cands[0]])}`));
  assert.equal(recordRasterReplan(dir, "shot:s1", [], { now: NOW }).errors[0].rule, "REPLAN-NONE");
});
