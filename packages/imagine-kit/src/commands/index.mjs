import newCmd from "./new.mjs";
import status from "./status.mjs";
import gate from "./gate.mjs";
import validateStoryCmd from "./validate-story.mjs";
import patchApply from "./patch-apply.mjs";

export const COMMANDS = { new: newCmd, status, gate, "validate story": validateStoryCmd, "patch apply": patchApply };
