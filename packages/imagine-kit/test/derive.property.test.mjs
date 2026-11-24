import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { deriveItemState, dependencyGraph, transitiveDependents, addDependencyEdge, ITEM_STATES } from "../src/derive.mjs";

const RESULTS = ["passed", "failed", "not_run"];
const evidence = fc.array(
  fc.record({ checkId: fc.constantFrom("c1", "c2", "c3"), result: fc.constantFrom(...RESULTS) }),
  { maxLength: 8 },
);
const storedState = fc.constantFrom(undefined, "pending", "validating", "failed", "repairing", "needs_input", "ready", "passed", "published");

const latest = (ev) => { const m = new Map(); for (const e of ev) m.set(e.checkId, e); return [...m.values()]; };

// Acyclic by construction: node i may depend only on nodes j < i.
const dagRecords = fc.integer({ min: 1, max: 9 }).chain((n) =>
  fc.tuple(...Array.from({ length: n }, (_, i) =>
    i === 0 ? fc.constant([]) : fc.subarray(Array.from({ length: i }, (_, j) => `n${j}`)))).map((deps) =>
    Object.fromEntries(deps.map((d, i) => [`n${i}`, { inputs: Object.fromEntries(d.map((x) => [x, "item"])) }]))));

// Feature: autonomous-quality-gates, Property 2: `passed` state is derivable only from Evidence_Records
// **Validates: Requirements 6.3**
test("Property 2: passed/published require every latest evidence record to be passed", () => {
  fc.assert(fc.property(evidence, storedState, fc.boolean(), (ev, state, withConsents) => {
    const consents = withConsents ? [{ kind: "publication", scope: "x" }, { kind: "approval", scope: "x" }] : [];
    const derived = deriveItemState({ state, evidence: ev }, consents, "x");
    assert.ok(ITEM_STATES.includes(derived));
    const l = latest(ev);
    const allPassed = l.length > 0 && l.every((e) => e.result === "passed");
    if (derived === "passed" || derived === "published") assert.ok(allPassed);
    if (!allPassed) assert.notEqual(derived, "passed");
  }), { numRuns: 200 });
});

test("Property 2: consent without passed evidence never yields passed", () => {
  fc.assert(fc.property(evidence, storedState, (ev, state) => {
    const l = latest(ev);
    fc.pre(!(l.length > 0 && l.every((e) => e.result === "passed")));
    const consents = [{ kind: "publication", scope: "x" }, { kind: "approval", scope: "x" }];
    assert.notEqual(deriveItemState({ state, evidence: ev }, consents, "x"), "passed");
    assert.notEqual(deriveItemState({ state, evidence: ev }, consents, "x"), "published");
  }), { numRuns: 200 });
});

// Feature: autonomous-quality-gates, Property 8: Stale propagation from a changed input hash
// **Validates: Requirements 6.10, 9.3, 9.4**
test("Property 8: changed items stale exactly their transitive dependents", () => {
  fc.assert(fc.property(dagRecords, fc.array(fc.nat(8), { maxLength: 4 }), (records, picks) => {
    const ids = Object.keys(records);
    const changed = new Set(picks.map((p) => ids[p % ids.length]));
    const graph = dependencyGraph(records);
    const dependents = transitiveDependents(graph, changed);
    // reference closure: iterate to fixpoint
    const expected = new Set();
    let grew = true;
    while (grew) {
      grew = false;
      for (const id of ids) {
        if (expected.has(id)) continue;
        if (graph[id].some((d) => changed.has(d) || expected.has(d))) { expected.add(id); grew = true; }
      }
    }
    assert.deepEqual([...dependents].sort(), [...expected].sort());
    // items outside the closure and not changed are unaffected
    for (const id of ids) if (!changed.has(id) && !expected.has(id)) assert.ok(!dependents.has(id));
  }), { numRuns: 200 });
});

// Feature: autonomous-quality-gates, Property 20: Dependency DAG stays acyclic
// **Validates: Requirements 9.5**
const hasCycle = (graph) => {
  const color = {};
  const visit = (n) => {
    if (color[n] === 1) return true;
    if (color[n] === 2) return false;
    color[n] = 1;
    for (const d of graph[n] ?? []) if (visit(d)) return true;
    color[n] = 2;
    return false;
  };
  return Object.keys(graph).some(visit);
};

test("Property 20: cycle-forming insertions are rejected and the graph stays acyclic", () => {
  const node = fc.constantFrom("a", "b", "c", "d", "e", "f");
  fc.assert(fc.property(fc.array(fc.tuple(node, node), { maxLength: 40 }), (edges) => {
    const graph = {};
    for (const [id, dep] of edges) {
      const before = JSON.stringify(graph);
      const res = addDependencyEdge(graph, id, dep);
      if (res.ok) assert.ok(!hasCycle(graph));
      else {
        assert.ok(JSON.stringify(res.errors[0]).includes("DAG-CYCLE"));
        assert.equal(JSON.stringify(graph), before);
      }
      assert.ok(!hasCycle(graph));
    }
  }), { numRuns: 200 });
});

test("Property 20: self-edge and direct back-edge are rejected", () => {
  const g = {};
  assert.equal(addDependencyEdge(g, "a", "a").ok, false);
  assert.equal(addDependencyEdge(g, "a", "b").ok, true);
  assert.equal(addDependencyEdge(g, "b", "a").ok, false);
});
