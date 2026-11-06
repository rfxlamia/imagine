# Image Generation and Resolution Reference

## 1. Image responsibilities

Generate two distinct classes of image:
1. Canonical refs, located under `assets/refs/`, generated after G4 and reviewed at G5r.
2. Batch shot assets, located under `assets/img/`, generated only from current G5r-approved references and reviewed at G5b.

Maintain distinct asset IDs and immutable `.vN` identities.

Never interpret a reference image approval as approval of a derived shot image.

## 2. Prompt compilation

Compile each prompt from:
- Shot ID, subject, action, and planned visual function.
- Bible entity IDs and exact identity descriptions.
- `style.md` approved `prompt-tokens`.
- Shot-specific framing, lens/composition intent, pose, scale, and aspect ratio.
- G4 resolution budget and planned source dimensions.
- Approved canonical references and exact version/hash.
- Negative constraints from the style `banned` section.
- Applicable continuity and background constraints.

Required batch prompt structure:

`[SHOT/ASSET ID] [SUBJECT + BIBLE IDENTITY] [ACTION] [STYLE TOKENS] [EXPLICIT FRAMING AND COMPOSITION] [ASPECT + SIZE TARGET] [REFERENCE PURPOSE] [NEGATIVES]`

Keep the compiled prompt verbatim as submitted. Do not let a model's rewritten prompt silently replace it.

Retain:
- `compiled_prompt`
- `revised_prompt` from the real generation response, or explicitly `not reported`
- Input bible/style/shot hashes
- Reference IDs and versions
- Requested size hint
- Attempt number and actual outcome
- Output hash, dimensions, and review disposition

If the prompt requires an unauthorized canon change, stop and request upstream impact approval before regenerating.

## 3. Image adapter behavior

Use the kit's `img` capability for actual image generation.

The underlying generation transport may use a Codex execution with an explicit image-generation request. For reference-conditioned calls, each reference must be supplied as its own `--image=<absolute-ref-path>` argument before the text prompt.

Do not use ambiguous bare `-i` forwarding: that option can consume or confuse the intended text prompt.

Do not invent an image-generation API response or pretend that an output exists because a subprocess returned text.

The request must explicitly instruct the image-generation tool to produce a genuine image, not run a script that draws a generic placeholder or constructs a synthetic PNG.

Verify any requested `out.png` before copying/promoting it to the immutable production path.

Generator-supported functionality:
- Text-prompt image generation.
- Size hint.
- Reference-image conditioning when the adapter supports it.
- Raster PNG output.

Not established:
- Image editing or inpainting.
- Arbitrary masks.
- Reliable native transparency/alpha.
- Guaranteed requested dimensions.
- Native controllable upscaling.

Do not rely on unsupported functions as a fallback.

## 4. Canonical reference strategy

Reference inventory is fixed at G4:
- Character identity sheets with the poses required by STORY.
- One or more approved environment keys, as explicitly planned.
- Style frame references.

For each reference:
1. Confirm its G4 requirement and current bible/style hashes.
2. Compile and store its prompt.
3. Generate the actual raster.
4. Validate and measure the resulting file.
5. Run the continuity reviewer against bible and style.
6. Present the reference with its findings.
7. Await the user's exact G5r answer.
8. Record approval/rejection for that version only.

Do not generate batch images while their canonical refs are pending.

### 4.1 Continuity strategies

**Reference conditioning**

Use the approved reference as image input together with the new text prompt.

The prompt must explain the intended reference contribution, for example identity or palette, without unintentionally reusing its original composition.

Explicitly restate framing because reference images can bias camera composition and pose.

**Cutout compositing and pose sheets**

Pose sheets are the default mechanism for characters with two or more poses. The kit manages the full pose-sheet pipeline:

1. **Layout**: A group of 2–4 members sharing identical `refs` and `size` is laid out in a grid (`sheetLayout(n)`: n=1 → 1×1, n=2 → 2×1, n=3 or 4 → 2×2, with cell 4 empty when n=3). Requested image size is `cols × W` by `rows × H`.
2. **Cutting**: Cells are cut from the measured generator output using ffmpeg crop (`cw = floor(W / cols)`, `ch = floor(H / rows)`).
3. **Background removal**: Each cell runs `npx --yes hyperframes@0.8.223 remove-background` with `HYPERFRAMES_NO_TELEMETRY=1`. The resulting cutout assets are transparent RGBA PNGs; never run remove-background on them again.
4. **Alpha checks**: Raw grayscale alpha bytes are inspected: fill below 1% fails as empty, and more than 2% opaque pixels in the 2-px border band fails as touching the edge (`HARD-SHEET-CELL`). Any failing cell fails the entire sheet attempt and counts toward the 3-attempt `PROC-IMG-RETRY` limit. A background-removal tool failure blocks immediately under `PROC-CUTOUT-FALLBACK`.
5. **Files & manifest**: The raw provenance image is preserved at `assets/sheets/<group>.<sha12>.png`. Each pose is committed as `assets/img/<id>.v<N>.png` with manifest fields `sheet`, `sheet_sha256`, `cell`, and cell-measured `w`, `h`, `q`, `tier`. All poses in a sheet are committed in one locked write.
6. **Redo**: Running `img --batch <id> --redo <id> --note <why>` regenerates only that pose as a 1×1 sheet, leaving approved sibling poses untouched (`GATE-PER-ITEM`).

Both strategies require approved current canonical refs and valid hashes.

## 5. Image post-checks

A successful image must pass all applicable checks:
1. Output file physically exists.
2. Its contents decode as a genuine PNG.
3. Width and height are positive and measured, not inferred from the requested size.
4. The raster is not uniformly colored or otherwise a blank placeholder.
5. The file sha256 is recorded.
6. The output corresponds to the requested asset ID and new version.
7. Actual generator result and revised prompt are preserved.
8. For batch images, every canonical ref is currently G5r-approved with matching version/hash.

Missing evidence is a failed check.

### 5.1 Retry accounting

The retry allowance is two retries after the initial failed attempt:
- Attempt 1: initial generation.
- Attempt 2: first retry.
- Attempt 3: second and final retry.

After attempt 3 fails, the only next state is `blocked` plus a report containing actual errors and attempts.

Do not attempt a fourth generation because the deadline is close.

A new authorized input revision is a new versioned task, not an excuse to overwrite the blocked attempt.

Retain incomplete/unverified attempts in `tmp/`. Never promote them as production assets.

## 6. Measured raster budget

For every raster layer, calculate:

`required_w = box_w × max_scale / crop_w + 2 × parallax_travel_x`

`required_h = box_h × max_scale / crop_h + 2 × parallax_travel_y`

`q = min(src_w / required_w, src_h / required_h)`

Definitions:
- `src_w`, `src_h`: actual decoded raster dimensions.
- `box_w`, `box_h`: rendered box dimensions in output pixels.
- `max_scale`: maximum applied scale over the shot.
- `crop_w`, `crop_h`: normalized visible fractions for crop.
- `parallax_travel_x`, `parallax_travel_y`: maximum travel allowance in output pixels.
- `q`: minimum source-pixel coverage of the rendered demand.

Use consistent units. If crop, box, scale, or travel values are unknown, do not invent `q`; block measurement and request the missing previz data.

### 6.1 Resolution classification

| Tier | Measured q | Disposition |
|---|---|---|
| native | q >= 1.0 | Allowed after other checks |
| soft | 0.75 <= q < 1.0 | Only if anticipated at G4 and explicitly accepted per asset at G5b |
| below budget | q < 0.75 | HARD blocked; reopen shot previz |

There is no approved `replan` resolution tier.

For soft assets, record measured q, planned q, G4 tier decision, G5b quote, and explicit soft-quality disclosure.

A source above the technical cutoff can still be rejected by the user on visual grounds.

### 6.2 Generator size planning

Measured reference maxima from the production spike:
- 16:9: 1672 × 941.
- 9:16: 941 × 1672.
- 3:2: 1536 × 1024.

Treat these as planning observations, not guarantees. The actual generated image always determines the final calculation.

Static full-frame plates can already fall below native coverage at 1080p. Camera push, crop, and parallax further increase source-pixel demand.

Prefer layered character rasters over HTML/CSS/vector grounds in demanding portrait compositions.

### 6.3 Worked example

For a 1536 × 1024 landscape source:
- A full-frame push to 1.10 with 30 px parallax can require approximately 2172 × 1188 source pixels.
- `q = min(1536/2172, 1024/1188) ≈ 0.71`.
- This fails the raster budget.

With push limited to 1.04 and no plate parallax:
- Required dimensions can fall to approximately 1997 × 1123.
- `q ≈ 0.77`, a soft candidate.
- It remains contingent on G4 and G5b acceptance.

These examples are illustrative, not measured outputs of the current project.

### 6.4 Permitted recovery choices

When a layer is below budget, propose:
- Reduce maximum scale.
- Reduce or remove parallax.
- Relax cropping.
- Divide the composition into smaller reusable raster layers.
- Replace a background with HTML/CSS/vector rendering.
- Reduce delivery resolution, for example 1280×720 or 720×1280.

Show the impact on framing and downstream shots. Obtain authorization for any change to an approved plan.

Never silently lower delivery resolution or change camera motion.

### 6.5 Interpolation and upscaling

The HyperFrames `--resolution` option uses Chrome DPR upsampling. It can improve rendered text and vector sharpness but does not create raster detail.

ffmpeg lanczos is interpolation, not a learned super-resolution process, and never increases `q`.

No production upscaler has been verified. A proposed learned upscaler requires a separate licensed, tested capability and a quality review before it could be included in a future plan.

Do not invent one to rescue a failing raster.

## 7. G5b and post-approval measurements

Run batch continuity review before presenting a contact sheet. Continuity review compares every generated character pose against its approved character reference (G5r). Each pose is its own G5b item, reviewed and approved individually (with the provenance sheet image presented for visual context).

Each sheet must allow identification of every image and version. Include:
- Shot/asset ID and approved reference IDs.
- Compiled and actual revised prompt information.
- Actual dimensions and current q.
- Continuity findings, including P0/P1/P2 and exact fixes.
- Planned/actual resolution tier.
- Per-item decision request.

User feedback may reject individual images or request a new version.

After decisions, recompute every affected shot with real dimensions. If the shot budget now fails, reopen that shot's previz and invalidate its dependent edit work.

Do not automatically invalidate unrelated shots.

## 8. Asset evidence for handoff

For each image, retain:
- Stable asset ID and immutable `.vN` path.
- Exact sha256.
- PNG format and measured dimensions.
- Generator identity and observed adapter response.
- Compiled and revised prompts.
- Canonical ref IDs, versions, and hashes.
- Bible/style/STORY source versions.
- Measured q and tier per consuming shot/layer.
- Continuity findings.
- Current G5r or G5b approval and exact quote.
- Stale/blocked status and relevant recovery notes.

An asset with valid pixels but invalid dependency approval is not deliverable.
