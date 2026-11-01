import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { approveThrough, cli, cliWith, makeProject, put, seedCanon, setManifest, shot, snapshot, writeStory, asset } from "./fixture.mjs";
import { encodeWav } from "./wav.mjs";
import { makePng } from "./media.mjs";
import { sha256File } from "../../src/hash.mjs";

export const FAKE_NPX = fileURLToPath(new URL("../fakes/npx.mjs", import.meta.url));
export const SHOTS = () => [
  shot("s01", { scene: "stairs", duration_est: "6s", duration: "6s", voiceover: "[L01, L02@2.5]", characters: "[mara]", location: "lighthouse", assets: "[bg:img:1536x1024]", framing: "wide" }, "Stairs", "She climbs."),
  shot("s02", { scene: "lamp", duration_est: "7s", duration: "7s", voiceover: "[L03]", fx: "[glow=css-blend:screen]" }, "Lamp"),
];
export const COMPOSITION = (id) => `<template id="${id}-template"><div data-composition-id="${id}" data-width="1080" data-height="1920" data-start="0" data-duration="6"><div id="a">hi</div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.fromTo("#a",{opacity:0},{opacity:1,duration:1},0);window.__timelines["${id}"]=tl;</script></div></template>\n`;

// Edit-ready portrait project (narrated unless `mode` says otherwise): G0-G4 approved, two previz'd shots, an approved bg raster, export-hf's outputs present.
export async function editProject({ shots = SHOTS(), mode = "narrated" } = {}) {
  const p = await makeProject({ mode });
  seedCanon(p.dir, { copy: mode !== "narrated" });
  await writeStory(p.dir, 1, shots);
  await approveThrough(p.cwd, "G4");
  makePng(join(p.dir, "assets/img/bg.v1.png"), 64, 64);
  setManifest(p.dir, (m) => { m.assets.push(asset("bg", "img", 1, { path: "assets/img/bg.v1.png", sha256: sha256File(join(p.dir, "assets/img/bg.v1.png")), w: 64, h: 64, required_px: { w: 64, h: 64 }, q: 1, tier: "native" })); });
  const g5b = await cliWith(p.cwd, {}, "gate", "G5b", "approve", "--quote", "bg ok");
  if (g5b.exit !== 0) throw new Error(JSON.stringify(g5b.env.errors));
  for (const s of shots) {
    await snapshot(p.dir, `shot:${s.id}.storyboard`, ["g0:format", `shot:${s.id}.storyboard`], { status: "proposed", kind: "shot-stage" });
    await snapshot(p.dir, `shot:${s.id}.previz`, ["g0:format", `shot:${s.id}.storyboard`], { status: "proposed", kind: "shot-stage" });
    if (s.keys.fx) await snapshot(p.dir, `shot:${s.id}.fx`, ["g0:format", `shot:${s.id}.previz`], { status: "proposed", kind: "shot-stage" });
  }
  put(p.dir, "edit/STORYBOARD.md", "# storyboard\n");
  put(p.dir, "edit/hyperframes.json", "{}\n");
  const home = mkdtempSync(join(tmpdir(), "imagine-npx-"));
  const log = join(home, "npx.jsonl");
  const ctxFor = (env = {}) => ({ tools: { npx: [process.execPath, FAKE_NPX] }, env: { ...process.env, FAKE_NPX_LOG: log, ...env } });
  const run = (env, ...args) => cliWith(p.cwd, ctxFor(env), ...args);
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const buildScene = (id, motion) => {
    put(p.dir, `stage/edit/${id}/compositions/${id}.html`, COMPOSITION(id));
    if (motion) put(p.dir, `stage/edit/${id}/index.motion.json`, JSON.stringify(motion));
  };
  return { ...p, run, calls, ctxFor, buildScene };
}
export { YAML, writeFileSync, mkdirSync };

// Adds approved voice takes for L01-L03 (durations leave the 0.5 s gap that s01 expects) and a music bed.
export async function addAudio(p, { music = true, vo = true } = {}) {
  const lens = { L01: 2, L02: 3, L03: 2 };
  setManifest(p.dir, (m) => {
    for (const [line, secs] of Object.entries(vo ? lens : {})) {
      const path = `assets/vo/${line}.v1.wav`;
      put(p.dir, path, "");
      writeFileSync(join(p.dir, path), encodeWav(secs));
      m.assets.push(asset(line, "vo", 1, { path, sha256: sha256File(join(p.dir, path)), line, duration_s: secs, listen_status: "pending" }));
    }
    if (music) {
      writeFileSync(join(p.dir, "assets/music.v1.wav"), encodeWav(1));
      m.assets.push(asset("bed", "music", 1, { path: "assets/music.v1.wav", sha256: sha256File(join(p.dir, "assets/music.v1.wav")), license: "CC-BY-4.0", source: "https://example.org/bed", credit: "Bed by Example" }));
    }
  });
  const r = await cli(p.cwd, "gate", "G5a", "approve", "--quote", "audio ok");
  if (r.exit !== 0) throw new Error(JSON.stringify(r.env.errors));
}


export const INDEX_HTML = [
  "<!doctype html><html><body>",
  '<div id="root" data-composition-id="root" data-width="1080" data-height="1920" data-start="0" data-duration="13">',
  '  <div class="scene" data-composition-id="s01" data-composition-src="compositions/s01.html" data-start="0" data-duration="6" data-track-index="0"></div>',
  '  <div class="scene" data-composition-id="s02" data-composition-src="compositions/s02.html" data-start="6" data-duration="7" data-track-index="0"></div>',
  "</div></body></html>", ""].join("\n");

// Everything render and qc need: audio approved, export-hf done, root composition and both scenes in edit/, a fake render source MP4.
export async function renderProject({ shots, mode = "narrated" } = {}) {
  const { makeMp4 } = await import("./media.mjs");
  const p = await editProject({ shots, mode });
  await addAudio(p, { vo: mode === "narrated" });
  put(p.dir, "edit/index.html", INDEX_HTML);
  for (const id of ["s01", "s02"]) put(p.dir, `edit/compositions/${id}.html`, COMPOSITION(id));
  const exported = await p.run({}, "export-hf");
  if (exported.exit !== 0) throw new Error(JSON.stringify(exported.env.errors));
  const mp4 = makeMp4(join(p.dir, "..", `fixture-${Math.random().toString(36).slice(2)}.mp4`), { seconds: 13 });
  const render = (env, ...args) => p.run({ FAKE_NPX_MP4: mp4, ...env }, ...args);
  return { ...p, mp4, render };
}
