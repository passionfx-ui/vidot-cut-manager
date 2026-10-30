"""Native project HTTP helpers (testable without aiohttp)."""
from __future__ import annotations

import copy
import threading
import time
from pathlib import Path
from typing import Any

try:
    from .gg_data import PACK_DIR, clamp_clip
    from .gg_project import LocalStore
    from .gg_project.local_store import NEW_CUT_NAME
    from .gg_project.timeline import timeline_order
    from .gg_project.ids import is_uuid_id
    from .gg_project.project_settings import TEMPLATE_SETTING_KEYS, make_project_folder, normalize_settings, project_mp4_export_dir
    from .gg_project.hidden_projects import HIDDEN_FILE_NAME, filter_hidden, load_hidden_ids
    from .gg_project.media_anim import animation_info
except ImportError:  # unittest / plain script
    from gg_data import PACK_DIR, clamp_clip  # type: ignore
    from gg_project import LocalStore  # type: ignore
    from gg_project.local_store import NEW_CUT_NAME  # type: ignore
    from gg_project.timeline import timeline_order  # type: ignore
    from gg_project.ids import is_uuid_id  # type: ignore
    from gg_project.project_settings import TEMPLATE_SETTING_KEYS, make_project_folder, normalize_settings, project_mp4_export_dir  # type: ignore
    from gg_project.hidden_projects import HIDDEN_FILE_NAME, filter_hidden, load_hidden_ids  # type: ignore
    from gg_project.media_anim import animation_info  # type: ignore

try:
    from . import gg_template
    from . import gg_wfnodes
    from . import gg_wfstore
except ImportError:
    import gg_template  # type: ignore
    import gg_wfnodes  # type: ignore
    import gg_wfstore  # type: ignore

NATIVE_UNAVAILABLE = "Not available for this project type yet"
_STORE: LocalStore | None = None


def is_native_pid(pid: str) -> bool:
    """True only for uuid-shaped native ids; legacy ids and anything path-like are not native."""
    return is_uuid_id(pid)


def native_store() -> LocalStore:
    global _STORE
    if _STORE is None:
        _STORE = LocalStore(PACK_DIR)
    return _STORE


def set_native_store(store: LocalStore) -> None:
    global _STORE
    _STORE = store


def hidden_projects_path() -> Path:
    return native_store().projects_dir / HIDDEN_FILE_NAME


def merge_projects_list(share_payload: dict) -> dict:
    """Append native projects; mark share items native:false; omit ids in hidden_projects.json."""
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
    hidden = load_hidden_ids(hidden_projects_path())
    out["projects"] = filter_hidden(native_rows + projects, hidden)
    if out.get("active_project_id") in hidden:
        out["active_project_id"] = None
    return out


def resolve_template_graph(template_ref: str | None) -> dict | None:
    if not template_ref:
        return None
    try:
        return gg_template.read_workflow_ref(template_ref)
    except ValueError:
        return None


_TEMPLATE_SETTING_LABELS = {"image_template": "Image template", "video_template": "Video template"}


def check_template_settings(settings: dict | None) -> None:
    """Each Image / Video template given in `settings` must be a built-in or an existing user workflow."""
    for key in TEMPLATE_SETTING_KEYS:
        ref = (settings or {}).get(key) if isinstance(settings, dict) else None
        if ref is None or (isinstance(ref, str) and not ref.strip()):
            continue
        label = _TEMPLATE_SETTING_LABELS[key]
        if not isinstance(ref, str):
            raise ValueError(f"{label} must be a string")
        try:
            gg_template.read_workflow_ref(ref)
        except ValueError:
            raise ValueError(f"{label} not found: {ref}") from None


def project_template_ref(doc: dict, kind: str) -> str:
    """The project's Image ("image") or Video ("video") template ref (built-in defaults for old projects)."""
    s = normalize_settings(doc.get("settings") if isinstance(doc.get("settings"), dict) else None)
    return s["video_template" if kind == "video" else "image_template"]


def project_template_graph(doc: dict, kind: str = "image") -> dict | None:
    """Workflow a new cut starts from. Image cuts: the linked Default template (an explicit pick wins), else the
    project's Image template. "video" (cut-list cuts, Image to Video): the project's Video template."""
    if kind != "video":
        ref = doc.get("template_ref")
        if isinstance(ref, str) and ref:
            graph = resolve_template_graph(ref)
            if graph is not None:
                return graph
        try:
            legacy = gg_template.get_template(doc.get("id") or "")
        except ValueError:
            legacy = None
        if legacy:
            return legacy
    return resolve_template_graph(project_template_ref(doc, kind))


def project_video_template(doc: dict) -> tuple[str, dict]:
    """(label, graph) of the project's Video template; ValueError when it cannot be read."""
    ref = project_template_ref(doc, "video")
    label = gg_template.template_label(ref)
    try:
        return label, gg_template.read_workflow_ref(ref)
    except ValueError:
        raise ValueError(f"Video template not found: {label}. Pick another one in Project Settings.") from None


def create_native_project(
    name: str,
    template_ref: str | None = None,
    settings: dict | None = None,
    location: str | None = None,
) -> dict:
    """With a location, the project folder <location>/<name> (only an `assets` subfolder) is created
    first and becomes settings.project_folder; a location already ending with the name is used as is.
    The first cut starts from the Default template when given, else from the Image template."""
    name = (name or "").strip()
    if not name:
        raise ValueError("name required")
    check_template_settings(settings)
    ref = (template_ref or "").strip() or None
    graph = resolve_template_graph(ref) if ref else None
    if graph is None:
        graph = resolve_template_graph(normalize_settings(settings)["image_template"])
    folder = None
    created: list[Path] = []
    if location is not None:
        folder = make_project_folder(location, name, created)
        settings = {**(settings or {}), "project_folder": str(folder)}
    store = native_store()
    try:
        doc = store.create_project(name, template_ref=ref, template_graph=graph, settings=settings)
    except Exception:
        for d in reversed(created):
            try:
                d.rmdir()
            except OSError:
                pass
        raise
    project_folder = (doc.get("settings") or {}).get("project_folder") or ""
    return {"ok": True, "project": {"id": doc["id"], "name": doc.get("name"), "native": True, "folder": project_folder}}


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


def _is_video_ver(v: dict) -> bool:
    return v.get("kind") == "video" or bool(v.get("animated"))


def native_export_timeline(pid: str) -> tuple[dict, Path] | None:
    """Timeline for MP4 export plus the output folder (`03_Edit` when present, else `edit`).
    Per cut, in timeline order: Best version, else the newest video, else the newest image (still for the clip length)."""
    store = native_store()
    doc = store.get_project(pid)
    tl = store.to_timeline(pid)
    if not doc or tl is None:
        return None
    tl = copy.deepcopy(tl)
    for c in tl["cuts"]:
        vers = [v for v in c.get("versions_list") or [] if not v.get("missing")]   # newest first
        best = next((v for v in vers if v["id"] == c.get("pick")), None) if c.get("pick") else None
        if best is None:
            best = next((v for v in vers if _is_video_ver(v)), None) or (vers[0] if vers else None)
        if best is None:
            c["media"] = None
            continue
        if c.get("media") and c["media"].get("id") == best["id"]:
            continue
        kind = "video" if _is_video_ver(best) else "image"
        dur = best.get("seconds") if kind == "video" else None
        c["in"], c["sec"] = clamp_clip(kind, 0.0, c.get("sec") or c.get("tl_sec") or 3.0, dur)
        c["media"] = {"id": best["id"], "kind": kind}
    folder = normalize_settings(doc.get("settings")).get("project_folder")
    base = Path(folder) if folder else store._project_dir(pid)
    return tl, project_mp4_export_dir(base)


def native_save_edit(pid: str, order, clips) -> dict | None:
    """Timeline edit (clip order, trims, start times, pick). Never reorders the Shots cut list."""
    store = native_store()
    tl = store.to_timeline(pid)
    if tl is None:
        return None
    by_id = {c["id"]: c for c in tl["cuts"]}
    clips = clips if isinstance(clips, dict) else {}
    out_clips: dict[str, dict] = {}
    for cid, c in by_id.items():
        e = clips.get(cid)
        if not isinstance(e, dict):
            continue
        clear = "pick" in e and e["pick"] is None
        pick = e.get("pick") if "pick" in e else c.get("pick")
        display = e.get("display") if "display" in e else c.get("display")
        valid = {v["id"]: v for v in c.get("versions_list") or []}
        if not (isinstance(pick, str) and pick in valid):
            pick = None
        if not (isinstance(display, str) and display in valid):
            display = None
        src_dur = c.get("src_dur")
        ref = display or pick
        if ref and ref in valid:
            ver = valid[ref]
            kind = None if ver.get("missing") else ver["kind"]
            if kind == "video":
                src_dur = ver.get("seconds")
        elif clear and c.get("pick"):
            newest = (c.get("versions_list") or [None])[0]
            kind = None if not newest or newest.get("missing") else newest["kind"]
            src_dur = newest.get("seconds") if kind == "video" else None
        else:
            kind = c["media"]["kind"] if c.get("media") else None
        i, sec = clamp_clip(kind, e.get("in", c["in"]), e.get("sec", c["sec"]), src_dur)
        out = {"in": i, "sec": sec, **({"pick": pick} if pick else {"pick": None} if clear else {})}
        if "display" in e:
            out["display"] = display
        if "start" in e:
            out["start"] = e["start"]
        out_clips[cid] = out
    if not isinstance(order, list):
        order = []
    order = [x for x in dict.fromkeys(order) if isinstance(x, str) and x in by_id]
    order += [cid for cid in tl.get("track_order") or by_id if cid not in order]
    store.apply_timeline_edit(pid, order, out_clips)
    return store.to_timeline(pid)


def native_reorder_cuts(pid: str, order) -> dict | None:
    """Shots cut list order (the timeline is not touched). Unknown ids are dropped, missing ones kept at the end."""
    store = native_store()
    tl = store.to_timeline(pid)
    if tl is None:
        return None
    ids = [c["id"] for c in tl["cuts"]]
    order = order if isinstance(order, list) else []
    order = [x for x in dict.fromkeys(order) if isinstance(x, str) and x in ids]
    order += [cid for cid in ids if cid not in order]
    store.reorder(pid, order)
    return store.to_timeline(pid)


def native_reset_timeline(pid: str) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    store.reset_timeline(pid)
    return store.to_timeline(pid)


def native_apply_track_order(pid: str) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    store.apply_track_order_to_cuts(pid)
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
    graph = project_template_graph(doc, "image")
    scene_id = group_id if isinstance(group_id, str) and group_id else None
    before = store.get_project(pid)
    before_ids = set()
    if before:
        for cid, c in (before.get("cuts") or {}).items():
            if isinstance(c, dict) and not c.get("deleted_at"):
                before_ids.add(cid)
    doc = store.add_cut(pid, scene_id=scene_id, after=after, template_graph=graph)
    new_id = None
    for cid, c in (doc.get("cuts") or {}).items():
        if cid not in before_ids and isinstance(c, dict) and not c.get("deleted_at"):
            new_id = cid
            break
    cut_entry = (doc.get("cuts") or {}).get(new_id) if new_id else None
    tl = store.to_timeline(pid)
    return {
        "ok": True,
        "cut": {"id": new_id, "name": cut_entry.get("name")} if cut_entry else None,
        "template_copied": graph is not None,
        "timeline": tl,
    }


def native_add_cut_list(pid: str, cuts, workflow: str | None = None, after: str | None = None) -> dict:
    """AI Cut Split / AI Make Cut: one cut per entry, each with a copy of the project's Image template with the
    description in its prompt node. `workflow` is ignored (every cut starts as an image cut)."""
    try:
        from . import gg_ltx
    except ImportError:
        import gg_ltx  # type: ignore
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        raise ValueError("project not found")
    rows = gg_ltx.validate_cut_list(cuts)
    base = project_template_graph(doc, "image")
    if not isinstance(base, dict):
        raise ValueError("Image template not found. Pick another one in Project Settings.")
    entries = []
    try:
        for r in rows:
            g = copy.deepcopy(base)
            gg_wfnodes.set_prompt(g, r["prompt"])
            entries.append({**r, "graph": g})
    except gg_wfnodes.NodeNotFound as ex:
        raise ValueError(f"Image template: {ex}") from None
    _doc, ids = store.add_cuts(pid, entries, after=after if isinstance(after, str) and after else None)
    return {"ok": True, "cut_ids": ids, "timeline": store.to_timeline(pid)}


def native_import_structure(pid: str, payload: dict) -> dict:
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        raise ValueError("project not found")
    graph = project_template_graph(doc, "image")
    store.import_structure(
        pid,
        payload.get("scenes"),
        payload.get("loose"),
        payload.get("references"),
        template_graph=graph or None,
    )
    return {"ok": True, "timeline": store.to_timeline(pid)}


def native_add_reference(pid: str, name: str, category: str) -> dict | None:
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        return None
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        raise ValueError("name must be 1-80 characters")
    graph = project_template_graph(doc, "image")
    c = store.add_reference(pid, name, category, template_graph=graph or None)
    return {"ok": True, "reference": {"id": c["id"], "name": c["name"], "category": c["category"]}, "timeline": store.to_timeline(pid)}


def native_rename_cut(pid: str, cut_id: str, name: str) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    if not isinstance(cut_id, str) or not cut_id:
        raise ValueError("cut_id required")
    if not isinstance(name, str):
        raise ValueError("name must be a string")
    name = name.strip()
    if not name or len(name) > 80:
        raise ValueError("name must be 1-80 characters")
    store.rename_cut(pid, cut_id, name)
    return {"ok": True, "timeline": store.to_timeline(pid)}

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


def native_list_trash(pid: str) -> list | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    return store.list_deleted_cuts(pid)


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
    check_template_settings(fields.get("settings"))
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
        path_ok = gg_template.workflow_ref_exists(ref)
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


def native_cut_source_workflow(pid: str, cut_id: str, kind: str | None = None) -> dict:
    try:
        from .gg_project.cut_source import normalize_media_kind, resolve_native_cut_source
    except ImportError:  # unittest / plain script
        from gg_project.cut_source import normalize_media_kind, resolve_native_cut_source  # type: ignore

    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        raise ValueError("project not found")
    cuts = doc.get("cuts") or {}
    cut = cuts.get(cut_id) if isinstance(cuts, dict) else None
    if not cut or cut.get("deleted_at"):
        raise ValueError("cut not found")
    req = normalize_media_kind(kind)
    versions = store.list_versions(pid, cut_id)

    def get_workflow(sha: str | None) -> dict | None:
        return _workflow_from_sha(store, pid, sha)

    if req == "video" and not any((v.get("asset") or {}).get("kind") == "video" for v in versions):
        wf = _video_tab_workflow(pid, cut_id, doc, cut)
        if wf is not None:
            return {"ok": True, "source": "template", "workflow": wf,
                    "kind": "ui" if gg_template._is_ui_workflow(wf) else "api", "kind_used": "video", "fallback": None}
    tpl = native_template_info(pid).get("workflow")
    return resolve_native_cut_source(
        cut,
        versions,
        get_workflow,
        tpl if isinstance(tpl, dict) else None,
        requested_kind=req,
        is_ui_workflow=gg_template._is_ui_workflow,
    )


def _video_tab_workflow(pid: str, cut_id: str, doc: dict, cut: dict) -> dict | None:
    """Video tab of a cut without video versions: a copy of the project's Video template with the cut's
    description in its prompt node and its Best / selected image in the Start Image (Load Image) node."""
    try:
        _label, graph = project_video_template(doc)
    except ValueError:
        return None
    g = copy.deepcopy(graph)
    prompt = cut_video_prompt_text(cut)
    if prompt:
        try:
            gg_wfnodes.set_prompt(g, prompt)
        except gg_wfnodes.NodeNotFound:
            pass
    try:
        ver, path = pick_start_version(pid, cut_id)
        image = stage_start_image(path, ver["id"])
        if gg_wfnodes.is_ui(g):
            _nid, node = gg_wfnodes.find_start_image_node(g)
            wv = node.get("widgets_values")
            if isinstance(wv, list) and wv:
                wv[0] = image
            else:
                node["widgets_values"] = [image, "image"]
        else:
            gg_wfnodes.set_start_image(g, image)
    except (ValueError, OSError, ImportError):
        pass
    return g


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


class NativeWorkflowError(ValueError):
    """No API-format workflow for an SDK run; `code` is "empty" or "ui_only"."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


UI_ONLY_MESSAGE = ("This cut's workflow is saved only in UI (graph) format and cannot be converted outside the "
                   "canvas. Open the cut once (its shot tab), then try again.")


def native_cut_api_workflow(pid: str, cut_id: str, canvas: dict | None = None, convert: bool = False) -> dict:
    """The cut's current saved workflow in API format for an SDK run: {"workflow", "source"}.

    Order: the current version's API prompt embedded in its PNG, the stored cut/version workflow when it is
    API format, the ComfyUI history prompt of the current version's run, then `canvas` (the API prompt of
    that cut's open shot tab, sent by the browser only after a "ui_only" answer), then with `convert` the
    stored UI workflow converted on the server (no tab needed; plain graphs only)."""
    try:
        from . import gg_sdk
        from .gg_project.cut_source import current_version_id
    except ImportError:
        import gg_sdk  # type: ignore
        from gg_project.cut_source import current_version_id  # type: ignore

    src = native_cut_source_workflow(pid, cut_id)
    store = native_store()
    cut = store.get_project(pid)["cuts"][cut_id]
    versions = store.list_versions(pid, cut_id)
    cur_id = current_version_id(cut, versions)
    cur = next((v for v in versions if v.get("id") == cur_id), None)
    if cur_id:
        path = native_media_path(cur_id)
        if path is not None and path.suffix.lower() == ".png":
            api = gg_wfstore.extract_png_meta(path).get("prompt")
            if isinstance(api, dict) and gg_template._is_api_workflow(api):
                return {"workflow": api, "source": "embedded"}
    wf = src.get("workflow")
    if isinstance(wf, dict) and gg_template._is_api_workflow(wf):
        return {"workflow": wf, "source": src.get("source") or "stored"}
    run = cur.get("run") if cur and isinstance(cur.get("run"), dict) else {}
    if isinstance(run.get("prompt_id"), str):
        api = gg_sdk.history_prompt(run["prompt_id"])
        if api and gg_template._is_api_workflow(api):
            return {"workflow": api, "source": "history"}
    if canvas is not None:
        if not isinstance(canvas, dict) or not gg_template._is_api_workflow(canvas):
            raise ValueError("canvas workflow must be an API-format prompt")
        return {"workflow": canvas, "source": "canvas"}
    source = src.get("source") or "stored"
    if not wf:
        wf, source = project_template_graph(store.get_project(pid), "image"), "template"
        if not wf:
            raise NativeWorkflowError("empty", "This cut has no workflow yet. Not queued.")
    if not versions:
        try:
            from . import gg_ltx
        except ImportError:
            import gg_ltx  # type: ignore
        ltx = isinstance(wf, dict) and gg_ltx.workflow_has_ltx_length(wf)
        wf = _apply_cut_prompt_to_workflow(wf, cut, require=True, video=ltx)
    if isinstance(wf, dict) and gg_template._is_api_workflow(wf):
        return {"workflow": wf, "source": source}
    if convert and isinstance(wf, dict) and gg_template._is_ui_workflow(wf):
        try:
            return {"workflow": _ui_to_api(wf), "source": "template" if source == "template" else "converted"}
        except ValueError as ex:
            raise NativeWorkflowError("ui_only", f"{UI_ONLY_MESSAGE} ({ex})") from None
    raise NativeWorkflowError("ui_only", UI_ONLY_MESSAGE)


def _ui_to_api(graph: dict) -> dict:
    try:
        from . import gg_wfconvert
    except ImportError:
        import gg_wfconvert  # type: ignore
    return gg_wfconvert.ui_to_api(graph)


WRITE_PROMPT_FIRST = "Write a prompt for this cut first."


def cut_info_text(cut: dict) -> str:
    """Title + Info notes for generation when Prompt is empty."""
    parts: list[str] = []
    name = cut.get("name")
    if isinstance(name, str):
        n = " ".join(name.split()).strip()
        if n and n != NEW_CUT_NAME:
            parts.append(n)
    notes = cut.get("notes")
    if isinstance(notes, str):
        t = " ".join(notes.split()).strip()
        if t:
            parts.append(t)
    if not parts:
        return ""
    return parts[0] if len(parts) == 1 else f"{parts[0]}. {parts[1]}"


def cut_prompt_text(cut: dict) -> str:
    """Workflow prompt text: cut Prompt field, else title + Info notes."""
    v = cut.get("prompt")
    if isinstance(v, str) and v.strip():
        return " ".join(v.split())
    return cut_info_text(cut)


def cut_caption_text(cut: dict) -> str:
    """Normalized Caption field (timeline subtitles / dialogue)."""
    v = cut.get("caption")
    if isinstance(v, str) and v.strip():
        return " ".join(v.split())
    return ""


def cut_video_prompt_text(cut: dict) -> str:
    """Video/LTX injected prompt: Prompt (or Info fallback) plus Dialogue caption when set."""
    base = cut_prompt_text(cut)
    if not base:
        return ""
    cap = cut_caption_text(cut)
    if not cap:
        return base
    return f"{base} Dialogue: {cap}"


def cut_generation_seconds(doc: dict, cut_id: str) -> float:
    """Effective seconds for LTX generation: timeline trim, else cut sec, else planned_sec."""
    try:
        from . import gg_ltx
    except ImportError:
        import gg_ltx  # type: ignore
    cuts = doc.get("cuts") if isinstance(doc, dict) else None
    cut = cuts.get(cut_id) if isinstance(cuts, dict) else None
    if not isinstance(cut, dict):
        return gg_ltx.DURATION_MAX
    tl = doc.get("timeline")
    if isinstance(tl, dict) and isinstance(tl.get("clips"), dict):
        entry = tl["clips"].get(cut_id)
        if isinstance(entry, dict) and isinstance(entry.get("sec"), (int, float)):
            return round(float(entry["sec"]), 2)
    sec = cut.get("sec")
    if isinstance(sec, (int, float)):
        return round(float(sec), 2)
    planned = cut.get("planned_sec")
    if isinstance(planned, (int, float)):
        return round(float(planned), 2)
    return gg_ltx.DURATION_MAX


def _apply_cut_prompt_to_workflow(graph: dict, cut: dict, *, require: bool, video: bool = False) -> dict:
    """Set the cut's Prompt (or Info fallback) on the workflow prompt node; video adds Dialogue caption."""
    text = cut_video_prompt_text(cut) if video else cut_prompt_text(cut)
    if not text:
        if require:
            raise ValueError(WRITE_PROMPT_FIRST)
        return graph
    g = copy.deepcopy(graph)
    try:
        gg_wfnodes.set_prompt(g, text)
    except gg_wfnodes.NodeNotFound as ex:
        if require:
            raise ValueError(f"Image template: {ex}") from ex
    return g


# ---- start image: a still image version of the cut copied into ComfyUI's input folder ----
_STILL_EXT = {".png", ".jpg", ".jpeg", ".webp"}
INPUT_SUBFOLDER = "gonggan"
NO_START_IMAGE = ("This cut has no still image version to start from (videos and animated images are skipped). "
                  "Generate or import an image first.")
NOT_START_IMAGE = "The selected version is not a still image (or its file is missing). Select an image version."


def is_still_image(path: Path | None) -> bool:
    return (path is not None and path.is_file() and path.suffix.lower() in _STILL_EXT
            and animation_info(path) is None)


def is_still_version(ver: dict | None, path: Path | None) -> bool:
    asset = ver.get("asset") if isinstance(ver, dict) else None
    return (isinstance(asset, dict) and asset.get("kind") != "video" and not asset.get("animated")
            and is_still_image(path))


def pick_start_version(pid: str, cut_id: str, selected_vid: str | None = None,
                       start_vid: str | None = None) -> tuple[dict, Path]:
    """The version a video starts from: Best, else `selected_vid` (the one open in the version row), else the
    newest — the first of these that is a still image whose file exists (video and animated image versions
    are skipped). `start_vid` (version row Make Video): exactly that version, which must be such an image.
    ValueError when there is none."""
    store = native_store()
    doc = store.get_project(pid)
    cut = (doc.get("cuts") or {}).get(cut_id) if doc else None
    if not cut or cut.get("deleted_at"):
        raise ValueError("cut not found")
    versions = store.list_versions(pid, cut_id)
    by_id = {v.get("id"): v for v in versions}
    if start_vid:
        ver = by_id.get(start_vid)
        path = store.version_file(pid, ver) if ver else None
        if not ver:
            raise ValueError("The selected version is not in this cut.")
        if not is_still_version(ver, path):
            raise ValueError(NOT_START_IMAGE)
        return ver, path
    order = [cut.get("pick_version_id"), selected_vid, *by_id]
    for vid in dict.fromkeys(x for x in order if isinstance(x, str) and x):
        ver = by_id.get(vid)
        path = store.version_file(pid, ver) if ver else None
        if ver and is_still_version(ver, path):
            return ver, path
    raise ValueError(NO_START_IMAGE)


def _comfy_input_dir() -> Path:
    import folder_paths

    return Path(folder_paths.get_input_directory())


def stage_start_image(src: Path, vid: str) -> str:
    """Copy a version image to ComfyUI's input/gonggan/start_<version id>.<ext> (once per version, the version
    file is never changed) and return the Load Image name for it."""
    folder = _comfy_input_dir() / INPUT_SUBFOLDER
    name = f"start_{vid}{src.suffix.lower()}"
    dest = folder / name
    if not (dest.is_file() and dest.stat().st_size == src.stat().st_size):
        import shutil

        folder.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(f"{name}.tmp")
        shutil.copy2(src, tmp)
        tmp.replace(dest)
    return f"{INPUT_SUBFOLDER}/{name}"


def fill_titled_start_image(pid: str, cut_id: str, api: dict) -> str | None:
    """Generate All: a node titled "Start Image" gets the cut's Best / newest still image. Returns the version id,
    or None when there is no such node or no image (the workflow then runs as saved)."""
    try:
        gg_wfnodes.find_start_image_node(api, titled_only=True)
    except gg_wfnodes.NodeNotFound as ex:
        if str(ex) == gg_wfnodes.START_IMAGE_MISSING:
            return None
        raise
    try:
        ver, path = pick_start_version(pid, cut_id)
    except ValueError:
        return None
    gg_wfnodes.set_start_image(api, stage_start_image(path, ver["id"]), titled_only=True)
    return ver["id"]


def _version_prompt(pid: str, ver: dict, path: Path) -> str:
    """Prompt text of the workflow that made a version (its PNG prompt, else its stored workflow)."""
    wfs = []
    if path.suffix.lower() == ".png":
        wfs.append(gg_wfstore.extract_png_meta(path).get("prompt"))
    wfs.append(_workflow_from_sha(native_store(), pid, ver.get("workflow_sha")))
    for wf in wfs:
        if isinstance(wf, dict):
            text = gg_wfnodes.prompt_text(wf).strip()
            if text:
                return text
    return ""


def native_image_to_video_workflow(pid: str, cut_id: str, selected_vid: str | None = None,
                                   start_vid: str | None = None) -> dict:
    """API prompt of the project's Video template for Image to Video: the start image node gets the cut's Best
    (else selected / newest) still image — or exactly `start_vid` (Make Video) — the prompt node the cut's
    description, the LTX length its duration. Nothing is queued. ValueError with a user-facing message when
    something is missing."""
    try:
        from . import gg_ltx
    except ImportError:
        import gg_ltx  # type: ignore
    store = native_store()
    doc = store.get_project(pid)
    if not doc or doc.get("deleted_at"):
        raise ValueError("project not found")
    cut = (doc.get("cuts") or {}).get(cut_id)
    if not cut or cut.get("deleted_at"):
        raise ValueError("cut not found")
    label, graph = project_video_template(doc)
    if gg_template._is_ui_workflow(graph):
        try:
            graph = _ui_to_api(graph)
        except ValueError as ex:
            raise ValueError(f"Video template {label} cannot run without its tab: {ex}") from None
    gg_wfnodes.find_start_image_node(graph)
    ver, path = pick_start_version(pid, cut_id, selected_vid, start_vid)
    prompt = cut_video_prompt_text(cut) or _version_prompt(pid, ver, path)
    if not prompt:
        raise ValueError("This cut has no description. Add a caption first.")
    sec = cut_generation_seconds(doc, cut_id)
    err = gg_ltx.check_ltx_generation_duration(graph, sec)
    if err:
        raise ValueError(err)
    wf = gg_ltx.inject_ltx(graph, prompt, float(sec))
    wf = gg_ltx.patch_ltx_duration(wf, float(sec))
    image = stage_start_image(path, ver["id"])
    node = gg_wfnodes.set_start_image(wf, image)
    return {"workflow": wf, "template": label, "start_version": ver["id"], "start_node": node, "image": image,
            "prompt": prompt, "frames": gg_ltx.frames_for_duration(float(sec), gg_ltx.workflow_fps(wf))}


def _skip_native_media_lookup(media_id: str) -> bool:
    """Legacy imported job/version ids are never native version UUIDs."""
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

    info = gg_sdk.last_output_info()
    lo = info["output"]
    if not lo:
        return {"ok": False, "message": info["reason"]}
    return {"ok": True, "version": _add_output_version(pid, cut_id, lo), "output": lo}


def _add_output_version(pid: str, cut_id: str, lo: dict) -> dict:
    path = Path(lo["path"])
    meta = gg_wfstore.extract_png_meta(path) if path.suffix.lower() == ".png" else {}
    ui = meta.get("workflow") if isinstance(meta.get("workflow"), dict) else None
    api = meta.get("prompt") if isinstance(meta.get("prompt"), dict) else None
    workflow = ui or api
    return native_store().add_version(
        pid,
        cut_id,
        path,
        workflow=workflow,
        prompt_id=lo.get("prompt_id") if isinstance(lo.get("prompt_id"), str) else None,
        animated=lo.get("animated") is True,
    )


def native_import_version(pid: str, cut_id: str, src: Path | str) -> dict:
    """A picked image/video file becomes a new version of the cut. The file is copied (never moved)
    into the project's assets under a new version id name; `src` itself is only read."""
    src = Path(src)
    if src.suffix.lower() not in _MEDIA_KIND:
        raise ValueError(f"Unsupported file type: {src.suffix or '(none)'}")
    doc = native_store().get_project(pid)
    if not doc or doc.get("deleted_at"):
        raise ValueError("project not found")
    cut = (doc.get("cuts") or {}).get(cut_id)
    if not cut or cut.get("deleted_at"):
        raise ValueError("cut not found")
    return {"ok": True, "version": _add_output_version(pid, cut_id, {"path": str(src)})}


_CAPTURE_LOCK = threading.Lock()


def native_capture_prompt_output(
    pid: str, cut_id: str, prompt_id: str, wait_sec: float = 5.0, poll_sec: float = 0.25
) -> dict:
    """A finished run queued from a cut becomes a version of that cut (once per prompt id).

    ComfyUI sends `execution_success` before the run is stored in /history, so a missing entry is
    polled for up to `wait_sec`."""
    try:
        from . import gg_sdk
    except ImportError:
        import gg_sdk  # type: ignore

    if not isinstance(prompt_id, str) or not prompt_id.strip() or len(prompt_id) > 200:
        raise ValueError("prompt_id required")
    store = native_store()
    doc = store.get_project(pid)
    if not doc or doc.get("deleted_at"):
        raise ValueError("project not found")
    cut = (doc.get("cuts") or {}).get(cut_id)
    if not cut or cut.get("deleted_at"):
        raise ValueError("cut not found")
    deadline = time.monotonic() + max(0.0, wait_sec)
    while True:
        info = gg_sdk.prompt_output_info(prompt_id)
        if not info.get("pending") or time.monotonic() >= deadline:
            break
        time.sleep(poll_sec)
    lo = info["output"]
    if not lo:
        return {"ok": False, "message": info["reason"]}
    with _CAPTURE_LOCK:
        for ver in store.list_versions(pid, cut_id):
            run = ver.get("run") if isinstance(ver.get("run"), dict) else {}
            if run.get("prompt_id") == prompt_id:
                return {"ok": True, "version": ver, "output": lo, "duplicate": True}
        return {"ok": True, "version": _add_output_version(pid, cut_id, lo), "output": lo, "duplicate": False}
