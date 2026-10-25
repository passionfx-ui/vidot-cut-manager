"""Adapt native project documents to /gonggan/timeline response shape."""
from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    from ..gg_data import clamp_clip, media_duration
except ImportError:  # unittest / plain script
    from gg_data import clamp_clip, media_duration  # type: ignore

_IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_VID_EXT = {".mp4", ".webm"}


def _round(v: float) -> float:
    return round(float(v), 2)


def _active_cuts(project: dict[str, Any]) -> dict[str, dict[str, Any]]:
    cuts = project.get("cuts") or {}
    if not isinstance(cuts, dict):
        return {}
    return {cid: c for cid, c in cuts.items() if isinstance(c, dict) and not c.get("deleted_at")}


def timeline_order(project: dict[str, Any]) -> list[str]:
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


def _version_job(root: Path, pid: str, ver: dict[str, Any]) -> dict[str, Any] | None:
    asset = ver.get("asset")
    if not isinstance(asset, dict):
        return None
    rel = asset.get("path")
    if not isinstance(rel, str):
        return None
    path = root / "projects" / pid / rel
    if not path.is_file():
        return None
    kind = asset.get("kind") or _asset_kind(path)
    try:
        mtime = path.stat().st_mtime
    except OSError:
        mtime = 0.0
    return {
        "id": ver["id"],
        "kind": kind,
        "ext": path.suffix.lower(),
        "mtime": mtime,
        "cut_id": ver.get("cut_id") or "",
        "project_id": pid,
        "width": None,
        "height": None,
        "seconds": None,
        "model": "",
        "aspect": "",
        "source": "native",
        "path": str(path),
    }


def _media_view(job: dict[str, Any] | None) -> dict[str, Any] | None:
    if not job:
        return None
    return {k: job.get(k) for k in ("id", "kind", "width", "height", "seconds", "model", "source")}


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
        if not cut_ids:
            continue
        groups.append({
            "id": scene["id"],
            "name": scene.get("name") or "",
            "cut_ids": cut_ids,
            "collapsed": bool(scene.get("collapsed")),
        })
    cut_to_group = {cid: g["id"] for g in groups for cid in g["cut_ids"]}
    scene_index_by_id = {g["id"]: idx for idx, g in enumerate(groups, start=1)}
    base: list[dict[str, Any]] = []
    for i, cid in enumerate(order):
        cut = active.get(cid)
        if not cut:
            continue
        versions = _load_versions(root, pid, cid)
        jobs = [_version_job(root, pid, v) for v in versions]
        jobs = [j for j in jobs if j]
        pick = cut.get("pick_version_id")
        job = None
        if isinstance(pick, str):
            job = next((j for j in jobs if j["id"] == pick), None)
        if not job and jobs:
            job = jobs[0]
        src_dur = media_duration(job) if job else None
        sec = float(cut.get("sec") if isinstance(cut.get("sec"), (int, float)) else 3.0)
        tl_in = float(cut.get("in") or 0.0)
        kind = job["kind"] if job else None
        cur_in, cur_sec = clamp_clip(kind, tl_in, sec, src_dur)
        vers_list = [
            {
                "id": v["id"],
                "kind": (v.get("asset") or {}).get("kind") or "image",
                "source": "native",
                "model": None,
                "created": _version_job(root, pid, v)["mtime"] if _version_job(root, pid, v) else 0,
                "seconds": None,
                "width": None,
                "height": None,
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
            "media": _media_view(job),
            "versions": len(versions),
            "versions_list": vers_list,
            "pick": pick if job and pick == job["id"] else None,
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
    cuts: list[dict[str, Any]] = []
    at = 0.0
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
        c["start"] = _round(at)
        gid = cut_to_group.get(cid) or ""
        g = next((x for x in groups if x["id"] == gid), None)
        c["group_id"] = gid
        c["group_name"] = g["name"] if g else ""
        if gid:
            scene_pos[gid] = scene_pos.get(gid, 0) + 1
            c["cut_in_scene"] = scene_pos[gid]
        else:
            c["cut_in_scene"] = global_num
        at += c["sec"]
        cuts.append(c)
    return {
        "ok": True,
        "project": {
            "id": project.get("id"),
            "name": project.get("name") or "",
            "logline": "",
            "due_date": project.get("due_date") if isinstance(project.get("due_date"), str) else None,
        },
        "cuts": cuts,
        "groups": groups,
        "groups_customized": True,
        "total_sec": _round(at),
        "edited": False,
        "edit_updated_at": None,
    }
