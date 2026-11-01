import { KitError } from "../errors.mjs";

// Placeholder registered by the WP2 foundation task; the task that owns "promote-shot" replaces this file.
export default {
  options: {},
  async run() {
    throw new KitError("BLOCKED", "promote-shot is not built yet", { rule: "CAP-BLOCKED-STOP" });
  },
};
