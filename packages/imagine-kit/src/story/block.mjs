import { hashValue } from "../hash.mjs";
import { STAGE_BULLETS } from "./keys.mjs";

export function blockOf(shot, stage) {
  const block = {};
  for (const k of STAGE_BULLETS[stage]) if (Object.hasOwn(shot.keys, k)) block[k] = shot.keys[k];
  if (stage === "storyboard") Object.assign(block, { __title: shot.title, __narrative: shot.narrative });
  return block;
}

export const blockHash = (shot, stage) => hashValue(blockOf(shot, stage));
