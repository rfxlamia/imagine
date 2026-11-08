/**
 * Shared helper to stage a shot, build its scene composition, and promote it.
 */
export async function stageAndPromote(p, id, { motion, env = {} } = {}) {
  const staged = await p.run(env, "stage-shot", id);
  if (staged.exit !== 0) return staged;
  p.buildScene(id, motion);
  return p.run(env, "promote-shot", id);
}
