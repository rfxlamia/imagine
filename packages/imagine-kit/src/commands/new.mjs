import { chmodSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { KitError, UsageError } from "../errors.mjs";
import { writeAtomic } from "../fsx.mjs";
import { appendJournal } from "../journal.mjs";
import { parseDuration, saveProject, slugify } from "../project.mjs";
import { renderStyleOutput } from "../docs.mjs";

const DIRS = ["script", "stage/storyboard", "stage/previz", "stage/fx", "stage/edit", "assets/refs", "assets/img/figure", "assets/img/world", "assets/vo",
  "assets/sfx", "assets/music", "assets/_rejected", "edit", "review", "tmp/scratch-vo", "tmp/audition", "post", ".history"];
const MODES = ["narrated", "music-led", "text-led"];
const PLATFORMS = ["generic", "tiktok", "reels", "shorts", "youtube"];
const SIZE = { landscape: [1920, 1080], portrait: [1080, 1920] };
const SKELETON_STORY = "---\nimagine_rev: 0\n---\n";
const SKELETON_BIBLE = "characters: []\nlocations: []\nworld: {}\npronunciation: []\n";

export default {
  options: { format: { type: "string" }, "audio-mode": { type: "string" }, lang: { type: "string" }, duration: { type: "string" },
    platform: { type: "string" }, silence: { type: "string" } },
  async run({ values, positionals }, ctx) {
    const title = positionals.join(" ").trim();
    if (!title) throw new UsageError('usage: new "<title>" --format landscape|portrait --audio-mode narrated|music-led|text-led --lang <bcp47> --duration <min>-<max>');
    const slug = slugify(title);
    if (!slug) throw new UsageError("title must contain at least one ASCII letter or digit");
    const format = values.format;
    if (!SIZE[format]) throw new UsageError("--format must be landscape or portrait");
    const mode = values["audio-mode"];
    if (!MODES.includes(mode)) throw new UsageError("--audio-mode must be narrated, music-led or text-led");
    const duration = parseDuration(values.duration);
    const platform = values.platform ?? "generic";
    if (!PLATFORMS.includes(platform)) throw new UsageError(`--platform must be one of ${PLATFORMS.join(", ")}`);
    if (platform !== "generic") throw new KitError("BLOCKED", `platform "${platform}" needs a platform band profile; Phase 1 supports generic only`, { rule: "CAP-BLOCKED-STOP" });
    if (mode === "narrated" && !values.lang) throw new UsageError("--lang <bcp47> is required for narrated projects");
    if (values.lang && !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(values.lang)) throw new UsageError("--lang must be a BCP-47 tag such as en or id");
    if (values.silence !== undefined && (values.silence !== "intentional" || mode !== "text-led")) throw new UsageError("--silence intentional is only valid with --audio-mode text-led");

    const now = ctx.now();
    const date = now.toISOString().slice(0, 10);
    const name = `${date}-${slug}`;
    const base = join(ctx.cwd, ".imagine");
    const finalDir = join(base, name);
    if (existsSync(finalDir)) throw new UsageError(`project ${name} already exists`);
    mkdirSync(base, { recursive: true });
    const tmp = mkdtempSync(join(base, ".new-"));
    try {
      chmodSync(tmp, 0o755);
      for (const d of DIRS) mkdirSync(join(tmp, d), { recursive: true });
      const [width, height] = SIZE[format];
      const project = { slug, title, created: date, contract: 1,
        g0: { status: "pending", format, width, height, fps: 30, audio_mode: mode, language: values.lang ?? null, duration_s: duration,
          platform, silence: values.silence ?? null },
        stages: {}, items: {}, blocked: [] };
      saveProject(tmp, project);
      writeAtomic(join(tmp, "bible.yaml"), SKELETON_BIBLE);
      writeAtomic(join(tmp, "style.md"), `# Style\n\n## output\n\n${renderStyleOutput(project.g0)}\n`);
      writeAtomic(join(tmp, "STORY.md"), SKELETON_STORY);
      writeAtomic(join(tmp, ".history", "STORY.r0.md"), SKELETON_STORY);
      writeAtomic(join(tmp, "assets", "manifest.yaml"), "assets: []\n");
      writeAtomic(join(tmp, "assets", "CREDITS.md"), "# Credits\n");
      const journal_id = appendJournal(tmp, { command: "new", summary: `created ${name} (${format}, ${mode}, ${duration.min}-${duration.max}s)`, now });
      renameSync(tmp, finalDir);
      writeAtomic(join(base, "ACTIVE"), `${name}\n`);
      const rel = join(".imagine", name);
      return { project: rel, data: { project: rel, g0: project.g0 }, journal_id };
    } catch (e) {
      rmSync(tmp, { recursive: true, force: true });
      throw e;
    }
  },
};
