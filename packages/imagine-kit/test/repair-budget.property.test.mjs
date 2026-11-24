import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { REPAIR_BUDGETS, budgetFor, recordRepairAttempt, budgetExhausted } from "../src/repair.mjs";
import { makeProject, getProject } from "./helpers/fixture.mjs";

const NUM_RUNS = 30;
const NOW = new Date("2025-01-01T00:00:00Z");
const itemIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/).map((s) => `shot:${s}`);
const classArb = fc.oneof(
  fc.constantFrom("asset-regeneration", "scene-lint", "patch-rejection", "default"),
  fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
);
const strategyArb = fc.stringMatching(/^[a-z]{1,8}$/);
const keyArb = fc.tuple(itemIdArb, classArb);

const { dir } = await makeProject();
let counter = 0;
const freshItem = () => `shot:p${counter++}`;

const attemptsOf = (itemId, cls) => getProject(dir).items[itemId]?.repairs?.[cls]?.attempts ?? 0;

test("Property 11: each attempt increments its own pair by exactly one and leaves other pairs untouched", () => {
  // **Validates: Requirements 7.3**
  fc.assert(fc.property(
    fc.array(fc.tuple(fc.constantFrom(0, 1), fc.constantFrom("scene-lint", "asset-regeneration"), strategyArb), { minLength: 1, maxLength: 6 }),
    (ops) => {
      const items = [freshItem(), freshItem()];
      const expected = new Map();
      for (const [i, cls, strategy] of ops) {
        const k = `${items[i]}|${cls}`;
        const before = new Map();
        for (const it of items) for (const c of ["scene-lint", "asset-regeneration"]) before.set(`${it}|${c}`, attemptsOf(it, c));
        const r = recordRepairAttempt(dir, items[i], cls, strategy, { now: NOW });
        expected.set(k, (expected.get(k) ?? 0) + 1);
        assert.equal(r.attempts, before.get(k) + 1);
        assert.equal(r.strategiesTried.at(-1), strategy);
        for (const [key, b] of before) {
          if (key === k) continue;
          const [it, c] = key.split("|");
          assert.equal(attemptsOf(it, c), b);
        }
      }
      for (const [key, n] of expected) {
        const [it, c] = key.split("|");
        assert.equal(attemptsOf(it, c), n);
      }
    },
  ), { numRuns: NUM_RUNS });
});

test("Property 13: budgetExhausted is true iff attempts >= budgetFor(errorClass)", () => {
  // **Validates: Requirements 7.5**
  fc.assert(fc.property(
    itemIdArb, classArb, fc.integer({ min: 0, max: 6 }),
    (itemId, cls, attempts) => {
      const project = attempts === 0 ? { items: {} } : { items: { [itemId]: { repairs: { [cls]: { attempts, strategiesTried: [] } } } } };
      assert.equal(budgetExhausted(project, itemId, cls), attempts >= budgetFor(cls));
    },
  ), { numRuns: 100 });
});

test("Property 13: exhaustion flips exactly when recorded attempts reach the budget", () => {
  // **Validates: Requirements 7.5**
  fc.assert(fc.property(
    fc.constantFrom("asset-regeneration", "scene-lint", "patch-rejection", "unknown-class"),
    (cls) => {
      const itemId = freshItem();
      const budget = budgetFor(cls);
      assert.equal(budget, REPAIR_BUDGETS[cls] ?? REPAIR_BUDGETS.default);
      for (let n = 1; n <= budget; n++) {
        assert.equal(budgetExhausted(getProject(dir), itemId, cls), false);
        recordRepairAttempt(dir, itemId, cls, `s${n}`, { now: NOW });
        assert.equal(budgetExhausted(getProject(dir), itemId, cls), n >= budget);
      }
    },
  ), { numRuns: 12 });
});
