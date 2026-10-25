"""Native project HTTP helpers (testable without aiohttp)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    from .gg_data import PACK_DIR, clamp_clip
    from .gg_project import LocalStore
    from .gg_project.timeline import timeline_order
except ImportError:  # unittest / plain script
    from gg_data import PACK_DIR, clamp_clip  # type: ignore
    from gg_project import LocalStore  # type: ignore
    from gg_project.timeline import timeline_order  # type: ignore

try:
    from . import gg_template
    from . import gg_wfstore
except ImportError:
    import gg_template  # type: ignore
    import gg_wfstore  # type: ignore

NATIVE_UNAVAILABLE = "Not available for native projects yet"
_STORE: LocalStore | None = None


def is_native_pid(pid: str) -> bool:
    return isinstance(pid, str) and "-" in pid


def native_store() -> LocalStore:
    global _STORE
    if _STORE is None:
        _STORE = LocalStore(PACK_DIR)
    return _STORE


def set_native_store(store: LocalStore) -> None:
    global _STORE
    _STORE = store


def merge_projects_list(share_payload: dict) -> dict:
    """Append native projects; mark share items native:false."""
    out = dict(share_payload)
    projects = []
    for p in share_payload.get("projects") or []:
        if isinstance(p, dict):
            row = dict(p)
            row["native"] = False
            projects.append(row)
    store = native_store()
    native_rows = []
    for row in store.list_projects(include_deleted=False):
        pid = row.get("id")
        if not isinstance(pid, str):
            continue
        doc = store.get_project(pid)
        if not doc:
            continue
        cuts = [c for c in (doc.get("cuts") or {}).values() if isinstance(c, dict) and not c.get("deleted_at")]
        native_rows.append({
            "id": pid,
            "name": row.get("name") or doc.get("name") or "",
            "cut_count": len(cuts),
            "native": True,
        })
    native_rows.sort(key=lambda r: (r.get("name") or "").lower())
    out["projects"] = native_rows + projects
    return out


def resolve_template_graph(template_ref: str | None) -> dict | None:
    if not template_ref:
        return None
    try:
        return gg_template.read_workflow_ref(template_ref)
    except ValueError:
        return None


def create_native_project(name: str, template_ref: str | None = None) -> dict:
    name = (name or "").strip()
    if not name:
        raise ValueError("name required")
    ref = (template_ref or "").strip() or None
    graph = resolve_template_graph(ref) if ref else None
    store = native_store()
    doc = store.create_project(name, template_ref=ref, template_graph=graph)
    return {"ok": True, "project": {"id": doc["id"], "name": doc.get("name"), "native": True}}


def rename_native_project(pid: str, name: str) -> dict:
    name = (name or "").strip()
    if not name:
        raise ValueError("name required")
    doc = native_store().rename_project(pid, name)
    return {"ok": True, "project": {"id": pid, "name": doc.get("name"), "native": True}}


def delete_native_project(pid: str) -> dict:
    native_store().delete_project(pid)
    return {"ok": True}


def restore_native_project(pid: str) -> dict:
    native_store().restore_project(pid)
    return {"ok": True}


def native_timeline(pid: str) -> dict | None:
    return native_store().to_timeline(pid)


def native_save_edit(pid: str, order, clips) -> dict | None:
    store = native_store()
    tl = store.to_timeline(pid)
    if tl is None:
        return None
    by_id = {c["id"]: c for c in tl["cuts"]}
    clips = clips if isinstance(clips, dict) else {}
    out_clips: dict[str, dict] = {}
    for cid, c in by_id.items():
        e = clips.get(cid) if isinstance(clips.get(cid), dict) else {"in": c["in"], "sec": c["sec"]}
        pick = e.get("pick") if "pick" in e else c.get("pick")
        valid = {v["id"]: v for v in c.get("versions_list") or []}
        if not (isinstance(pick, str) and pick in valid):
            pick = None
        kind = valid[pick]["kind"] if pick else (c["media"]["kind"] if c.get("media") else None)
        src_dur = c.get("src_dur")
        i, sec = clamp_clip(kind, e.get("in", c["in"]), e.get("sec", c["sec"]), src_dur)
        out_clips[cid] = {"in": i, "sec": sec, **({"pick": pick} if pick else {})}
    if not isinstance(order, list):
        order = []
    order = [x for x in dict.fromkeys(order) if isinstance(x, str) and x in by_id]
    order += [cid for cid in by_id if cid not in order]
    store.apply_timeline_edit(pid, order, out_clips)
    return store.to_timeline(pid)


def native_save_groups(pid: str, groups) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    if not isinstance(groups, list):
        raise ValueError("groups must be a list")
    store.sync_scene_groups(pid, groups)
    return store.to_timeline(pid)


def native_add_cut(pid: str, group_id: str | None, after: str | None) -> dict:
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        raise ValueError("project not found")
    graph = None
    ref = doc.get("template_ref")
    if isinstance(ref, str) and ref:
        graph = resolve_template_graph(ref)
    if graph is None:
        tpl = gg_template.get_template(pid)
        if tpl:
            graph = tpl
    scene_id = group_id if isinstance(group_id, str) and group_id else None
    doc = store.add_cut(pid, scene_id=scene_id, after=after, template_graph=graph)
    order = timeline_order(doc)
    new_id = order[-1] if order else None
    cut_entry = (doc.get("cuts") or {}).get(new_id) if new_id else None
    tl = store.to_timeline(pid)
    return {
        "ok": True,
        "cut": {"id": new_id, "name": cut_entry.get("name")} if cut_entry else None,
        "template_copied": graph is not None,
        "timeline": tl,
    }


def native_delete_cuts(pid: str, cut_ids: list) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    store.delete_cuts(pid, cut_ids)
    return {"ok": True, "timeline": store.to_timeline(pid)}


def native_restore_cuts(pid: str, cut_ids: list | None) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    store.restore_cuts(pid, cut_ids)
    return {"ok": True, "timeline": store.to_timeline(pid)}


def native_update_cut(
    pid: str,
    cut_id: str,
    fields: dict,
    expected_rev: int | None = None,
) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    if not isinstance(cut_id, str) or not cut_id:
        raise ValueError("cut_id required")
    if not isinstance(fields, dict) or not fields:
        raise ValueError("fields required")
    store.update_cut(pid, cut_id, fields, expected_rev=expected_rev)
    return {"ok": True, "timeline": store.to_timeline(pid)}


def native_update_project(
    pid: str,
    fields: dict,
    expected_rev: int | None = None,
) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    if not isinstance(fields, dict) or not fields:
        raise ValueError("fields required")
    store.update_project(pid, fields, expected_rev=expected_rev)
    try:
        from . import gg_data
    except ImportError:
        import gg_data  # type: ignore
    projects_payload = merge_projects_list(gg_data.list_projects())
    return {
        "ok": True,
        "projects": projects_payload.get("projects") or [],
        "timeline": store.to_timeline(pid),
    }


def native_template_info(pid: str) -> dict:
    doc = native_store().get_project(pid)
    if not doc:
        raise ValueError("project not found")
    ref = doc.get("template_ref")
    if isinstance(ref, str) and ref:
        path_ok = gg_template.safe_workflow_path(ref) is not None
        wf = gg_template.read_workflow_ref(ref) if path_ok else None
        return {"ref": ref, "exists": path_ok, "workflow": wf}
    legacy = gg_template.get_template_info(pid)
    if legacy.get("exists"):
        return legacy
    return {"ref": None, "exists": False, "workflow": None}


def native_set_template_ref(pid: str, ref: str) -> Path | None:
    ref = (ref or "").strip()
    store = native_store()
    if store.get_project(pid) is None:
        raise ValueError("project not found")
    if ref:
        gg_template.read_workflow_ref(ref)
    store.set_template(pid, ref or None)
    if not ref:
        legacy = gg_template.save_template_ref(pid, "")
        return legacy
    return gg_template.save_template_ref(pid, ref)


def native_set_template_workflow(pid: str, workflow: dict) -> Path:
    if native_store().get_project(pid) is None:
        raise ValueError("project not found")
    return gg_template.save_template(pid, workflow)


def _workflow_from_sha(store: LocalStore, pid: str, sha: str | None) -> dict | None:
    if not isinstance(sha, str) or not sha:
        return None
    return store.get_blob(pid, sha)


def native_cut_source_workflow(pid: str, cut_id: str) -> dict:
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        raise ValueError("project not found")
    cuts = doc.get("cuts") or {}
    cut = cuts.get(cut_id) if isinstance(cuts, dict) else None
    if not cut or cut.get("deleted_at"):
        raise ValueError("cut not found")
    wf = _workflow_from_sha(store, pid, cut.get("workflow_sha"))
    if wf:
        kind = "ui" if gg_template._is_ui_workflow(wf) else "api"
        return {"ok": True, "source": "stored", "workflow": wf, "kind": kind}
    pick = cut.get("pick_version_id")
    if isinstance(pick, str):
        for ver in store.list_versions(pid, cut_id):
            if ver.get("id") == pick:
                wf = _workflow_from_sha(store, pid, ver.get("workflow_sha"))
                if wf:
                    kind = "ui" if gg_template._is_ui_workflow(wf) else "api"
                    return {"ok": True, "source": "stored", "workflow": wf, "kind": kind}
    for ver in store.list_versions(pid, cut_id):
        wf = _workflow_from_sha(store, pid, ver.get("workflow_sha"))
        if wf:
            kind = "ui" if gg_template._is_ui_workflow(wf) else "api"
            return {"ok": True, "source": "stored", "workflow": wf, "kind": kind}
    tpl = native_template_info(pid).get("workflow")
    if tpl:
        kind = "ui" if gg_template._is_ui_workflow(tpl) else "api"
        return {"ok": True, "source": "template", "workflow": tpl, "kind": kind}
    return {"ok": True, "source": None, "workflow": None, "kind": None}


def native_version_workflow(pid: str, cut_id: str, vid: str) -> dict | None:
    store = native_store()
    for ver in store.list_versions(pid, cut_id):
        if ver.get("id") != vid:
            continue
        sha = ver.get("workflow_sha")
        ui = _workflow_from_sha(store, pid, sha)
        if ui:
            kind = "ui" if gg_template._is_ui_workflow(ui) else "api"
            return {"workflow": ui, "prompt": None, "source": "stored", "kind": kind}
    return None


def _skip_native_media_lookup(media_id: str) -> bool:
    """Legacy 공간쉐어 job/version ids are never native version UUIDs."""
    try:
        from . import gg_data as gd
    except ImportError:
        import gg_data as gd  # type: ignore
    if not isinstance(media_id, str) or not media_id:
        return True
    if gd.VER_ID_RE.fullmatch(media_id):
        return True
    if gd.JOB_ID_RE.fullmatch(media_id):
        return True
    return False


def native_media_path(media_id: str) -> Path | None:
    if _skip_native_media_lookup(media_id):
        return None
    store = native_store()
    hit = store.find_version_asset(media_id)
    return hit[1] if hit else None


def native_poster_path(media_id: str) -> Path | None:
    src = native_media_path(media_id)
    if src is None:
        return None
    return _poster_for_file(media_id, src)


_MEDIA_KIND = {".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image", ".mp4": "video", ".webm": "video"}


def _poster_for_file(media_id: str, src: Path) -> Path | None:
    try:
        from . import gg_data as gd
    except ImportError:
        import gg_data as gd  # type: ignore

    out = gd.CACHE_DIR / "posters" / f"{media_id}.jpg"
    if out.is_file() and out.stat().st_mtime >= src.stat().st_mtime:
        return out
    exe = gd.ffmpeg_exe()
    if not exe:
        return src if _MEDIA_KIND.get(src.suffix.lower()) == "image" else None
    is_video = _MEDIA_KIND.get(src.suffix.lower()) == "video"
    out.parent.mkdir(parents=True, exist_ok=True)
    import os
    import secrets
    import subprocess

    tmp = out.with_name(f"{out.stem}.{os.getpid()}.{secrets.token_hex(4)}.tmp.jpg")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.run(
        [exe, "-y", "-loglevel", "error", *(["-ss", "0.3"] if is_video else []), "-i", str(src),
         "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "4", str(tmp)],
        check=False, capture_output=True, timeout=30, creationflags=flags,
    )
    if tmp.is_file() and tmp.stat().st_size > 0:
        try:
            tmp.replace(out)
        except OSError:
            pass
        if out.is_file():
            return out
    return src if not is_video else None


def native_send_last_output(pid: str, cut_id: str) -> dict:
    try:
        from . import gg_sdk
    except ImportError:
        import gg_sdk  # type: ignore

    lo = gg_sdk.last_output()
    if not lo:
        return {"ok": False, "message": "no ComfyUI output found"}
    path = Path(lo["path"])
    meta = gg_wfstore.extract_png_meta(path) if path.suffix.lower() == ".png" else {}
    ui = meta.get("workflow") if isinstance(meta.get("workflow"), dict) else None
    api = meta.get("prompt") if isinstance(meta.get("prompt"), dict) else None
    workflow = ui or api
    store = native_store()
    ver = store.add_version(
        pid,
        cut_id,
        path,
        workflow=workflow,
        prompt_id=lo.get("prompt_id") if isinstance(lo.get("prompt_id"), str) else None,
    )
    return {"ok": True, "version": ver, "output": lo}
