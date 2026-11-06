"""ElevenLabs TTS worker for imagine-kit `tts` (proposal section 7.3).

Run: uv run --with 'elevenlabs==2.73.0' python -I elevenlabs_worker.py   (JSON request on stdin, one JSON line on stdout)

Request:  {"jobs": [{"id", "voice_id", "model_id", "language_code"?, "voice_settings"?, "text", "seed", "out"}]}
Response: {"ok": true, "tier": <str|null>, "results": [{"id", "duration_s", "sample_rate": 24000}]}  or  {"ok": false, "id"?, "status": <int|null>, "error"}
Each job writes one mono 16-bit 24 kHz WAV with exactly one line of text (PROC-ONE-LINE-PER-WAV).
"""

import json
import os
import sys
import wave

from elevenlabs import VoiceSettings
from elevenlabs.client import ElevenLabs
from elevenlabs.core import ApiError


def write_wav(audio_bytes, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(audio_bytes)
    frames = len(audio_bytes) // 2
    return frames / 24000


def main():
    api_key = os.environ.get("ELEVENLABS_API_KEY", "")

    def redact_key(text):
        if api_key and text:
            return str(text).replace(api_key, "[redacted]")
        return str(text) if text is not None else ""

    try:
        request = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"ok": False, "id": None, "status": None, "error": redact_key(f"invalid JSON request: {e}")[:300]}))
        return 1

    try:
        client = ElevenLabs(api_key=api_key)
    except Exception as e:
        print(json.dumps({"ok": False, "id": None, "status": None, "error": redact_key(f"{type(e).__name__}: {e}")[:300]}))
        return 1

    tier = None
    try:
        subscription = client.user.subscription.get()
        tier = getattr(subscription, "tier", None)
        if not isinstance(tier, str):
            tier = str(tier) if tier is not None else None
    except Exception:
        tier = None

    results = []
    for job in request.get("jobs", []):
        try:
            convert_kwargs = {
                "voice_id": job["voice_id"],
                "text": job["text"],
                "model_id": job["model_id"],
                "output_format": "pcm_24000",
                "seed": int(job["seed"]),
            }
            if job.get("language_code") is not None:
                convert_kwargs["language_code"] = job["language_code"]
            if job.get("voice_settings") is not None:
                convert_kwargs["voice_settings"] = VoiceSettings(**job["voice_settings"])

            chunks = client.text_to_speech.convert(**convert_kwargs)
            audio_bytes = b"".join(chunks)
            if not audio_bytes or len(audio_bytes) % 2 != 0:
                raise RuntimeError(f"audio generation returned empty or invalid byte count ({len(audio_bytes)})")

            seconds = write_wav(audio_bytes, job["out"])
            results.append({"id": job["id"], "duration_s": round(seconds, 3), "sample_rate": 24000})
        except Exception as e:
            status = getattr(e, "status_code", None) if isinstance(e, ApiError) else None
            if isinstance(e, ApiError):
                body = getattr(e, "body", None)
                detail = ""
                if isinstance(body, dict):
                    d = body.get("detail")
                    if isinstance(d, dict):
                        detail = str(d.get("message") or d)
                    elif d is not None:
                        detail = str(d)
                    else:
                        detail = str(body)
                elif body is not None:
                    detail = str(body)
                else:
                    detail = str(e)
                error_msg = f"HTTP {status}: {detail}"
            else:
                error_msg = f"{type(e).__name__}: {e}"

            error_msg = redact_key(error_msg)[:300]
            print(json.dumps({"ok": False, "id": job.get("id"), "status": status, "error": error_msg}))
            return 1

    print(json.dumps({"ok": True, "tier": tier, "results": results}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
