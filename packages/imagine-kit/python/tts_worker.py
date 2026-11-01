"""Pocket TTS worker for imagine-kit `tts` (proposal section 7.3).

Run: uv run --with 'pocket-tts[audio]==4.0.1' python -I tts_worker.py   (JSON request on stdin, one JSON line on stdout)

Request:  {"jobs": [{"id", "model": "english"|"indonesian", "config"?, "temperature"?, "eos_threshold"?,
                     "voice", "voice_is_file", "text", "seed", "out"}]}
Response: {"ok": true, "results": [{"id", "duration_s", "sample_rate"}]}  or  {"ok": false, "id"?, "error"}
Each job writes one mono 16-bit 24 kHz WAV with exactly one line of text (PROC-ONE-LINE-PER-WAV).
"""

import json
import os
import sys
import traceback
import wave

os.environ.setdefault("KPOCKET_TTS_ERROR_WITHOUT_EOS", "1")   # HARD-TTS-EOS: a take that never ends is an error, not a long file


def write_wav(audio, sample_rate, path):
    import numpy as np

    pcm = (audio.squeeze().clamp(-1, 1).numpy() * 32767).astype(np.int16)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())
    return len(pcm) / sample_rate


def load(job, cache):
    from pocket_tts import TTSModel

    key = (job["model"], job.get("config"), job.get("temperature"), job.get("eos_threshold"))
    if key not in cache:
        kwargs = {}
        if job.get("temperature") is not None:
            kwargs["temp"] = job["temperature"]
        if job["model"] == "indonesian":
            kwargs["config"] = job["config"]
            kwargs["eos_threshold"] = job.get("eos_threshold", -6.0)
        else:
            kwargs["language"] = "english"
        cache[key] = TTSModel.load_model(**kwargs)
    return cache[key]


def main():
    import torch

    request = json.load(sys.stdin)
    cache, results = {}, []
    for job in request["jobs"]:
        try:
            model = load(job, cache)
            if job.get("voice_is_file") and not model.has_voice_cloning:
                raise RuntimeError("this model has no voice cloning; a file voice cannot be used (HARD-HAS-VOICE-CLONING)")
            state = model.get_state_for_audio_prompt(job["voice"])
            torch.manual_seed(int(job["seed"]))
            audio = model.generate_audio(state, job["text"])
            seconds = write_wav(audio, model.sample_rate, job["out"])
            results.append({"id": job["id"], "duration_s": round(seconds, 3), "sample_rate": model.sample_rate})
        except Exception as e:   # report which job failed, stop the batch
            print(json.dumps({"ok": False, "id": job.get("id"), "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-800:]}))
            return 1
    print(json.dumps({"ok": True, "results": results}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
