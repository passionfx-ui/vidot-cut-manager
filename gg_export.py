"""Timeline -> one mp4 with ffmpeg (CPU libx264, low priority, limited threads).

One export at a time. Runs in a worker thread; never on the aiohttp loop.
Per clip: trim/loop -> scale+pad -> fps -> caption -> exact frame count, silent audio where a clip has
none, then the concat demuxer joins identical-format segments without re-encoding.
A clip's caption is burned into its own segment, so it spans exactly the clip's placed time on the track.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import unicodedata
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
         base: float = 0.0, span: float = 0.97, cwd: Path | None = None) -> None:
    global _proc
    if _cancel.is_set():
        raise InterruptedError
    p = subprocess.Popen(
        cmd + ["-progress", "pipe:1", "-nostats"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace",
        creationflags=_flags(), cwd=str(cwd) if cwd else None,
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


CAPTION_FONTS = (
    Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "malgun.ttf",
    Path("/System/Library/Fonts/AppleSDGothicNeo.ttc"),
    Path("/usr/share/fonts/truetype/nanum/NanumGothic.ttf"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc"),
)


def caption_font() -> Path | None:
    """First installed font that covers Korean; None -> ffmpeg's fontconfig default."""
    return next((p for p in CAPTION_FONTS if p.is_file()), None)


def caption_text(clip: dict) -> str:
    """Caption burned for a clip, normalized like the viewer overlay (web/gg_caption_core.js):
    line endings unified, trailing spaces and outer blank lines dropped, blank runs collapsed to one."""
    raw = clip.get("caption") if isinstance(clip.get("caption"), str) else ""
    raw = raw.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    raw = "".join(ch for ch in raw if ch == "\n" or unicodedata.category(ch) != "Cc")
    out: list[str] = []
    for line in (ln.rstrip() for ln in raw.split("\n")):
        if line.strip() or (out and out[-1]):
            out.append(line)
    while out and not out[-1]:
        out.pop()
    return "\n".join(out)


def _char_em(ch: str) -> float:
    return 1.0 if unicodedata.east_asian_width(ch) in ("W", "F") else 0.6


def wrap_caption(text: str, max_em: float, max_lines: int) -> str:
    """Greedy word wrap to max_em font-size units per line (wide CJK chars = 1, others ~0.6), breaking
    inside a word only when it alone is too long. More than max_lines lines -> cut with an ellipsis."""
    lines: list[str] = []
    for para in text.split("\n"):
        cur, cur_w = "", 0.0
        for word in para.split(" "):
            word_w = sum(_char_em(ch) for ch in word)
            sep = 0.6 if cur else 0.0
            if cur and cur_w + sep + word_w <= max_em:
                cur, cur_w = f"{cur} {word}", cur_w + sep + word_w
                continue
            if cur:
                lines.append(cur)
            cur, cur_w = "", 0.0
            for ch in word:
                cw = _char_em(ch)
                if cur and cur_w + cw > max_em:
                    lines.append(cur)
                    cur, cur_w = "", 0.0
                cur, cur_w = cur + ch, cur_w + cw
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip() + "…"
    return "\n".join(lines)


def _filter_value(s: str) -> str:
    """Escape a drawtext option value for -vf: option level (\\ ' :), then filtergraph level."""
    s = re.sub(r"([\\':])", r"\\\1", s)
    return re.sub(r"([\\'\[\],;])", r"\\\1", s)


def caption_layout(w: int, h: int) -> dict:
    """Overlay style scaled to the output: font ~1/22 of the height, box padding, bottom margin."""
    size = max(12, round(h / 22))
    pad = max(4, round(size * 0.35))
    spacing = round(size * 0.25)
    return {
        "size": size, "pad": pad, "spacing": spacing, "margin": max(8, round(h * 0.035)),
        "max_em": max(4.0, (w * 0.92 - 2 * pad) / size),
        "max_lines": max(1, int((h * 0.45 - 2 * pad + spacing) // (size + spacing))),
    }


def caption_filter(textfile: str, w: int, h: int, font: Path | None) -> str:
    """drawtext for the viewer overlay look: white text, dark translucent box, centered at the bottom.
    The text comes from a UTF-8 file with expansion off, so any caption text is taken literally."""
    lay = caption_layout(w, h)
    face = f"fontfile={_filter_value(str(font).replace(chr(92), '/'))}" if font else "font=Sans"
    return (f"drawtext={face}:textfile={_filter_value(textfile)}:expansion=none:text_align=center"
            f":fontsize={lay['size']}:fontcolor=white:line_spacing={lay['spacing']}"
            f":box=1:boxcolor=black@0.65:boxborderw={lay['pad']}"
            f":x=(w-text_w)/2:y=h-text_h-{lay['margin'] + lay['pad']}")


def _segment_cmd(exe: str, clip: dict, src: Path | None, out: Path, w: int, h: int, fps: int,
                 frames: int, sound: bool, caption: str | None = None) -> list[str]:
    """caption: drawtext filter (caption_filter) burned over the whole segment, or None."""
    dur = frames / fps
    vf = (f"scale={w}:{h}:force_original_aspect_ratio=decrease:flags=bicubic,"
          f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={fps},"
          f"tpad=stop_mode=clone:stop_duration={dur + 1:.3f},"
          f"{caption + ',' if caption else ''}format=yuv420p")
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
        font = caption_font()
        lay = caption_layout(w, h)
        for i, (c, frames) in enumerate(plan):
            src = gg_data.media_path(c["media"]["id"]) if c.get("media") else None
            seg = work / f"seg_{i:03d}.mkv"
            label = f"clip {i + 1}/{len(plan)}"
            _set(step=label, current=i + 1)
            text = caption_text(c)
            cap = None
            if text:
                cap_file = f"cap_{i:03d}.txt"
                (work / cap_file).write_text(wrap_caption(text, lay["max_em"], lay["max_lines"]),
                                             encoding="utf-8", newline="\n")
                cap = caption_filter(cap_file, w, h, font)
            _run(_segment_cmd(exe, c, src, seg, w, h, fps, frames, sound, cap), frames / fps, done, total,
                 label, cwd=work)
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
