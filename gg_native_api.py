"""Native project HTTP helpers (testable without aiohttp)."""
from __future__ import annotations

import copy
import logging
import threading
import time
from pathlib import Path
from typing import Any

log = logging.getLogger("gonggan-cut")

try:
    from .gg_data import PACK_DIR, clamp_clip
    from .gg_project import LocalStore
    from .gg_project.local_store import NEW_CUT_NAME
    from .gg_project.timeline import timeline_order
    from .gg_project.ids import is_uuid_id
    from .gg_project.project_settings import (
        DEFAULT_IMAGE_TEMPLATE,
        TEMPLATE_SETTING_KEYS,
        comfyui_output_directory,
        make_project_folder,
        make_unique_project_folder,
        normalize_settings,
        project_folder_path,
        resolve_video_template,
        mp4_export_dir_for_project,
        check_export_output_folder,
    )
    from .gg_project.hidden_projects import HIDDEN_FILE_NAME, filter_hidden, load_hidden_ids
    from .gg_project.media_anim import animation_info
except ImportError:  # unittest / plain script
    from gg_data import PACK_DIR, clamp_clip  # type: ignore
    from gg_project import LocalStore  # type: ignore
    from gg_project.local_store import NEW_CUT_NAME  # type: ignore
    from gg_project.timeline import timeline_order  # type: ignore
    from gg_project.ids import is_uuid_id  # type: ignore
    from gg_project.project_settings import (  # type: ignore
        DEFAULT_IMAGE_TEMPLATE,
        TEMPLATE_SETTING_KEYS,
        comfyui_output_directory,
        make_project_folder,
        make_unique_project_folder,
        normalize_settings,
        project_folder_path,
        resolve_video_template,
        mp4_export_dir_for_project,
        check_export_output_folder,
    )
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


def _history():
    try:
        from .gg_project import history as history_mod
    except ImportError:
        from gg_project import history as history_mod  # type: ignore
    return history_mod


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


def clear_cut_linear_mode(graph: dict) -> dict:
    """A cut copy opens in the graph editor.

    ComfyUI treats extra.linearMode true as App mode and false as the graph editor.
    linearData stays so prompt binding and output filtering still work.
    This only changes the object it is given. It does not write a template file.
    """
    if not isinstance(graph, dict):
        return graph
    extra = graph.get("extra")
    if isinstance(extra, dict) and extra.get("linearMode") is True:
        extra["linearMode"] = False
    return graph


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
    if isinstance(settings, dict) and "export_folder" in settings:
        ef = settings.get("export_folder")
        if ef:
            res = check_export_output_folder(ef)
            if not res.get("ok"):
                raise ValueError(res.get("message") or "Invalid export folder")
    for key in TEMPLATE_SETTING_KEYS:
        ref = (settings or {}).get(key) if isinstance(settings, dict) else None
        if ref is None or (isinstance(ref, str) and not ref.strip()):
            continue
        label = _TEMPLATE_SETTING_LABELS[key]
        if not isinstance(ref, str):
            raise ValueError(f"{label} must be a string")
        if key == "video_template":
            ref = resolve_video_template(ref, provided=True)
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
        explicit = project_template_ref(doc, "image")
        if explicit and explicit != DEFAULT_IMAGE_TEMPLATE:  # 0.9.135: the Image template field wins
            graph = resolve_template_graph(explicit)
            if graph is not None:
                return graph
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


def copy_new_cut_template(doc: dict, kind: str = "image") -> dict | None:
    """One owned copy of the Image or Video template chosen in options.

    The cut stores this graph itself. Later edits to the template file do not
    touch the copy. None when nothing is chosen or the file cannot be read
    (a warning is logged; the cut then starts empty).
    """
    kind_name = "video" if kind == "video" else "image"
    ref = project_template_ref(doc, kind_name)
    if not isinstance(ref, str) or not ref.strip():
        log.warning("[gonggan-cut] new %s cut: no template chosen; starting empty", kind_name)
        return None
    try:
        graph = project_template_graph(doc, kind_name)
    except ValueError as ex:
        log.warning(
            "[gonggan-cut] new %s cut: could not load template %s (%s); starting empty",
            kind_name, ref, ex,
        )
        return None
    if not isinstance(graph, dict) or not graph:
        log.warning(
            "[gonggan-cut] new %s cut: could not load template %s; starting empty",
            kind_name, ref,
        )
        return None
    copied = copy.deepcopy(graph)
    _stamp_new_cut_generation_size(copied, doc, kind_name, ref)
    return clear_cut_linear_mode(copied)


def _stamp_new_cut_generation_size(graph: dict, doc: dict, kind_name: str, ref: str) -> None:
    """Write this project's generation width and height into a new cut's template copy.

    Existing cuts are not opened. The template file on disk is not written.
    """
    try:
        import gg_workflow_size as gws
    except ImportError:
        from . import gg_workflow_size as gws  # type: ignore
    settings = normalize_settings(doc.get("settings") if isinstance(doc, dict) else None)
    width, height = int(settings["width"]), int(settings["height"])
    app = gws.template_is_app(ref, graph)
    written = gws.apply_new_cut_generation_size(graph, width, height, app=app)
    if not written:
        log.warning(
            "[gonggan-cut] new %s cut: generation size %sx%s not written; no matching nodes in %s",
            kind_name, width, height, ref,
        )
        return
    parts = []
    for node in written:
        where = f" subgraph {node['graph']}" if node.get("graph") else ""
        dims = []
        if node.get("width") is not None:
            dims.append(f"width {node['width']}")
        if node.get("height") is not None:
            dims.append(f"height {node['height']}")
        parts.append(f"node {node['id']} ({node['type']}){where} {', '.join(dims)} via {node['via']}")
    log.info(
        "[gonggan-cut] new %s cut: generation size %sx%s set on %s",
        kind_name, width, height, "; ".join(parts),
    )


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
    first_kind: str | None = None,
) -> dict:
    """Creates the project folder under the chosen location (or ComfyUI's output directory when omitted),
    sets settings.project_folder, and adds only an `assets` subfolder. Name collisions get ' (2)', ' (3)', …
    The first cut gets one copy of the Image template chosen in options, or the Video template when
    `first_kind` is "video". If that template is missing, the cut starts empty."""
    name = (name or "").strip()
    if not name:
        raise ValueError("name required")
    check_template_settings(settings)
    ref = (template_ref or "").strip() or None
    created: list[Path] = []
    explicit = location is not None and bool(str(location).strip())
    loc = str(location).strip() if explicit else str(comfyui_output_directory())
    loc_path = Path(loc).expanduser()
    if explicit and project_folder_path(loc_path, name) == loc_path:
        folder = make_project_folder(loc, name, created)
    else:
        folder = make_unique_project_folder(loc, name, created)
    settings = {**(settings or {}), "project_folder": str(folder)}
    store = native_store()
    first_kind_name = "video" if first_kind == "video" else "image"
    first_graph = copy_new_cut_template({"settings": normalize_settings(settings)}, first_kind_name)
    try:
        doc = store.create_project(name, template_ref=ref, template_graph=first_graph, settings=settings)
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


def native_export_output_path(pid: str) -> dict | None:
    store = native_store()
    doc = store.get_project(pid)
    got = native_export_timeline(pid)
    if not doc or got is None:
        return None
    settings = normalize_settings(doc.get("settings"))
    effective = got[1].resolve()
    return {
        "ok": True,
        "export_folder": settings.get("export_folder") or "",
        "effective_path": str(effective),
        "comfy_output": str(comfyui_output_directory()),
    }


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
    out_dir = mp4_export_dir_for_project(doc.get("settings"), base)
    return tl, out_dir


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
        # Timeline length follows Best when the cut has one. The shown take (display)
        # only sizes the clip when Best is unset. The media id on the payload stays
        # the shown take (current_version); the timeline UI reads Best itself.
        ref = pick or display
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


def native_add_cut(
    pid: str,
    group_id: str | None,
    after: str | None,
    copy_template: bool = True,
    kind: str | None = None,
) -> dict:
    """Add one cut. Image cuts copy the options Image template once. A video cut (`kind` "video")
    copies the options Video template once, with the same generation width and height.
    `copy_template` false (file import) copies neither."""
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        raise ValueError("project not found")
    scene_id = group_id if isinstance(group_id, str) and group_id else None
    before = store.get_project(pid)
    before_ids = set()
    if before:
        for cid, c in (before.get("cuts") or {}).items():
            if isinstance(c, dict) and not c.get("deleted_at"):
                before_ids.add(cid)
    template_kind = "video" if kind == "video" else "image"
    graph = copy_new_cut_template(doc, template_kind) if copy_template else None
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


def _is_pristine_seed_cut(store: LocalStore, pid: str, cut_id: str, cut: dict) -> bool:
    if cut.get("name") != NEW_CUT_NAME:
        return False
    if store.list_versions(pid, cut_id):
        return False
    for key in ("prompt", "caption", "notes"):
        if str(cut.get(key) or "").strip():
            return False
    if cut.get("end_card") or cut.get("needs_redo"):
        return False
    return True


def _remove_pristine_seed_cuts(store: LocalStore, pid: str, keep_cut_id: str | None = None) -> None:
    doc = store.get_project(pid)
    if not doc:
        return
    drop = [
        cid for cid, c in (doc.get("cuts") or {}).items()
        if isinstance(c, dict) and not c.get("deleted_at") and cid != keep_cut_id
        and _is_pristine_seed_cut(store, pid, cid, c)
    ]
    if drop:
        store.delete_cuts(pid, drop)


def _assign_scene_groups(store: LocalStore, pid: str, pairs: list[tuple[str, str]]) -> None:
    if not pairs:
        return
    tl = store.to_timeline(pid) or {}
    groups = [dict(g) for g in tl.get("groups") or []]
    for g in groups:
        g["cut_ids"] = list(g.get("cut_ids") or [])
    by_name = {str(g.get("name") or "").strip().lower(): g for g in groups}
    for cut_id, scene_name in pairs:
        sn = str(scene_name or "").strip()
        if not sn:
            continue
        key = sn.lower()
        g = by_name.get(key)
        if not g:
            g = {"id": f"s{int(time.time() * 1000)}{len(groups)}", "name": sn, "cut_ids": [], "collapsed": False}
            groups.append(g)
            by_name[key] = g
        for og in groups:
            og["cut_ids"] = [x for x in og.get("cut_ids") or [] if x != cut_id]
        if cut_id not in g["cut_ids"]:
            g["cut_ids"].append(cut_id)
    store.sync_scene_groups(pid, groups)


def native_add_cut_list(
    pid: str,
    cuts,
    workflow: str | None = None,
    after: str | None = None,
    kind: str | None = None,
) -> dict:
    """AI Cut Split / AI Make Cut: one cut per entry, each with one copy of the options template and the
    description in its prompt node. Image cuts use the Image template. `kind` "video" uses the Video
    template the same way. `workflow` is ignored."""
    try:
        from . import gg_ltx
    except ImportError:
        import gg_ltx  # type: ignore
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        raise ValueError("project not found")
    rows = gg_ltx.validate_cut_list(cuts)
    template_kind = "video" if kind == "video" else "image"
    template_label = "Video template" if template_kind == "video" else "Image template"
    base = copy_new_cut_template(doc, template_kind)
    entries = []
    if base is None:
        for r in rows:
            entries.append({**r, "graph": None})
    else:
        try:
            for r in rows:
                g = copy.deepcopy(base)
                gg_wfnodes.set_prompt(g, r["prompt"])
                entries.append({**r, "graph": g})
        except gg_wfnodes.NodeNotFound as ex:
            raise ValueError(f"{template_label}: {ex}") from None
    _remove_pristine_seed_cuts(store, pid, None)
    _doc, ids = store.add_cuts(pid, entries, after=after if isinstance(after, str) and after else None)
    scene_pairs = [
        (cid, entries[i].get("scene"))
        for i, cid in enumerate(ids)
        if i < len(entries) and isinstance(entries[i].get("scene"), str) and entries[i].get("scene")
    ]
    _assign_scene_groups(store, pid, scene_pairs)
    return {"ok": True, "cut_ids": ids, "timeline": store.to_timeline(pid)}


def native_import_structure(pid: str, payload: dict) -> dict:
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        raise ValueError("project not found")
    structure_kind = payload.get("kind") if isinstance(payload, dict) else None
    graph = copy_new_cut_template(doc, "video" if structure_kind == "video" else "image")
    store.import_structure(
        pid,
        payload.get("scenes"),
        payload.get("loose"),
        payload.get("references"),
        template_graph=graph or None,
    )
    return {"ok": True, "timeline": store.to_timeline(pid)}


def native_save_reference_groups(pid: str, groups) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    if not isinstance(groups, list):
        raise ValueError("groups must be a list")
    store.sync_reference_groups(pid, groups)
    return store.to_timeline(pid)


def native_add_reference(pid: str, name: str, category: str, after: str | None = None) -> dict | None:
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        return None
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        raise ValueError("name must be 1-80 characters")
    graph = project_template_graph(doc, "image")
    if isinstance(graph, dict):
        graph = clear_cut_linear_mode(copy.deepcopy(graph))
    placed = after if isinstance(after, str) and after else None
    c = store.add_reference(pid, name, category, template_graph=graph or None, after=placed)
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

def native_delete_cuts(pid: str, cut_ids: list, history_step: str | None = None) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    store.delete_cuts(pid, cut_ids)
    if history_step:
        _history().native_stash_history_files(store._project_dir(pid), history_step, "cuts", cut_ids=cut_ids)
    return {"ok": True, "timeline": store.to_timeline(pid)}


def native_restore_cuts(pid: str, cut_ids: list | None, history_step: str | None = None) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    if history_step:
        _history().native_restore_history_files(store._project_dir(pid), history_step)
    store.restore_cuts(pid, cut_ids)
    return {"ok": True, "timeline": store.to_timeline(pid)}


def native_list_trash(pid: str) -> list | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    return store.list_deleted_cuts(pid)


def native_history_get(pid: str) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    return _history().load_native_history(store, pid)


def native_history_put(pid: str, payload: dict) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    return _history().save_native_history(store, pid, payload)


def native_delete_version(pid: str, cut_id: str, version_id: str, history_step: str) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    _history().native_stash_history_files(store._project_dir(pid), history_step, "version", cut_id=cut_id, version_id=version_id)
    return {"ok": True, "timeline": store.to_timeline(pid)}


def native_restore_version(pid: str, cut_id: str, version_id: str, history_step: str) -> dict | None:
    store = native_store()
    if store.get_project(pid) is None:
        return None
    del cut_id, version_id
    _history().native_restore_history_files(store._project_dir(pid), history_step)
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


def native_set_cut_workflow(pid: str, cut_id: str, workflow: dict) -> dict:
    """Save the full graph as this cut's current workflow. Does not touch templates or other cuts."""
    store = native_store()
    if store.get_project(pid) is None:
        raise ValueError("project not found")
    if not isinstance(workflow, dict):
        raise ValueError("workflow must be an object")
    clear_cut_linear_mode(workflow)
    store.set_cut_workflow(pid, cut_id, workflow)
    return {"ok": True}


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


def native_cut_source_workflow(pid: str, cut_id: str, kind: str | None = None, by_kind: bool = True) -> dict:
    """The cut's own saved graph. Templates and other cuts' graphs are not substituted."""
    del kind, by_kind
    store = native_store()
    doc = store.get_project(pid)
    if not doc:
        raise ValueError("project not found")
    cuts = doc.get("cuts") or {}
    cut = cuts.get(cut_id) if isinstance(cuts, dict) else None
    if not cut or cut.get("deleted_at"):
        raise ValueError("cut not found")
    wf = _workflow_from_sha(store, pid, cut.get("workflow_sha"))
    if isinstance(wf, dict) and wf:
        kind_name = "ui" if gg_template._is_ui_workflow(wf) else "api"
        return {"ok": True, "source": "stored", "workflow": wf, "kind": kind_name, "kind_used": None, "fallback": None}
    return {"ok": True, "source": None, "workflow": None, "kind": None, "kind_used": None, "fallback": None}


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

    src = native_cut_source_workflow(pid, cut_id, by_kind=False)
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
    return f'{base} Dialogue: "{cap}"'


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
        gg_wfnodes.write_generation_prompt(g, text)
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


def _extract_first_frame(src: Path, vid: str) -> Path | None:
    """One frame of a video (or animated image) as a jpeg. None when ffmpeg cannot read it."""
    try:
        from . import gg_data as gd
    except ImportError:
        import gg_data as gd  # type: ignore
    exe = gd.ffmpeg_exe()
    if not exe:
        return None
    out = gd.CACHE_DIR / "ref_frames" / f"{vid}.jpg"
    try:
        if out.is_file() and out.stat().st_mtime >= src.stat().st_mtime and out.stat().st_size > 0:
            return out
    except OSError:
        return None
    import os
    import secrets
    import subprocess

    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(f"{out.stem}.{os.getpid()}.{secrets.token_hex(4)}.tmp.jpg")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        subprocess.run(
            [exe, "-y", "-loglevel", "error", "-i", str(src), "-frames:v", "1", "-q:v", "3", str(tmp)],
            check=False, capture_output=True, timeout=30, creationflags=flags,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if tmp.is_file() and tmp.stat().st_size > 0:
        try:
            tmp.replace(out)
        except OSError:
            return tmp if tmp.is_file() else None
        if out.is_file():
            return out
    return None


def reference_still_file(src: Path, vid: str) -> Path | None:
    """Best/latest file as a still: the image itself, or the first frame of a video. None means text only."""
    if is_still_image(src):
        return src
    if not src.is_file():
        return None
    return _extract_first_frame(src, vid)


def _reference_version_file(pid: str, ref: dict) -> tuple[dict, Path] | None:
    """The reference's Best version file, else the latest version file."""
    store = native_store()
    versions = store.list_versions(pid, ref.get("id") or "")
    if not versions:
        return None
    pick = ref.get("pick_version_id")
    ordered = []
    if isinstance(pick, str) and pick:
        hit = next((v for v in versions if v.get("id") == pick), None)
        if hit:
            ordered.append(hit)
    for ver in versions:
        if ver not in ordered:
            ordered.append(ver)
    for ver in ordered:
        path = store.version_file(pid, ver)
        if path is not None and path.is_file():
            return ver, path
    return None


def _ref_links():
    """Reference helpers. ComfyUI loads this pack as a package, so the relative import has to come first."""
    try:
        from .gg_project import ref_links as ref_links
    except ImportError:
        from gg_project import ref_links as ref_links  # type: ignore
    return ref_links


def _qwen_ref():
    try:
        from . import gg_qwen_ref as qwen_ref
    except ImportError:
        import gg_qwen_ref as qwen_ref  # type: ignore
    return qwen_ref


def _linear_output_ids(graph: dict):
    """App output node ids, or None when the template has no linearData.outputs list."""
    try:
        from . import gg_sdk
    except ImportError:
        import gg_sdk  # type: ignore
    return gg_sdk.linear_output_node_ids(graph)


def reference_prompt_text(doc: dict, cut: dict, text: str, *, mention_prompt: str | None = None) -> str:
    """@Name becomes the plain name, then a References block is appended. The caption field is not read here."""
    inject_prompt_text = _ref_links().inject_prompt_text

    cuts = doc.get("cuts") if isinstance(doc, dict) and isinstance(doc.get("cuts"), dict) else {}
    source = mention_prompt if isinstance(mention_prompt, str) else (cut.get("prompt") if isinstance(cut.get("prompt"), str) else text)
    return inject_prompt_text(text or "", cuts, cut if isinstance(cut, dict) else {}, source)


def _stage_reference_image(pid: str, ref: dict) -> str | None:
    """Best (else latest) still of a reference, copied into ComfyUI input. None means text only."""
    found = _reference_version_file(pid, ref)
    if not found:
        return None
    ver, path = found
    still = reference_still_file(path, ver.get("id") or "")
    if still is None:
        return None
    return stage_start_image(still, ver["id"])


def _cut_current_still_name(pid: str, cut: dict) -> str | None:
    """Still for a cut with no linked references: displayed version, else Best, else newest."""
    if not isinstance(pid, str) or not pid or not isinstance(cut, dict):
        return None
    store = native_store()
    versions = store.list_versions(pid, cut.get("id") or "")
    order: list[str] = []
    for key in ("display_version_id", "pick_version_id"):
        vid = cut.get(key)
        if isinstance(vid, str) and vid:
            order.append(vid)
    for ver in versions:
        vid = ver.get("id")
        if isinstance(vid, str) and vid:
            order.append(vid)
    seen: set[str] = set()
    for vid in order:
        if vid in seen:
            continue
        seen.add(vid)
        ver = next((row for row in versions if row.get("id") == vid), None)
        path = store.version_file(pid, ver) if ver else None
        if ver and is_still_version(ver, path):
            try:
                return stage_start_image(path, ver["id"])
            except (OSError, ValueError):
                return None
    return None


def _apply_qwen_edit_references(doc: dict, cut: dict, wf: dict) -> list:
    """image1..image3 from linked references, in link order. The first three only.

    Zero links use the cut's current still as image1, or text only when it has none.
    A reference without a still stays text and that input is left disconnected.
    """
    generation_links = _ref_links().generation_links
    qwen = _qwen_ref()
    apply_qwen_ref_images = qwen.apply_qwen_ref_images
    qwen_ref_warning = qwen.qwen_ref_warning

    cuts = doc.get("cuts") if isinstance(doc, dict) and isinstance(doc.get("cuts"), dict) else {}
    prompt = cut.get("prompt") if isinstance(cut.get("prompt"), str) else ""
    links = [row for row in generation_links(cuts, cut, prompt) if not row.get("missing")]
    warning = qwen_ref_warning(len(links))
    if warning:
        log.warning(warning)
    chosen = links[:3]
    by_id = cuts if isinstance(cuts, dict) else {}
    pid = doc.get("id") if isinstance(doc, dict) else ""
    files = ["", "", ""]
    used = []
    for index, link in enumerate(chosen):
        file_name = ""
        ref = by_id.get(link["ref_id"])
        if isinstance(ref, dict) and isinstance(pid, str) and pid:
            try:
                file_name = _stage_reference_image(pid, ref) or ""
            except (OSError, ValueError):
                file_name = ""
        files[index] = file_name
        item = {
            "ref_id": link["ref_id"],
            "name": link.get("name") or "",
            "category": link.get("category") or "Other",
            "mode": "image" if file_name else "text",
        }
        if file_name:
            item["slot"] = f"image{index + 1}"
        used.append(item)
    for link in links[3:]:
        used.append({
            "ref_id": link["ref_id"],
            "name": link.get("name") or "",
            "category": link.get("category") or "Other",
            "mode": "text",
        })
    if not any(files) and not chosen and isinstance(pid, str) and pid:
        take = _cut_current_still_name(pid, cut)
        if take:
            files[0] = take
    apply_qwen_ref_images(wf, files)
    return used


def apply_reference_images(doc: dict, cut: dict, wf: dict, exclude_ids: list | None = None) -> list:
    """Stage each linked reference into the Load Image node stored on its link.

    A Qwen Image Edit prompt instead fills image1..image3 in link order. The Start Image /
    selected-take node is never written on other templates. No slot, no still, or a failed
    copy leaves that reference as text. Returns refs_used for the version meta.
    """
    if not isinstance(wf, dict) or not isinstance(cut, dict):
        return []
    # Image-ref slots image1..image3 exist only on TextEncodeQwenImageEditPlus.
    # Video templates (LTX and the rest) keep their own LoadImage / start take.
    if _qwen_ref().is_qwen_edit_api(wf):
        return _apply_qwen_edit_references(doc, cut, wf)
    generation_links = _ref_links().generation_links
    cuts = doc.get("cuts") if isinstance(doc, dict) and isinstance(doc.get("cuts"), dict) else {}
    prompt = cut.get("prompt") if isinstance(cut.get("prompt"), str) else ""
    links = generation_links(cuts, cut, prompt)
    exclude = {str(x) for x in (exclude_ids or []) if isinstance(x, str) and x}
    try:
        exclude.add(gg_wfnodes.find_start_image_node(wf)[0])
    except gg_wfnodes.NodeNotFound:
        pass
    pid = doc.get("id") if isinstance(doc, dict) else ""
    by_id = cuts if isinstance(cuts, dict) else {}
    used = []
    for link in links:
        if link.get("missing"):
            continue
        mode = "text"
        slot = link.get("slot") if isinstance(link.get("slot"), str) else None
        staged_slot = None
        if slot and slot not in exclude and isinstance(pid, str) and pid:
            ref = by_id.get(link["ref_id"])
            if isinstance(ref, dict):
                try:
                    found = _reference_version_file(pid, ref)
                    still = reference_still_file(found[1], found[0]["id"]) if found else None
                    if still is not None:
                        name = stage_start_image(still, found[0]["id"])
                        gg_wfnodes.set_node_image(wf, slot, name)
                        mode = "image"
                        staged_slot = slot
                except (gg_wfnodes.NodeNotFound, OSError, ValueError):
                    mode = "text"
                    staged_slot = None
        row = {
            "ref_id": link["ref_id"],
            "name": link.get("name") or "",
            "category": link.get("category") or "Other",
            "mode": mode,
        }
        if staged_slot:
            row["slot"] = staged_slot
        used.append(row)
    return used


def apply_cut_references(doc: dict, cut: dict, wf: dict, *, video: bool = False) -> tuple[dict, list]:
    """Write the cut prompt into the workflow, then fill reference image slots. Never queues.

    The prompt is written with or without linked references (the reference block is included when
    there are links). Image and video templates both get it, including a subgraph-promoted text widget.
    The caption field is not edited. A video prompt still gets the same Dialogue suffix after the
    reference block.
    """
    if not isinstance(cut, dict) or not isinstance(wf, dict):
        return wf, []
    base = cut_prompt_text(cut)
    injected = ""
    if base:
        raw_prompt = cut.get("prompt") if isinstance(cut.get("prompt"), str) else ""
        injected = reference_prompt_text(doc, cut, base, mention_prompt=raw_prompt)
        if video:
            cap = cut_caption_text(cut)
            if cap:
                injected = f'{injected} Dialogue: "{cap}"'
    if injected:
        try:
            gg_wfnodes.write_generation_prompt(wf, injected)
        except gg_wfnodes.NodeNotFound:
            pass
    return wf, apply_reference_images(doc, cut, wf)


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
    graph = copy.deepcopy(graph)
    output_nodes = _linear_output_ids(graph)
    prefer_id = None
    if gg_template._is_ui_workflow(graph):
        try:
            prefer_id = gg_wfnodes.find_start_image_node(graph)[0]
        except gg_wfnodes.NodeNotFound:
            prefer_id = None
        try:
            graph = _ui_to_api(graph)
        except ValueError as ex:
            raise ValueError(f"Video template {label} cannot run without its tab: {ex}") from None
    if not (isinstance(prefer_id, str) and isinstance(graph.get(prefer_id), dict)):
        gg_wfnodes.find_start_image_node(graph)
        prefer_id = None
    ver, path = pick_start_version(pid, cut_id, selected_vid, start_vid)
    base = cut_prompt_text(cut)
    if base:
        raw_prompt = cut.get("prompt") if isinstance(cut.get("prompt"), str) else ""
        prompt = reference_prompt_text(doc, cut, base, mention_prompt=raw_prompt)
        cap = cut_caption_text(cut)
        if cap:
            prompt = f'{prompt} Dialogue: "{cap}"'
    else:
        prompt = _version_prompt(pid, ver, path)
        if prompt:
            prompt = reference_prompt_text(doc, cut, prompt, mention_prompt=prompt)
    if not prompt:
        raise ValueError("This cut has no description. Add a caption first.")
    sec = cut_generation_seconds(doc, cut_id)
    err = gg_ltx.check_ltx_generation_duration(graph, sec)
    if err:
        raise ValueError(err)
    wf = gg_ltx.inject_ltx(graph, prompt, float(sec))
    wf = gg_ltx.patch_ltx_duration(wf, float(sec))
    image = stage_start_image(path, ver["id"])
    if isinstance(prefer_id, str) and isinstance(wf.get(prefer_id), dict):
        try:
            node = gg_wfnodes.set_node_image(wf, prefer_id, image)
        except gg_wfnodes.NodeNotFound:
            node = gg_wfnodes.set_start_image(wf, image)
    else:
        node = gg_wfnodes.set_start_image(wf, image)
    refs_used = apply_reference_images(doc, cut, wf, exclude_ids=[node])
    return {"workflow": wf, "template": label, "start_version": ver["id"], "start_node": node, "image": image,
            "prompt": prompt, "frames": gg_ltx.frames_for_duration(float(sec), gg_ltx.workflow_fps(wf)),
            "refs_used": refs_used, "output_nodes": output_nodes}


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


_MEDIA_KIND = {
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image",
    ".mp4": "video", ".webm": "video", ".mov": "video",
}


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


def _add_output_version(pid: str, cut_id: str, lo: dict, api_workflow: dict | None = None,
                        gen: dict | None = None, ui_workflow: dict | None = None) -> dict:
    path = Path(lo["path"])
    meta = gg_wfstore.extract_png_meta(path) if path.suffix.lower() == ".png" else {}
    ui = meta.get("workflow") if isinstance(meta.get("workflow"), dict) else None
    api = meta.get("prompt") if isinstance(meta.get("prompt"), dict) else None
    if api_workflow is not None and isinstance(api_workflow, dict):
        api = api_workflow
    if isinstance(ui_workflow, dict) and ui_workflow:
        workflow = ui_workflow
    else:
        workflow = ui or api
    ver = native_store().add_version(
        pid,
        cut_id,
        path,
        workflow=workflow,
        prompt_id=lo.get("prompt_id") if isinstance(lo.get("prompt_id"), str) else None,
        animated=lo.get("animated") is True,
        gen=gen,
    )
    return ver


def _workflow_has_body(graph: dict | None) -> bool:
    if not isinstance(graph, dict) or not graph:
        return False
    nodes = graph.get("nodes")
    if isinstance(nodes, list):
        return any(isinstance(n, dict) for n in nodes)
    return any(isinstance(n, dict) and n.get("class_type") for n in graph.values())


def embedded_import_workflow(path: Path) -> dict | None:
    """ComfyUI graph embedded in an imported file, or None when the file has none.

    PNG `workflow` (UI graph) wins. `prompt` (API graph) is used when the UI graph is missing.
    The returned copy is for the cut only. The file on disk is not rewritten.
    """
    path = Path(path)
    if path.suffix.lower() != ".png":
        return None
    try:
        meta = gg_wfstore.extract_png_meta(path)
    except OSError:
        return None
    ui = meta.get("workflow") if isinstance(meta.get("workflow"), dict) else None
    api = meta.get("prompt") if isinstance(meta.get("prompt"), dict) else None
    graph = ui if _workflow_has_body(ui) else None
    if graph is None and _workflow_has_body(api):
        graph = api
    if not isinstance(graph, dict):
        return None
    return clear_cut_linear_mode(copy.deepcopy(graph))


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


def _apply_imported_video_length(store, pid: str, cut_id: str, ver: dict) -> None:
    """When the imported file is a video and its length was read, the new cut uses that length."""
    asset = ver.get("asset") if isinstance(ver, dict) else None
    if not isinstance(asset, dict) or asset.get("kind") != "video":
        return
    seconds = asset.get("seconds")
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or seconds <= 0:
        return
    try:
        store.set_imported_cut_length(pid, cut_id, float(seconds))
    except Exception:  # noqa: BLE001
        log.exception("[gonggan-cut] import duration was not saved")


def native_import_image_cut(
    pid: str,
    src: Path | str,
    after: str | None = None,
    group_id: str | None = None,
) -> dict:
    """Import creates a cut. The options Image and Video templates are not copied into it.

    A ComfyUI workflow embedded in the file becomes that cut's workflow.
    With no embedded workflow the cut workflow stays empty. Add cut and a new
    project's first cut still copy the options template for that cut's kind.
    Video (mp4, webm, mov, animated webp) stays a video take. Its length is the
    file's length when that can be read. No workflow is taken from a video file.
    """
    src = Path(src)
    if src.suffix.lower() not in _MEDIA_KIND:
        raise ValueError(f"Unsupported file type: {src.suffix or '(none)'}")
    store = native_store()
    doc = store.get_project(pid)
    if not doc or doc.get("deleted_at"):
        raise ValueError("project not found")
    added = native_add_cut(pid, group_id, after if isinstance(after, str) and after else None, copy_template=False)
    cut = added.get("cut") if isinstance(added.get("cut"), dict) else None
    cut_id = cut.get("id") if cut else None
    if not isinstance(cut_id, str) or not cut_id:
        raise ValueError("could not create cut")
    graph = embedded_import_workflow(src)
    try:
        ver = _add_output_version(pid, cut_id, {"path": str(src)})
    except Exception:
        try:
            store.delete_cuts(pid, [cut_id])
        except Exception:
            log.exception("[gonggan-cut] import cut cleanup failed")
        raise
    if graph is not None:
        store.set_cut_workflow(pid, cut_id, graph)
    _apply_imported_video_length(store, pid, cut_id, ver)
    return {
        "ok": True,
        "cut": {"id": cut_id, "name": cut.get("name")},
        "version": ver,
        "workflow_embedded": graph is not None,
        "timeline": store.to_timeline(pid),
    }


_CAPTURE_LOCK = threading.Lock()


def native_capture_prompt_output(
    pid: str, cut_id: str, prompt_id: str, wait_sec: float = 5.0, poll_sec: float = 0.25,
    api_workflow: dict | None = None, gen: dict | None = None, ui_workflow: dict | None = None,
    output_nodes=None,
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
    node_ids = output_nodes if isinstance(output_nodes, list) else gg_sdk.linear_output_node_ids(ui_workflow)
    deadline = time.monotonic() + max(0.0, wait_sec)
    while True:
        info = gg_sdk.prompt_output_info(prompt_id, node_ids)
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
        return {
            "ok": True,
            "version": _add_output_version(pid, cut_id, lo, api_workflow, gen, ui_workflow),
            "output": lo,
            "duplicate": False,
        }
