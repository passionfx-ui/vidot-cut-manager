"""aiohttp routes under /gonggan/* on ComfyUI's PromptServer (also reachable as /api/gonggan/*)."""
from __future__ import annotations

import asyncio
import logging

from aiohttp import web
from server import PromptServer

from . import gg_data

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
