"""aiohttp routes under /gonggan/* on ComfyUI's PromptServer (also reachable as /api/gonggan/*)."""
from __future__ import annotations

import asyncio
import logging

from aiohttp import web
from server import PromptServer

from . import gg_data
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
        return web.json_response(await asyncio.to_thread(gg_data.list_projects))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] projects failed")
        return _err(500, str(ex))


@routes.get("/gonggan/timeline")
async def gg_timeline(request):
    pid = request.query.get("pid", "")
    if not pid:
        return _err(400, "pid required")
    try:
        data = await asyncio.to_thread(gg_data.timeline, pid)
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] timeline failed")
        return _err(500, str(ex))
    if data is None:
        return _err(404, "project not found")
    return web.json_response(data)


@routes.get("/gonggan/media")
async def gg_media(request):
    try:
        path = await asyncio.to_thread(gg_data.media_path, request.query.get("id", ""))
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
    try:
        path = await asyncio.to_thread(gg_data.poster_path, request.query.get("id", ""))
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
        path = await asyncio.to_thread(gg_template.save_template, pid, workflow)
    except ValueError as ex:
        return _err(400, str(ex))
    except Exception as ex:  # noqa: BLE001
        log.exception("[gonggan-cut] template save failed")
        return _err(500, str(ex))
    return web.json_response({"ok": True, "path": str(path)})


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
        res = await asyncio.to_thread(gg_sdk.send_last_output, pid, cid)
    except ValueError as ex:
        return _err(400, str(ex))
    return web.json_response(res, status=200 if res.get("ok") else 404)
