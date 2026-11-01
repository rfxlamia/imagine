import { KitError } from "../errors.mjs";

// Placeholder registered by the WP2 foundation task; the task that owns "tts" replaces this file.
export default {
  options: {},
  async run() {
    throw new KitError("BLOCKED", "tts is not built yet", { rule: "CAP-BLOCKED-STOP" });
  },
};
