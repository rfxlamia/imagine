# Imagine — HARD Waivers and REVIEW.md Lifecycle

This reference is mandatory before any waiver proposal, approval,
verification, invalidation, revocation, or waiver-related gate,
render, or delivery decision.

It implements the waiver policy without adding kit commands.

## 1. Authority and restrictions

Only the user may grant or revoke a HARD waiver. The main agent may
prepare a proposed entry; subagents may neither propose nor grant
waivers. <!-- rule:HARD-WAIVER-USER-ONLY -->

Every waiver must identify exactly one HARD rule and explicit scoped
source item IDs; never accept `all`, a wildcard, a pattern, or an
unbounded project-wide exception. <!-- rule:HARD-WAIVER-SCOPED -->

A waiver must include the user's reason, its concrete consequence,
and the alternative manual check before it becomes active.
<!-- rule:HARD-WAIVER-REASONED -->

Record source hashes for its individual items from the actual
`imagine-kit status --ref <items>` response's `data.sources` values;
a changed item hash invalidates the waiver. <!-- rule:HARD-WAIVER-HASH-BOUND -->

Preserve waivers and verbatim user quotations in the REVIEW.md
waiver section; list active waivers by ID, rule, and items in
the final delivery note. <!-- rule:HARD-WAIVER-LISTED -->

Before every gate, render, and delivery, verify each active waiver's
user quote, scoped items, and current hashes; incomplete or
hash-mismatched waivers cannot bypass their HARD rule.
<!-- rule:HARD-WAIVERS-VALID -->

Never propose or accept waivers for gate quotes, patch/key
isolation, base revision, guard integrity, asset approvals and
hashes including canonical refs, audio licensing, placeholders,
a playable MP4 conforming to G0 specifications, or the raster
quality floor: no `replan` tier may ship; a `soft` tier needs
explicit G4 and G5b acceptance.
<!-- rule:HARD-NON-WAIVABLE -->
<!-- rule:HARD-RASTER-TIER -->

Non-waivable failures must be corrected before proceeding.

A waiver cannot substitute for an unrelated missing capability
or create an implementation that does not exist.

## 2. REVIEW.md placement and format

The section belongs in `review/REVIEW.md`:

1. After P0/P1/P2 findings and retained advisory notes.
2. Before the final delivery note.
3. Without deleting earlier waiver entries or their history.

Use the exact following section and field names:

## Waivers

### W-001 HARD-<RULE-ID>
- status: proposed
- rule: HARD-<RULE-ID>
- items: shot:s03.previz, asset:bg-harbor.v2
- item_hashes: shot:s03.previz=<64-hex>, asset:bg-harbor.v2=<64-hex>
- reason: <the user's reason>
- consequence: <what the film or delivery loses while waived>
- manual_check: <what the user checks instead>
- asked: "<the exact question asked by the main agent>"
- quote: "<the user's verbatim answer>"
- granted: <YYYY-MM-DD>
- history: proposed <YYYY-MM-DD>

Values shown are examples, not real approvals or hashes.

Replace them only with actual project evidence and user statements.

Supported `status` values:

- `proposed`
- `active`
- `revoked`
- `invalid`

Supported source item forms from the source-format contract:

- `shot:<sNN>.<stage>`
- `asset:<id>.v<N>`
- `unit:<L##|T##>`
- `file:<relpath>`

Items must be explicit. No `all`, ranges, glob patterns, or
unstated implied dependencies.

## 3. Proposal

The main agent may create a `proposed` entry containing:

- `rule`
- `items`
- `item_hashes`
- `reason`
- `consequence`
- `manual_check`
- `status: proposed`
- initial `history`

Before proposal:

1. Confirm the rule is waivable.
2. Identify the affected source items explicitly.
3. Query their hashes using the supported status operation.
4. Copy `data.sources` values without computing them by hand.
5. State what the production or delivery loses if waived.
6. Identify the manual check or alternative evidence.
7. Ask the user a specific waiver question.

Subagents must report the underlying failure rather than suggest
or record waiver proposals.

A proposal is not approval. Do not enter fabricated `asked`,
`quote`, or `granted` values as evidence of activation.

## 4. Activation

Only an explicit user answer to the particular waiver question
may activate that proposal.

On a valid answer:

1. Record the exact question in `asked`.
2. Record the user's verbatim answer in `quote`.
3. Record the real grant date in `granted`.
4. Re-query scoped hashes and ensure they still match.
5. Set `status: active`.
6. Append the activation date to `history`.
7. Journal the state transition and exact evidence.

If the user refuses, requests a different scope, or merely asks
to change the project, do not activate the proposal.

If the rule or source scope changes, prepare a new proposal
and ask a new question.

A gate approval is not automatically a waiver approval.

## 5. Hash-bound validation

Before every gate, render, and delivery:

1. Read `review/REVIEW.md` in full.
2. Locate all `active` entries.
3. Query status for every explicit scoped item.
4. Read current `data.sources` values.
5. Compare each current hash with `item_hashes`.
6. Verify an actual user answer exists in `quote`.
7. Verify the original question is in `asked`.
8. Verify the entry has a real `granted` date.
9. Verify the rule remains waivable.
10. Apply only valid waivers to their exact scoped rule/items.

If a scoped item changes:

- Set `status: invalid`.
- Append `invalid <date> <ref> changed` to `history`.
- Preserve the original entry and quote.
- Restore the corresponding HARD rule's failing status.
- Journal the invalidation.
- Ask again if another waiver is appropriate.

Never silently update the old `item_hashes` to the new content.

Never delete an invalid entry to conceal a previous exception.

## 6. Revocation

Only the user's words may revoke a waiver.

On explicit revocation:

1. Set `status: revoked`.
2. Append `revoked <date> "<quote>"` to `history`.
3. Preserve all original grant evidence.
4. Journal the revocation.
5. Restore the HARD requirement for the affected scope.
6. Re-evaluate downstream readiness.

Do not treat silence, an unrelated project edit, or an agent's
judgement as revocation.

## 7. Advisory findings versus waivers

Advisory findings do not require waivers. Preserve them with
reasons in REVIEW.md.

The D10 HyperFrames allowance is automatic advice only when
`contrast_aa_failure` occurs inside a verified shader-transition
window.

It is not an agent-granted waiver, not a user-granted waiver,
and must not create a waiver entry.

Every other HyperFrames strict-check error or warning blocks.

A user may grant a scoped waiver only for an otherwise waivable
HARD rule, never for one of the explicitly non-waivable rules.

## 8. Delivery disclosure

The delivery note must list every currently active waiver with:

- Waiver ID.
- Exact HARD rule.
- Explicit scoped item IDs.
- Consequence and manual alternative.
- Any relevant limitation on the delivered work.

Never list revoked or invalid waivers as active.

Keep their historical entries in REVIEW.md for auditability.

If an active waiver becomes invalid during final rendering or
delivery verification, stop delivery until the underlying rule
passes or a new valid user waiver is granted.
