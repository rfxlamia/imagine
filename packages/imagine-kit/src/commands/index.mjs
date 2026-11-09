import newCmd from "./new.mjs";
import status from "./status.mjs";
import gate from "./gate.mjs";
import validateStoryCmd from "./validate-story.mjs";
import patchApply from "./patch-apply.mjs";
import img from "./img.mjs";
import tts from "./tts.mjs";
import stageShot from "./stage-shot.mjs";
import promoteShot from "./promote-shot.mjs";
import exportHf from "./export-hf.mjs";
import render from "./render.mjs";
import qc from "./qc.mjs";
import purge from "./purge.mjs";

export const COMMANDS = { new: newCmd, status, gate, "validate story": validateStoryCmd, "patch apply": patchApply,
  img, tts, "stage-shot": stageShot, "promote-shot": promoteShot, "export-hf": exportHf, render, qc, purge };
