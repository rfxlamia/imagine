"""faster-whisper worker for sequential-shorts (spec section 5.2).

Run: uv run --python 3.12 --with 'faster-whisper==1.2.1' --with 'av==18.0.0' python -I asr_worker.py
JSON request on stdin, exactly one JSON line on stdout.

Request:  {"audio": "<16 kHz mono wav>", "model": "large-v3-turbo" | "<hub id>" | "<local dir>", "language": null | "id", "revision": null | "<hub commit, branch or tag>"}
Response: {"ok": true, "language", "language_probability", "faster_whisper",
           "model": {"name", "repo", "revision", "cached"},
           "segments": [{"start", "end", "text", "words": [{"start", "end", "word", "probability"}]}]}
      or  {"ok": false, "error"}
Words come only from the model. Nothing is invented, merged or retimed here.
"""

import json
import os
import sys


def resolve_model(name, revision=None):
    from faster_whisper.utils import _MODELS, download_model

    if os.path.isdir(name):
        return name, {"name": name, "repo": None, "revision": None, "cached": True}
    repo = name if "/" in name else _MODELS.get(name)
    if repo is None:
        raise ValueError("unknown model %r; expected one of %s or a Hugging Face Hub id" % (name, ", ".join(_MODELS)))
    try:
        path = download_model(name, local_files_only=True, revision=revision)
        cached = True
    except Exception:
        path = download_model(name, revision=revision)
        cached = False
    revision = os.path.basename(os.path.normpath(path))
    return path, {"name": name, "repo": repo, "revision": revision, "cached": cached}


def main():
    request = json.load(sys.stdin)
    try:
        import faster_whisper
        from faster_whisper import WhisperModel

        path, model_info = resolve_model(request["model"], request.get("revision"))
        model = WhisperModel(path, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            request["audio"], word_timestamps=True, vad_filter=True, language=request.get("language")
        )
        out = []
        for s in segments:
            words = [{"start": w.start, "end": w.end, "word": w.word, "probability": w.probability} for w in (s.words or [])]
            out.append({"start": s.start, "end": s.end, "text": s.text, "words": words})
        print(json.dumps({
            "ok": True,
            "language": info.language,
            "language_probability": info.language_probability,
            "faster_whisper": faster_whisper.__version__,
            "model": model_info,
            "segments": out,
        }))
    except Exception as e:  # still exactly one JSON line on stdout
        print(json.dumps({"ok": False, "error": "%s: %s" % (type(e).__name__, e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
