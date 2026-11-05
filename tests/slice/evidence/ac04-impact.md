# AC4 impact report (slice-landscape)

User request in the slice session: "Change Mara's hair in the bible to a short red bob and tell me what that affects. Do not regenerate anything yet."

The agent's report below came before the edit. It asked for authorization first because `characters.mara` was approved at G2. Copied verbatim from the slice session.

---

I haven't edited anything. Before I can change an approved bible entry, I have to show you the impact and get your explicit yes. Here is exactly what the change would touch, based on the project's recorded dependencies.

The change

bible.yaml → characters.mara.hair: from "short cropped dark hair streaked with grey" to "short red bob". Her age (about 55) and the rest of her description would stay as they are. One note: the grey streaks go, so the "about 55" now comes from her face alone.

What it affects

Reopens, in order:

| Item | What happens |
|---|---|
| G2 bible:characters.mara | Becomes stale as soon as the file changes, and you re-approve it. This is the only thing the kit marks automatically. |
| Canonical ref mara-sheet.v1 | It shows the old hair, so it must be regenerated as v2 and re-approved at G5r. |
| Plates s01, s02, s03 | Each is conditioned on the old sheet, so each needs a new version. They go stale once the new sheet exists. |
| G5b | All three new plates need fresh approval. Soft-tier consent doesn't carry over, so you'd accept q 0.83 again per plate. |
| Scenes s01, s02, s03 | Their files name the old plates, so they need re-pointing, re-linting and re-promoting. The s03 amber panes and beam must be re-measured against the new plate. |
| Draft, G6, final, G7 | New draft, new G6, a new keeper-3.v2.mp4, and a new G7. |

Not affected: the script (G1), narrator voice and the "meira" pronunciation, the three VO takes and the SFX (G5a stays approved), the lighthouse exterior and lamp-room v2 references, and the world and location entries. STORY.md doesn't mention hair, so no patch is needed. The delivered keeper-3.v1.mp4 stays immutable and accepted.

Two things you may not expect

1. Red hair conflicts with the approved style. The style allows no warm colour except lamp amber (palette and banned). You already exempted skin tone. Red hair beside the amber beam in s03 also competes with the film's single warm note.
2. The G4 plan mentions her hair. The approved sheet prompt in plan.yaml says "dark hair streaked with grey", and several prompts say "no warm colours". Editing the plan reopens G4.

Cost

At least 4 image generations (1 sheet plus 3 plates), with a reserve. Earlier, s02 and s03 took three attempts each to get the composition close. Three more review rounds and a fresh G6 and G7 follow. Nothing audio-related is redone.

Decisions I need

1. Authorize the bible edit exactly as stated above, and the reopenings in the table?
2. Red hair vs the style: (a) a recorded exemption like skin, leaving the style untouched (my recommendation), or (b) changing the style's palette and banned anchors. (b) reopens G3 for those two anchors and also makes the previz of all three shots and the s03 effects stale.
3. How to regenerate: (a) edit the sheet and plate prompts in plan.yaml and re-approve G4, which keeps the audit trail honest (my recommendation), or (b) keep the plan unchanged and pass the hair change as a regeneration note. That's lighter, but then the approved plan and what was actually generated disagree.

Answer those three, for example "yes, 2a, 3a", and I'll make the edit and stop there. Regeneration only starts when you say so.

---

## After the edit (agent's report, verbatim excerpt)

> - G2 is reopened. Only bible:characters.mara is stale, so Mara's bible item needs your re-approval.
> - Other gates still say approved. G4, G5r, G5b, G6 and G7 show approved. That's because their recorded inputs don't include the bible hash. They would only go stale once a new Mara sheet version exists.
> - Review hints: the kit lists the three storyboards and three previz items as "watch" items, hints only, not stale.

## Verdict (dev session)

FAIL against the plan's AC4 text, though the kit follows its contract.

- `ac04-status.json` `newly_stale`: only `bible:characters.mara`. `mara-sheet.v1` and the plates citing it are not stale. Under `docs/contracts/source-formats.md` section 7, an asset records the G4 plan (`file:assets/plan.yaml`) and its refs, not the bible entries it depicts. The bible is a `watch` hint on storyboard/previz only.
- Impact report: names the mara sheet, s01-s03 plates, scenes, G6/G7 as needing redo, and the storyboards/previz as review hints. The plan wants those marked `needs_review`; the agent reported them as kit watch hints.
- Manifest and `post/keeper-3.v1.mp4` (sha256 3815d9f0...) unchanged.
- Follow-up: imagine-z8p.6.15 (decide whether ref/img assets should go stale when a bible entity they depict changes).
