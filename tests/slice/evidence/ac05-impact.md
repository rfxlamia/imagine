# AC5 impact report (slice-landscape)

User request in the slice session: "Change narration line L02 to 'Tonight the sea was calm, and no ship was coming.' and tell me what that affects. Do not regenerate anything yet." The user then answered "yes" to the agent's authorization question.

Agent's reports copied verbatim from the slice session:

---

I haven't edited anything, and nothing is regenerated. Here is the impact of changing L02 from "…the sea was quiet…" to "…the sea was calm…". The edit would be one word in script/narration.md.

What it reopens

| Item | What happens |
|---|---|
| G1 unit:L02 | Becomes stale when I edit the file, and you re-approve it. L01 and L03 are untouched. |
| VO L02.v1 | The approved take says "quiet", so it goes stale. It needs a new take (v2) and your G5a re-listening for L02 only. L01, L03 and the SFX stay approved. |
| Previz, all three shots | This is the mechanical surprise. Each shot's recorded inputs include every script line, so the kit marks s01, s02 and s03 previz stale, even though s01 and s03 don't change. Refreshing them means one new previz patch round for all three. Content should be identical, except s02's timing if the new VO length differs. |
| s03 effects plan | It depends on its previz, so it goes stale too and needs one FX patch refresh. |
| Scenes s01 to s03 | All three edit items go stale and need re-promoting. Only s02 has real work: its caption text and possibly its timing. |
| Draft, G6, final, G7 | New draft, a fresh G6, a new keeper-3.v2.mp4, a new G7. |

Unaffected

- Images: all references and plates (G5r and G5b stay approved), because nothing visual is tied to that word.
- Canon and plan: the bible and style (G2 and G3, apart from the separate Mara hair item), plan.yaml, and G4, since STORY.md doesn't change.
- Delivered film: keeper-3.v1.mp4 stays immutable and accepted.

Semantic checks (my judgment, nothing changes unless you say so)

- Scene text: the s02 title in STORY.md, "A quiet sea", is now slightly off from the line. I'd leave it, since changing it needs a storyboard patch that cascades again.
- Canon: "calm" fits world.night ("oily and still"), introduces no new names, and needs no pronunciation entry. The "l" in "calm" is silent, so the voice might say it wrong. If it does, the fix is a respelling in the bible.

Timing and cost

- Timing: the old take is 3.28 s. In the 4.5 s shot, the line ends at 3.78 s, leaving 0.72 s of slack, and the film has 1.5 s of headroom under 15 s. A new take within 0.1 s of the old one can be retimed automatically. Anything longer reopens previz, which is stale anyway.
- Cost: no image generation. It needs one voice take (seconds, with maybe a redo), one previz round, one FX round, an s02 scene edit, three promotions, then a draft, review and final.

Decision needed

Do you authorize this exact edit to script/narration.md and the reopenings listed above? Two defaults apply unless you say otherwise:
- script/raw.md stays as your original wording, so it will differ from narration.md.
- The s02 title stays "A quiet sea".

A plain "yes" applies both defaults. After that I'll make the one-word edit and stop, as with the hair.

---

After the edit (excerpt):

> - Reopened gates: G1, G5a, G6 and G7. G2 is also reopened, from the earlier hair edit.
> - Still approved: G3, G4, G5r and G5b. No image or plan changes are implied by this edit.
> - Stale items: the L02 script unit and the L02 voice take; previz for all three shots, as predicted, plus the s03 effects plan; the three scene edits; the draft, G6, the v1 final render and G7.
> The delivered keeper-3.v1.mp4 stays immutable and accepted.

## Verdict (dev session)

PARTIAL against the plan's AC5 text.

- `ac05-status.json` `newly_stale` includes `unit:L02` and `asset:L02.v1` (the L02 VO), plus `shot:s02.previz` (the shot that uses L02). It also includes `shot:s01.previz`, `shot:s03.previz` and `shot:s03.fx`, which do not use L02, and the downstream `edit:s01..s03`, `render:draft`, `g6`, `render:keeper-3.v1`, `g7`.
- Cause: the single previz patch declares `inputs.units` L01-L03 at patch level. The kit records the whole declared set on every touched shot (`docs/contracts/source-formats.md` section 9).
- The agent's impact report predicted the over-propagation exactly. It names every reopened item before the edit, and the kit state after the edit matches it.
- Manifest and `post/keeper-3.v1.mp4` (sha256 3815d9f0...) unchanged.
- Follow-up: imagine-z8p.6.16.
