"""aiohttp routes under /gonggan/* on ComfyUI's PromptServer (also reachable as /api/gonggan/*)."""
from __future__ import annotations

import asyncio
import logging
import secrets
from pathlib import Path

from aiohttp import web
from server import PromptServer

from . import gg_data
from . import gg_native_api
from . import gg_template
from . import gg_wfstore

try:
    from .gg_project import ConflictError
    from .gg_project.folder_list import folder_list_response
    from .gg_project.project_settings import check_output_folder, check_export_output_folder, comfyui_output_directory
except ImportError:  # unittest / plain script
    from gg_project import ConflictError  # type: ignore
    from gg_project.folder_list import folder_list_response  # type: ignore
    from gg_project.project_settings import check_output_folder, check_export_output_folder, comfyui_output_directory  # type: ignore

routes = PromptServer.instance.routes
log = logging.getLogger("gonggan-cut")


def _err(status: int, message: str) -> web.Response:
    return web.json_response({"ok": False, "message": message}, status=status)


def _history_mod():
    try:
        from .gg_project import history as history_mod
    except ImportError:
        from gg_project import history as history_mod  # type: ignore
    return history_mod


def _history_steps_limit() -> int:
    try:
        return _history_mod().history_steps_limit()
    except Exception:  # noqa: BLE001
        return 50


@routes.get("/gonggan/settings")
async def gg_settings(request):
    s = gg_data.load_settings()
    try:
        d = await asyncio.to_thread(gg_data.user_dir, s)
        ok, where = True, str(d)
    except Exception as ex:  # noqa: BLE001
        ok, where = False, str(ex)
    try:
        native_projects = str(gg_native_api.native_store().projects_dir)
    except Exception:  # noqa: BLE001
        native_projects = ""
    try:
        default_project_location = str(comfyui_output_directory())
    except Exception:  # noqa: BLE001
        default_project_location = ""
    return web.json_response({
        "ok": ok,
        "data_root": s.get("data_root"),
        "uid": s.get("uid"),
        "user_dir": where,
        "native_projects_dir": native_projects,
        "default_project_location": default_project_location,
        "history_steps": _history_steps_limit(),
    })


@routes.get("/gonggan/projects")
async def gg_projects(request):
    try:
        data = await asyncio.to_thread(gg_data.list_projects)
        return web.json_response(await asyncio.to_thread(gg_native_api.merge_projects_list, data))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] projects failed")
        return _err(500, str(ex))


@routes.post("/gonggan/project/create")
async def gg_project_create(request):
    data = await _json_body(request)
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        return _err(400, "name required")
    ref = data.get("template_ref")
    if ref is not None and not isinstance(ref, str):
        return _err(400, "template_ref must be a string")
    settings = data.get("settings")
    if settings is not None and not isinstance(settings, dict):
        return _err(400, "settings must be an object")
    location = data.get("location")
    if location is not None and not isinstance(location, str):
        return _err(400, "location must be a string")
    try:
        first_kind = data.get("kind")
        if first_kind is not None and first_kind not in ("image", "video"):
            return _err(400, "kind must be image or video")
        res = await asyncio.to_thread(
            gg_native_api.create_native_project,
            name.strip(),
            ref or None,
            settings,
            location,
            "video" if first_kind == "video" else None,
        )
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] project create failed")
        return _err(500, str(ex))
    return web.json_response(res)


@routes.post("/gonggan/project/rename")
async def gg_project_rename(request):
    data = await _json_body(request)
    pid, name = data.get("pid"), data.get("name")
    if not isinstance(pid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    if not isinstance(name, str) or not name.strip():
        return _err(400, "name required")
    try:
        res = await asyncio.to_thread(gg_native_api.rename_native_project, pid, name.strip())
    except FileNotFoundError:
        return _err(404, "project not found")
    except ValueError as ex:
        return _err(400, str(ex))
    return web.json_response(res)


@routes.post("/gonggan/project/delete")
async def gg_project_delete(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    try:
        res = await asyncio.to_thread(gg_native_api.delete_native_project, pid)
    except FileNotFoundError:
        return _err(404, "project not found")
    return web.json_response(res)


@routes.post("/gonggan/project/restore")
async def gg_project_restore(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    try:
        res = await asyncio.to_thread(gg_native_api.restore_native_project, pid)
    except FileNotFoundError:
        return _err(404, "project not found")
    return web.json_response(res)


@routes.get("/gonggan/timeline")
async def gg_timeline(request):
    pid = request.query.get("pid", "")
    if not pid:
        return _err(400, "pid required")
    try:
        if gg_native_api.is_native_pid(pid):
            data = await asyncio.to_thread(gg_native_api.native_timeline, pid)
        else:
            data = await asyncio.to_thread(gg_data.timeline, pid)
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] timeline failed")
        return _err(500, str(ex))
    if data is None:
        return _err(404, "project not found")
    return web.json_response(data)


@routes.get("/gonggan/media")
async def gg_media(request):
    mid = request.query.get("id", "")
    try:
        path = await asyncio.to_thread(gg_native_api.native_media_path, mid)
        if path is None:
            path = await asyncio.to_thread(gg_data.media_path, mid)
    except Exception as ex:  # noqa: BLE001
        return _err(500, str(ex))
    if path is None:
        return _err(404, "media not found")
    return web.FileResponse(
        path,
        headers={
            "Content-Type": gg_data.MIME.get(path.suffix.lower(), "application/octet-stream"),
            "Cache-Control": "private, max-age=300",
        },
    )


@routes.get("/gonggan/poster")
async def gg_poster(request):
    mid = request.query.get("id", "")
    try:
        path = await asyncio.to_thread(gg_native_api.native_poster_path, mid)
        if path is None:
            path = await asyncio.to_thread(gg_data.poster_path, mid)
    except Exception as ex:  # noqa: BLE001
        return _err(500, str(ex))
    if path is None:
        return _err(404, "poster not found")
    return web.FileResponse(path, headers={
        "Content-Type": gg_data.MIME.get(path.suffix.lower(), "image/jpeg"),
        "Cache-Control": "private, max-age=300",
    })


async def _json_body(request) -> dict:
    try:
        data = await request.json()
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


@routes.post("/gonggan/edit")
async def gg_edit(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    try:
        if gg_native_api.is_native_pid(pid):
            tl = await asyncio.to_thread(
                gg_native_api.native_save_edit, pid, data.get("order"), data.get("clips"),
            )
        else:
            tl = await asyncio.to_thread(gg_data.save_edit, pid, data.get("order"), data.get("clips"))
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] edit save failed")
        return _err(500, str(ex))
    if tl is None:
        return _err(404, "project not found")
    return web.json_response(tl)


@routes.post("/gonggan/groups")
async def gg_groups(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if "groups" not in data:
        return _err(400, "groups required")
    try:
        if gg_native_api.is_native_pid(pid):
            tl = await asyncio.to_thread(gg_native_api.native_save_groups, pid, data.get("groups"))
        else:
            tl = await asyncio.to_thread(gg_data.save_groups, pid, data.get("groups"))
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] groups save failed")
        return _err(500, str(ex))
    if tl is None:
        return _err(404, "project not found")
    return web.json_response(tl)


@routes.post("/gonggan/edit/reset")
async def gg_edit_reset(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    try:
        if gg_native_api.is_native_pid(pid):
            tl = await asyncio.to_thread(gg_native_api.native_reset_timeline, pid)
        else:
            tl = await asyncio.to_thread(gg_data.reset_edit, pid)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        return _err(500, str(ex))
    if tl is None:
        return _err(404, "project not found")
    return web.json_response(tl)


@routes.post("/gonggan/cut/reorder")
async def gg_cut_reorder(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    try:
        tl = await asyncio.to_thread(gg_native_api.native_reorder_cuts, pid, data.get("order"))
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] cut reorder failed")
        return _err(500, str(ex))
    if tl is None:
        return _err(404, "project not found")
    return web.json_response(tl)


@routes.post("/gonggan/timeline/apply_order")
async def gg_timeline_apply_order(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    try:
        tl = await asyncio.to_thread(gg_native_api.native_apply_track_order, pid)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] apply timeline order failed")
        return _err(500, str(ex))
    if tl is None:
        return _err(404, "project not found")
    return web.json_response(tl)


# ---------------- export ----------------
from . import gg_export  # noqa: E402


def _notify(job: dict) -> None:
    # send_sync is thread-safe (schedules onto the server loop)
    PromptServer.instance.send_sync("gonggan.export", job)


gg_export._notify = _notify


def _request_is_local(request) -> bool:
    peer = request.remote or ""
    if peer in ("127.0.0.1", "::1"):
        return True
    host = (request.host or "").split(":")[0].lower()
    return host in ("127.0.0.1", "localhost")


@routes.get("/gonggan/export/output-path")
async def gg_export_output_path(request):
    pid = request.query.get("pid", "")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    res = await asyncio.to_thread(gg_native_api.native_export_output_path, pid)
    if res is None:
        return _err(404, "project not found")
    return web.json_response(res)


@routes.post("/gonggan/export/folder/check")
async def gg_export_folder_check(request):
    data = await _json_body(request)
    path = data.get("path")
    if path is not None and not isinstance(path, str):
        return _err(400, "path must be a string")
    res = await asyncio.to_thread(check_export_output_folder, path or "")
    return web.json_response(res, status=200 if res.get("ok") else 400)


@routes.post("/gonggan/export")
async def gg_export_start(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    extra = {}
    if gg_native_api.is_native_pid(pid):
        got = await asyncio.to_thread(gg_native_api.native_export_timeline, pid)
        if got is None:
            return _err(404, "project not found")
        doc = gg_native_api.native_store().get_project(pid)
        settings = (doc or {}).get("settings") if doc else None
        try:
            from .gg_project.project_settings import normalize_settings
        except ImportError:
            from gg_project.project_settings import normalize_settings  # type: ignore
        ef = normalize_settings(settings if isinstance(settings, dict) else None).get("export_folder") or ""
        if ef:
            chk = await asyncio.to_thread(check_export_output_folder, ef)
            if not chk.get("ok"):
                return _err(400, chk.get("message") or "Invalid export folder")
        extra = {"tl": got[0], "out_dir": got[1], "resolve": gg_native_api.native_media_path}
    try:
        res = await asyncio.to_thread(
            gg_export.start, pid, str(data.get("preset") or "720p"), data.get("width"), data.get("height"),
            data.get("fps") or 24, bool(data.get("sound", True)), **extra,
        )
    except ValueError as ex:
        return _err(400, str(ex))
    return web.json_response(res, status=200 if res.get("ok") else 409)


@routes.get("/gonggan/export/status")
async def gg_export_status(request):
    return web.json_response({"ok": True, "job": gg_export.status()})


@routes.post("/gonggan/export/cancel")
async def gg_export_cancel(request):
    return web.json_response(gg_export.cancel())


@routes.get("/gonggan/export/file")
async def gg_export_file(request):
    path = await asyncio.to_thread(gg_export.export_file, request.query.get("name", ""))
    if path is None:
        return _err(404, "file not found")
    return web.FileResponse(path, headers={"Content-Type": "video/mp4", "Cache-Control": "no-cache"})


@routes.post("/gonggan/export/reveal")
async def gg_export_reveal(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    name = data.get("name") if isinstance(data.get("name"), str) else None
    res = await asyncio.to_thread(gg_export.reveal_project_export, pid, name)
    if res.get("ok") and not _request_is_local(request):
        res = {**res, "remote_host": True}
    return web.json_response(res, status=200 if res.get("ok") else 404)


# ---------------- Comfy SDK path ----------------
from . import gg_sdk  # noqa: E402


def _notify_regen(job: dict) -> None:
    PromptServer.instance.send_sync("gonggan.regen", job)


gg_sdk._notify = _notify_regen


def _notify_generate_all(batch: dict) -> None:
    PromptServer.instance.send_sync("gonggan.generate_all", batch)


gg_sdk._batch_notify = _notify_generate_all


@routes.get("/gonggan/template")
async def gg_template_get(request):
    pid = request.query.get("pid", "")
    if not pid:
        return _err(400, "pid required")
    ref = (request.query.get("ref") or "").strip()
    if ref:
        try:
            wf = await asyncio.to_thread(gg_template.read_workflow_ref, ref)
        except ValueError as ex:
            return _err(404, str(ex))
        except Exception as ex:  # noqa: BLE001
            log.exception("[gonggan-cut] template get failed")
            return _err(500, str(ex))
        return web.json_response({"ok": True, "ref": ref, "exists": True, "workflow": wf})
    try:
        if gg_native_api.is_native_pid(pid):
            info = await asyncio.to_thread(gg_native_api.native_template_info, pid)
        else:
            info = await asyncio.to_thread(gg_template.get_template_info, pid)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] template get failed")
        return _err(500, str(ex))
    return web.json_response({"ok": True, **info})


@routes.post("/gonggan/template")
async def gg_template_post(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if "ref" in data:
        ref = data.get("ref")
        if ref is not None and not isinstance(ref, str):
            return _err(400, "ref must be a string")
        try:
            if gg_native_api.is_native_pid(pid):
                path = await asyncio.to_thread(gg_native_api.native_set_template_ref, pid, ref or "")
            else:
                path = await asyncio.to_thread(gg_template.save_template_ref, pid, ref or "")
        except ValueError as ex:
            return _err(400, str(ex))
        except Exception as ex:  # noqa: BLE001
            log.exception("[gonggan-cut] template save failed")
            return _err(500, str(ex))
        return web.json_response({"ok": True, "path": str(path) if path else None})
    workflow = data.get("workflow")
    if not isinstance(workflow, dict):
        return _err(400, "ref or workflow required")
    try:
        if gg_native_api.is_native_pid(pid):
            path = await asyncio.to_thread(gg_native_api.native_set_template_workflow, pid, workflow)
        else:
            path = await asyncio.to_thread(gg_template.save_template, pid, workflow)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] template save failed")
        return _err(500, str(ex))
    return web.json_response({"ok": True, "path": str(path)})


@routes.post("/gonggan/cut/delete")
async def gg_cut_delete(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    cuts = data.get("cuts")
    if not isinstance(cuts, list) or not cuts:
        return _err(400, "cuts required")
    try:
        if gg_native_api.is_native_pid(pid):
            step = data.get("history_step")
            if step is not None and not isinstance(step, str):
                return _err(400, "history_step must be a string")
            res = await asyncio.to_thread(gg_native_api.native_delete_cuts, pid, cuts, step)
            if res is None:
                return _err(404, "project not found")
            return web.json_response(res)
        tl = await asyncio.to_thread(gg_data.delete_cuts, pid, cuts)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] cut delete failed")
        return _err(500, str(ex))
    if tl is None:
        return _err(404, "project not found")
    return web.json_response({"ok": True, "timeline": tl})


@routes.post("/gonggan/cut/restore")
async def gg_cut_restore(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    cuts = data.get("cuts")
    if cuts is not None and not isinstance(cuts, list):
        return _err(400, "cuts must be a list")
    try:
        if gg_native_api.is_native_pid(pid):
            step = data.get("history_step")
            if step is not None and not isinstance(step, str):
                return _err(400, "history_step must be a string")
            res = await asyncio.to_thread(gg_native_api.native_restore_cuts, pid, cuts, step)
            if res is None:
                return _err(404, "project not found")
            return web.json_response(res)
        tl = await asyncio.to_thread(gg_data.restore_cuts, pid, cuts)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] cut restore failed")
        return _err(500, str(ex))
    if tl is None:
        return _err(404, "project not found")
    return web.json_response({"ok": True, "timeline": tl})


@routes.get("/gonggan/trash")
async def gg_trash_list(request):
    pid = request.query.get("pid", "")
    if not pid:
        return _err(400, "pid required")
    try:
        if gg_native_api.is_native_pid(pid):
            items = await asyncio.to_thread(gg_native_api.native_list_trash, pid)
            if items is None:
                return _err(404, "project not found")
            return web.json_response({"ok": True, "native": True, "items": items})
        items = await asyncio.to_thread(gg_data.list_trash, pid)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] trash list failed")
        return _err(500, str(ex))
    return web.json_response({"ok": True, "items": items})


@routes.get("/gonggan/history")
async def gg_history_get(request):
    pid = request.query.get("pid", "")
    if not pid:
        return _err(400, "pid required")
    try:
        if gg_native_api.is_native_pid(pid):
            doc = await asyncio.to_thread(gg_native_api.native_history_get, pid)
            if doc is None:
                return _err(404, "project not found")
        else:
            doc = await asyncio.to_thread(_history_mod().load_legacy_history, pid)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] history load failed")
        return _err(500, str(ex))
    return web.json_response(doc)


@routes.post("/gonggan/history")
async def gg_history_put(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    try:
        if gg_native_api.is_native_pid(pid):
            doc = await asyncio.to_thread(gg_native_api.native_history_put, pid, data)
            if doc is None:
                return _err(404, "project not found")
        else:
            doc = await asyncio.to_thread(_history_mod().save_legacy_history, pid, data)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] history save failed")
        return _err(500, str(ex))
    return web.json_response(doc)


@routes.post("/gonggan/history/settings")
async def gg_history_settings(request):
    data = await _json_body(request)
    try:
        limit = await asyncio.to_thread(_history_mod().save_history_steps, data.get("steps"))
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] history settings failed")
        return _err(500, str(ex))
    return web.json_response({"ok": True, "history_steps": limit})


@routes.post("/gonggan/version/delete")
async def gg_version_delete(request):
    data = await _json_body(request)
    pid = data.get("pid")
    cut_id = data.get("cut_id")
    version_id = data.get("version_id")
    step = data.get("history_step")
    if not isinstance(pid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    if not isinstance(cut_id, str) or not cut_id or not isinstance(version_id, str) or not version_id:
        return _err(400, "cut_id and version_id required")
    if not isinstance(step, str) or not step:
        return _err(400, "history_step required")
    try:
        res = await asyncio.to_thread(gg_native_api.native_delete_version, pid, cut_id, version_id, step)
    except FileNotFoundError:
        return _err(404, "version not found")
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] version delete failed")
        return _err(500, str(ex))
    if res is None:
        return _err(404, "project not found")
    return web.json_response(res)


@routes.post("/gonggan/version/restore")
async def gg_version_restore(request):
    data = await _json_body(request)
    pid = data.get("pid")
    cut_id = data.get("cut_id")
    version_id = data.get("version_id")
    step = data.get("history_step")
    if not isinstance(pid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    if not isinstance(cut_id, str) or not cut_id or not isinstance(version_id, str) or not version_id:
        return _err(400, "cut_id and version_id required")
    if not isinstance(step, str) or not step:
        return _err(400, "history_step required")
    try:
        res = await asyncio.to_thread(gg_native_api.native_restore_version, pid, cut_id, version_id, step)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] version restore failed")
        return _err(500, str(ex))
    if res is None:
        return _err(404, "project not found")
    return web.json_response(res)


@routes.post("/gonggan/cut/workflow")
async def gg_cut_workflow(request):
    """Save the full graph as this cut's current workflow. Other cuts and templates are not changed."""
    data = await _json_body(request)
    pid, cid, wf = data.get("pid"), data.get("cut_id"), data.get("workflow")
    if not isinstance(pid, str) or not isinstance(cid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid and cut_id required")
    if not isinstance(wf, dict):
        return _err(400, "workflow must be an object")
    try:
        res = await asyncio.to_thread(gg_native_api.native_set_cut_workflow, pid, cid, wf)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] cut workflow save failed")
        return _err(500, str(ex))
    return web.json_response(res)


@routes.post("/gonggan/cut/update")
async def gg_cut_update(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    cut_id = data.get("cut_id")
    fields = data.get("fields")
    if not isinstance(cut_id, str) or not cut_id:
        return _err(400, "cut_id required")
    if not isinstance(fields, dict) or not fields:
        return _err(400, "fields required")
    expected_rev = data.get("expected_rev")
    if expected_rev is not None and not isinstance(expected_rev, int):
        return _err(400, "expected_rev must be an integer")
    try:
        res = await asyncio.to_thread(
            gg_native_api.native_update_cut, pid, cut_id, fields, expected_rev,
        )
    except FileNotFoundError:
        return _err(404, "project not found")
    except ConflictError as ex:
        return _err(409, str(ex))
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] cut update failed")
        return _err(500, str(ex))
    if res is None:
        return _err(404, "project not found")
    return web.json_response(res)


@routes.post("/gonggan/project/update")
async def gg_project_update(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    fields = data.get("fields")
    if not isinstance(fields, dict) or not fields:
        return _err(400, "fields required")
    expected_rev = data.get("expected_rev")
    if expected_rev is not None and not isinstance(expected_rev, int):
        return _err(400, "expected_rev must be an integer")
    try:
        res = await asyncio.to_thread(
            gg_native_api.native_update_project, pid, fields, expected_rev,
        )
    except FileNotFoundError:
        return _err(404, "project not found")
    except ConflictError as ex:
        return _err(409, str(ex))
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] project update failed")
        return _err(500, str(ex))
    if res is None:
        return _err(404, "project not found")
    return web.json_response(res)


@routes.post("/gonggan/folder/check")
async def gg_folder_check(request):
    data = await _json_body(request)
    path = data.get("path")
    if path is not None and not isinstance(path, str):
        return _err(400, "path must be a string")
    res = await asyncio.to_thread(check_output_folder, path or "")
    return web.json_response(res, status=200 if res.get("ok") else 400)


@routes.get("/gonggan/folder/list")
async def gg_folder_list(request):
    status, body = await asyncio.to_thread(folder_list_response, request.rel_url.query.get("path", ""))
    return web.json_response(body, status=status)


@routes.post("/gonggan/project/import")
async def gg_project_import(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    try:
        res = await asyncio.to_thread(gg_native_api.native_import_structure, pid, data)
    except FileNotFoundError:
        return _err(404, "project not found")
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] project import failed")
        return _err(500, str(ex))
    return web.json_response(res)


@routes.post("/gonggan/cut/add-list")
async def gg_cut_add_list(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    after = data.get("after")
    workflow = data.get("workflow")
    if after is not None and not isinstance(after, str):
        return _err(400, "after must be a string")
    if workflow is not None and not isinstance(workflow, str):
        return _err(400, "workflow must be a string")
    try:
        list_kind = data.get("kind")
        if list_kind is not None and list_kind not in ("image", "video"):
            return _err(400, "kind must be image or video")
        res = await asyncio.to_thread(
            gg_native_api.native_add_cut_list,
            pid,
            data.get("cuts"),
            workflow,
            after,
            "video" if list_kind == "video" else None,
        )
    except FileNotFoundError:
        return _err(404, "project not found")
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] cut list add failed")
        return _err(500, str(ex))
    return web.json_response(res)


@routes.post("/gonggan/reference/add")
async def gg_reference_add(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    try:
        res = await asyncio.to_thread(gg_native_api.native_add_reference, pid, data.get("name"), data.get("category"))
    except FileNotFoundError:
        return _err(404, "project not found")
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] reference add failed")
        return _err(500, str(ex))
    if res is None:
        return _err(404, "project not found")
    return web.json_response(res)


@routes.post("/gonggan/cut/rename")
async def gg_cut_rename(request):
    data = await _json_body(request)
    pid = data.get("pid")
    cut_id = data.get("cut_id")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    if not isinstance(cut_id, str) or not cut_id:
        return _err(400, "cut_id required")
    try:
        res = await asyncio.to_thread(gg_native_api.native_rename_cut, pid, cut_id, data.get("name"))
    except FileNotFoundError:
        return _err(404, "project not found")
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] cut rename failed")
        return _err(500, str(ex))
    if res is None:
        return _err(404, "project not found")
    return web.json_response(res)

@routes.post("/gonggan/cut/add")
async def gg_cut_add(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    group = data.get("group")
    after = data.get("after")
    if group is not None and not isinstance(group, str):
        return _err(400, "group must be a string")
    if after is not None and not isinstance(after, str):
        return _err(400, "after must be a string")
    kind = data.get("kind")
    if kind is not None and kind not in ("image", "video"):
        return _err(400, "kind must be image or video")
    try:
        if gg_native_api.is_native_pid(pid):
            return web.json_response(await asyncio.to_thread(
                gg_native_api.native_add_cut,
                pid,
                group or None,
                after or None,
                True,
                "video" if kind == "video" else "image",
            ))
        cut = await asyncio.to_thread(gg_data.add_local_cut, pid, group or None, after or None)
        copied = False
        tl = await asyncio.to_thread(gg_data.timeline, pid)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] cut add failed")
        return _err(500, str(ex))
    if tl is None:
        return _err(404, "project not found")
    return web.json_response({"ok": True, "cut": cut, "template_copied": copied, "timeline": tl})


@routes.get("/gonggan/version-workflow")
async def gg_version_workflow(request):
    pid = request.query.get("pid", "")
    cut = request.query.get("cut", "")
    vid = request.query.get("vid", "")
    if not pid or not cut or not vid:
        return _err(400, "pid, cut, and vid required")
    try:
        if gg_native_api.is_native_pid(pid):
            rec = await asyncio.to_thread(gg_native_api.native_version_workflow, pid, cut, vid)
            if rec is None:
                return _err(404, "workflow not found")
            return web.json_response({"ok": True, **rec})
        rec = await asyncio.to_thread(gg_wfstore.get_version_workflow, pid, cut, vid)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] version-workflow failed")
        return _err(500, str(ex))
    if rec is None:
        return _err(404, "workflow not found")
    return web.json_response({"ok": True, **rec})


@routes.get("/gonggan/cut-source-workflow")
async def gg_cut_source_workflow(request):
    pid = request.query.get("pid", "")
    cut = request.query.get("cut", "")
    kind = request.query.get("kind", "") or None
    if not pid or not cut:
        return _err(400, "pid and cut required")
    try:
        if gg_native_api.is_native_pid(pid):
            data = await asyncio.to_thread(gg_native_api.native_cut_source_workflow, pid, cut, kind)
        else:
            data = await asyncio.to_thread(gg_wfstore.cut_source_workflow, pid, cut)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] cut-source-workflow failed")
        return _err(500, str(ex))
    return web.json_response(data)


@routes.post("/gonggan/wfstore/backfill")
async def gg_wfstore_backfill(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if pid is not None and not isinstance(pid, str):
        return _err(400, "pid must be a string")
    dry_run = bool(data.get("dry_run"))
    try:
        counts = await asyncio.to_thread(gg_wfstore.backfill, pid, dry_run)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] wfstore backfill failed")
        return _err(500, str(ex))
    return web.json_response({"ok": True, "counts": counts, "dry_run": dry_run})


@routes.get("/gonggan/workflow")
async def gg_workflow(request):
    """API-format draft workflow for a cut (Shots/Timeline click → ComfyUI canvas). No queue."""
    pid = request.query.get("pid", "")
    cid = request.query.get("cut_id", "")
    if not pid or not cid:
        return _err(400, "pid and cut_id required")
    if gg_native_api.is_native_pid(pid):
        return _err(400, gg_native_api.NATIVE_UNAVAILABLE)
    seed = request.query.get("seed")
    try:
        seed = int(seed) if seed not in (None, "") else None
    except (TypeError, ValueError):
        return _err(400, "bad seed")
    try:
        p = await asyncio.to_thread(gg_sdk.cut_workflow, pid, cid, seed, save_file=False)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] workflow failed")
        return _err(500, str(ex))
    return web.json_response({
        "ok": True,
        "workflow": p["workflow"],
        "seed": p["seed"],
        "cut_no": p["cut_no"],
        "cut_name": p["cut_name"],
        "model": p["model"],
        "approx_size": p["approx_size"],
    })


@routes.get("/gonggan/sdk/status")
async def gg_sdk_status(request):
    force = request.query.get("force") == "1"
    return web.json_response(await asyncio.to_thread(gg_sdk.status, force))


@routes.post("/gonggan/regen")
async def gg_regen(request):
    """dry_run (default) builds + validates the workflow and queues nothing.
    A real run needs {"dry_run": false, "confirm": true, "seed": <seed from the dry run>}."""
    data = await _json_body(request)
    pid, cid = data.get("pid"), data.get("cut_id")
    if not isinstance(pid, str) or not isinstance(cid, str):
        return _err(400, "pid and cut_id required")
    if gg_native_api.is_native_pid(pid):
        return await _native_regen(pid, cid, data)
    seed = data.get("seed")
    try:
        seed = int(seed) if seed is not None else None
    except (TypeError, ValueError):
        return _err(400, "bad seed")
    try:
        if data.get("dry_run", True) or data.get("confirm") is not True:
            return web.json_response(await asyncio.to_thread(gg_sdk.dry_run, pid, cid, seed))
        if seed is None:
            return _err(400, "confirmed run needs the seed shown in the dry run")
        return web.json_response(await asyncio.to_thread(gg_sdk.run_confirmed, pid, cid, seed))
    except ValueError as ex:
        return _err(400, str(ex))


async def _native_regen(pid: str, cid: str, data: dict):
    """Native cut: its current saved workflow through the Comfy SDK. The dry run (default) resolves it and sets
    the seeds (`mode` "regen" = new random seeds, "queue" = saved seeds); a real run needs
    {"dry_run": false, "confirm": true, "plan": <plan name from the dry run>} and runs exactly that file."""
    try:
        if data.get("dry_run", True) or data.get("confirm") is not True:
            job = data.get("job")
            rs = data.get("random_seed")
            new_seed = (data.get("mode") != "queue") if rs is None else bool(rs)
            if isinstance(job, str) and job:
                plan = await asyncio.to_thread(
                    gg_sdk.queue_job_plan, pid, cid, job,
                    selected_vid=data.get("selected_vid") or None,
                    new_seed=new_seed,
                )
            else:
                plan = await asyncio.to_thread(gg_sdk.native_plan, pid, cid, new_seed=new_seed,
                                               canvas=data.get("api_workflow"), convert=data.get("convert") is True)
            return web.json_response({"ok": True, "dry_run": True, "queued": False, "plan": plan})
        return web.json_response(await asyncio.to_thread(gg_sdk.run_native_confirmed, pid, cid, data.get("plan")))
    except gg_native_api.NativeWorkflowError as ex:
        return web.json_response({"ok": False, "message": str(ex), "code": ex.code}, status=400)
    except ValueError as ex:
        return _err(400, str(ex))


@routes.post("/gonggan/image-to-video")
async def gg_image_to_video(request):
    """Native only, dry run: {"pid", "cut_id", "selected_vid"?, "start_vid"?} -> {"plan"} = the project's Video
    template with the cut's Best (else selected / newest) image — or exactly `start_vid` (version row Make Video) —
    as start image and its description as prompt. Queues nothing; run it with
    POST /gonggan/regen {"dry_run": false, "confirm": true, "plan": ...}."""
    data = await _json_body(request)
    pid, cid, vid = data.get("pid"), data.get("cut_id"), data.get("selected_vid")
    start = data.get("start_vid")
    if not isinstance(pid, str) or not isinstance(cid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid and cut_id required")
    if vid is not None and not isinstance(vid, str):
        return _err(400, "selected_vid must be a string")
    if start is not None and not isinstance(start, str):
        return _err(400, "start_vid must be a string")
    try:
        plan = await asyncio.to_thread(
            gg_sdk.image_to_video_plan, pid, cid, vid or None, start or None,
            new_seed=bool(data.get("random_seed", True)),
        )
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] image-to-video failed")
        return _err(500, str(ex))
    return web.json_response({"ok": True, "dry_run": True, "queued": False, "plan": plan})


@routes.get("/gonggan/regen/status")
async def gg_regen_status(request):
    return web.json_response({"ok": True, "job": gg_sdk.job_status()})


@routes.post("/gonggan/generate-all")
async def gg_generate_all(request):
    """Native only: {"pid", "cut_ids", "confirm": true} or Queue mode {"items": [{cut_id, job, selected_vid?}]}."""
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid required")
    if data.get("confirm") is not True:
        return _err(400, "confirm required")
    try:
        res = await asyncio.to_thread(
            gg_sdk.start_generate_all, pid, data.get("cut_ids"),
            new_seed=data.get("random_seed") is True,
            items=data.get("items"),
        )
    except ValueError as ex:
        return _err(400, str(ex))
    return web.json_response(res, status=200 if res.get("ok") else 409)


@routes.post("/gonggan/generate-all/stop")
async def gg_generate_all_stop(request):
    return web.json_response(await asyncio.to_thread(gg_sdk.stop_generate_all))


@routes.get("/gonggan/generate-all/status")
async def gg_generate_all_status(request):
    return web.json_response({"ok": True, "batch": gg_sdk.generate_all_status()})


# ---------------- AI Cut Split (TextGenerate in ComfyUI through the Comfy SDK) ----------------
from . import gg_cut_split  # noqa: E402

_CUT_SPLIT_STATUS = {"bad_request": 400, "busy": 409, "disabled": 409, "missing_model": 409, "invalid": 422,
                     "too_long": 422}


@routes.post("/gonggan/ai-cut-split")
async def gg_ai_cut_split(request):
    """{"story"} -> {"cuts": [{cut, duration, description}], "model", "attempts", "seconds"}. Creates nothing.
    {"story", "background": true} -> 202 {"job"} at once; poll GET /gonggan/ai-cut-split/status?job=<id>."""
    data = await _json_body(request)
    background = data.get("background") is True
    try:
        if background:
            job = await asyncio.to_thread(
                gg_cut_split.start_job,
                data.get("story"),
                data.get("captions"),
                start_thread=True,
                pid=data.get("pid"),
            )
            return web.json_response({"ok": True, "job": job}, status=202)
        res = await asyncio.to_thread(gg_cut_split.ai_cut_split, data.get("story"), data.get("captions"))
    except gg_cut_split.CutSplitError as ex:
        return web.json_response({"ok": False, "code": ex.code, "message": str(ex), **ex.extra},
                                 status=_CUT_SPLIT_STATUS.get(ex.code, 502))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] AI Cut Split failed")
        return _err(500, f"{gg_cut_split.AI_MAKE_CUT_LABEL} failed: {ex}")
    return web.json_response({"ok": True, **res})


@routes.get("/gonggan/ai-cut-split/status")
async def gg_ai_cut_split_status(request):
    """?job=<id> -> {"job"} of that background run (404 when it is gone, e.g. after a restart);
    no id -> {"job": the last run or null}."""
    job_id = request.query.get("job", "")
    job = gg_cut_split.job_status(job_id or None)
    if job_id and job is None:
        return web.json_response({"ok": False, "code": "no_job",
                                  "message": f"This {gg_cut_split.AI_MAKE_CUT_LABEL} run is gone "
                                             "(was ComfyUI restarted?). Click Split to run it again."}, status=404)
    return web.json_response({"ok": True, "job": job})


@routes.get("/gonggan/cut-split/model")
async def gg_cut_split_model(request):
    """{"models": text_encoders (+ clip) files, "current": cut_split_clip setting, "default", "use_ai"}."""
    res = await asyncio.to_thread(gg_cut_split.model_choices)
    return web.json_response({"ok": True, **res})


@routes.get("/gonggan/cut-split/precheck")
async def gg_cut_split_precheck(request):
    """{"use_ai", "model", "missing", "memory"}: checked before AI Cut Split runs (loads nothing)."""
    res = await asyncio.to_thread(gg_cut_split.precheck)
    return web.json_response({"ok": True, **res})


@routes.post("/gonggan/cut-split/model")
async def gg_cut_split_model_save(request):
    """{"clip_name"?, "use_ai"?} -> writes cut_split_clip / cut_split_enabled in gonggan_settings.json;
    returns the same body as GET."""
    data = await _json_body(request)
    try:
        res = await asyncio.to_thread(gg_cut_split.save_settings, data.get("clip_name"), data.get("use_ai"))
    except gg_cut_split.CutSplitError as ex:
        return _err(_CUT_SPLIT_STATUS.get(ex.code, 500), str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] AI Cut Split model save failed")
        return _err(500, f"Could not save the AI model: {ex}")
    return web.json_response({"ok": True, **res})


@routes.get("/gonggan/last-output")
async def gg_last_output(request):
    info = await asyncio.to_thread(gg_sdk.last_output_info)
    return web.json_response({"ok": bool(info["output"]), "output": info["output"], "reason": info["reason"]})


@routes.post("/gonggan/send-output")
async def gg_send_output(request):
    data = await _json_body(request)
    pid, cid = data.get("pid"), data.get("cut_id")
    if not isinstance(pid, str) or not isinstance(cid, str):
        return _err(400, "pid and cut_id required")
    try:
        if gg_native_api.is_native_pid(pid):
            res = await asyncio.to_thread(gg_native_api.native_send_last_output, pid, cid)
        else:
            res = await asyncio.to_thread(gg_sdk.send_last_output, pid, cid)
    except ValueError as ex:
        return _err(400, str(ex))
    return web.json_response(res, status=200 if res.get("ok") else 404)


def _capture_number(value, lo, hi, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value or abs(value) == float("inf"):
        return None
    if integer:
        if isinstance(value, float) and not value.is_integer():
            return None
        value = int(value)
        if value < lo or value > hi:
            return None
        return value
    return float(value)


def _capture_gen(data: dict) -> dict | None:
    """Prompt, numbers, and input images stored with the Take for this queued run."""
    if not isinstance(data, dict):
        return None
    gen: dict = {}
    if isinstance(data.get("prompt"), str):
        gen["prompt"] = data["prompt"][:16000]
    if isinstance(data.get("negative"), str):
        gen["negative"] = data["negative"][:16000]
    if data.get("seed") is not None:
        seed = data.get("seed")
        if isinstance(seed, bool) or not isinstance(seed, (int, float)):
            raise ValueError("bad seed")
        if isinstance(seed, float):
            if not seed.is_integer():
                raise ValueError("bad seed")
            seed = int(seed)
        if seed < 0 or seed > 2**63 - 1:
            raise ValueError("bad seed")
        gen["seed"] = int(seed)
    if isinstance(data.get("input_image"), str):
        gen["input_image"] = data["input_image"][:500]
    steps = _capture_number(data.get("steps"), 1, 100000, integer=True)
    if steps is not None:
        gen["steps"] = steps
    cfg = _capture_number(data.get("cfg"), None, None)
    if cfg is not None:
        gen["cfg"] = cfg
    frames = _capture_number(data.get("frames"), 1, 100000, integer=True)
    if frames is not None:
        gen["frames"] = frames
    numerics = data.get("numerics")
    if isinstance(numerics, dict):
        clean = {}
        for key, value in numerics.items():
            if len(clean) >= 40:
                break
            if not isinstance(key, str) or isinstance(value, bool) or not isinstance(value, (int, float)):
                continue
            if value != value or abs(value) == float("inf"):
                continue
            clean[key[:40]] = value
        if clean:
            gen["numerics"] = clean
    images = data.get("input_images")
    if isinstance(images, list):
        names = [s[:500] for s in images if isinstance(s, str) and s][:20]
        if names:
            gen["input_images"] = names
    source = data.get("source_image_take")
    if isinstance(source, str) and source.strip():
        gen["source_image_take"] = source.strip()[:80]
    return gen or None


@routes.post("/gonggan/capture-output")
async def gg_capture_output(request):
    """Native only: the finished run `prompt_id` (queued from that cut) becomes a version of the cut."""
    data = await _json_body(request)
    pid, cid, prompt_id = data.get("pid"), data.get("cut_id"), data.get("prompt_id")
    if not isinstance(pid, str) or not isinstance(cid, str) or not gg_native_api.is_native_pid(pid):
        return _err(400, "pid and cut_id required")
    try:
        gen = _capture_gen(data)
        ui = data.get("workflow") if isinstance(data.get("workflow"), dict) else None
        output_nodes = data.get("output_nodes") if isinstance(data.get("output_nodes"), list) else None
        res = await asyncio.to_thread(
            gg_native_api.native_capture_prompt_output, pid, cid, prompt_id, gen=gen, ui_workflow=ui,
            output_nodes=output_nodes,
        )
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] capture-output failed")
        return _err(500, str(ex))
    return web.json_response(res)


@routes.post("/gonggan/import-version")
async def gg_import_version(request):
    """Native only: multipart {pid, cut_id, file} adds a version of an existing cut.

    multipart {pid, file, create_cut=1, after?, group?} creates a cut for that file
    and does not copy the options template into it.
    """
    fields: dict[str, str] = {}
    tmp = None
    try:
        reader = await request.multipart()
        async for part in reader:
            if part.name == "file" and tmp is None:
                ext = Path(part.filename or "").suffix.lower()
                tmp_dir = gg_data.CACHE_DIR / "imports"
                tmp_dir.mkdir(parents=True, exist_ok=True)
                tmp = tmp_dir / f"{secrets.token_hex(8)}{ext}"
                with open(tmp, "xb") as f:
                    while chunk := await part.read_chunk(1 << 20):
                        f.write(chunk)
            elif part.name in ("pid", "cut_id", "create_cut", "after", "group"):
                fields[part.name] = (await part.text()).strip()
        pid = fields.get("pid")
        if not pid or not gg_native_api.is_native_pid(pid):
            return _err(400, "pid and cut_id required")
        if tmp is None:
            return _err(400, "file required")
        if fields.get("create_cut") in ("1", "true", "yes"):
            res = await asyncio.to_thread(
                gg_native_api.native_import_image_cut,
                pid,
                tmp,
                fields.get("after") or None,
                fields.get("group") or None,
            )
        else:
            cid = fields.get("cut_id")
            if not cid:
                return _err(400, "pid and cut_id required")
            res = await asyncio.to_thread(gg_native_api.native_import_version, pid, cid, tmp)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] import-version failed")
        return _err(500, str(ex))
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)
    return web.json_response(res)
