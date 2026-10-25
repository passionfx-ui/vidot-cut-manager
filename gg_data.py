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
            "aspect": str(meta.get("aspect") or ""),
            "source": "gonggan",
            "path": str(p),
        }
    with _lock:
        _jobs_cache.update(key=key, jobs=jobs)
    return jobs


# ---- pack-owned versions (new takes from the SDK path or ComfyUI history) ----
VERSIONS_DIR = PACK_DIR / "versions"          # versions/<pid>/<cut_id>/<vid>.<ext> + <vid>.json
WORKFLOWS_DIR = PACK_DIR / "workflows"        # workflows/<pid>/<cut_id>/…
TRASH_DIR = PACK_DIR / "trash"                # trash/<pid>/<stamp>/<cut_id>/ + manifest.json
VER_ID_RE = re.compile(r"^v\d{10,14}_[a-f0-9]{6}$")


def _load_versions() -> dict:
    out: dict = {}
    if not VERSIONS_DIR.is_dir():
        return out
    for mf in VERSIONS_DIR.glob("*/*/v*.json"):
        try:
            meta = json.loads(mf.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        vid = mf.stem
        ext = str(meta.get("ext") or "")
        media = mf.with_name(vid + ext)
        if not VER_ID_RE.fullmatch(vid) or ext not in MEDIA_KINDS or not media.is_file():
            continue
        num = lambda v: v if isinstance(v, (int, float)) and not isinstance(v, bool) else None  # noqa: E731
        out[vid] = {
            "id": vid, "kind": MEDIA_KINDS[ext], "ext": ext, "mtime": media.stat().st_mtime,
            "cut_id": mf.parent.name, "project_id": mf.parent.parent.name,
            "width": num(meta.get("width")), "height": num(meta.get("height")), "seconds": num(meta.get("seconds")),
            "model": str(meta.get("model") or ""), "aspect": str(meta.get("aspect") or ""),
            "source": str(meta.get("source") or "local-sdk"), "path": str(media),
        }
    return out


def _all_media(d: Path) -> dict:
    m = dict(_load_jobs(d))
    m.update(_load_versions())
    return m


def _jobs_by_cut(jobs: dict) -> dict:
    out: dict = {}
    for j in jobs.values():
        if j["cut_id"]:
            out.setdefault(j["cut_id"], []).append(j)
    for lst in out.values():
        lst.sort(key=lambda j: (j["mtime"], j["id"]), reverse=True)   # newest first, like app.js jobsForCuts
    return out


def _versions_of(cut: dict, by_cut: dict, jobs: dict) -> list:
    lst = list(by_cut.get(cut.get("id"), []))
    picked = cut.get("preview_job_id")
    if isinstance(picked, str) and picked in jobs and all(j["id"] != picked for j in lst):
        lst = [jobs[picked]] + lst
    return lst


def _preview(cut: dict, by_cut: dict, jobs: dict, pick: str | None = None) -> tuple[dict | None, int]:
    lst = by_cut.get(cut.get("id"), [])
    if pick and pick in jobs and jobs[pick]["cut_id"] == cut.get("id"):
        return jobs[pick], len(_versions_of(cut, by_cut, jobs))
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
    return {k: job.get(k) for k in ("id", "kind", "width", "height", "seconds", "model", "source")}


def list_projects() -> dict:
    s = load_settings()
    d = user_dir(s)
    ws = _load_workspace(d)
    jobs = _all_media(d)
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


EDITS_DIR = PACK_DIR / "edits"                                # pack-local edit decisions (never the data root)
PID_RE = re.compile(r"^[A-Za-z0-9_-]{2,64}$")
GID_RE = re.compile(r"^[A-Za-z0-9_-]{2,64}$")
LOCAL_CUT_ID_RE = re.compile(r"^L[A-Za-z0-9_-]{2,62}$")
LOCAL_CUT_DEFAULT_SEC = 3.0
SCENE_NAME_MAX = 40
IMG_MIN, IMG_MAX = 0.5, 60.0
VID_MIN = 0.2
_dur_cache: dict = {}


def _round(x: float) -> float:
    return round(float(x) + 1e-9, 2)


def media_duration(job: dict | None) -> float | None:
    """Real duration of a video result (PyAV, fallback ffprobe). Cached by id + mtime."""
    if not job or job.get("kind") != "video":
        return None
    key = (job["id"], job["mtime"])
    with _lock:
        if key in _dur_cache:
            return _dur_cache[key]
    path = media_path(job["id"])
    dur = None
    if path is not None:
        try:
            import av  # ships with ComfyUI
            with av.open(str(path)) as c:
                if c.duration:
                    dur = c.duration / 1_000_000
                elif c.streams.video and c.streams.video[0].duration:
                    st = c.streams.video[0]
                    dur = float(st.duration * st.time_base)
        except Exception:  # noqa: BLE001
            dur = None
        if not dur:
            exe = ffmpeg_exe()
            probe = exe and str(Path(exe).with_name(Path(exe).name.replace("ffmpeg", "ffprobe")))
            if probe and Path(probe).is_file():
                try:
                    out = subprocess.run(
                        [probe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                        capture_output=True, text=True, timeout=20,
                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    ).stdout.strip()
                    dur = float(out) if out else None
                except Exception:  # noqa: BLE001
                    dur = None
    dur = _round(dur) if dur and dur > 0 else None
    with _lock:
        _dur_cache[key] = dur
    return dur


def clamp_clip(kind: str | None, tl_in: float, sec: float, src_dur: float | None) -> tuple[float, float]:
    """Images: free length 0.5-60 s, no in-point. Video: in >= 0, in + sec <= real duration."""
    try:
        tl_in = float(tl_in or 0.0)
        sec = float(sec)
    except (TypeError, ValueError):
        tl_in, sec = 0.0, 3.0
    if kind != "video":
        return 0.0, _round(min(IMG_MAX, max(IMG_MIN, sec)))
    if src_dur:
        tl_in = min(max(0.0, tl_in), max(0.0, src_dur - VID_MIN))
        sec = min(sec, src_dur - tl_in)
    else:
        tl_in = max(0.0, tl_in)
    return _round(tl_in), _round(min(60.0, max(VID_MIN, sec)))


def _edit_file(pid: str) -> Path:
    if not PID_RE.fullmatch(pid or ""):
        raise ValueError("invalid project id")
    return EDITS_DIR / f"edit_{pid}.json"


def load_edit(pid: str) -> dict | None:
    f = _edit_file(pid)
    if not f.is_file():
        return None
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def _atomic_edit_write(pid: str, data: dict) -> None:
    f = _edit_file(pid)
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)


def _hidden_cut_ids(edit: dict | None) -> set:
    raw = (edit or {}).get("hidden")
    if not isinstance(raw, list):
        return set()
    return {x for x in raw if isinstance(x, str) and x}


def _preserve_edit_fields(old: dict | None, data: dict) -> None:
    """Keep hidden + local_cuts when rewriting order/clips (not groups — save_groups owns those)."""
    old = old or {}
    if isinstance(old.get("local_cuts"), list):
        data["local_cuts"] = old["local_cuts"]
    hidden = old.get("hidden")
    if isinstance(hidden, list):
        data["hidden"] = [x for x in hidden if isinstance(x, str) and x]


def _is_local_cut_id(cut_id: str) -> bool:
    return bool(LOCAL_CUT_ID_RE.fullmatch(cut_id or ""))


def _trash_stamp() -> str:
    import time
    from datetime import datetime
    return datetime.fromtimestamp(time.time()).strftime("%Y%m%d-%H%M%S")


def _scene_id_of(cut: dict) -> str:
    if not cut.get("scene"):
        return ""
    sid = cut.get("scene_id") or ""
    return sid if isinstance(sid, str) and sid else f"L{cut.get('id', '')}"


def default_groups_from_cuts(src_cuts: list) -> list:
    """Initial scene groups from 공간쉐어 cut.scene / cut.scene_id (consecutive runs)."""
    groups: list = []
    cur: dict | None = None
    for c in src_cuts:
        sid = _scene_id_of(c)
        cid = c.get("id")
        if not sid or not cid:
            cur = None
            continue
        title = str(c.get("scene") or "").strip()[:SCENE_NAME_MAX] or "씬"
        if cur and cur["id"] == sid:
            cur["cut_ids"].append(cid)
        else:
            cur = {"id": sid, "name": title, "cut_ids": [cid], "collapsed": False}
            groups.append(cur)
    return groups


def _sort_cut_ids(cut_ids: list, order: list) -> list:
    rank = {cid: i for i, cid in enumerate(order)}
    return sorted(cut_ids, key=lambda x: rank.get(x, 10**9))


def _parse_groups(raw, valid_cut_ids: set, order: list) -> list | None:
    if not isinstance(raw, list):
        return None
    seen: set = set()
    out: list = []
    for g in raw:
        if not isinstance(g, dict):
            continue
        gid = str(g.get("id") or "").strip()
        if not GID_RE.fullmatch(gid):
            continue
        name = str(g.get("name") or "").strip()[:SCENE_NAME_MAX] or "씬"
        cut_ids = []
        for cid in g.get("cut_ids") or []:
            if isinstance(cid, str) and cid in valid_cut_ids and cid not in seen:
                cut_ids.append(cid)
                seen.add(cid)
        if not cut_ids:
            continue
        out.append({
            "id": gid,
            "name": name,
            "cut_ids": _sort_cut_ids(cut_ids, order),
            "collapsed": bool(g.get("collapsed")),
        })
    return out


def _local_cut_records(edit: dict | None) -> list:
    raw = (edit or {}).get("local_cuts")
    if not isinstance(raw, list):
        return []
    out = []
    for lc in raw:
        if not isinstance(lc, dict):
            continue
        cid = lc.get("id")
        if not isinstance(cid, str) or not LOCAL_CUT_ID_RE.fullmatch(cid):
            continue
        out.append(lc)
    return out


def _local_cut_as_workspace(lc: dict) -> dict:
    return {
        "id": lc["id"],
        "name": str(lc.get("name") or "cut"),
        "scene": "",
        "scene_id": "",
        "story": "",
        "prompt": "",
        "shot": "",
        "tl_sec": LOCAL_CUT_DEFAULT_SEC,
        "tl_in": 0.0,
        "local": True,
    }


def project_cut_ids(proj: dict, edit: dict | None) -> set:
    ids = {c.get("id") for c in (proj.get("cuts") or []) if c.get("id")}
    for lc in _local_cut_records(edit):
        ids.add(lc["id"])
    return ids


def effective_groups(pid: str, proj: dict | None, edit: dict | None, timeline_order: list) -> list:
    src_cuts = (proj or {}).get("cuts") or []
    valid = project_cut_ids(proj or {}, edit) - _hidden_cut_ids(edit)
    if edit and isinstance(edit.get("groups"), list):
        parsed = _parse_groups(edit["groups"], valid, timeline_order)
        return parsed if parsed is not None else []
    base = default_groups_from_cuts(src_cuts)
    for g in base:
        g["cut_ids"] = _sort_cut_ids(g["cut_ids"], timeline_order)
    return base


def groups_customized(edit: dict | None) -> bool:
    return bool(edit and isinstance(edit.get("groups"), list))


def _find_project(pid: str):
    d = user_dir()
    ws = _load_workspace(d)
    proj = next((p for p in ws.get("projects") or [] if p.get("id") == pid), None)
    return d, proj


def timeline(pid: str) -> dict | None:
    d, proj = _find_project(pid)
    if not proj:
        return None
    jobs = _all_media(d)
    by_cut = _jobs_by_cut(jobs)
    edit = load_edit(pid) or {}
    hidden = _hidden_cut_ids(edit)
    clips_edit = edit.get("clips") if isinstance(edit.get("clips"), dict) else {}
    src_cuts = list(proj.get("cuts") or [])
    for lc in _local_cut_records(edit):
        if lc["id"] not in hidden:
            src_cuts.append(_local_cut_as_workspace(lc))
    base = []
    for i, c in enumerate(src_cuts):
        if c.get("id") in hidden:
            continue
        e = clips_edit.get(c.get("id")) if isinstance(clips_edit.get(c.get("id")), dict) else None
        pick = e.get("pick") if e and isinstance(e.get("pick"), str) else None
        job, n = _preview(c, by_cut, jobs, pick)
        kind = job["kind"] if job else None
        src_dur = media_duration(job)
        tl_in = c.get("tl_in") if isinstance(c.get("tl_in"), (int, float)) else 0.0
        seed_in, seed_sec = tl_in, clip_seconds(c, job)
        if e and "sec" not in e:
            e = None if not pick else {"pick": pick}
        cur_in, cur_sec = (e.get("in", seed_in), e.get("sec", seed_sec)) if e else (seed_in, seed_sec)
        vers = [{"id": v["id"], "kind": v["kind"], "source": v.get("source"), "model": v.get("model"),
                 "created": v["mtime"], "seconds": v.get("seconds"), "width": v.get("width"),
                 "height": v.get("height")} for v in _versions_of(c, by_cut, jobs)]
        cur_in, cur_sec = clamp_clip(kind, cur_in, cur_sec, src_dur)
        base.append({
            "index": i,                       # position in 공간쉐어 order
            "id": c.get("id"),
            "name": c.get("name") or "",
            "scene": c.get("scene") or "",
            "scene_id": c.get("scene_id") or "",
            "story": c.get("story") or "",
            "prompt": c.get("prompt") or "",
            "shot": c.get("shot") or "",
            "tl_sec": c.get("tl_sec"),
            "tl_in": float(tl_in or 0.0),
            "in": cur_in,
            "sec": cur_sec,
            "src_dur": src_dur,
            "edited": bool(e),
            "media": _media_view(job),
            "versions": n,
            "versions_list": vers,
            "pick": pick if job and pick == job["id"] else None,
            "prompt_aspect": (job or {}).get("aspect") or "",
        })
    by_id = {c["id"]: c for c in base}
    order = [x for x in (edit.get("order") or []) if x in by_id and x not in hidden]
    seen = set(order)
    order += [c["id"] for c in base if c["id"] not in seen and c["id"] not in hidden]
    groups = effective_groups(pid, proj, edit, order)
    cut_to_group = {cid: g["id"] for g in groups for cid in g["cut_ids"]}
    cuts = []
    at = 0.0
    for pos, cid in enumerate(dict.fromkeys(order)):
        c = by_id[cid]
        c["pos"] = pos
        c["start"] = _round(at)
        gid = cut_to_group.get(cid) or ""
        g = next((x for x in groups if x["id"] == gid), None)
        c["group_id"] = gid
        c["group_name"] = g["name"] if g else ""
        at += c["sec"]
        cuts.append(c)
    return {"ok": True, "project": {"id": proj.get("id"), "name": proj.get("name") or "",
                                    "logline": proj.get("logline") or ""},
            "cuts": cuts, "groups": groups, "groups_customized": groups_customized(edit),
            "total_sec": _round(at),
            "edited": bool(edit), "edit_updated_at": edit.get("updated_at")}


def save_edit(pid: str, order, clips) -> dict | None:
    """Validate against the project, clamp, and write edits/edit_<pid>.json atomically."""
    import time
    tl = timeline(pid)
    if tl is None:
        return None
    by_id = {c["id"]: c for c in tl["cuts"]}
    if not isinstance(order, list):
        order = []
    order = [x for x in dict.fromkeys(order) if isinstance(x, str) and x in by_id]
    order += [cid for cid in by_id if cid not in order]
    out_clips = {}
    clips = clips if isinstance(clips, dict) else {}
    old = (load_edit(pid) or {}).get("clips") or {}
    for cid, c in by_id.items():
        e = clips.get(cid) if isinstance(clips.get(cid), dict) else {"in": c["in"], "sec": c["sec"]}
        pick = e["pick"] if "pick" in e else (old.get(cid) or {}).get("pick")
        valid = {v["id"]: v for v in c["versions_list"]}
        if not (isinstance(pick, str) and pick in valid):
            pick = None
        kind = valid[pick]["kind"] if pick else (c["media"]["kind"] if c["media"] else None)
        src_dur = c["src_dur"] if not pick or (c["media"] and c["media"]["id"] == pick) else None
        if pick and kind == "video" and src_dur is None:
            src_dur = media_duration(_all_media(user_dir()).get(pick))
        i, sec = clamp_clip(kind, e.get("in", c["in"]), e.get("sec", c["sec"]), src_dur)
        out_clips[cid] = {"in": i, "sec": sec, **({"pick": pick} if pick else {})}
    old = load_edit(pid) or {}
    data = {"version": 1, "pid": pid, "order": order, "clips": out_clips, "updated_at": time.time()}
    if isinstance(old.get("groups"), list):
        data["groups"] = old["groups"]
    _preserve_edit_fields(old, data)
    _atomic_edit_write(pid, data)
    return timeline(pid)


def save_groups(pid: str, groups) -> dict | None:
    """Persist scene/cut groups in edits/edit_<pid>.json (does not change timeline order/trims)."""
    import time
    d, proj = _find_project(pid)
    if not proj:
        return None
    edit_pre = load_edit(pid) or {}
    valid = project_cut_ids(proj, edit_pre)
    tl = timeline(pid)
    if tl is None:
        return None
    order = [c["id"] for c in tl["cuts"]]
    parsed = _parse_groups(groups, valid, order)
    if parsed is None:
        raise ValueError("groups must be a list")
    old = load_edit(pid) or {}
    clips = old.get("clips") if isinstance(old.get("clips"), dict) else {}
    if not clips:
        clips = {c["id"]: {"in": c["in"], "sec": c["sec"], **({"pick": c["pick"]} if c.get("pick") else {})}
                 for c in tl["cuts"]}
    ord_saved = old.get("order") if isinstance(old.get("order"), list) else order
    ord_saved = [x for x in ord_saved if x in valid]
    ord_saved += [cid for cid in order if cid not in ord_saved]
    data = {
        "version": 1, "pid": pid, "order": ord_saved, "clips": clips,
        "groups": parsed, "updated_at": time.time(),
    }
    _preserve_edit_fields(old, data)
    _atomic_edit_write(pid, data)
    return timeline(pid)


def add_local_cut(pid: str, group_id: str | None = None, after_cut_id: str | None = None) -> dict:
    """Append a pack-local cut (stored in edits/local_cuts, merged into timeline)."""
    import secrets
    import time

    d, proj = _find_project(pid)
    if not proj:
        raise ValueError("project not found")
    edit = load_edit(pid) or {}
    local = _local_cut_records(edit)
    valid = project_cut_ids(proj, edit)
    n = len(valid) + 1
    cut_id = f"L{int(time.time() * 1000)}_{secrets.token_hex(3)}"
    while cut_id in valid:
        cut_id = f"L{int(time.time() * 1000)}_{secrets.token_hex(3)}"
    entry = {"id": cut_id, "name": f"cut{n}", "created": time.time()}
    if isinstance(group_id, str) and group_id.strip() and GID_RE.fullmatch(group_id.strip()):
        entry["group_id"] = group_id.strip()
    local.append(entry)

    tl = timeline(pid)
    if tl is None:
        raise ValueError("project not found")
    order = [c["id"] for c in tl["cuts"]]
    if isinstance(after_cut_id, str) and after_cut_id in valid:
        order.insert(order.index(after_cut_id) + 1, cut_id)
    else:
        order.append(cut_id)

    groups = [dict(g) for g in (tl.get("groups") or [])]
    gid = entry.get("group_id")
    if gid:
        found = False
        for g in groups:
            if g.get("id") == gid:
                g["cut_ids"] = _sort_cut_ids([*(g.get("cut_ids") or []), cut_id], order)
                found = True
                break
        if not found:
            groups.append({"id": gid, "name": "씬", "cut_ids": [cut_id], "collapsed": False})

    clips = dict(edit.get("clips")) if isinstance(edit.get("clips"), dict) else {}
    clips[cut_id] = {"in": 0.0, "sec": LOCAL_CUT_DEFAULT_SEC}

    data = {
        "version": 1,
        "pid": pid,
        "order": order,
        "clips": clips,
        "local_cuts": local,
        "updated_at": time.time(),
    }
    if groups:
        data["groups"] = groups
    elif isinstance(edit.get("groups"), list):
        data["groups"] = edit["groups"]
    _preserve_edit_fields(edit, data)
    _atomic_edit_write(pid, data)
    return entry


def _move_local_cut_to_trash(pid: str, cut_id: str, stamp: str, local_record: dict | None) -> Path:
    dest = TRASH_DIR / pid / stamp / cut_id
    dest.mkdir(parents=True, exist_ok=True)
    moved: list = []
    wfd = WORKFLOWS_DIR / pid / cut_id
    ver = VERSIONS_DIR / pid / cut_id
    if wfd.is_dir():
        shutil.move(str(wfd), str(dest / "workflows"))
        moved.append("workflows")
    if ver.is_dir():
        shutil.move(str(ver), str(dest / "versions"))
        moved.append("versions")
    manifest = {
        "pid": pid,
        "cut_id": cut_id,
        "stamp": stamp,
        "local": True,
        "moved": moved,
        "local_cut": local_record,
    }
    (dest / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return dest


def _find_trash_manifest(pid: str, cut_id: str) -> tuple[Path, dict] | None:
    base = TRASH_DIR / pid
    if not base.is_dir():
        return None
    hits: list = []
    for stamp_dir in base.iterdir():
        if not stamp_dir.is_dir():
            continue
        cut_dir = stamp_dir / cut_id
        mf = cut_dir / "manifest.json"
        if mf.is_file():
            try:
                data = json.loads(mf.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if isinstance(data, dict):
                hits.append((stamp_dir.name, cut_dir, data))
    if not hits:
        return None
    hits.sort(key=lambda x: x[0], reverse=True)
    _, cut_dir, data = hits[0]
    return cut_dir, data


def list_trash(pid: str) -> list:
    if not PID_RE.fullmatch(pid or ""):
        raise ValueError("invalid project id")
    base = TRASH_DIR / pid
    out: list = []
    if not base.is_dir():
        return out
    for stamp_dir in sorted(base.iterdir(), reverse=True):
        if not stamp_dir.is_dir():
            continue
        for cut_dir in stamp_dir.iterdir():
            mf = cut_dir / "manifest.json"
            if not mf.is_file():
                continue
            try:
                data = json.loads(mf.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if isinstance(data, dict):
                data = dict(data)
                data["path"] = str(cut_dir)
                out.append(data)
    return out


def delete_cuts(pid: str, cut_ids: list) -> dict | None:
    """Soft-delete cuts: hidden list + optional trash move for pack-local cuts."""
    import time

    d, proj = _find_project(pid)
    if not proj:
        return None
    if not isinstance(cut_ids, list) or not cut_ids:
        raise ValueError("cuts required")
    edit = load_edit(pid) or {}
    valid = project_cut_ids(proj, edit)
    hidden = _hidden_cut_ids(edit)
    targets = []
    for cid in dict.fromkeys(cut_ids):
        if not isinstance(cid, str) or cid not in valid:
            raise ValueError(f"invalid cut id: {cid}")
        if cid in hidden:
            continue
        targets.append(cid)
    if not targets:
        return timeline(pid)

    stamp = _trash_stamp()
    local_by_id = {lc["id"]: lc for lc in _local_cut_records(edit)}
    local = [lc for lc in _local_cut_records(edit) if lc["id"] not in targets]
    for cid in targets:
        if _is_local_cut_id(cid):
            _move_local_cut_to_trash(pid, cid, stamp, local_by_id.get(cid))

    base_order = [x for x in (edit.get("order") if isinstance(edit.get("order"), list) else []) if isinstance(x, str)]
    order = [x for x in base_order if x not in targets]
    remaining = valid - hidden - set(targets)
    seen = set(order)
    for cid in remaining:
        if cid not in seen:
            order.append(cid)
    hidden = sorted(hidden | set(targets))
    clips = edit.get("clips") if isinstance(edit.get("clips"), dict) else {}
    clips = {k: v for k, v in clips.items() if k not in targets}
    groups_raw = edit.get("groups") if isinstance(edit.get("groups"), list) else None
    if groups_raw is not None:
        parsed = _parse_groups(groups_raw, valid - set(hidden), order)
        groups_out = parsed if parsed is not None else []
    else:
        groups_out = None

    data = {
        "version": 1,
        "pid": pid,
        "order": order,
        "clips": clips,
        "hidden": hidden,
        "local_cuts": local,
        "updated_at": time.time(),
    }
    if groups_out is not None:
        data["groups"] = groups_out
    elif isinstance(edit.get("groups"), list):
        data["groups"] = edit["groups"]
    _atomic_edit_write(pid, data)
    return timeline(pid)


def restore_cuts(pid: str, cut_ids: list | None = None) -> dict | None:
    """Restore soft-deleted cuts (move pack-local dirs back from trash, unhide)."""
    import time

    d, proj = _find_project(pid)
    if not proj:
        return None
    edit = load_edit(pid) or {}
    hidden = _hidden_cut_ids(edit)
    if not hidden:
        return timeline(pid)
    if cut_ids is None:
        targets = sorted(hidden)
    else:
        if not isinstance(cut_ids, list):
            raise ValueError("cuts must be a list")
        targets = []
        for cid in dict.fromkeys(cut_ids):
            if not isinstance(cid, str) or cid not in hidden:
                raise ValueError(f"cut not hidden: {cid}")
            targets.append(cid)

    local = _local_cut_records(edit)
    local_ids = {lc["id"] for lc in local}
    order = edit.get("order") if isinstance(edit.get("order"), list) else []
    order = [x for x in order if isinstance(x, str)]

    for cid in targets:
        hit = _find_trash_manifest(pid, cid)
        if hit:
            cut_dir, manifest = hit
            wfd = cut_dir / "workflows"
            ver = cut_dir / "versions"
            dest_wf = WORKFLOWS_DIR / pid / cid
            dest_ver = VERSIONS_DIR / pid / cid
            dest_wf.parent.mkdir(parents=True, exist_ok=True)
            dest_ver.parent.mkdir(parents=True, exist_ok=True)
            if wfd.is_dir() and not dest_wf.exists():
                shutil.move(str(wfd), str(dest_wf))
            if ver.is_dir() and not dest_ver.exists():
                shutil.move(str(ver), str(dest_ver))
            lc = manifest.get("local_cut")
            if isinstance(lc, dict) and lc.get("id") == cid and cid not in local_ids:
                local.append(lc)
                local_ids.add(cid)
            try:
                shutil.rmtree(cut_dir)
            except OSError:
                pass
            stamp_parent = cut_dir.parent
            if stamp_parent.is_dir() and not any(stamp_parent.iterdir()):
                stamp_parent.rmdir()
        hidden.discard(cid)
        if cid not in order:
            order.append(cid)

    data = {
        "version": 1,
        "pid": pid,
        "order": order,
        "clips": edit.get("clips") if isinstance(edit.get("clips"), dict) else {},
        "hidden": sorted(hidden),
        "local_cuts": local,
        "updated_at": time.time(),
    }
    _preserve_edit_fields(edit, data)
    data["hidden"] = sorted(hidden)
    data["local_cuts"] = local
    if isinstance(edit.get("groups"), list):
        data["groups"] = edit["groups"]
    _atomic_edit_write(pid, data)
    return timeline(pid)


def new_group_id() -> str:
    import secrets
    import time
    return f"s{int(time.time() * 1000)}_{secrets.token_hex(3)}"


def reset_edit(pid: str) -> dict | None:
    """Back to 공간쉐어 order/trims. The old edit is kept as edit_<pid>.reset-<ts>.json (reversible)."""
    import time
    f = _edit_file(pid)
    if f.is_file():
        f.replace(f.with_name(f"edit_{pid}.reset-{int(time.time())}.json"))
    return timeline(pid)


def media_path(job_id: str) -> Path | None:
    """Resolve a result file by id: 공간쉐어 job ids under <data_root>/<uid>/, version ids under versions/."""
    if isinstance(job_id, str) and VER_ID_RE.fullmatch(job_id):
        v = _load_versions().get(job_id)
        if not v:
            return None
        p = Path(v["path"]).resolve()
        try:
            p.relative_to(VERSIONS_DIR.resolve())
        except ValueError:
            return None
        return p if p.is_file() else None
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
    """320px JPEG thumbnail in the pack cache: a frame for videos, a downscale for images."""
    src = media_path(job_id)
    if src is None:
        return None
    is_video = MEDIA_KINDS.get(src.suffix.lower()) == "video"
    out = CACHE_DIR / "posters" / f"{job_id}.jpg"
    if out.is_file() and out.stat().st_mtime >= src.stat().st_mtime:
        return out
    exe = ffmpeg_exe()
    if not exe:
        return None
    out.parent.mkdir(parents=True, exist_ok=True)
    import os
    import secrets

    tmp = out.with_name(f"{out.stem}.{os.getpid()}.{secrets.token_hex(4)}.tmp.jpg")
    with _poster_sem:
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        subprocess.run(
            [exe, "-y", "-loglevel", "error", *(["-ss", "0.3"] if is_video else []), "-i", str(src), "-frames:v", "1",
             "-vf", "scale=320:-2", "-q:v", "4", str(tmp)],
            check=False, capture_output=True, timeout=30, creationflags=flags,
        )
    if tmp.is_file() and tmp.stat().st_size > 0:
        try:
            tmp.replace(out)
        except OSError:
            pass
        if out.is_file():
            return out
    return None if is_video else src   # image fallback: the original file


def add_version(pid: str, cut_id: str, src: Path, meta: dict) -> dict:
    """Copy a finished file into versions/<pid>/<cut>/ and make it the cut's pick in the edit."""
    import secrets
    import time
    if not PID_RE.fullmatch(pid or "") or not PID_RE.fullmatch(cut_id or ""):
        raise ValueError("invalid project/cut id")
    tl = timeline(pid)
    if tl is None or not any(c["id"] == cut_id for c in tl["cuts"]):
        raise ValueError("cut not found in project")
    ext = src.suffix.lower()
    if ext not in MEDIA_KINDS:
        raise ValueError(f"unsupported media type {ext}")
    vid = f"v{int(time.time() * 1000)}_{secrets.token_hex(3)}"
    d = VERSIONS_DIR / pid / cut_id
    d.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, d / f"{vid}{ext}")
    info = {"id": vid, "pid": pid, "cut_id": cut_id, "ext": ext, "created_at": time.time(), **meta}
    (d / f"{vid}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    try:
        from . import gg_wfstore
        gg_wfstore.maybe_save_for_new_version(pid, cut_id, vid, d / f"{vid}{ext}", meta)
    except Exception:  # noqa: BLE001
        pass
    # make it the cut's pick, keeping order/trims
    edit = load_edit(pid) or {}
    clips = {c["id"]: {"in": c["in"], "sec": c["sec"], **({"pick": c["pick"]} if c.get("pick") else {})}
             for c in tl["cuts"]}
    clips[cut_id]["pick"] = vid
    save_edit(pid, edit.get("order") or [c["id"] for c in tl["cuts"]], clips)
    return info
