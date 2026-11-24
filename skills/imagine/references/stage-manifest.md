# Stage manifest

Additional files to read per stage, on top of the common files in SKILL.md section 3.1. A trailing `?` means read the file in full if it exists, but do not require it before the stage that creates it. `U`, `P`, `R` are defined in SKILL.md section 3.1.

| Stage | Additional plugin files | Additional project files |
|---|---|---|
| Bootstrap/new | None | None before creation; read `P/project.yaml`, `P/journal.md` immediately afterward |
| Resume/status | None | `P/script/raw.md?`, `U?`, `P/bible.yaml?`, `P/style.md?`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| G0 lock/reconsideration | None | `P/style.md?`, `P/review/REVIEW.md?` |
| Script ingestion/G1 | `R/skills/imagine-canon/SKILL.md` | `P/script/raw.md`, `U?`, `P/bible.yaml?`, `P/style.md?` |
| Bible/casting/G2 | `R/skills/imagine-canon/SKILL.md` | `U`, `P/bible.yaml?`, `P/style.md?`, `P/assets/manifest.yaml?` |
| Style/G3 | `R/skills/imagine-canon/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md?` |
| Storyboard planning/audit | `R/skills/imagine-plan/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| Previz planning/audit | `R/skills/imagine-plan/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| FX planning/audit | `R/skills/imagine-plan/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| Production plan/G4 | `R/skills/imagine-plan/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| Canonical refs/G5r | `R/skills/imagine-generate/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| Audio/G5a | `R/skills/imagine-generate/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| Batch images/G5b | `R/skills/imagine-generate/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?` |
| FX implementation/shot audit | `R/skills/imagine-edit/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/review/REVIEW.md?`, `P/review/check.json?` |
| Timeline/rough mix/G6 | `R/skills/imagine-edit/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/assets/CREDITS.md?`, `P/review/REVIEW.md?`, `P/review/check.json?` |
| Render/QC/G7 | `R/skills/imagine-deliver/SKILL.md` | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md`, `P/assets/manifest.yaml`, `P/assets/CREDITS.md`, `P/review/REVIEW.md`, `P/review/check.json?`, `P/review/qc.json?` |
| Upstream impact/review | Relevant owner skill | `U`, `P/bible.yaml`, `P/style.md`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md?` |
| Waiver/review audit | Relevant owner skill | `P/bible.yaml`, `P/style.md`, `P/STORY.md?`, `P/assets/manifest.yaml?`, `P/review/REVIEW.md` |
| Gate recording/journal | Relevant owner skill | Corresponding gate-stage files and approval evidence |
