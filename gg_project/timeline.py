"""Adapt native project documents to /gonggan/timeline response shape."""
from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    from ..gg_data import clamp_clip, media_duration
except ImportError:  # unittest / plain script
    from gg_data import clamp_clip, media_duration  # type: ignore

from .entities import is_reference
from .project_settings import PROJECT_ASSETS_DIR, normalize_settings

_IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_VID_EXT = {".mp4", ".webm"}


def _round(v: float) -> float:
    return round(float(v), 2)


def _active_cuts(project: dict[str, Any]) -> dict[str, dict[str, Any]]:
    cuts = project.get("cuts") or {}
    if not isinstance(cuts, dict):
        return {}
    return {cid: c for cid, c in cuts.items() if isinstance(c, dict) and not c.get("deleted_at") and not is_reference(c)}


def timeline_order(project: dict[str, Any]) -> list[str]:
    """Shots cut list order (scenes in list order, then ungrouped cuts). The timeline track has its own
    order, see track_order()."""
    active = _active_cuts(project)
    order: list[str] = []
    seen: set[str] = set()
    for scene in project.get("scenes") or []:
        if not isinstance(scene, dict) or scene.get("deleted_at"):
            continue
        for cid in scene.get("cut_order") or []:
            if cid in active and cid not in seen:
                order.append(cid)
                seen.add(cid)
    for cid in project.get("loose_order") or []:
        if cid in active and cid not in seen:
            order.append(cid)
            seen.add(cid)
    for cid in active:
        if cid not in seen:
            order.append(cid)
            seen.add(cid)
    return order


def stored_track(project: dict[str, Any]) -> dict[str, Any] | None:
    """project["timeline"] = {order: [cut ids], clips: {cid: {in, sec, start?}}}, or None (never edited)."""
    tl = project.get("timeline")
    return tl if isinstance(tl, dict) else None


def track_order(project: dict[str, Any]) -> list[str]:
    """Timeline clip order: the stored order (active cuts only), then cuts it does not list yet
    (new / restored) at the end in cut list order. No stored timeline: the cut list order."""
    cut_order = timeline_order(project)
    tl = stored_track(project)
    if tl is None:
        return cut_order
    known = set(cut_order)
    order = [cid for cid in dict.fromkeys(tl.get("order") or []) if isinstance(cid, str) and cid in known]
    seen = set(order)
    return order + [cid for cid in cut_order if cid not in seen]


def clip_start(entry: Any) -> float | None:
    v = entry.get("start") if isinstance(entry, dict) else None
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or v < 0 or v == float("inf"):
        return None
    return float(v)


def place_clips(items: list[tuple[float | None, float]]) -> tuple[list[float], float]:
    """(wanted start or None, length) in track order -> (starts, end). A clip without a start is packed
    right after the previous one; a clip never starts before the previous one ends (no overlap)."""
    starts: list[float] = []
    at = 0.0
    for want, sec in items:
        s = at if want is None else max(at, want)
        starts.append(_round(s))
        at = s + float(sec)
    return starts, _round(at)


def original_sec(row: dict[str, Any]) -> float:
    """Length the cut card shows (cutOriginalSec in gg_cuts_core.js): video media length, else planned, else the cut's own."""
    media = row.get("media") or {}
    if media.get("kind") == "video" and isinstance(row.get("src_dur"), (int, float)) and row["src_dur"] > 0:
        return float(row["src_dur"])
    if isinstance(row.get("planned_sec"), (int, float)):
        return float(row["planned_sec"])
    return float(row.get("tl_sec") or 3.0)


def reset_track(root: Path, project: dict[str, Any]) -> dict[str, Any]:
    """Timeline rebuilt from the cut list: cut list order, no trims (in 0, original length), no gaps."""
    tl = build_timeline(root, project)
    clips: dict[str, dict[str, float]] = {}
    for c in tl["cuts"]:
        kind = (c.get("media") or {}).get("kind")
        _, sec = clamp_clip(kind, 0.0, original_sec(c), c.get("src_dur"))
        clips[c["id"]] = {"in": 0.0, "sec": sec}
    return {"order": [c["id"] for c in tl["cuts"]], "clips": clips}


def _scene_by_id(project: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for s in project.get("scenes") or []:
        if isinstance(s, dict) and s.get("id") and not s.get("deleted_at"):
            out[s["id"]] = s
    return out


def _load_versions(root: Path, pid: str, cut_id: str) -> list[dict[str, Any]]:
    vdir = root / "projects" / pid / "versions" / cut_id
    if not vdir.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for p in vdir.glob("*.json"):
        try:
            data = __import__("json").loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and not data.get("deleted_at"):
            out.append(data)
    out.sort(key=lambda v: (v.get("created_at") or "", v.get("id") or ""), reverse=True)
    return out


def _asset_kind(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in _VID_EXT:
        return "video"
    return "image"


def version_asset_file(project_dir: Path, asset: Any) -> Path | None:
    """Media file of a version asset. A relative path lives inside the pack project folder; an absolute
    path is a media file directly in an `assets` folder (outputs saved in the project's own folder)."""
    rel = asset.get("path") if isinstance(asset, dict) else None
    if not isinstance(rel, str) or not rel:
        return None
    p = Path(rel)
    if p.drive or p.root:
        if not p.is_absolute() or p.parent.name != PROJECT_ASSETS_DIR or p.suffix.lower() not in _IMG_EXT | _VID_EXT:
            return None
        path = p
    else:
        if ".." in p.parts:
            return None
        path = project_dir / p
    return path if path.is_file() else None


def _asset_seconds(asset: dict[str, Any]) -> float | None:
    s = asset.get("seconds")
    return float(s) if isinstance(s, (int, float)) and not isinstance(s, bool) and s > 0 else None


def _version_job(root: Path, pid: str, ver: dict[str, Any]) -> dict[str, Any] | None:
    path = version_asset_file(root / "projects" / pid, ver.get("asset"))
    if path is None:
        return None
    asset = ver["asset"]
    kind = asset.get("kind") or _asset_kind(path)
    try:
        mtime = path.stat().st_mtime
    except OSError:
        mtime = 0.0
    animated = kind == "video" and asset.get("animated") is True
    return {
        "id": ver["id"],
        "kind": kind,
        "animated": animated,
        "ext": path.suffix.lower(),
        "mtime": mtime,
        "cut_id": ver.get("cut_id") or "",
        "project_id": pid,
        "width": None,
        "height": None,
        "seconds": _asset_seconds(asset) if animated else None,
        "model": "",
        "aspect": "",
        "source": "native",
        "path": str(path),
    }


def current_version(cut: dict[str, Any], versions: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The cut's current version record (newest first list): its pick, else the newest. Chosen whether or
    not its file still exists, so a missing file shows as no media instead of silently another version."""
    pick = cut.get("pick_version_id")
    if isinstance(pick, str):
        hit = next((v for v in versions if v.get("id") == pick), None)
        if hit:
            return hit
    return versions[0] if versions else None


def _media_view(job: dict[str, Any] | None) -> dict[str, Any] | None:
    if not job:
        return None
    return {k: job.get(k) for k in ("id", "kind", "animated", "width", "height", "seconds", "model", "source")}


def _reference_views(root: Path, project: dict[str, Any]) -> list[dict[str, Any]]:
    """References shaped like cuts (id, name, media, pick, versions_list) so the same workflow tab code can open them."""
    pid = project["id"]
    cuts = project.get("cuts") or {}
    if not isinstance(cuts, dict):
        return []
    out: list[dict[str, Any]] = []
    for cid, c in cuts.items():
        if not is_reference(c) or c.get("deleted_at"):
            continue
        versions = _load_versions(root, pid, cid)
        jobs = [j for j in (_version_job(root, pid, v) for v in versions) if j]
        pick = c.get("pick_version_id")
        job = next((j for j in jobs if j["id"] == pick), None) if isinstance(pick, str) else None
        if not job and jobs:
            job = jobs[0]
        out.append({
            "id": cid,
            "name": c.get("name") or "",
            "category": c.get("category") or "Other",
            "kind": "reference",
            "created": c.get("created_at") or "",
            "media": _media_view(job),
            "versions": len(versions),
            "versions_list": [
                {"id": j["id"], "kind": j["kind"], "animated": j["animated"], "source": "native", "model": None,
                 "created": j["mtime"], "seconds": j["seconds"], "width": None, "height": None}
                for j in jobs
            ],
            "pick": job["id"] if job else None,
            "caption": "",
            "notes": "",
            "prompt": "",
        })
    return out


def build_timeline(root: Path, project: dict[str, Any]) -> dict[str, Any]:
    pid = project["id"]
    active = _active_cuts(project)
    scenes = _scene_by_id(project)
    order = timeline_order(project)
    groups = []
    for scene in project.get("scenes") or []:
        if not isinstance(scene, dict) or scene.get("deleted_at"):
            continue
        cut_ids = [cid for cid in (scene.get("cut_order") or []) if cid in active]
        if not cut_ids and not scene.get("keep_empty"):
            continue
        groups.append({
            "id": scene["id"],
            "name": scene.get("name") or "",
            "cut_ids": cut_ids,
            "collapsed": bool(scene.get("collapsed")),
        })
    cut_to_group = {cid: g["id"] for g in groups for cid in g["cut_ids"]}
    scene_index_by_id = {g["id"]: idx for idx, g in enumerate((g for g in groups if g["cut_ids"]), start=1)}
    stored = stored_track(project)
    stored_clips = stored.get("clips") if stored and isinstance(stored.get("clips"), dict) else {}
    wanted: dict[str, float | None] = {}
    base: list[dict[str, Any]] = []
    for i, cid in enumerate(order):
        cut = active.get(cid)
        if not cut:
            continue
        versions = _load_versions(root, pid, cid)
        jobs = {v["id"]: _version_job(root, pid, v) for v in versions}
        cur = current_version(cut, versions)
        job = jobs.get(cur["id"]) if cur else None
        pick = cut.get("pick_version_id")
        src_dur = media_duration(job) if job else None
        sec = float(cut.get("sec") if isinstance(cut.get("sec"), (int, float)) else 3.0)
        tl_in = float(cut.get("in") or 0.0)
        kind = job["kind"] if job else None
        entry = stored_clips.get(cid) if isinstance(stored_clips.get(cid), dict) else {}
        cur_in, cur_sec = clamp_clip(kind, entry.get("in", tl_in), entry.get("sec", sec), src_dur)
        wanted[cid] = clip_start(entry)
        media = _media_view(job)
        if media and kind == "video" and src_dur:
            media["seconds"] = src_dur
        vers_list = [
            {
                "id": v["id"],
                "kind": (v.get("asset") or {}).get("kind") or "image",
                "animated": bool(jobs[v["id"]] and jobs[v["id"]]["animated"]),
                "source": "native",
                "model": None,
                "created": jobs[v["id"]]["mtime"] if jobs[v["id"]] else 0,
                "seconds": jobs[v["id"]]["seconds"] if jobs[v["id"]] else None,
                "width": None,
                "height": None,
                "missing": jobs[v["id"]] is None,
            }
            for v in versions
        ]
        scene_id = cut.get("scene_id") or ""
        scene = scenes.get(scene_id) if scene_id else None
        gid = cut_to_group.get(cid) or ""
        scene_idx = scene_index_by_id.get(gid, 0) if gid else 0
        base.append({
            "index": i,
            "id": cid,
            "name": cut.get("name") or "",
            "scene": scene.get("name") if scene else "",
            "scene_id": scene_id,
            "story": "",
            "prompt": cut.get("prompt") or "",
            "shot": "",
            "tl_sec": sec,
            "tl_in": tl_in,
            "in": cur_in,
            "sec": cur_sec,
            "src_dur": src_dur,
            "edited": False,
            "media": media,
            "versions": len(versions),
            "versions_list": vers_list,
            "pick": pick if cur and pick == cur["id"] else None,
            "prompt_aspect": "",
            "planned_sec": cut.get("planned_sec") if isinstance(cut.get("planned_sec"), (int, float)) else None,
            "end_card": bool(cut.get("end_card")),
            "needs_redo": bool(cut.get("needs_redo")),
            "notes": cut.get("notes") if isinstance(cut.get("notes"), str) else "",
            "caption": cut.get("caption") if isinstance(cut.get("caption"), str) else "",
            "scene_index": scene_idx,
            "cut_in_scene": 0,
            "number": 0,
        })
    by_id = {c["id"]: c for c in base}
    track = [cid for cid in track_order(project) if cid in by_id]
    starts, total = place_clips([(wanted.get(cid), by_id[cid]["sec"]) for cid in track])
    start_by_id = dict(zip(track, starts))
    cuts: list[dict[str, Any]] = []
    global_num = 0
    scene_pos: dict[str, int] = {}
    for pos, cid in enumerate(order):
        c = by_id.get(cid)
        if not c:
            continue
        c = dict(c)
        global_num += 1
        c["number"] = global_num
        c["pos"] = pos
        c["start"] = start_by_id.get(cid, 0.0)
        gid = cut_to_group.get(cid) or ""
        g = next((x for x in groups if x["id"] == gid), None)
        c["group_id"] = gid
        c["group_name"] = g["name"] if g else ""
        if gid:
            scene_pos[gid] = scene_pos.get(gid, 0) + 1
            c["cut_in_scene"] = scene_pos[gid]
        else:
            c["cut_in_scene"] = global_num
        cuts.append(c)
    return {
        "ok": True,
        "project": {
            "id": project.get("id"),
            "name": project.get("name") or "",
            "logline": "",
            "due_date": project.get("due_date") if isinstance(project.get("due_date"), str) else None,
            "settings": normalize_settings(project.get("settings") if isinstance(project.get("settings"), dict) else None),
        },
        "cuts": cuts,
        "track_order": track,
        "references": _reference_views(root, project),
        "groups": groups,
        "groups_customized": True,
        "total_sec": total,
        "edited": False,
        "edit_updated_at": None,
    }
