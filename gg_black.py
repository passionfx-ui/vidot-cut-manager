"""Black-video check for generated video versions (0.9.135).

A few frames are sampled and their luma measured. ffmpeg (signalstats) reads mp4 / webm / mov; animated WebP / GIF /
APNG (which ffmpeg often cannot decode) are read frame by frame with Pillow. Nothing is ever deleted or moved."""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

BLACK_AVG = 20.0   # mean luma 0-255 (limited-range black is ~16)
BLACK_MAX = 48.0   # brightest pixel of a black frame stays below this
SAMPLES = 6
PIL_FIRST = {".webp", ".gif", ".png", ".apng"}
_STAT_RE = re.compile(r"lavfi\.signalstats\.(YAVG|YMAX)=([0-9.]+)")


def _pick(n: int, samples: int) -> list[int]:
    if n <= 1:
        return [0]
    k = max(1, min(samples, n))
    return sorted({round(i * (n - 1) / max(1, k - 1)) for i in range(k)})


def pillow_frame_stats(path: Path, samples: int = SAMPLES) -> list[tuple[float, float]] | None:
    """[(mean luma, max luma)] of up to `samples` evenly spaced frames, or None when Pillow cannot read it."""
    try:
        from PIL import Image, ImageStat
    except ImportError:
        return None
    try:
        with Image.open(path) as im:
            out = []
            for i in _pick(int(getattr(im, "n_frames", 1) or 1), samples):
                im.seek(i)
                lum = im.convert("L")
                out.append((float(ImageStat.Stat(lum).mean[0]), float(lum.getextrema()[1])))
            return out or None
    except Exception:  # noqa: BLE001
        return None


def ffmpeg_frame_stats(path: Path, samples: int = SAMPLES, ffmpeg: str | None = None,
                       timeout: float = 60.0) -> list[tuple[float, float]] | None:
    """[(YAVG, YMAX)] of sampled frames (signalstats, 0-255), or None when ffmpeg is missing or cannot decode."""
    ff = ffmpeg or shutil.which("ffmpeg")
    if not ff:
        return None
    vf = "fps=2,scale=160:-2,signalstats,metadata=print"
    try:
        p = subprocess.run([ff, "-hide_banner", "-nostats", "-v", "info", "-i", str(path), "-vf", vf,
                            "-frames:v", str(max(samples * 4, 8)), "-f", "null", "-"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.TimeoutExpired):
        return None
    rows: list[tuple[float, float]] = []
    cur: dict[str, float] = {}
    for key, val in _STAT_RE.findall(p.stderr or ""):
        cur[key] = float(val)
        if "YAVG" in cur and "YMAX" in cur:
            rows.append((cur["YAVG"], cur["YMAX"]))
            cur = {}
    if not rows:
        return None
    return [rows[i] for i in _pick(len(rows), samples)]


def frame_stats(path: Path | str, samples: int = SAMPLES) -> list[tuple[float, float]] | None:
    path = Path(path)
    if not path.is_file():
        return None
    if path.suffix.lower() in PIL_FIRST:
        return pillow_frame_stats(path, samples) or ffmpeg_frame_stats(path, samples)
    return ffmpeg_frame_stats(path, samples) or pillow_frame_stats(path, samples)


def is_black_media(path: Path | str, samples: int = SAMPLES) -> bool | None:
    """True when every sampled frame is essentially black, False when not, None when it could not be read."""
    stats = frame_stats(path, samples)
    if not stats:
        return None
    return all(avg <= BLACK_AVG and mx <= BLACK_MAX for avg, mx in stats)
