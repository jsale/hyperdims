"""
tts.py
======
Narration for the HCS lesson videos, through GlyphViz's own lesson tooling
(glyphviz/video_lessons/narrate.py): the same Kokoro voices, the same
per-line WAV cache, the same narration-track and .srt assembly. render.mjs
calls it twice:

    python tts.py synth job.json out.json   # job: {lines, voice, speed, cache}
    python tts.py track job.json            # job: {shots, total, wav, srt}

Run it with any Python 3 (render.mjs uses the Kokoro venv's, which narrate.py
itself also launches for synthesis). GLYPHVIZ_LESSONS overrides where
narrate.py is found (default: the sibling glyphviz repo).
"""
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

LESSONS = Path(os.environ.get(
    "GLYPHVIZ_LESSONS",
    Path(__file__).resolve().parents[2] / "glyphviz" / "video_lessons"))
sys.path.insert(0, str(LESSONS))
import narrate  # noqa: E402


def main() -> int:
    cmd, job_path = sys.argv[1], Path(sys.argv[2])
    job = json.loads(job_path.read_text(encoding="utf-8"))
    if cmd == "synth":
        clips = narrate.synthesize(job["lines"], Path(job["cache"]),
                                   voice=job["voice"], rate=job["speed"],
                                   engine=job.get("engine", "kokoro"))
        Path(sys.argv[3]).write_text(json.dumps(
            [{"audio": str(p) if p else None, "seconds": sec} for p, sec in clips]),
            encoding="utf-8")
    elif cmd == "track":
        shots = [SimpleNamespace(say=s["say"]) for s in job["shots"]]
        timing = [SimpleNamespace(start=s["start"], speech=s["speech"],
                                  audio=Path(s["audio"]) if s["audio"] else None)
                  for s in job["shots"]]
        narrate.build_track(timing, job["total"], Path(job["wav"]))
        narrate.write_srt(shots, timing, Path(job["srt"]))
    else:
        raise SystemExit(f"unknown command {cmd!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
