"""aiohttp routes under /gonggan/* on ComfyUI's PromptServer (also reachable as /api/gonggan/*)."""
from __future__ import annotations

import asyncio
import logging

from aiohttp import web
from server import PromptServer

from . import gg_data
from . import gg_native_api
from . import gg_template
from . import gg_wfstore

routes = PromptServer.instance.routes
log = logging.getLogger("gonggan-cut")


def _err(status: int, message: str) -> web.Response:
    return web.json_response({"ok": False, "message": message}, status=status)


@routes.get("/gonggan/settings")
async def gg_settings(request):
    s = gg_data.load_settings()
    try:
        d = await asyncio.to_thread(gg_data.user_dir, s)
        ok, where = True, str(d)
    except Exception as ex:  # noqa: BLE001
        ok, where = False, str(ex)
    return web.json_response({"ok": ok, "data_root": s.get("data_root"), "uid": s.get("uid"), "user_dir": where})


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
    try:
        res = await asyncio.to_thread(gg_native_api.create_native_project, name.strip(), ref or None)
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
        return _err(400, "native pid required")
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
        return _err(400, "native pid required")
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
        return _err(400, "native pid required")
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
        tl = await asyncio.to_thread(gg_data.reset_edit, pid)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
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


@routes.post("/gonggan/export")
async def gg_export_start(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if gg_native_api.is_native_pid(pid):
        return _err(400, gg_native_api.NATIVE_UNAVAILABLE)
    try:
        res = await asyncio.to_thread(
            gg_export.start, pid, str(data.get("preset") or "720p"), data.get("width"), data.get("height"),
            data.get("fps") or 24, bool(data.get("sound", True)),
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


# ---------------- Comfy SDK path ----------------
from . import gg_sdk  # noqa: E402


def _notify_regen(job: dict) -> None:
    PromptServer.instance.send_sync("gonggan.regen", job)


gg_sdk._notify = _notify_regen


@routes.get("/gonggan/template")
async def gg_template_get(request):
    pid = request.query.get("pid", "")
    if not pid:
        return _err(400, "pid required")
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
            res = await asyncio.to_thread(gg_native_api.native_delete_cuts, pid, cuts)
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
            res = await asyncio.to_thread(gg_native_api.native_restore_cuts, pid, cuts)
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
        items = await asyncio.to_thread(gg_data.list_trash, pid)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] trash list failed")
        return _err(500, str(ex))
    return web.json_response({"ok": True, "items": items})


@routes.post("/gonggan/cut/update")
async def gg_cut_update(request):
    data = await _json_body(request)
    pid = data.get("pid")
    if not isinstance(pid, str) or not pid:
        return _err(400, "pid required")
    if not gg_native_api.is_native_pid(pid):
        return _err(400, "native pid required")
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
        from gg_project import ConflictError

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
        return _err(400, "native pid required")
    fields = data.get("fields")
    if not isinstance(fields, dict) or not fields:
        return _err(400, "fields required")
    expected_rev = data.get("expected_rev")
    if expected_rev is not None and not isinstance(expected_rev, int):
        return _err(400, "expected_rev must be an integer")
    try:
        from gg_project import ConflictError

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
    try:
        if gg_native_api.is_native_pid(pid):
            return web.json_response(await asyncio.to_thread(
                gg_native_api.native_add_cut, pid, group or None, after or None,
            ))
        cut = await asyncio.to_thread(gg_data.add_local_cut, pid, group or None, after or None)
        tpl = await asyncio.to_thread(gg_template.get_template, pid)
        copied = False
        if tpl:
            await asyncio.to_thread(gg_wfstore.save_initial_workflow, pid, cut["id"], tpl, "template")
            copied = True
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
    if not pid or not cut:
        return _err(400, "pid and cut required")
    try:
        if gg_native_api.is_native_pid(pid):
            data = await asyncio.to_thread(gg_native_api.native_cut_source_workflow, pid, cut)
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
        return _err(400, gg_native_api.NATIVE_UNAVAILABLE)
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


@routes.get("/gonggan/regen/status")
async def gg_regen_status(request):
    return web.json_response({"ok": True, "job": gg_sdk.job_status()})


@routes.get("/gonggan/last-output")
async def gg_last_output(request):
    lo = await asyncio.to_thread(gg_sdk.last_output)
    return web.json_response({"ok": bool(lo), "output": lo})


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
