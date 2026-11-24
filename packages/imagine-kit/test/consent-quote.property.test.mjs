import { test, before } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { recordConsent } from "../src/consent.mjs";
import { isBlankQuote } from "../src/gates.mjs";
import { makeProject, getProject, NOW } from "./helpers/fixture.mjs";

// Feature: autonomous-quality-gates, Property 6: Consent quote validity
// **Validates: Requirements 6.8, 6.9**

let dir;
before(async () => { ({ dir } = await makeProject()); });

const count = () => (getProject(dir).consents ?? []).length;
const attempt = (quote) => recordConsent(dir, { scope: "s01", quote, kind: "material_change", now: NOW });

const INVISIBLE = ["", " ", "\t", "\n", "\r\n", "\u00a0", "\u2003", "\u200b", "\u200d", "\u2060", "\ufeff", "\u2800", "\u3164", "\u115f", "\u1160", "\uffa0", "\u0301"];
const blankQuote = fc.array(fc.constantFrom(...INVISIBLE), { maxLength: 12 }).map((a) => a.join(""));

const BOILERPLATE = [
  "approved", "user approved", "the user approves", "approved by the agent", "auto approved", "consent granted",
  "user consents", "n a", "none", "tbd", "placeholder", "lorem ipsum", "confirmed by agent",
];
const boilerplateQuote = fc.record({
  phrase: fc.constantFrom(...BOILERPLATE),
  upper: fc.boolean(),
  pre: fc.constantFrom("", " ", "  ", "\n", "\u200b"),
  post: fc.constantFrom("", ".", "!", " ", "...", "\t"),
}).map(({ phrase, upper, pre, post }) => `${pre}${upper ? phrase.toUpperCase() : phrase}${post}`);

const GENUINE = [
  "yes go ahead and change the ending to the sunrise", "I want the lamp scene replaced with the harbor",
  "ok, publish it to youtube", "sure, swap the narrator voice for a calmer one", "go for it",
  "make it shorter, around twelve seconds", "Yes. Use the blue palette instead.",
];
const genuineQuote = fc.tuple(fc.constantFrom(...GENUINE), fc.integer({ min: 0, max: 999 }))
  .map(([g, n]) => `${g} ${n}`);

test("blank, whitespace-only and invisible-only quotes are rejected with GATE-QUOTE", () => {
  fc.assert(fc.property(blankQuote, (q) => {
    const before = count();
    const r = attempt(q);
    assert.ok(r.errors.length > 0);
    assert.ok(JSON.stringify(r.errors).includes("GATE-QUOTE"));
    assert.equal(r.consent, undefined);
    assert.equal(count(), before);
  }), { numRuns: 100 });
});

test("boilerplate quotes are rejected regardless of case, padding and trailing punctuation", () => {
  fc.assert(fc.property(boilerplateQuote, (q) => {
    const before = count();
    const r = attempt(q);
    assert.ok(JSON.stringify(r.errors).includes("GATE-QUOTE"));
    assert.equal(r.consent, undefined);
    assert.equal(count(), before);
  }), { numRuns: 100 });
});

test("genuine user quotes are accepted and stored verbatim", () => {
  fc.assert(fc.property(genuineQuote, (q) => {
    const before = count();
    const r = attempt(q);
    assert.deepEqual(r.errors, []);
    assert.equal(r.consent.quote, q);
    assert.equal(count(), before + 1);
  }), { numRuns: 100 });
});

test("for any string, a quote that is blank is never accepted", () => {
  fc.assert(fc.property(fc.string({ unit: "binary" }), (q) => {
    const before = count();
    const r = attempt(q);
    if (isBlankQuote(q)) {
      assert.ok(r.errors.length > 0);
      assert.equal(count(), before);
    } else if (r.errors.length === 0) {
      assert.equal(count(), before + 1);
    } else {
      assert.equal(count(), before);
    }
  }), { numRuns: 100 });
});
