import { KitError } from "../errors.mjs";

// Placeholder registered by the WP2 foundation task; the task that owns "render" replaces this file.
export default {
  options: {},
  async run() {
    throw new KitError("BLOCKED", "render is not built yet", { rule: "CAP-BLOCKED-STOP" });
  },
};
