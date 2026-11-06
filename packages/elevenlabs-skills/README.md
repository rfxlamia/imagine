# Pinned Upstream ElevenLabs Skills

- **Source URL**: https://github.com/elevenlabs/skills
- **Commit**: `9763c39a9d7add478b2f2d8229f0caadf5414f5f`
- **Date Vendored**: 2026-11-06
- **Licence**: MIT (see [LICENSE](./LICENSE))

## Why It Is Vendored

This package vendors the official ElevenLabs `text-to-speech` agent skill as a best-practice reference for the Imagine `elevenlabs` TTS engine.

The vendored files under `text-to-speech/` are kept byte-identical to upstream.

## Imagine Overrides

When using or referencing this skill within Imagine projects, the following overrides apply:

1. **API Key Handling**: Never run `npx -y @elevenlabs/cli@latest onboard init` or any step that writes the key into the project or a project env file. Imagine reads the provider key only from the `ELEVENLABS_API_KEY` environment variable or `~/.config/elevenlabs/key` (regular file, mode 600).
2. **Production Calls**: Production takes go only through `imagine-kit tts`, never via direct SDK or CLI calls.
3. **Audio Output Format**: Output is `pcm_24000` wrapped to a 24 kHz mono 16-bit WAV file (`assets/vo/L##.vN.wav`), not MP3.
4. **No Audio Tags**: Audio tags (such as `[whispers]`) are not used in Phase 1 because they would appear in captions.
5. **No Request Stitching**: Request stitching (`previous_text`/`next_text`) is not used; Imagine synthesises one line per WAV.
6. **SDK Pinning**: The Python worker environment pins the SDK to `elevenlabs==2.73.0` via `uv run --with elevenlabs==2.73.0`.
7. **Updating the Vendored Copy**: To update this vendored copy, choose a new upstream commit, re-fetch the files byte-identically, and update the commit and date in this README.
