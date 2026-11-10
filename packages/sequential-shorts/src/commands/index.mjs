import { renderCommand } from "./render.mjs";
import { runCommand } from "./run.mjs";
import { validateCommand } from "./validate.mjs";

export const COMMANDS = { run: runCommand, render: renderCommand, validate: validateCommand };
