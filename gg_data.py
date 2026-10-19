"""Read-only access to 공간쉐어 data (data/<uid>/_workspace.json + j*_*.{png,mp4} results).

Never writes into the data root. Pure stdlib so it can be tested outside ComfyUI.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
from pathlib import Path

PACK_DIR = Path(__file__).resolve().parent
SETTINGS_FILE = PACK_DIR / "gonggan_settings.json"          # local override (gitignored)
DEFAULT_SETTINGS_FILE = PACK_DIR / "gonggan_settings.default.json"

MEDIA_KINDS = {
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image",
    ".mp4": "video", ".webm": "video",
}
MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
    ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm",
}
JOB_ID_RE = re.compile(r"^j\d+_[A-Za-z0-9]+$")
UID_RE = re.compile(r"^[A-Za-z0-9_-]{2,32}$")

CACHE_DIR = PACK_DIR / "cache"                                # pack-local, gitignored (never the data root)
_poster_sem = threading.Semaphore(2)                          # ffmpeg is CPU-only here; keep it light

_lock = threading.Lock()
_ws_cache: dict = {}
_jobs_cache: dict = {}


def load_settings() -> dict:
    s = {"data_root": "", "uid": "demo"}
    for f in (DEFAULT_SETTINGS_FILE, SETTINGS_FILE):
        try:
            if f.is_file():
                s.update(json.loads(f.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
    return s


def user_dir(settings: dict | None = None) -> Path:
    s = settings or load_settings()
    uid = str(s.get("uid") or "")
    if not UID_RE.fullmatch(uid):
        raise ValueError("invalid uid in settings")
    root = Path(str(s.get("data_root") or "")).expanduser()
    if not str(root) or not root.is_dir():
        raise FileNotFoundError(f"data_root not found: {root}")
    d = (root / uid).resolve()
    d.relative_to(root.resolve())
    if not d.is_dir():
        raise FileNotFoundError(f"user folder not found: {d}")
    return d


def _load_workspace(d: Path) -> dict:
    f = d / "_workspace.json"
    st = f.stat()
    key = (str(f), st.st_mtime_ns, st.st_size)
    with _lock:
        hit = _ws_cache.get("key") == key
        if hit:
            return _ws_cache["ws"]
    ws = json.loads(f.read_text(encoding="utf-8"))
    with _lock:
        _ws_cache.update(key=key, ws=ws)
    return ws


def _load_jobs(d: Path) -> dict:
    """job_id -> {id, kind, ext, mtime, cut_id, project_id, width, height, seconds, model}."""
    st = d.stat()
    key = (str(d), st.st_mtime_ns)
    with _lock:
        if _jobs_cache.get("key") == key:
            return _jobs_cache["jobs"]
    jobs: dict = {}
    for p in d.iterdir():
        kind = MEDIA_KINDS.get(p.suffix.lower())
        if not kind or not JOB_ID_RE.fullmatch(p.stem) or not p.is_file():
            continue
        meta = {}
        mf = d / f"{p.stem}.job.json"
        if mf.is_file():
            try:
                meta = json.loads(mf.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                meta = {}
        unlinked = bool(meta.get("unlinked"))
        num = lambda v: v if isinstance(v, (int, float)) and not isinstance(v, bool) else None  # noqa: E731
        jobs[p.stem] = {
            "id": p.stem,
            "kind": kind,
            "ext": p.suffix.lower(),
            "mtime": p.stat().st_mtime,
            "cut_id": "" if unlinked else str(meta.get("cut_id") or ""),
            "project_id": "" if unlinked else str(meta.get("project_id") or ""),
            "width": num(meta.get("width")),
            "height": num(meta.get("height")),
            "seconds": num(meta.get("seconds")),
            "model": str(meta.get("model_name") or meta.get("model_id") or ""),
        }
    with _lock:
        _jobs_cache.update(key=key, jobs=jobs)
    return jobs


def _jobs_by_cut(jobs: dict) -> dict:
    out: dict = {}
    for j in jobs.values():
        if j["cut_id"]:
            out.setdefault(j["cut_id"], []).append(j)
    for lst in out.values():
        lst.sort(key=lambda j: (j["mtime"], j["id"]), reverse=True)   # newest first, like app.js jobsForCuts
    return out


def _preview(cut: dict, by_cut: dict, jobs: dict) -> tuple[dict | None, int]:
    lst = by_cut.get(cut.get("id"), [])
    picked = cut.get("preview_job_id")
    if isinstance(picked, str) and picked in jobs and all(j["id"] != picked for j in lst):
        lst = [jobs[picked]] + lst
    if not lst:
        return None, 0
    hit = next((j for j in lst if j["id"] == picked), None) if picked else None
    return hit or lst[0], len(lst)


def clip_seconds(cut: dict, job: dict | None) -> float:
    """Mirrors app.js clipSeconds() without the browser-measured media length."""
    t = cut.get("tl_sec")
    if isinstance(t, (int, float)) and t >= 0.1:
        return round(min(60.0, float(t)), 2)
    if job and job.get("seconds") and job["seconds"] > 0:
        return float(job["seconds"])
    return 5.0 if job and job["kind"] == "video" else 3.0


def _media_view(job: dict | None) -> dict | None:
    if not job:
        return None
    return {k: job[k] for k in ("id", "kind", "width", "height", "seconds", "model")}


def list_projects() -> dict:
    s = load_settings()
    d = user_dir(s)
    ws = _load_workspace(d)
    jobs = _load_jobs(d)
    by_cut = _jobs_by_cut(jobs)
    projects = []
    for p in ws.get("projects") or []:
        cuts = p.get("cuts") or []
        thumb = None
        with_media = 0
        total = 0.0
        for c in cuts:
            job, _n = _preview(c, by_cut, jobs)
            if job:
                with_media += 1
                if thumb is None:
                    thumb = _media_view(job)
            total += clip_seconds(c, job)
        projects.append({
            "id": p.get("id"),
            "name": p.get("name") or "",
            "created_at": p.get("created_at"),
            "logline": p.get("logline") or "",
            "cut_count": len(cuts),
            "cuts_with_media": with_media,
            "total_sec": round(total, 2),
            "thumb": thumb,
        })
    return {"ok": True, "uid": s.get("uid"), "active_project_id": ws.get("active_project_id"), "projects": projects}


def timeline(pid: str) -> dict | None:
    d = user_dir()
    ws = _load_workspace(d)
    proj = next((p for p in ws.get("projects") or [] if p.get("id") == pid), None)
    if not proj:
        return None
    jobs = _load_jobs(d)
    by_cut = _jobs_by_cut(jobs)
    cuts = []
    at = 0.0
    for i, c in enumerate(proj.get("cuts") or []):
        job, n = _preview(c, by_cut, jobs)
        sec = clip_seconds(c, job)
        tl_in = c.get("tl_in") if isinstance(c.get("tl_in"), (int, float)) else 0.0
        cuts.append({
            "index": i,
            "id": c.get("id"),
            "name": c.get("name") or "",
            "scene": c.get("scene") or "",
            "scene_id": c.get("scene_id") or "",
            "story": c.get("story") or "",
            "prompt": c.get("prompt") or "",
            "shot": c.get("shot") or "",
            "tl_sec": c.get("tl_sec"),
            "tl_in": float(tl_in or 0.0),
            "sec": sec,
            "start": round(at, 3),
            "media": _media_view(job),
            "versions": n,
        })
        at += sec
    return {"ok": True, "project": {"id": proj.get("id"), "name": proj.get("name") or "",
                                    "logline": proj.get("logline") or ""},
            "cuts": cuts, "total_sec": round(at, 3)}


def media_path(job_id: str) -> Path | None:
    """Resolve a result file by job id, restricted to <data_root>/<uid>/."""
    if not isinstance(job_id, str) or not JOB_ID_RE.fullmatch(job_id):
        return None
    d = user_dir()
    job = _load_jobs(d).get(job_id)
    if not job:
        return None
    p = (d / f"{job_id}{job['ext']}").resolve()
    try:
        p.relative_to(d)
    except ValueError:
        return None
    return p if p.is_file() else None


def ffmpeg_exe() -> str | None:
    s = load_settings()
    exe = s.get("ffmpeg") or shutil.which("ffmpeg")
    if exe:
        return str(exe)
    try:
        import imageio_ffmpeg  # bundled with ComfyUI portable
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return None


def poster_path(job_id: str) -> Path | None:
    """Image results are their own poster; videos get a frame grabbed into the pack cache."""
    src = media_path(job_id)
    if src is None:
        return None
    if MEDIA_KINDS.get(src.suffix.lower()) == "image":
        return src
    out = CACHE_DIR / "posters" / f"{job_id}.jpg"
    if out.is_file() and out.stat().st_mtime >= src.stat().st_mtime:
        return out
    exe = ffmpeg_exe()
    if not exe:
        return None
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp.jpg")
    with _poster_sem:
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        subprocess.run(
            [exe, "-y", "-loglevel", "error", "-ss", "0.3", "-i", str(src), "-frames:v", "1",
             "-vf", "scale=320:-2", "-q:v", "4", str(tmp)],
            check=False, capture_output=True, timeout=30, creationflags=flags,
        )
    if tmp.is_file() and tmp.stat().st_size > 0:
        tmp.replace(out)
        return out
    return None
