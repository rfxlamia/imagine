// WP6 allocation: which rules and literals each skill/agent file must carry.
// Read by tools/wp6/gate.mjs (brief, save, check). Lives under tools/ on purpose:
// check-traceability counts rule IDs under tests/ as test coverage, so this map must not live there.
//
// cite: rule IDs that need a `<!-- rule:ID -->` marker somewhere in the target (skill dir or agent file),
//       next to the prose that states the rule. Every active HARD and GATE rule is cited by at least one target.
// literals: exact strings the target must contain (commands, formulas, headings).
// sections: architecture-proposal sections excerpted into the brief (local file, not tracked).

export const KIT = "imagine-kit";
export const HF = "npx hyperframes@0.8.223";

// Phase 1 keeps 12 kit commands; everything else in cli-contract.md is deferred or folded.
export const KEPT_COMMANDS = ["new", "status", "gate", "validate story", "patch apply", "img", "tts", "stage-shot", "promote-shot", "export-hf", "render", "qc"];
export const CUT_COMMAND_RE = new RegExp(
  "imagine-kit\\s+(capabilities|review\\b|validate\\s+(script|bible|style|assets)|assets\\b|doc\\s+write|brief\\b|stage\\s+(start|finish)|waiver\\b|patch\\s+validate|diff-keys|guard\\b|readtime|beats\\b|audio-page|res-budget|res-report|check\\b|loudness|safe-band|fork\\b|lock\\b)",
);

// Shared contract text embedded in every brief (the proposal predates the re-plan).
export const REPLAN_NOTES = `- Phase 1 ships 12 \`imagine-kit\` commands: ${KEPT_COMMANDS.map((c) => `\`${c}\``).join(", ")}. Every other command in the proposal (\`brief\`, \`stage start|finish\`, \`guard\`, \`lock\`, \`doc write\`, \`waiver *\`, \`review confirm\`, \`capabilities\`, \`readtime\`, \`beats\`, \`loudness\`, \`check\`, \`safe-band\`, \`res-budget\`, \`audio-page\`, \`assets *\`, \`validate script|bible|style|assets\`, \`patch validate\`, \`diff-keys\`, \`fork\`) does not exist. Never instruct anyone to run it.
- Their duties move into instructions: the skill lists each stage's mandatory files and the main agent reads them in full (replaces \`brief\`); the main agent records sha256 of protected files before a dispatch and re-checks after it (replaces \`guard\`); the readtime formula \`max(1.2, 0.5 + 0.3 x words)\` seconds lives in the skill; waivers are REVIEW.md entries (format below); the 9:16 band is a manual check at G6 recorded in REVIEW.md.
- HyperFrames is called directly and pinned: \`${HF} check --json --strict\`, \`${HF} normalize-audio\`, \`${HF} beats\`, always with \`HYPERFRAMES_NO_TELEMETRY=1\` in the main agent's command. D10 allowlist: only \`contrast_aa_failure\` inside a shader-transition window is demoted to advice; every other check error or warning blocks.
- Kit invocation from a skill: \`node "\${CLAUDE_SKILL_DIR}/../../packages/imagine-kit/bin/imagine-kit.mjs" <command> ...\` (Claude Code substitutes \`\${CLAUDE_SKILL_DIR}\` in SKILL.md with the skill's directory inside the plugin; \`\${CLAUDE_PLUGIN_ROOT}\` is documented for hooks and manifests, not skill text). Define this once in each SKILL.md and call it \`imagine-kit\` afterwards. The last stdout line is the JSON envelope (docs/contracts/cli-contract.md). Quote the envelope fields you rely on; never claim a result you did not read.
- Planning subagents (storyboard-artist, previz-designer, fx-designer) have no Write tool: they return a patch as their final message; the main agent stores it verbatim and runs \`imagine-kit patch apply\`.`;

export const WAIVER_FORMAT = `## Waivers

### W-001 HARD-<RULE-ID>
- rule: HARD-<RULE-ID>
- items: s03, s05            (explicit ids; never "all")
- item_hashes: s03=sha256:<hex>, s05=sha256:<hex>
- reason: <the user's reason>
- manual_check: <what the user checks by hand instead>
- quote: "<the user's verbatim answer granting this waiver>"
- granted: <YYYY-MM-DD>`;

const SUBAGENT_SHARED = [
  "PROC-SUBAGENT-NO-USER", "PROC-SUBAGENT-PROPOSAL-ONLY", "PROC-STYLE-FIRST", "PROC-ADV-REASON", "PROC-HARD-OVER-STYLE",
  "PROC-CANON-CITE", "PROC-UPSTREAM-BLOCKED", "HARD-WAIVER-USER-ONLY", "CAP-NO-FABRICATION",
];
const PLANNING_SHARED = [...SUBAGENT_SHARED, "HARD-PATCH-KEYS", "HARD-PATCH-INPUTS-DECLARED", "HARD-BRIEF-CURRENT"];

const PLANNING_TOOLS = { allowed: ["Read", "Glob", "Grep"], required: ["Read"] };

export const TARGETS = {
  imagine: {
    kind: "skill",
    path: "skills/imagine",
    role: "Setup and router: create/resume the workspace, G0 lock, status, routing to the stage skills, gate recording rules, journal, impact reports on upstream changes, waivers in REVIEW.md.",
    sections: ["2.2", "2.3", "2.5", "2.6", "4", "5", "6.1", "6.2", "8.0", "8.3"],
    cite: [
      "PROC-BRIEF-START", "PROC-BRIEF-LIMIT", "PROC-LOCK-HASHED-WRITES", "PROC-JOURNAL", "PROC-DISPATCH-GUARD",
      "PROC-IMPACT-CONFIRM", "PROC-NEEDS-REVIEW-REPORT", "PROC-UPSTREAM-BLOCKED", "PROC-FORMAT-ONE-PER-PROJECT",
      "PROC-AUDIO-MODE-LOCKED", "PROC-EN-BASELINE", "PROC-OPT-IN-MANDATORY", "PROC-REVIEW-MD",
      "CAP-BLOCKED-STOP", "CAP-HARD-NO-FALLBACK", "CAP-ADV-NOT-RUN", "CAP-NO-FABRICATION",
      "GATE-G0", "GATE-G4", "GATE-QUOTE", "GATE-PER-ITEM",
      "HARD-WAIVER-USER-ONLY", "HARD-WAIVER-SCOPED", "HARD-WAIVER-REASONED", "HARD-WAIVER-HASH-BOUND", "HARD-WAIVER-LISTED",
      "HARD-NON-WAIVABLE", "HARD-NO-SELF-JUDGEMENT", "HARD-GATES-RECORDED", "HARD-BRIEF-CURRENT", "HARD-WAIVERS-VALID",
      "HARD-GUARD", "HARD-STATUS-DERIVED", "HARD-STORY-WRITERS", "HARD-STYLE-OUTPUT-READONLY",
      "DAG-G0-FORMAT", "DAG-G0-LANGUAGE", "DAG-SCRIPT-L-STORYBOARD", "DAG-SCRIPT-CANON", "DAG-BIBLE-ENTITY", "DAG-BIBLE-WORLD",
      "DAG-SHOT-STORYBOARD", "DAG-SHOT-PREVIZ", "DAG-WAIVER-SCOPE", "DAG-STALE-VS-REVIEW",
    ],
    literals: ["imagine-kit new", "imagine-kit status", "imagine-kit gate", "--quote", "## Waivers", "Mandatory files"],
  },
  "imagine-canon": {
    kind: "skill",
    path: "skills/imagine-canon",
    role: "Stages 2 story, 3 bible, 4 style: script ingestion into the G0 audio_mode unit file (narration.md L## or copy.md T##) and lock (G1); bible interview incl. voice casting, audition and pronunciation lexicon (G2); style derivation (G3).",
    sections: ["2.2", "4", "4.1", "5.1", "5.2", "7.3", "8.3"],
    cite: [
      "GATE-G1", "GATE-G2", "GATE-G3", "GATE-QUOTE", "GATE-PER-ITEM", "PROC-IMPACT-CONFIRM",
      "PROC-CLONING-OPT-IN", "PROC-NO-GATED-LOGIN", "PROC-VOICE-CONSENT", "PROC-ID-EXPERIMENTAL", "PROC-REMOTE-LISTEN",
      "PROC-PRONUNCIATION-LEVERS", "PROC-SCRATCH-NOT-ASSET", "PROC-ONE-LINE-PER-WAV", "PROC-NOT-HEARD", "PROC-MODE-NA-RECORDED",
      "PROC-BIBLE-REFS-STYLE", "PROC-CAPTION-ORIGINAL", "PROC-CAPTIONS-FROM-UNITS", "PROC-ATEMPO-WARN", "PROC-TTS-FALLBACK",
      "PROC-EN-BASELINE", "PROC-OPT-IN-MANDATORY",
      "HARD-STYLE-OUTPUT-READONLY", "HARD-HAS-VOICE-CLONING", "HARD-TTS-EOS", "ADV-STYLISED-FIRST",
    ],
    literals: ["imagine-kit tts", "imagine-kit gate", "SendUserFile", "Mandatory files"],
  },
  "imagine-plan": {
    kind: "skill",
    path: "skills/imagine-plan",
    role: "Stages 5 storyboard, 6 previz, 8a fx-plan: dispatch the planning subagents, patch staging/validation/merge, the section 4.1 clock (scratch VO, beat grid or read-time plan), canonical ref list, resolution budget per shot, production-plan gate (G4).",
    sections: ["2.2", "3.1", "3.2", "3.3", "3.4", "3.5", "4", "4.1", "7.2", "7.4"],
    cite: [
      "PROC-BRIEF-EMBED", "PROC-BRIEF-AUDIT-CANON", "PROC-DISPATCH-GUARD", "PROC-PATCH-VERBATIM", "PROC-PATCH-ROUNDS",
      "PROC-AUDIT-REREAD", "PROC-CONFLICT-REDISPATCH", "PROC-CLOCK-PER-MODE", "PROC-SCRATCH-NOT-ASSET", "PROC-MUSIC-SOURCE",
      "PROC-NO-UPSCALER", "PROC-REPLAN-USER-CHOICE", "PROC-UPSTREAM-BLOCKED", "PROC-IMPACT-CONFIRM",
      "GATE-G4", "GATE-QUOTE", "GATE-PER-ITEM",
      "HARD-NON-WAIVABLE", "HARD-PATCH-KEYS", "HARD-PATCH-BASE-REV", "HARD-PATCH-REVERIFY", "HARD-PATCH-INPUTS-DECLARED",
      "HARD-STORY-WRITERS", "HARD-STORY-IDS", "HARD-STORY-UNIT-ONCE", "HARD-VO-NO-OVERLAP", "HARD-TEXTLED-READTIME",
      "HARD-MUSICLED-ASSET", "HARD-MUSICLED-BEAT", "HARD-RASTER-TIER", "HARD-DURATION", "HARD-BRIEF-CURRENT",
      "ADV-READ-WINDOW", "ADV-LAYERED-PLATES", "ADV-VERTICAL",
    ],
    literals: ["imagine-kit patch apply", "imagine-kit tts", `${HF} beats`, "max(1.2, 0.5 + 0.3 x words)", "r<n>.patch.yaml", "Mandatory files"],
  },
  "imagine-generate": {
    kind: "skill",
    path: "skills/imagine-generate",
    role: "Stage 7 generate: prompt compilation, image and TTS adapters, asset manifest, canonical ref gate (G5r), audio listening gate (G5a), visual review gate (G5b), selective regeneration, resolution measurement.",
    sections: ["3.7", "4", "7.1", "7.2", "7.3", "8.3"],
    cite: [
      "GATE-G5R", "GATE-G5A", "GATE-G5B", "GATE-QUOTE", "GATE-PER-ITEM",
      "PROC-REVISED-PROMPT", "PROC-FRAMING-IN-PROMPT", "PROC-IMG-RETRY", "PROC-RESUME-IDEMPOTENT", "PROC-VERSIONS-IMMUTABLE",
      "PROC-G5A-PARALLEL", "PROC-SCRATCH-NOT-ASSET", "PROC-ONE-LINE-PER-WAV", "PROC-NOT-HEARD", "PROC-REMOTE-LISTEN",
      "PROC-CUTOUT-FALLBACK", "PROC-NO-UPSCALER", "PROC-CONTINUITY-MODES", "PROC-BRIEF-AUDIT-CANON", "PROC-DISPATCH-GUARD",
      "PROC-TTS-FALLBACK", "PROC-PRONUNCIATION-LEVERS", "PROC-CAPTION-ORIGINAL", "PROC-MODE-NA-RECORDED", "PROC-TELEMETRY-OFF",
      "HARD-REFS-APPROVED", "HARD-REAL-RASTER", "HARD-TTS-EOS", "HARD-HAS-VOICE-CLONING", "HARD-ASSETS-APPROVED",
      "HARD-NO-SELF-JUDGEMENT", "HARD-RASTER-TIER", "DAG-MEASURED-BUDGET",
    ],
    literals: ["imagine-kit img", "imagine-kit tts", "imagine-kit gate", "SendUserFile", "Mandatory files"],
  },
  "imagine-edit": {
    kind: "skill",
    path: "skills/imagine-edit",
    role: "Stages 8b fx-implement and 9 edit: shadow-project dispatch of scene-builder, promotion, root timeline and mix, check, snapshot --review, draft rough-mix render, picture lock (G6).",
    sections: ["3.6", "7.4", "7.5", "8.1", "8.2", "8.3"],
    cite: [
      "GATE-G6", "GATE-QUOTE", "PROC-G6-LISTEN", "PROC-NOT-HEARD", "PROC-NO-DESCRIBE", "PROC-TELEMETRY-OFF", "PROC-DISPATCH-GUARD",
      "PROC-SCENE-LINT-BLOCKED", "PROC-SFX-SOURCE", "PROC-MUSIC-SOURCE", "PROC-ATEMPO-WARN", "PROC-OFFLINE-MIRROR",
      "PROC-REMOTE-LISTEN", "PROC-IMPACT-CONFIRM", "PROC-REVIEW-MD",
      "HARD-HF-STRICT", "HARD-HF-ALLOWLIST", "HARD-NO-SELF-JUDGEMENT", "HARD-SAFE-BAND", "HARD-STAYS-IN-FRAME", "HARD-AUDIO-ID",
      "HARD-SHADOW-ONLY", "HARD-ROOT-MOTION", "HARD-SCENE-CLASS", "HARD-NO-BEST-EFFORT", "HARD-NO-PLACEHOLDER",
      "HARD-VO-NO-OVERLAP", "HARD-VO-PRESENT", "HARD-AUDIO-LICENCE", "HARD-FPS-SIZE", "HARD-WAIVER-USER-ONLY", "HARD-STORY-WRITERS",
      "ADV-CHECK-WARNINGS", "ADV-FILM-SILENT",
    ],
    literals: [
      `${HF} check --json --strict`, `${HF} normalize-audio`, "HYPERFRAMES_NO_TELEMETRY=1", "contrast_aa_failure",
      "imagine-kit stage-shot", "imagine-kit promote-shot", "imagine-kit export-hf", "imagine-kit render", "28 px", "Mandatory files",
    ],
  },
  "imagine-deliver": {
    kind: "skill",
    path: "skills/imagine-deliver",
    role: "Stage 10 deliver: final render to post/, QC incl. effective raster resolution and licence/credits check, REVIEW.md, G7.",
    sections: ["5.5", "7.2", "8.0", "8.1", "8.3"],
    cite: [
      "GATE-G7", "GATE-QUOTE", "PROC-REVIEW-MD", "PROC-IMPACT-CONFIRM", "PROC-NOT-HEARD", "PROC-NO-UPSCALER", "PROC-OFFLINE-MIRROR",
      "CAP-NO-FABRICATION",
      "HARD-NO-BEST-EFFORT", "HARD-FPS-SIZE", "HARD-DURATION", "HARD-AUDIO-STREAM", "HARD-LOUDNESS", "HARD-AUDIO-LICENCE",
      "HARD-RASTER-TIER", "HARD-NO-NATIVE-CLAIM", "HARD-VO-PRESENT", "HARD-NON-WAIVABLE", "HARD-WAIVER-USER-ONLY", "HARD-WAIVER-LISTED",
      "HARD-WAIVERS-VALID", "HARD-ASSETS-APPROVED", "HARD-NO-SELF-JUDGEMENT", "HARD-SAFE-BAND",
    ],
    literals: ["imagine-kit render", "--final", "imagine-kit qc", "imagine-kit gate", "## Waivers", "Mandatory files"],
  },
  "storyboard-artist": {
    kind: "agent",
    path: "agents/storyboard-artist.md",
    role: "Planning subagent: shot list and composition per shot from the locked script units and bible, in the locked format. Returns a patch; never writes files.",
    sections: ["3.1", "3.2", "3.3"],
    tools: PLANNING_TOOLS,
    cite: [
      ...PLANNING_SHARED, "PROC-STORYBOARD-NO-DROP", "HARD-ENTITIES-EXIST", "HARD-STORY-UNIT-ONCE", "HARD-STORY-IDS",
      "HARD-STORYBOARD-ASSET-DECL", "HARD-DURATION", "HARD-NO-PLACEHOLDER", "PROC-CAPTIONS-FROM-UNITS",
      "ADV-HERO-40", "ADV-NEW-EVERY", "ADV-LAYERED-PLATES", "ADV-VERTICAL", "ADV-STYLISED-FIRST",
    ],
    literals: ["blocked", "inputs", "required_px"],
  },
  "previz-designer": {
    kind: "agent",
    path: "agents/previz-designer.md",
    role: "Planning subagent: motion, camera, timing and transitions per shot in HyperFrames-native terms. Returns a patch; never writes files.",
    sections: ["3.1", "3.2", "3.4", "8.2"],
    tools: PLANNING_TOOLS,
    cite: [
      ...PLANNING_SHARED, "PROC-PREVIZ-NO-STRETCH", "PROC-CAMERA-WRAPPER", "PROC-CLOCK-PER-MODE", "PROC-NO-UPSCALER",
      "HARD-PREVIZ-SCALE-BUDGET", "HARD-PREVIZ-NAMES-EXIST", "HARD-PREVIZ-SAFE-AREA", "HARD-PREVIZ-BEATS-INSIDE",
      "HARD-MUSICLED-BEAT", "HARD-TEXTLED-READTIME", "HARD-VO-NO-OVERLAP",
      "ADV-EASE-ROLE", "ADV-HERO-MOVE", "ADV-EXIT-ENTRANCE", "ADV-TRANSITION-KINDS", "ADV-HARD-CUTS", "ADV-READ-WINDOW", "ADV-SHOT-LENGTH",
    ],
    literals: ["blocked", "inputs", "motion_asserts"],
  },
  "fx-designer": {
    kind: "agent",
    path: "agents/fx-designer.md",
    role: "Planning subagent: effects and finishing plan per shot; implementation happens in edit. Returns a patch; never writes files.",
    sections: ["3.1", "3.2", "3.5"],
    tools: PLANNING_TOOLS,
    cite: [...PLANNING_SHARED, "HARD-NO-CSS-FILTER-RASTER", "HARD-FX-TOOL-ENUM", "HARD-FX-WEBGL-FALLBACK", "ADV-BANNED"],
    literals: ["blocked", "inputs", "unsupported", "fallback"],
  },
  "scene-builder": {
    kind: "agent",
    path: "agents/scene-builder.md",
    role: "Build one shot's sub-composition in its shadow project stage/edit/<id>/. The PreToolUse hook (hooks/scene-builder-scope-lib.mjs) denies every write outside the shadow dir and every Bash command except bare `npx hyperframes@0.8.223 lint|snapshot|check|validate` with absolute shadow paths (no env prefix, no pipes).",
    sections: ["3.1", "3.6", "7.5"],
    tools: { allowed: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"], required: ["Read", "Write", "Bash"] },
    cite: [
      "PROC-SUBAGENT-NO-USER", "PROC-SUBAGENT-PROPOSAL-ONLY", "PROC-STYLE-FIRST", "PROC-HARD-OVER-STYLE", "HARD-WAIVER-USER-ONLY",
      "CAP-NO-FABRICATION", "HARD-SHADOW-ONLY", "HARD-SCENE-LINT", "PROC-SCENE-LINT-BLOCKED", "PROC-NO-DESCRIBE",
      "HARD-SCENE-CLASS", "HARD-NO-CSS-FILTER-RASTER", "HARD-STAYS-IN-FRAME", "HARD-AUDIO-ID", "HARD-NO-PLACEHOLDER",
      "HARD-ROOT-MOTION", "PROC-CAMERA-WRAPPER",
    ],
    literals: [`${HF} lint`, "stage/edit/", "index.motion.json", "blocked"],
    forbid: [{ re: /HYPERFRAMES_NO_TELEMETRY=1\s+npx/, why: "the hook denies env-prefixed Bash; scene-builder runs bare npx commands" }],
  },
  "continuity-reviewer": {
    kind: "agent",
    path: "agents/continuity-reviewer.md",
    role: "Read-only reviewer: compares images to bible and style in three modes (canonical refs before G5r, batch assets before G5b, snapshot --review sheets in edit); returns P0/P1/P2 findings.",
    sections: ["3.1", "3.7"],
    tools: { allowed: ["Read", "Glob", "Grep"], required: ["Read"] },
    cite: [
      "PROC-SUBAGENT-NO-USER", "PROC-SUBAGENT-PROPOSAL-ONLY", "PROC-BRIEF-AUDIT-CANON", "PROC-CANNOT-OPEN", "PROC-CONTINUITY-MODES",
      "PROC-CONTINUITY-PRIORITY", "PROC-CANON-CITE", "HARD-ENTITIES-EXIST", "HARD-NO-SELF-JUDGEMENT", "CAP-NO-FABRICATION",
    ],
    literals: ["P0", "P1", "P2"],
  },
};

// Writing order for the web-chat runs (skills before the agents they dispatch is not required; this order
// keeps shared terms consistent: router first, then each stage with its subagents).
export const ORDER = [
  "imagine", "imagine-canon", "imagine-plan", "storyboard-artist", "previz-designer", "fx-designer",
  "imagine-generate", "continuity-reviewer", "imagine-edit", "scene-builder", "imagine-deliver",
];
