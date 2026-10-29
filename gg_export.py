"""Timeline -> one mp4 with ffmpeg (CPU libx264, low priority, limited threads).

One export at a time. Runs in a worker thread; never on the aiohttp loop.
Per clip: trim/loop -> scale+pad -> fps -> exact frame count, silent audio where a clip has none,
then the concat demuxer joins identical-format segments without re-encoding.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path

try:
    from . import gg_data
except ImportError:  # unittest / plain script
    import gg_data  # type: ignore

PRESETS = {"480p": (854, 480), "720p": (1280, 720), "1080p": (1920, 1080)}
FPS_ALLOWED = (24, 25, 30)
THREADS = 4
AUDIO_RATE = 48000

_lock = threading.Lock()
_job: dict = {"status": "idle"}
_proc: subprocess.Popen | None = None
_cancel = threading.Event()
_notify = None   # callable(dict) set by routes (PromptServer.send_sync)


def output_dir() -> Path:
    try:
        import folder_paths  # ComfyUI
        base = Path(folder_paths.get_output_directory())
    except Exception:  # noqa: BLE001
        base = gg_data.PACK_DIR / "output"
    d = base / "gonggan"
    d.mkdir(parents=True, exist_ok=True)
    return d


def status() -> dict:
    with _lock:
        return dict(_job)


def _set(**kw) -> None:
    with _lock:
        _job.update(kw)
        snap = dict(_job)
    if _notify:
        try:
            _notify(snap)
        except Exception:  # noqa: BLE001
            pass


def _safe_name(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "_", name or "timeline").strip(" ._") or "timeline"
    return name[:60]


def _flags() -> int:
    # Windows: no console window, below-normal priority so the PC stays responsive.
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0)


def _has_audio(path: Path) -> bool:
    try:
        import av
        with av.open(str(path)) as c:
            return bool(c.streams.audio)
    except Exception:  # noqa: BLE001
        return False


def _run(cmd: list[str], seg_sec: float, done_sec: float, total_sec: float, label: str,
         base: float = 0.0, span: float = 0.97) -> None:
    global _proc
    if _cancel.is_set():
        raise InterruptedError
    p = subprocess.Popen(
        cmd + ["-progress", "pipe:1", "-nostats"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace",
        creationflags=_flags(),
    )
    with _lock:
        _proc = p
    last = 0.0
    err_tail: list[str] = []

    def _drain_err():
        for line in p.stderr:
            err_tail.append(line)
            if len(err_tail) > 40:
                del err_tail[:-40]
    t = threading.Thread(target=_drain_err, daemon=True)
    t.start()
    for line in p.stdout:
        if _cancel.is_set():
            p.terminate()
            break
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                cur = int(line.split("=", 1)[1]) / 1_000_000
            except ValueError:
                continue
            now = time.time()
            if now - last > 0.4:
                last = now
                frac = min(1.0, (done_sec + min(cur, seg_sec)) / max(0.001, total_sec))
                _set(progress=round(base + frac * span, 4), step=label)
    p.wait()
    t.join(timeout=2)
    with _lock:
        _proc = None
    if _cancel.is_set():
        raise InterruptedError
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({label}): " + "".join(err_tail[-6:]).strip()[-600:])


def _segment_cmd(exe: str, clip: dict, src: Path | None, out: Path, w: int, h: int, fps: int,
                 frames: int, sound: bool) -> list[str]:
    dur = frames / fps
    vf = (f"scale={w}:{h}:force_original_aspect_ratio=decrease:flags=bicubic,"
          f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={fps},"
          f"tpad=stop_mode=clone:stop_duration={dur + 1:.3f},format=yuv420p")
    cmd = [exe, "-hide_banner", "-loglevel", "error", "-y"]
    kind = clip["media"]["kind"] if clip.get("media") else None
    clip_audio = False
    if kind == "video" and src is not None:
        cmd += ["-ss", f"{clip['in']:.3f}", "-t", f"{dur + 0.5:.3f}", "-i", str(src)]
        clip_audio = sound and _has_audio(src)
    elif kind == "image" and src is not None:
        cmd += ["-loop", "1", "-framerate", str(fps), "-t", f"{dur + 0.5:.3f}", "-i", str(src)]
    else:
        cmd += ["-f", "lavfi", "-t", f"{dur + 0.5:.3f}", "-i", f"color=c=black:s={w}x{h}:r={fps}"]
    if sound and not clip_audio:
        cmd += ["-f", "lavfi", "-t", f"{dur + 0.5:.3f}", "-i", f"anullsrc=r={AUDIO_RATE}:cl=stereo"]
    cmd += ["-filter_threads", "2", "-vf", vf, "-map", "0:v:0"]
    if sound:
        cmd += ["-map", "0:a:0" if clip_audio else "1:a:0",
                "-af", f"aresample={AUDIO_RATE},aformat=channel_layouts=stereo,apad,atrim=end={dur:.6f}",
                "-c:a", "pcm_s16le", "-ar", str(AUDIO_RATE), "-ac", "2"]   # PCM: no AAC priming drift at joins
    else:
        cmd += ["-an"]
    cmd += ["-frames:v", str(frames), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-threads", str(THREADS), "-pix_fmt", "yuv420p", "-r", str(fps),
            str(out)]
    return cmd


GAP_CLIP = {"media": None, "in": 0.0}


def export_plan(cuts: list[dict], fps: int) -> list[tuple[dict, int]]:
    """(clip, frames) in time order; a gap between clips becomes GAP_CLIP (black, silent).
    Clips are placed at their `start` (packed after the previous clip when missing). Frame boundaries
    come from absolute times, so there is no rounding drift across many clips."""
    plan: list[tuple[dict, int]] = []
    frame_at, at = 0, 0.0
    if all(isinstance(c.get("start"), (int, float)) for c in cuts):
        cuts = sorted(cuts, key=lambda c: float(c["start"]))
    for c in cuts:
        start = c.get("start")
        start = max(at, float(start)) if isinstance(start, (int, float)) else at
        at = start + float(c["sec"])
        s, e = max(frame_at, round(start * fps)), round(at * fps)
        if s > frame_at:
            plan.append((GAP_CLIP, s - frame_at))
        if e > s:
            plan.append((c, e - s))
            frame_at = e
    return plan


def _worker(job_id: str, tl: dict, w: int, h: int, fps: int, sound: bool) -> None:
    exe = gg_data.ffmpeg_exe()
    work = gg_data.CACHE_DIR / "export" / job_id
    try:
        if not exe:
            raise RuntimeError("ffmpeg not found (PATH or imageio_ffmpeg)")
        work.mkdir(parents=True, exist_ok=True)
        plan = export_plan(tl["cuts"], fps)
        total_frames = sum(f for _, f in plan)
        total = total_frames / fps
        segs = []
        done = 0.0
        for i, (c, frames) in enumerate(plan):
            src = gg_data.media_path(c["media"]["id"]) if c.get("media") else None
            seg = work / f"seg_{i:03d}.mkv"
            label = f"clip {i + 1}/{len(plan)}"
            _set(step=label, current=i + 1)
            _run(_segment_cmd(exe, c, src, seg, w, h, fps, frames, sound), frames / fps, done, total, label)
            segs.append(seg)
            done += frames / fps
        if not segs:
            raise RuntimeError("timeline is empty")
        lst = work / "list.txt"
        lst.write_text("".join(f"file '{s.name}'\n" for s in segs), encoding="utf-8")
        name = f"{_safe_name(tl['project']['name'])}_{time.strftime('%Y%m%d-%H%M%S')}.mp4"
        out = output_dir() / name
        tmp = out.with_suffix(".part.mp4")
        _set(step="joining", progress=0.97)
        _run([exe, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
              "-c:v", "copy", *(["-c:a", "aac", "-b:a", "160k"] if sound else []),
              "-movflags", "+faststart", str(tmp)], total, 0.0, total, "joining", base=0.97, span=0.03)
        tmp.replace(out)
        _set(status="done", progress=1.0, step="done", finished_at=time.time(), file=name,
             path=str(out), size=out.stat().st_size, expected_sec=round(total_frames / fps, 3))
    except InterruptedError:
        _set(status="cancelled", step="cancelled", finished_at=time.time())
    except Exception as ex:  # noqa: BLE001
        _set(status="error", step="error", error=str(ex)[-800:], finished_at=time.time())
    finally:
        shutil.rmtree(work, ignore_errors=True)
        for p in output_dir().glob("*.part.mp4"):
            try:
                p.unlink()
            except OSError:
                pass


def start(pid: str, preset: str = "720p", width=None, height=None, fps=24, sound=True) -> dict:
    with _lock:
        if _job.get("status") in ("running",):
            return {"ok": False, "message": "an export is already running", "job": dict(_job)}
    if width and height:
        w, h = int(width), int(height)
        if not (160 <= w <= 3840 and 160 <= h <= 2160):
            raise ValueError("width/height out of range")
        w, h = w - w % 2, h - h % 2
        preset = f"{w}x{h}"
    else:
        if preset not in PRESETS:
            raise ValueError("preset must be one of " + ", ".join(PRESETS))
        w, h = PRESETS[preset]
    fps = int(fps or 24)
    if fps not in FPS_ALLOWED:
        raise ValueError("fps must be 24, 25 or 30")
    tl = gg_data.timeline(pid)
    if tl is None:
        return {"ok": False, "message": "project not found"}
    job_id = uuid.uuid4().hex[:10]
    _cancel.clear()
    with _lock:
        _job.clear()
        _job.update(status="running", id=job_id, pid=pid, project=tl["project"]["name"], preset=preset,
                    width=w, height=h, fps=fps, sound=bool(sound), progress=0.0, step="starting",
                    current=0, clips=len(tl["cuts"]), timeline_sec=tl["total_sec"], started_at=time.time())
    threading.Thread(target=_worker, args=(job_id, tl, w, h, fps, bool(sound)),
                     name="gonggan-export", daemon=True).start()
    return {"ok": True, "job": status()}


def cancel() -> dict:
    _cancel.set()
    with _lock:
        p = _proc
    if p and p.poll() is None:
        try:
            p.terminate()
        except OSError:
            pass
    return {"ok": True, "job": status()}


def export_file(name: str) -> Path | None:
    if not isinstance(name, str) or not name.endswith(".mp4") or "/" in name or "\\" in name or name.startswith("."):
        return None
    d = output_dir().resolve()
    p = (d / name).resolve()
    try:
        p.relative_to(d)
    except ValueError:
        return None
    return p if p.is_file() else None
