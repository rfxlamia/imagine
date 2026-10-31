export function renderStyleOutput(g0) {
  return [
    `- format: ${g0.format} ${g0.width}x${g0.height} @ ${g0.fps} fps`,
    `- audio_mode: ${g0.audio_mode}`,
    `- language: ${g0.language ?? "n/a"}`,
    `- duration: ${g0.duration_s.min}-${g0.duration_s.max} s`,
    `- platform: ${g0.platform}`,
    `- silence: ${g0.silence ?? "no"}`,
  ].join("\n");
}
